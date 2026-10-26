// =============================================================================
//  lib/wa-transactional.js — UTILITY (transactional) WhatsApp sends.
//  -----------------------------------------------------------------------------
//  Three APPROVED BulkyMarketing UTILITY templates, wired to real app events
//  IN ADDITION to the in-app notification:
//    • order_confirmed  {{1}} name  {{2}} item  {{3}} amount(number, no ₹)  {{4}} order id   (URL btn → My Library)
//    • access_restored  {{1}} name  {{2}} item                                               (URL btn → My Library)
//    • number_changed   {{1}} name  {{2}} date dd-mm-yyyy                                     (URL btn → Support)
//
//  Rules (UTILITY / transactional):
//    • Send ANYTIME — NOT limited to the 9am–8pm IST marketing window.
//    • NOT counted against the 7-day marketing cap.
//    • STILL deduped — exactly once per order/event (unique index on dedupeKey).
//    • Skip invalid / non-10-digit numbers.
//    • NEVER include OTPs or passwords.
//    • number_changed goes to the NEW number.
//  All sends go through bulkymarketing.sendSingle (central approved-template gate).
//  Language: en_US. Keys come only from env (via bulkymarketing.js).
// =============================================================================
import { sendSingle } from './bulkymarketing.js'

const TX_LOG = 'whatsapp_tx_log'
const LANG = 'en_US'

let _idxReady = false
async function ensureIdx(d) {
  if (_idxReady) return
  try {
    await d.collection(TX_LOG).createIndex({ dedupeKey: 1 }, { unique: true, name: 'uniq_dedupe' })
    await d.collection(TX_LOG).createIndex({ template: 1, status: 1, at: -1 })
    _idxReady = true
  } catch (e) {
    if (![85, 86].includes(e?.code)) console.warn('[wa-tx] ensureIdx:', e?.message)
    _idxReady = true
  }
}

const firstName = (n) => {
  const s = String(n || '').trim()
  if (!s) return 'Teacher'
  return (s.split(/\s+/)[0] || 'Teacher').slice(0, 30)
}

// Clean to the last 10 digits; return null when not a sendable 10-digit number.
const clean10 = (m) => {
  const digits = String(m || '').replace(/\D/g, '').slice(-10)
  return /^\d{10}$/.test(digits) ? digits : null
}

const todayIST_ddmmyyyy = (date = new Date()) => {
  const ist = new Date(date.getTime() + 5.5 * 3600 * 1000)
  const dd = String(ist.getUTCDate()).padStart(2, '0')
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = ist.getUTCFullYear()
  return `${dd}-${mm}-${yyyy}`
}

/**
 * Core send: claim dedupeKey atomically, send one UTILITY template, log result.
 * Returns { ok, skipped?, reason?, status?, messageStatus? }.
 * Best-effort: never throws to the caller.
 */
async function sendUtility(d, { dedupeKey, template, userId, mobile, variables }) {
  await ensureIdx(d)
  const to = clean10(mobile)
  if (!to) return { skipped: true, reason: 'invalid-mobile' }

  // Atomic dedupe — insert a pending row; a duplicate key means "already sent/claimed".
  try {
    await d.collection(TX_LOG).insertOne({
      dedupeKey, template, userId: userId || null, mobile: to,
      variables, status: 'pending', at: new Date(),
    })
  } catch (e) {
    if (e?.code === 11000) return { skipped: true, reason: 'already-sent' }
    console.warn('[wa-tx] claim failed:', e?.message)
    // fall through and attempt the send anyway (claim is best-effort)
  }

  let resp
  try {
    resp = await sendSingle({ to, template_id: template, language: LANG, variables })
  } catch (e) {
    resp = { ok: false, status: 0, data: { error: String(e?.message || e).slice(0, 200) } }
  }
  const ms = String(resp?.data?.message_status || '').toLowerCase()
  const skippedByGate = !!resp?.skipped
  const ok = resp.ok && (ms === 'success' || ms === '')
  const status = skippedByGate ? 'skipped' : (ok ? 'sent' : 'failed')

  try {
    await d.collection(TX_LOG).updateOne(
      { dedupeKey },
      { $set: {
          status, httpStatus: resp?.status || 0,
          messageStatus: resp?.data?.message_status || null,
          gateReason: resp?.data?.reason || null,
          error: ok ? null : `status=${resp?.status} ms=${resp?.data?.message_status || resp?.data?.reason || 'n/a'}`,
          sentAt: new Date(),
      } },
    )
  } catch (_) {}
  // Decrement the internal balance estimate (UTILITY) — never blocks the send.
  if (ok) {
    try { const core = await import('./wa-send-core.js'); await core.noteWhatsAppSpend(d, 'utility', 1) } catch (_) {}
  }
  return { ok, skipped: skippedByGate, reason: resp?.data?.reason || null, status: resp?.status, messageStatus: resp?.data?.message_status || null }
}

/** order_confirmed → {{1}} name {{2}} item {{3}} amount(no ₹) {{4}} order id.
 *  Pass order.displayId to control {{4}} (e.g. a QR reference); otherwise the
 *  last 8 chars of order.id are used. dedupeKey is always based on order.id. */
export async function sendOrderConfirmedWa(d, order, user) {
  if (!order?.id) return { skipped: true, reason: 'no-order' }
  const mobile = order.userMobile || user?.mobile
  const items = (order.items || []).map(i => i.title).filter(Boolean).join(', ').slice(0, 120) || 'your order'
  const amount = String(Number(order.total || 0))                    // number only, no ₹
  const orderId = order.displayId ? String(order.displayId).slice(0, 40) : String(order.id).slice(-8)
  const name = order.userName || user?.name
  return sendUtility(d, {
    dedupeKey: `order_confirmed:${order.id}`,
    template: 'order_confirmed',
    userId: order.userId || user?.id,
    mobile,
    variables: { 1: firstName(name), 2: items, 3: amount, 4: orderId },
  })
}

/** access_restored → {{1}} name {{2}} item */
export async function sendAccessRestoredWa(d, order, user) {
  if (!order?.id) return { skipped: true, reason: 'no-order' }
  const mobile = order.userMobile || user?.mobile
  const items = (order.items || []).map(i => i.title).filter(Boolean).join(', ').slice(0, 120) || 'your purchase'
  const name = order.userName || user?.name
  return sendUtility(d, {
    dedupeKey: `access_restored:${order.id}`,
    template: 'access_restored',
    userId: order.userId || user?.id,
    mobile,
    variables: { 1: firstName(name), 2: items },
  })
}

/** number_changed → {{1}} name {{2}} date dd-mm-yyyy. Goes to the NEW number. */
export async function sendNumberChangedWa(d, { userId, name, newMobile }) {
  return sendUtility(d, {
    dedupeKey: `number_changed:${userId || ''}:${clean10(newMobile) || newMobile}:${todayIST_ddmmyyyy()}`,
    template: 'number_changed',
    userId: userId || null,
    mobile: newMobile,
    variables: { 1: firstName(name), 2: todayIST_ddmmyyyy() },
  })
}
