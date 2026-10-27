// ============================================================================
//  Cloudinary client + image upload helpers.
//  Server-side ONLY — never expose the API secret to the browser.
// ============================================================================
import { v2 as cloudinary } from 'cloudinary'
import { uploadPublicImage, uploadCoverImageR2, uploadOgImageR2, writePublicToR2 } from '@/lib/media.js'

let _configured = false
function configureOnce() {
  if (_configured) return
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  _configured = true
}

export function cloudinaryEnabled() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

// Ensure the shared Cloudinary v2 singleton is configured (safe to call often).
export function configureCloudinary() { configureOnce() }

// Upload a Data URI or remote URL to Cloudinary. Returns:
//   { url, publicId, width, height, format, bytes }
// f_auto + q_auto delivery URL is applied via `cloudinary.url()`.
export async function uploadToCloudinary({ dataUri, folder = 'lg-edu-library', publicId, tags = [], context = {} }) {
  // New public image writes → Cloudflare R2 (sized once with sharp). Old items
  // keep their stored Cloudinary URLs, so reads of existing data are unaffected.
  if (writePublicToR2()) {
    const r = await uploadPublicImage({ source: dataUri, folder, publicId })
    return { url: r.url, rawUrl: r.rawUrl, publicId: r.publicId, key: r.key, width: r.width, height: r.height, format: r.format, bytes: r.bytes, backend: 'r2' }
  }
  if (!cloudinaryEnabled()) throw new Error('Cloudinary is not configured')
  configureOnce()
  const uploadRes = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId, // if omitted, Cloudinary generates a random id
    tags,
    context,
    resource_type: 'image',
    overwrite: false,
    unique_filename: true,
  })
  const optimizedUrl = cloudinary.url(uploadRes.public_id, {
    fetch_format: 'auto',
    quality: 'auto',
    secure: true,
  })
  return {
    url: optimizedUrl,
    rawUrl: uploadRes.secure_url,
    publicId: uploadRes.public_id,
    width: uploadRes.width,
    height: uploadRes.height,
    format: uploadRes.format,
    bytes: uploadRes.bytes,
  }
}

// Upload a store product COVER image (PUBLIC — covers contain no paid content).
// Deterministic public_id so a "regenerate" overwrites the previous cover.
// Returns { url, thumbUrl, publicId, width, height, bytes, version }.
export async function uploadCoverImage({ buffer, publicId, folder = 'lg-store/covers', tags = [], mime = 'image/webp', og = false }) {
  // New public covers → R2 (full webp + pre-made 400x500 thumbnail via sharp).
  // OG/share images → JPG 1200x630 (not webp).
  if (writePublicToR2()) {
    if (og) {
      const r = await uploadOgImageR2({ buffer, publicId, folder: 'lg-store/og' })
      return { url: r.url, thumbUrl: r.url, publicId: r.publicId, key: r.key, width: r.width, height: r.height, bytes: r.bytes, version: r.version, backend: 'r2' }
    }
    const r = await uploadCoverImageR2({ buffer, publicId, folder, mime })
    return { url: r.url, thumbUrl: r.thumbUrl, publicId: r.publicId, key: r.key, width: r.width, height: r.height, bytes: r.bytes, version: r.version, backend: 'r2' }
  }
  if (!cloudinaryEnabled()) throw new Error('Cloudinary is not configured')
  configureOnce()
  const dataUri = `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`
  const res = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    tags: ['lg-store', 'cover', ...tags],
    resource_type: 'image',
    overwrite: true,
    invalidate: true,
    unique_filename: false,
    use_filename: false,
  })
  const url = cloudinary.url(res.public_id, { quality: 'auto', fetch_format: 'auto', secure: true, version: res.version })
  const thumbUrl = cloudinary.url(res.public_id, { width: 400, height: 500, crop: 'fill', quality: 'auto', fetch_format: 'auto', secure: true, version: res.version })
  return { url, thumbUrl, publicId: res.public_id, width: res.width, height: res.height, bytes: res.bytes, version: res.version }
}

// Upload a PDF (Data URI: data:application/pdf;base64,...) to Cloudinary.
// Cloudinary treats PDFs as `image` resource_type (multi-page), which lets
// us generate a thumbnail image of page 1 via URL transformation.
// Returns: { url, publicId, pages, bytes, thumbnailUrl }
export async function uploadPdfToCloudinary({ dataUri, folder = 'lg-official-papers', publicId, tags = [], context = {} }) {
  if (!cloudinaryEnabled()) throw new Error('Cloudinary is not configured')
  configureOnce()
  const uploadRes = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: publicId,
    tags,
    context,
    resource_type: 'image', // treat PDF as multi-page image
    format: 'pdf',
    overwrite: false,
    unique_filename: true,
    pages: true,            // return page count
  })
  // Cover thumbnail = first page rendered as jpg
  const thumbnailUrl = cloudinary.url(uploadRes.public_id, {
    resource_type: 'image',
    format: 'jpg',
    page: 1,
    width: 400,
    crop: 'fit',
    quality: 'auto',
    fetch_format: 'auto',
    secure: true,
  })
  return {
    url: uploadRes.secure_url,          // direct PDF URL
    publicId: uploadRes.public_id,
    pages: uploadRes.pages || 1,
    bytes: uploadRes.bytes,
    format: uploadRes.format || 'pdf',
    thumbnailUrl,
  }
}

