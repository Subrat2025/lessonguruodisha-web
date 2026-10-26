// ============================================================================
//  lib/assess-storage.js — write NEW private master PDFs to Cloudflare R2.
//  Server-side ONLY. This is the Item-3 write path: every new paid/private
//  asset is stored in the PRIVATE R2 bucket (never public). Cloudinary is kept
//  as a read fallback during the migration, so we dual-write: the existing
//  Cloudinary upload stays, and we ALSO mirror the bytes to R2 and record the
//  key (`r2_master_key`) on the document for ownership-checked server reads.
// ============================================================================
import fs from 'node:fs'
import { upload } from '@/lib/storage.js'
import { writePrivateToR2 } from '@/lib/media.js'
import { pdfPageCount } from '@/lib/assess-render.js'

// Mirror to R2 only when explicitly enabled (STORAGE_WRITE=r2) AND R2 configured.
export function mirrorPrivateEnabled() {
  return writePrivateToR2()
}

const _slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)

function _masterKey({ docId, publicId }) {
  const base = _slug(docId || publicId) || ('doc-' + Date.now())
  return `lg-assess/pdf/${base}.pdf`
}

export async function putPrivatePdfBuffer(buffer, { docId, publicId } = {}) {
  const key = _masterKey({ docId, publicId })
  await upload(buffer, { key, visibility: 'private', contentType: 'application/pdf', cacheControl: 'private, no-store' })
  let pages = 0
  try { pages = await pdfPageCount(buffer) } catch (_) {}
  return { r2_master_key: key, bytes: buffer.length, pages }
}

export async function putPrivatePdfFromPath(filePath, opts = {}) {
  const buffer = await fs.promises.readFile(filePath)
  return putPrivatePdfBuffer(buffer, opts)
}

// Fetch a just-uploaded Cloudinary master (server-side, no transforms) and
// mirror it into the PRIVATE R2 bucket. Used by the direct browser→Cloudinary
// upload path where our server never saw the bytes.
export async function mirrorCloudinaryPdfToR2({ publicId, resourceType = 'image', format = 'pdf', docId } = {}) {
  const { signedAssessDownloadUrl } = await import('@/lib/cloudinary.js')
  const url = signedAssessDownloadUrl(publicId, { resourceType, format, expiresInSeconds: 120 })
  const r = await fetch(url)
  if (!r.ok) throw new Error('cloudinary master fetch ' + r.status)
  const buffer = Buffer.from(await r.arrayBuffer())
  return putPrivatePdfBuffer(buffer, { docId, publicId })
}
