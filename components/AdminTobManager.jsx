'use client'
import React, { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { sget, spost, sput, sdel, API, getToken } from '@/components/store/api'

const TABS = [['import', '⬆️ Import'], ['onezip', '📦 One-ZIP'], ['items', '📋 Items & Validation'], ['orders', '🧾 Orders'], ['files', '🗂️ Files'], ['revenue', '📈 Revenue'], ['sell', '💰 Sell'], ['trash', '🗑️ Trash'], ['audit', '📜 Audit'], ['settings', '⚙️ Settings']]

export default function AdminTobManager({ goLoMaster, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'items')
  const [isSuper, setIsSuper] = useState(false)
  useEffect(() => { sget('/tob/admin/superadmin').then(r => setIsSuper(!!r.isSuper)).catch(() => {}) }, [])
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-[11px] text-gray-500 flex-1">Teacher Observation (Task & Project, Two Terms) — isolated <code>tob*</code> collections. LO source = LO Master. {isSuper && <span className="text-emerald-600 font-bold">· Super-admin</span>}</div>
        <button onClick={goLoMaster} className="text-[11px] font-bold rounded-full px-3 py-1.5 bg-emerald-600 text-white">📗 View LO Master</button>
      </div>
      <div className="flex gap-1.5 flex-wrap">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`text-xs font-bold rounded-full px-3 py-1.5 ${tab === k ? 'bg-indigo-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>)}</div>
      {tab === 'import' && <ImportTab isSuper={isSuper} />}
      {tab === 'onezip' && <OneZipTab />}
      {tab === 'items' && <ItemsTab isSuper={isSuper} />}
      {tab === 'sell' && <SellTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'files' && <FilesTab />}
      {tab === 'revenue' && <RevenueTab />}
      {tab === 'trash' && <TrashTab isSuper={isSuper} />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}

const ST_COL = { green: ['#dcfce7', '#166534'], yellow: ['#fef9c3', '#854d0e'], red: ['#fee2e2', '#991b1b'] }

function OneZipTab() {
  const [file, setFile] = useState(null)
  const [peek, setPeek] = useState(null)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const doPeek = async (f) => {
    setFile(f); setPeek(null); setRows([]); setResult(null); setBusy(true)
    try {
      const fd = new FormData(); fd.append('file', f)
      const r = await fetch(`${API}/tob/admin/import-onezip/peek`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      const d = await r.json(); if (!r.ok) throw new Error(d.error)
      setPeek(d); setRows(d.rows.map(x => ({ ...x })))
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const upd = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const commit = async (publish) => {
    if (!file || !peek) return
    setBusy(true); setResult(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('class', peek.class); fd.append('subject', peek.subject_id)
      fd.append('publish', publish ? 'true' : 'false'); fd.append('rows', JSON.stringify(rows))
      const r = await fetch(`${API}/tob/admin/import-onezip/commit`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      const d = await r.json(); if (!r.ok) throw new Error(d.error)
      setResult(d); toast.success(`Saved — ${d.added} added · ${d.replaced} replaced · ${d.published} published · ${d.skipped} skipped`)
      doPeek(file)  // refresh dup flags / statuses
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const s = peek?.summary

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border p-4">
        <div className="font-bold text-sm text-indigo-900 mb-1">Upload ONE ZIP (one class + one subject)</div>
        <div className="text-[11px] text-gray-500 mb-2">Folders: Term1_Chapters / Term2_Chapters / Sets_FullYear / Sets_Term1 / Sets_Term2 / Records_Register + <b>manifest.csv</b> (decides class/subject/type/term). HTML only — PDFs are ignored. Max 25 MB.</div>
        <input type="file" accept=".zip" onChange={e => e.target.files?.[0] && doPeek(e.target.files[0])} className="text-xs" />
      </div>

      <details className="bg-white rounded-2xl border p-3 text-[11px] text-gray-600">
        <summary className="cursor-pointer font-bold text-indigo-900 text-xs">Marks framework per subject (read-only)</summary>
        <table className="w-full mt-2">
          <tbody>
            <tr className="border-b"><td className="py-1 pr-2 font-semibold whitespace-nowrap">OD, MATH, E, EV, H, S, SC, SS</td><td className="py-1">25 = ଲିଖିତ 10 + ପ୍ରକଳ୍ପ 15 (+ ଡାଏରୀ 5 only Classes 6–8)</td></tr>
            <tr className="border-b"><td className="py-1 pr-2 font-semibold">AE (Art Education)</td><td className="py-1">25 = ଦୃଶ୍ୟକଳା 10 + ସଙ୍ଗୀତ 5 + ନୃତ୍ୟ 5 + ନାଟକ 5 (no diary)</td></tr>
            <tr className="border-b"><td className="py-1 pr-2 font-semibold">PE (Physical Education)</td><td className="py-1">25 = ମୌଳିକ ଗତିବିଧି 10 + ଖେଳ ଓ କ୍ରୀଡ଼ା 5 + ଯୋଗ 10 · ପ୍ରଦର୍ଶନ 15 (separate)</td></tr>
            <tr><td className="py-1 pr-2 font-semibold">VE</td><td className="py-1">Framework not set yet — only total = 25 checked (YELLOW, publishable)</td></tr>
          </tbody>
        </table>
      </details>


      {busy && !peek && <div className="text-sm text-gray-400">Reading ZIP…</div>}

      {peek && (
        <>
          <div className="bg-white rounded-2xl border p-3 space-y-2">
            <div className="text-[12px] text-gray-700 flex flex-wrap gap-x-3 gap-y-1">
              <span>Class <b>{peek.class}</b> · {peek.subject_printed} (<b>{peek.subject_id}</b>){!peek.hasManifest && <span className="text-amber-600"> · no manifest</span>}</span>
              <span>{s.total} files</span>
              <span className="text-emerald-700 font-bold">{s.green} green</span>
              <span className="text-amber-700 font-bold">{s.yellow} yellow</span>
              <span className="text-rose-700 font-bold">{s.red} red</span>
              <span>{s.chapters} ch · {s.sets} sets · {s.registers} reg</span>
              {s.duplicates > 0 && <span className="text-indigo-700 font-bold">{s.duplicates} duplicate → Replace</span>}
            </div>
            {(peek.warnings || []).map((w, i) => <div key={i} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{w}</div>)}
          </div>

          <div className="bg-white rounded-2xl border overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="bg-gray-50 text-gray-500 text-left"><th className="p-2">File</th><th className="p-2">Type</th><th className="p-2">Term</th><th className="p-2">Ch/Set</th><th className="p-2">Title</th><th className="p-2">Status</th><th className="p-2">Dup</th></tr></thead>
              <tbody>
                {rows.map((r, i) => { const [bg, fg] = ST_COL[r.status] || ST_COL.green; return (
                  <tr key={i} className="border-t">
                    <td className="p-2 text-gray-600 whitespace-nowrap">{r.fileName}</td>
                    <td className="p-2"><select value={r.type} onChange={e => upd(i, { type: e.target.value })} className="border rounded px-1 py-0.5"><option value="chapter">chapter</option><option value="set">set</option><option value="register">register</option></select></td>
                    <td className="p-2"><select value={r.term || 'full'} onChange={e => upd(i, { term: e.target.value })} className="border rounded px-1 py-0.5"><option value="1">T1</option><option value="2">T2</option><option value="full">FULL</option></select></td>
                    <td className="p-2">{r.type === 'chapter' ? <input value={r.chapterNo ?? ''} onChange={e => upd(i, { chapterNo: e.target.value })} className="border rounded px-1 py-0.5 w-12" /> : r.type === 'set' ? <input value={r.setCode ?? ''} onChange={e => upd(i, { setCode: e.target.value.toUpperCase() })} className="border rounded px-1 py-0.5 w-10" /> : '—'}</td>
                    <td className="p-2 text-gray-700 max-w-[160px] truncate" title={r.title}>{r.title}</td>
                    <td className="p-2"><span className="font-bold rounded-full px-2 py-0.5" style={{ background: bg, color: fg }}>{String(r.status || '').toUpperCase()}{r.redCount ? ` ${r.redCount}` : ''}</span>{r.status === 'red' && (r.reason || (r.checks || []).some(c => c.level === 'red')) && (<div className="text-[10px] text-rose-700 mt-1 max-w-[260px] leading-tight">{r.reason || ((r.checks || []).find(c => c.level === 'red') || {}).message}</div>)}</td>
                    <td className="p-2">{r.dup ? <label className="flex items-center gap-1 text-indigo-700"><input type="checkbox" checked={r.replace !== false} onChange={e => upd(i, { replace: e.target.checked })} />Replace</label> : <span className="text-gray-300">new</span>}</td>
                  </tr>) })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 sticky bottom-0 bg-gradient-to-t from-white via-white pt-2">
            <button onClick={() => commit(false)} disabled={busy} className="flex-1 rounded-xl py-2.5 font-bold text-sm border border-indigo-900 text-indigo-900 disabled:opacity-40">Save (draft)</button>
            <button onClick={() => commit(true)} disabled={busy} className="flex-1 rounded-xl py-2.5 font-bold text-sm text-white disabled:opacity-40" style={{ background: '#2a9d5c' }}>Save &amp; Publish (GREEN+YELLOW)</button>
          </div>

          {result && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-[12px] text-emerald-800">Added {result.added} · Replaced {result.replaced} · Published {result.published} · Skipped {result.skipped}</div>}
        </>
      )}
    </div>
  )
}

function ImportTab({ isSuper }) {
  const [file, setFile] = useState(null); const [peek, setPeek] = useState(null)
  const [meta, setMeta] = useState({ class: '', subject: '' }); const [mode, setMode] = useState('skip')
  const [job, setJob] = useState(null); const poll = useRef(null)
  const doPeek = async (f) => {
    setFile(f); setPeek(null); setJob(null)
    const fd = new FormData(); fd.append('file', f)
    try { const r = await fetch(`${API}/tob/admin/import/peek`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setPeek(d); setMeta({ class: d.prefill.class || '', subject: d.prefill.subject_id || '' }) } catch (e) { toast.error(e.message) }
  }
  const start = async () => {
    if (!meta.class || !meta.subject) { toast.error('Class and subject required'); return }
    const fd = new FormData(); fd.append('file', file); fd.append('class', meta.class); fd.append('subject', meta.subject); fd.append('mode', mode)
    try { const r = await fetch(`${API}/tob/admin/import`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); toast.success('Import started'); pollJob(d.jobId) } catch (e) { toast.error(e.message) }
  }
  const pollJob = (id) => { const tick = async () => { try { const r = await sget(`/tob/admin/import/jobs/${id}`); setJob(r.job); if (['done', 'error'].includes(r.job.status)) clearInterval(poll.current) } catch {} }; tick(); poll.current = setInterval(tick, 2000) }
  useEffect(() => () => poll.current && clearInterval(poll.current), [])
  const grp = (job?.results || []).reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a }, {})
  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border p-4">
        <div className="font-bold text-sm text-indigo-900 mb-1">Upload content ZIP (≤25MB)</div>
        <div className="text-[11px] text-gray-500 mb-3">Chapter packs + observation sets + records register. Folder 05 (earlier version) is skipped. Imported as DRAFT and validated against the LO Master.</div>
        <input type="file" accept=".zip" onChange={e => e.target.files?.[0] && doPeek(e.target.files[0])} className="text-xs" />
      </div>
      {peek && (
        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <div className="text-[12px] text-gray-700"><b>{peek.counts?.chapter || 0}</b> chapters · <b>{peek.counts?.set || 0}</b> sets · <b>{peek.counts?.register || 0}</b> register · <span className="text-gray-400">{peek.counts?.skipped || 0} skipped</span></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-bold text-gray-600">Class<input value={meta.class} onChange={e => setMeta(m => ({ ...m, class: e.target.value }))} className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="text-[11px] font-bold text-gray-600">Subject (id, e.g. OD)<input value={meta.subject} onChange={e => setMeta(m => ({ ...m, subject: e.target.value.toUpperCase() }))} className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" /></label>
          </div>
          <div className="flex items-center gap-2"><span className="text-[11px] font-bold text-gray-600">Duplicates:</span>{[['skip', 'Skip'], ['replace', 'Replace'], ['new', 'New']].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${mode === k ? 'bg-indigo-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>)}</div>
          <button onClick={start} className="text-xs font-bold rounded-full px-3 py-1.5 text-white" style={{ background: '#2a9d5c' }}>Import</button>
        </div>
      )}
      {job && (
        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-2"><div className="font-bold text-sm text-indigo-900">{job.zipName}</div><span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: job.status === 'done' ? '#2a9d5c' : job.status === 'error' ? '#e8452c' : '#1fa2d9' }}>{job.status}</span></div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2"><div className="h-full" style={{ width: `${job.total ? Math.round(job.done / job.total * 100) : 0}%`, background: '#f7b32b' }} /></div>
          <div className="text-[12px] text-gray-700">Imported: {job.imported?.chapters || 0} chapters · {job.imported?.sets || 0} sets · {job.imported?.registers || 0} register · {job.imported?.skipped || 0} skipped · {job.imported?.replaced || 0} replaced</div>
          <div className="flex gap-2 mt-1 text-[11px]">{Object.entries(grp).map(([s, n]) => <span key={s} className="font-bold rounded px-2 py-0.5" style={{ background: s === 'green' ? '#dcfce7' : s === 'yellow' ? '#fef9c3' : s === 'skipped' ? '#f1f5f9' : '#fee2e2', color: s === 'green' ? '#166534' : s === 'yellow' ? '#854d0e' : s === 'skipped' ? '#64748b' : '#991b1b' }}>{n} {s}</span>)}</div>
          {!!(job.errors || []).length && <div className="mt-2 text-[11px] text-rose-600">{job.errors.map((e, i) => <div key={i}>• {e.file}: {e.reason}</div>)}</div>}
          {job.status === 'done' && <div className="text-[11px] text-gray-500 mt-2">Review in the <b>Items & Validation</b> tab, then publish (RED items must be fixed first).</div>}
          {job.status === 'done' && (job.id || job._id) && <button onClick={async () => { const name = prompt(`This moves ALL items from this import to Trash (restorable 30 days). Type "Class ${job.class || meta.class} ${job.subject_id || meta.subject}" to confirm:`); if (name == null) return; try { const r = await spost('/tob/admin/job/delete', { jobId: job.id || job._id, mode: 'trash', confirmName: name }); if (r.ok === false) throw new Error(r.error); toast.success(`Import moved to Trash (${r.trashed} items)`) } catch (e) { toast.error(e.message) } }} className="mt-2 text-[11px] font-bold rounded-full px-2.5 py-1 border border-rose-400 text-rose-600">🗑 Delete this import's items</button>}
        </div>
      )}
    </div>
  )
}

const STATUS_COL = { green: ['#dcfce7', '#166534'], yellow: ['#fef9c3', '#854d0e'], red: ['#fee2e2', '#991b1b'] }

function ItemsTab({ isSuper }) {
  const [list, setList] = useState(null); const [cls, setCls] = useState('4'); const [subject, setSubject] = useState('OD')
  const [open, setOpen] = useState(null); const [dlg, setDlg] = useState(null); const [sp, setSp] = useState(null)
  const load = () => sget(`/tob/admin/items?class=${cls}&subject=${subject}`).then(r => setList(r.items || [])).catch(() => setList([]))
  const loadSp = () => sget(`/tob/admin/samples/progress?class=${cls}&subject=${subject}`).then(setSp).catch(() => setSp(null))
  useEffect(() => { load(); loadSp() }, [cls, subject])
  useEffect(() => { const t = setInterval(loadSp, 5000); return () => clearInterval(t) }, [cls, subject])
  const act = async (id, path, bodyObj) => { try { const r = await spost(`/tob/admin/items/${id}/${path}`, bodyObj || {}); if (r.ok === false) throw new Error(r.error); toast.success('Done'); load() } catch (e) { toast.error(e.message) } }
  const trashItem = (it) => setDlg({ title: 'Move to Trash?', danger: false, body: <div className="text-[12px] text-gray-700">"<b>{it.title}</b>" will be hidden from teachers and kept for 30 days. Teachers' saved marks are kept.</div>, confirmLabel: 'Move to Trash', onConfirm: async () => { try { const r = await spost('/tob/admin/trash', { ids: [it.id] }); toast.success(`Moved to Trash (${r.recordsKept} teacher records kept)`); setDlg(null); load() } catch (e) { toast.error(e.message) } } })
  const deleteCourse = async () => {
    try {
      const imp = await sget(`/tob/admin/delete-impact?class=${cls}&subject=${subject}`)
      const name = `Class ${imp.class} ${imp.subject_id}`
      setDlg({ title: 'Delete whole course?', danger: true, requireName: name,
        body: <div className="text-[12px] text-gray-700 space-y-1"><div><b>{imp.count}</b> items ({imp.published} published) · Class {imp.class} {imp.subject_id}</div>{imp.teachers > 0 && <div className="text-amber-700">{imp.teachers} teacher(s) have saved records — their records will be kept.</div>}<div className="text-gray-500">Type exactly: <b>{name}</b></div></div>,
        confirmLabel: 'Move course to Trash', onConfirm: async (typed) => { try { const r = await spost('/tob/admin/course/delete', { class: cls, subject, mode: 'trash', confirmName: typed }); if (r.ok === false) throw new Error(r.error); toast.success(`Course moved to Trash (${r.trashed} items)`); setDlg(null); load() } catch (e) { toast.error(e.message) } } })
    } catch (e) { toast.error(e.message) }
  }
  const dedupe = async () => {
    try {
      const pre = await sget(`/tob/admin/dedupe-preview?class=${cls}&subject=${subject}`)
      if (!pre.duplicates.length) { toast.success('No duplicates found — nothing to remove.'); return }
      setDlg({
        title: `Remove ${pre.duplicates.length} duplicate(s)?`, danger: true,
        body: <div className="text-[12px] text-gray-700 space-y-1"><div>Keeps the <b>newest</b> copy of each chapter/set/term; moves <b>{pre.duplicates.length}</b> older copies to Trash (restorable).</div><div className="max-h-40 overflow-y-auto border rounded p-1 text-[10px] text-gray-500">{pre.duplicates.map(x => <div key={x.id}>{x.type === 'set' ? `Set ${x.setCode}` : x.type === 'register' ? 'Register' : `Ch ${x.chapterNo}`} · T{x.term} · {x.status}</div>)}</div></div>,
        confirmLabel: 'Move duplicates to Trash', onConfirm: async () => {
          try { const r = await spost('/tob/admin/dedupe', { class: cls, subject }); setDlg(null); load()
            toast.success(`${r.trashed} duplicate(s) moved to Trash`, { action: { label: 'Undo', onClick: async () => { try { await spost('/tob/admin/restore', { ids: r.ids }); toast.success('Restored'); load() } catch (e) { toast.error(e.message) } } }, duration: 8000 })
          } catch (e) { toast.error(e.message) }
        }
      })
    } catch (e) { toast.error(e.message) }
  }
  const publishCourse = async (status) => { try { const r = await spost('/tob/admin/courses/status', { class: cls, subject, status }); if (r.ok === false) throw new Error(r.error); toast.success(r.message || `${r.published ?? r.modified ?? 0} items ${status}`); if (r.skippedCount) toast.error(`${r.skippedCount} skipped (not GREEN/approved)`); load() } catch (e) { toast.error(e.message) } }
  const revalidate = async () => { try { toast.loading('Re-validating…', { id: 'rv' }); const r = await spost('/tob/admin/revalidate', { class: cls, subject }); const s = r.summary; toast.success(`Re-validated ${s.total}: ${s.green || 0} green · ${s.yellow || 0} yellow · ${s.red || 0} red`, { id: 'rv' }); load() } catch (e) { toast.error(e.message, { id: 'rv' }) } }
  if (list === null) return <div className="text-sm text-gray-400">Loading…</div>
  const reds = list.filter(i => i.validation?.status === 'red').length
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={cls} onChange={e => setCls(e.target.value)} className="border rounded-lg px-2 py-1 text-sm w-14" placeholder="cls" />
        <input value={subject} onChange={e => setSubject(e.target.value.toUpperCase())} className="border rounded-lg px-2 py-1 text-sm w-16" placeholder="subj" />
        <span className="text-[11px] text-gray-500">{list.length} items · {reds} RED</span>
        {sp && sp.total > 0 && <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={{ background: sp.ready >= sp.total ? '#dcfce7' : '#fef3c7', color: sp.ready >= sp.total ? '#166534' : '#92610a' }}>Samples: {sp.ready}/{sp.total} ready{sp.failed ? ` · ${sp.failed} failed` : ''}{sp.building ? ' · building…' : ''}</span>}
        <div className="ml-auto flex gap-1.5"><button onClick={revalidate} className="text-[11px] font-bold rounded-full px-2.5 py-1 text-white" style={{ background: '#1fa2d9' }}>↻ Re-validate</button><button onClick={() => publishCourse('published')} className="text-[11px] font-bold rounded-full px-2.5 py-1 text-white" style={{ background: '#2a9d5c' }}>Publish all</button><button onClick={() => publishCourse('draft')} className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-gray-200 text-gray-600">Unpublish all</button><button onClick={dedupe} className="text-[11px] font-bold rounded-full px-2.5 py-1 border border-amber-400 text-amber-700">🧹 Remove duplicates</button>{isSuper && <button onClick={deleteCourse} className="text-[11px] font-bold rounded-full px-2.5 py-1 border border-rose-400 text-rose-600">🗑 Delete course</button>}</div>
      </div>
      {dlg && <ConfirmDialog dlg={dlg} onClose={() => setDlg(null)} />}
      <div className="space-y-1.5">
        {list.map(it => {
          const [bg, fg] = STATUS_COL[it.validation?.status] || STATUS_COL.green
          return (
            <div key={it.id} className="bg-white border rounded-xl">
              <div className="flex items-center gap-2 p-2.5 text-[12px]">
                <span className="w-8 text-center font-bold text-gray-400 shrink-0">{it.type === 'set' ? it.setCode : it.chapterNo}</span>
                <div className="flex-1 min-w-0"><span className="font-semibold text-gray-800">{it.title}</span> <span className="text-gray-400">· {it.type === 'set' ? 'Set' : `T${it.term}`} · cov {it.coverage?.covered}/{it.coverage?.total}</span></div>
                <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ background: bg, color: fg }}>{(it.validation?.status || '').toUpperCase()}{it.validation?.redCount ? ` ${it.validation.redCount}` : ''}{it.validation?.yellowCount ? ` ⚠${it.validation.yellowCount}` : ''}</span>
                <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ background: it.status === 'published' ? '#dcfce7' : '#f1f1f6', color: it.status === 'published' ? '#166534' : '#888' }}>{it.status}</span>
                <button onClick={() => setOpen(open === it.id ? null : it.id)} className="text-[11px] text-indigo-600 font-bold">{open === it.id ? 'Hide' : 'Checks'}</button>
                <select value={it.term === null || it.term === 'full' ? 'full' : String(it.term)} onChange={e => act(it.id, 'set-term', { term: e.target.value })} className="text-[10px] border rounded px-1 py-0.5 font-bold text-gray-600" title="Term">
                  <option value="1">T1</option><option value="2">T2</option><option value="full">FULL</option>
                </select>
                <button onClick={() => act(it.id, 'status', { status: it.status === 'published' ? 'draft' : 'published' })} className="text-[11px] text-gray-600 font-bold">{it.status === 'published' ? 'Unpub' : 'Pub'}</button>
                <button onClick={() => trashItem(it)} className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-rose-300 text-rose-600" title="Move to Trash">🗑</button>
              </div>
              {open === it.id && (
                <div className="border-t px-3 py-2 space-y-1.5">
                  {(it.checks || []).length === 0 && <div className="text-[11px] text-emerald-600">✅ All checks passed (GREEN).</div>}
                  {(it.checks || []).map((c, i) => <div key={i} className="text-[11px]"><span className="font-bold" style={{ color: c.level === 'red' ? '#991b1b' : c.level === 'yellow' ? '#854d0e' : '#166534' }}>[{c.level.toUpperCase()} {c.code}]</span> {c.message}</div>)}
                  {it.checks?.some(c => c.code === 'MARKS') && <button onClick={() => act(it.id, 'apply-marks-fix', { reason: 'admin applied framework marks' })} className="text-[11px] font-bold rounded-full px-2.5 py-1 text-white mt-1" style={{ background: '#2a9d5c' }}>Apply fix (framework marks)</button>}
                  {it.validation?.status === 'red' && <button onClick={() => { const r = prompt('Override reason (required):'); if (r) act(it.id, 'override-red', { reason: r }) }} className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-amber-500 text-white mt-1 ml-1">Override RED</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PRICE_FIELDS = [['setTerm', 'One term', 'setTermMrp'], ['setFull', 'Full year', 'setFullMrp'], ['chapter', 'Single chapter', 'chapterMrp'], ['subjectPack', 'Subject pack', null], ['classPack', 'Class pack', null]]
const od2 = (n) => String(n ?? '').replace(/\d/g, d => '୦୧୨୩୪୫୬୭୮୯'[d])

export function OrdersTab() {
  const [data, setData] = useState(null)
  const [f, setF] = useState({ search: '', class: '', subject: '', status: '', from: '', to: '' })
  const [grant, setGrant] = useState({ mobile: '', sku: '', reason: '' })
  const qs = () => Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const load = () => sget('/tob/admin/orders' + (qs() ? '?' + qs() : '')).then(setData).catch(e => toast.error(e.message))
  useEffect(() => { load() }, [])
  const refund = async (id, amount) => { if (!confirm(`Mark this order REFUNDED and revoke the teacher's access?\n\n⚠ IMPORTANT: This only revokes access + records the refund. It does NOT return any money. You must refund ₹${amount || ''} to the teacher yourself from the Razorpay dashboard (or UPI/QR), as this app cannot move money.`)) return; try { const r = await spost(`/tob/admin/orders/${id}/refund`, {}); if (r.ok === false) throw new Error(r.error); toast.success(`Access revoked (${r.revoked}). Now refund ₹${amount || ''} in Razorpay — the app can't move money.`); load() } catch (e) { toast.error(e.message) } }
  const doGrant = async () => { try { const r = await spost('/tob/admin/orders/grant', grant); if (r.ok === false) throw new Error(r.error); toast.success(`Granted ${r.label} to ${r.teacher}`); setGrant({ mobile: '', sku: '', reason: '' }); load() } catch (e) { toast.error(e.message) } }
  const exportCsv = async () => { try { const r = await fetch(`${API}/tob/admin/orders/export` + (qs() ? '?' + qs() : ''), { headers: { Authorization: `Bearer ${getToken()}` } }); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'tob-orders.csv'; a.click(); URL.revokeObjectURL(u) } catch (e) { toast.error(e.message) } }
  if (!data) return <div className="text-sm text-gray-400">Loading…</div>
  const s = data.summary
  const SC = { paid: ['#dcfce7', '#166534'], created: ['#fef9c3', '#854d0e'], refunded: ['#fee2e2', '#991b1b'], failed: ['#fee2e2', '#991b1b'], pending: ['#fef9c3', '#854d0e'] }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Revenue', `₹${s.revenue}`], ['Paid orders', s.paidCount], ['Packs', s.packCount], ['Singles', s.singleCount]].map(([k, v]) => <div key={k} className="bg-white border rounded-xl p-2.5"><div className="text-[10px] text-gray-500">{k}</div><div className="font-extrabold text-indigo-900 text-sm">{v}</div></div>)}
      </div>
      <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">⚠ Refund here only revokes access + records it. It does <b>not</b> move money — you must refund the payment yourself in the Razorpay dashboard (or via UPI/QR).</div>
      <div className="bg-white border rounded-2xl p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <input value={f.search} onChange={e => setF({ ...f, search: e.target.value })} placeholder="search teacher/item/id" className="border rounded-lg px-2 py-1 text-xs flex-1 min-w-[120px]" />
          <input value={f.class} onChange={e => setF({ ...f, class: e.target.value })} placeholder="class" className="border rounded-lg px-2 py-1 text-xs w-14" />
          <input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value.toUpperCase() })} placeholder="subj" className="border rounded-lg px-2 py-1 text-xs w-16" />
          <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} className="border rounded-lg px-2 py-1 text-xs"><option value="">any</option><option value="paid">paid</option><option value="created">pending</option><option value="refunded">refunded</option></select>
          <input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} className="border rounded-lg px-2 py-1 text-xs" />
          <input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} className="border rounded-lg px-2 py-1 text-xs" />
          <button onClick={load} className="text-[11px] font-bold rounded-full px-3 py-1.5 bg-indigo-900 text-white">Filter</button>
          <button onClick={exportCsv} className="text-[11px] font-bold rounded-full px-3 py-1.5 border border-indigo-900 text-indigo-900">⬇ CSV</button>
        </div>
      </div>
      <div className="bg-white border rounded-2xl overflow-x-auto">
        <table className="w-full text-[11px]"><thead><tr className="bg-gray-50 text-gray-500 text-left"><th className="p-2">Date</th><th className="p-2">Teacher</th><th className="p-2">Items</th><th className="p-2">Cls/Sub</th><th className="p-2">₹</th><th className="p-2">Pay</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
          <tbody>{data.orders.map(o => { const [bg, fg] = SC[o.status] || SC.created; return (
            <tr key={o.id} className="border-t">
              <td className="p-2 whitespace-nowrap text-gray-600">{new Date(o.date).toLocaleDateString()}</td>
              <td className="p-2 whitespace-nowrap">{o.teacher}<div className="text-gray-400">{o.mobileMasked}</div></td>
              <td className="p-2 max-w-[160px] truncate" title={o.items}>{o.items}</td>
              <td className="p-2 whitespace-nowrap text-gray-500">{o.classes}/{o.subjects}</td>
              <td className="p-2 font-bold">₹{o.amount}</td>
              <td className="p-2 text-gray-500">{o.method}</td>
              <td className="p-2"><span className="font-bold rounded-full px-2 py-0.5" style={{ background: bg, color: fg }}>{o.status}</span></td>
              <td className="p-2">{o.status === 'paid' && <button onClick={() => refund(o.id, o.amount)} className="text-[10px] font-bold text-rose-600 border border-rose-300 rounded-full px-2 py-0.5">Refund</button>}</td>
            </tr>) })}
            {!data.orders.length && <tr><td colSpan={8} className="p-6 text-center text-gray-400">No orders.</td></tr>}
          </tbody></table>
      </div>
      <div className="bg-white border rounded-2xl p-3">
        <div className="font-bold text-[12px] text-indigo-900 mb-2">Grant access manually (logged)</div>
        <div className="flex flex-wrap gap-2 items-center">
          <input value={grant.mobile} onChange={e => setGrant({ ...grant, mobile: e.target.value })} placeholder="teacher mobile" className="border rounded-lg px-2 py-1 text-xs w-32" />
          <input value={grant.sku} onChange={e => setGrant({ ...grant, sku: e.target.value })} placeholder="sku e.g. subjpack:5:MATH" className="border rounded-lg px-2 py-1 text-xs flex-1 min-w-[150px]" />
          <input value={grant.reason} onChange={e => setGrant({ ...grant, reason: e.target.value })} placeholder="reason" className="border rounded-lg px-2 py-1 text-xs w-28" />
          <button onClick={doGrant} className="text-[11px] font-bold rounded-full px-3 py-1.5 bg-emerald-600 text-white">Grant</button>
        </div>
        <div className="text-[10px] text-gray-400 mt-1">SKU forms: set:CLS:SUBJ:A:full · chapter:CLS:SUBJ:3 · subjpack:CLS:SUBJ · classpack:CLS</div>
      </div>
    </div>
  )
}

const LO_COL = { green: '#166534', yellow: '#854d0e', red: '#991b1b' }
function FilesTab() {
  const [cls, setCls] = useState('5'); const [subject, setSubject] = useState('MATH')
  const [data, setData] = useState(null); const [buyers, setBuyers] = useState(null); const [dl, setDl] = useState(null)
  const [busy, setBusy] = useState(''); const [regen, setRegen] = useState(null); const [health, setHealth] = useState(null)
  const load = () => { sget(`/tob/admin/files?class=${cls}&subject=${subject}`).then(setData).catch(e => toast.error(e.message)); sget(`/tob/admin/files/downloads?class=${cls}&subject=${subject}`).then(setDl).catch(() => {}) }
  useEffect(() => { load() }, [])
  const act = async (fn) => { try { await fn(); toast.success('Done'); load() } catch (e) { toast.error(e.message) } }
  const regenSamples = async () => { setBusy('regen'); setRegen(null); try { const r = await spost('/tob/admin/samples/regenerate', { class: cls, subject }); setRegen(r); toast.success(`Samples · ${r.ok} ok · ${r.failed} failed · ${r.skipped} skipped`) } catch (e) { toast.error(e.message) } finally { setBusy('') } }
  const runHealth = async () => { setBusy('health'); setHealth(null); try { const r = await spost('/tob/admin/health-check', { class: cls, subject }); setHealth(r); toast[r.sample?.ok && r.pdf?.ok ? 'success' : 'error'](`Sample ${r.sample?.ok ? 'OK' : 'FAIL'} · PDF ${r.pdf?.ok ? 'OK' : 'FAIL'}`) } catch (e) { toast.error(e.message) } finally { setBusy('') } }
  const setStatus = (id, status) => act(() => spost(`/tob/admin/items/${id}/status`, { status }))
  const trash = (id) => act(() => spost('/tob/admin/trash', { ids: [id] }))
  const bulk = (status) => act(() => spost('/tob/admin/courses/status', { class: cls, subject, status }))
  const showBuyers = (sku) => sget(`/tob/admin/files/buyers?sku=${encodeURIComponent(sku)}`).then(r => setBuyers({ sku, list: r.buyers })).catch(e => toast.error(e.message))
  if (!data) return <div className="text-sm text-gray-400">Loading…</div>
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input value={cls} onChange={e => setCls(e.target.value)} className="border rounded-lg px-2 py-1 text-sm w-14" placeholder="cls" />
        <input value={subject} onChange={e => setSubject(e.target.value.toUpperCase())} className="border rounded-lg px-2 py-1 text-sm w-16" placeholder="subj" />
        <button onClick={load} className="text-[11px] font-bold rounded-full px-3 py-1.5 bg-indigo-900 text-white">Load</button>
        <span className="text-[11px] text-gray-500">{data.subject_printed} · {data.totalItems} items · {data.packBuyers} pack buyers</span>
        <div className="ml-auto flex gap-1.5"><button onClick={() => bulk('published')} className="text-[11px] font-bold rounded-full px-2.5 py-1 text-white" style={{ background: '#2a9d5c' }}>Publish all</button><button onClick={() => bulk('draft')} className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-gray-200 text-gray-600">Unpublish all</button></div>
      </div>

      {/* Sample & PDF engine tools */}
      <div className="bg-white border rounded-2xl p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-bold text-[12px] text-indigo-900">Sample & PDF engine</div>
          <button onClick={regenSamples} disabled={!!busy} className="text-[11px] font-bold rounded-full px-3 py-1.5 bg-indigo-900 text-white disabled:opacity-40">{busy === 'regen' ? 'Re-generating…' : '🔄 Re-generate samples'}</button>
          <button onClick={runHealth} disabled={!!busy} className="text-[11px] font-bold rounded-full px-3 py-1.5 bg-amber-600 text-white disabled:opacity-40">{busy === 'health' ? 'Checking…' : '🩺 Health check'}</button>
          <span className="text-[10px] text-gray-400">Rebuilds page-1 PNG samples (Class {cls} {subject}) · Health check makes 1 sample + 1 PDF on this server.</span>
        </div>
        {regen && (
          <div className="text-[11px] rounded-lg border p-2" style={{ background: regen.failed ? '#fef2f2' : '#f0fdf4', borderColor: regen.failed ? '#fecaca' : '#bbf7d0' }}>
            <div className="font-bold" style={{ color: regen.failed ? '#991b1b' : '#166534' }}>Samples re-generated · {regen.ok} OK · {regen.failed} failed · {regen.skipped} skipped (of {regen.total})</div>
            {regen.skipped > 0 && <div className="text-amber-700 mt-0.5">⏳ {regen.skipped} left (time budget) — click “Re-generate samples” again to continue.</div>}
            {regen.errors?.length ? regen.errors.slice(0, 8).map((e, i) => <div key={i} className="text-rose-700 mt-0.5 truncate" title={e.error}>✗ {e.title}: {e.error}</div>) : null}
          </div>
        )}
        {health && (
          <div className="text-[11px] rounded-lg border p-2 space-y-1" style={{ background: (health.sample?.ok && health.pdf?.ok) ? '#f0fdf4' : '#fef2f2', borderColor: (health.sample?.ok && health.pdf?.ok) ? '#bbf7d0' : '#fecaca' }}>
            <div className="font-bold" style={{ color: (health.sample?.ok && health.pdf?.ok) ? '#166534' : '#991b1b' }}>{(health.sample?.ok && health.pdf?.ok) ? '✅ Engine OK' : '⚠ Engine problem'}{health.item ? ` · tested: ${health.item.title}` : ''}</div>
            <div>Sample: {health.sample?.ok ? <span className="text-emerald-700 font-bold">OK ({health.sample.ms}ms · {Math.round((health.sample.bytes || 0) / 1024)}KB)</span> : <span className="text-rose-700 font-bold">FAIL — {health.sample?.error}</span>}</div>
            <div>PDF: {health.pdf?.ok ? <span className="text-emerald-700 font-bold">OK ({health.pdf.ms}ms · {Math.round((health.pdf.bytes || 0) / 1024)}KB)</span> : <span className="text-rose-700 font-bold">FAIL — {health.pdf?.error}</span>}</div>
            <div className="text-gray-500 truncate" title={health.chromiumPath}>Chromium: {health.chromiumPath}</div>
          </div>
        )}
      </div>

      {['Term1', 'Term2', 'Sets', 'Register'].map(bk => (data.buckets[bk] || []).length ? (
        <div key={bk} className="bg-white border rounded-2xl p-3">
          <div className="font-bold text-[12px] text-indigo-900 mb-1.5">{bk} <span className="text-gray-400">({data.buckets[bk].length})</span></div>
          <div className="space-y-1">
            {data.buckets[bk].map(it => (
              <div key={it.id} className="flex items-center gap-2 text-[11px] border-t pt-1.5">
                <span className="w-7 text-center font-bold text-gray-400">{it.type === 'set' ? it.setCode : it.type === 'register' ? 'R' : it.chapterNo}</span>
                <span className="flex-1 min-w-0 truncate" title={it.title}>{it.title}</span>
                <span style={{ color: LO_COL[it.lo] }} className="font-bold">●</span>
                <span className="text-gray-400 whitespace-nowrap">T{it.term} · {it.coverage}</span>
                <span className="text-indigo-700 font-bold whitespace-nowrap">👥{it.buyers}</span>
                <span className="text-gray-400 whitespace-nowrap">⬇{it.downloads}</span>
                <span className="font-bold rounded-full px-1.5 py-0.5" style={{ background: it.status === 'published' ? '#dcfce7' : '#f1f1f6', color: it.status === 'published' ? '#166534' : '#888' }}>{it.status === 'published' ? 'pub' : 'draft'}</span>
                {it.sku && <button onClick={() => showBuyers(it.sku)} className="text-indigo-600 font-bold">Buyers</button>}
                <button onClick={() => setStatus(it.id, it.status === 'published' ? 'draft' : 'published')} className="text-gray-600 font-bold">{it.status === 'published' ? 'Hide' : 'Pub'}</button>
                <button onClick={() => trash(it.id)} className="text-rose-600 font-bold">🗑</button>
              </div>
            ))}
          </div>
        </div>
      ) : null)}
      {/* Download log + high-usage alerts */}
      <div className="bg-white border rounded-2xl p-3">
        <div className="font-bold text-[12px] text-indigo-900 mb-1.5">Download log <span className="text-gray-400">(latest 100)</span></div>
        {dl?.alerts?.length ? dl.alerts.map((a, i) => <div key={i} className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 mb-1">⚠ {a.teacher || a.userId} did {a.count} downloads on {a.ymd} (over 50/day)</div>) : null}
        {!dl?.downloads?.length ? <div className="text-[11px] text-gray-400">No downloads yet.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="text-gray-500 text-left"><th className="p-1">When</th><th className="p-1">Teacher</th><th className="p-1">Item</th><th className="p-1">Answers</th><th className="p-1">IP</th></tr></thead>
            <tbody>{dl.downloads.map((r, i) => <tr key={i} className="border-t"><td className="p-1 whitespace-nowrap text-gray-500">{new Date(r.at).toLocaleString()}</td><td className="p-1">{r.teacher}</td><td className="p-1 text-gray-600">{r.sku}</td><td className="p-1">{r.answers === 'with' ? 'ଉତ୍ତର ସହ' : 'ଉତ୍ତର ବିନା'}</td><td className="p-1 text-gray-400">{r.ip}</td></tr>)}</tbody></table></div>
        )}
      </div>
      {buyers && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={() => setBuyers(null)}>
          <div className="bg-white w-full max-w-md rounded-2xl p-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="font-extrabold text-[14px] text-indigo-900 mb-2">Buyers · {buyers.sku}</div>
            {!buyers.list.length ? <div className="text-sm text-gray-400">No buyers yet.</div> : buyers.list.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] border-t py-1.5"><span className="flex-1">{b.teacher} <span className="text-gray-400">{b.mobileMasked}</span></span><span className="text-gray-400">{new Date(b.grantedAt).toLocaleDateString()}</span><span className="text-indigo-700">⬇{b.downloads}</span><span className="text-gray-400">{b.via}</span></div>
            ))}
            <button onClick={() => setBuyers(null)} className="w-full mt-3 rounded-lg py-2 bg-indigo-900 text-white font-bold text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function RevenueTab() {
  const [d, setD] = useState(null)
  useEffect(() => { sget('/tob/admin/revenue').then(setD).catch(e => toast.error(e.message)) }, [])
  if (!d) return <div className="text-sm text-gray-400">Loading…</div>
  const c = d.cards; const max = Math.max(1, ...d.daily.map(x => x.amount))
  const Card3 = ({ k, v, s }) => <div className="bg-white border rounded-xl p-2.5"><div className="text-[10px] text-gray-500">{k}</div><div className="font-extrabold text-indigo-900 text-base">{v}</div>{s && <div className="text-[9px] text-gray-400">{s}</div>}</div>
  const Top = ({ title, rows }) => <div className="bg-white border rounded-2xl p-3"><div className="font-bold text-[12px] text-indigo-900 mb-1.5">{title}</div>{rows.length ? rows.map((r, i) => <div key={i} className="flex justify-between text-[11px] border-t py-1"><span className="truncate max-w-[200px]" title={r.label}>{r.label}</span><span className="font-bold">₹{r.amount}</span></div>) : <div className="text-[11px] text-gray-400">No sales yet.</div>}</div>
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card3 k="Today" v={`₹${c.today}`} />
        <Card3 k="Last 7 days" v={`₹${c.last7}`} />
        <Card3 k="This month" v={`₹${c.month}`} />
        <Card3 k="Total" v={`₹${c.total}`} />
        <Card3 k="Orders" v={c.orders} />
        <Card3 k="Avg order" v={`₹${c.avgOrder}`} />
        <Card3 k="Pack sales" v={`${c.pctPack}%`} s="of paid orders" />
        <Card3 k="Single sales" v={`${c.pctSingle}%`} s="of paid orders" />
      </div>
      <div className="bg-white border rounded-2xl p-3">
        <div className="font-bold text-[12px] text-indigo-900 mb-2">Daily revenue (30 days)</div>
        <div className="flex items-end gap-[2px] h-28">
          {d.daily.map((x, i) => <div key={i} title={`${x.date}: ₹${x.amount}`} className="flex-1 bg-indigo-500 rounded-t" style={{ height: `${Math.max(2, x.amount / max * 100)}%`, opacity: x.amount ? 1 : 0.25 }} />)}
        </div>
        <div className="flex justify-between text-[9px] text-gray-400 mt-1"><span>{d.daily[0]?.date?.slice(5)}</span><span>{d.daily[d.daily.length - 1]?.date?.slice(5)}</span></div>
      </div>
      <div className="grid sm:grid-cols-3 gap-2">
        <Top title="Top classes" rows={d.topClasses} />
        <Top title="Top subjects" rows={d.topSubjects} />
        <Top title="Top items" rows={d.topItems} />
      </div>
    </div>
  )
}

export function SellTab() {
  const [cfg, setCfg] = useState(null)
  const [cls, setCls] = useState('')
  const [subject, setSubject] = useState('')
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { sget('/tob/admin/sell-config').then(c => setCfg({ paywallOn: !!c.paywallOn, prices: c.prices || {}, overrides: c.overrides || {}, freeClasses: (c.freeClasses || []).map(String) })).catch(e => toast.error(e.message)) }, [])

  useEffect(() => {
    if (!cfg) return
    spost('/tob/admin/sell-config/preview', { class: cls, subject, ...cfg }).then(j => {
      setPreview(j)
      if (!cls && j.classes?.length) { setCls(j.classes[0]); return }
      if (cls && !subject && j.subjects?.length) { setSubject(j.subjects[0].id) }
    }).catch(() => {})
  }, [cfg, cls, subject])

  if (!cfg) return <div className="text-sm text-gray-400">Loading…</div>
  const upd = (patch) => { setCfg(c => ({ ...c, ...patch })); setDirty(true) }
  const setPrice = (k, v) => { const prices = { ...cfg.prices }; if (v === '') delete prices[k]; else prices[k] = Math.max(0, parseInt(v) || 0); upd({ prices }) }
  const toggleFree = (c) => { const has = cfg.freeClasses.includes(String(c)); upd({ freeClasses: has ? cfg.freeClasses.filter(x => x !== String(c)) : [...cfg.freeClasses, String(c)] }) }

  const ovKeySub = cls && subject ? `${cls}:${subject.toUpperCase()}` : null
  const ovKeyCls = cls ? `${cls}:` : null
  const setOverride = (field, v) => {
    const key = field === 'classPack' ? ovKeyCls : ovKeySub; if (!key) return
    const ov = { ...(cfg.overrides || {}) }; const cur = { ...(ov[key] || {}) }
    if (v === '') delete cur[field]; else cur[field] = Math.max(0, parseInt(v) || 0)
    if (Object.keys(cur).length) ov[key] = cur; else delete ov[key]
    upd({ overrides: ov })
  }
  const ovVal = (field) => { const key = field === 'classPack' ? ovKeyCls : ovKeySub; return key && cfg.overrides?.[key]?.[field] != null ? cfg.overrides[key][field] : '' }

  const save = async () => { setSaving(true); try { const r = await spost('/tob/admin/sell-config', cfg); setCfg(c => ({ ...c, paywallOn: !!r.paywallOn, prices: r.prices || {}, overrides: r.overrides || {}, freeClasses: (r.freeClasses || []).map(String) })); setDirty(false); toast.success('Saved · live now') } catch (e) { toast.error(e.message) } finally { setSaving(false) } }

  const classes = preview?.classes || []
  const subjects = preview?.subjects || []
  const paidHere = !!preview?.paywallOn
  const p = preview?.prices || cfg.prices
  const sp = preview?.packs?.subjectPack, cp = preview?.packs?.classPack
  const mrpFor = (k, mrpKey) => k === 'subjectPack' ? sp?.mrp : k === 'classPack' ? cp?.mrp : p[mrpKey]

  return (
    <div className="space-y-3">
      {/* Global paywall */}
      <div className="bg-white rounded-2xl border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div><div className="font-bold text-sm text-indigo-900">Paid mode (global)</div><div className="text-[11px] text-gray-500">OFF = everything free & register open. ON = locked until bought.</div></div>
          <button onClick={() => upd({ paywallOn: !cfg.paywallOn })} className="w-12 h-6 rounded-full relative shrink-0" style={{ background: cfg.paywallOn ? '#c93a22' : '#d1d5db' }}><span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all" style={{ left: cfg.paywallOn ? 26 : 2 }} /></button>
        </div>
        <div className="text-[11px] font-bold" style={{ color: cfg.paywallOn ? '#c93a22' : '#2a9d5c' }}>{cfg.paywallOn ? '● PAID is ON' : '● Everything is FREE'}</div>
      </div>

      {/* Global default prices */}
      <div className="bg-white rounded-2xl border p-4 space-y-2">
        <div className="font-bold text-sm text-indigo-900">Default selling prices (₹)</div>
        <div className="text-[11px] text-gray-500">MRP (struck-through) is auto-computed. Term/Full/Chapter MRPs are fixed; pack MRPs = real sum of the singles inside.</div>
        <div className="grid grid-cols-2 gap-2">
          {PRICE_FIELDS.map(([k, label, mrpKey]) => (
            <label key={k} className="text-[11px] font-bold text-gray-600">{label}
              <div className="mt-1 flex items-center gap-1"><span className="text-gray-400">₹</span><input type="number" value={cfg.prices[k] ?? ''} onChange={e => setPrice(k, e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder="0" /></div>
              <div className="text-[10px] text-gray-400 mt-0.5">MRP ₹{mrpFor(k, mrpKey) ?? '—'}{(k === 'subjectPack' || k === 'classPack') ? ' (computed)' : ''}</div>
            </label>
          ))}
        </div>
      </div>

      {/* Keep-free class exceptions */}
      <div className="bg-white rounded-2xl border p-4 space-y-2">
        <div className="font-bold text-sm text-indigo-900">Keep these classes FREE (exception)</div>
        <div className="text-[11px] text-gray-500">Even when Paid mode is ON, classes selected here stay free (e.g. launch week).</div>
        <div className="flex flex-wrap gap-1.5">
          {classes.map(c => { const on = cfg.freeClasses.includes(String(c)); return <button key={c} onClick={() => toggleFree(c)} className={`text-[11px] font-bold rounded-full px-3 py-1.5 border ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300'}`}>Class {c}{on ? ' · free' : ''}</button> })}
        </div>
      </div>

      {/* Per class+subject overrides + preview */}
      <div className="bg-white rounded-2xl border p-4 space-y-3">
        <div className="font-bold text-sm text-indigo-900">Per-class override & live preview</div>
        <div className="flex flex-wrap gap-1.5">{classes.map(c => <button key={c} onClick={() => { setCls(String(c)); setSubject('') }} className={`text-[11px] font-bold rounded-full px-3 py-1 border ${String(c) === cls ? 'bg-indigo-900 text-white border-indigo-900' : 'bg-white text-gray-600 border-gray-300'}`}>Class {c}</button>)}</div>
        {subjects.length > 0 && <div className="flex flex-wrap gap-1.5">{subjects.map(s => <button key={s.id} onClick={() => setSubject(s.id)} className={`text-[11px] font-bold rounded-full px-3 py-1 border ${s.id === subject ? 'bg-indigo-900 text-white border-indigo-900' : 'bg-white text-gray-600 border-gray-300'}`}>{s.name}</button>)}</div>}

        {cls && subject && (
          <div className="grid grid-cols-2 gap-2">
            {PRICE_FIELDS.map(([k, label]) => (
              <label key={k} className="text-[11px] font-bold text-gray-600">{label} override
                <div className="mt-1 flex items-center gap-1"><span className="text-gray-400">₹</span><input type="number" value={ovVal(k)} onChange={e => setOverride(k, e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" placeholder={`${cfg.prices[k] ?? 0} (global)`} /></div>
              </label>
            ))}
            <div className="col-span-2 text-[10px] text-gray-400">Blank = use global. Class-pack override applies to the whole class.</div>
          </div>
        )}

        {/* Live preview line */}
        {cls && subject && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900 space-y-1">
            <div className="font-bold">Preview — Class {cls} {subject.toUpperCase()} · {paidHere ? <span className="text-rose-700">PAID</span> : <span className="text-emerald-700">FREE</span>}</div>
            {paidHere ? (<>
              <div>Set: ₹{p.setTerm} <s className="text-amber-400">₹{p.setTermMrp}</s> (term) · ₹{p.setFull} <s className="text-amber-400">₹{p.setFullMrp}</s> (full year)</div>
              <div>Chapter: ₹{p.chapter} <s className="text-amber-400">₹{p.chapterMrp}</s></div>
              {sp && <div>Subject pack: ₹{sp.price} <s className="text-amber-400">₹{sp.mrp}</s> (real sum of singles)</div>}
              {sp && (() => {
                const red = sp.hidden || sp.price >= sp.mrp
                const yellow = !red && sp.pctOff < 30
                const bg = red ? '#fee2e2' : yellow ? '#fef9c3' : '#dcfce7'
                const fg = red ? '#991b1b' : yellow ? '#854d0e' : '#166534'
                return (
                  <div className="rounded-lg px-2 py-1.5 mt-0.5 font-bold" style={{ background: bg, color: fg }}>
                    <div>Pack ₹{sp.price} · Total ₹{sp.mrp} · Saving ₹{sp.savings} ({sp.pctOff}% OFF)</div>
                    {red && <div className="font-normal mt-0.5">🔴 Pack is NOT cheaper than the singles — it will be hidden on the store. Lower the pack price.</div>}
                    {yellow && <div className="font-normal mt-0.5">🟡 Saving is under 30% — buyers may not feel the pack is worth it.</div>}
                  </div>
                )
              })()}
              <div>Class pack: {cp ? <>₹{cp.price} <s className="text-amber-400">₹{cp.mrp}</s> · shown ({od2(cp.subjects)} subjects)</> : <span className="text-amber-500">hidden (needs 2+ subjects & price &lt; sum of subject packs)</span>}</div>
            </>) : <div>This class is free — no prices shown, register fully open.</div>}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-white via-white pt-2">
        <button onClick={save} disabled={saving || !dirty} className="w-full rounded-xl py-3 text-white font-bold text-sm disabled:opacity-40" style={{ background: '#c93a22' }}>{saving ? 'Saving…' : dirty ? 'Save changes (go live)' : 'Saved'}</button>
      </div>
    </div>
  )
}

function SettingsTab() {
  const [s, setS] = useState(null)
  useEffect(() => { sget('/tob/admin/settings').then(r => setS(r.settings)).catch(() => {}) }, [])
  if (!s) return <div className="text-sm text-gray-400">Loading…</div>
  const save = async (patch) => { try { const r = await sput('/tob/admin/settings', patch); setS(r.settings); toast.success('Saved') } catch (e) { toast.error(e.message) } }
  return (
    <div className="bg-white rounded-2xl border p-4 space-y-3">
      <div className="flex items-center justify-between"><span className="text-[12px] text-gray-700">Tool visible to teachers</span><button onClick={() => save({ enabled: !s.enabled })} className="w-11 h-6 rounded-full relative" style={{ background: s.enabled ? '#2a9d5c' : '#d1d5db' }}><span className="absolute top-0.5 w-5 h-5 bg-white rounded-full" style={{ left: s.enabled ? 22 : 2 }} /></button></div>
      <div className="flex items-center justify-between"><span className="text-[12px] text-gray-700">Who can view</span><div className="flex gap-1 bg-gray-100 rounded-full p-0.5">{[['everyone', 'Everyone'], ['premium', 'Premium'], ['nobody', 'Nobody']].map(([k, l]) => <button key={k} onClick={() => save({ viewAudience: k })} className={`text-[10px] font-bold rounded-full px-2 py-1 ${s.viewAudience === k ? 'bg-indigo-900 text-white' : 'text-gray-500'}`}>{l}</button>)}</div></div>
    </div>
  )
}

function TrashTab({ isSuper }) {
  const [list, setList] = useState(null); const [dlg, setDlg] = useState(null)
  const load = () => sget('/tob/admin/trash').then(r => setList(r.trash || [])).catch(() => setList([]))
  useEffect(() => { load() }, [])
  const restore = async (id) => { try { await spost('/tob/admin/restore', { ids: [id] }); toast.success('Restored'); load() } catch (e) { toast.error(e.message) } }
  const purge = (it) => setDlg({ title: 'Delete permanently?', danger: true, requireName: `Class ${it.class} ${it.subject_id}`,
    body: <div className="text-[12px] text-gray-700 space-y-1"><div>"<b>{it.title}</b>" and its stored files will be <b>permanently</b> removed.</div><div className="text-amber-700">Teachers' saved marks are KEPT (a readable stub remains).</div></div>,
    confirmLabel: 'Delete permanently', onConfirm: async () => { try { const r = await spost('/tob/admin/purge', { ids: [it.id] }); if (r.ok === false) throw new Error(r.error); toast.success(`Deleted (${r.recordsKept} teacher records kept)`); setDlg(null); load() } catch (e) { toast.error(e.message) } } })
  if (list === null) return <div className="text-sm text-gray-400">Loading…</div>
  if (!list.length) return <div className="text-sm text-gray-400 py-8 text-center">Trash is empty.</div>
  return (
    <div className="space-y-1.5">
      {dlg && <ConfirmDialog dlg={dlg} onClose={() => setDlg(null)} />}
      {list.map(it => (
        <div key={it.id} className="bg-white border rounded-xl flex items-center gap-2 p-2.5 text-[12px]">
          <span className="w-8 text-center font-bold text-gray-400">{it.type === 'set' ? it.setCode : it.chapterNo}</span>
          <div className="flex-1 min-w-0"><span className="font-semibold text-gray-800">{it.title}</span> <span className="text-gray-400">· Class {it.class} {it.subject_id}</span></div>
          <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">{it.daysLeft}d left</span>
          <button onClick={() => restore(it.id)} className="text-[11px] font-bold rounded-full px-2.5 py-1 text-white" style={{ background: '#2a9d5c' }}>Restore</button>
          {isSuper && <button onClick={() => purge(it)} className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-rose-600 text-white">Delete permanently</button>}
        </div>
      ))}
      {!isSuper && <div className="text-[10px] text-gray-400">Only a super-admin can delete permanently. Items auto-purge after 30 days.</div>}
    </div>
  )
}

function AuditTab() {
  const [log, setLog] = useState(null)
  useEffect(() => { sget('/tob/admin/audit').then(r => setLog(r.log || [])).catch(() => setLog([])) }, [])
  if (log === null) return <div className="text-sm text-gray-400">Loading…</div>
  if (!log.length) return <div className="text-sm text-gray-400 py-8 text-center">No delete activity yet.</div>
  const COL = { trash: '#854d0e', restore: '#166534', 'permanent-delete': '#991b1b', 'auto-purge': '#991b1b', 'superadmin-set': '#1e3a8a' }
  return (
    <div className="space-y-1.5">
      {log.map((l, i) => (
        <div key={i} className="bg-white border rounded-xl p-2.5 text-[11px]">
          <div className="flex items-center gap-2"><span className="font-bold rounded px-2 py-0.5" style={{ background: '#f1f5f9', color: COL[l.action] || '#334155' }}>{l.action}</span>
            <span className="text-gray-500">{new Date(l.at).toLocaleString()}</span>
            <span className="ml-auto text-gray-400">{l.actorName || l.actorMobile || 'system'}</span></div>
          {!!(l.items || []).length && <div className="text-gray-600 mt-1">{l.items.map(x => x.title).join(' · ')}</div>}
          {l.scope && <div className="text-gray-500 mt-0.5">{l.scope}</div>}
          {l.recordsKept > 0 && <div className="text-emerald-600 mt-0.5">{l.recordsKept} teacher record(s) kept</div>}
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({ dlg, onClose }) {
  const [typed, setTyped] = useState('')
  useEffect(() => { setTyped('') }, [dlg])
  if (!dlg) return null
  const ok = !dlg.requireName || typed.trim() === String(dlg.requireName).trim()
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.5)' }} onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl p-4" onClick={e => e.stopPropagation()}>
        <div className="font-extrabold text-[15px] mb-2" style={{ color: dlg.danger ? '#b91c1c' : '#241a5e' }}>{dlg.danger ? '⚠️ ' : ''}{dlg.title}</div>
        <div className="mb-3">{dlg.body}</div>
        {dlg.requireName && <><div className="text-[11px] text-gray-600 mb-1">Type <b>“{dlg.requireName}”</b> to confirm:</div><input value={typed} onChange={e => setTyped(e.target.value)} className="w-full border rounded-lg px-2 py-2 text-sm mb-3" placeholder={dlg.requireName} /></>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg py-2 border font-bold text-sm text-gray-600">Cancel</button>
          <button onClick={() => dlg.onConfirm(typed)} disabled={!ok} className="flex-1 rounded-lg py-2 text-white font-bold text-sm disabled:opacity-40" style={{ background: dlg.danger ? '#dc2626' : '#241a5e' }}>{dlg.confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    </div>
  )
}

