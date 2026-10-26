// ============================================================================
//  lib/recovery-send.js — Phase 2: Subscription Recovery "Auto Send via
//  BulkyMarketing". Builds on the existing safe-send core (lib/wa-send-core.js)
//  and the provider client (lib/bulkymarketing.js). It NEVER bypasses the wallet
//  gate, the approved-template gate, opt-out, or the per-user marketing pause.
//
//  Rules implemented here (confirmed with the product owner):
//   • Auto template pick per user:
//       - plan expired            → expired_premium_renewal  (MARKETING)
//       - plan expiring ≤ 7 days  → plan_expiring_soon       (UTILITY)
//   • 7-day resend block per user (recovery sends only).
//   • Max 50 users per click (BulkyMarketing batch convention: 50 = users/click).
//   • Static template button URLs → we send NO button params (template keeps its
//     own static URL). No dynamic b1_value wiring.
//   • Cost is display-only (BulkyMarketing deducts from its own wallet). We keep
//     the ₹300 OTP-reserve wallet gate and update our stored balance estimate
//     after a real send — exactly like the campaign runner already does.
// ============================================================================
import {
  firstName, isSendableMobile, TEMPLATE_DEFS, templateCategory,
  getSendSettings, getWalletState, rateForCategory, buildVariables, decrementBalance,
} from './wa-send-core.js'
import { sendSingle } from './bulkymarketing.js'
import { allowlistEnforced, allowlistSet, isAllowlisted } from './wa-allowlist.js'

const DAY = 86400000
export const RECOVERY_REASON = 'recovery'
export const RESEND_BLOCK_DAYS = 7
export const MAX_PER_CLICK = 50

// Re-export the host-gated allowlist helpers (single source of truth in
// lib/wa-allowlist.js). Enforced ONLY on a preview host with the flag on; on
// lessonguruodisha.in it is ALWAYS off, whatever the env says.
export { allowlistEnforced, allowlistSet, isAllowlisted }

const uuid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`)

// Pick the right approved template for a user's subscription state.
// Returns null when the user is neither expired nor expiring-soon.
export function pickTemplate(sub, now = new Date()) {
  const exp = sub?.expiryDate ? new Date(sub.expiryDate) : null
  if (!exp || isNaN(exp)) return null
  if (exp <= now) return 'expired_premium_renewal'           // MARKETING
  const days = Math.ceil((exp.getTime() - now.getTime()) / DAY)
  if (days <= 7) return 'plan_expiring_soon'                 // UTILITY
  return null
}

// Read cached template approval WITHOUT hitting the provider (dry-run stays local).
export async function cachedApproval(d, template) {
  try {
    const c = await d.collection('settings').findOne({ key: 'wa_template_status_cache' })
    const st = c?.value?.[template]?.status
    return st ? String(st).toUpperCase() : 'UNKNOWN'
  } catch (_) { return 'UNKNOWN' }
}

// Representative previews (DISPLAY ONLY — the real message uses the approved
// WhatsApp template body on BulkyMarketing). Odia copy matches the brand tone.
export function previewText(template, name = 'Teacher') {
  const n = firstName(name)
  if (template === 'plan_expiring_soon') {
    return `🙏 ${n}, ଆପଣଙ୍କ LessonGuru Premium 7 ଦିନ ଭିତରେ ସମାପ୍ତ ହେବ।\nଆଜି RENEW କରି ସମସ୍ତ Teacher Resources ଚାଲୁ ରଖନ୍ତୁ ✨\n(Actual message uses the approved \"plan_expiring_soon\" template + its static Renew button.)`
  }
  return `🚨 ${n}, ଆପଣଙ୍କ LessonGuru Premium ସମାପ୍ତ ହୋଇଛି!\nମାତ୍ର ₹19/ମାସରୁ ପୁଣି Premium ଚାଲୁ କରନ୍ତୁ 🔥\n(Actual message uses the approved \"expired_premium_renewal\" template + its static Renew button.)`
}

