import { PDFDocument, StandardFonts } from 'pdf-lib'
const BASE='http://localhost:3000/api'
async function j(p,m,t,b){const r=await fetch(`${BASE}${p}`,{method:m||'GET',headers:{...(t?{Authorization:`Bearer ${t}`}:{}),...(b&&!(b instanceof FormData)?{'Content-Type':'application/json'}:{})},body:b?(b instanceof FormData?b:JSON.stringify(b)):undefined});let d={};try{d=await r.json()}catch(_){}return{s:r.status,d}}
async function pdf(txt){const doc=await PDFDocument.create();const f=await doc.embedFont(StandardFonts.Helvetica);const pg=doc.addPage([420,560]);pg.drawText(txt,{x:30,y:500,size:16,font:f});pg.drawText('Q1. Capital of Odisha? Ans: Bhubaneswar',{x:30,y:450,size:12,font:f});return Buffer.from(await doc.save())}
;(async()=>{
 const admin=(await j('/auth/login','POST',null,{mobile:'9692604577',password:'Subrat@909e'})).d.token
 const cats=(await j('/admin/store/categories','GET',admin)).d.categories||[]
 const akCat=cats.find(c=>c.nameEnglish==='Answer Keys')?.id
 const mk=async(body,fileTxt)=>{const cp=await j('/admin/store/products','POST',admin,body);const pid=cp.d.product.id;const buf=await pdf(fileTxt);const fd=new FormData();fd.append('file',new Blob([buf],{type:'application/pdf'}),'k.pdf');fd.append('kind','pdf');await j(`/admin/store/products/${pid}/files`,'POST',admin,fd);await j(`/admin/store/products/${pid}/preview`,'POST',admin,{});await j(`/admin/store/products/${pid}`,'PUT',admin,{status:'published'});console.log('created',body.titleEnglish,pid,cp.d.product.slug);return pid}
 await mk({type:'answer_key',titleEnglish:'TEST_Class 6 Science SA-1 2026 Answer Key',titleOdia:'ଷଷ୍ଠ ଶ୍ରେଣୀ ବିଜ୍ଞାନ ଉତ୍ତର ସୂଚୀ',classes:['6'],subject:'Science',exam:'SA-1 2026',securityLevel:2,mrpInr:60,priceInr:25,categoryId:akCat,whatsInside:['Full answer key','Step marks','Blueprint'],maxPerUser:1},'Class 6 Science SA-1 Answer Key')
 await mk({type:'pdf',titleEnglish:'TEST_Class 4 Maths Worksheet Pack',titleOdia:'ଚତୁର୍ଥ ଶ୍ରେଣୀ ଗଣିତ',classes:['4'],subject:'Maths',securityLevel:3,printAllowed:true,mrpInr:40,priceInr:0,categoryId:akCat,whatsInside:['20 worksheets']},'Class 4 Maths Worksheets')
 console.log('done')
})().catch(e=>{console.error(e);process.exit(1)})
