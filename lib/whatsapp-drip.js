// =============================================================================
//  📱 WhatsApp drip / welcome pipeline
//  ------------------------------------
//  Additive layer on top of /app/lib/bulkymarketing.js that:
//    1. Fires the UTILITY welcome template right after user registration
//       (user_registration_2 → {{1}} = first name).
//    2. Fires the MARKETING upgrade nudge 3 days later to any user that
//       still has no active subscription
//       (lesson_guru_activate_01 → {{1}} = first name, {{2}} = plans URL).
//  Guardrails:
//    • A unique index on (userId, template) in the `whatsapp_send_log`
//      collection makes the "one send per user per template ever" cap
//      atomic and race-safe.
//    • The nudge is skipped for admins, seed / demo accounts, and any user
//      whose subscription.status !== 'none' at send time.
//    • All send attempts (success + failure) are logged so the admin can
//      audit / retry.
// =============================================================================
import { sendSingle } from './bulkymarketing.js'
import { marketingCapHit, templateCategory, getSendSettings, getWalletState } from './wa-send-core.js'

const SEND_LOG = 'whatsapp_send_log'
const CFG_KEY  = 'whatsapp_drip_config'

/** Ensure the unique index that guarantees "one send per template per user". */
let _indexEnsured = false
async function ensureIndexes(d) {
  if (_indexEnsured) return
  try {
    await d.collection(SEND_LOG).createIndex(
      { userId: 1, template: 1 },
      { unique: true, name: 'uniq_user_template' },
    )
    await d.collection(SEND_LOG).createIndex({ template: 1, status: 1, sentAt: -1 })
    await d.collection(SEND_LOG).createIndex({ sentAt: -1 }, { name: 'sentAt_desc' })
    _indexEnsured = true
  } catch (e) {
    // 85 = IndexOptionsConflict, 86 = IndexKeySpecsConflict — ignore, index exists.
    if (![85, 86].includes(e?.code)) console.warn('[whatsapp-drip] ensureIndexes:', e?.message)
    _indexEnsured = true
  }
}

/** Get the (mutable) drip config with safe defaults. */
export async function getDripConfig(d) {
  const row = await d.collection('settings').findOne({ key: CFG_KEY })
  const defaults = {
    enabled: false,          // 🔴 master switch — OFF by default (admin turns it ON)
    enabledAt: null,         // set when the drip is switched ON; drip targets ONLY users who signed up after this
    welcomeTemplate: 'welcome_lessonguru',   // remapped from retired user_registration_2
    nudgeTemplate:   'upgrade_premium',       // remapped from retired lesson_guru_activate_01
    delayHours:      72,
    // 🎯 Nudge sequence. premium_offer1 + panchapdi_photo RETIRED (unapproved).
    // Only the Day-3 upgrade nudge remains; expiry/expired reminders are Phase 2 (A+B).
    sequence: [
      { template: 'upgrade_premium', delayHours: 72, vars: ['name', 'price'], label: 'Day 3 · Upgrade' },
    ],
    batchSize:       50,
    planUrl:         'LessonGuruOdisha.in/plans',
    language:        'en_US',
    lastRunAt:       null,
    lastRunSent:     0,
    lastRunError:    null,
  }
  const merged = { ...defaults, ...(row?.value || {}) }
  // If admins ever save without `sequence`, fall back to the defaults so
  // we don't drop the drip silently.
  if (!Array.isArray(merged.sequence) || merged.sequence.length === 0) {
    merged.sequence = defaults.sequence
  }
  return merged
}

/** Persist a partial drip config — FIELD-LEVEL $set so concurrent writers
 *  (e.g. the hourly tick writing lastRunAt) can NEVER clobber `enabled`. */
