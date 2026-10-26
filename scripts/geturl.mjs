import { MongoClient } from 'mongodb'
import jwt from 'jsonwebtoken'
const SECRET=process.env.JWT_SECRET||'edumaster-default-secret'
const c=new MongoClient(process.env.MONGO_URL);await c.connect();const db=c.db(process.env.DB_NAME)
const u=await db.collection('users').findOne({id:'d6d70dfc-aa84-4550-9930-705128f37247'})
const payload={id:u.id,mobile:u.mobile}; if(u.activeSessionId)payload.sessionId=u.activeSessionId
const tok=jwt.sign(payload,SECRET,{expiresIn:'1d'})
const r=await fetch(`http://localhost:3000/api/store/view/eb5cf980-5be6-411d-9ee9-49edaa2ade04/9c090adb-401c-496f-b47d-7901ac25ee36?page=1&t=${encodeURIComponent(tok)}`)
const d=await r.json().catch(()=>({}))
const url=(d.detail||'').replace('fetch-failed URL=','')
console.log('FULL URL:',url)
const rr=await fetch(url); console.log('direct fetch status:',rr.status)
const body=await rr.text(); console.log('body:',body.slice(0,200))
await c.close()
