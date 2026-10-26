import fs from 'fs'
const LIVE='https://lessonguruodisha.in'
async function j(p,o={}){try{const r=await fetch(LIVE+p,o);const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{};return{status:r.status,d}}catch(e){return{err:String(e)}}}
const l=await j('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:'9692604577',password:'Subrat@909e'})})
const H={headers:{authorization:'Bearer '+l.d.token}}

// PUBLIC verification (logged-out)
const cfg=await j('/api/store/config')
console.log('PUBLIC config setsLive=',cfg.d?.setsLive)
const ch=await j('/api/store/unit-tests/chapters?cls=1&subjectKey=math')
console.log('cls1 math: totalSets=',ch.d?.totalSets,'chapterCount=',ch.d?.chapterCount)
console.log('  first chapter bundle=',JSON.stringify(ch.d?.chapters?.[0]?.bundle),'setCount=',ch.d?.chapters?.[0]?.setCount)
console.log('  subjectPack price=',(ch.d?.subjectPack?.pricing||ch.d?.subjectPack)?.price,'classPack price=',(ch.d?.classPack?.pricing||ch.d?.classPack)?.price)

// restore points
const rp=await j('/api/admin/store/sets/restore-points',H)
console.log('\nRESTORE POINTS:')
for(const p of (rp.d?.points||[]).slice(0,6)) console.log(`  ${p.kind} | ${p.label} | setsLive=${p.summary?.setsLive} | ${new Date(p.createdAt).toLocaleString('en-IN')}`)

// AFTER counts vs BEFORE-c
const rc=await j('/api/admin/store/ops/record-counts',H)
fs.writeFileSync('/app/backups/live_AFTER_counts.json',JSON.stringify(rc.d,null,2))
const before=JSON.parse(fs.readFileSync('/app/backups/live_BEFORE_c_counts.json','utf8'))
const bAll=before.allCollections||{}, aAll=rc.d?.allCollections||{}
const drops=[]
for(const k of Object.keys(bAll)){ if((aAll[k]??-1) < bAll[k]) drops.push(`${k}: ${bAll[k]} -> ${aAll[k]??'MISSING'}`) }
console.log('\nAFTER counts: collections=',rc.d?.collectionCount,'(before',before.collectionCount,')')
console.log('curated BEFORE-c:',JSON.stringify(before.counts))
console.log('curated AFTER  :',JSON.stringify(rc.d?.counts))
console.log('\nCOLLECTIONS THAT DECREASED:', drops.length? JSON.stringify(drops) : 'NONE ✓ (no data loss)')