export async function updateDripConfig(d, patch) {
  const current = await getDripConfig(d)
  const clean = { ...(patch || {}) }
  const set = { key: CFG_KEY, updatedAt: new Date() }
  for (const [k, v] of Object.entries(clean)) set[`value.${k}`] = v
  // When the master switch flips ON, stamp enabledAt so the drip only targets
  // users who sign up AFTER this moment (no backlog flood). On OFF, keep it.
  if (patch?.enabled === true && !current.enabled) set['value.enabledAt'] = new Date().toISOString()
  if (patch?.enabled === false) set['value.enabledAt'] = current.enabledAt || null
  await d.collection('settings').updateOne(
    { key: CFG_KEY },
    { $set: set },
    { upsert: true },
  )
  const next = { ...current, ...clean }
  if (set['value.enabledAt'] !== undefined) next.enabledAt = set['value.enabledAt']
  return next
}

const firstName = (n) => {
  const s = String(n || '').trim()
  if (!s) return 'Guruji'
  const first = s.split(/\s+/)[0]
  return first.slice(0, 30) || 'Guruji'
}

const isSendableMobile = (m) => /^\d{10}$/.test(String(m || ''))

const alreadySentGuard = async (d, userId, template) => {
  const hit = await d.collection(SEND_LOG).findOne({ userId, template })
  return !!hit
}

/** Wrap a Bulkymarketing response into a structured log record with a precise
 *  status taxonomy: accepted (provider API accepted) · blocked (our template
 *  gate) · failed (+reason). delivered/read are set later by provider sync. */
const buildLogRow = ({ userId, mobile, template, variables, apiResp }) => {
  const data = (apiResp?.data && typeof apiResp.data === 'object') ? apiResp.data : {}
  const ms = String(data.message_status || '').toLowerCase()
  let status, reason = null
  if (apiResp?.skipped || data.skipped) { status = 'blocked'; reason = data.reason || 'template_gate' }
  else if (apiResp?.ok && (ms === 'success' || ms === '')) { status = 'accepted' }
  else { status = 'failed'; reason = data.error || data.message || ms || `HTTP ${apiResp?.status || 0}` }
  return {
    userId, mobile, template, variables, status, reason,
    httpStatus: apiResp?.status || 0,
    apiResponse: Object.keys(data).length ? data : { raw: String(apiResp?.data || '').slice(0, 400) },
    sentAt: new Date(),
  }
}

/** Send the welcome UTILITY template to a freshly-registered user. */
export async function sendWelcomeMessage(d, user, { language = 'en_US' } = {}) {
  await ensureIndexes(d)
  if (!user?.id || !isSendableMobile(user.mobile)) {
    return { skipped: 'invalid-user' }
  }
  const cfg = await getDripConfig(d)
  if (!cfg.enabled) return { skipped: 'drip-disabled' }
  if (user.waOptIn === false) return { skipped: 'opted-out' }
  const template = cfg.welcomeTemplate || 'welcome_lessonguru'
  if (await alreadySentGuard(d, user.id, template)) return { skipped: 'already-sent' }
  const variables = { 1: firstName(user.name) }
  let apiResp
  try {
    apiResp = await sendSingle({
      to: user.mobile,
      template_id: template,
      language,
      variables,
    })
  } catch (e) {
    apiResp = { ok: false, status: 0, data: { error: String(e?.message || e).slice(0, 400) } }
  }
  const row = buildLogRow({ userId: user.id, mobile: user.mobile, template, variables, apiResp })
  try {
    await d.collection(SEND_LOG).insertOne(row)
  } catch (e) {
    // Duplicate key → someone else already logged the send; treat as OK.
    if (e?.code !== 11000) console.warn('[whatsapp-drip] insert log failed:', e?.message)
  }
  // Decrement internal balance estimate (welcome = UTILITY). NEVER blocks.
  if (apiResp.ok) { try { const core = await import('./wa-send-core.js'); await core.noteWhatsAppSpend(d, templateCategory(template), 1) } catch (_) {} }
  return { ok: apiResp.ok, log: row }
}

