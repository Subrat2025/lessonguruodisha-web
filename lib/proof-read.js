// ============================================================================
//  lib/proof-read.js — resolve an admin-only payment-proof image to a PRIVATE
//  data: URI. Bytes only, never a URL. Caller must be admin-gated.
//
//  Resolution order (first hit wins):
//    1) inline base64 in DB (screenshotData)                 — oldest fallback
//    2) new-write private R2 object (screenshotRef.key)      — current writes
//    3) legacy private-R2 copy, resolved from r2_migration   — the 148 copies
//       by Cloudinary publicId  ← PREFERRED for legacy proofs
//    4) signed *authenticated* Cloudinary fetch              — after flip
//    5) plain public Cloudinary fetch                        — pre-flip legacy
//
//  Because legacy proofs are read from their PRIVATE R2 copy first, flipping the
//  Cloudinary originals to `authenticated` (and later cancelling Cloudinary)
//  does not break the admin screen.
// ============================================================================
import { resolvePrivateKey } from '@/lib/private-read.js'

// Parse a Cloudinary delivery URL → { publicId, format }. Strips the version
// segment, any leading transform segment, and the file extension.
export function cloudinaryPublicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(/res\.cloudinary\.com\/[^/]+\/(?:image|raw|video)\/(?:upload|authenticated|private)\/(.+)$/)
  if (!m) return null
  const segs = m[1].split('?')[0].split('/')
  const out = []
  for (const s of segs) {
    if (/^v\d+$/.test(s)) continue // version
    if (out.length === 0 && (s.includes(',') || /^(w|h|c|f|q|l|fl|e|o|a|g|b|r|x|y|co|bo|dpr|ar|pg|page|t|u|du|so|eo)_/.test(s))) continue // transforms
    out.push(s)
  }
  const full = out.join('/')
  const ext = (full.match(/\.([a-z0-9]{2,5})$/i) || [, ''])[1]
  return { publicId: full.replace(/\.[a-z0-9]{2,5}$/i, ''), format: (ext || 'jpg').toLowerCase() }
}

function toDataUri(buffer, contentType) {
  return `data:${contentType || 'image/jpeg'};base64,${buffer.toString('base64')}`
}

export async function resolveProofDataUri(rec = {}) {
  const { screenshotData, screenshotRef, screenshotUrl } = rec

  // 1) inline base64 (private, admin-only)
  if (screenshotData && typeof screenshotData === 'string' && screenshotData.startsWith('data:')) {
    return screenshotData
  }

  // 2) new write: explicit private R2 key
  if (screenshotRef?.key) {
    try {
      const { getPrivateFileBuffer } = await import('@/lib/storage.js')
      const got = await getPrivateFileBuffer(screenshotRef.key)
      if (got) return toDataUri(got.buffer, screenshotRef.contentType || got.contentType)
    } catch (_) {}
  }

  // Legacy: Cloudinary screenshotUrl present
  if (screenshotUrl && /res\.cloudinary\.com/.test(screenshotUrl)) {
    const parsed = cloudinaryPublicIdFromUrl(screenshotUrl)

    // 3) legacy private-R2 copy, resolved from r2_migration by publicId
    if (parsed?.publicId) {
      try {
        const key = await resolvePrivateKey(parsed.publicId)
        if (key) {
          const { getPrivateFileBuffer } = await import('@/lib/storage.js')
          const got = await getPrivateFileBuffer(key)
          if (got) return toDataUri(got.buffer, got.contentType)
        }
      } catch (_) {}
    }

    // 4) signed authenticated Cloudinary (works once the original is flipped)
    if (parsed?.publicId) {
      try {
        const { signedAssessDownloadUrl } = await import('@/lib/cloudinary.js')
        const signed = signedAssessDownloadUrl(parsed.publicId, {
          resourceType: 'image', format: parsed.format || 'jpg', expiresInSeconds: 120,
        })
        const up = await fetch(signed)
        if (up.ok) return toDataUri(Buffer.from(await up.arrayBuffer()), up.headers.get('content-type'))
      } catch (_) {}
    }

    // 5) plain public fetch (pre-flip legacy assets still type:'upload')
    try {
      const up = await fetch(screenshotUrl)
      if (up.ok) return toDataUri(Buffer.from(await up.arrayBuffer()), up.headers.get('content-type'))
    } catch (_) {}
  }

  return ''
}
