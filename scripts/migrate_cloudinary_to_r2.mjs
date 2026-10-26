// ============================================================================
//  Cloudinary -> Cloudflare R2 migration copy job (resumable, throttled).
//  Standalone Node script (run via `node scripts/migrate_cloudinary_to_r2.mjs`).
//
//  Rules implemented:
//   - Download ORIGINAL bytes only (no Cloudinary transformation URLs) so the
//     copy creates NO new transformation credits.
//   - Public images: generate needed sizes ONCE with sharp (main webp, plus a
//     400x500 thumb for lg-store covers) and store each in the PUBLIC bucket.
//   - Private/raw/authenticated + lg-qr-payments: copied AS-IS to the PRIVATE
//     bucket. Skip the "samples" folder.
//   - 3x retry w/ backoff, SHA-256 checksum verify (re-read from R2), resumable
//     via the r2_migration collection, throttled concurrency.
//   - Writes a per-folder expected-vs-copied report. Does NOT touch app records.
//
//  Flags:  --dry-run            enumerate + plan + expected counts, no uploads
//          --folder=<top>       limit to one top folder (e.g. lg-store)
//          --limit=<n>          cap number of resources (testing)
//          --concurrency=<n>    parallel workers (default 5)
// ============================================================================
import fs from 'fs'
import crypto from 'node:crypto'
import { v2 as cloudinary } from 'cloudinary'
import { MongoClient } from 'mongodb'
import sharp from 'sharp'

