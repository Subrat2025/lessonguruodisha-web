'use client'
import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { sget, spost, getToken, API } from '@/components/store/api'

// ---- brand + stage tokens ----
const C = { indigo: '#241a5e', saffron: '#f7b32b', coral: '#c93a22', green: '#1f7a46', ground: '#f5f3fb' }
const CLASS_TILE = ['#e8452c', '#1fa2d9', '#2a9d5c', '#f7b32b', '#d6336c', '#241a5e', '#0ea5e9', '#7c3aed', '#059669']
const classColor = (c) => CLASS_TILE[((parseInt(String(c).replace(/\D/g, '')) || 1) - 1) % CLASS_TILE.length]
const STAGE_STYLE = {
  s1: { border: '#0ea5e9', tint: '#e0f2fe', dark: '#075985' },
  s2: { border: '#1f7a46', tint: '#dcfce7', dark: '#166534' },
  s3: { border: '#f7b32b', tint: '#fef9e7', dark: '#92400e' },
  s4: { border: '#c93a22', tint: '#fdeae7', dark: '#991b1b' },
  s5: { border: '#7c3aed', tint: '#ede9fe', dark: '#5b21b6' },
}
const genreColor = (g) => {
  const m = { 'ପଦ୍ୟ': '#7c3aed', 'ଗଦ୍ୟ': '#0ea5e9', 'ଜୀବନୀ': '#059669', 'ଏକାଙ୍କିକା': '#db2777', 'ଚିତ୍ରକଥା': '#f59e0b', 'ଶିଶୁନାଟକ': '#d6336c' }
  return m[g] || C.coral
}

const fontFamily = "'Baloo Bhaina 2','Noto Sans Oriya',system-ui,sans-serif"

function Chip({ children, color = C.indigo, bg }) {
  return <span className="inline-block text-[11px] font-bold rounded-full px-2 py-0.5 leading-tight" style={{ color, background: bg || (color + '18') }}>{children}</span>
}

