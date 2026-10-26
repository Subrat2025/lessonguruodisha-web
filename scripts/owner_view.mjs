import { MongoClient } from 'mongodb'
import jwt from 'jsonwebtoken'
const SECRET=process.env.JWT_SECRET||'edumaster-default-secret'
const BASE='http://localhost:3000'
const c=new MongoClient(process.env.MONGO_URL);await c.connect();const db=c.db(process.env.DB_NAME)
// owner of a set
let setEnt=null
for await (const e of db.collection('storeEntitlements').find({})){ const p=await db.collection('storeProducts').findOne({id:e.productId,type:'unit_test_set'}); if(p){setEnt={e,p};break} }
const f=await db.collection('storeProductFiles').findOne({productId:setEnt.p.id})
const u=await db.collection('users').findOne({id:setEnt.e.userId})
// mint token matching user's activeSessionId (single-device guard)
const payload={id:u.id, mobile:u.mobile}
if(u.activeSessionId) payload.sessionId=u.activeSessionId
const tok=jwt.sign(payload,SECRET,{expiresIn:'1d'})
const url=`${BASE}/api/store/view/${setEnt.p.id}/${f.id}?page=1&t=${encodeURIComponent(tok)}`
const r=await fetch(url)
console.log('OWNER view status:',r.status,'content-type:',r.headers.get('content-type'),'bytes:',r.headers.get('content-length')||'(stream)')
const buf=Buffer.from(await r.arrayBuffer())
console.log('actual body bytes:',buf.length,'| looks like JPEG:',buf[0]===0xFF&&buf[1]===0xD8)
await c.close()