// Generate a signed, time-limited PDF download URL that bypasses Cloudinary's
// "PDF and ZIP files delivery" security restriction. Uses the Admin API
// `image/download` endpoint (authenticates via api_key + signature) so the PDF
// streams back with HTTP 200 and Content-Type: application/pdf, suitable for
// embedding in <iframe> for inline browser viewing.
// `expiresInSeconds` controls how long the signed link remains valid.
export function signedPdfDownloadUrl(publicId, { expiresInSeconds = 3600 } = {}) {
  if (!publicId) return null
  configureOnce()
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds)
  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    resource_type: 'image',
    type: 'upload',
    expires_at: expiresAt,
  })
}

// Optional destructive delete. Pass resourceType='image' for images or PDFs
// (Cloudinary treats PDFs as image resource_type).
export async function deleteFromCloudinary(publicId, resourceType = 'image') {
  if (!cloudinaryEnabled() || !publicId) return { ok: false }
  configureOnce()
  try {
    const r = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType })
    return { ok: r.result === 'ok' || r.result === 'not found', result: r.result }
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

// Generate a Cloudinary URL with a LessonGuruOdisha.com watermark overlay
// (bottom-right + top-right). Uses signed URL because text overlays require
// account authorization for security.
export function watermarkedPdfUrl(publicId) {
  if (!publicId) return null
  configureOnce()
  return cloudinary.url(publicId, {
    resource_type: 'image',
    format: 'pdf',
    secure: true,
    sign_url: true,
    type: 'upload',
    transformation: [
      {
        overlay: { font_family: 'Arial', font_size: 36, font_weight: 'bold', text: 'LessonGuruOdisha.com' },
        color: '#1e40af',
        opacity: 25,
        gravity: 'south_east',
        x: 40, y: 40,
      },
      {
        overlay: { font_family: 'Arial', font_size: 28, font_weight: 'bold', text: '%C2%A9 LessonGuru Odisha' },
        color: '#64748b',
        opacity: 20,
        gravity: 'north_east',
        x: 40, y: 40,
      },
    ],
  })
}

// ============================================================================
//  🛒 ASSESSMENT STORE asset helpers (Prompt 2, additive).
//  Master files are uploaded as type:'authenticated' so they are NOT publicly
//  deliverable. PDFs use resource_type:'image' (multi-page), ZIPs use 'raw'.
//  Large files are supported via upload_large from a temp file path.
// ============================================================================

// Upload an already-assembled local file (path) to Cloudinary as an
// authenticated asset. kind = 'pdf' | 'zip'. Returns metadata for storage.
export async function uploadAssessAssetFromPath({ filePath, kind = 'pdf', folder, tags = [], context = {} }) {
  if (!cloudinaryEnabled()) throw new Error('Cloudinary is not configured')
  configureOnce()
  const isPdf = kind === 'pdf'
  const opts = {
    folder: folder || (isPdf ? 'lg-assess/pdf' : 'lg-assess/zip'),
    resource_type: isPdf ? 'image' : 'raw',
    type: 'authenticated',
    tags: ['lg-assess', kind, ...tags],
    context,
    overwrite: false,
    unique_filename: true,
    use_filename: true,
    ...(isPdf ? { format: 'pdf', pages: true } : {}),
  }
  // upload_large handles big files via chunked transfer to Cloudinary.
  const res = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(filePath, opts, (err, result) => {
      if (err) return reject(err)
      resolve(result)
    })
  })
  return {
    publicId: res.public_id,
    resourceType: res.resource_type,     // 'image' (pdf) | 'raw' (zip)
    deliveryType: res.type,              // 'authenticated'
    version: res.version,
    bytes: res.bytes,
    format: res.format || (isPdf ? 'pdf' : 'zip'),
    pages: res.pages || (isPdf ? 1 : 0),
  }
}

// Signed thumbnail (page 1) for an authenticated PDF — admin preview only.
export function assessPdfThumbUrl(publicId, { version } = {}) {
  if (!publicId) return null
  configureOnce()
  return cloudinary.url(publicId, {
    resource_type: 'image', type: 'authenticated', sign_url: true, secure: true,
    format: 'jpg', version, page: 1, width: 400, crop: 'fit', quality: 'auto',
  })
}

// Signed, time-limited download URL for an authenticated master asset.
export function signedAssessDownloadUrl(publicId, { resourceType = 'image', format = 'pdf', expiresInSeconds = 3600 } = {}) {
  if (!publicId) return null
  configureOnce()
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, expiresInSeconds)
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType, type: 'authenticated', expires_at: expiresAt,
  })
}