/** Send the upgrade / activation nudge to a single unsubscribed user. */
export async function sendUpgradeNudge(d, user, { language, planUrl, template, step } = {}) {
  await ensureIndexes(d)
  if (!user?.id || !isSendableMobile(user.mobile)) return { skipped: 'invalid-user' }
  const cfg = await getDripConfig(d)
  if (!cfg.enabled) return { skipped: 'drip-disabled' }
  const tpl = template || step?.template || cfg.nudgeTemplate || 'lesson_guru_activate_01'
  if (await alreadySentGuard(d, user.id, tpl)) return { skipped: 'already-sent' }
  // Build variables based on the step's declared vars.  Steps with an empty
  // vars array (e.g. panchapdi_photo which is image-only) send NO variables.
  const vars = step?.vars ?? ['name', 'planUrl']
  // Lowest paid plan label — read live from plans config (never hardcoded).
  let priceLabel = cfg.lowestPriceLabel
  if (!priceLabel) {
    try {
      const plans = (await d.collection('settings').findOne({ key: 'plans' }))?.value || []
      const paid = (Array.isArray(plans) ? plans : []).filter(p => p && p.id !== 'free' && Number(p.price) > 0).sort((a, b) => a.price - b.price)
      const lo = paid[0]
      if (lo) priceLabel = `₹${lo.price}/${lo.days <= 31 ? 'month' : (lo.days <= 120 ? 'quarter' : 'year')}`
    } catch (_) {}
    priceLabel = priceLabel || '₹19/month'
  }
  const variables = {}
  vars.forEach((v, idx) => {
    const key = String(idx + 1)                                      // {{1}}, {{2}}, ...
    if (v === 'name') variables[key] = firstName(user.name)
    else if (v === 'planUrl') variables[key] = planUrl || cfg.planUrl || 'LessonGuruOdisha.in/plans'
    else if (v === 'price') variables[key] = priceLabel
    else if (v === 'mobile') variables[key] = user.mobile
    else if (typeof v === 'string' && v.startsWith('static:')) variables[key] = v.slice(7)
  })
  let apiResp
  try {
    apiResp = await sendSingle({
      to: user.mobile,
      template_id: tpl,
      language: language || cfg.language || 'en_US',
      variables,
    })
  } catch (e) {
    apiResp = { ok: false, status: 0, data: { error: String(e?.message || e).slice(0, 400) } }
  }
  const row = buildLogRow({ userId: user.id, mobile: user.mobile, template: tpl, variables, apiResp })
  try {
    await d.collection(SEND_LOG).insertOne(row)
  } catch (e) {
    if (e?.code !== 11000) console.warn('[whatsapp-drip] insert log failed:', e?.message)
  }
  // Decrement internal balance estimate (nudge = its template category). NEVER blocks.
  if (apiResp.ok) { try { const core = await import('./wa-send-core.js'); await core.noteWhatsAppSpend(d, templateCategory(tpl), 1) } catch (_) {} }
  return { ok: apiResp.ok, log: row }
}

/**
 * Runs one "drip tick":
 *   - Iterates each step in cfg.sequence (Day 3 → Day 7 → Day 14 → …)
 *   - For each step, finds users who:
 *       • Registered > step.delayHours ago
 *       • Have no active/trial subscription
 *       • Have NOT received this specific step's template before
 *   - Sends up to batchSize total across ALL steps.  Earlier steps are
 *     processed first so no user gets the follow-up before the primer.
 * Idempotent: safe to call from an admin trigger, health-check hook, or external cron.
 */
