// ============================================================================
//  ANSWER KEY FEATURE — service layer (NO AI / NO OCR)
//  Admin-prepared, private, pay-to-unlock answer keys.
//  All storage is Cloudinary 'authenticated' (private). Files are only ever
//  streamed by the server after an ownership check.
// ============================================================================
import { v4 as uuidv4 } from 'uuid'
import { PDFDocument } from 'pdf-lib'
import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import { v2 as cloudinary } from 'cloudinary'
import { uploadAssessAssetFromPath, signedAssessDownloadUrl, deleteAssessAsset, cloudinaryEnabled } from '@/lib/cloudinary.js'

export const AK_COLL = { requests: 'answerKeyRequests', logs: 'answerKeyLogs' }

export const AK_SETTINGS_KEY = 'answer_key'
export const AK_DEFAULT_SETTINGS = Object.freeze({
  enabled: false,              // master switch — OFF by default
  standardPriceInr: 29,
  longPriceInr: 49,
  longPageThreshold: 6,
  firstFree: false,
  turnaroundHours: 24,
  maxUnpaidConcurrent: 2,      // counts submitted + in_progress + ready_locked
  maxPerDay: 5,
  downloadsPerKey: 5,
  slaAlertHoursBefore: 4,      // WhatsApp admin this many hours before the turnaround deadline
  alertWhatsapp: '',           // admin number for delayed-request alerts (fallback used if empty)
  betaTesters: [],             // when master switch is OFF, ONLY these mobiles can see/use the feature
})

export const AK_MAX_TOTAL_BYTES = 10 * 1024 * 1024  // 10 MB total
export const AK_MAX_PHOTOS = 8

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getAKSettings(db) {
  const doc = await db.collection('settings').findOne({ key: AK_SETTINGS_KEY })
  return { ...AK_DEFAULT_SETTINGS, ...(doc?.value || {}) }
}

// Normalize a mobile to bare digits (strip +, spaces, leading country/0).
export function normMobile(m) { return String(m || '').replace(/[^0-9]/g, '') }

// Is the Answer Key feature visible/usable for this user?
// When the master switch is ON → everyone. When OFF → only beta-tester mobiles.
export function akVisibleFor(settings, user) {
  if (settings?.enabled) return true
  if (!user?.mobile) return false
  const um = normMobile(user.mobile)
  const list = (settings?.betaTesters || []).map(normMobile).filter(Boolean)
  return list.some(x => x === um || (x.length >= 10 && um.length >= 10 && x.slice(-10) === um.slice(-10)))
}

// A server-side TEST account used ONLY by automated tests to simulate a
// verified payment. MUST be a beta tester AND have a name starting with
// "TEST_". No real user can satisfy both, so this can never be abused.
export function isAkTestAccount(settings, user) {
  return !!user && typeof user.name === 'string' && user.name.startsWith('TEST_') && akVisibleFor(settings, user)
}
export async function saveAKSettings(db, patch, adminUser) {
  const cur = await getAKSettings(db)
  const next = { ...cur, ...(patch || {}) }
  ;['standardPriceInr','longPriceInr','longPageThreshold','turnaroundHours','maxUnpaidConcurrent','maxPerDay','downloadsPerKey','slaAlertHoursBefore']
    .forEach(k => { next[k] = Math.max(0, Math.round(Number(next[k]) || 0)) })
  next.enabled = !!next.enabled
  next.firstFree = !!next.firstFree
  next.alertWhatsapp = String(next.alertWhatsapp || '').replace(/[^0-9]/g, '')
  next.betaTesters = Array.isArray(next.betaTesters)
    ? [...new Set(next.betaTesters.map(normMobile).filter(Boolean))]
    : []
  await db.collection('settings').updateOne(
    { key: AK_SETTINGS_KEY },
    { $set: { key: AK_SETTINGS_KEY, value: next, updatedAt: new Date(), updatedBy: adminUser?.id || null } },
    { upsert: true },
  )
  return next
}

export async function ensureAKIndexes(db) {
  try {
    await db.collection(AK_COLL.requests).createIndex({ ownerId: 1, submittedAt: -1 })
    await db.collection(AK_COLL.requests).createIndex({ id: 1 }, { unique: true })
    await db.collection(AK_COLL.requests).createIndex({ status: 1, submittedAt: 1 })
    await db.collection(AK_COLL.requests).createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true })
    await db.collection(AK_COLL.logs).createIndex({ requestId: 1, createdAt: -1 })
  } catch (_) { /* index race — safe to ignore */ }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export async function logAK(db, { requestId, userId = null, actorRole = 'user', action, ip = null, userAgent = null, meta = {} }) {
  try {
    await db.collection(AK_COLL.logs).insertOne({
      id: uuidv4(), requestId: requestId || null, userId, actorRole, action,
      ip, userAgent, meta: meta || {}, createdAt: new Date(),
    })
  } catch (_) { /* never block on logging */ }
}

