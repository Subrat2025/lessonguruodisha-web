const LIVE='https://lessonguruodisha.in'
async function j(p,o={}){try{const r=await fetch(LIVE+p,o);const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{};return{status:r.status,d}}catch(e){return{err:String(e)}}}
async function login(){const r=await j('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:'9692604577',password:'Subrat@909e'})});return r.d?.token}
const token=await login(); const H={headers:{authorization:'Bearer '+token}}
const start=Date.now(); let ok=false
for(let i=0;i<10;i++){
  const r=await j('/api/admin/store/ops/record-counts',H)
  const has = r.status===200 && r.d?.collectionCount>0
  console.log(`[${((Date.now()-start)/1000).toFixed(0)}s] record-counts=${r.status} collectionCount=${r.d?.collectionCount||'-'}`)
  if(has){ ok=true; console.log('DEPLOY#2 LIVE ✓ collections='+r.d.collectionCount); break }
  await new Promise(res=>setTimeout(res,12000))
}
if(!ok) console.log('NOT YET')