// Delete an authenticated assess asset.
export async function deleteAssessAsset(publicId, resourceType = 'image') {
  if (!cloudinaryEnabled() || !publicId) return { ok: false }
  configureOnce()
  try {
    const r = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated' })
    return { ok: r.result === 'ok' || r.result === 'not found', result: r.result }
  } catch (e) {
    return { ok: false, error: e?.message }
  }
}

// ============================================================================
//  🔐 ASSESSMENT STORE — Prompt 4 secure delivery helpers.
//  Personalised watermark + per-page secure images for authenticated PDFs.
// ============================================================================
const _wmSafe = (s) => String(s || '').replace(/\*/g, 'x').replace(/[,/\\%#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)

// Signed, personalised watermarked PDF URL (authenticated master).
// `lines` = { footer, diagonal }. Falls back to null on failure (caller handles).
export function watermarkedAssessPdfUrl(publicId, { version, footer = '', diagonal = '' } = {}) {
  if (!publicId) return null
  configureOnce()
  try {
    return cloudinary.url(publicId, {
      resource_type: 'image', type: 'authenticated', format: 'pdf',
      secure: true, sign_url: true, version,
      transformation: [
        // Faint tiled diagonal trace across every page.
        diagonal ? {
          overlay: { font_family: 'Arial', font_size: 34, font_weight: 'bold', text: _wmSafe(diagonal) },
          color: '#3b82f6', opacity: 10, angle: 40, flags: 'tiled',
        } : null,
        // Solid footer line with buyer identity.
        footer ? {
          overlay: { font_family: 'Arial', font_size: 20, font_weight: 'bold', text: _wmSafe(footer) },
          color: '#1e3a8a', opacity: 40, gravity: 'south', y: 22,
        } : null,
      ].filter(Boolean),
    })
  } catch (_) { return null }
}

// Signed per-page JPG for the secure in-browser viewer (no raw file link).
export function assessPageImageUrl(publicId, { version, page = 1, watermark = '' } = {}) {
  if (!publicId) return null
  configureOnce()
  try {
    return cloudinary.url(publicId, {
      resource_type: 'image', type: 'authenticated', format: 'jpg',
      secure: true, sign_url: true, version, page,
      transformation: [
        { width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
        watermark ? {
          overlay: { font_family: 'Arial', font_size: 30, font_weight: 'bold', text: _wmSafe(watermark) },
          color: '#3b82f6', opacity: 12, angle: 40, flags: 'tiled',
        } : null,
      ].filter(Boolean),
    })
  } catch (_) { return null }
}

// ============================================================================
//  ⬆️ ASSESSMENT STORE — direct signed chunked upload + ZIP extraction (fix).
// ============================================================================
export function assessCloudName() { configureOnce(); return process.env.CLOUDINARY_CLOUD_NAME }
export function assessApiKey() { return process.env.CLOUDINARY_API_KEY }

// Sign the exact params the browser will send to Cloudinary's upload API.
// Never expose the api_secret. paramsToSign must match what the client posts
// (excluding file, api_key, resource_type, cloud_name).
export function signAssessUpload(paramsToSign) {
  configureOnce()
  const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET)
  return signature
}

// Verify an authenticated asset exists (called from upload-complete).
export async function verifyAssessAsset(publicId, resourceType = 'image') {
  if (!cloudinaryEnabled() || !publicId) return null
  configureOnce()
  try {
    const r = await cloudinary.api.resource(publicId, { resource_type: resourceType, type: 'authenticated' })
    return { publicId: r.public_id, version: r.version, bytes: r.bytes, format: r.format, pages: r.pages || 0, resourceType: r.resource_type }
  } catch (_) { return null }
}

// Server-side signed URL to download a raw authenticated asset (for ZIP extract).
export function signedRawAssetUrl(publicId, { expiresInSeconds = 1800, format = 'zip' } = {}) {
  configureOnce()
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
  return cloudinary.utils.private_download_url(publicId, format, { resource_type: 'raw', type: 'authenticated', expires_at: expiresAt })
}

// Upload a Buffer (an extracted PDF) as an authenticated image asset.
export async function uploadBufferAssessAsset(buffer, { folder, publicId, tags = [] }) {
  configureOnce()
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: 'image', type: 'authenticated', format: 'pdf', pages: true, overwrite: true, tags: ['lg-assess', 'pdf', ...tags] },
      (err, result) => err ? reject(err) : resolve({ publicId: result.public_id, version: result.version, bytes: result.bytes, pages: result.pages || 1, resourceType: result.resource_type, format: result.format }),
    )
    stream.end(buffer)
  })
}

// Delete a raw asset (uploaded ZIP) after successful extraction.
export async function deleteRawAssessAsset(publicId) {
  if (!cloudinaryEnabled() || !publicId) return { ok: false }
  configureOnce()
  try { const r = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw', type: 'authenticated' }); return { ok: r.result === 'ok' } }
  catch (e) { return { ok: false, error: e?.message } }
}
