import { MongoClient } from 'mongodb'
const client = new MongoClient(process.env.MONGO_URL)
await client.connect()
const d = client.db(process.env.DB_NAME)

// 1) settings updatedAt (when switch applied)
const sdoc = await d.collection('settings').findOne({ key: 'store_settings' })
console.log('=== SETTINGS updatedAt ===', sdoc?.updatedAt, '| updatedBy:', sdoc?.updatedBy)
console.log('setsLive:', sdoc?.value?.setsLive, '| enabled:', sdoc?.value?.enabled)

// 2) storePriceHistory shape + count
const PH = d.collection('storePriceHistory')
const phCount = await PH.countDocuments({})
console.log('\n=== storePriceHistory count ===', phCount)
const phSample = await PH.find({}).sort({ createdAt: 1 }).limit(3).toArray()
console.log('earliest sample:', JSON.stringify(phSample, null, 1).slice(0, 1200))
const phLast = await PH.find({}).sort({ createdAt: -1 }).limit(3).toArray()
console.log('latest sample:', JSON.stringify(phLast, null, 1).slice(0, 1200))

// 3) orders shape
const O = d.collection('storeOrders')
const ordCount = await O.countDocuments({})
console.log('\n=== storeOrders count ===', ordCount)
const o1 = await O.findOne({})
console.log('order keys:', o1 ? Object.keys(o1) : 'none')
console.log('order sample (trimmed):', JSON.stringify({ id:o1?.id, status:o1?.status, createdAt:o1?.createdAt, total:o1?.totalInr||o1?.total, items:o1?.items, lineItems:o1?.lineItems, products:o1?.products }, null, 1).slice(0, 1500))

// 4) all orders brief (only 11) — list with createdAt, status, items types
const all = await O.find({}).sort({ createdAt: 1 }).toArray()
console.log('\n=== ALL ORDERS (brief) ===')
for (const o of all) {
  const items = o.items || o.lineItems || o.products || []
  const summary = (Array.isArray(items) ? items : []).map(it => `${it.type||it.productType||'?'}:${it.productId||it.id||''}@₹${it.price||it.priceInr||it.amount||'?'}`).join(', ')
  console.log(`${o.createdAt?.toISOString?.()||o.createdAt} | ${o.status} | ₹${o.totalInr||o.total||o.amount||'?'} | ${items.length||0} items | ${summary.slice(0,200)}`)
}

await client.close()
