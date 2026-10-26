// ============================================================================
//  lib/r2-migrate-tools.js — Admin-UI R2 migration tools (NO CLI on LIVE).
//
//  Four operations, each admin-only, dry-run by default, additive, resumable,
//  single-job-at-a-time (lock), with progress + audit log:
//    1) manifest-import   — import a PREVIEW r2_migration manifest into this DB
//                           (additive; never overwrite existing rows; HEAD-check
//                           a random sample of keys in R2).
//    2) delta-copy        — copy Cloudinary assets uploaded after a cutoff (or
//                           not yet in the mapping) to R2 byte-exact / sized,
//                           SHA-256 / MD5 verified. Mirrors the original
//                           migrate_cloudinary_to_r2.mjs rules + edu q88.
//    3) r2-assets-backfill— add an r2_assets sidecar map to LIVE records FROM
//                           THE MAPPING (never touches Cloudinary fields).
//    4) coverage-report   — read-only: every Cloudinary ref per collection/field
//                           resolved→R2 or missing, with %, a downloadable
//                           missing list, and a HEAD-check proof sample.
//
//  Jobs are tracked in `r2_migrate_jobs`. Heavy logic lives here (keeps the
//  monolithic route.js small — route.js only dispatches).
// ============================================================================
import crypto from 'node:crypto'
import { v2 as cloudinary } from 'cloudinary'
import sharp from 'sharp'
import * as storage from '@/lib/storage.js'

const JOBS = 'r2_migrate_jobs'
const MIG = 'r2_migration'

// Limit libvips threads so a bulk run can't spike container memory.
try { sharp.concurrency(1); sharp.cache(false) } catch (_) {}

let _cldConfigured = false
function configureCloudinary() {
  if (_cldConfigured) return
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  _cldConfigured = true
}
function cloudinaryEnabled() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const md5hex = (buf) => crypto.createHash('md5').update(buf).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const topFolder = (pid) => (pid || '').split('/')[0] || '(root)'
const uuid = () => crypto.randomUUID()

const SKIP_TOPS = new Set(['samples', 'sample', 'main-sample'])
const RASTER = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif'])
const isRaster = (f) => RASTER.has(String(f || '').toLowerCase())

function contentTypeForKey(key) {
  const e = String(key.split('.').pop() || '').toLowerCase()
  const map = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', html: 'text/html', json: 'application/json', txt: 'text/plain', csv: 'text/csv', mp4: 'video/mp4', webm: 'video/webm', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  return map[e] || 'application/octet-stream'
}

// ===========================================================================
//  JOB FRAMEWORK
// ===========================================================================
async function runningJob(d) {
  return d.collection(JOBS).findOne({ status: 'running' }, { projection: { _id: 0 } })
}
async function newJob(d, { kind, mode, me, total = 0, params = {} }) {
  const id = uuid()
  const doc = {
    id, kind, mode, status: 'running', total, done: 0,
    counts: {}, result: {}, logs: [],
    params,
    adminId: me?.id || null, adminName: me?.name || me?.mobile || 'admin',
    startedAt: new Date(), finishedAt: null, updatedAt: new Date(),
    stopRequested: false, error: null,
  }
  await d.collection(JOBS).insertOne(doc)
  const { _id, ...clean } = doc
  return clean
}
async function pushLog(d, id, msg) {
  await d.collection(JOBS).updateOne({ id }, {
    $push: { logs: { $each: [{ t: new Date(), msg: String(msg).slice(0, 300) }], $slice: -200 } },
    $set: { updatedAt: new Date() },
  })
}
async function bump(d, id, inc = {}, set = {}) {
  const u = { $set: { updatedAt: new Date(), ...set } }
  if (Object.keys(inc).length) u.$inc = inc
  await d.collection(JOBS).updateOne({ id }, u)
}
async function finishJob(d, id, { status = 'done', result = {}, error = null } = {}) {
  await d.collection(JOBS).updateOne({ id }, { $set: { status, result, error, finishedAt: new Date(), updatedAt: new Date() } })
}
async function shouldStop(d, id) {
  const j = await d.collection(JOBS).findOne({ id }, { projection: { stopRequested: 1 } })
  return !!j?.stopRequested
}

// ===========================================================================
//  CLOUDINARY URL / public_id helpers (shared with scripts' logic)
// ===========================================================================
function publicIdFromCldUrl(url) {
  if (typeof url !== 'string') return null
  const m = url.match(/res\.cloudinary\.com\/[^/]+\/(?:image|raw|video)\/(?:upload|authenticated|private)\/(.+)$/)
  if (!m) return null
  const segs = m[1].split('?')[0].split('/')
  const out = []
  for (const s of segs) {
    if (/^v\d+$/.test(s)) continue
    if (out.length === 0 && (s.includes(',') || /^(w|h|c|f|q|l|fl|e|o|a|g|b|r|x|y|co|bo|dpr|ar|pg|page|t|u|du|so|eo)_/.test(s))) continue
    out.push(s)
  }
  return out.join('/').replace(/\.[a-z0-9]{2,5}$/i, '')
}

