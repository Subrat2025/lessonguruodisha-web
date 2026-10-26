// ============================================================================
//  lib/wa-send-core.js — Phase 1 safety + cost core for WhatsApp campaigns and
//  (Phase 2) automations. Extends the existing wa_campaigns / wa_deliveries
//  manager — it does NOT replace it. Keys come only from env (via bulkymarketing.js).
//
//  Safety rules implemented here:
//   • Send window 9:00–20:00 IST (queue outside — cron flushes in Phase 2)
//   • Max 1 MARKETING msg / user / 7 days (UTILITY reminders exempt)
//   • Dedupe key  user+reason+period  (never send twice for the same reason)
//   • Opt-out: marketing requires user.waOptIn !== false (utility exempt)
//   • Skip admins / disabled / invalid numbers
//   • Approved-only: consult provider template status; block pending/unknown
//   • Cost estimate (admin-editable utility/marketing per-message rate)
// ============================================================================

const SETTINGS_KEY = 'wa_send_settings'
const LOG = 'wa_deliveries'   // reuse existing delivery log
const DEDUPE = 'wa_dedupe'

// Template → category / body-variable plan / automation reason.
export const TEMPLATE_DEFS = {
  plan_expiring_soon:      { category: 'utility',   vars: ['name', 'stage'], reason: 'expiry' },
  expired_premium_renewal: { category: 'marketing', vars: ['name'],          reason: 'expired' },
  welcome_lessonguru:      { category: 'marketing', vars: ['name'],          reason: 'welcome' },
  upgrade_premium:         { category: 'marketing', vars: ['name', 'price'], reason: 'upgrade' },
  special_offer_today:     { category: 'marketing', vars: ['name', 'offer'], reason: 'special_offer' },
}

export const firstName = (n) => {
  const s = String(n || '').trim()
  return (s ? (s.split(/\s+/)[0] || 'Teacher') : 'Teacher').slice(0, 30)
}
export const isSendableMobile = (m) => /^\d{10}$/.test(String(m || ''))
export const templateCategory = (name) => TEMPLATE_DEFS[name]?.category || 'marketing'

// ---- IST send window ------------------------------------------------------
const IST_MS = 5.5 * 3600 * 1000
export function istHour(date = new Date()) { return new Date(date.getTime() + IST_MS).getUTCHours() }
export function inSendWindow(date = new Date(), startH = 9, endH = 20) {
  const h = istHour(date); return h >= startH && h < endH
}
export function nextWindowStart(date = new Date(), startH = 9, endH = 20) {
  const ist = new Date(date.getTime() + IST_MS); const h = ist.getUTCHours()
  const d = new Date(ist); if (h >= endH) d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(startH, 0, 0, 0)
  return new Date(d.getTime() - IST_MS)
}

// ---- Settings / cost / wallet --------------------------------------------
export async function getSendSettings(d) {
  const row = await d.collection('settings').findOne({ key: SETTINGS_KEY })
  return {
    costUtility: 0.12, costMarketing: 0.9926, costAuthentication: 0.12, currency: '₹',
    marketingCapDays: 7, windowStartHour: 9, windowEndHour: 20,
    otpReserve: 300, lowBalanceThreshold: 500, testBatchDefault: 300,
    balance: 0, balanceUpdatedAt: null,
    ...(row?.value || {}),
  }
}
export async function setSendSettings(d, patch) {
  const cur = await getSendSettings(d)
  const next = { ...cur, ...(patch || {}) }
  await d.collection('settings').updateOne(
    { key: SETTINGS_KEY },
    { $set: { key: SETTINGS_KEY, value: next, updatedAt: new Date() } },
    { upsert: true },
  )
  return next
}

// Per-message rate for a template category.
export function rateForCategory(settings, category) {
  if (category === 'utility') return Number(settings.costUtility) || 0
  if (category === 'authentication') return Number(settings.costAuthentication) || 0
  return Number(settings.costMarketing) || 0
}

