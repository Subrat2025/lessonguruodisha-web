'use client'
import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { sget, API, getToken } from '@/components/store/api'

const C = { indigo: '#241a5e', saffron: '#f7b32b', coral: '#c93a22', green: '#1f7a46', sky: '#1fa2d9', ground: '#f5f3fb' }
const classColor = (c) => ['#e8452c', '#1fa2d9', '#2a9d5c', '#f7b32b', '#d6336c', '#241a5e', '#0ea5e9', '#7c3aed', '#059669'][((parseInt(String(c).replace(/\D/g, '')) || 1) - 1) % 9]
const fontFamily = "'Baloo Bhaina 2','Noto Sans Oriya',system-ui,sans-serif"
const OD = '୦୧୨୩୪୫୬୭୮୯'
const asOdia = (n) => String(n == null ? '' : n).replace(/[0-9]/g, d => OD[+d])
// Marks summary line — subject-aware (Art Education shows its own component split).
const marksLine = (m) => {
  if (!m || m.marks === false) return 'ପର୍ଯ୍ୟବେକ୍ଷଣ ଆଧାରିତ'
  if (m.components) return `${asOdia(m.total ?? 25)} ମାର୍କ (${(m.parts || []).map(p => `${p.label} ${asOdia(p.marks)}`).join(' + ')})`
  if (m.frameworkUnset) return `${asOdia(m.total ?? 25)} ମାର୍କ`
  return `${asOdia(m.total)} ମାର୍କ (${asOdia(m.written)}+${asOdia(m.project)}${m.diary ? '+' + asOdia(m.diary) : ''})`
}
const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim()

// === TOB === readable task/project detail links (shareable routes)
const SUBJECT_SLUGS = { OD: 'odia', E: 'english', H: 'hindi', S: 'sanskrit', MATH: 'math', EV: 'evs', SC: 'science', SS: 'social' }
const subjSlug = (id) => SUBJECT_SLUGS[String(id || '').toUpperCase()] || String(id || '').toLowerCase()
// Compute a shareable href for every card in an item, matching the backend's
// term/position logic (sets split into term-1 then term-2 groups).
function buildCardHrefs(item) {
  if (!item) return []
  const base = `/teacher-observation/class-${String(item.class).toLowerCase()}/${subjSlug(item.subject_id)}`
  let term = 1, afterProj = false
  const counts = {}
  return (item.cards || []).map(card => {
    const part = card.part === 'B' ? 'B' : 'A'
    if (part === 'A' && afterProj) { term = 2; afterProj = false }
    const t = item.type === 'set' ? term : (item.term || 1)
    if (part === 'B') afterProj = true
    const key = `${t}|${part}`; counts[key] = (counts[key] || 0) + 1
    const kind = part === 'B' ? 'project' : 'task'
    return item.type === 'set'
      ? `${base}/set-${String(item.setCode).toLowerCase()}/term-${t}/${kind}/${counts[key]}`
      : `${base}/ch-${String(item.chapterNo).padStart(2, '0')}/${kind}/${counts[key]}`
  })
}

