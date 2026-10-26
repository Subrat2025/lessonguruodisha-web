import { MongoClient } from 'mongodb'
const BASE='http://localhost:3000'
async function j(p,o={}){const r=await fetch(BASE+p,o);const ct=r.headers.get('content-type')||'';let d=null;if(ct.includes('json')){try{d=await r.json()}catch{}}return{status:r.status,d,ct}}
// admin login
const l=await j('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:'9692604577',password:'Subrat@909e'})})
const T=l.d?.token
// 1) ?t= fallback on an authenticated GET (library) with NO Authorization header
const lib=await j('/api/store/library?t='+encodeURIComponent(T))
console.log('library via ?t= (no header):',lib.status,'items?',Array.isArray(lib.d?.items)||Array.isArray(lib.d?.products)||!!lib.d)
// 2) find a set entitlement owner + file, and that user's mobile
const c=new MongoClient(process.env.MONGO_URL);await c.connect();const db=c.db(process.env.DB_NAME)
const ent=await db.collection('storeEntitlements').findOne({})
let setEnt=null
for await (const e of db.collection('storeEntitlements').find({})){ const p=await db.collection('storeProducts').findOne({id:e.productId,type:'unit_test_set'}); if(p){setEnt={e,p};break} }
if(setEnt){
  const f=await db.collection('storeProductFiles').findOne({productId:setEnt.p.id})
  const u=await db.collection('users').findOne({id:setEnt.e.userId})
  console.log('set entitlement: user=',u?.mobile,'product=',setEnt.p.id,'file=',f?.id)
  // mint a token for that user? we can't. Test view with ADMIN token (will 404 if admin lacks entitlement -> proves auth parsed, entitlement enforced)
  const vAdmin=await j(`/api/store/view/${setEnt.p.id}/${f.id}?page=1&t=`+encodeURIComponent(T))
  console.log('view as ADMIN (likely 404 no entitlement, proves auth parsed not 401):',vAdmin.status,vAdmin.ct)
} else console.log('no set entitlement found on preview')
await c.close()
