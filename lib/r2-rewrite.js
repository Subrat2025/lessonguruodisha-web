// ============================================================================
//  lib/r2-rewrite.js — serve-time Cloudinary→R2 URL rewriting (READ FLIP).
//  When R2_READ_FLIP=1, every API response body is scanned for
//  res.cloudinary.com URLs; those whose asset lives in the PUBLIC R2 bucket are
//  rewritten to the R2 public URL on the fly. Private/unmapped URLs are LEFT
//  UNCHANGED (Cloudinary stays the automatic fallback) and only COUNTED, so we
//  can see exactly what still depends on Cloudinary. The stored DB data is never
//  modified (also satisfies the "rewrite embedded HTML at serve time" rule).
// ============================================================================
import crypto from 'node:crypto'

const PUB_BASE = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')

export function readFlipEnabled() {
  return process.env.R2_READ_FLIP === '1' && !!PUB_BASE
}

// publicId -> { key, bucket }  (loaded once, refreshed periodically)
let _map = null
let _mapAt = 0
let _loading = null
const MAP_TTL = 10 * 60 * 1000

const counters = { rewritten: 0, fallback_private: 0, fallback_unmapped: 0, bodies_scanned: 0 }
const byType = {} // prefix -> { rewritten, fallback_private, fallback_unmapped }
function _bump(prefix, field) {
  if (!prefix) prefix = 'unknown'
  if (!byType[prefix]) byType[prefix] = { rewritten: 0, fallback_private: 0, fallback_unmapped: 0 }
  byType[prefix][field]++
}
let _lastFlush = 0

export async function warm(d) {
  const now = Date.now()
  if (!readFlipEnabled()) return
  if (_map && now - _mapAt < MAP_TTL) { if (now - _lastFlush > 30000) await _flush(d); return }
  if (_loading) return _loading
  _loading = (async () => {
    const m = new Map()
    for await (const r of d.collection('r2_migration').find({ status: 'done' }).project({ _id: 0, publicId: 1, bucket: 1, targets: 1 })) {
      if (r.publicId && r.targets?.[0]?.key) m.set(r.publicId, { key: r.targets[0].key, bucket: r.bucket })
    }
    _map = m; _mapAt = Date.now()
  })()
  try { await _loading } finally { _loading = null }
  await _flush(d)
}

async function _flush(d) {
  _lastFlush = Date.now()
  try {
    const inc = { rewritten: counters.rewritten, fallback_private: counters.fallback_private, fallback_unmapped: counters.fallback_unmapped, bodies_scanned: counters.bodies_scanned }
    for (const [prefix, c] of Object.entries(byType)) {
      const safe = prefix.replace(/[.$]/g, '_')
      if (c.rewritten) inc[`by_type.${safe}.rewritten`] = c.rewritten
      if (c.fallback_private) inc[`by_type.${safe}.fallback_private`] = c.fallback_private
      if (c.fallback_unmapped) inc[`by_type.${safe}.fallback_unmapped`] = c.fallback_unmapped
    }
    await d.collection('r2_fallback_stats').updateOne({ _id: 'global' }, { $inc: inc, $set: { updated_at: new Date() } }, { upsert: true })
    counters.rewritten = counters.fallback_private = counters.fallback_unmapped = counters.bodies_scanned = 0
    for (const k of Object.keys(byType)) delete byType[k]
  } catch (_) {}
}

export async function getStats(d) {
  const doc = await d.collection('r2_fallback_stats').findOne({ _id: 'global' })
  const live = { ...counters }
  return { persisted: doc || {}, pending: live, map_entries: _map ? _map.size : 0, enabled: readFlipEnabled() }
}

function _pidFromUrl(url) {
  const m = url.match(/res\.cloudinary\.com\/[^/]+\/(?:image|raw|video)\/(?:upload|authenticated|private)\/(.+)$/)
  if (!m) return null
  const segs = m[1].split('?')[0].split('/'); const out = []
  for (const s of segs) { if (/^v\d+$/.test(s)) continue; if (out.length === 0 && (s.includes(',') || /^(w|h|c|f|q|l|fl|e|o|a|g|b|r|x|y|co|bo|dpr|ar|pg|page|t|u|du|so|eo)_/.test(s))) continue; out.push(s) }
  return out.join('/').replace(/\.[a-z0-9]{2,5}$/i, '')
}
function _r2Url(key) { return `${PUB_BASE}/${key.split('/').map(encodeURIComponent).join('/')}` }

const URL_RE = /https?:\/\/res\.cloudinary\.com\/[^\s"'\\<>)\]]+/g

// Rewrite a serialized response body string. Returns { body, changed }.
export function rewriteString(s) {
  if (!_map || typeof s !== 'string' || !s.includes('res.cloudinary.com')) return { body: s, changed: false }
  counters.bodies_scanned++
  let changed = false
  const body = s.replace(URL_RE, (url) => {
    const pid = _pidFromUrl(url)
    const prefix = pid ? pid.split('/')[0] : 'unknown'
    const hit = pid && _map.get(pid)
    if (hit && hit.bucket === 'public') { counters.rewritten++; _bump(prefix, 'rewritten'); changed = true; return _r2Url(hit.key) }
    if (hit && hit.bucket === 'private') { counters.fallback_private++; _bump(prefix, 'fallback_private') }
    else { counters.fallback_unmapped++; _bump(prefix, 'fallback_unmapped') }
    return url
  })
  return { body, changed }
}
