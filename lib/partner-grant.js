// Partner activation core logic for Teacher Utility Toolkit combos.
// All logic lives here (separate file) so the API routes stay thin.
//
// Combos (both grant Lesson Guru Premium for 365 days; comboType is metadata
// only on this side — the PRO/MDM products live on the Toolkit):
//   • master → "Combo Master" (Teacher Utility PRO + MDM Sahayak PRO + Premium)
//   • duo    → "Combo Duo"    (Teacher Utility PRO + Premium)
//
// Security / correctness guarantees:
//   • HMAC-SHA256 signature over the RAW request body (constant-time compare).
//   • ts freshness window (default 5 min) to block replays.
//   • days must be exactly 365.
//   • Valid Indian mobile only (last-10-digits, starts 6-9).
//   • Idempotent by orderId — a claim row is inserted BEFORE days are added, so
//     the same orderId can never add days twice.
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'

const DAY_MS = 86400000
export const PARTNER_COLL = 'partner_activations'
export const VALID_COMBOS = ['master', 'duo']
export const COMBO_TITLES = { master: 'Combo Master', duo: 'Combo Duo' }

// ---- validation helpers -----------------------------------------------------

// Last 10 digits; must be a valid Indian mobile (starts 6-9). null when invalid.
export function normalizeIndianMobile(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10)
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

// Constant-time HMAC-SHA256 verification of the raw body.
export function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody || '', 'utf8').digest('hex')
  const provided = String(signatureHeader).trim().toLowerCase().replace(/^sha256=/, '')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  try { return crypto.timingSafeEqual(a, b) } catch { return false }
}

// Accept ts in seconds or milliseconds. Reject when older/newer than maxAgeMs.
export function tsFresh(ts, maxAgeMs = 5 * 60 * 1000) {
  let n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return false
  if (n < 1e12) n = n * 1000 // seconds → ms
  return Math.abs(Date.now() - n) <= maxAgeMs
}

// ---- kill switch (settings) -------------------------------------------------

export async function getPartnerSettings(d) {
  const row = await d.collection('settings').findOne({ key: 'partnerGrant' })
  const v = row?.value || {}
  return { enabled: v.enabled === true } // default OFF
}

export async function setPartnerEnabled(d, enabled, adminId = null) {
  await d.collection('settings').updateOne(
    { key: 'partnerGrant' },
    { $set: { key: 'partnerGrant', value: { enabled: !!enabled, updatedAt: new Date(), updatedBy: adminId } } },
    { upsert: true },
  )
  return { enabled: !!enabled }
}

// ---- public view (safe fields for partner response) -------------------------

function publicActivation(a) {
  if (!a) return null
  return {
    orderId: a.orderId,
    status: a.status,
    comboType: a.comboType,
    days: a.days,
    expiryDate: a.newExpiry || null,
    accountCreated: !!a.accountCreated,
  }
}

async function genReferralCode(d) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const make = () => { let s = ''; for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]; return 'LG' + s }
  let code = make()
  for (let i = 0; i < 5; i++) { const dup = await d.collection('users').findOne({ referralCode: code }); if (!dup) break; code = make() }
  return code
}

// ---- grant ------------------------------------------------------------------
// Returns { ok, created, idempotent?, orderId, status, comboType, days, expiryDate }
export async function grantCombo(d, { phone, name, days, orderId, comboType, source }) {
  const mobile = normalizeIndianMobile(phone)
  if (!mobile) throw Object.assign(new Error('Invalid phone'), { httpStatus: 400 })
  if (Number(days) !== 365) throw Object.assign(new Error('days must be 365'), { httpStatus: 400 })
  if (!VALID_COMBOS.includes(comboType)) throw Object.assign(new Error('Invalid comboType'), { httpStatus: 400 })
  const oid = String(orderId || '').trim()
  if (!oid) throw Object.assign(new Error('orderId required'), { httpStatus: 400 })
  const src = source || 'toolkit_combo'

  // Fast-path idempotency.
  const pre = await d.collection(PARTNER_COLL).findOne({ orderId: oid })
  if (pre) return { ok: true, idempotent: true, ...publicActivation(pre) }

  // Claim the orderId BEFORE touching the user (unique index guards races).
  const now = new Date()
  const claim = {
    id: uuidv4(), orderId: oid, status: 'processing', comboType, days: Number(days),
    source: src, amount: 0, mobile, phoneLast4: mobile.slice(-4), createdAt: now,
  }
  try {
    await d.collection(PARTNER_COLL).insertOne(claim)
  } catch (e) {
    if (e?.code === 11000) {
      const ex = await d.collection(PARTNER_COLL).findOne({ orderId: oid })
      return { ok: true, idempotent: true, ...publicActivation(ex) }
    }
    throw e
  }

  // Find or create the user.
  let user = await d.collection('users').findOne({ mobile })
  let created = false
  if (!user) {
    user = {
      id: uuidv4(), name: (name && String(name).trim()) || 'Teacher', mobile,
      password: null, role: 'user',
      subscription: { plan: null, startDate: null, expiryDate: null, status: 'none' },
      mustChangePassword: true, favorites: [], recentLessons: [],
      referralCode: await genReferralCode(d), referredBy: null,
      waOptIn: false, source: src,
      createdAt: now,
    }
    await d.collection('users').insertOne(user)
    created = true
  }

  // Stack 365 days AFTER the current expiry (if still active & future).
  const cur = user.subscription || {}
  const curExpiry = cur.expiryDate ? new Date(cur.expiryDate) : null
  const hasFuture = curExpiry && curExpiry.getTime() > now.getTime() && cur.status === 'active'
  const base = hasFuture ? curExpiry : now
  const startDate = hasFuture && cur.startDate ? new Date(cur.startDate) : now
  const newExpiry = new Date(base.getTime() + Number(days) * DAY_MS)

  await d.collection('users').updateOne(
    { id: user.id },
    { $set: { subscription: { plan: 'toolkit_combo', startDate, expiryDate: newExpiry, status: 'active' } } },
  )

  // Finalise the activation record.
  await d.collection(PARTNER_COLL).updateOne(
    { orderId: oid },
    { $set: {
      status: 'active', userId: user.id, name: user.name,
      prevExpiry: curExpiry, startDate, newExpiry, accountCreated: created,
      activatedAt: now,
    } },
  )

  // Subscription history record (amount 0 — paid on Toolkit).
  await d.collection('subscriptions').insertOne({
    id: uuidv4(), userId: user.id, plan: 'toolkit_combo', source: src,
    comboType, orderId: oid, amount: 0, days: Number(days),
    startDate, expiryDate: newExpiry, createdAt: now,
  }).catch(() => {})

  // Audit log.
  await d.collection('admin_logs').insertOne({
    id: uuidv4(), type: 'partner_grant', severity: 'info', orderId: oid,
    userId: user.id, comboType, days: Number(days), source: src,
    accountCreated: created, prevExpiry: curExpiry, newExpiry, createdAt: now,
  }).catch(() => {})

  // UTILITY WhatsApp — existing order_confirmed template (non-fatal).
  try {
    const { sendOrderConfirmedWa } = await import('@/lib/wa-transactional.js')
    const order = {
      id: oid, displayId: oid, userId: user.id, userMobile: mobile, userName: user.name,
      total: 0, items: [{ title: COMBO_TITLES[comboType] || 'Teacher Utility Combo' }],
    }
    await sendOrderConfirmedWa(d, order, user)
  } catch (_) {}

  return { ok: true, created, orderId: oid, status: 'active', comboType, days: Number(days), expiryDate: newExpiry }
}