// ===========================================================================
//  1) MANIFEST IMPORT  (chunked)
//     Validate + additively upsert rows into r2_migration. Never overwrite an
//     existing row (keyed by sourceId). Preserve bucket (private stays private).
// ===========================================================================
function validateManifestRow(r) {
  if (!r || typeof r !== 'object') return 'not-object'
  if (!r.publicId || typeof r.publicId !== 'string') return 'no-publicId'
  if (r.bucket !== 'public' && r.bucket !== 'private') return 'bad-bucket'
  if (!Array.isArray(r.targets) || !r.targets[0] || typeof r.targets[0].key !== 'string') return 'no-target-key'
  if (r.status !== 'done') return 'not-done'
  return null
}

async function manifestImportChunk(d, { jobId, rows }) {
  const job = await d.collection(JOBS).findOne({ id: jobId })
  if (!job) throw new Error('job not found')
  if (job.kind !== 'manifest-import') throw new Error('wrong job kind')
  let added = 0, already = 0, invalid = 0
  const invalidSamples = []
  const dry = job.mode === 'dryrun'
  for (const raw of (rows || [])) {
    const err = validateManifestRow(raw)
    if (err) { invalid++; if (invalidSamples.length < 20) invalidSamples.push({ publicId: raw?.publicId || null, reason: err }); continue }
    const sourceId = raw.sourceId || raw.publicId
    const existing = await d.collection(MIG).findOne({ sourceId }, { projection: { _id: 1 } })
    if (existing) { already++; continue }
    if (!dry) {
      const doc = {
        sourceId,
        publicId: raw.publicId,
        bucket: raw.bucket,                    // preserve privacy
        resourceType: raw.resourceType || 'image',
        deliveryType: raw.deliveryType || 'upload',
        top: raw.top || topFolder(raw.publicId),
        targets: raw.targets,
        srcBytes: raw.srcBytes || null,
        status: 'done',
        copiedAt: raw.copiedAt ? new Date(raw.copiedAt) : new Date(),
        importedAt: new Date(),
        importedFrom: 'manifest',
      }
      // Additive-only: never overwrite. insert if absent (race-safe upsert on $setOnInsert).
      const res = await d.collection(MIG).updateOne(
        { sourceId },
        { $setOnInsert: doc },
        { upsert: true },
      )
      if (res.upsertedCount) added++; else already++
    } else {
      added++
    }
  }
  const inc = { done: (rows || []).length, 'counts.added': added, 'counts.already': already, 'counts.invalid': invalid }
  const set = {}
  if (invalidSamples.length) {
    // append a few invalid samples (capped)
    await d.collection(JOBS).updateOne({ id: jobId }, { $push: { 'result.invalidSamples': { $each: invalidSamples, $slice: 50 } } })
  }
  await bump(d, jobId, inc, set)
  return { added, already, invalid }
}

// HEAD-check a random sample of keys in R2 (proves imported keys resolve).
async function manifestImportFinish(d, { jobId, sampleSize = 200 }) {
  const job = await d.collection(JOBS).findOne({ id: jobId })
  if (!job) throw new Error('job not found')
  await pushLog(d, jobId, `HEAD-checking a random sample of up to ${sampleSize} keys in R2…`)
  // Random sample from the whole mapping (or just imported rows if present).
  const pipeline = [{ $sample: { size: sampleSize } }, { $project: { _id: 0, publicId: 1, bucket: 1, targets: 1 } }]
  const sample = await d.collection(MIG).aggregate(pipeline).toArray()
  let checked = 0, present = 0, missing = 0
  const missingSamples = []
  for (const r of sample) {
    const key = r.targets?.[0]?.key
    if (!key) continue
    checked++
    try {
      const ok = await storage.objectExists(key, { visibility: r.bucket === 'private' ? 'private' : 'public' })
      if (ok) present++; else { missing++; if (missingSamples.length < 50) missingSamples.push({ publicId: r.publicId, key, bucket: r.bucket }) }
    } catch (_) { missing++; if (missingSamples.length < 50) missingSamples.push({ publicId: r.publicId, key, bucket: r.bucket, error: true }) }
    await sleep(10)
  }
  const result = { headCheck: { checked, present, missing, missingSamples } }
  await finishJob(d, jobId, { status: 'done', result: { ...(job.result || {}), ...result } })
  await pushLog(d, jobId, `HEAD-check done: present=${present} missing=${missing} of ${checked}.`)
  return result
}

