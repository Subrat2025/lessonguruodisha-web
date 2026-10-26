const LIVE='https://lessonguruodisha.in'
const JOB='744f3810-6e95-4eb8-8e38-e2cf5c51c888'
async function j(p,o={}){const r=await fetch(LIVE+p,o);const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{};return{status:r.status,d}}
async function login(){const r=await j('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:'9692604577',password:'Subrat@909e'})});return r.d?.token}
const H={headers:{authorization:'Bearer '+(await login())}}
const start=Date.now()
for(let i=0;i<7;i++){
  const r=await j(`/api/admin/store/sets/jobs/${JOB}`,H)
  const job=r.d?.job
  const t=((Date.now()-start)/1000).toFixed(0)
  console.log(`[${t}s] status=${job?.status} done=${job?.done}/${job?.total} created=${job?.created} errors=${(job?.errors||[]).length} warnings=${(job?.warnings||[]).length}`)
  if(job?.status==='done' || job?.status==='failed'){ console.log('FINISHED', job.status, 'created=',job.created); if((job.errors||[]).length) console.log('ERRORS sample:',JSON.stringify(job.errors.slice(0,5))); if((job.warnings||[]).length) console.log('WARN sample:',JSON.stringify(job.warnings.slice(0,5))); break }
  await new Promise(res=>setTimeout(res,14000))
}
