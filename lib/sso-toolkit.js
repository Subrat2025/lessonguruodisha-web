// ============================================================================
//  lib/sso-toolkit.js — Teacher Utility Toolkit auto-login (SSO) core logic.
//
//  Flow (see app/sso/toolkit/route.js):
//    token = base64url(JSON {phone,name,iat,exp,nonce,src:"toolkit"})
//            + "." + hex HMAC-SHA256(base64url_part, SSO_TOOLKIT_SECRET)
//
//  Security guarantees:
//    • Constant-time HMAC-SHA256 signature verification.
//    • Short validity: exp - iat MUST be <= 60s, and token must not be expired.
//    • One-time use: nonce is consumed (stored 10 min via TTL) — replay blocked.
//    • Valid Indian mobile only (last-10-digits, starts 6-9).
//    • Per-IP rate limit (10/min).
//    • Admin / blocked / deleted accounts NEVER auto-login (fail closed).
//    • Per-host kill switch (preview ON by default, live OFF by default).
//    • Audit log stores ONLY time, phone-last-4, result (never token/full phone).
// ============================================================================
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { normalizeIndianMobile } from '@/lib/partner-grant'

export const NONCE_COLL = 'sso_nonces'
export const RATE_COLL = 'sso_rate'
export const AUDIT_COLL = 'sso_audit'
export const HANDOFF_COLL = 'sso_handoff'
export const SSO_SETTINGS_KEY = 'ssoToolkit'

// Any of these role signals => treat as admin => NO auto-login.
export const ADMIN_ROLES = ['admin', 'section_uploader', 'books_uploader']

const NONCE_TTL_MS = 10 * 60 * 1000 // used-nonce memory window
const RATE_WINDOW_MS = 60 * 1000
const RATE_LIMIT = 10
const HANDOFF_LOGIN_TTL_MS = 60 * 1000       // session handoff: short-lived
const HANDOFF_CONFIRM_TTL_MS = 10 * 60 * 1000 // confirm handoff: 10 min

// ---- one-time handoff (code in URL query; secret payload stays server-side) -
// Why: a 302 Location fragment (#...) is dropped by some in-app webviews, and a
// session JWT must never sit in a URL/logs. So /sso/toolkit stores the result
// server-side under a random code and redirects with ?c=<code>; the client
// exchanges the code (POST) for the token/phone exactly once.
export async function createHandoff(d, { kind, token = null, phone = null, to = '/' }) {
  const code = crypto.randomBytes(24).toString('base64url')
  const ttl = kind === 'login' ? HANDOFF_LOGIN_TTL_MS : HANDOFF_CONFIRM_TTL_MS
  await d.collection(HANDOFF_COLL).insertOne({
    code, kind, token, phone, to,
    expiresAt: new Date(Date.now() + ttl), createdAt: new Date(),
  })
  return code
}

export async function readHandoff(d, code, { kind = null, consume = false } = {}) {
  if (!code) return null
  const doc = await d.collection(HANDOFF_COLL).findOne({ code: String(code) })
  if (!doc) return null
  if (new Date(doc.expiresAt).getTime() < Date.now()) {
    await d.collection(HANDOFF_COLL).deleteOne({ code: String(code) }).catch(() => {})
    return null
  }
  if (kind && doc.kind !== kind) return null
  if (consume) await d.collection(HANDOFF_COLL).deleteOne({ code: String(code) }).catch(() => {})
  return doc
}

export async function deleteHandoff(d, code) {
  if (!code) return
  await d.collection(HANDOFF_COLL).deleteOne({ code: String(code) }).catch(() => {})
}

