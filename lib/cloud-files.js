// ============================================================================
//  Cloud Library — per-teacher cloud storage for PDFs and documents.
//
//  Metadata lives in MongoDB (`cloudFiles`). Bytes live in the PRIVATE R2
//  bucket (lib/storage.js) when it is configured; otherwise they are chunked
//  into MongoDB (`cloudFileChunks`, 1 MB per document) so the feature works on
//  any environment. Bytes are never exposed by URL: downloads stream through
//  our API, authorised by the user's JWT or a short-lived signed link.
//
//  Env (all optional):
//    CLOUD_FILES_BACKEND   'auto' (default) | 'r2' | 'db'
//    CLOUD_LINK_SECRET     HMAC secret for signed links (falls back to JWT_SECRET)
//  Admin-tunable via settings { key: 'cloud_files', value: { freeMb, premiumMb, maxFileMb, enabled } }
// ============================================================================
import crypto from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { getUser } from '@/lib/auth'
import * as Storage from '@/lib/storage'

export const FILES = 'cloudFiles'
export const CHUNKS = 'cloudFileChunks'
const CHUNK_BYTES = 1024 * 1024
const MB = 1024 * 1024

export const DEFAULTS = { freeMb: 100, premiumMb: 2048, maxFileMb: 25, enabled: true }
const OPEN_LINK_SECONDS = 15 * 60
const MAX_SHARE_HOURS = 24 * 7
const UPLOADS_PER_HOUR = 60

export class CloudError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

// ---------------------------------------------------------------------------
//  Setup
// ---------------------------------------------------------------------------
const g = global.__lgCloud || (global.__lgCloud = { indexed: false, uploads: new Map() })

export async function ensureIndexes(d) {
  if (g.indexed) return
  g.indexed = true
  try {
    await d.collection(FILES).createIndex({ id: 1 }, { unique: true })
    await d.collection(FILES).createIndex({ userId: 1, createdAt: -1 })
    await d.collection(FILES).createIndex({ userId: 1, sha256: 1 })
    await d.collection(CHUNKS).createIndex({ fileId: 1, n: 1 }, { unique: true })
  } catch (e) {
    g.indexed = false
    console.error('[cloud] index creation failed:', e?.message)
  }
}

export async function getConfig(d) {
  const doc = await d.collection('settings').findOne({ key: 'cloud_files' })
  const v = (doc && doc.value) || {}
  const num = (x, dflt) => (Number.isFinite(+x) && +x > 0 ? +x : dflt)
  return {
    freeMb: num(v.freeMb, DEFAULTS.freeMb),
    premiumMb: num(v.premiumMb, DEFAULTS.premiumMb),
    maxFileMb: num(v.maxFileMb, DEFAULTS.maxFileMb),
    enabled: v.enabled !== false,
  }
}

export function backend() {
  const want = String(process.env.CLOUD_FILES_BACKEND || 'auto').toLowerCase()
  if (want === 'db') return 'db'
  if (want === 'r2') {
    if (!Storage.r2Enabled()) throw new CloudError('STORAGE_UNAVAILABLE', 'Cloud storage is not configured', 503)
    return 'r2'
  }
  return Storage.r2Enabled() ? 'r2' : 'db'
}

// ---------------------------------------------------------------------------
//  Auth — same rules as the main API (single-device session enforcement)
// ---------------------------------------------------------------------------
export function isPremium(user) {
  const s = (user && user.subscription) || {}
  return s.status === 'active' && !!s.expiryDate && new Date(s.expiryDate) > new Date()
}

export async function resolveUser(request, d) {
  const tokenUser = getUser(request)
  if (!tokenUser || !tokenUser.id) throw new CloudError('UNAUTHORIZED', 'Please login to use your Cloud Library', 401)
  const me = await d.collection('users').findOne({ id: tokenUser.id })
  if (!me) throw new CloudError('UNAUTHORIZED', 'Account not found', 401)
  if ((me.activeSessionId && tokenUser.sessionId !== me.activeSessionId) || (!tokenUser.sessionId && me.lastLoginAt)) {
    throw new CloudError('SESSION_REPLACED', 'You signed in on another device. Please login again.', 401)
  }
  return me
}

