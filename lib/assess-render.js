// ============================================================================
//  lib/assess-render.js — Lazy PDF page rendering + secure page serving.
//  Server-side ONLY. Replaces Cloudinary's on-the-fly per-page watermark
//  images for the secure in-browser viewer:
//    • render the requested page ONCE with @hyzyla/pdfium (MIT),
//    • store ONE CLEAN jpeg in the PRIVATE R2 bucket (mapped in `r2_renders`),
//    • apply the buyer-specific watermark ON THE FLY at serve time (sharp),
//    • never store buyer-specific pixels, never expose private objects publicly.
//
//  Reads fall back to Cloudinary (master PDF) when an item has not been
//  mirrored to R2 yet — so existing data keeps working during the migration.
// ============================================================================
import crypto from 'node:crypto'
import sharp from 'sharp'
import { getPrivateFileBuffer, upload, r2Enabled } from '@/lib/storage.js'
import { applyPageWatermark } from '@/lib/assess-watermark.js'

sharp.concurrency(1)
sharp.cache(false)

// Enable the R2 render pipeline for the viewer only when explicitly flagged AND
// R2 is configured. Kept behind a flag so the LIVE switch stays explicit.
// NOTE: this is the FULL-SWITCH master override (ASSESS_VIEW_R2=1). The default
// behaviour is PER-DOC — see docHasOwnR2() below.
export function viewR2Enabled() {
  return process.env.ASSESS_VIEW_R2 === '1' && r2Enabled()
}

// PER-DOC decision: a document whose OWN main file was written to R2 by a NEW
// upload (STORAGE_WRITE=r2 → r2_master_key set) is always served via the R2
// render pipeline, independent of any global flag. Documents without an own R2
// key use the legacy Cloudinary pipeline (unless the ASSESS_VIEW_R2 override is
// on). Does NOT consult the r2_migration map (that is R2_READ_FLIP-gated).
export function docHasOwnR2(docu) {
  return !!(docu && docu.r2_master_key) && r2Enabled()
}

// ---------------------------------------------------------------------------
//  View token — self-contained, HMAC-signed, SHORT-lived (5 min). Bound to
//  user + document + page + device, so a copied URL is useless in another
//  browser/account and stops working within minutes. The per-page serve route
//  ALSO requires a matching bearer (account binding) + device header.
// ---------------------------------------------------------------------------
const _secret = () => process.env.JWT_SECRET || process.env.R2_GATEWAY_SECRET || 'dev-secret'
const _b64u = (buf) => Buffer.from(buf).toString('base64url')
const VIEW_TOKEN_TTL = 300 // seconds (5 minutes)

// Short, deterministic device fingerprint (never store the raw device id).
export function deviceHash(deviceId) {
  return crypto.createHmac('sha256', _secret()).update('dev:' + String(deviceId || '')).digest('base64url').slice(0, 16)
}

export function signViewToken({ docId, uid, trace, mobile, page, dev }, ttlSec = VIEW_TOKEN_TTL) {
  const payload = { d: docId, u: uid, t: trace, m: mobile || '', p: (page == null ? null : page), dev: dev || '', e: Math.floor(Date.now() / 1000) + ttlSec }
  const body = _b64u(JSON.stringify(payload))
  const sig = crypto.createHmac('sha256', _secret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyViewToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expect = crypto.createHmac('sha256', _secret()).update(body).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expect)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let p
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (!p || typeof p.e !== 'number' || p.e < Math.floor(Date.now() / 1000)) return null
  return { docId: p.d, uid: p.u, trace: p.t, mobile: p.m || '', page: (p.p == null ? null : p.p), dev: p.dev || '', exp: p.e }
}

// Build the page URL list returned by /assess/view. ONE short-lived, PER-PAGE,
// device-bound token per image (page-bound → cannot be reused for other pages).
export function buildViewPages(docId, { uid, trace, mobile, count, deviceId }) {
  const dev = deviceHash(deviceId)
  return Array.from({ length: count }, (_v, i) => {
    const token = signViewToken({ docId, uid, trace, mobile, page: i + 1, dev }, VIEW_TOKEN_TTL)
    return `/api/assess/page/${encodeURIComponent(docId)}/${i + 1}?t=${token}`
  })
}