// Consume a LOGIN handoff with a short grace window so an accidental duplicate
// read (e.g. React dev effect firing twice) returns the SAME token instead of a
// 410 that would clobber the successful login. HARDENING: the grace re-read is
// allowed ONLY from the SAME IP + SAME user-agent as the first exchange, and
// only within graceMs (max 10s). Anything else -> null (=> 410).
export async function consumeLoginHandoff(d, code, { ip = '', ua = '', graceMs = 10000 } = {}) {
  if (!code) return null
  const cap = Math.min(Number(graceMs) || 0, 10000) // enforce a hard 10s ceiling
  const c = String(code)
  const doc = await d.collection(HANDOFF_COLL).findOne({ code: c })
  if (!doc || doc.kind !== 'login') return null
  if (new Date(doc.expiresAt).getTime() < Date.now()) {
    await d.collection(HANDOFF_COLL).deleteOne({ code: c }).catch(() => {})
    return null
  }
  if (doc.consumedAt) {
    if (Date.now() - new Date(doc.consumedAt).getTime() > cap) return null
    // Same requester only (same IP AND same user-agent as the first exchange).
    if ((doc.consumedIp || '') !== String(ip || '') || (doc.consumedUa || '') !== String(ua || '')) return null
    return { token: doc.token, to: doc.to || '/' }
  }
  await d.collection(HANDOFF_COLL).updateOne(
    { code: c },
    { $set: { consumedAt: new Date(), consumedIp: String(ip || ''), consumedUa: String(ua || '') } },
  ).catch(() => {})
  return { token: doc.token, to: doc.to || '/' }
}

// ---- token verification -----------------------------------------------------

// Normalize a timestamp that may be seconds or milliseconds -> milliseconds.
function toMs(n) {
  let v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return NaN
  if (v < 1e12) v = v * 1000 // seconds -> ms
  return v
}

function constantTimeEqualHex(aHex, bHex) {
  const a = Buffer.from(String(aHex), 'utf8')
  const b = Buffer.from(String(bHex), 'utf8')
  if (a.length !== b.length) return false
  try { return crypto.timingSafeEqual(a, b) } catch { return false }
}

// ---- short-lived link ticket (for the "Confirm it's you" OTP step) ----------
// Issued by /sso/toolkit when an EXISTING but NOT-yet-linked account is seen.
// The confirm page runs a normal OTP login for the SAME phone, then calls
// /api/sso/link with this ticket to flip toolkitLinked=true. Signed + 10-min TTL.
const LINK_TICKET_TTL_MS = 10 * 60 * 1000

export function createLinkTicket(phone, secret) {
  const payload = { phone: String(phone), purpose: 'sso-link', iat: Date.now(), exp: Date.now() + LINK_TICKET_TTL_MS }
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(b64, 'utf8').digest('hex')
  return `${b64}.${sig}`
}

// Returns { ok:true, phone } or { ok:false, reason }
export function verifyLinkTicket(ticket, secret) {
  if (!secret) return { ok: false, reason: 'no_secret' }
  const raw = String(ticket || '')
  const parts = raw.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' }
  const [b64, sig] = parts
  const expected = crypto.createHmac('sha256', secret).update(b64, 'utf8').digest('hex')
  if (!constantTimeEqualHex(expected, sig.trim().toLowerCase().replace(/^sha256=/, ''))) return { ok: false, reason: 'bad_signature' }
  let claims
  try { claims = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) } catch { return { ok: false, reason: 'bad_payload' } }
  if (!claims || claims.purpose !== 'sso-link' || !claims.phone) return { ok: false, reason: 'bad_ticket' }
  if (Date.now() > Number(claims.exp)) return { ok: false, reason: 'expired' }
  return { ok: true, phone: String(claims.phone) }
}

