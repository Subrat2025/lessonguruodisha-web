'use client'
import { useEffect, useState, useCallback } from 'react'
import JSZip from 'jszip'

const OR = { fontFamily: '"Noto Sans Oriya",system-ui,sans-serif' }
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : '')
const aapi = async (p, opts = {}) => {
  const r = await fetch('/api' + p, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok(), ...(opts.headers || {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status))
  return j
}
const SUBJ = { math: 'Math', odia: 'Odia', english: 'English', evs: 'EVS', hindi: 'Hindi', science: 'Science', social: 'Social', unknown: 'Other' }
const EXTRA = '__EXTRA__'

export default function AdminChapterwiseLO() {
  const [files, setFiles] = useState([])        // [{classNo, name, html}]
  const [busy, setBusy] = useState('')
  const [report, setReport] = useState(null)     // dry-run aggregate
  const [mappings, setMappings] = useState({})   // { `${class}::${lessonKey}`: title | '__EXTRA__' }
  const [importRes, setImportRes] = useState(null)
  const [status, setStatus] = useState(null)
  const [capped, setCapped] = useState(null)
  const [tileOn, setTileOn] = useState(null)   // Chapterwise LO v2 homepage-tile switch
  const [err, setErr] = useState('')

  const loadStatus = useCallback(() => { aapi('/admin/lo2/status').then(r => setStatus(r.classes || [])).catch(e => setErr(e.message)) }, [])
  const loadCapped = useCallback(() => { aapi('/admin/lo2/capped-users').then(r => setCapped(r.users || [])).catch(() => setCapped([])) }, [])
  const loadTile = useCallback(() => { aapi('/admin/lo2/tile-switch').then(r => setTileOn(!!r.enabled)).catch(() => setTileOn(false)) }, [])
  useEffect(() => { loadStatus(); loadCapped(); loadTile() }, [loadStatus, loadCapped, loadTile])

  const toggleTile = async () => {
    const next = !tileOn
    if (!window.confirm(next
      ? 'Turn the homepage "Chapter-wise LO" tile ON → it will open the NEW /lo viewer for all teachers. Continue?'
      : 'Turn the tile OFF → it will open the OLD Chapterwise LO section (like today). Continue?')) return
    try { const r = await aapi('/admin/lo2/tile-switch', { method: 'POST', body: JSON.stringify({ enabled: next }) }); setTileOn(!!r.enabled) } catch (ex) { setErr(ex.message) }
  }

  const onPick = async (e) => {
    setErr(''); setReport(null); setImportRes(null); setMappings({})
    const f = e.target.files?.[0]; if (!f) return
    try {
      const out = []
      if (f.name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(f)
        const names = Object.keys(zip.files).filter(n => /class-?\d+\.html$/i.test(n))
        for (const n of names.sort()) { const html = await zip.files[n].async('string'); const m = n.match(/(\d+)/); out.push({ classNo: m ? m[1] : '', name: n.split('/').pop(), html }) }
      } else {
        const html = await f.text(); const m = f.name.match(/(\d+)/); out.push({ classNo: m ? m[1] : '', name: f.name, html })
      }
      if (!out.length) { setErr('No Class-N.html files found in the selection.'); return }
      setFiles(out)
    } catch (ex) { setErr(ex.message) }
  }

  // Build per-class mapping payload: { lessonKey: value } for lessons in `classNo`.
  const mapForClass = (classNo) => {
    const prefix = classNo + '::'
    const out = {}
    for (const [k, v] of Object.entries(mappings)) if (k.startsWith(prefix) && v) out[k.slice(prefix.length)] = v
    return out
  }

  const dryRun = async () => {
    setBusy('dry'); setErr(''); setReport(null)
    try {
      const books = []; const unmatched = []; const catalogs = {}; const totals = { books: 0, lessons: 0, periods: 0, matched: 0, extra: 0, unmatched: 0 }
      for (const f of files) {
        const r = await aapi('/admin/lo2/dry-run', { method: 'POST', body: JSON.stringify({ classNo: f.classNo, html: f.html, mappings: mapForClass(f.classNo) }) })
        r.books.forEach(b => books.push({ class: f.classNo, ...b }))
        ;(r.unmatched || []).forEach(u => unmatched.push(u))
        for (const [sk, list] of Object.entries(r.catalogs || {})) catalogs[f.classNo + '::' + sk] = list
        for (const k of Object.keys(totals)) totals[k] += (r.totals[k] || 0)
      }
      setReport({ books, unmatched, catalogs, totals })
    } catch (ex) { setErr(ex.message) } finally { setBusy('') }
  }

  const doImport = async () => {
    if (!window.confirm(`Import ${files.length} class file(s)? New version stays UNPUBLISHED until you Publish each class.`)) return
    setBusy('import'); setErr(''); setImportRes(null)
    try {
      const agg = { created: 0, updated: 0, notMatched: 0, extra: 0, periods: 0, lessons: 0, perClass: [] }
      for (const f of files) {
        const r = await aapi('/admin/lo2/import', { method: 'POST', body: JSON.stringify({ classNo: f.classNo, fileName: f.name, html: f.html, mappings: mapForClass(f.classNo) }) })
        agg.created += r.created; agg.updated += r.updated; agg.notMatched += r.notMatched; agg.extra += (r.extra || 0); agg.periods += r.periods; agg.lessons += r.lessons
        agg.perClass.push({ classNo: r.classNo, ...r })
      }
      setImportRes(agg); loadStatus()
    } catch (ex) { setErr(ex.message) } finally { setBusy('') }
  }

  const downloadCsv = () => {
    const rows = [['class', 'subject', 'book', 'lesson', 'periods'], ...report.unmatched.map(u => [u.class, u.subject, u.book, u.lesson, u.periods])]
    const csv = rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'lo-unmatched.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const setMap = (u, val) => setMappings(m => ({ ...m, [u.class + '::' + u.lessonKey]: val }))

  const togglePublish = async (c) => {
    try { await aapi('/admin/lo2/publish', { method: 'POST', body: JSON.stringify({ classNo: c.class, published: !c.published }) }); loadStatus() } catch (ex) { setErr(ex.message) }
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16" style={OR}>
      <div className="text-white" style={{ background: 'linear-gradient(120deg,#241a5e,#5B2BC4)' }}>
        <div className="max-w-[900px] mx-auto px-4 py-4">
          <div className="font-extrabold text-[17px]">Chapterwise LO — Period-wise Import</div>
          <div className="text-[12px] opacity-85">Upload the Class ZIP → Dry run (no writes) → map unmatched → Import → Publish per class</div>
        </div>
      </div>
      <div className="max-w-[900px] mx-auto px-4 pt-4">
        {err && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-2.5 text-[13px] mb-3">{err}</div>}

        {/* Homepage tile switch */}
        <div className="bg-white border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-bold text-[14px]">Homepage tile: Chapterwise LO v2</div>
              <div className="text-[12px] text-gray-600 mt-0.5">
                {tileOn === null ? 'Loading…' : tileOn
                  ? 'ON — the "Chapter-wise LO" tile opens the NEW /lo viewer.'
                  : 'OFF — the tile opens the OLD Chapterwise LO section (default).'}
              </div>
              <div className="text-[11px] text-amber-700 mt-1">Turn ON only after Import + Publish + phone check.</div>
            </div>
            <button
              onClick={toggleTile}
              disabled={tileOn === null}
              className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50"
              style={{ background: tileOn ? '#07775A' : '#cbd5e1' }}
              aria-pressed={!!tileOn}
              title="Toggle Chapterwise LO v2 tile"
            >
              <span className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition" style={{ transform: tileOn ? 'translateX(22px)' : 'translateX(3px)' }} />
            </button>
          </div>
        </div>

        {/* Upload */}
        <div className="bg-white border rounded-2xl p-4 mb-4">
          <div className="font-bold text-[14px] mb-2">1 · ଫାଇଲ୍ ବାଛନ୍ତୁ (.zip or Class-N.html)</div>
          <input type="file" accept=".zip,.html" onChange={onPick} className="block text-[13px]" />
          {files.length > 0 && <div className="mt-2 text-[12.5px] text-gray-600">{files.length} class file(s): {files.map(f => f.name).join(', ')}</div>}
          <div className="flex gap-2 mt-3">
            <button onClick={dryRun} disabled={!files.length || busy} className="rounded-full px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: '#2563EB' }}>{busy === 'dry' ? 'Running…' : 'Dry run (no writes)'}</button>
            <button onClick={doImport} disabled={!files.length || busy} className="rounded-full px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: '#07775A' }}>{busy === 'import' ? 'Importing…' : 'Import'}</button>
          </div>
        </div>

        {/* Dry-run report */}
        {report && (
          <div className="bg-white border rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-[14px]">Dry-run report</div>
              {report.unmatched.length > 0 && <button onClick={downloadCsv} className="text-[12px] font-bold text-indigo-600 underline">Download unmatched CSV ({report.unmatched.length})</button>}
            </div>
            <div className="flex flex-wrap gap-2 mb-3 text-[12.5px]">
              <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold">{report.totals.books} books</span>
              <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold">{report.totals.lessons} lessons</span>
              <span className="px-2.5 py-1 rounded-full bg-slate-100 font-bold">{report.totals.periods} periods</span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">matched {report.totals.matched}</span>
              <span className="px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 font-bold">extra {report.totals.extra}</span>
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">unmatched {report.totals.unmatched}</span>
            </div>

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-[12px] border-collapse">
                <thead><tr className="bg-slate-100 text-left"><th className="p-1.5">Class</th><th className="p-1.5">Book</th><th className="p-1.5">Subj</th><th className="p-1.5">Periods</th><th className="p-1.5">Lessons</th><th className="p-1.5">Matched</th><th className="p-1.5">Extra</th><th className="p-1.5">Unmatched</th></tr></thead>
                <tbody>{report.books.map((b, i) => (<tr key={i} className="border-b"><td className="p-1.5">{b.class}</td><td className="p-1.5">{b.bookName}</td><td className="p-1.5">{SUBJ[b.subjectKey]}</td><td className="p-1.5">{b.periods}</td><td className="p-1.5">{b.lessons}</td><td className="p-1.5 text-emerald-700 font-bold">{b.matched}</td><td className="p-1.5 text-sky-700 font-bold">{b.extra || 0}</td><td className="p-1.5 text-amber-600 font-bold">{b.unmatched}</td></tr>))}</tbody>
              </table>
            </div>

            {/* Manual mapping of unmatched lessons */}
            {report.unmatched.length > 0 && (
              <div>
                <div className="font-bold text-[13px] mb-1">Unmatched lessons — map manually ({report.unmatched.length})</div>
                <div className="text-[11.5px] text-gray-500 mb-2">Pick the catalogue chapter, or mark as “Extra (no chapter)”. Then run Dry run again or Import.</div>
                <div className="space-y-1.5">
                  {report.unmatched.map((u, i) => {
                    const cat = report.catalogs[u.class + '::' + u.subject] || []
                    const val = mappings[u.class + '::' + u.lessonKey] || ''
                    return (
                      <div key={i} className="flex items-center gap-2 border rounded-lg p-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-bold truncate">{u.lesson}</div>
                          <div className="text-[10.5px] text-gray-500">Class {u.class} · {SUBJ[u.subject]} · {u.periods} periods</div>
                        </div>
                        <select value={val} onChange={e => setMap(u, e.target.value)} className="text-[12px] border rounded-md px-2 py-1 max-w-[260px]">
                          <option value="">— unmatched —</option>
                          <option value={EXTRA}>Extra (no chapter)</option>
                          <optgroup label="Catalogue chapters">
                            {cat.map((t, j) => <option key={j} value={t}>{t}</option>)}
                          </optgroup>
                        </select>
                      </div>
                    )
                  })}
                </div>
                <button onClick={dryRun} disabled={busy} className="mt-3 rounded-full px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: '#2563EB' }}>Re-run dry run with mappings</button>
              </div>
            )}
          </div>
        )}

        {/* Import result */}
        {importRes && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
            <div className="font-bold text-[14px] text-emerald-800 mb-1">Import complete</div>
            <div className="text-[13px] text-emerald-900">{importRes.updated} updated · {importRes.created} new · {importRes.extra} extra · {importRes.notMatched} still unmatched · {importRes.periods} periods ({importRes.lessons} lessons)</div>
            <div className="text-[12px] text-emerald-700 mt-1">New version is UNPUBLISHED — publish each class below when ready.</div>
          </div>
        )}

        {/* Per-class status + publish */}
        <div className="bg-white border rounded-2xl p-4 mb-4">
          <div className="font-bold text-[14px] mb-2">Classes (new version)</div>
          {!status ? <div className="text-gray-500 text-[13px]">Loading…</div> :
            status.length === 0 ? <div className="text-gray-500 text-[13px]">No imported classes yet.</div> :
              status.map(c => (
                <div key={c.class} className="flex items-center gap-3 border-b py-2.5 last:border-0">
                  <div className="w-8 h-8 rounded-lg grid place-items-center text-white font-bold" style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)' }}>{c.class}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[13.5px]">Class {c.class}</div>
                    <div className="text-[11.5px] text-gray-500">{c.lessons} lessons · {c.periods} periods · {(c.subjects || []).map(s => SUBJ[s.subject]).join(', ')}</div>
                    {c.match && <div className="text-[11px] mt-0.5"><span className="text-emerald-700 font-bold">matched {c.match.matched}</span> · <span className="text-sky-700 font-bold">extra {c.match.extra}</span> · <span className="text-amber-600 font-bold">unmatched {c.match.unmatched}</span></div>}
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{c.published ? 'Published' : 'Unpublished'}</span>
                  <button onClick={() => togglePublish(c)} className={`rounded-full px-3 py-1.5 text-[12px] font-bold text-white ${c.published ? 'bg-slate-500' : 'bg-emerald-600'}`}>{c.published ? 'Unpublish' : 'Publish'}</button>
                </div>
              ))}
        </div>

        {/* Daily-cap hits (possible copying) */}
        <div className="bg-white border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-[14px]">⚠ Daily-cap hits (possible copying)</div>
            <button onClick={loadCapped} className="text-[12px] text-indigo-600 underline">Refresh</button>
          </div>
          {!capped ? <div className="text-gray-500 text-[13px]">Loading…</div> :
            capped.length === 0 ? <div className="text-gray-500 text-[13px]">No users have hit the 300/day limit.</div> :
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead><tr className="bg-slate-100 text-left"><th className="p-1.5">Name</th><th className="p-1.5">Mobile</th><th className="p-1.5">Day</th><th className="p-1.5">Loads</th></tr></thead>
                  <tbody>{capped.map((u, i) => (<tr key={i} className="border-b"><td className="p-1.5">{u.name || '—'}</td><td className="p-1.5">{u.mobile || '—'}</td><td className="p-1.5">{u.day}</td><td className="p-1.5 font-bold text-amber-600">{u.count}</td></tr>))}</tbody>
                </table>
              </div>}
        </div>
      </div>
    </div>
  )
}
