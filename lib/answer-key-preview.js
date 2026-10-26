// ============================================================================
//  ANSWER KEY FEATURE — blurred preview generation (Option A: Cloudinary)
//  Renders page 1 of the (private, authenticated) answer-key PDF to a heavily
//  blurred, low-res JPEG, then stores it as its OWN separate private asset.
//  The browser NEVER receives any Cloudinary URL — only our own
//  /answer-key/:id/preview endpoint streams these bytes to the owner.
// ============================================================================
import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { cloudinaryEnabled } from '@/lib/cloudinary.js'
import { fetchBuffer } from '@/lib/answer-key.js'

// Strongest blur per spec: e_blur:2000 + w_500 + q_30 + f_jpg + pg_1.
export async function generateBlurredPreview(answerFileRef) {
  if (!cloudinaryEnabled()) throw new Error('Cloudinary not configured')
  if (!answerFileRef?.publicId) throw new Error('no answer fileRef')
  // 1) Signed blurred page-1 JPG transformation of the authenticated answer PDF.
  const url = cloudinary.url(answerFileRef.publicId, {
    resource_type: 'image', type: 'authenticated', sign_url: true, secure: true,
    format: 'jpg', page: 1, version: answerFileRef.version,
    transformation: [{ width: 500, crop: 'fit' }, { effect: 'blur:2000' }, { quality: 30 }],
  })
  const jpg = await fetchBuffer(url)
  // 2) Re-upload the blurred JPG as its OWN private 'authenticated' asset.
  const fp = path.join(os.tmpdir(), `akprev_${uuidv4()}.jpg`)
  fs.writeFileSync(fp, jpg)
  try {
    const res = await new Promise((resolve, reject) => cloudinary.uploader.upload(fp, {
      folder: 'lg-answer-key/preview', resource_type: 'image', type: 'authenticated',
      format: 'jpg', unique_filename: true, use_filename: true, overwrite: false,
      tags: ['answer-key', 'preview'],
    }, (e, r) => e ? reject(e) : resolve(r)))
    return { publicId: res.public_id, resourceType: 'image', deliveryType: 'authenticated', version: res.version, format: 'jpg', bytes: res.bytes }
  } finally { try { fs.unlinkSync(fp) } catch (_) {} }
}

// Fetch the stored blurred preview bytes (server-side) for streaming to owner.
// R2-first with a counted Cloudinary fallback.
export async function fetchPreviewBytes(previewRef) {
  if (!previewRef?.publicId && !(previewRef?.backend === 'r2' && previewRef?.key)) throw new Error('no preview ref')
  const { getPrivateBytesPreferR2 } = await import('@/lib/private-read.js')
  return await getPrivateBytesPreferR2(previewRef, async () => {
    const url = cloudinary.url(previewRef.publicId, {
      resource_type: 'image', type: 'authenticated', sign_url: true, secure: true,
      format: 'jpg', version: previewRef.version,
    })
    return await fetchBuffer(url)
  })
}
