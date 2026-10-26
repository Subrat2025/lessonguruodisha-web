const LIVE='https://lessonguruodisha.in'
async function j(p,o={}){try{const r=await fetch(LIVE+p,o);const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{};return{status:r.status,d}}catch(e){return{err:String(e)}}}
async function login(){const r=await j('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:'9692604577',password:'Subrat@909e'})});return r.d?.token}
const start=Date.now()
let detected=false
const token=await login()
for(let i=0;i<10;i++){
  const r=await j('/api/admin/store/sets/export-prices',{headers:{authorization:'Bearer '+token}})
  const isNew = r.status===200 && Array.isArray(r.d?.products)
  const t=((Date.now()-start)/1000).toFixed(0)
  console.log(`[${t}s] export-prices status=${r.status} products=${Array.isArray(r.d?.products)?r.d.products.length:'-'} setsLive=${r.d?.setsLive}`)
  if(isNew){ detected=true; console.log('NEW BUILD LIVE ✓ products='+r.d.products.length+' setsLive='+r.d.setsLive); break }
  await new Promise(res=>setTimeout(res,10000))
}
if(!detected) console.log('NOT YET — new build not detected in this window; poll again.')
