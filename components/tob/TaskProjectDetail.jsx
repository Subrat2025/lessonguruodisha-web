'use client'
import React, { useEffect, useMemo, useState, useRef } from 'react'
import { API, getToken } from '@/components/store/api'
import { TOB_PAPER_CSS } from '@/lib/tob/paper-css.js'

const C = { indigo: '#241a5e', saffron: '#f7b32b', coral: '#c93a22', sky: '#1577a8', green: '#1f7a46', ground: '#f5f3fb' }
const fontFamily = "'Baloo Bhaina 2','Noto Sans Oriya',system-ui,sans-serif"
const OD = '୦୧୨୩୪୫୬୭୮୯'
const od = (n) => String(n == null ? '' : n).replace(/[0-9]/g, d => OD[+d])
const SUB = { odia: 'OD', english: 'E', hindi: 'H', sanskrit: 'S', math: 'MATH', evs: 'EV', science: 'SC', social: 'SS' }
const SUB_REV = Object.fromEntries(Object.entries(SUB).map(([k, v]) => [v, k]))
const sanitize = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/ on\w+="[^"]*"/gi, '').replace(/ on\w+='[^']*'/gi, '')
const COG = { k: C.sky, u: C.saffron, h: C.coral }

function parseSlug(slug = []) {
  const p = (slug || []).map(x => String(x || '').toLowerCase())
  const o = { cls: '', subject: '', chapter: null, set: null, term: null, kind: 'task', pos: 1 }
  o.cls = (p[0] || '').replace(/^class-/, '')
  o.subject = SUB[p[1]] || (p[1] || '').toUpperCase()
  let i = 2
  if (p[i] && p[i].startsWith('ch-')) { o.chapter = parseInt(p[i].replace(/\D/g, ''), 10); i++ }
  else if (p[i] && p[i].startsWith('set-')) { o.set = p[i].replace(/^set-/, '').toUpperCase(); i++; if (p[i] && p[i].startsWith('term-')) { o.term = parseInt(p[i].replace(/\D/g, ''), 10); i++ } }
  if (p[i] === 'task' || p[i] === 'project') { o.kind = p[i]; i++ }
  if (p[i]) o.pos = parseInt(p[i], 10) || 1
  return o
}
function qstring(o, pos) {
  const qp = new URLSearchParams({ class: o.cls, subject: o.subject, part: o.kind, num: String(pos ?? o.pos) })
  if (o.chapter) qp.set('chapter', String(o.chapter))
  else if (o.set) { qp.set('set', o.set); qp.set('term', String(o.term || 1)) }
  return qp.toString()
}
function hrefFor(o, pos) {
  const base = `/teacher-observation/class-${o.cls}/${SUB_REV[o.subject] || o.subject.toLowerCase()}`
  if (o.chapter) return `${base}/ch-${String(o.chapter).padStart(2, '0')}/${o.kind}/${pos}`
  return `${base}/set-${o.set.toLowerCase()}/term-${o.term || 1}/${o.kind}/${pos}`
}

