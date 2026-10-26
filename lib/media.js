// ============================================================================
//  lib/media.js — Public image derivative generation (sharp) → Cloudflare R2.
//  Server-side ONLY. Replaces Cloudinary on-the-fly transformations: we make
//  every needed size ONCE at upload time and store each as its own object.
//  Public objects are later served directly from the public R2 domain (r2.dev
//  or custom domain) with long immutable cache headers.
// ============================================================================
import crypto from 'node:crypto'
import sharp from 'sharp'
import { upload, getPublicUrl, storageMode } from '@/lib/storage.js'

// New public image writes go to R2 only when explicitly enabled AND configured.
export function writePublicToR2() {
  return process.env.STORAGE_WRITE === 'r2' && storageMode() !== null
}

async function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input
  if (input instanceof Uint8Array) return Buffer.from(input)
  if (typeof input === 'string') {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const r = await fetch(input)
      if (!r.ok) throw new Error('fetch source image failed ' + r.status)
      return Buffer.from(await r.arrayBuffer())
    }
    const m = input.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s)
    if (m) {
      return input.includes(';base64,')
        ? Buffer.from(m[2], 'base64')
        : Buffer.from(decodeURIComponent(m[2]), 'utf8')
    }
    return Buffer.from(input, 'base64')
  }
  throw new TypeError('Unsupported image input')
}

async function toWebp(buffer, { width, height, fit = 'cover', quality = 82 } = {}) {
  let img = sharp(buffer, { failOn: 'none' }).rotate()
  if (width || height) img = img.resize({ width, height, fit, withoutEnlargement: true })
  return img.webp({ quality }).toBuffer()
}

function shortHash(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 10)
}

// ---------------------------------------------------------------------------
//  uploadPublicImage — store an optimized main webp + optional sized variants.
//  Returns { url, rawUrl, key, publicId, width, height, format, bytes,
//            variants: { name: url }, version }
//  `url`/variant urls carry a ?v=<hash> for cache-busting on content change.
// ---------------------------------------------------------------------------
export async function uploadPublicImage({
  source, dataUri, buffer, folder = 'lg-edu-library', publicId,
  variants = [], quality = 82,
} = {}) {
  const src = await toBuffer(buffer || source || dataUri)
  const meta = await sharp(src, { failOn: 'none' }).metadata()
  const id = publicId || `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const baseKey = `${folder}/${id}`

  const mainBuf = await toWebp(src, { quality })
  const version = shortHash(mainBuf)
  const vq = `?v=${version}`
  const mainKey = `${baseKey}.webp`
  await upload(mainBuf, { key: mainKey, visibility: 'public', contentType: 'image/webp' })

  const out = {
    url: getPublicUrl(mainKey) + vq,
    rawUrl: getPublicUrl(mainKey) + vq,
    key: mainKey,
    publicId: id,
    width: meta.width || null,
    height: meta.height || null,
    format: 'webp',
    bytes: mainBuf.length,
    version,
    variants: {},
  }

  for (const v of variants) {
    const vb = await toWebp(src, { width: v.width, height: v.height, fit: v.fit || 'cover', quality: v.quality || quality })
    const vk = `${baseKey}_${v.name}.webp`
    await upload(vb, { key: vk, visibility: 'public', contentType: 'image/webp' })
    out.variants[v.name] = getPublicUrl(vk) + vq
  }

  return out
}

// Convenience for product covers: full card + a 400x500 thumbnail.
export async function uploadCoverImageR2({ buffer, publicId, folder = 'lg-store/covers', mime = 'image/webp' }) {
  const res = await uploadPublicImage({
    buffer, folder, publicId,
    variants: [{ name: 'thumb', width: 400, height: 500, fit: 'cover' }],
  })
  return {
    url: res.url,
    thumbUrl: res.variants.thumb || res.url,
    publicId: res.publicId,
    key: res.key,
    width: res.width,
    height: res.height,
    bytes: res.bytes,
    version: res.version,
  }
}

// OG / social-share image: MUST be JPG 1200x630 (webp OG support is unreliable
// on WhatsApp/Facebook). Generated once with sharp and stored as image/jpeg.
export async function uploadOgImageR2({ buffer, publicId, folder = 'lg-store/og' }) {
  const src = await toBuffer(buffer)
  const jpg = await sharp(src, { failOn: 'none' }).rotate()
    .resize({ width: 1200, height: 630, fit: 'cover' })
    .jpeg({ quality: 85 }).toBuffer()
  const version = shortHash(jpg)
  const key = `${folder}/${publicId || crypto.randomUUID()}.jpg`
  await upload(jpg, { key, visibility: 'public', contentType: 'image/jpeg' })
  return { url: getPublicUrl(key) + `?v=${version}`, key, publicId: publicId || key, width: 1200, height: 630, bytes: jpg.length, version }
}

// New private uploads (answer keys, paid PDFs) go to R2 under the same flag.
export const writePrivateToR2 = writePublicToR2
