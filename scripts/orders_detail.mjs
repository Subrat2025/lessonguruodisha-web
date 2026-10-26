import { MongoClient } from 'mongodb'
const client = new MongoClient(process.env.MONGO_URL)
await client.connect()
const d = client.db(process.env.DB_NAME)
const O = d.collection('storeOrders')
const P = d.collection('storeProducts')

// build id->type map
const prods = await P.find({}, { projection: { id:1, type:1, titleOdia:1, priceInr:1, 'packScope':1, 'unitTest':1 } }).toArray()
const byId = {}; for (const p of prods) byId[p.id] = p

const all = await O.find({}).sort({ createdAt: 1 }).toArray()
console.log('=== ALL ORDERS (11) ===')
for (const o of all) {
  const items = o.items || []
  const summary = items.map(it => {
    const p = byId[it.productId] || {}
    return `${p.type||it.type||'?'}@₹${it.price ?? it.priceInr ?? '?'}`
  }).join(', ')
  console.log(`${(o.createdAt instanceof Date? o.createdAt.toISOString(): o.createdAt)} | ${o.status} | sim=${o.simulated?1:0} | ₹${o.total} | ${o.userMobile} ${o.userName||''} | ${items.length} items: ${summary}`)
}

// orders containing set items
console.log('\n=== ORDERS WITH unit_test_set ITEMS ===')
let setOrders = 0
for (const o of all) {
  const items = o.items || []
  const setItems = items.filter(it => (byId[it.productId]?.type === 'unit_test_set'))
  if (setItems.length) {
    setOrders++
    console.log(`${o.createdAt} | ${o.status} | sim=${o.simulated?1:0} | ${o.userMobile} ${o.userName||''} | setItems=${setItems.length} | prices=${setItems.map(it=>it.price).join(',')}`)
  }
}
console.log('Total orders with set items:', setOrders)

// NON-simulated (real) orders only
console.log('\n=== REAL (non-simulated) PAID ORDERS ===')
const real = all.filter(o => !o.simulated && o.status==='paid')
console.log('count:', real.length)
for (const o of real) {
  const items = o.items || []
  console.log(`${o.createdAt} | ₹${o.total} | ${o.userMobile} ${o.userName||''} | items: ${items.map(it=>`${byId[it.productId]?.type||'?'}@₹${it.price}`).join(', ')}`)
}

await client.close()