// Returns { ok:true, claims } or { ok:false, reason }
export function verifyToken(tokenStr, secret) {
  if (!secret) return { ok: false, reason: 'no_secret' }
  const raw = String(tokenStr || '')
  if (!raw || raw.indexOf('.') === -1) return { ok: false, reason: 'malformed' }
  const parts = raw.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' }
  const [b64, sig] = parts

  // 1) Signature (constant-time).
  const expected = crypto.createHmac('sha256', secret).update(b64, 'utf8').digest('hex')
  const provided = sig.trim().toLowerCase().replace(/^sha256=/, '')
  if (!constantTimeEqualHex(expected, provided)) return { ok: false, reason: 'bad_signature' }

  // 2) Decode payload.
  let claims
  try {
    const jsonStr = Buffer.from(b64, 'base64url').toString('utf8')
    claims = JSON.parse(jsonStr)
  } catch { return { ok: false, reason: 'bad_payload' } }
  if (!claims || typeof claims !== 'object') return { ok: false, reason: 'bad_payload' }
  if (claims.src !== 'toolkit') return { ok: false, reason: 'bad_src' }
  if (!claims.nonce || typeof claims.nonce !== 'string') return { ok: false, reason: 'no_nonce' }
  if (!claims.phone) return { ok: false, reason: 'no_phone' }

  // 3) Timing: exp-iat <= 60s, and not expired.
  const iat = toMs(claims.iat)
  const exp = toMs(claims.exp)
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) return { ok: false, reason: 'bad_time' }
  if (exp - iat > 60 * 1000) return { ok: false, reason: 'window_too_long' }
  if (exp - iat <= 0) return { ok: false, reason: 'bad_window' }
  const now = Date.now()
  if (now > exp) return { ok: false, reason: 'expired' }
  if (iat - now > 5 * 1000) return { ok: false, reason: 'future' } // tiny skew tolerance

  return { ok: true, claims }
}

// ---- per-host kill switch ---------------------------------------------------

export async function getSsoSettings(d) {
  const row = await d.collection('settings').findOne({ key: SSO_SETTINGS_KEY })
  const v = row?.value || {}
  return {
    enabled_preview: v.enabled_preview !== false, // default ON
    enabled_live: v.enabled_live === true,        // default OFF
    updatedAt: v.updatedAt || null,
  }
}

export async function setSsoEnabled(d, { hostType, enabled, adminId = null }) {
  const field = hostType === 'live' ? 'enabled_live' : 'enabled_preview'
  await d.collection('settings').updateOne(
    { key: SSO_SETTINGS_KEY },
    { $set: { key: SSO_SETTINGS_KEY, [`value.${field}`]: !!enabled, 'value.updatedAt': new Date(), 'value.updatedBy': adminId } },
    { upsert: true },
  )
  return getSsoSettings(d)
}

export function isSsoEnabledForHost(settings, hostType) {
  return hostType === 'live' ? !!settings.enabled_live : !!settings.enabled_preview
}

// ---- one-time nonce ---------------------------------------------------------
// Returns true if the nonce was fresh (now consumed), false if it was reused.
export async function consumeNonce(d, nonce) {
  try {
    await d.collection(NONCE_COLL).insertOne({
      nonce: String(nonce),
      expiresAt: new Date(Date.now() + NONCE_TTL_MS),
      createdAt: new Date(),
    })
    return true
  } catch (e) {
    if (e?.code === 11000) return false // duplicate => replay
    throw e
  }
}

// ---- rate limit (per IP, sliding minute bucket) -----------------------------
export async function checkRateLimit(d, ip) {
  const bucket = Math.floor(Date.now() / RATE_WINDOW_MS)
  const key = `${ip || 'unknown'}:${bucket}`
  const res = await d.collection(RATE_COLL).findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: { key, expiresAt: new Date(Date.now() + RATE_WINDOW_MS * 2) },
    },
    { upsert: true, returnDocument: 'after' },
  )
  const count = res?.value?.count ?? res?.count ?? 1
  return { allowed: count <= RATE_LIMIT, count }
}

// ---- audit ------------------------------------------------------------------
// Stores ONLY: time, phone-last-4, result, hostType. Never token / full phone.
export async function audit(d, { phoneLast4 = '', result, hostType = '' }) {
  try {
    await d.collection(AUDIT_COLL).insertOne({
      id: uuidv4(),
      at: new Date(),
      phoneLast4: String(phoneLast4 || '').slice(-4),
      result: String(result || ''),
      hostType: String(hostType || ''),
    })
  } catch (_) { /* non-fatal */ }
}

export async function listAudit(d, { limit = 50 } = {}) {
  const rows = await d.collection(AUDIT_COLL).find({}).sort({ at: -1 }).limit(limit).toArray()
  return rows.map((r) => ({ at: r.at || null, phoneLast4: r.phoneLast4 || '', result: r.result || '', hostType: r.hostType || '' }))
}

