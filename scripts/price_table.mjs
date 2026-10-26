import { MongoClient } from 'mongodb'
const client = new MongoClient(process.env.MONGO_URL)
await client.connect()
const d = client.db(process.env.DB_NAME)
const P = d.collection('storeProducts')

const CLASS_OVERRIDES = { '1':99, '2':219, '3':499, '4':449, '5':459, '6':829, '7':519 }

// chapters per class+subject (published unit_test)
const chAgg = await P.aggregate([
  { $match: { type:'unit_test', status:'published' } },
  { $group: { _id: { cls:'$unitTest.class', subj:'$subjectKey' }, n:{ $sum:1 } } },
]).toArray()
const chBy = {}
for (const r of chAgg) { chBy[`${r._id.cls}|${r._id.subj}`] = r.n }

// chapters per class total
const clsAgg = await P.aggregate([
  { $match: { type:'unit_test', status:'published' } },
  { $group: { _id:'$unitTest.class', n:{ $sum:1 } } },
]).toArray()
const chByCls = {}; for (const r of clsAgg) chByCls[r._id] = r.n

const packs = await P.find({ type:'unit_test_pack' }).toArray()
const classPacks = packs.filter(p => p.packScope?.kind==='class').sort((a,b)=>(a.packScope.class||'').localeCompare(b.packScope.class||''))
const subjPacks = packs.filter(p => p.packScope?.kind==='subject').sort((a,b)=> (a.packScope.class||'').localeCompare(b.packScope.class||'') || (a.packScope.subjectKey||'').localeCompare(b.packScope.subjectKey||''))

console.log('================ CLASS PACKS (before -> after) ================')
console.log('cls | chapters | curPrice | newPrice(override) | sep(=ch*10) | changed')
for (const p of classPacks) {
  const cls = p.packScope.class
  const sep = (chByCls[cls]||0) * 10
  const neu = CLASS_OVERRIDES[cls] ?? p.priceInr
  console.log(`${cls} | ${chByCls[cls]||'?'} | ${p.priceInr} | ${neu} | ${sep} | ${p.priceInr!==neu ? 'YES' : 'no'}`)
}

console.log('\n================ SUBJECT PACKS (before -> after) ================')
console.log('cls | subj | chapters | curPrice | newPrice | sep(=ch*10) | newBelowSep? | changed')
let changedCount = 0
for (const p of subjPacks) {
  const cls = p.packScope.class, subj = p.packScope.subjectKey
  const ch = chBy[`${cls}|${subj}`] || 0
  const sep = ch * 10
  let neu = Math.round(ch * 10 * 0.75)
  if (neu < 5) neu = 5
  const belowSep = neu < sep
  const changed = p.priceInr !== neu
  if (changed) changedCount++
  console.log(`${cls} | ${subj} | ${ch} | ${p.priceInr} | ${neu} | ${sep} | ${belowSep?'yes':'NO!'} | ${changed?'YES':'no'}`)
}
console.log(`\nSubject packs that WOULD change: ${changedCount} / ${subjPacks.length}`)
console.log(`Class packs: ${classPacks.length}, Subject packs: ${subjPacks.length}`)

await client.close()