// Resolve a selection of user IDs into per-user send items with eligibility.
// status ∈ eligible | skipped | blocked (with a human reason).
export async function resolveRecovery(d, userIds, { now = new Date(), host } = {}) {
  const ids = Array.from(new Set((userIds || []).map(String))).slice(0, MAX_PER_CLICK)
  if (!ids.length) return []
  const users = await d.collection('users').find(
    { id: { $in: ids } },
    { projection: { _id: 0, id: 1, name: 1, mobile: 1, role: 1, waOptIn: 1, marketingPausedUntil: 1, subscription: 1 } },
  ).toArray()

  // 7-day resend block — look at prior RECOVERY sends only.
  const since = new Date(now.getTime() - RESEND_BLOCK_DAYS * DAY)
  const recent = await d.collection('wa_deliveries').distinct('userId', {
    userId: { $in: ids }, kind: 'recovery',
    status: { $in: ['accepted', 'sent', 'delivered'] }, ts: { $gte: since },
  }).catch(() => [])
  const recentSet = new Set(recent)
  const enforceAllow = allowlistEnforced(host)   // host-gated: OFF on production domain

  const items = []
  const found = new Set()
  for (const u of users) {
    found.add(u.id)
    const sub = u.subscription || {}
    const template = pickTemplate(sub, now)
    const category = template ? templateCategory(template) : null
    let status = 'eligible', reason = null
    if (u.role === 'admin') { status = 'skipped'; reason = 'admin account' }
    else if (!template) { status = 'skipped'; reason = 'not expired / not expiring soon' }
    else if (!isSendableMobile(u.mobile)) { status = 'skipped'; reason = 'invalid mobile number' }
    else if (recentSet.has(u.id)) { status = 'blocked'; reason = `already sent in last ${RESEND_BLOCK_DAYS} days` }
    else if (category === 'marketing' && u.waOptIn === false) { status = 'skipped'; reason = 'opted out of marketing' }
    else if (category === 'marketing' && u.marketingPausedUntil && new Date(u.marketingPausedUntil) > now) { status = 'blocked'; reason = 'marketing paused (7d)' }
    else if (enforceAllow && !isAllowlisted(u.mobile)) { status = 'blocked'; reason = 'PREVIEW allowlist — real sends blocked (test numbers only)' }
    items.push({
      id: u.id, name: u.name || '', mobile: u.mobile || '',
      template, category, language: 'en_US', status, reason,
    })
  }
  for (const id of ids) if (!found.has(id)) items.push({ id, name: '', mobile: '', template: null, category: null, status: 'skipped', reason: 'user not found' })
  return items
}

// Build the dry-run summary: counts, cost estimate (display-only) and wallet gate.
export async function buildDryRunSummary(d, items) {
  const settings = await getSendSettings(d)
  const wallet = await getWalletState(d)
  const eligible = items.filter(i => i.status === 'eligible')
  const marketing = eligible.filter(i => i.category === 'marketing').length
  const utility = eligible.filter(i => i.category === 'utility').length
  const rateM = rateForCategory(settings, 'marketing')
  const rateU = rateForCategory(settings, 'utility')
  const estCost = Math.round((marketing * rateM + utility * rateU) * 100) / 100
  const reserve = wallet.otpReserve
  const canSend = eligible.length > 0 && estCost <= (wallet.balance - reserve)
  const balanceAfter = Math.round((wallet.balance - estCost) * 100) / 100

  const templatesUsed = Array.from(new Set(eligible.map(i => i.template).filter(Boolean)))
  const approvals = {}
  for (const t of templatesUsed) approvals[t] = await cachedApproval(d, t)

  const sampleName = eligible[0]?.name || 'Teacher'
  const previews = {}
  for (const t of templatesUsed) previews[t] = previewText(t, sampleName)

  return {
    counts: {
      total: items.length,
      eligible: eligible.length,
      marketing, utility,
      skipped: items.filter(i => i.status === 'skipped').length,
      blocked: items.filter(i => i.status === 'blocked').length,
    },
    items,
    cost: { rateMarketing: rateM, rateUtility: rateU, currency: settings.currency, estCost },
    wallet: {
      balance: wallet.balance, otpReserve: reserve, spendable: wallet.spendable,
      balanceAfter, canSend,
      blockReason: canSend ? null : (eligible.length === 0
        ? 'No eligible recipients in this selection.'
        : (estCost > wallet.balance
          ? 'Estimated cost exceeds the stored wallet balance. Top up BulkyMarketing and update the balance in WhatsApp settings.'
          : `Estimated cost would eat into the ${settings.currency}${reserve} OTP reserve. Top up the BulkyMarketing wallet first.`)),
      stale: wallet.stale, balanceUpdatedAt: wallet.balanceUpdatedAt,
    },
    approvals, previews,
  }
}

