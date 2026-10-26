const { MongoClient } = require('mongodb')
;(async () => {
  const cli = new MongoClient(process.env.MONGO_URL)
  await cli.connect()
  const d = cli.db(process.env.DB_NAME)
  const papers = await d.collection('official_papers').find({}, { projection: { _id: 0, id: 1, title: 1, pdfPublicId: 1, r2: 1 } }).toArray()
  console.log('official_papers count:', papers.length)
  // Build private R2 map
  const map = new Map()
  for await (const r of d.collection('r2_migration').find({ status: 'done', bucket: 'private' }).project({ _id: 0, publicId: 1, targets: 1 })) {
    if (r.publicId && r.targets?.[0]?.key) map.set(r.publicId, r.targets[0].key)
  }
  console.log('r2_migration private done entries:', map.size)
  let resolved = 0
  for (const p of papers) {
    const pid = p.pdfPublicId || ''
    const key = map.get(pid) || map.get(String(pid).replace(/\.[a-z0-9]{2,5}$/i, '')) || (p.r2?.backend === 'r2' ? p.r2.key : null)
    const ok = !!key
    if (ok) resolved++
    console.log(`- ${ok ? 'R2 ✅' : 'NO ❌'} | ${p.title?.slice(0,40)} | pid=${pid} ${key ? '→ ' + key : ''}`)
  }
  console.log(`RESOLVED ${resolved}/${papers.length} official papers to private R2`)
  // Academic resources pdf count
  const ar = await d.collection('academicResources').countDocuments({ contentType: 'pdf', isDeleted: { $ne: true } })
  console.log('academicResources PDF count:', ar)
  await cli.close()
})().catch(e => { console.error(e); process.exit(1) })