export default function TobApp() {
  const router = useRouter()
  const [config, setConfig] = useState(null)
  const [screen, setScreen] = useState('courses')
  const [sel, setSel] = useState({})
  const [stack, setStack] = useState([])
  const [courses, setCourses] = useState(null)
  const [tab, setTab] = useState('t1')
  const [items, setItems] = useState(null)
  const [item, setItem] = useState(null)
  const [summary, setSummary] = useState(null)
  const [coverage, setCoverage] = useState(null)
  const [register, setRegister] = useState(null)

  useEffect(() => {
    const id = 'abp-fonts'
    if (!document.getElementById(id)) { const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Baloo+Bhaina+2:wght@600;700;800&family=Noto+Sans+Oriya:wght@400;500;600;700&display=swap'; document.head.appendChild(l) }
  }, [])
  useEffect(() => { sget('/tob/config').then(setConfig).catch(() => setConfig({ enabled: false })); sget('/tob/courses').then(r => setCourses(r.courses || [])).catch(() => setCourses([])) }, [])

  // === TOB === restore in-tool navigation + scroll when returning from a
  // task/project detail route (so the browser Back button lands back where the
  // teacher was). Session-scoped only; never touches anything outside tob.
  useEffect(() => {
    let snap; try { snap = JSON.parse(sessionStorage.getItem('tob_nav') || 'null') } catch {}
    if (!snap || !snap.screen || snap.screen === 'courses') return
    const s = snap.sel || {}
    setStack(snap.stack || []); setSel(s); setTab(snap.tab || 't1'); setScreen(snap.screen)
    if (s.class && s.subject) { sget(`/tob/lomaster-summary?class=${s.class}&subject=${s.subject}`).then(setSummary).catch(() => {}); loadItems(s.class, s.subject) }
    if (snap.screen === 'item' && s.itemId) sget(`/tob/items/${s.itemId}`).then(setItem).catch(() => setItem({ error: true }))
    if (snap.screen === 'year' && s.class && s.subject) sget(`/tob/coverage?class=${s.class}&subject=${s.subject}&term=${s.term || 1}`).then(setCoverage).catch(() => {})
    if (snap.screen === 'register' && s.class && s.subject) sget(`/tob/register?class=${s.class}&subject=${s.subject}`).then(r => setRegister(r.register)).catch(() => {})
    if (snap.y) setTimeout(() => window.scrollTo(0, snap.y), 350)
  }, [])

  useEffect(() => {
    try { const prev = JSON.parse(sessionStorage.getItem('tob_nav') || '{}'); sessionStorage.setItem('tob_nav', JSON.stringify({ screen, sel, tab, stack, y: prev.y || 0 })) } catch {}
  }, [screen, sel, tab, stack])
  const rememberScroll = () => { try { const o = JSON.parse(sessionStorage.getItem('tob_nav') || '{}'); o.y = window.scrollY; o.screen = 'item'; sessionStorage.setItem('tob_nav', JSON.stringify(o)) } catch {} }

  const push = (s, patch = {}) => { setStack(x => [...x, { screen, sel, tab }]); setSel(v => ({ ...v, ...patch })); setScreen(s); window.scrollTo(0, 0) }
  const back = () => { if (stack.length) { const p = stack[stack.length - 1]; setStack(s => s.slice(0, -1)); setScreen(p.screen); setSel(p.sel); setTab(p.tab) } else router.push('/') ; window.scrollTo(0, 0) }

  const openCourse = async (co) => {
    push('course', { class: co.class, subject: co.subject_id, subject_printed: co.subject_printed, stage: co.stage }); setTab('t1'); setItems(null); setSummary(null)
    sget(`/tob/lomaster-summary?class=${co.class}&subject=${co.subject_id}`).then(setSummary).catch(() => {})
    loadItems(co.class, co.subject_id)
  }
  const loadItems = async (cls, subj) => { try { const r = await sget(`/tob/items?class=${cls}&subject=${subj}`); setItems(r.items || []) } catch { setItems([]) } }
  const openItem = async (it) => { push('item', { itemId: it.id }); setItem(null); try { const r = await sget(`/tob/items/${it.id}`); setItem(r) } catch { setItem({ error: true }) } }
  const openYear = async (term) => { push('year', { term }); setCoverage(null); try { const r = await sget(`/tob/coverage?class=${sel.class}&subject=${sel.subject}&term=${term}`); setCoverage(r) } catch { setCoverage({ error: true }) } }
  const openRegister = async () => { push('register', {}); setRegister(null); try { const r = await sget(`/tob/register?class=${sel.class}&subject=${sel.subject}`); setRegister(r.register) } catch { setRegister({ error: true }) } }

  if (config && !config.enabled) return <Shell back={() => router.push('/')}><Empty msg="ଶୀଘ୍ର ଆସୁଛି — ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ୨୫ ମାର୍କ" /></Shell>

  return (
    <Shell back={back} title="ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ୨୫ ମାର୍କ" sub="Teacher Observation · Task & Project · Two Terms">
      {screen === 'courses' && <Courses courses={courses} onOpen={openCourse} />}
      {screen === 'course' && <Course sel={sel} tab={tab} setTab={setTab} items={items} summary={summary} onItem={openItem} onYear={openYear} onRegister={openRegister} />}
      {screen === 'item' && <ItemDetail item={item} summary={summary} onNavigate={rememberScroll} />}
      {screen === 'year' && <YearView coverage={coverage} summary={summary} term={sel.term} sel={sel} />}
      {screen === 'register' && <Register register={register} sel={sel} />}
    </Shell>
  )
}

function Shell({ children, back, title, sub }) {
  return (
    <div className="min-h-screen pb-16" style={{ background: C.ground, fontFamily }}>
      <div className="sticky top-0 z-30 text-white shadow-md" style={{ background: `linear-gradient(135deg,${C.indigo},#3b2a8c)` }}>
        <div className="max-w-3xl mx-auto px-3 py-3 flex items-center gap-2">
          <button onClick={back} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-lg shrink-0">←</button>
          <div className="flex-1 min-w-0"><div className="font-extrabold text-[15px] leading-tight truncate flex items-center gap-2">{title} <span style={{ background: C.saffron, color: C.indigo, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 6 }}>ନୂଆ</span></div>{sub && <div className="text-[10px] opacity-85 truncate">{sub}</div>}</div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-3 pt-3">{children}</div>
    </div>
  )
}

function Courses({ courses, onOpen }) {
  if (courses === null) return <Grid n={4} />
  if (!courses.length) return <Empty msg="ଏପର୍ଯ୍ୟନ୍ତ କିଛି ନାହିଁ।" />
  return (
    <>
      <Title>ଶ୍ରେଣୀ ଓ ବିଷୟ · Class & subject</Title>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {courses.map((co, i) => (
          <button key={i} onClick={() => onOpen(co)} className="rounded-2xl p-4 text-left bg-white shadow-sm border active:scale-[0.99]" style={{ borderColor: '#eee' }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl text-white shrink-0" style={{ background: classColor(co.class) }}>📋</div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-[15px]" style={{ color: C.indigo }}>ଶ୍ରେଣୀ {asOdia(co.class)} · {co.subject_printed || co.subject_id}</div>
                <div className="text-[11px] text-gray-500">{co.stage}</div>
                <div className="text-[11px] mt-1 text-gray-600">{co.chapters} ଅଧ୍ୟାୟ · {co.sets} ସେଟ୍</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function Course({ sel, tab, setTab, items, summary, onItem, onYear, onRegister }) {
  const total = summary?.counts?.lo || 20
  const chaptersT1 = (items || []).filter(i => i.type === 'chapter' && i.term === 1)
  const chaptersT2 = (items || []).filter(i => i.type === 'chapter' && i.term === 2)
  const sets = (items || []).filter(i => i.type === 'set')
  const TABS = [['t1', 'ଟର୍ମ ୧'], ['t2', 'ଟର୍ମ ୨'], ['sets', 'ସେଟ୍ A–J'], ['year', 'ବାର୍ଷିକ ଆବୃତି'], ['reg', 'ରେଜିଷ୍ଟର']]
  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
        {TABS.map(([k, l]) => <button key={k} onClick={() => { if (k === 'year') onYear(1); else if (k === 'reg') onRegister(); else setTab(k) }} className={`shrink-0 text-[12px] font-bold rounded-full px-3 py-1.5 ${tab === k ? 'text-white' : 'bg-white text-gray-600 border'}`} style={tab === k ? { background: C.indigo } : { borderColor: '#eee' }}>{l}</button>)}
      </div>
      {items === null && <Grid n={5} />}
      {tab === 't1' && <ItemList items={chaptersT1} total={total} onItem={onItem} empty="ଟର୍ମ ୧ ରେ କିଛି ନାହିଁ" />}
      {tab === 't2' && <ItemList items={chaptersT2} total={total} onItem={onItem} empty="ଟର୍ମ ୨ ରେ କିଛି ନାହିଁ" />}
      {tab === 'sets' && <SetsView sets={sets} total={total} onItem={onItem} />}
    </>
  )
}

// Sets grouped by term (Term 1 / Term 2 / Full Year) so A–J are clear for each term.
function SetsView({ sets, total, onItem }) {
  if (!sets?.length) return <Empty msg="କୌଣସି ସେଟ୍ ନାହିଁ" />
  const norm = (t) => (t === 'full' || t === 'FULL') ? 'full' : String(t ?? '1')
  const groups = [['1', 'ଟର୍ମ ୧'], ['2', 'ଟର୍ମ ୨'], ['full', 'ପୂର୍ଣ୍ଣ ବର୍ଷ']]
  const present = groups.filter(([k]) => sets.some(s => norm(s.term) === k))
  return (
    <div className="space-y-4">
      {present.map(([k, label]) => (
        <div key={k}>
          <div className="text-[12px] font-bold text-gray-500 mb-1.5 px-1">{label}</div>
          <ItemList items={sets.filter(s => norm(s.term) === k)} total={total} onItem={onItem} empty="" />
        </div>
      ))}
    </div>
  )
}

function ItemList({ items, total, onItem, empty }) {
  if (!items?.length) return <Empty msg={empty} />
  return (
    <div className="space-y-2">
      {items.map(it => (
        <button key={it.id} onClick={() => onItem(it)} className="w-full rounded-2xl p-3 bg-white shadow-sm border text-left flex items-center gap-3 active:scale-[0.99]" style={{ borderColor: '#eee' }}>
          <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white shrink-0" style={{ background: it.type === 'set' ? C.green : classColor(it.class) }}>
            <span className="text-[8px] opacity-80 leading-none">{it.type === 'set' ? 'ସେଟ୍' : 'ଅଧ୍ୟାୟ'}</span>
            <span className="text-lg font-extrabold leading-none">{it.type === 'set' ? it.setCode : asOdia(it.chapterNo)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[14px] leading-tight truncate" style={{ color: C.indigo }}>{it.title}</div>
            <div className="text-[11px] text-gray-600 mt-0.5">{marksLine(it.marks)}</div>
          </div>
          <CoverageBadge covered={it.coverage?.covered} total={it.coverage?.total || total} />
        </button>
      ))}
    </div>
  )
}

function CoverageBadge({ covered, total }) {
  const pct = total ? covered / total : 0
  const col = pct >= 0.9 ? C.green : pct >= 0.5 ? C.saffron : C.coral
  return <div className="text-center shrink-0"><div className="text-[15px] font-extrabold" style={{ color: col }}>{asOdia(covered)}/{asOdia(total)}</div><div className="text-[8px] text-gray-400">LO ଆବୃତ</div></div>
}

function ItemDetail({ item, summary, onNavigate }) {
  const [chip, setChip] = useState(null)
  const hrefs = useMemo(() => buildCardHrefs(item), [item])
  if (!item) return <Grid n={5} />
  if (item.error) return <Empty msg="ଲୋଡ୍ ହେଲା ନାହିଁ।" />
  if (item.locked) {
    const t = item.item || {}
    return (
      <div style={{ padding: 16, textAlign: 'center', fontFamily: '"Noto Sans Oriya",sans-serif' }}>
        <div style={{ width: 54, height: 54, margin: '8px auto', borderRadius: 14, background: '#fef2f2', display: 'grid', placeItems: 'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c93a22" strokeWidth="2"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </div>
        <div style={{ fontWeight: 900, fontSize: 16, color: '#241a5e' }}>{t.type === 'set' ? `ସେଟ୍ ${t.setCode}` : `ଅଧ୍ୟାୟ ${t.chapterNo}`} ତାଲାବନ୍ଦ</div>
        <div style={{ fontSize: 13, color: '#6b5b47', margin: '6px 0 14px' }}>ଏହି ସାମଗ୍ରୀ କିଣିବା ପରେ ଖୋଲିବ।</div>
        <a href="/store/teacher-observation" style={{ display: 'inline-block', padding: '11px 26px', background: '#c93a22', color: '#fff', borderRadius: 12, fontWeight: 900, textDecoration: 'none' }}>କିଣନ୍ତୁ</a>
      </div>
    )
  }
  const masterLos = summary?.los || []
  const total = summary?.counts?.lo || item.coverage?.total || 20
  // compute per-LO coverage by task/project from cards
  const byCode = {}
  for (const card of (item.cards || [])) for (const lo of (card.los || [])) { const c = norm(lo.lo_code); if (!c) continue; byCode[c] = byCode[c] || { task: 0, project: 0 }; if (card.part === 'B') byCode[c].project++; else byCode[c].task++ }
  const coveredCodes = new Set(Object.keys(byCode))
  const uncovered = masterLos.filter(l => !coveredCodes.has(norm(l.lo_code)))
  return (
    <>
      <div className="rounded-2xl p-4 text-white shadow" style={{ background: `linear-gradient(135deg,${item.type === 'set' ? C.green : classColor(item.class)},${C.indigo})` }}>
        <div className="text-[11px] font-bold opacity-85">{item.type === 'set' ? `ସେଟ୍ ${item.setCode}` : `ଅଧ୍ୟାୟ ${asOdia(item.chapterNo)}`} · {item.stage} · {item.term === 'full' ? 'ପୂର୍ଣ୍ଣ ବର୍ଷ' : item.type === 'chapter' ? `ଟର୍ମ ${asOdia(item.term)}` : (item.term === 2 || item.term === '2') ? 'ଟର୍ମ ୨' : 'ଟର୍ମ ୧'}</div>
        <div className="text-xl font-extrabold leading-tight mt-0.5">{item.title}</div>
        {item.marks?.marks !== false && <div className="text-[12px] opacity-90 mt-1">{item.marks?.components ? `ମାର୍କ ${asOdia(item.marks?.total ?? 25)} = ${(item.marks?.parts || []).map(p => `${p.label} ${asOdia(p.marks)}`).join(' + ')}${item.marks?.performance ? ` · ପ୍ରଦର୍ଶନ ${asOdia(item.marks.performance)}` : ''}` : item.marks?.frameworkUnset ? `ମାର୍କ ${asOdia(item.marks?.total ?? 25)}` : `ମାର୍କ ${asOdia(item.marks?.total)} = ଲିଖିତ ${asOdia(item.marks?.written)} + ପ୍ରକଳ୍ପ ${asOdia(item.marks?.project)}${item.marks?.diary ? ` + ଡାଏରୀ ${asOdia(item.marks.diary)}` : ''} · ଭାର ${item.marks?.weightage}`}</div>}
      </div>

      {/* coverage grid */}
      <div className="bg-white border rounded-2xl p-3 mt-3" style={{ borderColor: '#eee' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-extrabold text-[13px]" style={{ color: C.indigo }}>{asOdia(total)}ଟି LO ମଧ୍ୟରୁ {asOdia(coveredCodes.size)}ଟି ଆବୃତ</div>
          <div className="flex items-center gap-2 text-[10px]"><span className="flex items-center gap-1"><Dot c={C.sky} /> କାର୍ଯ୍ୟ</span><span className="flex items-center gap-1"><Dot c={C.green} /> ପ୍ରକଳ୍ପ</span><span className="flex items-center gap-1"><Dot c="#e5e0f0" /> ବାକି</span></div>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
          {masterLos.map((l, i) => {
            const c = byCode[norm(l.lo_code)]
            const bg = !c ? '#eef0f6' : (c.project && c.task) ? `linear-gradient(135deg,${C.sky},${C.green})` : c.project ? C.green : C.sky
            return <button key={i} onClick={() => setChip(l)} className="rounded-lg py-1.5 text-[9px] font-bold text-center" style={{ background: bg, color: c ? '#fff' : '#9aa' }}>{l.lo_code.replace(/^[A-Z]+\s*/, '')}</button>
          })}
        </div>
        {chip && (
          <div className="mt-2 rounded-xl p-2.5 text-[12px]" style={{ background: '#f8f7fc' }}>
            <div className="flex items-center gap-1.5 flex-wrap mb-1"><Chip c="#241a5e" bg="#eceafc">{chip.lo_code}</Chip><Chip c="#075985" bg="#e0f2fe">{chip.cg}</Chip><Chip c="#92400e" bg="#fef9e7">{chip.competency}</Chip></div>
            <div className="text-gray-800">{chip.lo_text}</div>
            <div className="text-[11px] text-gray-500 mt-1"><b>ଦକ୍ଷତା:</b> {chip.competency_text}</div>
            <div className="text-[11px] text-gray-500"><b>ଲକ୍ଷ୍ୟ:</b> {chip.cg_text}</div>
          </div>
        )}
      </div>

      {/* uncovered */}
      {!!uncovered.length && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mt-3">
          <div className="font-bold text-[12px] text-amber-800 mb-1.5">ଏହି {item.type === 'set' ? 'ସେଟ୍' : 'ଅଧ୍ୟାୟ'}ରେ ବାକି ଥିବା LO ({asOdia(uncovered.length)})</div>
          <div className="flex flex-wrap gap-1.5">{uncovered.map((l, i) => <button key={i} onClick={() => setChip(l)}><Chip c="#92400e" bg="#fef3c7">{l.lo_code}</Chip></button>)}</div>
        </div>
      )}

      {/* cards — each is now a real, shareable link to its detail page */}
      <Title className="mt-4">କାର୍ଯ୍ୟ ଓ ପ୍ରକଳ୍ପ · Tasks & projects <span className="font-semibold text-gray-400">· ଖୋଲିବାକୁ ଟ୍ୟାପ୍ କରନ୍ତୁ</span></Title>
      <div className="space-y-2">
        {(item.cards || []).map((card, i) => (
          <a key={i} href={hrefs[i]} onClick={onNavigate} className="block rounded-xl bg-white border p-3 active:scale-[0.99] transition hover:shadow-md" style={{ borderColor: card.part === 'B' ? C.green : C.sky, borderLeftWidth: 4 }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold rounded px-1.5 py-0.5 text-white" style={{ background: card.part === 'B' ? C.green : C.sky }}>{card.part === 'B' ? 'ପ୍ରକଳ୍ପ' : 'ଲିଖିତ'} {asOdia(card.num)}</span>
              <span className="font-bold text-[13px] flex-1 min-w-0" style={{ color: C.indigo }}>{card.title}</span>
              <span className="text-gray-300 text-lg shrink-0">›</span>
            </div>
            {card.kind && <div className="text-[11px] text-gray-500 mb-1">{card.kind}</div>}
            <div className="flex flex-wrap gap-1">{(card.los || []).map((lo, k) => <Chip key={k} c="#64748b" bg="#f1f5f9">{lo.lo_code}</Chip>)}</div>
          </a>
        ))}
      </div>
    </>
  )
}

function YearView({ coverage, summary, term, sel }) {
  const [busy, setBusy] = useState(false)
  if (!coverage) return <Grid n={4} />
  if (coverage.error) return <Empty msg="ଲୋଡ୍ ହେଲା ନାହିଁ।" />
  const los = summary?.los || []
  const counts = coverage.counts || {}
  const downloadPdf = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${API}/tob/coverage/pdf?class=${sel.class}&subject=${sel.subject}&term=${term}&t=${encodeURIComponent(getToken() || '')}`, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Download failed') }
      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Coverage-Term${term}.pdf`; a.click()
    } catch (e) { alert(e.message || 'ଡାଉନଲୋଡ୍ ହେଲା ନାହିଁ') } finally { setBusy(false) }
  }
  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Title>ବାର୍ଷିକ LO ଆବୃତି · ଟର୍ମ {asOdia(term)} ({coverage.items} ଆଇଟମ୍)</Title>
        {getToken() && <button onClick={downloadPdf} disabled={busy} className="ml-auto text-[11px] font-bold rounded-full px-3 py-1.5 text-white disabled:opacity-50" style={{ background: C.coral }}>{busy ? '…' : '⬇️ ରିପୋର୍ଟ PDF'}</button>}
      </div>
      <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: '#eee' }}>
        {los.map((l, i) => {
          const c = counts[norm(l.lo_code)] || { task: 0, project: 0, total: 0 }
          return (
            <div key={i} className="flex items-center gap-2 px-3 py-2 border-b last:border-0 text-[12px]">
              <Chip c="#241a5e" bg="#eceafc">{l.lo_code}</Chip>
              <span className="flex-1 truncate text-gray-700">{l.lo_text}</span>
              {c.total ? <span className="flex items-center gap-1 shrink-0"><span className="text-[10px] font-bold px-1.5 rounded" style={{ background: '#e0f2fe', color: '#075985' }}>{asOdia(c.task)}</span><span className="text-[10px] font-bold px-1.5 rounded" style={{ background: '#dcfce7', color: '#166534' }}>{asOdia(c.project)}</span></span> : <span className="text-[10px] text-rose-400 shrink-0">ବାକି</span>}
            </div>
          )
        })}
      </div>
      <div className="text-[10px] text-gray-400 mt-2 flex gap-3"><span><span className="inline-block w-2 h-2 rounded-full" style={{ background: C.sky }} /> କାର୍ଯ୍ୟ ଥର</span><span><span className="inline-block w-2 h-2 rounded-full" style={{ background: C.green }} /> ପ୍ରକଳ୍ପ ଥର</span></div>
    </>
  )
}

function Register({ register, sel }) {
  const [student, setStudent] = useState('')
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)
  if (!register) return <Grid n={3} />
  if (register.error) return <Empty msg="ରେଜିଷ୍ଟର ନାହିଁ।" />
  const dl = async (makeReq, fname) => {
    setBusy(true)
    try {
      const res = await makeReq()
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Download failed') }
      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; a.click()
    } catch (e) { alert(e.message || 'ଡାଉନଲୋଡ୍ ହେଲା ନାହିଁ') } finally { setBusy(false) }
  }
  const H = () => getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
  const one = () => dl(() => fetch(`${API}/tob/register/pdf?class=${sel.class}&subject=${sel.subject}&student=${encodeURIComponent(student || '')}&t=${encodeURIComponent(getToken() || '')}`, { headers: H() }), `Records-Register-${student || 'all'}.pdf`)
  const many = () => { const names = bulk.split(/[\n,]+/).map(s => s.trim()).filter(Boolean); if (!names.length) { alert('ଅତି କମ୍‌ରେ ଗୋଟିଏ ନାମ ଲେଖନ୍ତୁ'); return } dl(() => fetch(`${API}/tob/register/pdf-bulk`, { method: 'POST', headers: { ...H(), 'Content-Type': 'application/json' }, body: JSON.stringify({ class: sel.class, subject: sel.subject, students: names }) }), `Records-Register-bulk.pdf`) }
  return (
    <>
      <Title>{register.title}</Title>
      <div className="bg-white border rounded-2xl p-3 mb-2" style={{ borderColor: '#eee' }}>
        <div className="text-[12px] font-bold mb-1.5" style={{ color: C.indigo }}>ଗୋଟିଏ ଛାତ୍ର · Single student</div>
        <div className="flex gap-2">
          <input value={student} onChange={e => setStudent(e.target.value)} placeholder="ଛାତ୍ର/ଛାତ୍ରୀ ନାମ (ଇଚ୍ଛାଧୀନ)" className="flex-1 border rounded-lg px-2 py-2 text-[13px]" style={{ borderColor: '#e5e0f0', fontFamily }} />
          <button onClick={one} disabled={busy} className="text-[12px] font-bold rounded-lg px-3 py-2 text-white shrink-0 disabled:opacity-50" style={{ background: C.coral }}>{busy ? '…' : '⬇️ PDF'}</button>
        </div>
      </div>
      <div className="bg-white border rounded-2xl p-3 mb-3" style={{ borderColor: '#eee' }}>
        <div className="text-[12px] font-bold mb-1.5" style={{ color: C.indigo }}>ଶ୍ରେଣୀ ତାଲିକା · Bulk (one register per student)</div>
        <textarea value={bulk} onChange={e => setBulk(e.target.value)} rows={4} placeholder={'ପ୍ରତ୍ୟେକ ନାମ ନୂଆ ଧାଡ଼ିରେ ଲେଖନ୍ତୁ…\nଉଦାହରଣ:\nରାହୁଲ ସାହୁ\nପ୍ରିୟା ଦାସ'} className="w-full border rounded-lg px-2 py-2 text-[13px]" style={{ borderColor: '#e5e0f0', fontFamily }} />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-400">{bulk.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length} ଜଣ · ସର୍ବାଧିକ ୬୦</span>
          <button onClick={many} disabled={busy} className="text-[12px] font-bold rounded-lg px-3 py-2 text-white disabled:opacity-50" style={{ background: C.green }}>{busy ? 'ପ୍ରସ୍ତୁତ…' : '⬇️ ସମସ୍ତ ଛାତ୍ରଙ୍କ PDF'}</button>
        </div>
      </div>
      <div className="space-y-4">
        {(register.forms || []).map((f, i) => (
          <div key={i} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#eee' }}>
            {f.caption && <div className="px-3 py-2 text-[12px] font-extrabold text-white" style={{ background: C.indigo }}>{f.caption}</div>}
            <div className="overflow-x-auto"><table className="w-full text-[11px]"><tbody>{(f.rows || []).map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} colSpan={c.colspan || 1} className="px-2 py-1.5 border-b align-top" style={{ borderColor: '#f1f1f1' }}>{c.text}</td>)}</tr>)}</tbody></table></div>
          </div>
        ))}
      </div>
    </>
  )
}

function Title({ children, className = '' }) { return <div className={`text-[13px] font-extrabold mb-2 ${className}`} style={{ color: C.indigo }}>{children}</div> }
function Chip({ children, c, bg }) { return <span className="inline-block text-[10px] font-bold rounded px-1.5 py-0.5" style={{ color: c, background: bg }}>{children}</span> }
function Dot({ c }) { return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c }} /> }
function Grid({ n = 4 }) { return <div className="grid grid-cols-2 gap-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-white/70 animate-pulse border" style={{ borderColor: '#eee' }} />)}</div> }
function Empty({ msg }) { return <div className="text-center text-sm text-gray-400 py-12">{msg}</div> }