// ---- load .env into process.env (strip surrounding quotes) ----
const envTxt = fs.readFileSync('/app/.env', 'utf-8')
for (const line of envTxt.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (process.env[m[1]] === undefined) process.env[m[1]] = v
}

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const ONLY = (args.find((a) => a.startsWith('--folder=')) || '').split('=')[1] || null
const LIMIT = parseInt((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || '0', 10)
const CONC = parseInt((args.find((a) => a.startsWith('--concurrency=')) || '').split('=')[1] || '5', 10)

const storage = await import('/app/lib/storage.js')

// Limit libvips threads so the bulk run can't spike container memory.
try { sharp.concurrency(1); sharp.cache(false) } catch (_) {}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

const mongo = await MongoClient.connect(process.env.MONGO_URL)
const db = mongo.db(process.env.DB_NAME)
const col = db.collection('r2_migration')
if (!DRY) {
  await col.createIndex({ sourceId: 1 }, { unique: true }).catch(() => {})
}

const TYPES = [
  { rt: 'image', dt: 'upload' },
  { rt: 'image', dt: 'authenticated' },
  { rt: 'raw', dt: 'upload' },
  { rt: 'raw', dt: 'authenticated' },
  { rt: 'video', dt: 'upload' },
]

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const md5hex = (buf) => crypto.createHash('md5').update(buf).digest('hex')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const topFolder = (pid) => (pid || '').split('/')[0] || '(root)'

const SKIP_TOPS = new Set(['samples', 'sample', 'main-sample'])
const RASTER = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif'])
const isRaster = (f) => RASTER.has(String(f || '').toLowerCase())

function contentTypeForKey(key) {
  const e = String(key.split('.').pop() || '').toLowerCase()
  const map = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', html: 'text/html', json: 'application/json', txt: 'text/plain', csv: 'text/csv', mp4: 'video/mp4', webm: 'video/webm', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  return map[e] || 'application/octet-stream'
}

function planFor(res) {
  const top = topFolder(res.public_id)
  if (SKIP_TOPS.has(top) || top.startsWith('cld-sample')) return { skip: true, reason: 'sample', top }
  const ext = res.format ? '.' + res.format : ''
  const isPrivate = res.type === 'authenticated' || top === 'lg-qr-payments' || top === 'lg-official-papers' || res.resource_type === 'raw'
  if (isPrivate) {
    return { bucket: 'private', kind: 'asis', top, targets: [{ key: `${res.public_id}${ext}` }] }
  }
  // Public raster image -> generate webp once (plus a 400x500 thumb for covers).
  if (res.resource_type === 'image' && isRaster(res.format)) {
    const targets = [{ key: `${res.public_id}.webp`, variant: 'main' }]
    if (top === 'lg-store' && /cover/i.test(res.public_id)) targets.push({ key: `${res.public_id}_thumb.webp`, variant: 'thumb', w: 400, h: 500 })
    return { bucket: 'public', kind: 'image', top, targets }
  }
  // Public non-raster (e.g. official-papers PDFs, videos) -> copy as-is.
  return { bucket: 'public', kind: 'asis', top, targets: [{ key: `${res.public_id}${ext}` }] }
}

function downloadUrl(res) {
  if (res.type === 'authenticated') {
    return cloudinary.url(res.public_id, { resource_type: res.resource_type, type: 'authenticated', sign_url: true, secure: true, format: res.format })
  }
  return res.secure_url
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
  if (target.variant === 'main') return sharp(srcBuf, { failOn: 'none' }).rotate().webp({ quality: 82 }).toBuffer()
  if (target.w || target.h) return sharp(srcBuf, { failOn: 'none' }).rotate().resize({ width: target.w, height: target.h, fit: 'cover', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
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

async function copyOne(res) {
  const plan = planFor(res)
  if (plan.skip) return { status: 'skipped', reason: plan.reason, top: topFolder(res.public_id) }
  const existing = await col.findOne({ sourceId: res.asset_id || res.public_id })
  if (existing && existing.status === 'done') return { status: 'already', top: plan.top }

  const srcBuf = await fetchOriginal(res)

  const written = []
  for (const t of plan.targets) {
    const bytes = await makeBytes(t, srcBuf)
    const ct = contentTypeForKey(t.key)
    const up = await withRetry(() => storage.upload(bytes, { key: t.key, visibility: plan.bucket, contentType: ct }), 'upload ' + t.key)
    // Prefer MD5/ETag verification (no extra request). R2 returns the MD5 as the
    // ETag for single-part puts. Fall back to a full re-read if ETag is absent.
    const etag = String(up?.etag || '').replace(/"/g, '').toLowerCase()
    let verified = etag && etag === md5hex(bytes)
    if (!verified) verified = await withRetry(() => verifyR2(plan.bucket, t.key, sha256(bytes)), 'verify ' + t.key)
    if (!verified) throw new Error('checksum mismatch ' + t.key)
    written.push({ key: t.key, bucket: plan.bucket, md5: etag || md5hex(bytes), bytes: bytes.length, contentType: ct })
  }

  await col.updateOne(
    { sourceId: res.asset_id || res.public_id },
    { $set: { sourceId: res.asset_id || res.public_id, publicId: res.public_id, resourceType: res.resource_type, deliveryType: res.type, top: plan.top, bucket: plan.bucket, targets: written, srcBytes: res.bytes, status: 'done', copiedAt: new Date() } },
    { upsert: true },
  )
  return { status: 'done', top: plan.top }
}

const RES_CACHE = '/app/scripts/r2_resources_cache.json'

async function enumerateAll() {
  // Resume without re-hitting the Cloudinary Admin API (500 ops/hr limit):
  // use the cached full listing if present.
  if (!ONLY && !LIMIT && fs.existsSync(RES_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(RES_CACHE, 'utf-8'))
      if (Array.isArray(cached) && cached.length) { console.log(`Loaded ${cached.length} resources from cache (no Admin API calls).`); return cached }
    } catch (_) { /* fall through to live enumeration */ }
  }
  const all = []
  for (const t of TYPES) {
    let next = null
    do {
      const r = await cloudinary.api.resources({ resource_type: t.rt, type: t.dt, max_results: 500, next_cursor: next || undefined })
      for (const res of (r.resources || [])) {
        if (ONLY && topFolder(res.public_id) !== ONLY) continue
        all.push(res)
      }
      next = r.next_cursor
    } while (next && (!LIMIT || all.length < LIMIT))
    if (LIMIT && all.length >= LIMIT) break
  }
  const out = LIMIT ? all.slice(0, LIMIT) : all
  if (!ONLY && !LIMIT) { try { fs.writeFileSync(RES_CACHE, JSON.stringify(out)); console.log(`Cached ${out.length} resources to ${RES_CACHE}.`) } catch (_) {} }
  return out
}

function reportFrom(plans) {
  const byFolder = {}
  for (const p of plans) {
    const f = p.top || '(root)'
    if (!byFolder[f]) byFolder[f] = { files: 0, srcBytes: 0, toPublic: 0, toPrivate: 0, skipped: 0, objectsToWrite: 0 }
    const b = byFolder[f]
    if (p.skip) { b.skipped++; continue }
    b.files++
    b.srcBytes += p.srcBytes || 0
    b.objectsToWrite += p.targets.length
    if (p.bucket === 'public') b.toPublic++; else b.toPrivate++
  }
  return byFolder
}

async function main() {
  console.log(`MODE: ${DRY ? 'DRY-RUN (no uploads)' : 'LIVE COPY'}  mode=${storage.storageMode()}  folder=${ONLY || 'ALL'}  limit=${LIMIT || 'none'}  conc=${CONC}`)
  const resources = await enumerateAll()
  console.log(`Enumerated ${resources.length} source resources.`)

  if (DRY) {
    const plans = resources.map((r) => { const p = planFor(r); return { ...p, srcBytes: r.bytes } })
    const rep = reportFrom(plans)
    const rows = Object.entries(rep).sort((a, b) => b[1].srcBytes - a[1].srcBytes)
    console.log('\nFOLDER                    FILES   SRC(MB)  ->PUBLIC ->PRIVATE  OBJECTS  SKIP')
    let tf = 0, tb = 0, to = 0
    for (const [f, v] of rows) {
      console.log(f.padEnd(24), String(v.files).padStart(6), (v.srcBytes / 1048576).toFixed(1).padStart(9), String(v.toPublic).padStart(8), String(v.toPrivate).padStart(9), String(v.objectsToWrite).padStart(8), String(v.skipped).padStart(5))
      tf += v.files; tb += v.srcBytes; to += v.objectsToWrite
    }
    console.log('-'.repeat(78))
    console.log('TOTAL'.padEnd(24), String(tf).padStart(6), (tb / 1048576).toFixed(1).padStart(9), ''.padStart(8), ''.padStart(9), String(to).padStart(8))
    console.log(`\nObjects to write to R2: ~${to} PUT requests (each verified via MD5/ETag from the PUT response — no extra GET). Well under the free tier's 100k/day.`)
    fs.writeFileSync('/app/scripts/r2_migration_plan.json', JSON.stringify({ generatedAt: new Date(), totalResources: resources.length, byFolder: rep }, null, 2))
    console.log('Plan written to scripts/r2_migration_plan.json')
    await mongo.close()
    return
  }

  // LIVE copy with a simple concurrency pool + throttle.
  let done = 0, already = 0, skipped = 0, failed = 0
  const failures = []
  let idx = 0
  async function worker() {
    while (idx < resources.length) {
      const res = resources[idx++]
      try {
        const r = await copyOne(res)
        if (r.status === 'done') done++
        else if (r.status === 'already') already++
        else if (r.status === 'skipped') skipped++
      } catch (e) {
        failed++
        failures.push({ publicId: res.public_id, error: e.message })
        await col.updateOne({ sourceId: res.asset_id || res.public_id }, { $set: { sourceId: res.asset_id || res.public_id, publicId: res.public_id, status: 'error', error: e.message, attemptedAt: new Date() } }, { upsert: true })
      }
      if ((done + already + skipped + failed) % 100 === 0) console.log(`  progress: done=${done} already=${already} skipped=${skipped} failed=${failed}`)
      await sleep(40) // throttle
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()))
  console.log(`\nCOPY COMPLETE: done=${done} already=${already} skipped=${skipped} failed=${failed}`)
  if (failures.length) { console.log('First failures:'); failures.slice(0, 20).forEach((f) => console.log('  ', f.publicId, '->', f.error)) }
  fs.writeFileSync('/app/scripts/r2_migration_result.json', JSON.stringify({ finishedAt: new Date(), done, already, skipped, failed, failures: failures.slice(0, 200) }, null, 2))
  await mongo.close()
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
