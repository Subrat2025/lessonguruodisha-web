import fs from 'fs'
const LIVE = 'https://lessonguruodisha.in'
async function g(p){ const r=await fetch(LIVE+p,{headers:{accept:'application/json'}}); const t=await r.text(); try{return JSON.parse(t)}catch{return {__raw:t.slice(0,200)}} }

const cfg = await g('/api/store/config')
const classes = await g('/api/store/unit-tests/classes')
const out = { capturedAt: new Date().toISOString(), note: 'PRE-DEPLOY live price snapshot via public endpoints (extra safety net; authoritative export via /admin/store/sets/export-prices post-deploy).', setsLive: cfg?.setsLive, classes: classes?.classes || classes, subjects: {} }

// classes shape: try to read list
const clsList = Array.isArray(classes?.classes) ? classes.classes.map(c=>c.class||c.cls||c.id) : ['1','2','3','4','5','6','7']
for (const cls of ['1','2','3','4','5','6','7']) {
  const subs = await g(`/api/store/unit-tests/subjects?cls=${cls}`)
  const subList = subs?.subjects || subs?.items || []
  for (const s of subList) {
    const sk = s.subjectKey || s.key || s.subject
    const ch = await g(`/api/store/unit-tests/chapters?cls=${cls}&subjectKey=${sk}`)
    out.subjects[`${cls}|${sk}`] = {
      chapterCount: ch?.chapterCount,
      totalSets: ch?.totalSets,
      subjectPack: ch?.subjectPack?.pricing || ch?.subjectPack,
      classPack: ch?.classPack?.pricing || ch?.classPack,
      firstChapter: ch?.chapters?.[0] ? { title: ch.chapters[0].chapterTitle, bundle: ch.chapters[0].bundle, setCount: ch.chapters[0].setCount } : null,
    }
  }
}
fs.mkdirSync('/app/backups', { recursive: true })
const fn = `/app/backups/live_prices_pre_deploy_${Date.now()}.json`
fs.writeFileSync(fn, JSON.stringify(out, null, 2))
console.log('saved', fn)
console.log('setsLive:', out.setsLive, '| subject keys captured:', Object.keys(out.subjects).length)
console.log('sample:', JSON.stringify(out.subjects['1|math']))