// ---- account helpers --------------------------------------------------------

export function isAdminAccount(user) {
  if (!user) return false
  if (ADMIN_ROLES.includes(user.role)) return true
  const superAdmin = normalizeIndianMobile(process.env.STORE_SUPER_ADMIN_MOBILE || '9692604577')
  if (superAdmin && normalizeIndianMobile(user.mobile) === superAdmin) return true
  return false
}

export function isBlockedAccount(user) {
  if (!user) return false
  return !!(user.suspended || user.deleted || user.blocked || user.disabled)
}

export function isPremiumActive(user) {
  const s = user?.subscription
  if (!s || s.status !== 'active' || !s.expiryDate) return false
  return new Date(s.expiryDate) > new Date()
}

async function genReferralCode(d) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const make = () => { let s = ''; for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]; return 'LG' + s }
  let code = make()
  for (let i = 0; i < 5; i++) { const dup = await d.collection('users').findOne({ referralCode: code }); if (!dup) break; code = make() }
  return code
}

// Create a brand-new TOOLKIT user per the agreed rules:
//   source "toolkit", no password, no referredBy, no free trial / welcome reward,
//   waOptIn=false (they did not tick our WhatsApp consent box).
// A brand-new account has no pre-existing owner to hijack, so it is linked
// immediately (toolkitLinked=true) and auto-login proceeds.
export async function createToolkitUser(d, { mobile, name }) {
  const now = new Date()
  const user = {
    id: uuidv4(),
    name: (name && String(name).trim()) || 'Teacher',
    mobile,
    password: null,
    role: 'user',
    subscription: { plan: null, startDate: null, expiryDate: null, status: 'none' },
    mustChangePassword: false,
    favorites: [],
    recentLessons: [],
    referralCode: await genReferralCode(d),
    referredBy: null,
    waOptIn: false,
    source: 'toolkit',
    toolkitLinked: true,
    toolkitLinkedAt: now,
    createdAt: now,
  }
  await d.collection('users').insertOne(user)
  return user
}

// Mark/unmark an account as linked to the Toolkit (admin unlink or OTP confirm).
export async function setToolkitLinked(d, userId, linked) {
  const now = new Date()
  const $set = { toolkitLinked: !!linked }
  if (linked) $set.toolkitLinkedAt = now
  const upd = { $set }
  if (!linked) upd.$unset = { toolkitLinkedAt: '' }
  await d.collection('users').updateOne({ id: userId }, upd)
}

// Admin list of currently Toolkit-linked accounts (name + phone-last-4 + date).
export async function listLinkedUsers(d, { limit = 100 } = {}) {
  const rows = await d.collection('users')
    .find({ toolkitLinked: true })
    .project({ _id: 0, id: 1, name: 1, mobile: 1, toolkitLinkedAt: 1, source: 1 })
    .sort({ toolkitLinkedAt: -1 })
    .limit(limit)
    .toArray()
  return rows.map((u) => ({
    id: u.id,
    name: u.name || '',
    phoneLast4: String(u.mobile || '').slice(-4),
    source: u.source || '',
    linkedAt: u.toolkitLinkedAt || null,
  }))
}

// Idempotent index creation. Safe to call on every request.
export async function ensureSsoIndexes(d) {
  try { await d.collection(NONCE_COLL).createIndex({ nonce: 1 }, { unique: true }) } catch (_) {}
  try { await d.collection(NONCE_COLL).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }) } catch (_) {}
  try { await d.collection(RATE_COLL).createIndex({ key: 1 }, { unique: true }) } catch (_) {}
  try { await d.collection(RATE_COLL).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }) } catch (_) {}
  try { await d.collection(AUDIT_COLL).createIndex({ at: -1 }) } catch (_) {}
  try { await d.collection(HANDOFF_COLL).createIndex({ code: 1 }, { unique: true }) } catch (_) {}
  try { await d.collection(HANDOFF_COLL).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }) } catch (_) {}
}
