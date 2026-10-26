// ============================================================================
//  Object storage layer.  Server-side ONLY.
//
//  Two backends, auto-selected:
//    • 'gateway'  (preferred here) — talks to the Cloudflare Worker R2 gateway
//                 over HTTPS with a 60s HMAC signature. Used because this
//                 environment's firewall blocks the direct R2 S3 endpoint.
//    • 'direct'   — AWS SDK v3 straight to R2's S3 API (only works if the host
//                 *.r2.cloudflarestorage.com is allowlisted). Kept for an easy
//                 switch later.
//
//  Public surface (unchanged for callers):
//    r2Enabled(), upload(), getPublicUrl(), getPrivateFileBytes(),
//    getPrivateFileBuffer(), getPrivateDownloadUrl(), objectExists(),
//    deleteObject(), storageMode()
//
//  IMPORTANT: everything is lazy — importing must never throw while env is
//  unset. Call r2Enabled() before use.
// ============================================================================
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
//  Mode detection
// ---------------------------------------------------------------------------
const gatewayConfigured = () => !!(process.env.R2_GATEWAY_URL && process.env.R2_GATEWAY_SECRET)
const directConfigured = () => !!(
  process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY && process.env.R2_PUBLIC_BUCKET && process.env.R2_PRIVATE_BUCKET
)

export function storageMode() {
  if (gatewayConfigured()) return 'gateway'
  if (directConfigured()) return 'direct'
  return null
}

export function r2Enabled() {
  return storageMode() !== null
}

const publicBaseUrl = () => String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')

function safeKey(key) {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new Error('Invalid object key: ' + key)
  }
  return key
}

function encodeKey(key) {
  return safeKey(key).split('/').map(encodeURIComponent).join('/')
}

// Accept Buffer / Uint8Array / data-URI / raw base64 → { buffer, contentType }.
function parseInput(input, fallbackType = 'application/octet-stream') {
  if (Buffer.isBuffer(input)) return { buffer: input, contentType: fallbackType }
  if (input instanceof Uint8Array) return { buffer: Buffer.from(input), contentType: fallbackType }
  if (typeof input === 'string') {
    const m = input.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s)
    if (m) {
      const contentType = m[1] || fallbackType
      const buffer = input.includes(';base64,')
        ? Buffer.from(m[2], 'base64')
        : Buffer.from(decodeURIComponent(m[2]), 'utf8')
      return { buffer, contentType }
    }
    return { buffer: Buffer.from(input, 'base64'), contentType: fallbackType }
  }
  throw new TypeError('upload expects Buffer, Uint8Array, or (data) string')
}

const aliasFor = (visibility) => (visibility === 'public' ? 'public' : 'private')

// ============================================================================
//  GATEWAY backend
// ============================================================================
function gwBase() { return String(process.env.R2_GATEWAY_URL || '').replace(/\/$/, '') }

function gwSign(method, alias, key) {
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = crypto.createHmac('sha256', process.env.R2_GATEWAY_SECRET)
    .update(`${method}\n${alias}\n${key}\n${ts}`).digest('hex')
  return { 'x-lg-ts': ts, 'x-lg-sig': sig }
}

function gwUrl(alias, key) { return `${gwBase()}/${alias}/${encodeKey(key)}` }

async function gwPut(alias, key, buffer, { contentType, cacheControl } = {}) {
  const headers = { ...gwSign('PUT', alias, key), 'content-type': contentType || 'application/octet-stream' }
  if (cacheControl) headers['x-lg-cache'] = cacheControl
  const resp = await fetch(gwUrl(alias, key), { method: 'PUT', headers, body: buffer })
  if (!resp.ok) throw new Error(`gateway PUT ${resp.status}`)
  let meta = {}
  try { meta = await resp.json() } catch (_) {}
  return { key, bucket: alias, bytes: meta.size ?? buffer.length, etag: meta.etag || null }
}

async function gwGet(alias, key) {
  const resp = await fetch(gwUrl(alias, key), { method: 'GET', headers: gwSign('GET', alias, key) })
  if (resp.status === 404) return null
  if (!resp.ok) throw new Error(`gateway GET ${resp.status}`)
  return {
    body: resp.body, // web ReadableStream — fine for new Response(body)
    contentType: resp.headers.get('content-type') || 'application/octet-stream',
    contentLength: Number(resp.headers.get('content-length')) || undefined,
    _resp: resp,
  }
}

async function gwHead(alias, key) {
  const resp = await fetch(gwUrl(alias, key), { method: 'HEAD', headers: gwSign('HEAD', alias, key) })
  return resp.status === 200
}

async function gwDelete(alias, key) {
  const resp = await fetch(gwUrl(alias, key), { method: 'DELETE', headers: gwSign('DELETE', alias, key) })
  if (!resp.ok && resp.status !== 404) throw new Error(`gateway DELETE ${resp.status}`)
  return { ok: true }
}

