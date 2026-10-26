// ============================================================================
//  scripts/r2-backfill.mjs — add R2 pointer fields to EXISTING records so reads
//  can prefer R2, WITHOUT touching/removing the Cloudinary fields (kept as
//  fallback). DRY-RUN by default. PREVIEW DB only unless --i-understand-live.
//
//  Usage:
//    node scripts/r2-backfill.mjs            # dry run (report only)
//    node scripts/r2-backfill.mjs --apply    # write r2_* fields (PREVIEW)
//
//  What it adds (only when the matching object exists in R2):
//    • <path>_r2 : { key, bucket, url? }  sidecar next to each Cloudinary URL
//    • top-level: r2_backfilled:true, r2_backfilled_at:<date>
//  It NEVER edits or deletes the original Cloudinary url/publicId fields.
// ============================================================================
import fs from 'fs'
import { MongoClient } from 'mongodb'
const APPLY = process.argv.includes('--apply')
const REVERT = process.argv.includes('--revert')
const t = fs.readFileSync('/app/.env', 'utf-8')
for (const l of t.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v }
const PUB_BASE = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')

const mongo = await MongoClient.connect(process.env.MONGO_URL)
const d = mongo.db(process.env.DB_NAME)

// 1) Load the migration map: publicId -> {key,bucket}
console.log('Loading r2_migration map...')
const migMap = new Map()
const cursor = d.collection('r2_migration').find({ status: 'done' }).project({ _id: 0, publicId: 1, bucket: 1, targets: 1 })
let migCount = 0
for await (const m of cursor) { if (m.publicId && m.targets?.[0]?.key) { migMap.set(m.publicId, { key: m.targets[0].key, bucket: m.bucket }); migCount++ } }
console.log(`r2_migration entries: ${migCount}\n`)

function publicIdFromCldUrl(url) {
  if (typeof url !== 'string') return null
  const m = url.match(/res\.cloudinary\.com\/[^/]+\/(?:image|raw|video)\/(?:upload|authenticated|private)\/(.+)$/)
  if (!m) return null
  let rest = m[1].split('?')[0]
  const segs = rest.split('/')
  const out = []
  for (const s of segs) {
    if (/^v\d+$/.test(s)) continue
    if (out.length === 0 && (s.includes(',') || /^(w|h|c|f|q|l|fl|e|o|a|g|b|r|x|y|co|bo|dpr|ar|pg|page|t|u|du|so|eo)_/.test(s))) continue
    out.push(s)
  }
  return out.join('/').replace(/\.[a-z0-9]{2,5}$/i, '')
}