// ---------------------------------------------------------------------------
//  Master PDF resolution — prefer R2 (mirrored), fall back to Cloudinary.
// ---------------------------------------------------------------------------
const _masterCache = new Map() // docId -> { buffer, ts }
const MASTER_TTL = 120000      // 2 min — enough to render a whole doc's pages

function _getMaster(docId) {
  const e = _masterCache.get(docId)
  if (e && Date.now() - e.ts < MASTER_TTL) return e.buffer
  if (e) _masterCache.delete(docId)
  return null
}
function _putMaster(docId, buffer) {
  _masterCache.set(docId, { buffer, ts: Date.now() })
  while (_masterCache.size > 4) _masterCache.delete(_masterCache.keys().next().value)
}

export async function resolveMasterKey(d, docu) {
  // 1) Record's OWN R2 key (new writes) — always honoured, no flag.
  if (docu.r2_master_key) return docu.r2_master_key
  // 2) FULL-SWITCH ONLY: legacy publicId via the r2_migration map (R2_READ_FLIP).
  if (process.env.R2_READ_FLIP === '1' && docu.cld_public_id) {
    const mig = await d.collection('r2_migration').findOne({ publicId: docu.cld_public_id, bucket: 'private' })
    if (mig?.targets?.[0]?.key) return mig.targets[0].key
  }
  return null
}

async function getMasterBuffer(d, docu) {
  const cached = _getMaster(docu.id)
  if (cached) return cached
  let buf = null
  const key = await resolveMasterKey(d, docu)
  if (key && r2Enabled()) {
    try { const got = await getPrivateFileBuffer(key); if (got) buf = got.buffer }
    catch (e) { console.error(`[assess-render] R2 master read FAILED doc=${docu.id} key=${key}: ${e?.message || e}`) }
  }
  // Own-R2 doc with NO Cloudinary copy → do NOT fall back; surface a clear error.
  if (!buf && docu.r2_master_key && !docu.cld_public_id) {
    const err = new Error('R2_MASTER_UNAVAILABLE'); err.code = 'R2_MASTER_UNAVAILABLE'; err.r2Key = key || docu.r2_master_key
    console.error(`[assess-render] own-R2 master unavailable (no Cloudinary copy) doc=${docu.id}`)
    throw err
  }
  if (!buf && docu.cld_public_id) {
    const { signedAssessDownloadUrl } = await import('@/lib/cloudinary.js')
    const url = signedAssessDownloadUrl(docu.cld_public_id, { resourceType: docu.cld_resource_type || 'image', format: docu.cld_format || 'pdf', expiresInSeconds: 120 })
    const r = await fetch(url)
    if (!r.ok) throw new Error('master fetch ' + r.status)
    buf = Buffer.from(await r.arrayBuffer())
  }
  if (!buf) throw new Error('master unavailable')
  _putMaster(docu.id, buf)
  return buf
}

// ---------------------------------------------------------------------------
//  pdfium render — bounded concurrency to protect the dev server from OOM.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT = 2
let _active = 0
const _waiters = []
function _acquire() {
  return new Promise((resolve) => {
    const run = () => { _active++; resolve(() => { _active--; const n = _waiters.shift(); if (n) n() }) }
    if (_active < MAX_CONCURRENT) run(); else _waiters.push(run)
  })
}

export async function pdfPageCount(buffer) {
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  const release = await _acquire()
  let library, pdoc
  try {
    library = await PDFiumLibrary.init()
    pdoc = await library.loadDocument(buffer)
    return pdoc.getPageCount()
  } finally {
    try { pdoc?.destroy() } catch (_) {}
    try { library?.destroy() } catch (_) {}
    release()
  }
}

