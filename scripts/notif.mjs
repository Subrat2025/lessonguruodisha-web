import fs from 'fs'
const env=fs.readFileSync('/app/.env','utf8');env.split('\n').forEach(l=>{const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)process.env[m[1]]=m[2]});
const {MongoClient}=await import('mongodb')
const BASE='http://localhost:3000/api'
async function j(p,m,t,b){const r=await fetch(`${BASE}${p}`,{method:m||'GET',headers:{...(t?{Authorization:`Bearer ${t}`}:{}),...(b?{'Content-Type':'application/json'}:{})},body:b?JSON.stringify(b):undefined});let d={};try{d=await r.json()}catch(_){}return{s:r.status,d}}
async function login(m,p){return (await j('/auth/login','POST',null,{mobile:m,password:p})).d.token}
;(async()=>{
 const admin=await login('9692604577','Subrat@909e')
 // draft shells for class 1 (test), then cleanup
 const ds=await j('/admin/store/draft-shells','POST',admin,{exam:'TESTSHELL 2026',class:'1'})
 console.log('draft-shells class1:',ds.s, 'created',ds.d.created,'skipped',ds.d.skipped,'total',ds.d.total)
 // TEST buyer buys Class 6 -> notification
 const a=await login('8000000001','Test@1234')
 const prods=(await j('/store/products','GET',a)).d.products||[]
 const c6=prods.find(p=>/Class 6 Science/.test(p.titleEnglish))
 const buy=await j('/store/checkout/test','POST',a,{productIds:[c6.id]})
 console.log('TEST buy:',buy.s,buy.d.ok,'orderId',buy.d.orderId?.slice(-8))
 await new Promise(r=>setTimeout(r,800))
 const c=new MongoClient(process.env.MONGO_URL);await c.connect();const db=c.db(process.env.DB_NAME)
 const aUser=await db.collection('users').findOne({mobile:'8000000001'})
 const notif=await db.collection('notifications').find({userId:aUser.id,type:'store_order'}).sort({createdAt:-1}).limit(1).toArray()
 console.log('in-app notification created:',notif.length>0, notif[0]&&notif[0].title)
 // cleanup: delete TESTSHELL drafts + this TEST order+entitlement+notif
 const del1=await db.collection('storeProducts').deleteMany({exam:'TESTSHELL 2026'})
 await db.collection('storeOrders').deleteMany({userId:aUser.id})
 await db.collection('storeEntitlements').deleteMany({userId:aUser.id})
 await db.collection('notifications').deleteMany({userId:aUser.id,type:'store_order'})
 console.log('cleanup drafts deleted:',del1.deletedCount)
 await c.close()
})().catch(e=>{console.error(e);process.exit(1)})
