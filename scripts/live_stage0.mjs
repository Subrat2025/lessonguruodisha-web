import fs from 'fs'
const LIVE='https://lessonguruodisha.in'
async function j(p,o={}){const r=await fetch(LIVE+p,o);const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{};return{status:r.status,d}}
const l=await j('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:'9692604577',password:'Subrat@909e'})})
const H={headers:{authorization:'Bearer '+(l.d?.token)}}
fs.mkdirSync('/app/backups',{recursive:true})

// 1) BEFORE counts (all collections)
const rc=await j('/api/admin/store/ops/record-counts',H)
fs.writeFileSync('/app/backups/live_BEFORE_counts.json', JSON.stringify(rc.d,null,2))
console.log('BEFORE counts saved. collections=',rc.d?.collectionCount)
console.log('curated BEFORE:',JSON.stringify(rc.d?.counts))

// 2) export-prices JSON backup
const ex=await j('/api/admin/store/sets/export-prices',H)
fs.writeFileSync('/app/backups/live_BEFORE_prices_export.json', JSON.stringify(ex.d,null,2))
console.log('PRICE BACKUP saved. setsLive=',ex.d?.setsLive,'products=',ex.d?.products?.length,'overrides=',JSON.stringify(ex.d?.classPackOverrides),'counts=',JSON.stringify(ex.d?.counts))

// 3) verify chapters per class via switch-plan
const sp=await j('/api/admin/store/sets/switch-plan',H)
const p=sp.d?.plan
console.log('\nSWITCH-PLAN: chapters=',p?.chaptersCount,'sets=',p?.setsCount,'packs=',p?.packsCount,'warnings=',p?.warnings?.length)
console.log('chByCls=',JSON.stringify(p?.chByCls))
const EXP={1:16,2:37,3:84,4:75,5:77,6:138,7:86}
const miss=[]
for(const [c,n] of Object.entries(EXP)) if((p?.chByCls?.[c]||0)!==n) miss.push({cls:c,expected:n,actual:p?.chByCls?.[c]||0})
console.log('CHAPTER MISMATCHES:', miss.length? JSON.stringify(miss) : 'NONE ✓ (513 expected)')
console.log('CURRENT SETS ON LIVE:', p?.setsCount, p?.setsCount===0?'(fresh, expected 0 before split)':'(non-zero!)')
