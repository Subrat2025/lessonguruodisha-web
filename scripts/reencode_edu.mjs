import fs from 'fs'
import { MongoClient } from 'mongodb'
import sharp from 'sharp'
const t = fs.readFileSync('/app/.env', 'utf-8')
for (const l of t.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v }
sharp.concurrency(1); sharp.cache(false)
const storage = await import('/app/lib/storage.js')
const cache = JSON.parse(fs.readFileSync('/app/scripts/r2_resources_cache.json', 'utf-8'))
const byId = {}; for (const r of cache) byId[r.public_id] = r
const mongo = await MongoClient.connect(process.env.MONGO_URL)
const col = mongo.db(process.env.DB_NAME).collection('r2_migration')
const docs = await col.find({ top: 'lg-edu-library', status: 'done' }).toArray()
console.log('edu-library docs to re-encode @q88:', docs.length)
let ok = 0, fail = 0, dimOK = 0
let idx = 0
async function worker() {
  while (idx < docs.length) {
    const d = docs[idx++]
    try {
      const res = byId[d.publicId]; if (!res) { fail++; continue }
      const r = await fetch(res.secure_url); const buf = Buffer.from(await r.arrayBuffer())
      const meta = await sharp(buf, { failOn: 'none' }).metadata()
      const webp = await sharp(buf, { failOn: 'none' }).rotate().webp({ quality: 88 }).toBuffer() // NO resize
      const key = d.targets[0].key
      const up = await storage.upload(webp, { key, visibility: 'public', contentType: 'image/webp' })
      const wmeta = await sharp(webp).metadata()
      if (wmeta.width === meta.width && wmeta.height === meta.height) dimOK++
      await col.updateOne({ _id: d._id }, { $set: { 'targets.0.bytes': webp.length, 'targets.0.quality': 88, reencodedAt: new Date(), width: meta.width, height: meta.height } })
      ok++
      if (ok % 100 === 0) console.log('  reencoded', ok)
    } catch (e) { fail++; console.log('  fail', d.publicId, e.message) }
  }
}
await Promise.all([worker(), worker(), worker()])
console.log(`DONE reencode q88: ok=${ok} fail=${fail} dimensionsPreserved=${dimOK}/${ok}`)
await mongo.close()