// Execute the REAL send for the eligible items. Uses sendSingle (per-user
// personalisation) which itself enforces the approved-template gate. Logs every
// attempt to wa_deliveries (kind:'recovery'), records a contact entry for the
// recovery dashboard, and decrements the stored wallet estimate by accepted×rate.
export async function executeRecoverySend(d, { items, adminId, adminName, now = new Date(), host }) {
  const settings = await getSendSettings(d)
  const sent = [], failed = [], skipped = []
  let spend = 0

  for (const it of items) {
    if (it.status !== 'eligible') { skipped.push(it); continue }
    // Defense-in-depth: NEVER call the provider for a non-allowlisted number
    // when the PREVIEW allowlist is enforced — even if an item slipped through.
    if (allowlistEnforced(host) && !isAllowlisted(it.mobile)) {
      console.warn('[recovery-send] BLOCKED non-allowlisted number (PREVIEW allowlist):', String(it.mobile || '').slice(-4))
      skipped.push({ ...it, status: 'blocked', reason: 'PREVIEW allowlist — real send blocked' })
      continue
    }
    const variables = buildVariables(it.template, { name: it.name }, { stage: '7 days' })
    let resp
    try {
      // Static button URLs → do NOT pass any `buttons` param (template keeps its own).
      resp = await sendSingle({ to: it.mobile, template_id: it.template, language: it.language || 'en_US', variables })
    } catch (e) {
      resp = { ok: false, status: 0, data: { error: String(e?.message || e).slice(0, 200) } }
    }
    const gateSkipped = !!resp?.data?.skipped
    const ms = String(resp?.data?.message_status || resp?.data?.status || '').toLowerCase()
    const ok = !!resp.ok && !gateSkipped && (ms === 'success' || ms === '' || ms === 'true')
    const rate = rateForCategory(settings, it.category)

    const rec = {
      id: uuid(), kind: 'recovery', campaignId: null,
      userId: it.id, mobile: it.mobile, template: it.template, category: it.category,
      status: ok ? 'accepted' : 'failed',
      error: ok ? null : (gateSkipped ? `skipped: ${resp?.data?.reason || 'not approved'}` : (resp?.data?.error || resp?.data?.message || `status_${resp?.status || 0}`)),
      adminId, adminName, ts: now,
    }
    await d.collection('wa_deliveries').insertOne(rec).catch(() => {})

    if (ok) {
      sent.push(it)
      spend += rate
      await d.collection('subscriptionContacts').insertOne({
        id: uuid(), userId: it.id, adminId, adminName,
        variant: it.template, phone: it.mobile, source: 'recovery_auto_whatsapp', at: now,
      }).catch(() => {})
    } else {
      failed.push({ ...it, error: rec.error })
    }
  }

  spend = Math.round(spend * 100) / 100
  if (spend > 0) await decrementBalance(d, spend).catch(() => {})

  return {
    sentCount: sent.length, failedCount: failed.length, skippedCount: skipped.length,
    sent, failed, skipped, spend, currency: settings.currency,
  }
}