// ---------------------------------------------------------------------------
//  File type detection (by content, never by the client's claim)
// ---------------------------------------------------------------------------
const OFFICE = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export function sniffType(buf, name = '') {
  const head = buf.subarray(0, 8)
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf', kind: 'pdf' }
  if (head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG') return { ext: 'png', mime: 'image/png', kind: 'image' }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg', kind: 'image' }
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    const ext = (String(name).toLowerCase().match(/\.(docx|xlsx|pptx)$/) || [])[1]
    if (ext) return { ext, mime: OFFICE[ext], kind: 'doc' }
    return { ext: 'zip', mime: 'application/zip', kind: 'doc' }
  }
  return null
}

export function cleanName(name, ext) {
  let n = String(name || '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  n = n.replace(/\.[A-Za-z0-9]{1,5}$/, '') // drop whatever extension the client claimed
  if (!n || /^\.+$/.test(n)) n = 'LessonGuru-' + new Date().toISOString().slice(0, 10)
  if (n.length > 140) n = n.slice(0, 140).trim()
  return `${n}.${ext}`
}

export function publicFile(f) {
  if (!f) return null
  return {
    id: f.id, name: f.name, ext: f.ext, mime: f.mime, kind: f.kind, bytes: f.bytes,
    source: f.source || 'upload', sourcePath: f.sourcePath || null,
    starred: !!f.starred, tags: f.tags || [],
    createdAt: f.createdAt, updatedAt: f.updatedAt,
    lastOpenedAt: f.lastOpenedAt || null, openCount: f.openCount || 0,
  }
}

// ---------------------------------------------------------------------------
//  Usage & quota
// ---------------------------------------------------------------------------
export async function usage(d, user) {
  const cfg = await getConfig(d)
  const rows = await d.collection(FILES).aggregate([
    { $match: { userId: user.id } },
    { $group: { _id: null, bytes: { $sum: '$bytes' }, count: { $sum: 1 } } },
  ]).toArray()
  const premium = isPremium(user)
  return {
    bytes: rows[0]?.bytes || 0,
    count: rows[0]?.count || 0,
    quotaBytes: (premium ? cfg.premiumMb : cfg.freeMb) * MB,
    maxFileBytes: cfg.maxFileMb * MB,
    plan: premium ? 'premium' : 'free',
    upgradeQuotaBytes: premium ? null : cfg.premiumMb * MB,
  }
}

function rateLimit(userId) {
  const now = Date.now()
  const arr = (g.uploads.get(userId) || []).filter(t => now - t < 3600e3)
  if (arr.length >= UPLOADS_PER_HOUR) throw new CloudError('RATE_LIMITED', 'Too many uploads — please try again in a while', 429)
  arr.push(now)
  g.uploads.set(userId, arr)
}

// ---------------------------------------------------------------------------
//  Blob storage
// ---------------------------------------------------------------------------
async function putBlob(d, file, buffer) {
  if (file.storage === 'r2') {
    await Storage.upload(buffer, { key: file.key, visibility: 'private', contentType: file.mime })
    return
  }
  const docs = []
  for (let i = 0, n = 0; i < buffer.length; i += CHUNK_BYTES, n++) {
    docs.push({ fileId: file.id, n, data: buffer.subarray(i, i + CHUNK_BYTES) })
  }
  if (docs.length) await d.collection(CHUNKS).insertMany(docs, { ordered: true })
}

async function deleteBlob(d, file) {
  if (file.storage === 'r2') await Storage.deleteObject(file.key, { visibility: 'private' })
  else await d.collection(CHUNKS).deleteMany({ fileId: file.id })
}

// Chunks come back from the driver as BSON Binary (its .buffer may be over-allocated).
function toBuffer(b) {
  if (Buffer.isBuffer(b)) return b
  if (b instanceof Uint8Array) return Buffer.from(b.buffer, b.byteOffset, b.byteLength)
  if (b && b.buffer) return Buffer.from(typeof b.position === 'number' ? b.buffer.subarray(0, b.position) : b.buffer)
  throw new Error('Unreadable chunk')
}

/** @returns {Promise<{ body: ReadableStream|Buffer|any, contentType: string, contentLength?: number } | null>} */
export async function readBlob(d, file) {
  if (file.storage === 'r2') {
    const r = await Storage.getPrivateFileBytes(file.key, { visibility: 'private' })
    if (!r) return null
    return { body: r.body, contentType: file.mime, contentLength: r.contentLength || file.bytes }
  }
  const chunks = await d.collection(CHUNKS).find({ fileId: file.id }).sort({ n: 1 }).toArray()
  if (!chunks.length && file.bytes > 0) return null
  const buffer = Buffer.concat(chunks.map(c => toBuffer(c.data)))
  return { body: buffer, contentType: file.mime, contentLength: buffer.length }
}

// ---------------------------------------------------------------------------
//  CRUD
// ---------------------------------------------------------------------------
const SOURCES = new Set(['app-auto', 'app-upload', 'web', 'upload'])

export async function saveFile(d, user, { buffer, name, source, sourcePath }) {
  await ensureIndexes(d)
  const cfg = await getConfig(d)
  if (!cfg.enabled) throw new CloudError('DISABLED', 'Cloud Library is temporarily unavailable', 503)
  if (!buffer || !buffer.length) throw new CloudError('EMPTY_FILE', 'The file is empty')
  if (buffer.length > cfg.maxFileMb * MB) {
    throw new CloudError('FILE_TOO_LARGE', `Files up to ${cfg.maxFileMb} MB can be saved to the cloud`, 413)
  }
  const type = sniffType(buffer, name)
  if (!type) throw new CloudError('UNSUPPORTED_TYPE', 'Only PDF, Word, Excel, PowerPoint, ZIP, PNG and JPG files can be saved', 415)

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  const col = d.collection(FILES)
  const existing = await col.findOne({ userId: user.id, sha256 })
  if (existing) {
    // Same bytes already in this teacher's library — don't store twice.
    await col.updateOne({ id: existing.id }, { $set: { updatedAt: new Date() } })
    return { file: publicFile({ ...existing, updatedAt: new Date() }), duplicate: true }
  }

  const u = await usage(d, user)
  if (u.bytes + buffer.length > u.quotaBytes) {
    throw new CloudError('QUOTA_EXCEEDED', u.plan === 'premium'
      ? 'Your cloud storage is full. Delete some files to save new ones.'
      : 'Your free cloud storage is full. Upgrade to Premium for more space, or delete some files.', 413)
  }
  rateLimit(user.id)

  const id = uuidv4()
  const storage = backend()
  const now = new Date()
  const file = {
    id, userId: user.id,
    name: cleanName(name, type.ext), ext: type.ext, mime: type.mime, kind: type.kind,
    bytes: buffer.length, sha256,
    storage, key: storage === 'r2' ? `cloud/${user.id}/${id}.${type.ext}` : null,
    source: SOURCES.has(source) ? source : 'upload',
    sourcePath: typeof sourcePath === 'string' && sourcePath.startsWith('/') ? sourcePath.slice(0, 300) : null,
    starred: false, tags: [], linkVersion: 1, openCount: 0,
    createdAt: now, updatedAt: now,
  }
  await putBlob(d, file, buffer)
  try {
    await col.insertOne(file)
  } catch (e) {
    await deleteBlob(d, file).catch(() => {})
    throw e
  }
  return { file: publicFile(file), duplicate: false }
}

function escapeRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

export async function listFiles(d, user, { q, kind, starred, sort, limit, skip } = {}) {
  await ensureIndexes(d)
  const filter = { userId: user.id }
  if (q && String(q).trim()) filter.name = { $regex: escapeRegex(String(q).trim().slice(0, 80)), $options: 'i' }
  if (['pdf', 'image', 'doc'].includes(kind)) filter.kind = kind
  if (starred === true || starred === 'true' || starred === '1') filter.starred = true
  const sorts = { new: { createdAt: -1 }, old: { createdAt: 1 }, name: { name: 1 }, size: { bytes: -1 } }
  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100)
  const sk = Math.max(parseInt(skip, 10) || 0, 0)
  const col = d.collection(FILES)
  const [rows, total] = await Promise.all([
    col.find(filter).sort(sorts[sort] || sorts.new).skip(sk).limit(lim).toArray(),
    col.countDocuments(filter),
  ])
  return { files: rows.map(publicFile), total, skip: sk, limit: lim }
}