export default function TaskProjectDetail({ slug }) {
  const o = useMemo(() => parseSlug(slug), [slug])
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [showAns, setShowAns] = useState(false)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const [chip, setChip] = useState(null)
  // My Class Records
  const [rosters, setRosters] = useState(null)
  const [rosterId, setRosterId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [recMarks, setRecMarks] = useState('')
  const [recRemarks, setRecRemarks] = useState('')
  const [recMsg, setRecMsg] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteSection, setPasteSection] = useState('A')
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')
  const [recTicks, setRecTicks] = useState({})
  const checklistRef = useRef(null)
  const authHdr = () => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }

  useEffect(() => {
    const id = 'abp-fonts'
    if (!document.getElementById(id)) { const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Baloo+Bhaina+2:wght@600;700;800&family=Noto+Sans+Oriya:wght@400;500;600;700&display=swap'; document.head.appendChild(l) }
  }, [])
  useEffect(() => {
    setData(null); setErr(null); setShowAns(false); window.scrollTo(0, 0)
    const t = getToken()
    fetch(`${API}/tob/detail?${qstring(o)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Not found'); return j })
      .then(setData).catch(e => setErr(e.message || 'Error'))
  }, [o])

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200) }
  const isProject = o.kind === 'project'
  const accent = isProject ? C.green : C.sky
  const d = data?.detail
  const v = data?.viewer
  const share = data?.share

  const goBack = () => { if (window.history.length > 1) window.history.back(); else window.location.href = '/teacher-observation' }
  const shareWhatsApp = () => { if (share?.text) window.open(`https://wa.me/?text=${encodeURIComponent(share.text)}`, '_blank') }
  const copyLink = async () => {
    const url = share?.url || window.location.href
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
      else throw new Error('no-clipboard')
    } catch {
      try { const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); ta.remove() } catch {}
    }
    flash('ଲିଙ୍କ କପି ହେଲା ✓')
  }
  const nativeShare = async () => { try { if (navigator.share) await navigator.share({ title: d?.title, text: share?.text, url: share?.url }); else copyLink() } catch (_) {} }
  const shareImage = async () => {
    setBusy('img')
    try {
      const t = getToken()
      const res = await fetch(`${API}/tob/share-image?${qstring(o)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      if (!res.ok) throw new Error('image failed')
      const blob = await res.blob(); const file = new File([blob], 'task.png', { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: share?.text })
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'task.png'; a.click() }
    } catch (e) { flash('ଛବି ପ୍ରସ୍ତୁତ ହେଲା ନାହିଁ') } finally { setBusy('') }
  }
  const downloadPdf = async (copy) => {
    setBusy(copy)
    try {
      const t = getToken()
      const res = await fetch(`${API}/tob/task/pdf?${qstring(o)}&copy=${copy}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      if (res.status === 401) { flash('ଦୟାକରି ଲଗଇନ୍ କରନ୍ତୁ'); return }
      if (res.status === 403) { flash('Premium ଆବଶ୍ୟକ'); return }
      if (!res.ok) throw new Error('pdf failed')
      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${copy}-${o.kind}${o.pos}.pdf`; a.click()
    } catch (e) { flash('PDF ପ୍ରସ୍ତୁତ ହେଲା ନାହିଁ') } finally { setBusy('') }
  }

  // ---- My Class Records ----
  const loadRosters = () => {
    if (!v?.loggedIn || !d) { setRosters(null); return }
    fetch(`${API}/tob/rosters?class=${d.class}`, { headers: authHdr() }).then(r => r.json()).then(j => {
      const rs = j.rosters || []; setRosters(rs)
      setRosterId(prev => prev && rs.find(r => r.id === prev) ? prev : (rs[0]?.id || ''))
    }).catch(() => setRosters([]))
  }
  useEffect(() => { loadRosters() }, [v?.loggedIn, d?.class]) // eslint-disable-line
  const roster = (rosters || []).find(r => r.id === rosterId)
  const applyTicks = (ticks) => { const boxes = checklistRef.current?.querySelectorAll('.box') || []; boxes.forEach((b, i) => { if (ticks && ticks[i]) b.classList.add('on'); else b.classList.remove('on') }) }
  const readTicks = () => { const boxes = checklistRef.current?.querySelectorAll('.box') || []; const t = {}; boxes.forEach((b, i) => { if (b.classList.contains('on')) t[i] = true }); return t }
  const loadStudentRecord = async (sid) => {
    setStudentId(sid); setRecMsg('')
    if (!sid) { setRecTicks({}); setRecMarks(''); setRecRemarks(''); return }
    try {
      const qs = `itemId=${v.itemId}&part=${o.kind}&term=${d.term}&num=${d.pos}&studentId=${sid}`
      const j = await (await fetch(`${API}/tob/records?${qs}`, { headers: authHdr() })).json()
      const rec = j.record || {}
      setRecMarks(rec.marks ?? ''); setRecRemarks(rec.remarks || ''); setRecTicks(rec.ticks || {})
    } catch { setRecMsg('ଲୋଡ୍ ହେଲା ନାହିଁ') }
  }
  // Re-apply saved ticks to the checklist DOM after it's committed (robust vs timing).
  useEffect(() => { applyTicks(recTicks) }, [recTicks, studentId, d?.pos]) // eslint-disable-line
  const saveStudentRecord = async () => {
    if (!studentId) { setRecMsg('ଛାତ୍ର/ଛାତ୍ରୀ ବାଛନ୍ତୁ'); return }
    setBusy('rec'); setRecMsg('')
    try {
      const payload = { itemId: v.itemId, part: o.kind, term: d.term, pos: d.pos, studentId, rosterId, class: d.class, subject_id: d.subject_id, ticks: readTicks(), marks: recMarks, remarks: recRemarks }
      const r = await fetch(`${API}/tob/records`, { method: 'POST', headers: { ...authHdr(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!r.ok) throw new Error()
      setRecMsg('ସେଭ୍ ହେଲା ✓')
    } catch { setRecMsg('ସେଭ୍ ହେଲା ନାହିଁ') } finally { setBusy('') }
  }
  const saveRosterPaste = async () => {
    if (!pasteText.trim()) { setRecMsg('ନାମ ତାଲିକା ଲେଖନ୍ତୁ'); return }
    try {
      const r = await fetch(`${API}/tob/rosters`, { method: 'POST', headers: { ...authHdr(), 'Content-Type': 'application/json' }, body: JSON.stringify({ class: d.class, section: pasteSection, paste: pasteText, title: `ଶ୍ରେଣୀ ${d.class} · ${pasteSection}` }) })
      const j = await r.json(); if (!j.ok) throw new Error(j.error)
      setPasteOpen(false); setPasteText(''); setRosterId(j.id); loadRosters()
    } catch (e) { setRecMsg(e.message || 'ରୋଷ୍ଟର ସେଭ୍ ହେଲା ନାହିଁ') }
  }
  const deleteRoster = () => { setDelText(''); setRecMsg(''); setDelOpen(true) }
  const confirmDelete = async () => {
    if (delText.trim() !== String(d.class)) { setRecMsg('ଶ୍ରେଣୀ ନାମ ମେଳ ଖାଉନାହିଁ'); return }
    try { await fetch(`${API}/tob/rosters/${rosterId}`, { method: 'DELETE', headers: authHdr() }); setDelOpen(false); setDelText(''); setStudentId(''); setRosterId(''); loadRosters() } catch {}
  }
  const onExcel = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
      const lines = []
      for (const r of rows) {
        if (!r || !r.length) continue
        const cells = r.map(x => String(x ?? '').trim()).filter(Boolean)
        if (!cells.length) continue
        if (lines.length === 0 && !/^\d/.test(cells[0]) && /roll|name|ନାମ|କ୍ରମ/i.test(cells.join(' '))) continue
        lines.push(cells.join('\t'))
      }
      setPasteText(lines.join('\n')); setPasteOpen(true); flash(`${lines.length} ଧାଡ଼ି ପଢ଼ାଗଲା — ଯାଞ୍ଚ କରି ସେଭ୍ କରନ୍ତୁ`)
    } catch { flash('Excel ପଢ଼ି ହେଲା ନାହିଁ') }
    e.target.value = ''
  }
  const openGradebook = () => { if (!d) return; window.location.href = `/teacher-observation/gradebook?class=${d.class}&subject=${d.subject_id}&roster=${rosterId}` }

  const scopeBar = d ? (d.type === 'set'
    ? `ସେଟ୍ ${d.setCode} · ଟର୍ମ ${od(d.term)}`
    : `ଶ୍ରେଣୀ ${od(d.class)} · ${d.subject_printed || d.subject_id} · ଅଧ୍ୟାୟ ${od(d.chapterNo)} ${d.chapterTitle || ''}`) : ''

  return (
    <div className="min-h-screen pb-28" style={{ background: C.ground, fontFamily }}>
      {/* sticky top bar */}
      <div className="sticky top-0 z-30 text-white shadow-md" style={{ background: `linear-gradient(135deg,${C.indigo},#3b2a8c)` }}>
        <div className="max-w-2xl mx-auto px-3 py-3 flex items-center gap-2">
          <button onClick={goBack} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-lg shrink-0">←</button>
          <div className="flex-1 min-w-0 text-[12px] font-bold truncate">{scopeBar || 'ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ'}</div>
          <button onClick={shareWhatsApp} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0" aria-label="WhatsApp"><WA /></button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 pt-3">
        {err && <Empty msg={err === 'Not found' ? 'ଏହି କାର୍ଯ୍ୟ/ପ୍ରକଳ୍ପ ମିଳିଲା ନାହିଁ।' : err} />}
        {!d && !err && <Skeleton />}
        {d && (
          <>
            {/* hero */}
            <div className="rounded-[18px] p-4 text-white shadow-lg" style={{ background: `linear-gradient(135deg,${accent},${C.indigo})` }}>
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,.2)', border: '2px solid rgba(255,255,255,.5)' }}>
                  <span className="text-[10px] opacity-90">{isProject ? 'ପ୍ରକଳ୍ପ' : 'କାର୍ଯ୍ୟ'}</span>
                  <span className="text-3xl font-extrabold leading-none">{od(d.pos)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-extrabold leading-tight">{d.title}</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {d.kind && <HeroChip bg="rgba(255,255,255,.18)">{d.kind.split('—')[0].trim()}</HeroChip>}
                    {d.cognitive?.text && <HeroChip bg={COG[d.cognitive.level] || 'rgba(255,255,255,.18)'}>{d.cognitive.text}</HeroChip>}
                    {!d.marks?.none && <HeroChip bg={C.saffron} color={C.indigo}>{od(isProject ? d.marks.project : d.marks.task)} ମାର୍କ</HeroChip>}
                    {isProject && d.kind && /ଦଳ/.test(d.kind) && <HeroChip bg="rgba(255,255,255,.18)">ଦଳଗତ</HeroChip>}
                  </div>
                </div>
              </div>
            </div>

            {/* LO strip */}
            {!!(d.los || []).length && (
              <div className="bg-white border rounded-[18px] p-3 mt-3" style={{ borderColor: '#eee' }}>
                <div className="text-[12px] font-extrabold mb-2" style={{ color: C.indigo }}>ଶିକ୍ଷଣ ଫଳାଫଳ · Learning Outcomes</div>
                {d.los.map((lo, i) => (
                  <button key={i} onClick={() => setChip(lo)} className="w-full text-left rounded-xl p-2 mb-1.5 last:mb-0 active:scale-[0.99]" style={{ background: '#f8f7fc' }}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <Chip c="#241a5e" bg="#eceafc">{lo.cg}</Chip><Chip c="#075985" bg="#e0f2fe">{lo.competency}</Chip><Chip c="#3b2600" bg="#fef3c7">{lo.lo_code}</Chip>
                    </div>
                    <div className="text-[12px] text-gray-800 leading-snug">{lo.lo_text}</div>
                  </button>
                ))}
              </div>
            )}

            {/* info tiles */}
            {!!(d.tiles || []).filter(t => !/ସ୍ତର/.test(t.label) && t.value).length && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {d.tiles.filter(t => !/ସ୍ତର/.test(t.label) && t.value).slice(0, 3).map((t, i) => (
                  <div key={i} className="bg-white border rounded-xl p-2.5" style={{ borderColor: '#eee' }}>
                    <div className="text-[10px] text-gray-400 font-bold mb-0.5">{t.label}</div>
                    <div className="text-[12px] font-semibold" style={{ color: C.indigo }}>{t.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* teacher instructions */}
            {d.blocks?.instructions && (
              <div className="rounded-[18px] p-3 mt-3" style={{ background: '#eceafc', border: `1px solid #d8d2f2` }}>
                <div className="flex items-center gap-2 text-[12px] font-extrabold mb-1" style={{ color: C.indigo }}><span>👩‍🏫</span> ଶିକ୍ଷକଙ୍କ ପାଇଁ ନିର୍ଦ୍ଦେଶ</div>
                <div className="text-[13px] text-gray-800 tp" dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.instructions.html) }} />
              </div>
            )}

            {/* main body */}
            <style>{TOB_PAPER_CSS}</style>
            {!isProject ? (
              <>
                {d.blocks?.task && (
                  <Paper title="ଲିଖିତ କାର୍ଯ୍ୟ" accent={accent}><div className="tp" dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.task.html) }} /></Paper>
                )}
              </>
            ) : (
              <>
                {d.blocks?.objective && <Paper title="ଉଦ୍ଦେଶ୍ୟ" accent={accent}><div className="tp" dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.objective.html) }} /></Paper>}
                {d.blocks?.materials && <Paper title="ସାମଗ୍ରୀ" accent={accent}><div className="tp" dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.materials.html) }} /></Paper>}
                {d.blocks?.process && <Paper title="ପ୍ରକ୍ରିୟା · Process" accent={accent}><div className="tp" dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.process.html) }} /></Paper>}
                {d.blocks?.roles && <Paper title="ଶିକ୍ଷକ ଓ ଅଭିଭାବକଙ୍କ ଭୂମିକା" accent={accent}><div className="tp" dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.roles.html) }} /></Paper>}
                {d.blocks?.oral && <Paper title="ମୌଖିକ ପ୍ରଶ୍ନ" accent={accent}><div className="tp" dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.oral.html) }} /></Paper>}
                {!d.marks?.none && <RubricBar total={d.marks.project} />}
              </>
            )}

            {/* answer toggle (gated) */}
            {!isProject && (v?.canSeeFull ? (d.blocks?.answer && (
              <div className="mt-3">
                <button onClick={() => setShowAns(s => !s)} className="w-full rounded-[18px] py-2.5 text-white font-bold text-[13px]" style={{ background: C.green }}>{showAns ? 'ଉତ୍ତର ଲୁଚାନ୍ତୁ' : 'ଉତ୍ତର ଦେଖନ୍ତୁ'}</button>
                {showAns && <Paper title="ଉତ୍ତର" accent={C.green}><div className="tp" dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.answer.html) }} /></Paper>}
              </div>
            )) : <LockedCard onLogin={() => { try { localStorage.setItem('store_return', window.location.pathname) } catch {}; window.location.href = '/' }} />)}

            {/* observation checklist — tappable boxes */}
            {d.blocks?.checklist && (
              <Paper title="ପର୍ଯ୍ୟବେକ୍ଷଣ ତାଲିକା" accent={C.indigo}>
                <div ref={checklistRef} className="tp" onClick={(e) => { if (e.target?.classList?.contains('box')) e.target.classList.toggle('on') }} dangerouslySetInnerHTML={{ __html: sanitize(d.blocks.checklist.html) }} />
                <div className="text-[10px] text-gray-400 mt-1">ଟିକ୍ କରିବାକୁ ବାକ୍ସ ଉପରେ ଟ୍ୟାପ୍ କରନ୍ତୁ</div>
              </Paper>
            )}

            {/* remarks + marks (on-screen only, logged-out) */}
            {!v?.loggedIn && (
            <div className="bg-white border rounded-[18px] p-3 mt-3" style={{ borderColor: '#eee' }}>
              <div className="text-[12px] font-extrabold mb-1.5" style={{ color: C.indigo }}>ଶିକ୍ଷକଙ୍କ ମନ୍ତବ୍ୟ</div>
              <textarea rows={2} placeholder="ମନ୍ତବ୍ୟ ଲେଖନ୍ତୁ…" className="w-full border rounded-lg px-2 py-2 text-[13px]" style={{ borderColor: '#e5e0f0', fontFamily }} />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[13px] font-bold" style={{ color: C.indigo }}>ପ୍ରାପ୍ତ ମାର୍କ</span>
                <input className="w-16 border rounded-lg px-2 py-1 text-[13px] text-center" style={{ borderColor: '#e5e0f0' }} placeholder="__" />
                <span className="text-[13px] text-gray-500">/ {od(isProject ? (d.marks.project || 15) : (d.marks.task || 10))}</span>
              </div>
              <div className="text-[10px] text-amber-700 mt-2">ଛାତ୍ରଙ୍କ ନାମ ଅନୁଯାୟୀ ସେଭ୍ କରିବାକୁ ଲଗଇନ୍ କରନ୍ତୁ (ମୋ ଶ୍ରେଣୀ ରେକର୍ଡ)।</div>
            </div>
            )}

            {/* My Class Records (logged-in teacher) */}
            {v?.loggedIn && (
            <div className="bg-white border rounded-[18px] p-3 mt-3" style={{ borderColor: '#eee' }}>
              <div className="text-[12px] font-extrabold mb-2" style={{ color: C.indigo }}>ମୋ ଶ୍ରେଣୀ ରେକର୍ଡ · My Class Records</div>
              {rosters === null ? <div className="text-[12px] text-gray-400">…</div> : (
                <>
                  {rosters.length > 0 && (
                    <div className="flex gap-2 mb-2 items-center">
                      <select value={rosterId} onChange={e => { setRosterId(e.target.value); setStudentId('') }} className="flex-1 border rounded-lg px-2 py-2 text-[13px]" style={{ borderColor: '#e5e0f0' }}>
                        {rosters.map(r => <option key={r.id} value={r.id}>{r.title} · {r.students.length} ଜଣ</option>)}
                      </select>
                      <button onClick={deleteRoster} className="text-[11px] text-rose-500 font-bold px-1 shrink-0">ଡିଲିଟ୍</button>
                    </div>
                  )}
                  {roster && (
                    <select value={studentId} onChange={e => loadStudentRecord(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-[13px] mb-2" style={{ borderColor: '#e5e0f0', fontFamily }}>
                      <option value="">— ଛାତ୍ର/ଛାତ୍ରୀ ବାଛନ୍ତୁ —</option>
                      {roster.students.map(s => <option key={s.id} value={s.id}>{s.roll ? `${s.roll}. ` : ''}{s.name}</option>)}
                    </select>
                  )}
                  {roster && <button onClick={openGradebook} className="w-full mb-2 rounded-lg py-1.5 font-bold text-[12px] border" style={{ borderColor: C.indigo, color: C.indigo }}>📊 ଶ୍ରେଣୀ ସାରାଂଶ · HPC ଗ୍ରେଡ୍‌ବୁକ୍ (R1–R7)</button>}
                  {studentId && (
                    <>
                      <div className="text-[10px] text-gray-400 mb-2">ଉପରେ ପର୍ଯ୍ୟବେକ୍ଷଣ ତାଲିକାର ବାକ୍ସ ଟିକ୍ କରନ୍ତୁ, ତଳେ ମାର୍କ ଓ ମନ୍ତବ୍ୟ ଦିଅନ୍ତୁ।</div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[13px] font-bold" style={{ color: C.indigo }}>ପ୍ରାପ୍ତ ମାର୍କ</span>
                        <input value={recMarks} onChange={e => setRecMarks(e.target.value)} className="w-16 border rounded-lg px-2 py-1 text-[13px] text-center" style={{ borderColor: '#e5e0f0' }} placeholder="__" />
                        <span className="text-[13px] text-gray-500">/ {od(isProject ? (d.marks.project || 15) : (d.marks.task || 10))}</span>
                      </div>
                      <textarea value={recRemarks} onChange={e => setRecRemarks(e.target.value)} rows={2} placeholder="ମନ୍ତବ୍ୟ…" className="w-full border rounded-lg px-2 py-2 text-[13px] mb-2" style={{ borderColor: '#e5e0f0', fontFamily }} />
                      <button onClick={saveStudentRecord} disabled={busy === 'rec'} className="w-full rounded-xl py-2 text-white font-bold text-[13px] disabled:opacity-50" style={{ background: C.green }}>{busy === 'rec' ? 'ସେଭ୍…' : 'ଏହି ଛାତ୍ରଙ୍କ ରେକର୍ଡ ସେଭ୍ କରନ୍ତୁ'}</button>
                    </>
                  )}
                  {recMsg && <div className="text-[11px] text-center mt-1" style={{ color: recMsg.includes('✓') ? C.green : C.coral }}>{recMsg}</div>}
                  <button onClick={() => setPasteOpen(x => !x)} className="text-[11px] font-bold mt-2" style={{ color: C.sky }}>{rosters.length ? '+ ନୂଆ ରୋଷ୍ଟର' : 'ରୋଷ୍ଟର ତିଆରି କରନ୍ତୁ (ନାମ ତାଲିକା)'}</button>
                  {pasteOpen && (
                    <div className="mt-2 p-2 rounded-xl" style={{ background: '#f8f7fc' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <input value={pasteSection} onChange={e => setPasteSection(e.target.value)} placeholder="ବିଭାଗ (A)" className="w-24 border rounded-lg px-2 py-1 text-[12px]" style={{ borderColor: '#e5e0f0' }} />
                        <label className="text-[11px] font-bold px-2 py-1 rounded-lg cursor-pointer" style={{ background: '#eceafc', color: C.indigo }}>📄 Excel ଅପଲୋଡ୍<input type="file" accept=".xlsx,.xls,.csv" onChange={onExcel} className="hidden" /></label>
                      </div>
                      <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4} placeholder={'ପ୍ରତ୍ୟେକ ଧାଡ଼ିରେ: ରୋଲ୍ ନଂ  ନାମ\n୧  ରାହୁଲ ସାହୁ\n୨  ପ୍ରିୟା ଦାସ\n(Excel ଠାରୁ କପି-ପେଷ୍ଟ ବା ଅପଲୋଡ୍)'} className="w-full border rounded-lg px-2 py-2 text-[12px]" style={{ borderColor: '#e5e0f0', fontFamily }} />
                      <button onClick={saveRosterPaste} className="mt-1 rounded-lg px-3 py-1.5 text-white font-bold text-[12px]" style={{ background: C.indigo }}>ରୋଷ୍ଟର ସେଭ୍</button>
                    </div>
                  )}
                  <div className="text-[9px] text-gray-400 mt-2">🔒 ଛାତ୍ରଙ୍କ ନାମ କେବଳ ଆପଣ ଦେଖିବେ · ଶେୟାର ଛବିରେ କଦାପି ନୁହେଁ।</div>
                </>
              )}
            </div>
            )}

            {/* prev / next */}
            <div className="flex gap-2 mt-3">
              {d.prev ? <a href={hrefFor(o, d.prev)} className="flex-1 rounded-[18px] bg-white border py-2.5 text-center font-bold text-[13px]" style={{ borderColor: '#eee', color: C.indigo }}>‹ ପୂର୍ବ</a> : <div className="flex-1" />}
              {d.next ? <a href={hrefFor(o, d.next)} className="flex-1 rounded-[18px] bg-white border py-2.5 text-center font-bold text-[13px]" style={{ borderColor: '#eee', color: C.indigo }}>ପର ›</a> : <div className="flex-1" />}
            </div>

            {/* delete roster confirm */}
            {delOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setDelOpen(false)}>
                <div className="bg-white w-full max-w-sm rounded-2xl p-4" onClick={e => e.stopPropagation()}>
                  <div className="text-[14px] font-extrabold mb-1" style={{ color: C.coral }}>⚠️ ରୋଷ୍ଟର ଡିଲିଟ୍</div>
                  <div className="text-[12px] text-gray-700 mb-3">ଏହି ଶ୍ରେଣୀର ସମସ୍ତ ଛାତ୍ରଙ୍କ ମାର୍କ ଓ ମନ୍ତବ୍ୟ ଡିଲିଟ୍ ହେବ। ଏହା ଫେରାଇ ହେବ ନାହିଁ। (କେବଳ ଆପଣଙ୍କ ରେକର୍ଡ — ଅନ୍ୟ ଶିକ୍ଷକଙ୍କ ତଥ୍ୟ ଛୁଆଁ ଯିବ ନାହିଁ।)</div>
                  <div className="text-[11px] font-bold mb-1" style={{ color: C.indigo }}>ପ୍ରଥମେ ଏକ୍ସପୋର୍ଟ କରନ୍ତୁ:</div>
                  <button onClick={openGradebook} className="w-full mb-3 rounded-lg py-1.5 font-bold text-[12px] border" style={{ borderColor: C.green, color: C.green }}>📊 ଗ୍ରେଡ୍‌ବୁକ୍ କୁ ଯାଇ PDF/Excel ଏକ୍ସପୋର୍ଟ କରନ୍ତୁ</button>
                  <div className="text-[11px] text-gray-600 mb-1">ନିଶ୍ଚିତ କରିବାକୁ ଶ୍ରେଣୀ ନାମ <b>“{d.class}”</b> ଟାଇପ୍ କରନ୍ତୁ:</div>
                  <input value={delText} onChange={e => setDelText(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-[13px] mb-2" style={{ borderColor: '#e5e0f0' }} placeholder={String(d.class)} />
                  {recMsg && <div className="text-[11px] mb-1" style={{ color: C.coral }}>{recMsg}</div>}
                  <div className="flex gap-2">
                    <button onClick={() => setDelOpen(false)} className="flex-1 rounded-lg py-2 border font-bold text-[13px]" style={{ borderColor: '#e5e0f0', color: C.indigo }}>ବାତିଲ୍</button>
                    <button onClick={confirmDelete} disabled={delText.trim() !== String(d.class)} className="flex-1 rounded-lg py-2 text-white font-bold text-[13px] disabled:opacity-40" style={{ background: C.coral }}>ଡିଲିଟ୍ କରନ୍ତୁ</button>
                  </div>
                </div>
              </div>
            )}

            {/* LO sheet */}
            {chip && (
              <div className="fixed inset-0 z-40 flex items-end" style={{ background: 'rgba(0,0,0,.4)' }} onClick={() => setChip(null)}>
                <div className="bg-white w-full max-w-2xl mx-auto rounded-t-3xl p-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2"><Chip c="#241a5e" bg="#eceafc">{chip.cg}</Chip><Chip c="#075985" bg="#e0f2fe">{chip.competency}</Chip><Chip c="#3b2600" bg="#fef3c7">{chip.lo_code}</Chip></div>
                  <div className="text-[13px] text-gray-800 mb-2">{chip.lo_text}</div>
                  {chip.competency_text && <div className="text-[12px] text-gray-600 mb-1"><b>ଦକ୍ଷତା:</b> {chip.competency_text}</div>}
                  {chip.cg_text && <div className="text-[12px] text-gray-600"><b>ଲକ୍ଷ୍ୟ (CG):</b> {chip.cg_text}</div>}
                  <button onClick={() => setChip(null)} className="w-full mt-3 rounded-xl py-2 text-white font-bold text-[13px]" style={{ background: C.indigo }}>ବନ୍ଦ କରନ୍ତୁ</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* bottom action bar */}
      {d && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t" style={{ borderColor: '#eee' }}>
          <div className="max-w-2xl mx-auto px-3 py-2">
            <div className="flex gap-2 mb-2">
              <button onClick={shareWhatsApp} className="flex-1 rounded-xl py-2.5 text-white font-bold text-[13px] flex items-center justify-center gap-1.5" style={{ background: '#25D366' }}><WA /> WhatsApp ରେ ସେୟାର</button>
              <button onClick={shareImage} disabled={busy === 'img'} className="rounded-xl px-3 py-2.5 text-white font-bold text-[13px] disabled:opacity-50" style={{ background: accent }}>{busy === 'img' ? '…' : '🖼️ ଛବି'}</button>
              <button onClick={copyLink} className="rounded-xl px-3 py-2.5 border font-bold text-[13px]" style={{ borderColor: '#e5e0f0', color: C.indigo }}>🔗</button>
              <button onClick={nativeShare} className="rounded-xl px-3 py-2.5 border font-bold text-[13px]" style={{ borderColor: '#e5e0f0', color: C.indigo }}>⇪</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => downloadPdf('student')} disabled={busy === 'student'} className="flex-1 rounded-xl py-2 border font-bold text-[12px] disabled:opacity-50" style={{ borderColor: accent, color: accent }}>{busy === 'student' ? '…' : '⬇️ ଶିକ୍ଷାର୍ଥୀ କପି'}</button>
              <button onClick={() => downloadPdf('teacher')} disabled={busy === 'teacher'} className="flex-1 rounded-xl py-2 text-white font-bold text-[12px] disabled:opacity-50" style={{ background: C.indigo }}>{busy === 'teacher' ? '…' : '⬇️ ଶିକ୍ଷକ କପି (ଉତ୍ତର ସହ)'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-24 inset-x-0 z-50 flex justify-center"><div className="bg-black/80 text-white text-[12px] rounded-full px-4 py-2">{toast}</div></div>}
    </div>
  )
}

function Paper({ title, accent, children }) {
  return (
    <div className="bg-white rounded-[18px] shadow-sm border mt-3 overflow-hidden" style={{ borderColor: '#eee' }}>
      <div className="px-3 py-2 text-[13px] font-extrabold" style={{ color: accent }}>{title}</div>
      <div className="px-3 pb-3">{children}</div>
    </div>
  )
}
function RubricBar({ total }) {
  const parts = total >= 15 ? [2, 5, 3, 2, 1, 2] : [2, 3, 2, 2, 1]
  const cols = [C.sky, C.green, C.saffron, C.coral, '#7c3aed', '#0ea5e9']
  return (
    <div className="bg-white border rounded-[18px] p-3 mt-3" style={{ borderColor: '#eee' }}>
      <div className="text-[12px] font-extrabold mb-2" style={{ color: C.indigo }}>ରୁବ୍ରିକ୍ · ମୋଟ {od(total)} ମାର୍କ</div>
      <div className="flex rounded-full overflow-hidden h-5">{parts.map((p, i) => <div key={i} className="flex items-center justify-center text-[9px] font-bold text-white" style={{ background: cols[i % cols.length], width: `${(p / total) * 100}%` }}>{od(p)}</div>)}</div>
    </div>
  )
}
function LockedCard({ onLogin }) {
  return (
    <div className="rounded-[18px] p-4 mt-3 text-center" style={{ background: '#fff7e6', border: `1px solid ${C.saffron}` }}>
      <div className="text-[13px] font-extrabold mb-1" style={{ color: '#92400e' }}>🔒 ଉତ୍ତର ଓ ଡାଉନଲୋଡ୍ ପାଇଁ</div>
      <div className="text-[12px] text-amber-800 mb-3">ସମ୍ପୂର୍ଣ୍ଣ ଦେଖିବା ପାଇଁ ଲଗଇନ୍ / Premium ଆବଶ୍ୟକ।</div>
      <button onClick={onLogin} className="rounded-xl px-5 py-2 text-white font-bold text-[13px]" style={{ background: C.coral }}>ଲଗଇନ୍ / Premium</button>
    </div>
  )
}
function HeroChip({ children, bg, color = '#fff' }) { return <span className="text-[11px] font-bold rounded-full px-2.5 py-0.5" style={{ background: bg, color }}>{children}</span> }
function Chip({ children, c, bg }) { return <span className="inline-block text-[10px] font-bold rounded px-1.5 py-0.5" style={{ color: c, background: bg }}>{children}</span> }
function Empty({ msg }) { return <div className="text-center text-sm text-gray-400 py-16">{msg}</div> }
function Skeleton() { return <div className="space-y-3"><div className="h-24 rounded-[18px] bg-white/70 animate-pulse border" style={{ borderColor: '#eee' }} /><div className="h-28 rounded-[18px] bg-white/70 animate-pulse border" style={{ borderColor: '#eee' }} /><div className="h-40 rounded-[18px] bg-white/70 animate-pulse border" style={{ borderColor: '#eee' }} /></div> }
function WA() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2m0 18.15c-1.52 0-3.01-.41-4.3-1.18l-.31-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.24 8.23m4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29"/></svg> }
