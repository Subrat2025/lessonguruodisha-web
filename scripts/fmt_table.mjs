import fs from 'fs'
const p=JSON.parse(fs.readFileSync('/app/backups/live_switch_plan_before.json','utf8'))
const cls=p.packPlan.filter(x=>x.kind==='class').sort((a,b)=>a.cls.localeCompare(b.cls))
const sub=p.packPlan.filter(x=>x.kind==='subject').sort((a,b)=>a.cls.localeCompare(b.cls)||a.subjectKey.localeCompare(b.subjectKey))
console.log('CLASS PACKS ('+cls.length+'):')
for(const x of cls) console.log(`  Class ${x.cls}: ₹${x.from} -> ₹${x.to}   (separately ₹${x.separately})`)
console.log('\nSUBJECT PACKS ('+sub.length+'):')
for(const x of sub) console.log(`  C${x.cls} ${x.subjectKey}: ₹${x.from} -> ₹${x.to}  (sep ₹${x.separately})`)
