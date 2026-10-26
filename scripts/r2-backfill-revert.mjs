import { MongoClient } from 'mongodb'
const t = (await import('fs')).readFileSync('/app/.env', 'utf-8')
for (const l of t.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (!m) continue; let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (process.env[m[1]] === undefined) process.env[m[1]] = v }
const mongo = await MongoClient.connect(process.env.MONGO_URL)
const d = mongo.db(process.env.DB_NAME)
const TARGETS = ['storeProducts', 'storeProductFiles', 'educational_images', 'official_papers', 'academicResources', 'assessments', 'ads']

function collectArtifactPaths(obj, parent, found) {
  if (obj == null || typeof obj !== 'object') return
  for (const k of Object.keys(obj)) {
    const path = parent ? parent + '.' + k : k
    const isArtifact = /_r2$/.test(k) || /\[\d+\]/.test(k) || k === 'r2_assets' || k === 'r2_backfilled' || k === 'r2_backfilled_at'
    if (isArtifact) { found.push(path); continue } // don't recurse; unset whole subtree
    const v = obj[k]
    if (v && typeof v === 'object') collectArtifactPaths(v, path, found)
  }
}

let totalDocs = 0, totalFields = 0
for (const c of TARGETS) {
  const cur = d.collection(c).find({})
  let docs = 0, fields = 0
  for await (const doc of cur) {
    const found = []
    collectArtifactPaths(doc, '', found)
    if (!found.length) continue
    // keep only top-most paths (drop any path that has an ancestor in the set)
    const minimal = found.filter(p => !found.some(q => q !== p && p.startsWith(q + '.')))
    const unset = {}; for (const p of minimal) unset[p] = ''
    await d.collection(c).updateOne({ _id: doc._id }, { $unset: unset })
    docs++; fields += minimal.length
  }
  console.log(`${c}: cleaned ${docs} docs, ${fields} artifact fields`)
  totalDocs += docs; totalFields += fields
}
console.log(`\nTOTAL cleaned: ${totalDocs} docs, ${totalFields} fields`)
// verify none remain
for (const c of TARGETS) {
  const left = await d.collection(c).countDocuments({ $or: [{ r2_backfilled: { $exists: true } }, { r2_assets: { $exists: true } }] })
  console.log(`${c}: r2_backfilled/r2_assets remaining = ${left}`)
}
await mongo.close()