async function renderCleanPage(masterBuf, page, { maxWidth = 1200, scale = 2.0, quality = 88 } = {}) {
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  const release = await _acquire()
  let library, pdoc
  try {
    library = await PDFiumLibrary.init()
    pdoc = await library.loadDocument(masterBuf)
    const count = pdoc.getPageCount()
    const idx = Math.min(Math.max(page - 1, 0), count - 1)
    const pg = pdoc.getPage(idx)
    const res = await pg.render({ scale, render: async (o) => o.data })
    const bgra = Buffer.from(res.data)
    for (let p = 0; p < bgra.length; p += 4) { const b = bgra[p]; bgra[p] = bgra[p + 2]; bgra[p + 2] = b }
    let img = sharp(bgra, { raw: { width: res.width, height: res.height, channels: 4 } })
    if (res.width > maxWidth) img = img.resize({ width: maxWidth })
    const jpeg = await img.jpeg({ quality }).toBuffer()
    return { buffer: jpeg, pageCount: count }
  } finally {
    try { pdoc?.destroy() } catch (_) {}
    try { library?.destroy() } catch (_) {}
    release()
  }
}

// Return a CLEAN (un-watermarked) page jpeg, rendering + caching on first use.
export async function getOrRenderCleanPage(d, docu, page) {
  const col = d.collection('r2_renders')
  const existing = await col.findOne({ document_id: docu.id, page })
  if (existing?.key) {
    try { const got = await getPrivateFileBuffer(existing.key); if (got) return { buffer: got.buffer, contentType: existing.content_type || 'image/jpeg' } } catch (_) {}
    // stale/missing object → fall through and re-render
  }
  const master = await getMasterBuffer(d, docu)
  const { buffer } = await renderCleanPage(master, page)
  const key = `lg-assess/renders/${docu.id}/p${page}.jpg`
  try {
    await upload(buffer, { key, visibility: 'private', contentType: 'image/jpeg', cacheControl: 'private, no-store' })
    await col.updateOne(
      { document_id: docu.id, page },
      { $set: { document_id: docu.id, page, key, bucket: 'private', content_type: 'image/jpeg', bytes: buffer.length, updated_at: new Date() }, $setOnInsert: { id: crypto.randomUUID(), created_at: new Date() } },
      { upsert: true },
    )
  } catch (e) { /* cache write is best-effort; still serve the buffer */ }
  return { buffer, contentType: 'image/jpeg' }
}

// Serve a watermarked page for the token's buyer. Returns a plain result object
// so the route layer can build the HTTP Response (keeps route.js thin).
// Binding: token (HMAC, 5-min TTL) must match docId + page; `meId` (bearer
// account) must equal the token's user; and the request device must match the
// device the token was minted for. A copied URL therefore fails elsewhere.
export async function serveWatermarkedPage(d, { docId, page, token, meId, deviceId }) {
  const tok = verifyViewToken(token)
  if (!tok || tok.docId !== docId) return { status: 403, error: 'FORBIDDEN' }
  if (tok.page != null && tok.page !== page) return { status: 403, error: 'PAGE_MISMATCH' }
  if (!meId || tok.uid !== meId) return { status: 403, error: 'ACCOUNT_MISMATCH' }
  if (tok.dev && tok.dev !== deviceHash(deviceId)) return { status: 403, error: 'DEVICE_MISMATCH' }
  const docu = await d.collection('assess_documents').findOne({ id: docId })
  if (!docu) return { status: 404, error: 'NOT_FOUND' }
  if (!docu.cld_public_id && !docu.r2_master_key) return { status: 400, error: 'FILE_MISSING' }
  const pageCount = Math.min(Math.max(parseInt(docu.pages) || 1, 1), 200)
  if (!Number.isFinite(page) || page < 1 || page > pageCount) return { status: 404, error: 'BAD_PAGE' }
  const { buffer } = await getOrRenderCleanPage(d, docu, page)
  const wmText = `${tok.mobile || ''} ${tok.trace || ''}`.trim()
  const out = await applyPageWatermark(buffer, wmText, { maxWidth: 1200, quality: 85 })
  return { status: 200, buffer: out, contentType: 'image/jpeg' }
}
