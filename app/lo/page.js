'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'

const OR = { fontFamily: '"Noto Sans Oriya",system-ui,sans-serif' }
const DV = { fontFamily: '"Noto Sans Devanagari",system-ui,sans-serif' }
const SUBJ = { math: 'ଗଣିତ', odia: 'ଓଡ଼ିଆ', english: 'English', evs: 'ପରିବେଶ', hindi: 'हिंदी', science: 'ବିଜ୍ଞାନ', social: 'ସାମାଜିକ ବିଜ୍ଞାନ', unknown: 'ଅନ୍ୟାନ୍ୟ' }
const OD = '୦୧୨୩୪୫୬୭୮୯'
const od = (n) => String(n ?? '').replace(/[0-9]/g, (x) => OD[+x])

const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : '')
const api = async (p) => {
  const r = await fetch('/api' + p, { headers: { Authorization: 'Bearer ' + (tok() || '') } })
  if (r.status === 401) { if (typeof window !== 'undefined') window.location.href = '/login'; throw new Error('login') }
  if (r.status === 429) { const j = await r.json().catch(() => ({})); throw new Error(j.code === 'DAILY_CAP' ? 'ଆଜିର ପାଠ ଦେଖିବା ସୀମା ଶେଷ — ଦୟାକରି କାଲି ଚେଷ୍ଟା କରନ୍ତୁ।' : 'ଅତ୍ୟଧିକ ଅନୁରୋଧ — ଦୟାକରି କିଛି ସମୟ ପରେ ଚେଷ୍ଟା କରନ୍ତୁ।') }
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'error')
  return r.json()
}

// tappable code pill (native details — no JS state needed)
const Pill = ({ kind, code, text, font }) => {
  const c = { cg: ['#E9EEFD', '#1A3EA8', '#C3D1F7'], c: ['#E1F5EF', '#07775A', '#B2E0D1'], lo: ['#FDF0DD', '#B85C00', '#F2D5A6'] }[kind] || ['#eef', '#333', '#ccd']
  if (!code) return null
  return (
    <details className="inline-block align-top mr-1.5 mb-1.5">
      <summary className="list-none cursor-pointer inline-block rounded-md border px-2 py-[3px] text-[11.5px] font-bold font-mono" style={{ background: c[0], color: c[1], borderColor: c[2] }}>{code}</summary>
      {text ? <div className="mt-1 p-2 rounded-md bg-white border text-[12.5px] leading-snug max-w-[340px]" style={{ ...font, borderLeft: `3px solid ${c[1]}`, boxShadow: '0 6px 18px rgba(18,32,58,.14)' }}>{text}</div> : null}
    </details>
  )
}