// Wallet state: effective balance (admin-entered, decremented as we send),
// reserve, low threshold, and staleness (admin should re-sync after a top-up).
export async function getWalletState(d) {
  const s = await getSendSettings(d)
  const updatedAt = s.balanceUpdatedAt ? new Date(s.balanceUpdatedAt) : null
  const ageMs = updatedAt ? (Date.now() - updatedAt.getTime()) : null
  const stale = ageMs == null ? true : ageMs > 7 * 86400000
  const balance = Number(s.balance) || 0
  const reserve = Number(s.otpReserve) || 0
  return {
    balance, currency: s.currency, otpReserve: reserve,
    lowBalanceThreshold: Number(s.lowBalanceThreshold) || 0,
    spendable: Math.max(0, balance - reserve),
    balanceUpdatedAt: s.balanceUpdatedAt || null, stale,
    low: balance < (Number(s.lowBalanceThreshold) || 0),
  }
}

// Admin sets the real wallet balance (after a BulkyMarketing top-up).
export async function setManualBalance(d, amount) {
  // Tolerate "2,782.46", "₹2782.46", " 2782.46 " etc.
  const val = Math.round(Number(String(amount ?? '').replace(/[₹,\s]/g, '')) * 100) / 100
  if (!Number.isFinite(val) || val < 0) throw new Error('Invalid balance amount')
  return setSendSettings(d, { balance: val, balanceUpdatedAt: new Date().toISOString() })
}

// Internal running decrement after accepted sends (keeps "balance after" live).
export async function decrementBalance(d, amount) {
  const dec = Math.round(Number(amount) * 100) / 100
  if (!dec || dec < 0 || Number.isNaN(dec)) return
  const cur = await getSendSettings(d)
  const next = Math.round((Number(cur.balance || 0) - dec) * 100) / 100
  await d.collection('settings').updateOne(
    { key: SETTINGS_KEY },
    { $set: { 'value.balance': next } },
  )
  return next
}

// Decrement-only spend note for NON-campaign sends (OTP, utility, drip welcome,
// nudge). These are NEVER blocked by the wallet gate — they only decrement the
// internal balance estimate so it stays accurate. Best-effort; never throws.
export async function noteWhatsAppSpend(d, category, count = 1) {
  try {
    const s = await getSendSettings(d)
    return await decrementBalance(d, (Number(count) || 0) * rateForCategory(s, category))
  } catch (_) { return undefined }
}

// Estimate + affordability for a campaign of `count` messages of `category`.
export async function estimateSend(d, count, category) {
  const s = await getSendSettings(d)
  const rate = rateForCategory(s, category)
  const estCost = Math.round(Number(count || 0) * rate * 100) / 100
  const w = await getWalletState(d)
  const balanceAfter = Math.round((w.balance - estCost) * 100) / 100
  const reserve = w.otpReserve
  const canSend = estCost <= (w.balance - reserve)
  return {
    count: Number(count || 0), category, rate, estCost, currency: s.currency,
    balance: w.balance, otpReserve: reserve, spendable: w.spendable,
    balanceAfter, canSend,
    blockReason: canSend ? null : (estCost > w.balance
      ? 'Estimated cost exceeds the current wallet balance.'
      : `Estimated cost would eat into the ₹${reserve} OTP reserve. Top up the BulkyMarketing wallet.`),
    stale: w.stale, balanceUpdatedAt: w.balanceUpdatedAt,
  }
}

// Classify a BulkyMarketing bulk/single response → accepted or failed+reason.
// The provider returns HTTP 200 even when it refuses (e.g. insufficient
// wallet balance), so we MUST inspect the body — not just res.ok.
export function classifyProviderResponse(result) {
  const data = result?.data || {}
  const blob = JSON.stringify(data).toLowerCase()
  const insufficient = /insufficient|balance|wallet|not enough|low\s*bal|recharge|credit/.test(blob)
  const ms = String(data.message_status || data.status || data.success || '').toLowerCase()
  const positive = ms === 'success' || ms === 'true' || data.success === true || /"status"\s*:\s*"?(success|ok|queued|sent|accepted)"?/.test(blob)
  const httpOk = !!result?.ok && result.status >= 200 && result.status < 300
  if (!httpOk || insufficient || (ms && !positive)) {
    let reason = data.message || data.error || data.msg || (insufficient ? 'insufficient_wallet_balance' : `provider_status_${result?.status || 0}`)
    reason = String(reason).slice(0, 200)
    const code = insufficient ? 'INSUFFICIENT_BALANCE' : (data.code || data.error_code || `HTTP_${result?.status || 0}`)
    return { accepted: false, reason, code }
  }
  return { accepted: true, reason: null, code: null }
}

