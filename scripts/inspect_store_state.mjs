import { MongoClient } from 'mongodb'

const uri = process.env.MONGO_URL
const dbName = process.env.DB_NAME
const client = new MongoClient(uri)

function round(n){ return Math.round(n) }

async function main() {
  await client.connect()
  const d = client.db(dbName)

  // 1) store settings (setsLive, enabled, betaTesters)
  const sdoc = await d.collection('settings').findOne({ key: 'store_settings' })
  const s = sdoc?.value || {}
  console.log('=== STORE SETTINGS ===')
  console.log('enabled:', s.enabled, '| setsLive:', s.setsLive, '| physicalEnabled:', s.physicalEnabled)
  console.log('betaTesters:', JSON.stringify(s.betaTesters || []))

  // 2) product counts by type + visibility + status
  const P = d.collection('storeProducts')
  const types = await P.aggregate([
    { $group: { _id: { type: '$type', status: '$status', visibility: '$visibility' }, n: { $sum: 1 } } },
    { $sort: { '_id.type': 1 } },
  ]).toArray()
  console.log('\n=== PRODUCT COUNTS (type / status / visibility) ===')
  for (const t of types) console.log(`${t._id.type || '(none)'} | ${t._id.status} | ${t._id.visibility} => ${t.n}`)

  // totals per type
  const totals = await P.aggregate([{ $group: { _id: '$type', n: { $sum: 1 } } }]).toArray()
  console.log('\n=== TOTALS PER TYPE ===')
  for (const t of totals) console.log(`${t._id || '(none)'} => ${t.n}`)

  // 3) pack prices (class packs + subject packs)
  console.log('\n=== CLASS PACKS (unit_test_class_pack / packType) ===')
  const classPacks = await P.find({ type: { $in: ['unit_test_class_pack','class_pack'] } }).toArray()
  for (const p of classPacks) {
    console.log(`cls=${p.class} id=${p.id} price=${p.priceInr} mrp=${p.mrpInr} status=${p.status} vis=${p.visibility} title=${(p.titleOdia||p.titleEnglish||'').slice(0,40)}`)
  }

  console.log('\n=== SUBJECT PACKS (unit_test_pack) ===')
  const subjPacks = await P.find({ type: 'unit_test_pack' }).toArray()
  for (const p of subjPacks) {
    console.log(`cls=${p.class} subj=${p.subjectKey} id=${p.id} price=${p.priceInr} mrp=${p.mrpInr} chapters=${p.memberCount||p.chapterCount||'?'} status=${p.status} title=${(p.titleOdia||'').slice(0,40)}`)
  }

  // 4) chapters (unit_test) count per class, current price
  console.log('\n=== UNIT_TEST (chapters) price distribution ===')
  const chPrices = await P.aggregate([
    { $match: { type: 'unit_test' } },
    { $group: { _id: { cls: '$class', price: '$priceInr' }, n: { $sum: 1 } } },
    { $sort: { '_id.cls': 1 } },
  ]).toArray()
  for (const c of chPrices) console.log(`cls=${c._id.cls} price=${c._id.price} => ${c.n} chapters`)

  // chapters per class + subject for subject pack formula
  console.log('\n=== CHAPTERS PER CLASS+SUBJECT (for subject pack formula) ===')
  const chBySub = await P.aggregate([
    { $match: { type: 'unit_test' } },
    { $group: { _id: { cls: '$class', subj: '$subjectKey' }, n: { $sum: 1 } } },
    { $sort: { '_id.cls': 1, '_id.subj': 1 } },
  ]).toArray()
  for (const c of chBySub) {
    const formula = round(c.n * 10 * 0.75)
    console.log(`cls=${c._id.cls} subj=${c._id.subj} chapters=${c.n} => subjPack=${formula}`)
  }

  // chapters per class total (for info)
  console.log('\n=== CHAPTERS PER CLASS TOTAL ===')
  const chByCls = await P.aggregate([
    { $match: { type: 'unit_test' } },
    { $group: { _id: '$class', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray()
  for (const c of chByCls) console.log(`cls=${c._id} => ${c.n} chapters`)

  // 5) sets count
  const setCount = await P.countDocuments({ type: 'unit_test_set' })
  const setHidden = await P.countDocuments({ type: 'unit_test_set', visibility: 'hidden' })
  const setPublic = await P.countDocuments({ type: 'unit_test_set', visibility: 'public' })
  console.log(`\n=== SETS === total=${setCount} hidden=${setHidden} public=${setPublic}`)

  // 6) covers present
  const withCover = await P.countDocuments({ 'cover.url': { $exists: true, $ne: null } })
  const totalProd = await P.countDocuments({})
  console.log(`\n=== COVERS === products=${totalProd} withCover=${withCover}`)

  // 7) orders count (do not touch)
  const orders = await d.collection('storeOrders').countDocuments({})
  const paidOrders = await d.collection('storeOrders').countDocuments({ status: 'paid' })
  console.log(`\n=== ORDERS (read-only) === total=${orders} paid=${paidOrders}`)

  await client.close()
}
main().catch(e => { console.error('ERR', e); process.exit(1) })