export default function ChapterwiseLO() {
  const [ready, setReady] = useState(false)       // auth check complete
  const [teacher, setTeacher] = useState(null)    // { name, last4 }
  const [view, setView] = useState('classes')     // classes | subjects | chapters | chapter | search
  const [classes, setClasses] = useState(null)
  const [cls, setCls] = useState(null)
  const [subject, setSubject] = useState(null)
  const [chapters, setChapters] = useState(null)
  const [chapter, setChapter] = useState(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  // ── Auth guard — SAME rule as the classic Chapterwise LO section:
  //    must be logged in (free for every signed-in teacher). ──
  useEffect(() => {
    if (!tok()) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
    api('/auth/me')
      .then(r => { const u = r.user || {}; setTeacher({ name: u.name || 'Teacher', last4: String(u.mobile || '').replace(/\D/g, '').slice(-4) }); setReady(true) })
      .catch(() => { if (typeof window !== 'undefined') window.location.href = '/login' })
  }, [])

  useEffect(() => { if (ready) api('/lo2/classes').then(r => setClasses(r.classes || [])).catch(() => setClasses([])) }, [ready])

  // ── Content-protection: block right-click, copy and text selection on LO pages ──
  useEffect(() => {
    if (!ready) return
    const stop = (e) => { e.preventDefault(); return false }
    document.addEventListener('contextmenu', stop)
    document.addEventListener('copy', stop)
    document.addEventListener('cut', stop)
    document.addEventListener('dragstart', stop)
    return () => { document.removeEventListener('contextmenu', stop); document.removeEventListener('copy', stop); document.removeEventListener('cut', stop); document.removeEventListener('dragstart', stop) }
  }, [ready])

  const openSubject = useCallback((c, subj) => {
    setCls(c); setSubject(subj); setChapters(null); setView('chapters'); setLoading(true)
    api(`/lo2/chapters?class=${c.class}&subject=${subj.subject}`).then(r => setChapters(r.chapters || [])).catch(e => { setChapters([]); setErr(e.message) }).finally(() => setLoading(false))
  }, [])
  const openChapter = useCallback((id) => {
    setChapter(null); setView('chapter'); setLoading(true); setErr('')
    api(`/lo2/chapter?id=${id}`).then(r => setChapter(r.chapter)).catch(e => { setChapter(null); setErr(e.message) }).finally(() => setLoading(false))
  }, [])
  const doSearch = useCallback((term) => {
    setQ(term); if (term.trim().length < 2) { setResults(null); return }
    setLoading(true); api(`/lo2/search?q=${encodeURIComponent(term.trim())}`).then(r => { setResults(r.results || []); setView('search') }).catch(e => { setResults([]); setErr(e.message) }).finally(() => setLoading(false))
  }, [])

  // Tiled, very-light diagonal watermark (teacher name + last 4 of mobile).
  const wmStyle = useMemo(() => {
    const label = teacher ? `${teacher.name} · ${teacher.last4}` : ''
    if (!label) return null
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><text x='10' y='110' transform='rotate(-28 160 90)' font-family='sans-serif' font-size='15' fill='rgba(70,70,70,0.55)'>${label.replace(/[<>&]/g, '')}</text></svg>`
    return {
      position: 'fixed', inset: 0, zIndex: 45, pointerEvents: 'none', opacity: 0.08,
      backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
      backgroundRepeat: 'repeat',
    }
  }, [teacher])

  const font = subject?.subject === 'hindi' ? DV : OR
  const Header = ({ title, sub, back }) => (
    <div className="sticky top-0 z-10" style={{ background: 'linear-gradient(120deg,#241a5e,#5B2BC4)', color: '#fff' }}>
      <div className="max-w-[560px] mx-auto px-4 py-3 flex items-center gap-2.5">
        {back && <button onClick={back} className="w-8 h-8 grid place-items-center rounded-lg bg-white/15"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg></button>}
        <div className="min-w-0"><div className="font-extrabold text-[15px] truncate">{title}</div>{sub && <div className="text-[11.5px] opacity-85 truncate">{sub}</div>}</div>
      </div>
    </div>
  )

  if (!ready) {
    return <div className="min-h-screen grid place-items-center" style={{ ...OR, background: '#eef2f6', color: '#5B2BC4' }}><div className="text-[14px] font-bold">ଲୋଡ୍ ହେଉଛି…</div></div>
  }

  return (
    <div
      className="min-h-screen pb-20 lo-content lo-noselect"
      style={{ ...OR, background: '#eef2f6', color: '#12203A', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .lo-noselect, .lo-noselect * { -webkit-user-select:none !important; -moz-user-select:none !important; -ms-user-select:none !important; user-select:none !important; -webkit-touch-callout:none !important; }
        .lo-print-msg { display:none; }
        @media print {
          .lo-content { display:none !important; }
          .lo-print-msg { display:flex !important; position:fixed; inset:0; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:#241a5e; background:#fff; z-index:9999; }
        }
      ` }} />
      <div className="lo-print-msg">Printing is not available</div>
      {wmStyle && <div style={wmStyle} aria-hidden="true" />}

      <Header
        title="ଅଧ୍ୟାୟ ଅନୁଯାୟୀ ଶିକ୍ଷଣ ଫଳାଫଳ"
        sub="CG · Competency · Learning Outcome"
        back={view === 'classes' ? null : () => { setErr(''); if (view === 'chapter') setView('chapters'); else if (view === 'chapters') setView('subjects'); else if (view === 'search') setView('classes'); else setView('classes') }}
      />
      <div className="max-w-[560px] mx-auto px-4 pt-3 relative" style={{ zIndex: 50 }}>
        {/* search */}
        <div className="flex items-center gap-2 rounded-xl bg-white border px-3 h-11 mb-3" style={{ borderColor: '#DCE2EE' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input value={q} onChange={e => doSearch(e.target.value)} placeholder="LO କୋଡ୍ (ଯଥା EV1.2.1) କିମ୍ବା ଅଧ୍ୟାୟ ନାମ ଖୋଜନ୍ତୁ" className="flex-1 bg-transparent outline-none text-[13.5px]" style={OR} />
          {q && <button onClick={() => { setQ(''); setResults(null); setView('classes') }} className="text-[18px] text-gray-400">×</button>}
        </div>

        {err && <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-2.5 text-[12.5px] mb-3" style={OR}>{err}</div>}
        {loading && <div className="text-center text-[13px] text-gray-500 py-6">ଲୋଡ୍ ହେଉଛି…</div>}

        {/* SEARCH RESULTS */}
        {view === 'search' && results && (
          <div>
            <div className="text-[12.5px] text-gray-500 mb-2">{od(results.length)} ଫଳାଫଳ</div>
            {results.map(r => (
              <button key={r.id} onClick={() => openChapter(r.id)} className="w-full text-left bg-white border rounded-xl p-3 mb-2" style={{ borderColor: '#DCE2EE' }}>
                <div className="text-[11px] text-indigo-600 font-bold">{SUBJ[r.subjectKey]} · ଶ୍ରେଣୀ {od(r.class)}</div>
                <div className="font-bold text-[14px]" style={r.subjectKey === 'hindi' ? DV : OR}>{r.lessonName}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{od(r.periodCount)} ପିରିୟଡ · {(r.codes || []).slice(0, 4).join(', ')}</div>
              </button>
            ))}
            {results.length === 0 && <div className="text-center text-gray-500 py-8 text-[13px]">କିଛି ମିଳିଲା ନାହିଁ</div>}
          </div>
        )}

        {/* CLASSES */}
        {view === 'classes' && !q && (
          <div>
            <div className="text-[13px] font-bold text-gray-600 mb-2">ଶ୍ରେଣୀ ବାଛନ୍ତୁ</div>
            {classes == null ? <div className="text-gray-500 text-[13px] py-6 text-center">ଲୋଡ୍ ହେଉଛି…</div> :
              classes.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-500 text-[13px] mb-3">ଏହି ନୂଆ ଭ୍ୟୁରେ ବର୍ତ୍ତମାନ କୌଣସି ଶ୍ରେଣୀ ପ୍ରକାଶିତ ହୋଇନାହିଁ।</div>
                  <a href="/resources" className="inline-block rounded-full px-4 py-2 text-[13px] font-bold text-white" style={{ background: '#5B2BC4' }}> କ୍ଲାସିକ୍ Chapterwise LO ଦେଖନ୍ତୁ</a>
                </div>
              ) :
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    {classes.map(c => (
                      <button key={c.class} onClick={() => { setCls(c); setView('subjects') }} className="bg-white border rounded-2xl p-3 text-center active:scale-95 transition" style={{ borderColor: '#DCE2EE' }}>
                        <div className="w-10 h-10 mx-auto rounded-xl grid place-items-center text-white font-extrabold text-[17px]" style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)' }}>{od(c.class)}</div>
                        <div className="text-[12.5px] font-bold mt-1.5">ଶ୍ରେଣୀ {od(c.class)}</div>
                        <div className="text-[10.5px] text-gray-500">{od(c.subjects.length)} ବିଷୟ</div>
                      </button>
                    ))}
                  </div>
                  <div className="text-center mt-5">
                    <a href="/resources" className="text-[12px] font-bold text-indigo-600 underline">ଅନ୍ୟ ଶ୍ରେଣୀ — କ୍ଲାସିକ୍ Chapterwise LO</a>
                  </div>
                </>}
          </div>
        )}

        {/* SUBJECTS */}
        {view === 'subjects' && cls && (
          <div>
            <div className="text-[13px] font-bold text-gray-600 mb-2">ଶ୍ରେଣୀ {od(cls.class)} · ବିଷୟ ବାଛନ୍ତୁ</div>
            {cls.subjects.map(s => (
              <button key={s.subject} onClick={() => openSubject(cls, s)} className="w-full flex items-center gap-3 bg-white border rounded-xl p-3 mb-2" style={{ borderColor: '#DCE2EE' }}>
                <div className="w-9 h-9 rounded-lg grid place-items-center text-white font-bold" style={{ background: '#241a5e' }}>{SUBJ[s.subject]?.[0] || '•'}</div>
                <div className="flex-1 text-left"><div className="font-bold text-[14px]" style={s.subject === 'hindi' ? DV : OR}>{SUBJ[s.subject] || s.subject}</div><div className="text-[11px] text-gray-500">{od(s.lessons)} ଅଧ୍ୟାୟ · {od(s.periods)} ପିରିୟଡ</div></div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            ))}
          </div>
        )}

        {/* CHAPTERS */}
        {view === 'chapters' && (
          <div>
            <div className="text-[13px] font-bold text-gray-600 mb-2">ଶ୍ରେଣୀ {od(cls?.class)} · {SUBJ[subject?.subject]} · ଅଧ୍ୟାୟ</div>
            {(chapters || []).map((ch, i) => (
              <div key={ch.id}>
                {(i === 0 || chapters[i - 1].unit !== ch.unit) && ch.unit ? <div className="text-[11px] font-bold text-indigo-700 mt-3 mb-1" style={font}>▸ {ch.unit}</div> : null}
                <button onClick={() => openChapter(ch.id)} className="w-full text-left bg-white border rounded-xl p-3 mb-2 flex items-center gap-2" style={{ borderColor: '#DCE2EE' }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[14px]" style={font}>{ch.lessonName}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{od(ch.periodCount)} ପିରିୟଡ{ch.pages ? ' · ' + ch.pages : ''}</div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </div>
            ))}
            {chapters && chapters.length === 0 && <div className="text-center text-gray-500 py-8 text-[13px]">କିଛି ନାହିଁ</div>}
          </div>
        )}

        {/* CHAPTER (period-wise) */}
        {view === 'chapter' && chapter && (
          <div>
            <div className="bg-white border rounded-2xl p-3.5 mb-3" style={{ borderColor: '#DCE2EE' }}>
              <div className="text-[11px] text-indigo-600 font-bold">{SUBJ[chapter.subjectKey]} · ଶ୍ରେଣୀ {od(chapter.class)}</div>
              <div className="font-extrabold text-[17px] mt-0.5" style={chapter.subjectKey === 'hindi' ? DV : OR}>{chapter.lessonName}</div>
              <div className="text-[11.5px] text-gray-500 mt-1">{chapter.unit ? chapter.unit + ' · ' : ''}{od(chapter.periodCount)} ପିରିୟଡ{chapter.pages ? ' · ' + chapter.pages : ''}</div>
              {chapter.skill ? <div className="text-[11.5px] mt-1" style={{ color: '#07775A' }}>କୌଶଳ: {chapter.skill}</div> : null}
            </div>
            {(chapter.periods || []).map((p, i) => {
              const f = chapter.subjectKey === 'hindi' ? DV : OR
              return (
                <div key={i} className="bg-white border rounded-xl p-3 mb-2.5" style={{ borderColor: '#DCE2EE' }}>
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full grid place-items-center text-white font-bold text-[12px] shrink-0" style={{ background: '#2A3A63' }}>{od(p.no)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[13.5px] leading-snug" style={f}>{p.topic}</div>
                      <div className="mt-2">
                        <Pill kind="cg" code={p.cg?.code} text={p.cg?.text} font={f} />
                        <Pill kind="c" code={p.competency?.code} text={p.competency?.text} font={f} />
                        {(p.los || []).map((lo, j) => <Pill key={j} kind="lo" code={lo.code} text={lo.text} font={f} />)}
                        {p.oldLoCode ? <span className="inline-block align-top mr-1.5 mb-1.5 rounded-md border px-2 py-[3px] text-[11px] font-mono font-bold" style={{ background: '#F1F5F9', color: '#94A3B8', borderColor: '#E2E8F0' }} title="Old LO code">{p.oldLoCode}</span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