export default function AbpApp() {
  const router = useRouter()
  const [config, setConfig] = useState(null)
  const [screen, setScreen] = useState('classes') // classes|courses|chapters|chapter|period|yearplan
  const [sel, setSel] = useState({})
  const [stack, setStack] = useState([])

  const [classes, setClasses] = useState(null)
  const [courses, setCourses] = useState(null)
  const [chapters, setChapters] = useState(null)
  const [chapterData, setChapterData] = useState(null)
  const [periodIdx, setPeriodIdx] = useState(0)
  const [yearPlan, setYearPlan] = useState(null)
  const [search, setSearch] = useState('')

  // Google fonts
  useEffect(() => {
    const id = 'abp-fonts'
    if (!document.getElementById(id)) {
      const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'
      l.href = 'https://fonts.googleapis.com/css2?family=Baloo+Bhaina+2:wght@500;600;700;800&family=Noto+Sans+Oriya:wght@400;500;600;700&display=swap'
      document.head.appendChild(l)
    }
  }, [])

  useEffect(() => {
    (async () => {
      try { const c = await sget('/abp/config'); setConfig(c) } catch { setConfig({ enabled: false }) }
      try { const r = await sget('/abp/classes'); setClasses(r.classes || []) } catch { setClasses([]) }
    })()
  }, [])

  const push = (next, patch = {}) => { setStack(s => [...s, { screen, sel }]); setSel(s => ({ ...s, ...patch })); setScreen(next); setSearch(''); window.scrollTo(0, 0) }
  const back = () => {
    if (stack.length) { const prev = stack[stack.length - 1]; setStack(s => s.slice(0, -1)); setScreen(prev.screen); setSel(prev.sel); window.scrollTo(0, 0) }
    else router.push('/')
  }

  const openClass = async (cls) => {
    push('courses', { class: cls }); setCourses(null)
    try { const r = await sget(`/abp/courses?class=${encodeURIComponent(cls)}`); setCourses(r.courses || []) } catch { setCourses([]) }
  }
  const openCourse = async (co) => {
    push('chapters', { class: co.class, subject: co.subject, book: co.book, hasYearPlan: co.hasYearPlan }); setChapters(null)
    try { const r = await sget(`/abp/chapters?class=${encodeURIComponent(co.class)}&subject=${encodeURIComponent(co.subject)}&book=${encodeURIComponent(co.book || '')}`); setChapters(r.chapters || []) } catch { setChapters([]) }
  }
  const openChapter = async (ch) => {
    push('chapter', { chapterId: ch.id }); setChapterData(null)
    try { const r = await sget(`/abp/chapters/${ch.id}`); setChapterData(r) } catch { setChapterData({ error: true }) }
  }
  const openPeriod = (idx) => {
    const p = chapterData?.periods?.[idx]
    if (p?.locked) { toast.error('🔒 ଏହି ପିରିୟଡ୍ Premium ସଦସ୍ୟଙ୍କ ପାଇଁ। ଦୟାକରି Premium ନିଅନ୍ତୁ।'); return }
    setPeriodIdx(idx); push('period', {})
    spost(`/abp/chapters/${sel.chapterId}/period-view`, { periodId: p?.id }).catch(() => {})
  }
  const openYearPlan = async () => {
    push('yearplan', {}); setYearPlan(null)
    try { const r = await sget(`/abp/yearplan?class=${encodeURIComponent(sel.class)}&subject=${encodeURIComponent(sel.subject)}&book=${encodeURIComponent(sel.book || '')}`); setYearPlan(r.yearPlan) } catch { setYearPlan({ error: true }) }
  }

  const toggleTaught = async (period) => {
    if (!getToken()) { toast.error('ଦୟାକରି Login କରନ୍ତୁ'); return }
    const taught = !(chapterData.progress?.taught || []).includes(period.id)
    try {
      const r = await spost(`/abp/chapters/${sel.chapterId}/taught`, { periodId: period.id, taught })
      setChapterData(d => ({ ...d, progress: r.progress }))
      toast.success(taught ? '✅ ପଢ଼ାଇସାରିଲି' : 'ଚିହ୍ନ ହଟାଗଲା')
    } catch { toast.error('ସେଭ୍ ହେଲା ନାହିଁ') }
  }

  const downloadPdf = async (kind = 'chapter') => {
    const url = kind === 'chapter'
      ? `${API}/abp/chapters/${sel.chapterId}/pdf?t=${encodeURIComponent(getToken() || '')}`
      : `${API}/abp/yearplan/pdf?class=${encodeURIComponent(sel.class)}&subject=${encodeURIComponent(sel.subject)}&book=${encodeURIComponent(sel.book || '')}&t=${encodeURIComponent(getToken() || '')}`
    toast.loading('PDF ପ୍ରସ୍ତୁତ ହେଉଛି…', { id: 'abp-pdf' })
    try {
      const res = await fetch(url, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Download failed') }
      const blob = await res.blob()
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `${kind === 'chapter' ? (chapterData?.chapter?.title || 'chapter') : 'year-plan'}.pdf`; a.click()
      toast.success('ଡାଉନଲୋଡ୍ ଆରମ୍ଭ ହେଲା', { id: 'abp-pdf' })
    } catch (e) { toast.error(e.message || 'ଡାଉନଲୋଡ୍ ହେଲା ନାହିଁ', { id: 'abp-pdf' }) }
  }

  if (config && !config.enabled) {
    return <Shell back={() => router.push('/')}><div className="max-w-md mx-auto text-center p-10"><div className="text-5xl mb-3">📘</div><h2 className="font-extrabold text-lg" style={{ color: C.indigo }}>ଶୀଘ୍ର ଆସୁଛି</h2><p className="text-sm text-gray-500 mt-2">କାର୍ଯ୍ୟଭିତ୍ତିକ ପଞ୍ଚପଦୀ ପାଠ ଯୋଜନା ଶୀଘ୍ର ଉପଲବ୍ଧ ହେବ।</p></div></Shell>
  }

  return (
    <Shell back={back} title="କାର୍ଯ୍ୟଭିତ୍ତିକ ପଞ୍ଚପଦୀ ପାଠ ଯୋଜନା" sub="Activity-based Panchapadi Lesson Plans">
      {screen === 'classes' && <ClassesScreen classes={classes} onOpen={openClass} />}
      {screen === 'courses' && <CoursesScreen sel={sel} courses={courses} onOpen={openCourse} />}
      {screen === 'chapters' && <ChaptersScreen sel={sel} chapters={chapters} search={search} setSearch={setSearch} onOpen={openChapter} onYearPlan={openYearPlan} />}
      {screen === 'chapter' && <ChapterScreen data={chapterData} onPeriod={openPeriod} onDownload={() => downloadPdf('chapter')} onTaught={toggleTaught} />}
      {screen === 'period' && <PeriodScreen data={chapterData} idx={periodIdx} setIdx={setPeriodIdx} onBackToList={() => { setScreen('chapter'); window.scrollTo(0, 0) }} onTaught={toggleTaught} openPeriod={openPeriod} />}
      {screen === 'yearplan' && <YearPlanScreen yearPlan={yearPlan} onDownload={() => downloadPdf('year')} />}
    </Shell>
  )
}

function Shell({ children, back, title, sub }) {
  return (
    <div className="min-h-screen pb-16" style={{ background: C.ground, fontFamily }}>
      <div className="sticky top-0 z-30 text-white shadow-md" style={{ background: `linear-gradient(135deg,${C.indigo},#3b2a8c)` }}>
        <div className="max-w-3xl mx-auto px-3 py-3 flex items-center gap-2">
          <button onClick={back} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-lg shrink-0">←</button>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-[15px] leading-tight truncate flex items-center gap-2">{title || 'LessonGuru'} {title && <span style={{ background: C.saffron, color: C.indigo, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 6 }}>ନୂଆ</span>}</div>
            {sub && <div className="text-[10px] opacity-85 truncate">{sub}</div>}
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-3 pt-3">{children}</div>
    </div>
  )
}

const CLASS_LABELS = { 0: 'ବାଲବାଟିକା', 1: '୧', 2: '୨', 3: '୩', 4: '୪', 5: '୫', 6: '୬', 7: '୭', 8: '୮' }

function ClassesScreen({ classes, onOpen }) {
  if (classes === null) return <Grid n={6} />
  if (!classes.length) return <Empty msg="ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଶ୍ରେଣୀ ଉପଲବ୍ଧ ନାହିଁ।" />
  return (
    <>
      <SectionTitle>ଶ୍ରେଣୀ ବାଛନ୍ତୁ · Choose class</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {classes.map(c => (
          <button key={c.class} onClick={() => onOpen(c.class)} className="rounded-2xl p-4 text-white text-left shadow active:scale-[0.98] transition" style={{ background: classColor(c.class) }}>
            <div className="text-[11px] font-bold opacity-85">ଶ୍ରେଣୀ</div>
            <div className="text-3xl font-extrabold leading-none mt-0.5">{CLASS_LABELS[c.class] ?? c.class}</div>
            <div className="text-[11px] mt-2 opacity-95">{c.chapters} ଅଧ୍ୟାୟ · {c.periods} ପିରିୟଡ୍</div>
          </button>
        ))}
      </div>
    </>
  )
}

function CoursesScreen({ sel, courses, onOpen }) {
  if (courses === null) return <Grid n={4} />
  if (!courses.length) return <Empty msg="ଏହି ଶ୍ରେଣୀ ପାଇଁ କୌଣସି ବିଷୟ ନାହିଁ।" />
  return (
    <>
      <SectionTitle>ବିଷୟ ବାଛନ୍ତୁ · Choose subject</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {courses.map((co, i) => (
          <button key={i} onClick={() => onOpen(co)} className="rounded-2xl p-4 text-left bg-white shadow-sm border active:scale-[0.99] transition" style={{ borderColor: '#eee' }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl text-white shrink-0" style={{ background: classColor(co.class) }}>📖</div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-[15px]" style={{ color: C.indigo }}>{co.subject}</div>
                {co.book && <div className="text-[12px] text-gray-500">{co.book}</div>}
                <div className="text-[11px] mt-1 text-gray-600">{co.chapters} ଅଧ୍ୟାୟ · {co.periods} ପିରିୟଡ୍</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

function ChaptersScreen({ sel, chapters, search, setSearch, onOpen, onYearPlan }) {
  const filtered = useMemo(() => {
    if (!chapters) return null
    const s = search.trim().toLowerCase()
    if (!s) return chapters
    return chapters.filter(c =>
      (c.title || '').toLowerCase().includes(s) || (c.titleFull || '').toLowerCase().includes(s) ||
      (c.theme || '').toLowerCase().includes(s) || (c.genre || '').toLowerCase().includes(s) ||
      (c.loCodes || []).some(l => (l.code || '').toLowerCase().includes(s)))
  }, [chapters, search])
  return (
    <>
      {sel.hasYearPlan && (
        <button onClick={onYearPlan} className="w-full mb-3 rounded-2xl p-3.5 text-white text-left flex items-center gap-3 shadow active:scale-[0.99]" style={{ background: `linear-gradient(135deg,${C.green},#2a9d5c)` }}>
          <span className="text-2xl">🗓️</span>
          <div className="flex-1"><div className="font-extrabold text-[14px]">ବାର୍ଷିକ ପାଠ ଯୋଜନା ସାରଣୀ</div><div className="text-[11px] opacity-90">Annual period / CG / Competency / LO table</div></div>
          <span className="text-[16px]">→</span>
        </button>
      )}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 ଅଧ୍ୟାୟ, ବିଷୟ କିମ୍ବା LO Code ଖୋଜନ୍ତୁ…" className="w-full mb-3 rounded-xl border px-3 py-2.5 text-[14px] bg-white outline-none" style={{ borderColor: '#e5e0f0', fontFamily }} />
      <SectionTitle>{sel.subject} {sel.book ? `· ${sel.book}` : ''}</SectionTitle>
      {filtered === null && <Grid n={5} />}
      {filtered && filtered.length === 0 && <Empty msg="କିଛି ମିଳିଲା ନାହିଁ।" />}
      <div className="space-y-2.5">
        {filtered?.map(ch => (
          <button key={ch.id} onClick={() => onOpen(ch)} className="w-full rounded-2xl p-3 bg-white shadow-sm border text-left flex items-center gap-3 active:scale-[0.99] transition" style={{ borderColor: '#eee' }}>
            <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center text-white shrink-0" style={{ background: classColor(sel.class) }}>
              <span className="text-[8px] opacity-80 leading-none">ଅଧ୍ୟାୟ</span>
              <span className="text-xl font-extrabold leading-none">{ch.number}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-[14px] leading-tight" style={{ color: C.indigo }}>{ch.title}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {ch.genre && <Chip color={genreColor(ch.genre)}>{ch.genre}</Chip>}
                <Chip color={C.coral}>{ch.periodCount} ପିରିୟଡ୍</Chip>
              </div>
              {ch.theme && <div className="text-[11px] text-gray-500 mt-1 line-clamp-1">{ch.theme}</div>}
            </div>
            <span className="text-gray-300 text-lg">→</span>
          </button>
        ))}
      </div>
    </>
  )
}

function ChapterScreen({ data, onPeriod, onDownload, onTaught }) {
  if (!data) return <Grid n={6} />
  if (data.error) return <Empty msg="ଅଧ୍ୟାୟ ଲୋଡ୍ ହେଲା ନାହିଁ।" />
  const ch = data.chapter, periods = data.periods || []
  const taught = data.progress?.taught || []
  const done = periods.filter(p => taught.includes(p.id)).length
  const pct = periods.length ? Math.round((done / periods.length) * 100) : 0
  return (
    <>
      {/* hero */}
      <div className="rounded-2xl p-4 text-white shadow" style={{ background: `linear-gradient(135deg,${classColor(ch.class)},${C.indigo})` }}>
        <div className="text-[11px] font-bold opacity-85">ଅଧ୍ୟାୟ {ch.number} · {ch.classLabel}</div>
        <div className="text-xl font-extrabold leading-tight mt-0.5">{ch.title}</div>
        {ch.genre && <span className="inline-block mt-1 text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: '#ffffff30' }}>{ch.genre}</span>}
        <div className="text-[12px] opacity-90 mt-1">{ch.subject}{ch.book ? ` · ${ch.book}` : ''} · {ch.periodCount} ପିରିୟଡ୍</div>
      </div>
      {/* 3 boxes */}
      <div className="grid grid-cols-1 gap-2 mt-3">
        {ch.theme && <InfoBox title="ମୂଳ ଭାବନା · Theme" color={C.saffron}>{ch.theme}</InfoBox>}
        {ch.mainCompetencies && <InfoBox title="ମୁଖ୍ୟ ଦକ୍ଷତା · Main Competencies" color={C.sky || '#1fa2d9'}>{ch.mainCompetencies}</InfoBox>}
        {ch.mainLearningOutcomes && <InfoBox title="ମୁଖ୍ୟ ଶିକ୍ଷଣ ଫଳାଫଳ · Main LOs" color={C.green}>{ch.mainLearningOutcomes}</InfoBox>}
      </div>
      {!!(ch.loCodes || []).length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ch.loCodes.map((l, i) => <Chip key={i} color={C.indigo} bg="#eceafc">{l.code}</Chip>)}
        </div>
      )}
      {/* download */}
      {data.download?.ok ? (
        <button onClick={onDownload} className="w-full mt-3 rounded-xl py-3 text-white font-bold text-[14px] shadow active:scale-[0.99]" style={{ background: C.coral }}>⬇️ ଅଧ୍ୟାୟ PDF ଡାଉନଲୋଡ</button>
      ) : (
        <div className="w-full mt-3 rounded-xl py-2.5 text-center text-[12px] font-semibold border" style={{ borderColor: '#e5e0f0', color: '#9aa', background: '#fff' }}>
          {data.download?.reason === 'PREMIUM_REQUIRED' ? '🔒 PDF ଡାଉନଲୋଡ Premium ପାଇଁ' : '🔒 PDF ଡାଉନଲୋଡ ବନ୍ଦ ଅଛି'}
        </div>
      )}
      {/* progress */}
      <div className="mt-4 bg-white rounded-xl p-3 border" style={{ borderColor: '#eee' }}>
        <div className="flex items-center justify-between text-[12px] font-bold" style={{ color: C.indigo }}>
          <span>ଅଗ୍ରଗତି · Progress</span><span>{done} / {periods.length} ପିରିୟଡ୍</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full mt-1.5 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: C.green }} /></div>
      </div>
      {/* period list */}
      <SectionTitle className="mt-4">ପିରିୟଡ୍ ତାଲିକା · Periods</SectionTitle>
      <div className="space-y-2">
        {periods.map((p, i) => {
          const isTaught = taught.includes(p.id)
          return (
            <div key={p.id} className="rounded-xl bg-white border p-2.5 flex items-center gap-3" style={{ borderColor: isTaught ? C.green : '#eee' }}>
              <button onClick={() => onPeriod(i)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-white shrink-0 text-[13px]" style={{ background: p.locked ? '#c7c7d1' : classColor(p.chapterId ? i + 1 : 1) }}>
                  {p.locked ? '🔒' : asOdia(p.number)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px] leading-tight truncate" style={{ color: p.locked ? '#9aa' : C.indigo }}>{p.title}</div>
                  <div className="flex gap-1 mt-0.5 flex-wrap">{(p.loCodes || []).slice(0, 3).map((l, k) => <Chip key={k} color="#64748b" bg="#f1f5f9">{l.code}</Chip>)}{p.preview && <Chip color={C.green} bg="#dcfce7">ମାଗଣା</Chip>}</div>
                </div>
              </button>
              {!p.locked && (
                <button onClick={() => onTaught(p)} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[14px]" style={{ background: isTaught ? C.green : '#f1f1f6', color: isTaught ? '#fff' : '#bbb' }} title="ପଢ଼ାଇସାରିଲି">✓</button>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function PeriodScreen({ data, idx, setIdx, onBackToList, onTaught, openPeriod }) {
  const periods = data?.periods || []
  const p = periods[idx]
  if (!p) return <Empty msg="ପିରିୟଡ୍ ମିଳିଲା ନାହିଁ।" />
  const taught = (data.progress?.taught || []).includes(p.id)
  const go = (d) => { const n = idx + d; if (n >= 0 && n < periods.length) openPeriod(n) }
  return (
    <>
      {/* sticky sub-header */}
      <div className="sticky top-[60px] z-20 -mx-3 px-3 py-2 mb-2 flex items-center gap-2 bg-white/95 backdrop-blur border-b" style={{ borderColor: '#eee' }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-white shrink-0" style={{ background: C.indigo }}>{asOdia(p.number)}</div>
        <div className="flex-1 min-w-0"><div className="text-[10px] text-gray-400 font-bold">ପିରିୟଡ୍ {asOdia(p.number)}</div><div className="font-extrabold text-[14px] leading-tight truncate" style={{ color: C.indigo }}>{p.title}</div></div>
        <button onClick={() => go(-1)} disabled={idx === 0} className="w-8 h-8 rounded-full bg-gray-100 disabled:opacity-30 font-bold">‹</button>
        <button onClick={() => go(1)} disabled={idx === periods.length - 1} className="w-8 h-8 rounded-full bg-gray-100 disabled:opacity-30 font-bold">›</button>
      </div>

      {/* goal strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          {p.curricularGoal?.text && <GoalRow label="ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ · Curricular Goal" codes={p.curricularGoal.codes} text={p.curricularGoal.text} color={C.indigo} />}
          {!!(p.competencies || []).length && (
            <div className="rounded-xl bg-white border p-3" style={{ borderColor: '#eee' }}>
              <div className="text-[10px] font-extrabold uppercase tracking-wide mb-1" style={{ color: '#1fa2d9' }}>ଦକ୍ଷତା · Competency</div>
              {p.competencies.map((c, i) => <div key={i} className="mb-1 last:mb-0 text-[12px]"><Chip color="#1fa2d9">{(c.codes || []).join(', ')}</Chip> <span className="text-gray-700">{c.text}</span></div>)}
            </div>
          )}
          {p.learningOutcome && (
            <div className="rounded-xl p-3 border-l-4" style={{ background: '#f0fdf4', borderColor: C.green }}>
              <div className="text-[10px] font-extrabold uppercase tracking-wide mb-0.5" style={{ color: C.green }}>ଶିକ୍ଷଣ ଫଳାଫଳ · Learning Outcome</div>
              <div className="text-[13px] font-semibold" style={{ color: '#14532d' }}>{p.learningOutcome}</div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {p.objective && <MiniBox label="ପିରିୟଡ୍‌ର ଉଦ୍ଦେଶ୍ୟ · Objective" color={C.coral}>{p.objective}</MiniBox>}
          {p.skillFocus && <MiniBox label="ଦକ୍ଷତା ଫୋକସ୍ · Skill focus" color="#7c3aed">{p.skillFocus}</MiniBox>}
          {!!(p.loCodes || []).length && (
            <div className="rounded-xl bg-white border p-3" style={{ borderColor: '#eee' }}>
              <div className="text-[10px] font-extrabold uppercase tracking-wide mb-1.5" style={{ color: '#92400e' }}>LO Code · ଶିକ୍ଷଣ ଫଳାଫଳ ସଂକେତ</div>
              <div className="flex flex-wrap gap-1.5">
                {p.loCodes.filter(l => l.code).map((l, i) => <Chip key={i} color="#fff" bg="#92400e">{l.code}</Chip>)}
              </div>
            </div>
          )}
          {p.differentiation && <MiniBox label="ଭିନ୍ନତା · Differentiation" color="#0d9488">{p.differentiation}</MiniBox>}
          {p.multigrade && <MiniBox label="ବହୁଶ୍ରେଣୀ ପାଇଁ ସୂଚନା · Multigrade" color="#9333ea">{p.multigrade}</MiniBox>}
          {p.tlm && <div className="rounded-xl p-3 text-[12px]" style={{ background: '#eef2ff', color: '#3730a3' }}><b>🧰 ଶିକ୍ଷଣ ଉପକରଣ (TLM):</b> {p.tlm}</div>}
        </div>
      </div>

      {/* 5-step journey */}
      <div className="mt-4 relative">
        <div className="absolute left-[18px] top-3 bottom-3 w-0.5" style={{ background: '#e5e0f0' }} />
        <div className="space-y-2.5">
          {(p.stages || []).map((s) => {
            const st = STAGE_STYLE[s.key] || STAGE_STYLE.s1
            return (
              <div key={s.key} className="relative rounded-xl p-3 border-l-4 ml-0.5" style={{ background: st.tint, borderColor: st.border }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-white shrink-0 z-10" style={{ background: st.border }}>{s.num}</div>
                  <div className="font-extrabold text-[14px]" style={{ color: st.dark }}>{s.odia} <span className="font-semibold opacity-70 text-[12px]">({s.en})</span></div>
                </div>
                <ol className="space-y-1.5 pl-1">
                  {(s.activities || []).map(a => (
                    <li key={a.n} className="text-[13px] leading-snug flex gap-2">
                      <span className="shrink-0 font-bold" style={{ color: st.border }}>{asOdia(a.n)}.</span>
                      <span className="text-gray-800">{a.text}</span>
                    </li>
                  ))}
                  {!(s.activities || []).length && <li className="text-[12px] text-gray-400">—</li>}
                </ol>
              </div>
            )
          })}
        </div>
      </div>

      {/* assessment + homework */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        {p.assessment && <div className="rounded-xl p-3 border" style={{ background: '#fffbeb', borderColor: '#fde68a' }}><div className="text-[10px] font-extrabold uppercase mb-0.5" style={{ color: '#92400e' }}>📋 ମୂଲ୍ୟାୟନ / ଶିକ୍ଷଣର ପ୍ରମାଣ</div><div className="text-[13px] text-gray-800">{p.assessment}</div></div>}
        {p.homework && <div className="rounded-xl p-3 border" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}><div className="text-[10px] font-extrabold uppercase mb-0.5" style={{ color: '#1e40af' }}>🏠 ଗୃହକାର୍ଯ୍ୟ · Homework</div><div className="text-[13px] text-gray-800">{p.homework}</div></div>}
      </div>

      {/* actions */}
      <div className="flex gap-2 mt-4">
        <button onClick={() => onTaught(p)} className="flex-1 rounded-xl py-3 font-bold text-[14px] text-white active:scale-[0.99]" style={{ background: taught ? '#64748b' : C.green }}>{taught ? '↩️ ଚିହ୍ନ ହଟାନ୍ତୁ' : '✅ ପଢ଼ାଇସାରିଲି'}</button>
        <button onClick={() => go(1)} disabled={idx === periods.length - 1} className="flex-1 rounded-xl py-3 font-bold text-[14px] text-white disabled:opacity-40" style={{ background: C.indigo }}>ପରବର୍ତ୍ତୀ ପିରିୟଡ୍ →</button>
      </div>
      <button onClick={onBackToList} className="w-full mt-2 text-[12px] text-gray-500 font-semibold py-2">← ପିରିୟଡ୍ ତାଲିକାକୁ ଫେରନ୍ତୁ</button>
    </>
  )
}

function YearPlanScreen({ yearPlan, onDownload }) {
  if (!yearPlan) return <Grid n={3} />
  if (yearPlan.error) return <Empty msg="ବାର୍ଷିକ ଯୋଜନା ଲୋଡ୍ ହେଲା ନାହିଁ।" />
  return (
    <>
      <div className="rounded-2xl p-4 text-white shadow" style={{ background: `linear-gradient(135deg,${C.green},#15803d)` }}>
        <div className="font-extrabold text-[15px] leading-tight">{yearPlan.title}</div>
        {!!(yearPlan.stats || []).length && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {yearPlan.stats.map((s, i) => <div key={i} className="text-center"><div className="text-lg font-extrabold">{s.value}</div><div className="text-[9px] opacity-90 leading-tight">{s.label}</div></div>)}
          </div>
        )}
      </div>
      <div className="space-y-4 mt-3">
        {(yearPlan.tables || []).map((t, ti) => (
          <div key={ti} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#eee' }}>
            {t.caption && <div className="px-3 py-2 text-[12px] font-extrabold text-white" style={{ background: C.indigo }}>{t.caption}</div>}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                {!!(t.headers || []).length && <thead><tr>{t.headers.map((h, i) => <th key={i} className="text-left px-2 py-1.5 font-bold border-b sticky top-0" style={{ background: '#f8f7fc', color: C.indigo, borderColor: '#eee' }}>{h}</th>)}</tr></thead>}
                <tbody>
                  {(t.rows || []).map((r, ri) => (
                    <tr key={ri} className={r[0]?.span ? 'bg-indigo-50 font-bold' : ''}>
                      {r.map((c, ci) => <td key={ci} colSpan={c.colspan || 1} className="px-2 py-1.5 border-b align-top" style={{ borderColor: '#f1f1f1', color: c.span ? C.indigo : '#374151' }}>{c.text}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ---- small UI helpers ----
function SectionTitle({ children, className = '' }) { return <div className={`text-[13px] font-extrabold mb-2 ${className}`} style={{ color: C.indigo }}>{children}</div> }
function InfoBox({ title, color, children }) { return <div className="rounded-xl bg-white border p-3" style={{ borderColor: '#eee' }}><div className="text-[10px] font-extrabold uppercase tracking-wide mb-0.5" style={{ color }}>{title}</div><div className="text-[13px] text-gray-700">{children}</div></div> }
function MiniBox({ label, color, children }) { return <div className="rounded-xl bg-white border p-3" style={{ borderColor: '#eee' }}><div className="text-[10px] font-extrabold uppercase tracking-wide mb-0.5" style={{ color }}>{label}</div><div className="text-[13px] text-gray-700">{children}</div></div> }
function GoalRow({ label, codes, text, color }) { return <div className="rounded-xl bg-white border p-3" style={{ borderColor: '#eee' }}><div className="text-[10px] font-extrabold uppercase tracking-wide mb-1" style={{ color }}>{label}</div><div className="text-[12px]">{!!(codes || []).length && <Chip color={color}>{codes.join(', ')}</Chip>} <span className="text-gray-700">{text}</span></div></div> }
function Grid({ n = 4 }) { return <div className="grid grid-cols-2 gap-3">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white/70 animate-pulse border" style={{ borderColor: '#eee' }} />)}</div> }
function Empty({ msg }) { return <div className="text-center text-sm text-gray-400 py-12">{msg}</div> }
const OD = '୦୧୨୩୪୫୬୭୮୯'
function asOdia(n) { return String(n == null ? '' : n).replace(/[0-9]/g, d => OD[+d]) }
