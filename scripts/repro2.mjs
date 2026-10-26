import { MongoClient } from 'mongodb'
import { v2 as cloudinary } from 'cloudinary'
const c=new MongoClient(process.env.MONGO_URL);await c.connect();const db=c.db(process.env.DB_NAME)
const f=await db.collection('storeProductFiles').findOne({productId:'eb5cf980-5be6-411d-9ee9-49edaa2ade04',id:'9c090adb-401c-496f-b47d-7901ac25ee36'})
const u=await db.collection('users').findOne({id:'d6d70dfc-aa84-4550-9930-705128f37247'})
console.log('THIS file.fileRef:',JSON.stringify(f.fileRef))
console.log('user.name:',JSON.stringify(u?.name),'mobile:',u?.mobile)
cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true})
const ref=f.fileRef
const wm=(u?.name||'User').split(' ')[0]+' '+String(u?.mobile||'').replace(/(\d{2})\d+(\d{2})/,'$1XXXX$2')
console.log('watermark text:',JSON.stringify(wm))
function url(withWm){return cloudinary.url(ref.publicId,{resource_type:'image',type:'authenticated',format:'jpg',secure:true,sign_url:true,version:ref.version,page:1,transformation:[{width:1200,crop:'limit',quality:'auto',fetch_format:'auto'},withWm?{overlay:{font_family:'Arial',font_size:30,font_weight:'bold',text:wm},color:'#3b82f6',opacity:12,angle:40,flags:'tiled'}:null].filter(Boolean)})}
async function st(u){try{const r=await fetch(u);const t=r.ok?'':(await r.text()).slice(0,180);return r.status+(t?' | '+t:'')}catch(e){return 'ERR '+e.message}}
console.log('no-wm:',await st(url(false)))
console.log('with-wm:',await st(url(true)))
await c.close()