export async function runDripTick(d, { max, template } = {}) {
  await ensureIndexes(d)
  const cfg = await getDripConfig(d)
  if (!cfg.enabled) return { ok: true, skipped: 'drip-disabled' }
  // Admin-editable safety settings (window + 7-day marketing cap).
  const ss = await getSendSettings(d)
  const startH = Number(ss.windowStartHour ?? 9)
  const endH = Number(ss.windowEndHour ?? 20)
  const capDays = Number(ss.marketingCapDays) || 7
  // 🕘 9am–8pm IST send window (marketing safety).
  const istH = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours()
  if (istH < startH || istH >= endH) return { ok: true, skipped: 'outside-send-window' }
  // 💰 Optional nudge wallet guard: if the spendable balance (after the OTP
  // reserve) is exhausted, skip the nudge run so OTP/login stays protected.
  // This ONLY gates the drip nudge — OTP/utility/welcome are never blocked.
  try {
    const w = await getWalletState(d)
    if ((w.spendable || 0) <= 0) return { ok: true, skipped: 'wallet-reserve-protected', wallet: { balance: w.balance, otpReserve: w.otpReserve } }
  } catch (_) {}
  // 🚫 No backlog flood: only users who signed up AFTER the drip was switched ON.
  const enabledAt = cfg.enabledAt ? new Date(cfg.enabledAt) : null
  const budget = Math.max(1, Math.min(500, Number(max || cfg.batchSize || 50)))
  // If admin passed an explicit template, run ONLY that step (manual send).
  const steps = template
    ? cfg.sequence.filter(s => s.template === template).length
      ? cfg.sequence.filter(s => s.template === template)
      : [{ template, delayHours: 0, vars: ['name', 'planUrl'] }]
    : cfg.sequence
  let remaining = budget
  let totalSent = 0, totalFailed = 0, totalSkipped = 0, totalScanned = 0
  const stepResults = []
  const errors = []
  for (const step of steps) {
    if (remaining <= 0) break
    const tpl = step.template
    const isMarketing = templateCategory(tpl) === 'marketing'
    const cutoff = new Date(Date.now() - (Number(step.delayHours || 0) * 3600 * 1000))
    // Users already sent THIS step (bounded + time-capped for large LIVE logs)
    const already = await d.collection(SEND_LOG).find({ template: tpl }, { maxTimeMS: 8000 }).project({ userId: 1, _id: 0 }).limit(100000).toArray()
    const alreadyIds = already.map(r => r.userId).filter(Boolean)
    const filter = {
      createdAt: enabledAt ? { $lte: cutoff, $gte: enabledAt } : { $lte: cutoff },
      role: { $ne: 'admin' },
      suspended: { $ne: true },
      waOptIn: { $ne: false },                              // marketing opt-out respected
      // 131049 per-user marketing pause (7d): skip anyone currently paused.
      ...(isMarketing ? { $or: [{ marketingPausedUntil: { $exists: false } }, { marketingPausedUntil: null }, { marketingPausedUntil: { $lte: new Date() } }] } : {}),
      'subscription.status': { $nin: ['active', 'trial'] },
      id: { $nin: alreadyIds },
      mobile: { $regex: /^\d{10}$/ },
    }
    const candidates = await d.collection('users')
      .find(filter).sort({ createdAt: 1 }).limit(remaining)
      .project({ id: 1, mobile: 1, name: 1, subscription: 1 })
      .toArray()
    let sent = 0, failed = 0, skipped = 0
    for (const u of candidates) {
      // 🧢 Max 1 MARKETING message / user / capDays (shared with admin campaigns via wa_deliveries).
      if (isMarketing && await marketingCapHit(d, u.id, capDays)) { skipped++; continue }
      const r = await sendUpgradeNudge(d, u, { step })
      if (r?.skipped) { skipped++; continue }
      if (r?.ok) {
        sent++
        // Record a marketing delivery so the 7-day cap is shared across drip + campaigns.
        if (isMarketing) {
          try {
            await d.collection('wa_deliveries').insertOne({
              userId: u.id, mobile: u.mobile, template: tpl, category: 'marketing',
              reason: 'upgrade', status: 'sent', channel: 'drip', ts: new Date(),
            })
          } catch (_) {}
        }
      } else {
        failed++
        const err = r?.log?.apiResponse?.error || r?.log?.apiResponse?.raw || 'unknown'
        errors.push({ userId: u.id, mobile: u.mobile, template: tpl, err: String(err).slice(0, 160) })
      }
    }
    totalSent    += sent
    totalFailed  += failed
    totalSkipped += skipped
    totalScanned += candidates.length
    remaining    -= (sent + failed + skipped)
    stepResults.push({
      template: tpl, label: step.label, delayHours: step.delayHours,
      scanned: candidates.length, sent, failed, skipped,
    })
  }
  await updateDripConfig(d, {
    lastRunAt: new Date().toISOString(),
    lastRunSent: totalSent,
    lastRunError: errors[0]?.err || null,
  })
  return {
    ok: true,
    scanned: totalScanned,
    sent: totalSent, failed: totalFailed, skipped: totalSkipped,
    stepResults,
    errors: errors.slice(0, 10),
  }
}