// ===========================================================================
//  MANIFEST EXPORT (read-only) — dump this DB's r2_migration as a JSON array.
// ===========================================================================
async function exportManifest(d) {
  const rows = []
  const cur = d.collection(MIG).find({ status: 'done' }).project({
    _id: 0, sourceId: 1, publicId: 1, bucket: 1, resourceType: 1,
    deliveryType: 1, top: 1, targets: 1, srcBytes: 1, status: 1, copiedAt: 1,
  })
  for await (const r of cur) rows.push(r)
  return rows
}

// ===========================================================================
//  2) DELTA COPY  (Cloudinary → R2, resumable, throttled, verified)
// ===========================================================================
function planFor(res) {
  const top = topFolder(res.public_id)
  if (SKIP_TOPS.has(top) || top.startsWith('cld-sample')) return { skip: true, reason: 'sample', top }
  const ext = res.format ? '.' + res.format : ''
  const isPrivate = res.type === 'authenticated' || top === 'lg-qr-payments' || top === 'lg-official-papers' || res.resource_type === 'raw'
  if (isPrivate) {
    return { bucket: 'private', kind: 'asis', top, targets: [{ key: `${res.public_id}${ext}` }] }
  }
  if (res.resource_type === 'image' && isRaster(res.format)) {
    // edu-library: re-encode q88, NO resize (preserve dimensions). Others q82.
    const mainQuality = top === 'lg-edu-library' ? 88 : 82
    const targets = [{ key: `${res.public_id}.webp`, variant: 'main', quality: mainQuality }]
    if (top === 'lg-store' && /cover/i.test(res.public_id)) targets.push({ key: `${res.public_id}_thumb.webp`, variant: 'thumb', w: 400, h: 500, quality: 82 })
    return { bucket: 'public', kind: 'image', top, targets }
  }
  return { bucket: 'public', kind: 'asis', top, targets: [{ key: `${res.public_id}${ext}` }] }
}

function downloadUrl(res) {
  configureCloudinary()
  if (res.type === 'authenticated') {
    return cloudinary.url(res.public_id, { resource_type: res.resource_type, type: 'authenticated', sign_url: true, secure: true, format: res.format })
  }
  return res.secure_url || cloudinary.url(res.public_id, { resource_type: res.resource_type, type: res.type || 'upload', secure: true, format: res.format })
}

async function withRetry(fn, label, tries = 3) {
  let last
  for (let i = 1; i <= tries; i++) {
    try { return await fn() } catch (e) { last = e; await sleep(400 * i * i) }
  }
  throw new Error(`${label}: ${last?.message || last}`)
}

async function fetchOriginal(res) {
  return withRetry(async () => {
    const r = await fetch(downloadUrl(res))
    if (!r.ok) throw new Error('download ' + r.status)
    return Buffer.from(await r.arrayBuffer())
  }, 'download')
}

async function makeBytes(target, srcBuf) {
  if (target.variant === 'main') return sharp(srcBuf, { failOn: 'none' }).rotate().webp({ quality: target.quality || 82 }).toBuffer()
  if (target.w || target.h) return sharp(srcBuf, { failOn: 'none' }).rotate().resize({ width: target.w, height: target.h, fit: 'cover', withoutEnlargement: true }).webp({ quality: target.quality || 82 }).toBuffer()
  return srcBuf
}

async function verifyR2(bucket, key, expectSha) {
  if (bucket === 'public') {
    const url = storage.getPublicUrl(key).split('?')[0]
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) throw new Error('verify public ' + r.status)
    return sha256(Buffer.from(await r.arrayBuffer())) === expectSha
  }
  const got = await storage.getPrivateFileBuffer(key)
  if (!got) throw new Error('verify private missing')
  return sha256(got.buffer) === expectSha
}

