// ============================================================================
//  lib/r2-read.js — PER-RECORD read decision (NOT a global flag).
//
//  Rule (default, with R2_READ_FLIP=0 and ASSESS_VIEW_R2=0):
//    • A record whose OWN main file field points at R2 (written by a NEW upload
//      under STORAGE_WRITE=r2) is read from R2.
//    • Every other record is read from Cloudinary, exactly as today.
//
//  "Own R2" means ONLY the record's own main file reference:
//      - fileRef.backend === 'r2' with a key  (private new writes), or
//      - the stored main-field URL is under our R2 public domain (public new
//        writes, e.g. https://static.lessonguruodisha.in/... or *.r2.dev).
//  It DOES NOT use the r2_assets / r2_backfilled sidecar fields, and it DOES
//  NOT use the r2_migration map. Those remain the FULL-SWITCH path and are used
//  ONLY when R2_READ_FLIP=1 (or ASSESS_VIEW_R2=1 for the assessment viewer).
//
//  New R2-only files therefore ALWAYS read from R2 — even if STORAGE_WRITE is
//  later set back to cloudinary — because they have no Cloudinary copy.
//
//  If an R2 read fails for an own-R2 file we throw a CLEAR, LOGGED error and
//  never silently fall back to anything public.
// ============================================================================

const CUSTOM_PUBLIC_HOSTS = new Set(['static.lessonguruodisha.in'])

function pubBase() {
  return String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

// Master-override flips (used ONLY for the later full switch of OLD files).
export function readFlipEnabled() {
  return process.env.R2_READ_FLIP === '1'
}
export function assessViewFlagEnabled() {
  return process.env.ASSESS_VIEW_R2 === '1'
}

// Returns the record's OWN private R2 key, or '' if the record is not R2-native.
export function ownR2PrivateKey(fileRef) {
  if (!fileRef || typeof fileRef !== 'object') return ''
  if (fileRef.backend === 'r2' && fileRef.key) return String(fileRef.key)
  return ''
}

// True when a stored (public) URL already points at our R2 public bucket —
// i.e. the record reads from R2 purely by virtue of the URL saved in its main
// field (no rewrite, no flag needed).
export function isOwnR2PublicUrl(url) {
  if (!url || typeof url !== 'string') return false
  const base = pubBase()
  if (base && url.startsWith(base)) return true
  try {
    const host = new URL(url).host
    if (CUSTOM_PUBLIC_HOSTS.has(host)) return true
    if (/(^|\.)r2\.dev$/.test(host)) return true
    if (/(^|\.)r2\.cloudflarestorage\.com$/.test(host)) return true
  } catch (_) { /* not a parseable URL */ }
  return false
}

// Read a PRIVATE object by its OWN R2 key. Throws a clear, logged error on
// failure — callers MUST NOT silently fall back to a public/Cloudinary copy for
// a file that only exists in R2.
export async function readOwnR2PrivateBuffer(key, { label = 'asset' } = {}) {
  const { getPrivateFileBuffer } = await import('@/lib/storage.js')
  let got = null
  try {
    got = await getPrivateFileBuffer(key)
  } catch (e) {
    console.error(`[r2-read] R2 private read FAILED (${label}) key=${key}: ${e?.message || e}`)
    const err = new Error('R2_READ_FAILED')
    err.code = 'R2_READ_FAILED'; err.r2Key = key
    throw err
  }
  if (!got) {
    console.error(`[r2-read] R2 private object MISSING (${label}) key=${key}`)
    const err = new Error('R2_OBJECT_MISSING')
    err.code = 'R2_OBJECT_MISSING'; err.r2Key = key
    throw err
  }
  return got.buffer
}