/** Small opportunistic-tick — called from admin routes so we don't need external cron. */
let _lastOppTick = 0
export async function opportunisticDripTick(d) {
  const now = Date.now()
  if (now - _lastOppTick < 3600 * 1000) return                       // at most once per hour
  _lastOppTick = now
  try {
    await runDripTick(d).catch((e) => console.warn('[whatsapp-drip] opp tick:', e?.message))
  } catch (_) { /* ignore */ }
}

/** Admin-visible stats / summary for the drip. */
export async function getDripStats(d) {
  // Config first — ALWAYS returned so the admin panel (master switch, templates)
  // loads instantly even if the heavy stat queries are slow/unavailable.
  const cfg = await getDripConfig(d)
  try { await ensureIndexes(d) } catch (_) {}

  const MT = 6000 // hard per-query time budget (ms) — nothing can hang forever
  const zeroStep = (cfg.sequence || []).map(s => ({ ...s, sent: 0, failed: 0, converted: 0, conversionRate: 0 }))
  const base = {
    config: cfg, welcomeSent: 0, nudgeSent: 0, welcomeFailed: 0, nudgeFailed: 0,
    welcomeConverted: 0, nudgeConverted: 0, pendingNudge: 0, perTemplate: {},
    sequenceStats: zeroStep, recentLogs: [], degraded: false,
  }

  try {
    // Legacy ("old system", before 9 Oct) vs new approved templates.
    const LEGACY = ['user_registration_2', 'lesson_guru_activate_01', 'premium_offer1', 'panchapdi_photo']
    const NEWTPL = ['welcome_lessonguru', 'upgrade_premium']
    // Always track: current config + legacy + new (so the old-system totals
    // stay visible even after the remap removes them from the config).
    const allTemplates = Array.from(new Set([
      cfg.welcomeTemplate,
      ...(cfg.sequence || []).map(s => s.template),
      ...LEGACY, ...NEWTPL,
    ].filter(Boolean)))

    const perTemplate = {}
    for (const tpl of allTemplates) {
      // "sent" = accepted by provider API (historical rows used status:'sent';
      // new rows use 'accepted'). blocked = our gate. failed = real failure.
      const [sent, failed, blocked] = await Promise.all([
        d.collection(SEND_LOG).countDocuments({ template: tpl, status: { $in: ['sent', 'accepted', 'delivered', 'read'] } }, { maxTimeMS: MT }),
        d.collection(SEND_LOG).countDocuments({ template: tpl, status: 'failed' }, { maxTimeMS: MT }),
        d.collection(SEND_LOG).countDocuments({ template: tpl, status: 'blocked' }, { maxTimeMS: MT }),
      ])
      let converted = 0
      try {
        const convertedAgg = await d.collection(SEND_LOG).aggregate([
          { $match: { template: tpl, status: { $in: ['sent', 'accepted', 'delivered', 'read'] } } },
          { $lookup: { from: 'users', localField: 'userId', foreignField: 'id', as: 'u' } },
          { $unwind: '$u' },
          { $match: {
              'u.subscription.status': 'active',
              $expr: { $and: [
                { $ne: ['$u.subscription.startDate', null] },
                { $gt: ['$u.subscription.startDate', '$sentAt'] },
              ] },
          } },
          { $count: 'converted' },
        ], { maxTimeMS: MT, allowDiskUse: true }).toArray()
        converted = convertedAgg?.[0]?.converted || 0
      } catch (e) { console.warn('[whatsapp-drip] conversion agg degraded for', tpl, '-', e?.message) }
      perTemplate[tpl] = {
        sent, failed, blocked, converted,
        conversionRate: sent > 0 ? Math.round((converted / sent) * 1000) / 10 : 0,
      }
    }
    const sumSet = (tpls, field) => tpls.reduce((a, t) => a + (perTemplate[t]?.[field] || 0), 0)
    const oldSystem = { sent: sumSet(LEGACY, 'sent'), failed: sumSet(LEGACY, 'failed'), blocked: sumSet(LEGACY, 'blocked') }
    const newSystem = { sent: sumSet(NEWTPL, 'sent'), failed: sumSet(NEWTPL, 'failed'), blocked: sumSet(NEWTPL, 'blocked'), converted: sumSet(NEWTPL, 'converted') }

    // pendingNudge — also time-capped. Cap the "already sent" set so a huge
    // $nin (pathological on large LIVE logs) can never stall the request.
    const firstStep = cfg.sequence?.[0]
    let pendingNudge = 0
    if (firstStep) {
      try {
        const cutoff = new Date(Date.now() - (Number(firstStep.delayHours || cfg.delayHours || 72) * 3600 * 1000))
        // Only users eligible AFTER the drip was switched on (enabledAt) can
        // ever receive a nudge — the old backlog must NOT be counted here.
        const enabledAt = cfg.enabledAt ? new Date(cfg.enabledAt) : null
        const createdAtFilter = enabledAt ? { $gte: enabledAt, $lte: cutoff } : { $lte: cutoff }
        const already = await d.collection(SEND_LOG)
          .find({ template: firstStep.template }, { maxTimeMS: MT })
          .project({ userId: 1, _id: 0 }).limit(20000).toArray()
        const alreadyIds = already.map(r => r.userId).filter(Boolean)
        pendingNudge = await d.collection('users').countDocuments({
          createdAt: createdAtFilter,
          role: { $ne: 'admin' },
          suspended: { $ne: true },
          'subscription.status': { $nin: ['active', 'trial'] },
          id: { $nin: alreadyIds },
          mobile: { $regex: /^\d{10}$/ },
        }, { maxTimeMS: MT })
      } catch (e) { console.warn('[whatsapp-drip] pendingNudge degraded:', e?.message) }
    }

    const recentLogs = await d.collection(SEND_LOG)
      .find({}, { maxTimeMS: MT }).sort({ sentAt: -1 }).limit(30).project({ _id: 0 }).toArray()

    const nudgeTpl = firstStep?.template || cfg.nudgeTemplate
    return {
      config: cfg,
      welcomeSent:   perTemplate[cfg.welcomeTemplate]?.sent   || 0,
      nudgeSent:     perTemplate[nudgeTpl]?.sent              || 0,
      welcomeFailed: perTemplate[cfg.welcomeTemplate]?.failed || 0,
      nudgeFailed:   perTemplate[nudgeTpl]?.failed            || 0,
      welcomeConverted: perTemplate[cfg.welcomeTemplate]?.converted || 0,
      nudgeConverted:   perTemplate[nudgeTpl]?.converted            || 0,
      pendingNudge,
      perTemplate,
      oldSystem,
      newSystem,
      sequenceStats: (cfg.sequence || []).map(step => ({
        ...step,
        ...(perTemplate[step.template] || { sent: 0, failed: 0, converted: 0, conversionRate: 0 }),
      })),
      recentLogs,
      degraded: false,
    }
  } catch (e) {
    // Last-resort: never let the panel hang. Return config + zeros, flagged degraded.
    console.warn('[whatsapp-drip] getDripStats degraded:', e?.message)
    return { ...base, degraded: true }
  }
}