// ---------------------------------------------------------------------------
// Pricing (server-authoritative)
// ---------------------------------------------------------------------------
export function priceForPages(settings, pageCount, forceLong = false) {
  const isLong = !!forceLong || (Number(pageCount) || 0) > (Number(settings.longPageThreshold) || 6)
  return { tier: isLong ? 'long' : 'standard', inr: isLong ? Number(settings.longPriceInr || 49) : Number(settings.standardPriceInr || 29) }
}

// ---------------------------------------------------------------------------
// File-type sniffing from magic bytes (NEVER trust the extension)
// ---------------------------------------------------------------------------
export function sniffType(buf) {
  if (!buf || buf.length < 12) return null
  const b = buf
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'           // %PDF
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg'                             // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png'            // PNG
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp' // RIFF....WEBP
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'heic'           // ....ftyp (HEIF/HEIC)
  return null
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------
function tmpWrite(buf, ext) {
  const fp = path.join(os.tmpdir(), `ak_${uuidv4()}.${ext}`)
  fs.writeFileSync(fp, buf)
  return fp
}
export function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`fetch ${r.statusCode}`)) }
      const chunks = []
      r.on('data', (c) => chunks.push(c))
      r.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

// Convert a non-JPEG/PNG image (webp/heic) to a JPEG buffer using Cloudinary
// (no sharp, no system package). pdf-lib can only embed JPG/PNG natively.
async function imageToEmbeddableJpg(buf) {
  if (!cloudinaryEnabled()) throw new Error('Cloudinary not configured')
  const fp = tmpWrite(buf, 'img')
  let pub = null
  try {
    const res = await new Promise((resolve, reject) => cloudinary.uploader.upload(fp, {
      folder: 'lg-answer-key/tmp', resource_type: 'image', type: 'authenticated', unique_filename: true, use_filename: true, overwrite: false,
    }, (e, r) => e ? reject(e) : resolve(r)))
    pub = res.public_id
    const jpgUrl = cloudinary.url(pub, { resource_type: 'image', type: 'authenticated', sign_url: true, secure: true, format: 'jpg', transformation: [{ width: 1600, crop: 'limit' }, { quality: 'auto:good' }] })
    return await fetchBuffer(jpgUrl)
  } finally {
    try { fs.unlinkSync(fp) } catch (_) {}
    if (pub) await deleteAssessAsset(pub, 'image').catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Combine an array of { buf, type } images (in order) into ONE PDF (pdf-lib).
// Returns a Buffer. Each image becomes a page sized to the image.
// ---------------------------------------------------------------------------
export async function combineImagesToPdf(images) {
  const pdf = await PDFDocument.create()
  for (const img of images) {
    let embedBuf = img.buf
    let kind = img.type
    if (kind === 'webp' || kind === 'heic') { embedBuf = await imageToEmbeddableJpg(img.buf); kind = 'jpg' }
    let embedded
    if (kind === 'png') embedded = await pdf.embedPng(embedBuf)
    else embedded = await pdf.embedJpg(embedBuf) // jpg (and converted webp/heic)
    const page = pdf.addPage([embedded.width, embedded.height])
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
  }
  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

export async function pdfPageCount(buf) {
  try { const doc = await PDFDocument.load(buf, { ignoreEncryption: true }); return doc.getPageCount() } catch (_) { return 1 }
}

// ---------------------------------------------------------------------------
// Private storage — upload a PDF buffer as Cloudinary 'authenticated'.
// Returns a fileRef: { publicId, resourceType, deliveryType, version, pages, bytes }
// ---------------------------------------------------------------------------
export async function storePrivatePdf(buf, { folder = 'lg-answer-key', tags = [], context = {} } = {}) {
  const { writePrivateToR2 } = await import('@/lib/media.js')
  if (writePrivateToR2()) {
    const { upload } = await import('@/lib/storage.js')
    const pages = await pdfPageCount(buf)
    const key = `${folder}/${uuidv4()}.pdf`
    await upload(buf, { key, visibility: 'private', contentType: 'application/pdf' })
    return { backend: 'r2', key, publicId: key, resourceType: 'raw', format: 'pdf', pages, bytes: buf.length }
  }
  const fp = tmpWrite(buf, 'pdf')
  try {
    const res = await uploadAssessAssetFromPath({ filePath: fp, kind: 'pdf', folder, tags: ['answer-key', ...tags], context })
    return res
  } finally { try { fs.unlinkSync(fp) } catch (_) {} }
}

// Stream (fetch server-side) the bytes of a private PDF fileRef — R2-first,
// Cloudinary as a counted fallback (see lib/private-read.js).
export async function fetchPrivatePdfBytes(fileRef) {
  const { getPrivateBytesPreferR2 } = await import('@/lib/private-read.js')
  return await getPrivateBytesPreferR2(fileRef, async () => {
    if (!fileRef?.publicId) throw new Error('no fileRef')
    const url = signedAssessDownloadUrl(fileRef.publicId, { resourceType: fileRef.resourceType || 'image', format: fileRef.format || 'pdf', expiresInSeconds: 120 })
    return await fetchBuffer(url)
  })
}

export async function deletePrivateRef(fileRef) {
  if (fileRef?.backend === 'r2' && fileRef.key) {
    const { deleteObject } = await import('@/lib/storage.js')
    await deleteObject(fileRef.key, { visibility: 'private' }).catch(() => {})
    return
  }
  if (!fileRef?.publicId) return
  await deleteAssessAsset(fileRef.publicId, fileRef.resourceType || 'image').catch(() => {})
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
export async function checkSubmitLimits(db, ownerId, settings) {
  const unpaidStatuses = ['submitted', 'in_progress', 'ready_locked']
  const openCount = await db.collection(AK_COLL.requests).countDocuments({ ownerId, status: { $in: unpaidStatuses } })
  if (openCount >= (settings.maxUnpaidConcurrent || 2)) {
    return { ok: false, code: 'TOO_MANY_OPEN', message: `ଆପଣଙ୍କର ${openCount}ଟି ଅନୁରୋଧ ପ୍ରକ୍ରିୟାରେ ଅଛି / You already have ${openCount} open request(s). Please unlock or wait before submitting more.` }
  }
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000)
  const todayCount = await db.collection(AK_COLL.requests).countDocuments({ ownerId, submittedAt: { $gte: dayAgo } })
  if (todayCount >= (settings.maxPerDay || 5)) {
    return { ok: false, code: 'DAILY_LIMIT', message: `ଦୈନିକ ସୀମା ଶେଷ / Daily limit reached (${settings.maxPerDay}). Please try again tomorrow.` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// SLA alert — find PREPAID requests still not delivered that are within
// `hoursBefore` of (or already past) their turnaround deadline, and have not
// been alerted yet. "Prepaid & pending" = bundle-sourced requests whose answer
// key has not been uploaded (status submitted / in_progress). These teachers
// have already paid (via the bundle) so a delay is a priority.
// ---------------------------------------------------------------------------
export async function findSlaBreaches(db, settings) {
  const turnaroundMs = (Number(settings.turnaroundHours) || 24) * 3600 * 1000
  const beforeMs = (Number(settings.slaAlertHoursBefore) || 4) * 3600 * 1000
  const now = Date.now()
  const rows = await db.collection(AK_COLL.requests).find({
    unlockMethod: 'bundle',
    status: { $in: ['submitted', 'in_progress'] },
    slaAlertedAt: { $exists: false },
  }).toArray()
  const due = []
  for (const r of rows) {
    const submitted = new Date(r.submittedAt || r.updatedAt || now).getTime()
    const deadline = submitted + turnaroundMs
    if (now >= (deadline - beforeMs)) due.push({ ...r, _deadline: new Date(deadline) })
  }
  return due
}

export async function markSlaAlerted(db, ids) {
  if (!ids?.length) return 0
  const res = await db.collection(AK_COLL.requests).updateMany(
    { id: { $in: ids } }, { $set: { slaAlertedAt: new Date() } },
  )
  return res.modifiedCount || 0
}


// Idempotent unlock — only flips a locked/ready request to 'unlocked'.
export async function markUnlocked(db, requestId, { method = 'razorpay', razorpayPaymentId = null } = {}) {
  const now = new Date()
  const res = await db.collection(AK_COLL.requests).findOneAndUpdate(
    { id: requestId, status: { $nin: ['unlocked', 'refunded', 'cancelled'] } },
    { $set: { status: 'unlocked', unlockMethod: method, razorpayPaymentId, unlockedAt: now, updatedAt: now } },
    { returnDocument: 'after' },
  )
  return (res && res.value) || null
}

// Public-safe view of a request (NEVER leak file refs / answers while locked).
export function publicView(req, { unlocked = false } = {}) {
  const base = {
    id: req.id,
    class: req.class || '',
    subject: req.subject || '',
    examName: req.examName || '',
    language: req.language || '',
    status: req.status,
    priceTier: req.priceTier || null,
    priceInr: req.priceInr || null,
    questionPageCount: req.questionPageCount || null,
    answerPageCount: req.answerPageCount || null,
    answerVersion: req.answerVersion || 0,
    rejectReason: req.status === 'rejected' ? (req.rejectReason || null) : null,
    hasPreview: !!req.previewImageRef,
    unlocked: req.status === 'unlocked',
    downloadCount: req.downloadCount || 0,
    submittedAt: req.submittedAt,
    readyAt: req.readyAt || null,
    unlockedAt: req.unlockedAt || null,
    updatedAt: req.updatedAt,
  }
  return base
}
