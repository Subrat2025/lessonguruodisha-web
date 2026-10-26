import fs from 'fs'
import { MongoClient } from 'mongodb'
const t = fs.readFileSync('/app/.env', 'utf-8')
for (const l of t.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v }
const storage = await import('/app/lib/storage.js')
const mongo = await MongoClient.connect(process.env.MONGO_URL)
const col = mongo.db(process.env.DB_NAME).collection('r2_migration')

// ---- delete _samples/ (compare.html + the 5 picks' q82/q88) ----
const sanitize = (s) => s.replace(/[^a-z0-9]/gi, '_')
const edu = await col.find({ top: 'lg-edu-library', status: 'done' }).sort({ srcBytes: -1 }).limit(3).toArray()
const covers = (await col.find({ top: 'lg-store', status: 'done', publicId: { $regex: 'store-cover-' } }).limit(20).toArray())
  .filter(c => !/store-cover-og-/.test(c.publicId)).slice(0, 2)
const picks = [...edu, ...covers]
const delKeys = ['_samples/compare.html']
for (const d of picks) { const b = `_samples/${sanitize(d.publicId)}`; delKeys.push(`${b}_q82.webp`, `${b}_q88.webp`) }
let del = 0
for (const k of delKeys) { try { await storage.deleteObject(k, { visibility: 'public' }); del++ } catch (e) {} }
console.log(`Deleted ${del}/${delKeys.length} _samples objects`)

// ---- per-folder report + public/private split (by actual object bucket) ----
const done = await col.find({ status: 'done' }).toArray()
const byFolder = {}; let pubBytes = 0, privBytes = 0, pubObj = 0, privObj = 0, totalObj = 0
for (const d of done) {
  const f = d.top || (d.publicId || '').split('/')[0]
  if (!byFolder[f]) byFolder[f] = { files: 0, pub: 0, priv: 0, bytes: 0 }
  byFolder[f].files++
  for (const tg of (d.targets || [])) {
    totalObj++
    if (tg.bucket === 'public') { pubBytes += tg.bytes || 0; pubObj++; byFolder[f].pub++ }
    else { privBytes += tg.bytes || 0; privObj++; byFolder[f].priv++ }
    byFolder[f].bytes += tg.bytes || 0
  }
}
const rows = Object.entries(byFolder).sort((a, b) => b[1].bytes - a[1].bytes)
console.log('\nFOLDER                     FILES  PUB-OBJ PRIV-OBJ   SIZE(MB)')
for (const [f, v] of rows) console.log(f.padEnd(26), String(v.files).padStart(5), String(v.pub).padStart(8), String(v.priv).padStart(8), (v.bytes / 1048576).toFixed(1).padStart(11))
console.log('-'.repeat(66))
console.log(`TOTAL files=${done.length}  objects=${totalObj}`)
console.log(`PUBLIC bucket : ${pubObj} objects, ${(pubBytes / 1048576).toFixed(1)} MB (${(pubBytes / 1073741824).toFixed(3)} GB)`)
console.log(`PRIVATE bucket: ${privObj} objects, ${(privBytes / 1048576).toFixed(1)} MB (${(privBytes / 1073741824).toFixed(3)} GB)`)
console.log(`R2 TOTAL      : ${((pubBytes + privBytes) / 1073741824).toFixed(3)} GB of 10 GB free`)
await mongo.close()
