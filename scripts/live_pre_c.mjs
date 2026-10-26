import fs from 'fs'
const LIVE='https://lessonguruodisha.in'
async function j(p,o={}){try{const r=await fetch(LIVE+p,o);const t=await r.text();let d=null;try{d=JSON.parse(t)}catch{};return{status:r.status,d}}catch(e){return{err:String(e)}}}
const l=await j('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mobile:'9692604577',password:'Subrat@909e'})})
const H={headers:{authorization:'Bearer '+l.d.token}}
const HP={'content-type':'application/json',authorization:'Bearer '+l.d.token}

// 1) covers missing check
const miss=await j('/api/admin/store/covers/generate',{method:'POST',headers:HP,body:JSON.stringify({scope:'missing'})})
console.log('COVERS MISSING check -> total still lacking cover:', miss.d?.total, miss.d?.total===0?'✓ ALL COVERED':'(will generate remaining)')

// 2) switch-plan = before/after pack table
const sp=await j('/api/admin/store/sets/switch-plan',H)
const plan=sp.d?.plan
fs.writeFileSync('/app/backups/live_switch_plan_before.json',JSON.stringify(plan,null,2))
console.log('\nPLAN: chapters=',plan?.chaptersCount,'sets=',plan?.setsCount,'packs=',plan?.packsCount,'warnings=',plan?.warnings?.length)
console.log('\n=== CLASS PACKS before -> after ===')
for(const p of (plan?.packPlan||[]).filter(x=>x.kind==='class').sort((a,b)=>a.cls.localeCompare(b.cls)))
  console.log(`Class ${p.cls}: ₹${p.from} -> ₹${p.to}  (separately ₹${p.separately})`)
console.log('\n=== SUBJECT PACKS that CHANGE ===')
const subjChg=(plan?.packPlan||[]).filter(x=>x.kind==='subject'&&x.from!==x.to).sort((a,b)=>a.cls.localeCompare(b.cls)||a.subjectKey.localeCompare(b.subjectKey))
for(const p of subjChg) console.log(`Cls${p.cls} ${p.subjectKey}: ₹${p.from} -> ₹${p.to} (sep ₹${p.separately})`)
console.log('subject packs changing:',subjChg.length,'/ 44 packs; subject packs unchanged already matched formula')

// 3) BEFORE-c counts
const rc=await j('/api/admin/store/ops/record-counts',H)
fs.writeFileSync('/app/backups/live_BEFORE_c_counts.json',JSON.stringify(rc.d,null,2))
console.log('\nBEFORE-c counts saved. collections=',rc.d?.collectionCount,'| storeOrders=',rc.d?.counts?.storeOrders,'entitlements=',rc.d?.counts?.storeEntitlements,'users=',rc.d?.counts?.users,'payments=',rc.d?.counts?.payments)
