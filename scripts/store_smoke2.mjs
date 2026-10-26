import fs from 'fs'
const BASE='http://localhost:3000/api'
async function j(p,m,t,b){const r=await fetch(`${BASE}${p}`,{method:m||'GET',headers:{...(t?{Authorization:`Bearer ${t}`}:{}),...(b&&!(b instanceof FormData)?{'Content-Type':'application/json'}:{})},body:b?(b instanceof FormData?b:JSON.stringify(b)):undefined});let d={};const ct=r.headers.get('content-type')||'';if(ct.includes('json')){try{d=await r.json()}catch(_){}}else{d={_bytes:(await r.arrayBuffer()).byteLength,ct}}return{s:r.status,d}}
async function login(m,p){return (await j('/auth/login','POST',null,{mobile:m,password:p})).d.token}
;(async()=>{
 const admin=await login('9692604577','Subrat@909e')
 // find a class 6 paper
 const papers=(await j('/admin/store/papers?class=6','GET',admin)).d.papers||[]
 console.log('class6 papers:',papers.length, papers[0]&&papers[0].nameEnglish)
 // BULK upload the real PDF mapped to first class6 paper
 const buf=fs.readFileSync('/tmp/class6_sa1.pdf')
 const fd=new FormData(); fd.append('class','6'); fd.append('exam','SA-1 2026'); fd.append('priceInr','29'); fd.append('mrpInr','49'); fd.append('securityLevel','3')
 const mapping={}; mapping['Class_6_Science_SA1.pdf']=papers.find(p=>/sci/i.test(p.nameEnglish))?.id||papers[0].id
 fd.append('mapping',JSON.stringify(mapping))
 fd.append('files',new Blob([buf],{type:'application/pdf'}),'Class_6_Science_SA1.pdf')
 const bulk=await j('/admin/store/bulk/answer-keys','POST',admin,fd)
 console.log('BULK:',bulk.s, bulk.d.count, bulk.d.created&&bulk.d.created[0])
 const newPid=bulk.d.created?.[0]?.id, newSlug=bulk.d.created?.[0]?.slug
 // publish it so we can buy+review
 await j(`/admin/store/products/${newPid}`,'PUT',admin,{status:'published'})
 // TEST buyer buys, then reviews
 const a=await login('8000000001','Test@1234')
 const tf=await j('/store/checkout/test','POST',a,{productIds:[newPid]}); console.log('buy',tf.s,tf.d.ok); const orderId=tf.d.orderId
 const rv=await j(`/store/product/${newPid}/review`,'POST',a,{rating:5,text:'TEST_ Very helpful!'}); console.log('review post',rv.s,rv.d.review&&rv.d.review.rating)
 const rl=await j(`/store/product/${newSlug}/reviews`,'GET',null); console.log('reviews list',rl.s,rl.d.reviews?.length)
 // non-owner cannot review
 const b=await login('8000000002','Test@1234')
 const rvB=await j(`/store/product/${newPid}/review`,'POST',b,{rating:1,text:'nope'}); console.log('non-owner review (expect 403)',rvB.s)
 // receipt pdf
 const rc=await j(`/store/order/${orderId}/receipt.pdf`,'GET',a); console.log('receipt.pdf',rc.s,rc.d.ct,'bytes',rc.d._bytes)
 // admin hide review
 const arevs=(await j('/admin/store/reviews','GET',admin)).d.reviews||[]; const rid=arevs.find(x=>x.text&&x.text.includes('TEST_'))?.id
 const hide=await j(`/admin/store/reviews/${rid}/hide`,'POST',admin,{hidden:true}); console.log('hide review',hide.s)
 const rl2=await j(`/store/product/${newSlug}/reviews`,'GET',null); console.log('reviews after hide (expect 0)',rl2.d.reviews?.length)
 // cleanup this bulk product + its data
 console.log('CLEANUP pid',newPid)
})().catch(e=>{console.error('ERR',e);process.exit(1)})