// ============================================================================
//  DIRECT backend (AWS SDK) — lazy loaded
// ============================================================================
let _sdk = null
let _client = null
async function sdk() {
  if (_sdk) return _sdk
  _sdk = await import('@aws-sdk/client-s3')
  return _sdk
}
async function directClient() {
  if (_client) return _client
  const { S3Client } = await sdk()
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  })
  return _client
}
const directBucket = (alias) => (alias === 'public' ? process.env.R2_PUBLIC_BUCKET : process.env.R2_PRIVATE_BUCKET)

async function readWebStream(body) {
  const chunks = []
  for await (const chunk of body) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

// ============================================================================
//  PUBLIC API
// ============================================================================
export async function upload(input, { key, visibility = 'private', contentType, cacheControl, metadata = {} } = {}) {
  const objectKey = safeKey(key)
  const parsed = parseInput(input, contentType)
  const alias = aliasFor(visibility)
  const cc = cacheControl || (alias === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store')
  const mode = storageMode()
  if (mode === 'gateway') {
    return gwPut(alias, objectKey, parsed.buffer, { contentType: contentType || parsed.contentType, cacheControl: cc })
  }
  if (mode === 'direct') {
    const { PutObjectCommand } = await sdk()
    const client = await directClient()
    const r = await client.send(new PutObjectCommand({
      Bucket: directBucket(alias), Key: objectKey, Body: parsed.buffer,
      ContentType: contentType || parsed.contentType, CacheControl: cc, Metadata: metadata,
    }))
    return { key: objectKey, bucket: alias, bytes: parsed.buffer.length, etag: r.ETag }
  }
  throw new Error('R2 is not configured')
}

export function getPublicUrl(key) {
  const base = publicBaseUrl()
  if (!base) throw new Error('R2_PUBLIC_BASE_URL not set')
  return `${base}/${encodeKey(key)}`
}

// Stream private bytes. Returns { body, contentType, contentLength } or null (404).
// body is a web ReadableStream (gateway) or Node stream (direct) — both accepted
// by `new Response(body)`.
export async function getPrivateFileBytes(key, { visibility = 'private' } = {}) {
  const alias = aliasFor(visibility)
  const mode = storageMode()
  if (mode === 'gateway') return gwGet(alias, key)
  if (mode === 'direct') {
    const { GetObjectCommand } = await sdk()
    const client = await directClient()
    try {
      const r = await client.send(new GetObjectCommand({ Bucket: directBucket(alias), Key: safeKey(key) }))
      return { body: r.Body, contentType: r.ContentType, contentLength: r.ContentLength }
    } catch (e) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null
      throw e
    }
  }
  throw new Error('R2 is not configured')
}

export async function getPrivateFileBuffer(key, { visibility = 'private' } = {}) {
  const r = await getPrivateFileBytes(key, { visibility })
  if (!r) return null
  if (storageMode() === 'gateway') {
    const ab = await r._resp.arrayBuffer()
    return { buffer: Buffer.from(ab), contentType: r.contentType }
  }
  return { buffer: await readWebStream(r.body), contentType: r.contentType }
}

// Presigned direct URL — only meaningful in direct mode. In gateway mode private
// files are streamed through our server (use getPrivateFileBytes).
export async function getPrivateDownloadUrl(key, { expiresIn = 300, visibility = 'private' } = {}) {
  if (storageMode() !== 'direct') {
    throw new Error('Presigned URLs unavailable in gateway mode — stream via getPrivateFileBytes')
  }
  const { GetObjectCommand } = await sdk()
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
  const client = await directClient()
  return getSignedUrl(client, new GetObjectCommand({ Bucket: directBucket(aliasFor(visibility)), Key: safeKey(key) }), { expiresIn })
}

export async function objectExists(key, { visibility = 'private' } = {}) {
  const alias = aliasFor(visibility)
  const mode = storageMode()
  if (mode === 'gateway') return gwHead(alias, key)
  if (mode === 'direct') {
    const { HeadObjectCommand } = await sdk()
    const client = await directClient()
    try { await client.send(new HeadObjectCommand({ Bucket: directBucket(alias), Key: safeKey(key) })); return true }
    catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound' || e?.name === 'NoSuchKey') return false; throw e }
  }
  throw new Error('R2 is not configured')
}

export async function deleteObject(key, { visibility = 'private' } = {}) {
  const alias = aliasFor(visibility)
  const mode = storageMode()
  if (mode === 'gateway') return gwDelete(alias, key)
  if (mode === 'direct') {
    const { DeleteObjectCommand } = await sdk()
    const client = await directClient()
    await client.send(new DeleteObjectCommand({ Bucket: directBucket(alias), Key: safeKey(key) }))
    return { ok: true }
  }
  throw new Error('R2 is not configured')
}
