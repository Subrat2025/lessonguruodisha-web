import { MongoClient } from 'mongodb'
import { v2 as cloudinary } from 'cloudinary'
const c=new MongoClient(process.env.MONGO_URL); await c.connect(); const d=c.db(process.env.DB_NAME)
// find a set product's file
const setProd = await d.collection('storeProducts').findOne({type:'unit_test_set'})
const file = await d.collection('storeProductFiles').findOne({productId:setProd.id})
console.log('set product:',setProd.id,'| file doc keys:',file?Object.keys(file):'NO FILE')
console.log('file.kind:',file?.kind,'| fileRef:',JSON.stringify(file?.fileRef))
if(!file){await c.close();process.exit(0)}
// configure cloudinary
if(process.env.CLOUDINARY_URL){/*auto*/} 
cloudinary.config({cloud_name:process.env.CLOUDINARY_CLOUD_NAME,api_key:process.env.CLOUDINARY_API_KEY,api_secret:process.env.CLOUDINARY_API_SECRET,secure:true})
const ref=file.fileRef
// image page URL (like assessPageImageUrl) WITHOUT watermark
const imgNoWm=cloudinary.url(ref.publicId,{resource_type:'image',type:'authenticated',format:'jpg',secure:true,sign_url:true,version:ref.version,page:1,transformation:[{width:1200,crop:'limit',quality:'auto',fetch_format:'auto'}]})
// image page URL WITH watermark (Odia-ish)
const imgWm=cloudinary.url(ref.publicId,{resource_type:'image',type:'authenticated',format:'jpg',secure:true,sign_url:true,version:ref.version,page:1,transformation:[{width:1200,crop:'limit'},{overlay:{font_family:'Arial',font_size:30,font_weight:'bold',text:'Subrat 98XXXX77'},color:'#3b82f6',opacity:12,angle:40,flags:'tiled'}]})
// download URL (raw/image authenticated)
const dl=cloudinary.utils.private_download_url(ref.publicId, ref.format||'pdf', {resource_type:ref.resourceType||'image', type:'authenticated'})
async function st(u){try{const r=await fetch(u);return r.status}catch(e){return 'ERR '+e.message}}
console.log('IMG no-wm status:', await st(imgNoWm))
console.log('IMG with-wm status:', await st(imgWm))
console.log('DOWNLOAD status:', await st(dl))
console.log('\nimgNoWm:',imgNoWm.slice(0,160))
await c.close()
