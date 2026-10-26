// scripts/r2-coverage.mjs — READ-ONLY full scan of EVERY collection for
// Cloudinary references (res.cloudinary.com URLs AND raw public_id fields),
// reporting coverage against the R2 migration map + backfill.
import fs from 'fs'
import { MongoClient } from 'mongodb'
const t = fs.readFileSync('/app/.env', 'utf-8')
for (const l of t.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v }
const mongo = await MongoClient.connect(process.env.MONGO_URL)
const d = mongo.db(process.env.DB_NAME)

const migMap = new Map()
for await (const m of d.collection('r2_migration').find({ status: 'done' }).project({ _id: 0, publicId: 1, bucket: 1 })) { if (m.publicId) migMap.set(m.publicId, m.bucket) }

function pidFromUrl(url) {
  const m = url.match(/res\.cloudinary\.com\/[^/]+\/(?:image|raw|video)\/(?:upload|authenticated|private)\/(.+)$/)
  if (!m) return null
  const segs = m[1].split('?')[0].split('/'); const out = []
  for (const s of segs) { if (/^v\d+$/.test(s)) continue; if (out.length === 0 && (s.includes(',') || /^(w|h|c|f|q|l|fl|e|o|a|g|b|r|x|y|co|bo|dpr|ar|pg|page|t|u|du|so|eo)_/.test(s))) continue; out.push(s) }
  return out.join('/').replace(/\.[a-z0-9]{2,5}$/i, '')
}
function walk(obj, path, acc) {
  if (obj == null) return
  if (typeof obj === 'string') {
    if (obj.includes('res.cloudinary.com')) { const urls = obj.match(/https?:\/\/res\.cloudinary\.com\/[^\s"'<>)\]]+/g) || [obj]; for (const u of urls) acc.push({ path, pid: pidFromUrl(u.replace(/[),.]+$/, '')), kind: 'url' }); return }
    const bare = obj.replace(/\.[a-z0-9]{2,5}$/i, '')
    if (obj.length > 4 && !obj.includes(' ') && (migMap.has(obj) || migMap.has(bare))) acc.push({ path, pid: migMap.has(obj) ? obj : bare, kind: 'pid' })
    return
  }
  if (Array.isArray(obj)) { obj.forEach((v) => walk(v, path + '[]', acc)); return }
  if (typeof obj === 'object') { for (const k of Object.keys(obj)) { if (k === '_id' || k === 'r2_assets' || /_r2$/.test(k)) continue; walk(obj[k], path ? path + '.' + k : k, acc) } }
}

const cols = (await d.listCollections().toArray()).map(c => c.name).filter(c => c !== 'r2_migration').sort()
const rows = []
for (const c of cols) {
  const n = await d.collection(c).countDocuments(); if (!n) continue
  const perField = new Map() // normPath -> { recs:Set, covered:0, notCovered:0, buckets:Set }
  let hasBackfill = false
  for await (const doc of d.collection(c).find({})) {
    if (doc.r2_assets) hasBackfill = true
    const acc = []; walk(doc, '', acc)
    const id = doc.id || String(doc._id)
    for (const r of acc) {
      const norm = r.path.replace(/\[\]/g, '[]')
      if (!perField.has(norm)) perField.set(norm, { recs: new Set(), covered: 0, notCovered: 0, buckets: new Set() })
      const e = perField.get(norm); e.recs.add(id)
      const bucket = r.pid && migMap.get(r.pid)
      if (bucket) { e.covered++; e.buckets.add(bucket) } else e.notCovered++
    }
  }
  for (const [field, e] of perField) rows.push({ c, field, records: e.recs.size, covered: e.covered, notCovered: e.notCovered, buckets: [...e.buckets].join('/') || '-', backfill: hasBackfill })
}

console.log('\n================  FULL CLOUDINARY COVERAGE (preview DB)  ================\n')
console.log('collection | field | records | refs-covered-in-R2 | refs-NOT-covered | bucket | backfilled')
console.log('-'.repeat(110))
for (const r of rows.sort((a, b) => a.c.localeCompare(b.c) || a.field.localeCompare(b.field))) {
  console.log(`${r.c} | ${r.field || '(root)'} | ${r.records} | ${r.covered} | ${r.notCovered} | ${r.buckets} | ${r.backfill ? 'yes' : 'no'}`)
}
const totNot = rows.reduce((s, r) => s + r.notCovered, 0)
console.log('-'.repeat(110))
console.log(`Collections with Cloudinary refs: ${new Set(rows.map(r => r.c)).size} | total refs NOT covered in R2: ${totNot}`)
await mongo.close()
