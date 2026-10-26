// ============================================================================
//  lib/acad-pdf.js — secure PDF handling for Academic Resources + Official
//  Papers viewers. Server-side ONLY.
//
//  Provides:
//   • mintViewToken / verifyViewToken — short-lived JWT bound to user+resource,
//     passed as ?t= so an <iframe>/new-tab (which cannot send Authorization
//     headers) can fetch the stream. NEVER embeds a Cloudinary/R2 URL.
//   • mirrorPdfToPrivateR2 — write NEW upload bytes to the PRIVATE R2 bucket
//     when STORAGE_WRITE=r2 (dual-write: Cloudinary copy is kept as fallback).
//   • fetchPrivatePdfBytes — read PDF bytes R2-first (private), Cloudinary
//     fallback (counted). Bytes only — the real location never reaches the
//     browser.
// ============================================================================
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
//  View token — self-contained, HMAC-signed, SHORT-lived (5 min). Bound to
//  user + resource + device (assess-grade). A copied link is useless because
//  the stream route ALSO requires a matching logged-in account (Bearer) — the
//  token alone never authorises. Mirrors lib/assess-render.js.
// ---------------------------------------------------------------------------
const SECRET = () => process.env.JWT_SECRET || process.env.R2_GATEWAY_SECRET || 'edumaster-default-secret'
const _b64u = (buf) => Buffer.from(buf).toString('base64url')
export const VIEW_TOKEN_TTL = 300 // seconds (5 minutes)

// Short, deterministic device fingerprint (never store the raw device id).
export function deviceHash(deviceId) {
  return crypto.createHmac('sha256', SECRET()).update('acad-dev:' + String(deviceId || '')).digest('base64url').slice(0, 16)
}

// Mint a short-lived token bound to user + resource (+ device). Synchronous
// HMAC (no external lib). `dev` should be deviceHash(deviceId).
export function signViewToken({ uid, rid, dev = '', typ = 'acadview' }, ttlSec = VIEW_TOKEN_TTL) {
  const payload = { u: uid, r: rid, dev: dev || '', y: typ, e: Math.floor(Date.now() / 1000) + ttlSec }
  const body = _b64u(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url')
  return `${body}.${sig}`
}

// Verify a view token. Returns { uid, rid, dev, typ, exp } or null. `rid`/`typ`
// (and optionally deviceId) MUST match when supplied.
export function verifyViewToken(token, { rid, typ = 'acadview', deviceId } = {}) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expect = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expect)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let p
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (!p || typeof p.e !== 'number' || p.e < Math.floor(Date.now() / 1000)) return null
  if (typ && p.y !== typ) return null
  if (rid && String(p.r) !== String(rid)) return null
  if (deviceId != null && p.dev && p.dev !== deviceHash(deviceId)) return null
  return { uid: p.u, rid: p.r, dev: p.dev || '', typ: p.y, exp: p.e }
}

// Mirror NEW upload bytes to PRIVATE R2 (only when writes are enabled + R2
// configured). Returns an r2 fileRef { backend:'r2', key, ... } or null.
export async function mirrorPdfToPrivateR2(buffer, { folder = 'lg-academic-resources' } = {}) {
  const { writePrivateToR2 } = await import('@/lib/media.js')
  if (!writePrivateToR2()) return null
  const { upload } = await import('@/lib/storage.js')
  const safeFolder = String(folder).replace(/^\/+|\/+$/g, '')
  const key = `${safeFolder}/${crypto.randomUUID()}.pdf`
  await upload(buffer, { key, visibility: 'private', contentType: 'application/pdf', cacheControl: 'private, no-store' })
  return { backend: 'r2', bucket: 'private', key, publicId: key, resourceType: 'raw', format: 'pdf', bytes: buffer.length }
}

// Read a document's PDF bytes, R2-first with Cloudinary fallback. `doc` may
// carry an r2 fileRef (new uploads) and/or cloudinaryPublicId (legacy +
// migrated). Returns a Buffer. Throws if nothing is available.
export async function fetchPrivatePdfBytes(doc) {
  const { getPrivateBytesPreferR2 } = await import('@/lib/private-read.js')
  const fileRef = (doc?.r2 && doc.r2.backend === 'r2' && doc.r2.key)
    ? doc.r2
    : { publicId: doc?.cloudinaryPublicId || doc?.pdfPublicId, resourceType: 'image', format: 'pdf' }
  return await getPrivateBytesPreferR2(fileRef, async () => {
    const pid = doc?.cloudinaryPublicId || doc?.pdfPublicId
    if (!pid) {
      // Last-resort: a stored delivery URL (legacy records without a publicId).
      const url = doc?.cloudinaryUrl || doc?.secureUrl || doc?.pdfUrl
      if (!url) throw new Error('PDF asset unavailable')
      const r = await fetch(url)
      if (!r.ok) throw new Error('upstream PDF fetch ' + r.status)
      return Buffer.from(await r.arrayBuffer())
    }
    const { signedPdfDownloadUrl } = await import('@/lib/cloudinary.js')
    const url = signedPdfDownloadUrl(pid, { expiresInSeconds: 900 })
    if (!url) throw new Error('PDF asset unavailable')
    const r = await fetch(url)
    if (!r.ok) throw new Error('upstream PDF fetch ' + r.status)
    return Buffer.from(await r.arrayBuffer())
  })
}