export async function getOwnedFile(d, user, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new CloudError('NOT_FOUND', 'File not found', 404)
  const f = await d.collection(FILES).findOne({ id, userId: user.id })
  if (!f) throw new CloudError('NOT_FOUND', 'File not found', 404)
  return f
}

export async function updateFile(d, user, id, body = {}) {
  const f = await getOwnedFile(d, user, id)
  const set = {}
  if (typeof body.name === 'string' && body.name.trim()) set.name = cleanName(body.name, f.ext)
  if (typeof body.starred === 'boolean') set.starred = body.starred
  if (Array.isArray(body.tags)) {
    set.tags = [...new Set(body.tags.map(t => String(t).trim().slice(0, 30)).filter(Boolean))].slice(0, 10)
  }
  const inc = body.revokeLinks === true ? { linkVersion: 1 } : null
  if (!Object.keys(set).length && !inc) throw new CloudError('NOTHING_TO_UPDATE', 'Nothing to update')
  set.updatedAt = new Date()
  await d.collection(FILES).updateOne({ id: f.id }, { $set: set, ...(inc ? { $inc: inc } : {}) })
  return publicFile({ ...f, ...set })
}

export async function deleteFile(d, user, id) {
  const f = await getOwnedFile(d, user, id)
  await deleteBlob(d, f)
  await d.collection(FILES).deleteOne({ id: f.id })
  return { ok: true, id: f.id, bytes: f.bytes }
}

