import { PDFDocument, StandardFonts } from 'pdf-lib'
const BASE='http://localhost:3000/api'
async function j(p,m,t,b){const r=await fetch(`${BASE}${p}`,{method:m||'GET',headers:{...(t?{Authorization:`Bearer ${t}`}:{}),...(b&&!(b instanceof FormData)?{'Content-Type':'application/json'}:{})},body:b?(b instanceof FormData?b:JSON.stringify(b)):undefined});let d={};const ct=r.headers.get('content-type')||'';if(ct.includes('json')){try{d=await r.json()}catch(_){}}else{d={_blob:await r.arrayBuffer(),ct}}return{s:r.status,d}}
async function login(m,p){const r=await j('/auth/login','POST',null,{mobile:m,password:p});return r.d.token}
async function pdf(){const doc=await PDFDocument.create();const f=await doc.embedFont(StandardFonts.Helvetica);const pg=doc.addPage([400,500]);pg.drawText('Answer Key Sample - Q1 Ans: Bhubaneswar',{x:30,y:450,size:14,font:f});return Buffer.from(await doc.save())}
;(async()=>{
 const admin=await login('9692604577','Subrat@909e'); console.log('admin',!!admin)
 const cats=await j('/admin/store/categories','GET',admin); const catId=(cats.d.categories||[])[0]?.id
 const cp=await j('/admin/store/products','POST',admin,{type:'answer_key',titleEnglish:'TEST_Class6 Science SA1',titleOdia:'ଉତ୍ତର',classes:['6'],subject:'Science',exam:'SA1 2026',securityLevel:2,mrpInr:50,priceInr:20,categoryId:catId,previewMode:'blurred',maxPerUser:1})
 const pid=cp.d.product?.id, slug=cp.d.product?.slug; console.log('product created',cp.s,pid)
 const buf=await pdf(); const fd=new FormData(); fd.append('file',new Blob([buf],{type:'application/pdf'}),'key.pdf'); fd.append('kind','pdf')
 const up=await j(`/admin/store/products/${pid}/files`,'POST',admin,fd); console.log('file upload',up.s,up.d.file&&up.d.file.id); const fileId=up.d.file?.id
 const gp=await j(`/admin/store/products/${pid}/preview`,'POST',admin,{}); console.log('preview gen',gp.s,gp.d)
 const pub=await j(`/admin/store/products/${pid}`,'PUT',admin,{status:'published'}); console.log('publish',pub.s)
 // public product page
 const pp=await j(`/store/product/${slug}`,'GET',null); console.log('public product page',pp.s,'hasFileRef?', JSON.stringify(pp.d).includes('publicId'))
 // TEST buyer
 const a=await login('8000000001','Test@1234'); const b=await login('8000000002','Test@1234')
 const tf=await j('/store/checkout/test','POST',a,{productIds:[pid]}); console.log('TEST buy',tf.s,tf.d.ok)
 const lib=await j('/store/library','GET',a); console.log('A library count',lib.d.items?.length)
 // download token + download
 const tok=await j(`/store/file/${pid}/${fileId}/token?action=download`,'GET',a); console.log('A token',tok.s,!!tok.d.token)
 const dl=await j(`/store/download?token=${encodeURIComponent(tok.d.token)}`,'GET',a); console.log('A download',dl.s,dl.d.ct,'bytes',dl.d._blob?.byteLength)
 // B cannot get token (404) and A's token rejected for B
 const bTok=await j(`/store/file/${pid}/${fileId}/token?action=download`,'GET',b); console.log('B token (expect 404)',bTok.s)
 const bUseA=await j(`/store/download?token=${encodeURIComponent(tok.d.token)}`,'GET',b); console.log('B uses A token (expect 404)',bUseA.s)
 // already owned -> checkout test again
 const dup=await j('/store/checkout/test','POST',a,{productIds:[pid]}); console.log('A re-buy (expect error already own)',dup.s,dup.d.error)
 // cleanup: archive product + remove entitlements for TEST users + delete file
 await j(`/admin/store/products/${pid}`,'PUT',admin,{status:'archived'})
 console.log('DONE pid',pid)
})().catch(e=>{console.error('ERR',e);process.exit(1)})