async function copyOne(d, res) {
  const plan = planFor(res)
  if (plan.skip) return { status: 'skipped', reason: plan.reason, top: topFolder(res.public_id) }
  const sourceId = res.asset_id || res.public_id
  const existing = await d.collection(MIG).findOne({ $or: [{ sourceId }, { publicId: res.public_id, bucket: plan.bucket }] })
  if (existing && existing.status === 'done') return { status: 'already', top: plan.top }

  const srcBuf = await fetchOriginal(res)
  const written = []
  for (const t of plan.targets) {
    const bytes = await makeBytes(t, srcBuf)
    const ct = contentTypeForKey(t.key)
    const up = await withRetry(() => storage.upload(bytes, { key: t.key, visibility: plan.bucket, contentType: ct }), 'upload ' + t.key)
    const etag = String(up?.etag || '').replace(/"/g, '').toLowerCase()
    let verified = etag && etag === md5hex(bytes)
    if (!verified) verified = await withRetry(() => verifyR2(plan.bucket, t.key, sha256(bytes)), 'verify ' + t.key)
    if (!verified) throw new Error('checksum mismatch ' + t.key)
    written.push({ key: t.key, bucket: plan.bucket, md5: etag || md5hex(bytes), bytes: bytes.length, contentType: ct })
  }
  await d.collection(MIG).updateOne(
    { sourceId },
    { $set: { sourceId, publicId: res.public_id, resourceType: res.resource_type, deliveryType: res.type, top: plan.top, bucket: plan.bucket, targets: written, srcBytes: res.bytes, status: 'done', copiedAt: new Date(), viaDelta: true } },
    { upsert: true },
  )
  return { status: 'done', top: plan.top }
}

// Enumerate Cloudinary assets uploaded AFTER `sinceMs` via the Search API
// (does NOT consume the Admin API 500/hr listing budget).
async function* searchSince(sinceMs, { limit = 0 } = {}) {
  configureCloudinary()
  const sinceUnix = Math.floor(sinceMs / 1000)
  let cursor = null, count = 0
  do {
    const q = cloudinary.search
      .expression(`uploaded_at>${sinceUnix}`)
      .sort_by('uploaded_at', 'asc')
      .max_results(200)
    if (cursor) q.next_cursor(cursor)
    const r = await withRetry(() => q.execute(), 'cloudinary-search')
    for (const res of (r.resources || [])) {
      yield res
      count++
      if (limit && count >= limit) return
    }
    cursor = r.next_cursor
  } while (cursor)
}

async function defaultSince(d) {
  const latest = await d.collection(MIG).find({ copiedAt: { $exists: true } }).project({ _id: 0, copiedAt: 1 }).sort({ copiedAt: -1 }).limit(1).toArray()
  const t = latest?.[0]?.copiedAt ? new Date(latest[0].copiedAt).getTime() : (Date.now() - 7 * 864e5)
  // 1-day safety margin so nothing on the boundary is missed.
  return t - 864e5
}

async function runDeltaCopy(d, jobId, { mode, sinceMs, limit }) {
  const dry = mode === 'dryrun'
  let done = 0, already = 0, skipped = 0, failed = 0, planned = 0
  const byFolder = {}
  const failures = []
  const note = (p, field) => { const f = p || '(root)'; byFolder[f] = byFolder[f] || { done: 0, already: 0, skipped: 0, failed: 0, planned: 0 }; byFolder[f][field]++ }
  try {
    await pushLog(d, jobId, `${dry ? 'DRY-RUN' : 'LIVE COPY'} — scanning Cloudinary for assets uploaded after ${new Date(sinceMs).toISOString()}…`)
    for await (const res of searchSince(sinceMs, { limit })) {
      if (await shouldStop(d, jobId)) { await pushLog(d, jobId, 'Stop requested — halting (resumable).'); await finishJob(d, jobId, { status: 'stopped', result: { done, already, skipped, failed, planned, byFolder, failures: failures.slice(0, 50) } }); return }
      const plan = planFor(res)
      if (dry) {
        if (plan.skip) { skipped++; note(plan.top, 'skipped') }
        else {
          const sourceId = res.asset_id || res.public_id
          const exists = await d.collection(MIG).findOne({ $or: [{ sourceId }, { publicId: res.public_id, bucket: plan.bucket }], status: 'done' }, { projection: { _id: 1 } })
          if (exists) { already++; note(plan.top, 'already') } else { planned++; note(plan.top, 'planned') }
        }
        await bump(d, jobId, { done: 1, 'counts.planned': plan.skip ? 0 : 0 })
      } else {
        try {
          const r = await copyOne(d, res)
          if (r.status === 'done') { done++; note(r.top, 'done') }
          else if (r.status === 'already') { already++; note(r.top, 'already') }
          else if (r.status === 'skipped') { skipped++; note(r.top, 'skipped') }
        } catch (e) {
          failed++; note(topFolder(res.public_id), 'failed')
          if (failures.length < 100) failures.push({ publicId: res.public_id, error: String(e?.message || e).slice(0, 200) })
        }
        await bump(d, jobId, { done: 1 })
        await sleep(40) // throttle — keep site fast
      }
      await bump(d, jobId, {}, { 'counts.done': done, 'counts.already': already, 'counts.skipped': skipped, 'counts.failed': failed, 'counts.planned': planned })
    }
    await finishJob(d, jobId, { status: 'done', result: { done, already, skipped, failed, planned, byFolder, failures: failures.slice(0, 100) } })
    await pushLog(d, jobId, `Delta copy complete: done=${done} already=${already} skipped=${skipped} failed=${failed} planned=${planned}`)
  } catch (e) {
    await finishJob(d, jobId, { status: 'error', error: String(e?.message || e), result: { done, already, skipped, failed, planned, byFolder, failures: failures.slice(0, 100) } })
  }
}

// ===========================================================================
//  3) R2-ASSETS BACKFILL (from the mapping; never touches Cloudinary fields)
// ===========================================================================
// NOTE: payments, qrSubscriptionPayments and storeOrders are DELIBERATELY excluded
// (never scanned, never written) per owner instruction — zero writes to financial
// collections from any migration tool. Payment proofs still resolve from R2 via the
// r2_migration map directly, so the sidecar is not needed there.
const BACKFILL_EXCLUDED = ['payments', 'qrSubscriptionPayments', 'storeOrders']
const BACKFILL_TARGETS = [
  'storeProducts', 'storeProductFiles', 'educational_images', 'official_papers',
  'academicResources', 'assessments', 'ads', 'answerKeyPapers', 'answerKeyBundles',
  'answerKeyExams', 'books', 'loCodes', 'assess_documents',
]
const HTML_COLLECTIONS = ['abpChapters', 'tobItems', 'tobRegisters', 'tobGradebook']

function collectCldRefs(obj, path, acc, migMap) {
  if (obj == null) return
  if (typeof obj === 'string') {
    if (obj.includes('res.cloudinary.com')) {
      const matches = obj.match(/https?:\/\/res\.cloudinary\.com\/[^\s"'<>)\]]+/g) || [obj]
      for (const u of matches) acc.push({ path, url: u.replace(/[),.]+$/, ''), kind: 'url' })
      return
    }
    const bare = obj.replace(/\.[a-z0-9]{2,5}$/i, '')
    if (obj.length > 3 && !obj.includes(' ') && (migMap.has(obj) || migMap.has(bare))) { acc.push({ path, url: obj, kind: 'pid' }); return }
    return
  }
  if (Array.isArray(obj)) { obj.forEach((v, i) => collectCldRefs(v, path + '[' + i + ']', acc, migMap)); return }
  if (typeof obj === 'object') { for (const k of Object.keys(obj)) { if (k === '_id' || k === 'r2_assets' || k === 'r2_backfilled' || k === 'r2_backfilled_at' || /_r2$/.test(k) || /\[\d+\]/.test(k)) continue; collectCldRefs(obj[k], path ? path + '.' + k : k, acc, migMap) } }
}
function resolveRef(ref, migMap) {
  if (ref.kind === 'pid') return migMap.get(ref.url) || migMap.get(ref.url.replace(/\.[a-z0-9]{2,5}$/i, '')) || null
  const pid = publicIdFromCldUrl(ref.url)
  return pid ? (migMap.get(pid) || null) : null
}

async function loadMigMap(d) {
  const migMap = new Map()
  const cur = d.collection(MIG).find({ status: 'done' }).project({ _id: 0, publicId: 1, bucket: 1, targets: 1 })
  for await (const m of cur) { if (m.publicId && m.targets?.[0]?.key) migMap.set(m.publicId, { key: m.targets[0].key, bucket: m.bucket }) }
  return migMap
}

async function runBackfill(d, jobId, { mode }) {
  const dry = mode === 'dryrun'
  const PUB_BASE = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  try {
    await pushLog(d, jobId, 'Loading r2_migration map…')
    const migMap = await loadMigMap(d)
    await pushLog(d, jobId, `Mapping entries: ${migMap.size}`)
    await pushLog(d, jobId, `Excluded (never scanned/written): ${BACKFILL_EXCLUDED.join(', ')}`)
    const allCols = (await d.listCollections().toArray()).map(c => c.name)
    const scanList = [...new Set(BACKFILL_TARGETS.filter(c => allCols.includes(c) && !BACKFILL_EXCLUDED.includes(c)))]
    const perCollection = []
    let totalUpdated = 0, totalMatched = 0, totalNotFound = 0
    for (const c of scanList) {
      if (await shouldStop(d, jobId)) { await pushLog(d, jobId, 'Stop requested — halting (resumable).'); await finishJob(d, jobId, { status: 'stopped', result: { perCollection, totalUpdated, totalMatched, totalNotFound } }); return }
      let recsWithCld = 0, urlsMatched = 0, urlsNotFound = 0, recsUpdated = 0
      const cur = d.collection(c).find({})
      for await (const doc of cur) {
        const acc = []
        collectCldRefs(doc, '', acc, migMap)
        if (!acc.length) continue
        recsWithCld++
        let anyMatched = false
        const r2assets = {}
        for (const ref of acc) {
          const hit = resolveRef(ref, migMap)
          if (hit) {
            urlsMatched++; anyMatched = true
            const sidecar = { path: ref.path, key: hit.key, bucket: hit.bucket }
            if (hit.bucket === 'public' && PUB_BASE) sidecar.url = `${PUB_BASE}/${hit.key.split('/').map(encodeURIComponent).join('/')}`
            const safe = ref.path.replace(/[.$\[\]]/g, '_')
            r2assets[safe] = sidecar
          } else urlsNotFound++
        }
        if (anyMatched) {
          recsUpdated++
          if (!dry) {
            await d.collection(c).updateOne({ _id: doc._id }, { $set: { r2_assets: r2assets, r2_backfilled: true, r2_backfilled_at: new Date() } })
          }
        }
        await bump(d, jobId, { done: 1 })
      }
      totalUpdated += recsUpdated; totalMatched += urlsMatched; totalNotFound += urlsNotFound
      perCollection.push({ collection: c, recsWithCloudinary: recsWithCld, recsUpdated, urlsMatched, urlsNotFound })
      await pushLog(d, jobId, `${c}: withCld=${recsWithCld} updated=${recsUpdated} matched=${urlsMatched} notFound=${urlsNotFound}`)
      await bump(d, jobId, {}, { 'counts.totalUpdated': totalUpdated, 'counts.totalMatched': totalMatched, 'counts.totalNotFound': totalNotFound })
    }
    await finishJob(d, jobId, { status: 'done', result: { perCollection, totalUpdated, totalMatched, totalNotFound, scanned: scanList, excludedCollections: BACKFILL_EXCLUDED, htmlCollectionsNote: HTML_COLLECTIONS } })
    await pushLog(d, jobId, `Backfill ${dry ? 'DRY-RUN' : 'APPLIED'}: records updated=${totalUpdated} refs matched=${totalMatched} notFound=${totalNotFound}`)
  } catch (e) {
    await finishJob(d, jobId, { status: 'error', error: String(e?.message || e) })
  }
}

// ===========================================================================
//  4) COVERAGE REPORT (read-only)
// ===========================================================================
function walkCov(obj, path, acc, migBuckets) {
  if (obj == null) return
  if (typeof obj === 'string') {
    if (obj.includes('res.cloudinary.com')) { const urls = obj.match(/https?:\/\/res\.cloudinary\.com\/[^\s"'<>)\]]+/g) || [obj]; for (const u of urls) acc.push({ path, pid: publicIdFromCldUrl(u.replace(/[),.]+$/, '')), kind: 'url' }); return }
    const bare = obj.replace(/\.[a-z0-9]{2,5}$/i, '')
    if (obj.length > 4 && !obj.includes(' ') && (migBuckets.has(obj) || migBuckets.has(bare))) acc.push({ path, pid: migBuckets.has(obj) ? obj : bare, kind: 'pid' })
    return
  }
  if (Array.isArray(obj)) { obj.forEach((v) => walkCov(v, path + '[]', acc, migBuckets)); return }
  if (typeof obj === 'object') { for (const k of Object.keys(obj)) { if (k === '_id' || k === 'r2_assets' || /_r2$/.test(k)) continue; walkCov(obj[k], path ? path + '.' + k : k, acc, migBuckets) } }
}

async function runCoverage(d, jobId) {
  try {
    await pushLog(d, jobId, 'Loading r2_migration map…')
    const migBuckets = new Map()
    for await (const m of d.collection(MIG).find({ status: 'done' }).project({ _id: 0, publicId: 1, bucket: 1, targets: 1 })) {
      if (m.publicId) migBuckets.set(m.publicId, { bucket: m.bucket, key: m.targets?.[0]?.key || null })
    }
    const cols = (await d.listCollections().toArray()).map(c => c.name).filter(c => c !== MIG && c !== JOBS).sort()
    const rows = []
    const missing = []        // downloadable list of items not resolved to R2
    let totCovered = 0, totMissing = 0
    for (const c of cols) {
      if (await shouldStop(d, jobId)) { await pushLog(d, jobId, 'Stop requested — halting.'); await finishJob(d, jobId, { status: 'stopped', result: { rows, totCovered, totMissing, missingCount: missing.length } }); return }
      const n = await d.collection(c).countDocuments(); if (!n) continue
      const perField = new Map()
      let hasBackfill = false
      for await (const doc of d.collection(c).find({})) {
        if (doc.r2_assets) hasBackfill = true
        const acc = []; walkCov(doc, '', acc, migBuckets)
        const id = doc.id || String(doc._id)
        for (const r of acc) {
          const norm = r.path
          if (!perField.has(norm)) perField.set(norm, { recs: new Set(), covered: 0, notCovered: 0, buckets: new Set() })
          const e = perField.get(norm); e.recs.add(id)
          const hit = r.pid && migBuckets.get(r.pid)
          if (hit) { e.covered++; totCovered++; e.buckets.add(hit.bucket) }
          else { e.notCovered++; totMissing++; if (missing.length < 5000) missing.push({ collection: c, id, field: r.path, pid: r.pid || null }) }
        }
        await bump(d, jobId, { done: 1 })
      }
      for (const [field, e] of perField) rows.push({ collection: c, field: field || '(root)', records: e.recs.size, covered: e.covered, notCovered: e.notCovered, buckets: [...e.buckets].join('/') || '-', backfilled: hasBackfill })
      await bump(d, jobId, {}, { 'counts.covered': totCovered, 'counts.missing': totMissing })
    }
    // HEAD-check proof sample: prove a few resolved keys really exist in R2.
    await pushLog(d, jobId, 'HEAD-checking a sample of resolved keys in R2…')
    const sample = await d.collection(MIG).aggregate([{ $sample: { size: 100 } }, { $project: { _id: 0, bucket: 1, targets: 1, publicId: 1 } }]).toArray()
    let hc = 0, hp = 0, hm = 0
    for (const r of sample) {
      const key = r.targets?.[0]?.key; if (!key) continue
      hc++
      try { const ok = await storage.objectExists(key, { visibility: r.bucket === 'private' ? 'private' : 'public' }); if (ok) hp++; else hm++ } catch (_) { hm++ }
      await sleep(10)
    }
    const pct = (totCovered + totMissing) ? Math.round((totCovered / (totCovered + totMissing)) * 1000) / 10 : 100
    await finishJob(d, jobId, { status: 'done', result: { rows, totCovered, totMissing, coveragePct: pct, missingCount: missing.length, missing: missing.slice(0, 5000), headCheck: { checked: hc, present: hp, missing: hm } } })
    await pushLog(d, jobId, `Coverage: ${pct}% (covered=${totCovered} missing=${totMissing}). HEAD sample present=${hp}/${hc}.`)
  } catch (e) {
    await finishJob(d, jobId, { status: 'error', error: String(e?.message || e) })
  }
}

// ===========================================================================
//  STATUS (flags + running job + recent jobs + mapping counts)
// ===========================================================================
async function status(d) {
  const flags = {
    STORAGE_WRITE: process.env.STORAGE_WRITE || '(unset)',
    R2_READ_FLIP: process.env.R2_READ_FLIP || '(unset)',
    ASSESS_VIEW_R2: process.env.ASSESS_VIEW_R2 || '(unset)',
    storageMode: storage.storageMode(),
    cloudinary: cloudinaryEnabled(),
  }
  const total = await d.collection(MIG).countDocuments({ status: 'done' })
  const byBucket = await d.collection(MIG).aggregate([{ $match: { status: 'done' } }, { $group: { _id: '$bucket', n: { $sum: 1 } } }]).toArray()
  const running = await runningJob(d)
  const recent = await d.collection(JOBS).find({}, { projection: { _id: 0, logs: 0, 'result.missing': 0, 'result.rows': 0 } }).sort({ startedAt: -1 }).limit(15).toArray()
  return { flags, mapping: { total, byBucket: byBucket.reduce((a, x) => (a[x._id] = x.n, a), {}) }, running: running || null, recent }
}

// ===========================================================================
//  ROUTER (called from route.js)
//  All paths under /admin/r2mig/*  (admin-gated by caller).
// ===========================================================================
export async function handleRoutes({ d, method, path, segs, q, body, me }) {
  const sub = path.replace(/^\/admin\/r2mig\/?/, '')  // '', 'status', 'jobs/<id>', ...
  const parts = sub.split('/').filter(Boolean)

  // --- status ---
  if (parts[0] === 'status' && method === 'GET') return { data: { ok: true, ...(await status(d)) } }

  // --- jobs ---
  if (parts[0] === 'jobs' && method === 'GET' && !parts[1]) {
    const jobs = await d.collection(JOBS).find({}, { projection: { _id: 0, 'result.missing': 0, 'result.rows': 0 } }).sort({ startedAt: -1 }).limit(20).toArray()
    return { data: { jobs } }
  }
  if (parts[0] === 'jobs' && parts[1] && method === 'GET' && !parts[2]) {
    const job = await d.collection(JOBS).findOne({ id: parts[1] }, { projection: { _id: 0, 'result.missing': 0, 'result.rows': 0 } })
    return job ? { data: { job } } : { status: 404, data: { error: 'job not found' } }
  }
  if (parts[0] === 'jobs' && parts[1] && parts[2] === 'full' && method === 'GET') {
    const job = await d.collection(JOBS).findOne({ id: parts[1] }, { projection: { _id: 0 } })
    return job ? { data: { job } } : { status: 404, data: { error: 'job not found' } }
  }
  if (parts[0] === 'jobs' && parts[1] && parts[2] === 'stop' && method === 'POST') {
    await d.collection(JOBS).updateOne({ id: parts[1] }, { $set: { stopRequested: true, updatedAt: new Date() } })
    return { data: { ok: true } }
  }

  // --- manifest export (download) ---
  if (parts[0] === 'manifest' && parts[1] === 'export' && method === 'GET') {
    const rows = await exportManifest(d)
    return { raw: true, body: JSON.stringify({ exportedAt: new Date(), db: process.env.DB_NAME, count: rows.length, rows }), headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="r2_manifest_${Date.now()}.json"` } }
  }

  // --- manifest import (chunked) ---
  if (parts[0] === 'manifest' && parts[1] === 'import' && parts[2] === 'start' && method === 'POST') {
    const running = await runningJob(d)
    if (running) return { status: 409, data: { error: 'Another job is already running', running } }
    const mode = body?.mode === 'real' ? 'real' : 'dryrun'
    const job = await newJob(d, { kind: 'manifest-import', mode, me, total: body?.expectedTotal || 0, params: { sampleSize: body?.sampleSize || 200 } })
    await pushLog(d, job.id, `Manifest import started (${mode}). Streaming chunks…`)
    return { data: { ok: true, jobId: job.id, mode } }
  }
  if (parts[0] === 'manifest' && parts[1] === 'import' && parts[2] === 'chunk' && method === 'POST') {
    const jobId = body?.jobId
    if (!jobId) return { status: 400, data: { error: 'jobId required' } }
    const r = await manifestImportChunk(d, { jobId, rows: body?.rows || [] })
    return { data: { ok: true, ...r } }
  }
  if (parts[0] === 'manifest' && parts[1] === 'import' && parts[2] === 'finish' && method === 'POST') {
    const jobId = body?.jobId
    if (!jobId) return { status: 400, data: { error: 'jobId required' } }
    const job = await d.collection(JOBS).findOne({ id: jobId })
    if (!job) return { status: 404, data: { error: 'job not found' } }
    // Only real imports do the R2 HEAD proof; dry-run just closes out.
    if (job.mode === 'real') {
      const r = await manifestImportFinish(d, { jobId, sampleSize: job.params?.sampleSize || 200 })
      return { data: { ok: true, ...r } }
    }
    await finishJob(d, jobId, { status: 'done', result: { ...(job.result || {}), dryRun: true } })
    await pushLog(d, jobId, 'Dry-run complete.')
    return { data: { ok: true, dryRun: true } }
  }

  // --- delta copy ---
  if (parts[0] === 'delta-copy' && method === 'POST') {
    if (!cloudinaryEnabled()) return { status: 400, data: { error: 'Cloudinary not configured' } }
    const running = await runningJob(d)
    if (running) return { status: 409, data: { error: 'Another job is already running', running } }
    const mode = body?.mode === 'real' ? 'real' : 'dryrun'
    const sinceMs = body?.since ? new Date(body.since).getTime() : await defaultSince(d)
    const limit = Math.max(0, parseInt(body?.limit || 0, 10) || 0)
    const job = await newJob(d, { kind: 'delta-copy', mode, me, params: { since: new Date(sinceMs).toISOString(), limit } })
    runDeltaCopy(d, job.id, { mode, sinceMs, limit })  // fire-and-forget background
    return { data: { ok: true, jobId: job.id, mode, since: new Date(sinceMs).toISOString(), limit } }
  }

  // --- backfill ---
  if (parts[0] === 'backfill' && method === 'POST') {
    const running = await runningJob(d)
    if (running) return { status: 409, data: { error: 'Another job is already running', running } }
    const mode = body?.mode === 'real' ? 'real' : 'dryrun'
    const job = await newJob(d, { kind: 'r2-assets-backfill', mode, me })
    runBackfill(d, job.id, { mode })
    return { data: { ok: true, jobId: job.id, mode } }
  }

  // --- coverage ---
  if (parts[0] === 'coverage' && method === 'POST') {
    const running = await runningJob(d)
    if (running) return { status: 409, data: { error: 'Another job is already running', running } }
    const job = await newJob(d, { kind: 'coverage-report', mode: 'dryrun', me })
    runCoverage(d, job.id)
    return { data: { ok: true, jobId: job.id } }
  }
  if (parts[0] === 'coverage' && parts[1] && parts[2] === 'missing' && method === 'GET') {
    const job = await d.collection(JOBS).findOne({ id: parts[1] }, { projection: { _id: 0, result: 1 } })
    if (!job) return { status: 404, data: { error: 'job not found' } }
    const missing = job.result?.missing || []
    const header = 'collection,id,field,pid\n'
    const csv = header + missing.map(m => `${m.collection},${m.id},${m.field},${m.pid || ''}`).join('\n')
    return { raw: true, body: csv, headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="r2_coverage_missing_${parts[1]}.csv"` } }
  }

  return { status: 404, data: { error: 'Unknown r2mig route' } }
}
