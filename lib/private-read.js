// ============================================================================
//  lib/private-read.js — read PRIVATE asset bytes from Cloudflare R2 first,
//  with Cloudinary kept ONLY as a counted fallback. Used by the server-side
//  streaming paths (answer keys, store paid files/previews, TOB/ABP HTML,
//  official papers) AFTER their own ownership checks. Never returns a URL to
//  the client — bytes only. Private objects are never exposed publicly.
// ============================================================================
import { getDb } from '@/lib/mongodb.js'

let _map = null, _at = 0, _loading = null
const TTL = 10 * 60 * 1000
const ctr = { r2: 0, cloudinary: 0 }
const byType = {}
let _pending = 0, _lastFlush = 0

async function _ensure() {
  const now = Date.now()
  if (_map && now - _at < TTL) return
  if (_loading) return _loading
  _loading = (async () => {
    const d = await getDb()
    const m = new Map()
    for await (const r of d.collection('r2_migration').find({ status: 'done', bucket: 'private' }).project({ _id: 0, publicId: 1, targets: 1 })) {
      if (r.publicId && r.targets?.[0]?.key) m.set(r.publicId, r.targets[0].key)
    }
    _map = m; _at = Date.now()
  })()
  try { await _loading } finally { _loading = null }
}

export async function resolvePrivateKey(publicId) {
  if (!publicId) return null
  await _ensure()
  return _map.get(publicId) || _map.get(String(publicId).replace(/\.[a-z0-9]{2,5}$/i, '')) || null
}

async function _note(source, publicId) {
  ctr[source]++
  const p = (String(publicId || '').split('/')[0]) || '?'
  byType[p] = byType[p] || { r2: 0, cloudinary: 0 }
  byType[p][source]++
  _pending++
  if (_pending >= 10 || Date.now() - _lastFlush > 30000) _flush().catch(() => {})
}

async function _flush() {
  _lastFlush = Date.now(); _pending = 0
  const inc = { priv_read_r2: ctr.r2, priv_read_cloudinary: ctr.cloudinary }
  for (const [k, v] of Object.entries(byType)) { const s = k.replace(/[.$]/g, '_'); if (v.r2) inc[`priv_by_type.${s}.r2`] = v.r2; if (v.cloudinary) inc[`priv_by_type.${s}.cloudinary`] = v.cloudinary }
  ctr.r2 = ctr.cloudinary = 0; for (const k of Object.keys(byType)) delete byType[k]
  try { const d = await getDb(); await d.collection('r2_fallback_stats').updateOne({ _id: 'global' }, { $inc: inc, $set: { updated_at: new Date() } }, { upsert: true }) } catch (_) {}
}

// Core: return private bytes, PER-RECORD. `fileRef` may carry {backend:'r2',key}
// (new own-R2 write) or {publicId} (legacy Cloudinary). `cloudinaryFn` is an
// async that returns the bytes via Cloudinary (the previous behaviour).
//
// Decision order:
//   1) The record's OWN R2 key (new writes) → read from R2. If that read fails
//      we throw a CLEAR, LOGGED error — NEVER silently fall back (an own-R2 file
//      has no Cloudinary copy). This is flag-independent.
//   2) FULL-SWITCH ONLY: when R2_READ_FLIP=1, resolve a legacy publicId via the
//      r2_migration map and read from R2.
//   3) Cloudinary (the unchanged legacy path), counted.
export async function getPrivateBytesPreferR2(fileRef, cloudinaryFn) {
  const { ownR2PrivateKey, readOwnR2PrivateBuffer, readFlipEnabled } = await import('@/lib/r2-read.js')
  const enabled = readFlipEnabled()
  // 1) Own-R2 asset (new writes) — R2 only, clear error on failure (no fallback).
  const ownKey = ownR2PrivateKey(fileRef)
  if (ownKey) {
    const buf = await readOwnR2PrivateBuffer(ownKey, { label: 'private' })
    _note('r2', ownKey)
    return buf
  }
  // 2) Legacy asset migrated to R2 — resolve by publicId (ONLY when flip is on).
  if (enabled && fileRef?.publicId) {
    try {
      const key = await resolvePrivateKey(fileRef.publicId)
      if (key) {
        const { getPrivateFileBuffer } = await import('@/lib/storage.js')
        const r = await getPrivateFileBuffer(key)
        if (r) { _note('r2', fileRef.publicId); return r.buffer }
      }
    } catch (_) { /* fall through to Cloudinary */ }
  }
  // 3) Cloudinary fallback (counted).
  const buf = await cloudinaryFn()
  _note('cloudinary', fileRef?.publicId || fileRef?.key || '?')
  return buf
}
