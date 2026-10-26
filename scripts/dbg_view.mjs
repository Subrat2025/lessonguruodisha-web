import { MongoClient } from 'mongodb'
import jwt from 'jsonwebtoken'
const SECRET=process.env.JWT_SECRET||'edumaster-default-secret'
const BASE='http://localhost:3000'
const c=new MongoClient(process.env.MONGO_URL);await c.connect();const db=c.db(process.env.DB_NAME)
let setEnt=null
for await (const e of db.collection('storeEntitlements').find({})){ const p=await db.collection('storeProducts').findOne({id:e.productId,type:'unit_test_set'}); if(p){setEnt={e,p};break} }
const f=await db.collection('storeProductFiles').findOne({productId:setEnt.p.id})
const u=await db.collection('users').findOne({id:setEnt.e.userId})
console.log('user activeSessionId:',u.activeSessionId,'lastLoginAt:',!!u.lastLoginAt)
console.log('entitlement doc:',JSON.stringify(setEnt.e))
const payload={id:u.id,mobile:u.mobile}; if(u.activeSessionId)payload.sessionId=u.activeSessionId
const tok=jwt.sign(payload,SECRET,{expiresIn:'1d'})
async function j(p){const r=await fetch(BASE+p);const ct=r.headers.get('content-type')||'';let b=ct.includes('json')?await r.json():null;return{status:r.status,b}}
const lib=await j('/api/store/library?t='+encodeURIComponent(tok))
const items=lib.b?.items||lib.b?.products||[]
console.log('library(owner):',lib.status,'item count:',items.length)
console.log('owns target product in library?', JSON.stringify(items).includes(setEnt.p.id))
// view with page
const v=await j(`/api/store/view/${setEnt.p.id}/${f.id}?page=1&t=`+encodeURIComponent(tok))
console.log('view:',v.status, v.b?JSON.stringify(v.b).slice(0,160):'(non-json/image)')
await c.close()
