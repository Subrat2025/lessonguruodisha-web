// Read-only probe of the LIVE public domain API to confirm what customers see
const LIVE = 'https://lessonguruodisha.in'
async function g(path) {
  try {
    const r = await fetch(LIVE + path, { headers: { 'accept':'application/json' } })
    const t = await r.text()
    let j = null; try { j = JSON.parse(t) } catch {}
    return { status: r.status, j, raw: t.slice(0, 400) }
  } catch (e) { return { err: String(e) } }
}
console.log('=== LIVE /api/store/config ===')
const cfg = await g('/api/store/config')
console.log('status', cfg.status, '| setsLive:', cfg.j?.setsLive, '| enabled:', cfg.j?.enabled, '| raw:', cfg.err||cfg.raw?.slice(0,200))

console.log('\n=== LIVE /api/store/unit-tests/classes ===')
const cls = await g('/api/store/unit-tests/classes')
console.log('status', cls.status, '| keys:', cls.j ? Object.keys(cls.j) : cls.err, '| raw:', (cls.raw||'').slice(0,200))

console.log('\n=== LIVE /api/store/unit-tests/chapters?cls=1&subjectKey=math ===')
const ch = await g('/api/store/unit-tests/chapters?cls=1&subjectKey=math')
if (ch.j) {
  console.log('status', ch.status, '| chapterCount:', ch.j.subjects?.length || ch.j.chapterCount, '| classSeparately:', ch.j.classSeparately)
  const first = (ch.j.subjects && ch.j.subjects[0]) || null
  console.log('raw(trim):', (ch.raw||'').slice(0,500))
} else console.log('status', ch.status, '| err/raw:', ch.err || ch.raw?.slice(0,300))