// ---- revoke -----------------------------------------------------------------
// Removes EXACTLY the days granted for this orderId (if still active).
// Always allowed (even when the kill switch is OFF) so refunds can be reversed.
// Silent — no WhatsApp. Idempotent. Returns { ok, revoked, reason?, newExpiry? }.
export async function revokeCombo(d, { orderId }) {
  const oid = String(orderId || '').trim()
  if (!oid) throw Object.assign(new Error('orderId required'), { httpStatus: 400 })

  const act = await d.collection(PARTNER_COLL).findOne({ orderId: oid })
  if (!act) return { ok: true, revoked: false, reason: 'order_not_found' }
  if (act.status === 'revoked') return { ok: true, revoked: false, reason: 'already_revoked' }
  if (act.status !== 'active') return { ok: true, revoked: false, reason: 'not_active' }

  const now = new Date()
  const user = act.userId ? await d.collection('users').findOne({ id: act.userId }) : null
  let newExpiry = null
  if (user) {
    const cur = user.subscription || {}
    const curExpiry = cur.expiryDate ? new Date(cur.expiryDate) : now
    newExpiry = new Date(curExpiry.getTime() - Number(act.days || 0) * DAY_MS)
    const status = newExpiry.getTime() > now.getTime() ? 'active' : 'expired'
    await d.collection('users').updateOne(
      { id: user.id },
      { $set: { 'subscription.expiryDate': newExpiry, 'subscription.status': status } },
    )
  }

  await d.collection(PARTNER_COLL).updateOne(
    { orderId: oid },
    { $set: { status: 'revoked', revokedAt: now, revokedExpiry: newExpiry } },
  )

  await d.collection('admin_logs').insertOne({
    id: uuidv4(), type: 'partner_revoke', severity: 'warn', orderId: oid,
    userId: act.userId || null, comboType: act.comboType, days: act.days,
    removedDays: act.days, newExpiry, createdAt: now,
  }).catch(() => {})

  return { ok: true, revoked: true, newExpiry }
}

// ---- admin list / CSV -------------------------------------------------------

export async function listActivations(d, { limit = 500 } = {}) {
  const rows = await d.collection(PARTNER_COLL).find({}).sort({ createdAt: -1 }).limit(limit).toArray()
  return rows.map((a) => ({
    date: a.createdAt || null,
    phoneLast4: a.phoneLast4 || (a.mobile ? String(a.mobile).slice(-4) : ''),
    comboType: a.comboType || '',
    days: a.days || 0,
    orderId: a.orderId || '',
    status: a.status || '',
    accountCreated: !!a.accountCreated,
    expiryDate: a.newExpiry || null,
  }))
}

export function toCsv(rows) {
  const header = ['Date', 'Phone (last 4)', 'Combo', 'Days', 'Order ID', 'Status']
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push([
      r.date ? new Date(r.date).toISOString() : '',
      `****${r.phoneLast4 || ''}`,
      r.comboType,
      r.days,
      r.orderId,
      r.status,
    ].map(esc).join(','))
  }
  return lines.join('\n')
}

// Ensure the unique index that powers idempotency. Safe to call repeatedly.
export async function ensurePartnerIndexes(d) {
  try { await d.collection(PARTNER_COLL).createIndex({ orderId: 1 }, { unique: true }) } catch (_) {}
  try { await d.collection(PARTNER_COLL).createIndex({ createdAt: -1 }) } catch (_) {}
}