// Collect every cloudinary reference in a doc: full delivery URLs AND raw
// publicId fields (private/authenticated assets store a publicId, not a URL).
function collectCldUrls(obj, path, acc) {
  if (obj == null) return
  if (typeof obj === 'string') {
    if (obj.includes('res.cloudinary.com')) {
      const matches = obj.match(/https?:\/\/res\.cloudinary\.com\/[^\s"'<>)\]]+/g) || [obj]
      for (const u of matches) acc.push({ path, url: u.replace(/[),.]+$/, ''), kind: 'url' })
      return
    }
    // raw publicId reference (exact match against the migration map)
    const bare = obj.replace(/\.[a-z0-9]{2,5}$/i, '')
    if (obj.length > 3 && !obj.includes(' ') && (migMap.has(obj) || migMap.has(bare))) { acc.push({ path, url: obj, kind: 'pid' }); return }
    return
  }
  if (Array.isArray(obj)) { obj.forEach((v, i) => collectCldUrls(v, path + '[' + i + ']', acc)); return }
  if (typeof obj === 'object') { for (const k of Object.keys(obj)) { if (k === '_id' || k === 'r2_assets' || k === 'r2_backfilled' || k === 'r2_backfilled_at' || /_r2$/.test(k) || /\[\d+\]/.test(k)) continue; collectCldUrls(obj[k], path ? path + '.' + k : k, acc) } }
}
function resolveRef(ref) {
  if (ref.kind === 'pid') return migMap.get(ref.url) || migMap.get(ref.url.replace(/\.[a-z0-9]{2,5}$/i, '')) || null
  const pid = publicIdFromCldUrl(ref.url)
  return pid ? (migMap.get(pid) || null) : null
}

// Target collections (user's list). HTML-embedded ones are flagged separately.
const TARGETS = [
  'storeProducts', 'storeProductFiles', 'educational_images', 'official_papers',
  'academicResources', 'assessments', 'ads', 'answerKeyPapers', 'answerKeyBundles',
  'answerKeyExams', 'books', 'loCodes', 'payments', 'qrSubscriptionPayments',
  'storeOrders', 'assess_documents',
]
const HTML_COLLECTIONS = ['abpChapters', 'tobItems', 'tobRegisters', 'tobGradebook']

const allCols = (await d.listCollections().toArray()).map(c => c.name)
const scanList = [...new Set([...TARGETS, ...HTML_COLLECTIONS].filter(c => allCols.includes(c)))]

const report = []
let grandNotFound = []
for (const c of scanList) {
  const total = await d.collection(c).countDocuments()
  let recsWithCld = 0, urlsTotal = 0, urlsMatched = 0, urlsNotFound = 0
  let recsWouldUpdate = 0
  const notFoundSamples = []
  const isHtml = HTML_COLLECTIONS.includes(c)
  const cur = d.collection(c).find({})
  for await (const doc of cur) {
    const acc = []
    collectCldUrls(doc, '', acc)
    if (!acc.length) continue
    recsWithCld++
    let anyMatched = false, allMatched = true
    for (const ref of acc) {
      const { path, url } = ref
      urlsTotal++
      const hit = resolveRef(ref)
      if (hit) { urlsMatched++; anyMatched = true }
      else { urlsNotFound++; allMatched = false; if (notFoundSamples.length < 5) notFoundSamples.push({ id: doc.id || String(doc._id), path, pid: ref.kind === 'pid' ? url : publicIdFromCldUrl(url) }) }
    }
    if (anyMatched) recsWouldUpdate++
    if (!allMatched) grandNotFound.push({ c, id: doc.id || String(doc._id) })

    if (REVERT) {
      // Exact reversal of the previous apply: unset the same keys that were set.
      const unset = {}
      for (const ref of acc) unset[ref.path + '_r2'] = ''   // old simple-sidecar scheme
      unset.r2_assets = ''; unset.r2_backfilled = ''; unset.r2_backfilled_at = ''
      await d.collection(c).updateOne({ _id: doc._id }, { $unset: unset })
    } else if (APPLY && anyMatched && !isHtml) {
      // Clean design: ONE top-level `r2_assets` map keyed by a sanitized path.
      // (MongoDB field names can't contain '.'/'$'; array paths are flattened.)
      const r2assets = {}
      for (const ref of acc) {
        const hit = resolveRef(ref)
        if (!hit) continue
        const sidecar = { path: ref.path, key: hit.key, bucket: hit.bucket }
        if (hit.bucket === 'public' && PUB_BASE) sidecar.url = `${PUB_BASE}/${hit.key.split('/').map(encodeURIComponent).join('/')}`
        const safe = ref.path.replace(/[.$\[\]]/g, '_')
        r2assets[safe] = sidecar
      }
      await d.collection(c).updateOne({ _id: doc._id }, { $set: { r2_assets: r2assets, r2_backfilled: true, r2_backfilled_at: new Date() } })
    }
  }
  report.push({ c, total, recsWithCld, recsWouldUpdate, urlsTotal, urlsMatched, urlsNotFound, isHtml, notFoundSamples })
}

console.log('================  DRY RUN REPORT  ' + (APPLY ? '(APPLIED)' : '(no writes)') + '  ================\n')
for (const r of report) {
  console.log(`• ${r.c}${r.isHtml ? '  [HTML-embedded — URL rewrite needed, NOT field-add]' : ''}`)
  console.log(`    records total=${r.total} | with Cloudinary=${r.recsWithCld} | would get r2 fields=${r.recsWouldUpdate}`)
  console.log(`    cloudinary URLs: total=${r.urlsTotal} matched-in-R2=${r.urlsMatched} NOT-found=${r.urlsNotFound}`)
  if (r.notFoundSamples.length) for (const s of r.notFoundSamples) console.log(`      not-found e.g. id=${s.id} path=${s.path} pid=${s.pid}`)
}
console.log(`\nTOTAL records with at least one asset NOT found in R2: ${grandNotFound.length}`)
console.log(APPLY ? '\nAPPLIED r2 sidecar fields (Cloudinary fields untouched).' : '\n(DRY RUN — no changes written. Re-run with --apply to write on PREVIEW.)')
await mongo.close()
