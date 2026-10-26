const LIVE='https://lessonguruodisha.in'
const JOB=process.argv[2]
async function j(p,o={}){try{const r=await fetch(LIVE+p,o);const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{};return{status:r.status,d}}catch(e){return{err:String(e)}}}
try{
  const l=await j('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:'9692604577',password:'Subrat@909e'})})
  const H={headers:{authorization:'Bearer '+l.d.token}}
  const r=await j(`/api/admin/store/covers/jobs/${JOB}`,H)
  const job=r.d?.job
  if(!job){console.log('no job',r.status);process.exit(0)}
  console.log(`status=${job.status} done=${job.done}/${job.total} made=${job.made} failures=${(job.failures||[]).length}`)
  if(job.status!=='running'){ console.log('madeVsExpected=',JSON.stringify(job.madeVsExpected)); if((job.failures||[]).length)console.log('FAIL sample:',JSON.stringify(job.failures.slice(0,5))) }
}catch(e){console.log('EXC',String(e))}