// Lowest paid plan label, read from settings.plans — never hardcoded.
export async function lowestPlanLabel(d) {
  const plans = (await d.collection('settings').findOne({ key: 'plans' }))?.value || []
  const paid = (Array.isArray(plans) ? plans : []).filter(p => p && p.id !== 'free' && Number(p.price) > 0)
    .sort((a, b) => a.price - b.price)
  if (!paid.length) return '₹19/month'
  const p = paid[0]
  const unit = p.days <= 31 ? 'month' : (p.days <= 120 ? 'quarter' : 'year')
  return `₹${p.price}/${unit}`
}

// Build {{n}} variables for a template.
export function buildVariables(template, user, extras = {}) {
  const def = TEMPLATE_DEFS[template]
  const list = def?.vars || ['name']
  const vars = {}
  list.forEach((v, i) => {
    const k = String(i + 1)
    if (v === 'name') vars[k] = firstName(user?.name)
    else if (v === 'stage') vars[k] = extras.stage || '7 days'
    else if (v === 'price') vars[k] = extras.price || '₹19/month'
    else if (v === 'offer') vars[k] = extras.offer || '20%'
    else vars[k] = extras[v] || ''
  })
  return vars
}

// ---- Guards ---------------------------------------------------------------
export const userAllowsCategory = (user, category) =>
  category === 'utility' ? true : user?.waOptIn !== false

export async function marketingCapHit(d, userId, days = 7) {
  if (!userId) return false
  const since = new Date(Date.now() - days * 86400000)
  const hit = await d.collection(LOG).findOne({
    userId, category: 'marketing', status: { $in: ['sent', 'delivered', 'queued'] }, ts: { $gte: since },
  })
  return !!hit
}

// Dedupe: claim user+reason+period atomically. Returns true when newly claimed.
export async function claimDedupe(d, userId, reason, period) {
  if (!userId) return true
  const key = `${userId}:${reason}:${period}`
  try { await d.collection(DEDUPE).createIndex({ key: 1 }, { unique: true, name: 'uniq_key' }) } catch (_) {}
  try { await d.collection(DEDUPE).insertOne({ key, userId, reason, period, at: new Date() }); return true }
  catch (e) { return e?.code === 11000 ? false : true }
}

// ---- Approved-template status (cached 10 min in settings) -----------------
const STATUS_CACHE_KEY = 'wa_template_status_cache'
export async function getTemplateStatusMap(d, { force = false } = {}) {
  if (!force) {
    const c = await d.collection('settings').findOne({ key: STATUS_CACHE_KEY })
    if (c?.value && (Date.now() - new Date(c.updatedAt).getTime()) < 600000) return c.value
  }
  const map = {}
  try {
    const { getTemplates } = await import('./bulkymarketing.js')
    const data = await getTemplates()
    const arr = Array.isArray(data) ? data : (data?.templates || data?.data || data?.message_templates || [])
    for (const t of (Array.isArray(arr) ? arr : [])) {
      const name = t.template_name || t.name || t.elementName || t.template || t.templateName
      if (!name) continue
      map[name] = {
        status: String(t.status || t.template_status || t.approval_status || '').toUpperCase(),
        category: String(t.category || t.template_category || '').toLowerCase() || templateCategory(name),
        language: t.language || t.lang || 'en_US',
      }
    }
  } catch (_) { /* provider error → empty map; callers treat unknown as NOT approved */ }
  await d.collection('settings').updateOne(
    { key: STATUS_CACHE_KEY },
    { $set: { key: STATUS_CACHE_KEY, value: map, updatedAt: new Date() } },
    { upsert: true },
  )
  return map
}
export async function isApproved(d, name) {
  const m = await getTemplateStatusMap(d)
  return m?.[name]?.status === 'APPROVED'
}

// Full known-template catalogue with live status (for the admin screen).
export async function listKnownTemplates(d) {
  const m = await getTemplateStatusMap(d)
  return Object.entries(TEMPLATE_DEFS).map(([name, def]) => ({
    name, category: def.category, vars: def.vars, reason: def.reason,
    status: m?.[name]?.status || 'UNKNOWN',
    approved: m?.[name]?.status === 'APPROVED',
  }))
}
