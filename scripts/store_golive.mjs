import fs from 'fs'
const BASE='http://localhost:3000/api'
async function j(p,m,t,b){const r=await fetch(`${BASE}${p}`,{method:m||'GET',headers:{...(t?{Authorization:`Bearer ${t}`}:{}),...(b&&!(b instanceof FormData)?{'Content-Type':'application/json'}:{})},body:b?(b instanceof FormData?b:JSON.stringify(b)):undefined});let d={};try{d=await r.json()}catch(_){}return{s:r.status,d}}
async function login(m,p){return (await j('/auth/login','POST',null,{mobile:m,password:p})).d.token}
;(async()=>{
 const admin=await login('9692604577','Subrat@909e')
 const cats=(await j('/admin/store/categories','GET',admin)).d.categories||[]
 const akCat=cats.find(c=>c.nameEnglish==='Answer Keys')?.id
 const papers=(await j('/admin/store/papers?class=6','GET',admin)).d.papers||[]
 const sci=papers.find(p=>/sci/i.test(p.nameEnglish))||papers[0]
 // create real product
 const cp=await j('/admin/store/products','POST',admin,{type:'answer_key',titleEnglish:`Class 6 Science SA-1 2026 Answer Key`,titleOdia:`${sci?.nameOdia||'ବିଜ୍ଞାନ'} SA-1 2026 ଉତ୍ତର ସୂଚୀ`,classes:['6'],subject:sci?.nameEnglish||'Science',exam:'SA-1 2026',paper:sci?.id||'',categoryId:akCat,securityLevel:3,printAllowed:false,mrpInr:49,priceInr:29,whatsInside:['Complete model answers','Step-wise marking','Blueprint & weightage'],previewMode:'blurred',maxPerUser:1,featured:true})
 const pid=cp.d.product.id, slug=cp.d.product.slug
 const buf=fs.readFileSync('/tmp/class6_sa1.pdf'); const fd=new FormData(); fd.append('file',new Blob([buf],{type:'application/pdf'}),'Class_6_Science_SA1_2026_Answer_Key.pdf'); fd.append('kind','pdf')
 const up=await j(`/admin/store/products/${pid}/files`,'POST',admin,fd)
 const gp=await j(`/admin/store/products/${pid}/preview`,'POST',admin,{})
 const pub=await j(`/admin/store/products/${pid}`,'PUT',admin,{status:'published'})
 console.log('REAL product:',slug,'file',up.s,up.d.file&&up.d.file.pages+'p','preview',gp.s,'publish',pub.s)
 // delete any TEST_ demo products
 const all=(await j('/admin/store/products','GET',admin)).d.products||[]
 const tests=all.filter(p=>/^TEST_/.test(p.titleEnglish))
 console.log('TEST_ demo products to delete:',tests.length)
 // flip master switch ON
 const cur=(await j('/admin/store/settings','GET',admin)).d.settings
 const sv=await j('/admin/store/settings','PUT',admin,{...cur,enabled:true})
 console.log('MASTER SWITCH:',sv.d.settings?.enabled)
 // verify a NON-beta user now sees the store + the product
 const nb=await login('9444106792','Test@1234')||await login('9999900001','Test@1234')
 const cfg=await j('/store/config','GET',nb); console.log('non-beta config.enabled:',cfg.d.enabled)
 const list=await j('/store/products','GET',nb); console.log('non-beta sees products:',list.d.products?.length)
 const pp=await j(`/store/product/${slug}`,'GET',null); console.log('public product page:',pp.s,'leak?',JSON.stringify(pp.d).includes('publicId'))
})().catch(e=>{console.error(e);process.exit(1)})