export async function markOpened(d, file) {
  await d.collection(FILES).updateOne({ id: file.id }, { $set: { lastOpenedAt: new Date() }, $inc: { openCount: 1 } })
}

// ---------------------------------------------------------------------------
//  Signed links  —  token = base64url(json).hmac
//  Bumping a file's linkVersion (PATCH revokeLinks) invalidates its links.
// ---------------------------------------------------------------------------
function linkKey() {
  const base = process.env.CLOUD_LINK_SECRET || process.env.JWT_SECRET || 'edumaster-default-secret'
  return crypto.createHmac('sha256', base).update('lg-cloud-link-v1').digest()
}
const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function signLink(file, { purpose = 'open', hours } = {}) {
  const ttl = purpose === 'share'
    ? Math.min(Math.max(Number(hours) || 72, 1), MAX_SHARE_HOURS) * 3600
    : OPEN_LINK_SECONDS
  const exp = Math.floor(Date.now() / 1000) + ttl
  const payload = b64url(JSON.stringify({ f: file.id, u: file.userId, v: file.linkVersion || 1, p: purpose === 'share' ? 's' : 'o', e: exp }))
  const sig = b64url(crypto.createHmac('sha256', linkKey()).update(payload).digest())
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000) }
}

export function verifyLink(token) {
  if (typeof token !== 'string' || token.length > 600) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const want = b64url(crypto.createHmac('sha256', linkKey()).update(payload).digest())
  const a = Buffer.from(sig), b = Buffer.from(want)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const p = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    if (!p || typeof p.f !== 'string' || p.e * 1000 < Date.now()) return null
    return p
  } catch (_) { return null }
}

export async function fileFromLink(d, token) {
  const p = verifyLink(token)
  if (!p) return null
  const f = await d.collection(FILES).findOne({ id: p.f, userId: p.u })
  if (!f || (f.linkVersion || 1) !== p.v) return null
  return f
}

// ---------------------------------------------------------------------------
//  HTTP helpers shared by the route handlers
// ---------------------------------------------------------------------------
export function contentDisposition(name, inline) {
  const ascii = String(name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

export function errorBody(e) {
  if (e instanceof CloudError) return { status: e.status, body: { error: e.message, code: e.code } }
  console.error('[cloud] unexpected error:', e?.stack || e?.message || e)
  return { status: 500, body: { error: 'Something went wrong. Please try again.', code: 'SERVER_ERROR' } }
}
