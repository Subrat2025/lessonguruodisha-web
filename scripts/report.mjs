import fs from 'fs'
import { MongoClient } from 'mongodb'
const t = fs.readFileSync('/app/.env', 'utf-8')
for (const l of t.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v }

const top = (pid) => (pid || '').split('/')[0] || '(root)'
const SKIP = new Set(['samples', 'sample', 'main-sample'])
const isSkip = (f) => SKIP.has(f) || f.startsWith('cld-sample')

// expected per folder from the enumeration cache
const cache = JSON.parse(fs.readFileSync('/app/scripts/r2_resources_cache.json', 'utf-8'))
const expected = {}
for (const r of cache) { const f = top(r.public_id); if (isSkip(f)) continue; expected[f] = (expected[f] || 0) + 1 }

const mongo = await MongoClient.connect(process.env.MONGO_URL)
const col = mongo.db(process.env.DB_NAME).collection('r2_migration')
const done = await col.find({ status: 'done' }).toArray()
const errs = await col.find({ status: 'error' }).toArray()

const copied = {}, failed = {}, bytes = {}, bucket = {}
for (const d of done) { const f = d.top || top(d.publicId); copied[f] = (copied[f] || 0) + 1; bucket[f] = d.bucket; for (const tg of (d.targets || [])) bytes[f] = (bytes[f] || 0) + (tg.bytes || 0) }
for (const e of errs) { const f = top(e.publicId); failed[f] = (failed[f] || 0) + 1 }

const folders = [...new Set([...Object.keys(expected), ...Object.keys(copied)])].sort((a, b) => (bytes[b] || 0) - (bytes[a] || 0))
console.log('FOLDER                     BUCKET   EXPECTED  COPIED  FAILED   SIZE(MB)')
let te = 0, tc = 0, tf = 0, tb = 0
for (const f of folders) {
  const e = expected[f] || 0, c = copied[f] || 0, x = failed[f] || 0, b = (bytes[f] || 0) / 1048576
  console.log(f.padEnd(26), String(bucket[f] || '-').padEnd(8), String(e).padStart(8), String(c).padStart(7), String(x).padStart(7), b.toFixed(1).padStart(10))
  te += e; tc += c; tf += x; tb += bytes[f] || 0
}
console.log('-'.repeat(74))
console.log('TOTAL'.padEnd(26), ''.padEnd(8), String(te).padStart(8), String(tc).padStart(7), String(tf).padStart(7), (tb / 1048576).toFixed(1).padStart(10))
console.log(`\nR2 total: ${(tb / 1048576 / 1024).toFixed(2)} GB  (public + private)`)

console.log('\n=== FAILED ITEMS ===')
for (const e of errs) console.log(`  publicId=${e.publicId}\n    error=${e.error}`)
await mongo.close()
