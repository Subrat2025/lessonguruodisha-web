// === STORE === private file storage. PDFs reuse the Answer Key helpers
// (authenticated Cloudinary assets). Excel/HTML/ZIP use raw authenticated
// assets. The browser NEVER receives a Cloudinary URL; our server streams bytes.
import { v2 as cloudinary } from 'cloudinary'
import { cloudinaryEnabled } from '@/lib/cloudinary.js'
import { storePrivatePdf, fetchPrivatePdfBytes, deletePrivateRef, fetchBuffer, sniffType, pdfPageCount } from '@/lib/answer-key.js'

export { storePrivatePdf, fetchPrivatePdfBytes, deletePrivateRef, fetchBuffer, sniffType, pdfPageCount }

export const STORE_FOLDER = 'lg-store'

// Store a non-PDF buffer (xlsx/html/zip/etc) as a private asset.
// NEW writes go to the PRIVATE R2 bucket when STORAGE_WRITE=r2 (per-record,
// returns {backend:'r2',key,...}); otherwise Cloudinary RAW authenticated.
export async function storeRawFile(buffer, { folder = `${STORE_FOLDER}/raw`, format = 'bin', tags = [] } = {}) {
  const { writePrivateToR2 } = await import('@/lib/media.js')
  if (writePrivateToR2()) {
    const { upload } = await import('@/lib/storage.js')
    const crypto = await import('node:crypto')
    const key = `${folder}/${crypto.randomUUID()}.${format}`
    await upload(buffer, { key, visibility: 'private', contentType: _rawContentType(format), cacheControl: 'private, no-store' })
    return { backend: 'r2', key, publicId: key, resourceType: 'raw', deliveryType: 'r2-private', bytes: buffer.length, format }
  }
  if (!cloudinaryEnabled()) throw new Error('Cloudinary not configured')
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'raw', type: 'authenticated', format, overwrite: false, unique_filename: true, use_filename: true, tags: ['lg-store', ...tags] },
      (err, r) => err ? reject(err) : resolve({ publicId: r.public_id, resourceType: 'raw', deliveryType: 'authenticated', version: r.version, bytes: r.bytes, format: r.format || format }),
    )
    stream.end(buffer)
  })
}

function _rawContentType(format) {
  const f = String(format || '').toLowerCase()
  if (f === 'html') return 'text/html; charset=utf-8'
  if (f === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (f === 'zip') return 'application/zip'
  if (f === 'csv') return 'text/csv; charset=utf-8'
  if (f === 'png') return 'image/png'
  if (f === 'jpg' || f === 'jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

// Fetch a raw authenticated asset's bytes server-side — R2-first, Cloudinary
// as a counted fallback (TOB/ABP HTML, store xlsx/zip/html).
export async function fetchRawBytes(fileRef) {
  if (!fileRef?.publicId && !(fileRef?.backend === 'r2' && fileRef?.key)) throw new Error('no file ref')
  const { getPrivateBytesPreferR2 } = await import('@/lib/private-read.js')
  return await getPrivateBytesPreferR2(fileRef, async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 120
    const url = cloudinary.utils.private_download_url(fileRef.publicId, fileRef.format || 'bin', { resource_type: 'raw', type: 'authenticated', expires_at: expiresAt })
    return await fetchBuffer(url)
  })
}

export async function deleteRaw(fileRef) {
  if (fileRef?.backend === 'r2' && fileRef.key) {
    const { deleteObject } = await import('@/lib/storage.js')
    await deleteObject(fileRef.key, { visibility: 'private' }).catch(() => {})
    return
  }
  if (!fileRef?.publicId) return
  try { await cloudinary.uploader.destroy(fileRef.publicId, { resource_type: 'raw', type: 'authenticated' }) } catch (_) {}
}

// Unified: store any buffer by kind. Returns a fileRef with {kind,publicId,...}.
export async function storeAnyFile(buffer, { kind, folder, tags = [] } = {}) {
  if (kind === 'pdf') {
    const ref = await storePrivatePdf(buffer, { folder: folder || `${STORE_FOLDER}/pdf`, tags })
    return { kind: 'pdf', ...ref }
  }
  const fmtByKind = { excel: 'xlsx', html: 'html', zip: 'zip' }
  const format = fmtByKind[kind] || 'bin'
  const ref = await storeRawFile(buffer, { folder: folder || `${STORE_FOLDER}/${kind}`, format, tags })
  return { kind, ...ref }
}

export async function fetchAnyBytes(fileRef) {
  if (fileRef?.kind === 'pdf') return await fetchPrivatePdfBytes(fileRef)
  return await fetchRawBytes(fileRef)
}

export async function deleteAnyFile(fileRef) {
  if (fileRef?.kind === 'pdf') return await deletePrivateRef(fileRef)
  return await deleteRaw(fileRef)
}
