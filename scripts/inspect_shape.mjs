import { MongoClient } from 'mongodb'
const client = new MongoClient(process.env.MONGO_URL)
await client.connect()
const d = client.db(process.env.DB_NAME)
const P = d.collection('storeProducts')

// sample a unit_test doc to learn the class/subject field names
const ch = await P.findOne({ type: 'unit_test' })
console.log('=== SAMPLE unit_test doc keys ===')
console.log(Object.keys(ch))
console.log('class field candidates:', JSON.stringify({ class: ch.class, cls: ch.cls, grade: ch.grade, classNo: ch.classNo, subject: ch.subject, subjectKey: ch.subjectKey, packScope: ch.packScope, unitTest: ch.unitTest, meta: ch.meta }, null, 1).slice(0,800))

// sample a pack doc
const pk = await P.findOne({ type: 'unit_test_pack' })
console.log('\n=== SAMPLE unit_test_pack doc keys ===')
console.log(Object.keys(pk))
console.log('pack fields:', JSON.stringify({ class: pk.class, cls: pk.cls, subjectKey: pk.subjectKey, packScope: pk.packScope, memberCount: pk.memberCount, memberIds: (pk.memberIds||[]).length, priceInr: pk.priceInr, priceCustomized: pk.priceCustomized }, null, 1))

// Figure correct class field: try packScope
console.log('\n=== packScope distribution ===')
const scopes = await P.aggregate([{ $match:{ type:'unit_test_pack' } }, { $group:{ _id:{ kind:'$packScope.kind', cls:'$packScope.class' }, n:{$sum:1} } }, { $sort:{'_id.cls':1} }]).toArray()
for (const s of scopes) console.log(JSON.stringify(s))

await client.close()
