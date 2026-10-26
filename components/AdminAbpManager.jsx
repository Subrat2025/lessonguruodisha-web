'use client'
import React, { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { sget, spost, sput, sdel, API, getToken } from '@/components/store/api'

const TABS = [['import', '⬆️ Import'], ['chapters', '📚 Chapters'], ['settings', '⚙️ Download Controls'], ['analytics', '📊 Analytics']]
const btn = 'text-xs font-bold rounded-full px-3 py-1.5 text-white disabled:opacity-50'

export default function AdminAbpManager() {
  const [tab, setTab] = useState('import')
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-gray-500">Activity-based Panchapadi (ABP) — isolated tool. New <code>abp*</code> collections only; existing lessons untouched.</div>
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`text-xs font-bold rounded-full px-3 py-1.5 ${tab === k ? 'bg-indigo-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>)}
      </div>
      {tab === 'import' && <ImportTab />}
      {tab === 'chapters' && <ChaptersTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </div>
  )
}

function ImportTab() {
  const [file, setFile] = useState(null)
  const [peek, setPeek] = useState(null)
  const [meta, setMeta] = useState({ class: '', subject: '', book: '' })
  const [mode, setMode] = useState('update')
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState(null)
  const poll = useRef(null)
  const inputRef = useRef(null)

  const doPeek = async (f) => {
    setFile(f); setPeek(null); setJob(null)
    const fd = new FormData(); fd.append('file', f)
    try {
      const r = await fetch(`${API}/abp/admin/import/peek`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      const d = await r.json(); if (!r.ok) throw new Error(d.error)
      setPeek(d); setMeta({ class: d.prefill.class || '', subject: d.prefill.subject || '', book: d.prefill.book || '' })
    } catch (e) { toast.error(e.message || 'Could not read ZIP') }
  }
  const start = async () => {
    if (!file) return
    if (!meta.class || !meta.subject) { toast.error('Class and subject required'); return }
    setBusy(true)
    const fd = new FormData(); fd.append('file', file); fd.append('class', meta.class); fd.append('subject', meta.subject); fd.append('book', meta.book); fd.append('mode', mode)
    try {
      const r = await fetch(`${API}/abp/admin/import`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      const d = await r.json(); if (!r.ok) throw new Error(d.error)
      toast.success('Import started'); pollJob(d.jobId)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const pollJob = (id) => {
    const tick = async () => { try { const r = await sget(`/abp/admin/import/jobs/${id}`); setJob(r.job); if (['done', 'error'].includes(r.job.status)) { clearInterval(poll.current); poll.current = null } } catch {} }
    tick(); poll.current = setInterval(tick, 2000)
  }
  useEffect(() => () => poll.current && clearInterval(poll.current), [])

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border p-4">
        <div className="font-bold text-sm text-indigo-900 mb-1">Upload chapter ZIP (≤25MB)</div>
        <div className="text-[11px] text-gray-500 mb-3">One ZIP per class+subject: numbered chapter HTML files + one yearly summary file. Imported as DRAFT — publish after review.</div>
        <input ref={inputRef} type="file" accept=".zip" onChange={e => e.target.files?.[0] && doPeek(e.target.files[0])} className="text-xs" />
      </div>

      {peek && (
        <div className="bg-white rounded-2xl border p-4 space-y-3">
          <div className="text-[12px] text-gray-700"><b>{peek.chapterFiles?.length || 0}</b> chapter files · <b>{peek.yearFiles?.length || 0}</b> year-plan file · <span className="text-gray-400">{peek.zipName}</span></div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] font-bold text-gray-600">Class<input value={meta.class} onChange={e => setMeta(m => ({ ...m, class: e.target.value }))} className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="text-[11px] font-bold text-gray-600">Subject<input value={meta.subject} onChange={e => setMeta(m => ({ ...m, subject: e.target.value }))} className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="text-[11px] font-bold text-gray-600">Book<input value={meta.book} onChange={e => setMeta(m => ({ ...m, book: e.target.value }))} className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm" /></label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-gray-600">Duplicates:</span>
            {[['update', 'Update in place'], ['skip', 'Skip'], ['replace', 'Replace'], ['new', 'Import as new']].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${mode === k ? 'bg-indigo-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>)}
          </div>
          <button disabled={busy} onClick={start} className={btn} style={{ background: '#2a9d5c' }}>{busy ? 'Starting…' : 'Import'}</button>
        </div>
      )}

      {job && (
        <div className="bg-white rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm text-indigo-900">{job.zipName}</div>
            <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: job.status === 'done' ? '#2a9d5c' : job.status === 'error' ? '#e8452c' : '#1fa2d9' }}>{job.status}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2"><div className="h-full rounded-full" style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%`, background: '#f7b32b' }} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
            <Stat label="New" v={job.imported?.new ?? job.imported?.chapters} />
            <Stat label="Updated" v={job.imported?.updated} />
            <Stat label="Periods" v={job.imported?.periods} />
            <Stat label="Duplicates" v={job.imported?.duplicates ?? 0} />
          </div>
          {job.status === 'done' && (
            <div className="mt-2 text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ✅ {job.imported?.updated || 0} updated · {job.imported?.new ?? job.imported?.chapters ?? 0} new · {job.imported?.duplicates ?? 0} duplicates
              {(job.imported?.skipped || job.imported?.replaced) ? ` · ${job.imported?.skipped || 0} skipped · ${job.imported?.replaced || 0} replaced` : ''}
            </div>
          )}
          {job.yearPlan && <div className="text-[11px] text-emerald-700 mt-2">✅ Year plan: {job.yearPlan.title} ({job.yearPlan.tables} tables)</div>}
          {!!(job.errors || []).length && (
            <div className="mt-2 rounded-lg bg-rose-50 border border-rose-200 p-2">
              <div className="text-[11px] font-bold text-rose-700 mb-1">{job.errors.length} failed</div>
              {job.errors.slice(0, 10).map((e, i) => <div key={i} className="text-[10px] text-rose-600">• {e.file}: {e.reason}</div>)}
            </div>
          )}
          {!!(job.warnings || []).length && (
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2">
              <div className="text-[11px] font-bold text-amber-700 mb-1">⚠️ {job.warnings.length} file(s) with warnings</div>
              {job.warnings.slice(0, 6).map((w, i) => <div key={i} className="text-[10px] text-amber-700">• {w.file}: {(w.warnings || []).join('; ')}</div>)}
            </div>
          )}
          {job.status === 'done' && <div className="text-[11px] text-gray-500 mt-2">Imported as DRAFT. Go to the <b>Chapters</b> tab to review & publish.</div>}
        </div>
      )}
    </div>
  )
}
function Stat({ label, v }) { return <div className="bg-gray-50 rounded-lg p-2"><div className="font-extrabold text-indigo-900">{v ?? 0}</div><div className="text-[9px] text-gray-400">{label}</div></div> }

function ChaptersTab() {
  const [list, setList] = useState(null)
  const [cls, setCls] = useState('')
  const [preview, setPreview] = useState(null)
  const [dups, setDups] = useState(null)
  const [trash, setTrash] = useState(null)
  const load = () => sget(`/abp/admin/chapters${cls ? `?class=${cls}` : ''}`).then(r => setList(r.chapters || [])).catch(() => setList([]))
  useEffect(() => { load() }, [cls])

  const move = async (c, dir) => { try { const r = await spost(`/abp/admin/chapters/${c.id}/move`, { dir }); if (r.ok === false) throw new Error(r.error); toast.success('Saved'); load() } catch (e) { toast.error(e.message) } }
  const deleteCourse = async (c, count) => {
    const phrase = `class ${c.class} ${c.subject}`
    const typed = window.prompt(`This moves ${count} chapters of "${phrase}" to Trash (restorable 30 days).\n\nType exactly to confirm:\n${phrase}`)
    if (typed == null) return
    try { const r = await spost('/abp/admin/courses/delete', { class: c.class, subject: c.subject, book: c.book, confirm: typed }); if (r.error) throw new Error(r.error); toast.success(`Moved ${r.trashed} chapters (${r.periods} periods) to Trash`); load() } catch (e) { toast.error(e.message) } }
  const findDups = async () => { try { const r = await sget('/abp/admin/duplicates'); setDups(r.duplicates || []) } catch (e) { toast.error(e.message) } }
  const openTrash = async () => { try { const r = await sget('/abp/admin/trash'); setTrash(r.trash || []) } catch (e) { toast.error(e.message) } }
  const restore = async (id) => { try { await spost('/abp/admin/trash/restore', { id }); toast.success('Restored'); openTrash(); load() } catch (e) { toast.error(e.message) } }
  const deleteForever = async (id) => { if (!window.confirm('Delete forever? This cannot be undone.')) return; try { await spost('/abp/admin/trash/delete-forever', { id }); toast.success('Deleted forever'); openTrash() } catch (e) { toast.error(e.message) } }
  const trashOne = async (id) => { try { const r = await spost(`/abp/admin/chapters/${id}/trash`, {}); if (r.ok === false) throw new Error(r.error); return true } catch (e) { toast.error(e.message); return false } }
  const resolveDup = async (g, keepId) => {
    const drop = (g.items || []).filter(it => it.id !== keepId).map(it => it.id)
    if (!drop.length) { toast.message('Pick a copy to keep first'); return }
    if (!window.confirm(`Keep 1 copy and move ${drop.length} other copy(ies) of "#${g.number} ${g.title}" to Trash? (restorable)`)) return
    let ok = 0
    for (const id of drop) { if (await trashOne(id)) ok++ }
    toast.success(`Moved ${ok} duplicate copy(ies) to Trash`)
    findDups(); load()
  }

  const setStatus = async (c, status) => { try { await spost(`/abp/admin/chapters/${c.id}/status`, { status }); toast.success(status === 'published' ? 'Published' : 'Unpublished'); load() } catch (e) { toast.error(e.message) } }
  const publishCourse = async (c, status) => { try { const r = await spost('/abp/admin/courses/status', { class: c.class, subject: c.subject, book: c.book, status }); toast.success(`${r.modified} chapters ${status}`); load() } catch (e) { toast.error(e.message) } }
  const saveEdit = async (c, patch) => { try { await sput(`/abp/admin/chapters/${c.id}`, patch); toast.success('Saved'); load() } catch (e) { toast.error(e.message) } }
  const askDelete = async (c) => { try { const p = await sget(`/abp/admin/chapters/${c.id}/delete-preview`); setPreview(p) } catch (e) { toast.error(e.message) } }
  const doDelete = async () => { try { await sdel(`/abp/admin/chapters/${preview.chapterId}`); toast.success('Deleted'); setPreview(null); load() } catch (e) { toast.error(e.message) } }

  if (list === null) return <div className="text-sm text-gray-400">Loading…</div>
  const courses = [...new Set(list.map(c => `${c.class}|${c.subject}|${c.book}`))]
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-gray-600">Class:</span>
        <input value={cls} onChange={e => setCls(e.target.value)} placeholder="all" className="border rounded-lg px-2 py-1 text-sm w-16" />
        <button onClick={findDups} className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-amber-100 text-amber-700">Find duplicates</button>
        <button onClick={openTrash} className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-gray-100 text-gray-600">🗑 Trash</button>
        <button onClick={load} className="text-[11px] text-gray-500">Refresh</button>
      </div>
      {list.length === 0 && <div className="text-sm text-gray-400">No chapters yet. Import a ZIP first.</div>}
      {courses.map(ck => {
        const [kc, ks, kb] = ck.split('|')
        const rows = list.filter(c => `${c.class}|${c.subject}|${c.book}` === ck).sort((a, b) => (a.order ?? a.number) - (b.order ?? b.number))
        const allPub = rows.every(r => r.status === 'published')
        return (
          <div key={ck} className="bg-white rounded-2xl border p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="font-bold text-sm text-indigo-900 flex-1">Class {kc} · {ks}{kb ? ` · ${kb}` : ''} <span className="text-gray-400 font-normal">({rows.length})</span></div>
              <button onClick={() => publishCourse(rows[0], allPub ? 'draft' : 'published')} className="text-[11px] font-bold rounded-full px-2.5 py-1 text-white" style={{ background: allPub ? '#64748b' : '#2a9d5c' }}>{allPub ? 'Unpublish all' : 'Publish all'}</button>
              <button onClick={() => deleteCourse(rows[0], rows.length)} className="text-[11px] font-bold rounded-full px-2.5 py-1 border border-rose-400 text-rose-600">Delete all</button>
            </div>
            <div className="space-y-1.5">
              {rows.map((c, i) => <ChapterRow key={c.id} c={c} onStatus={setStatus} onSave={saveEdit} onDelete={askDelete} onMove={move} isFirst={i === 0} isLast={i === rows.length - 1} />)}
            </div>
          </div>
        )
      })}
      {preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-indigo-900 mb-1">Delete chapter?</div>
            <div className="text-[13px] text-gray-600 mb-3">This permanently removes <b>#{preview.number} {preview.title}</b>, its <b>{preview.periods} periods</b>{preview.hasHtml ? ', and the stored source file' : ''}. Teacher progress for it is cleared. Existing Panchapadi/5E/other lessons are not affected.</div>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="flex-1 text-xs font-bold rounded-full px-3 py-2 bg-gray-100 text-gray-600">Cancel</button>
              <button onClick={doDelete} className="flex-1 text-xs font-bold rounded-full px-3 py-2 text-white" style={{ background: '#e8452c' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {dups && (
        <Modal title="Find duplicates (read-only)" onClose={() => setDups(null)}>
          <div className="text-[11px] text-gray-500 mb-3">Same class + subject + chapter number + title found more than once. Pick the copy to <b>keep</b>; the others move to Trash (restorable).</div>
          {dups.length === 0 ? <div className="text-sm text-emerald-700 font-semibold">No duplicates found 🎉</div> : dups.map((g, gi) => <DupGroup key={gi} g={g} onResolve={resolveDup} />)}
        </Modal>
      )}
      {trash && (
        <Modal title="Trash — restorable 30 days" onClose={() => setTrash(null)}>
          {trash.length === 0 ? <div className="text-sm text-gray-500">Trash is empty.</div> : trash.map(t => (
            <div key={t.id} className="flex items-center gap-2 text-[12px] border-b last:border-0 py-2">
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-gray-800">Class {t.class} · {t.subject} · #{t.number} {t.title}</span> <span className="text-gray-400">· {t.periods}p</span>
                <div className="text-[10px] text-gray-400">Trashed {new Date(t.trashedAt).toLocaleString()}</div>
              </div>
              <button onClick={() => restore(t.id)} className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-emerald-100 text-emerald-700">Restore</button>
              <button onClick={() => deleteForever(t.id)} className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-rose-100 text-rose-700">Delete forever</button>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}

function ChapterRow({ c, onStatus, onSave, onDelete, onMove, isFirst, isLast }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState({ title: c.title, genre: c.genre, order: c.order ?? c.number })
  return (
    <div className="flex items-center gap-2 text-[12px] border-b last:border-0 pb-1.5">
      <span className="w-6 text-center font-bold text-gray-400">{c.number}</span>
      <div className="flex flex-col leading-none">
        <button onClick={() => onMove?.(c, 'up')} disabled={isFirst} title="Move up" className="text-[11px] text-gray-500 hover:text-indigo-700 disabled:opacity-20 disabled:cursor-not-allowed">▲</button>
        <button onClick={() => onMove?.(c, 'down')} disabled={isLast} title="Move down" className="text-[11px] text-gray-500 hover:text-indigo-700 disabled:opacity-20 disabled:cursor-not-allowed">▼</button>
      </div>
      {edit ? (
        <div className="flex-1 flex gap-1 flex-wrap items-center">
          <input value={v.title} onChange={e => setV(s => ({ ...s, title: e.target.value }))} className="border rounded px-1.5 py-1 text-[12px] flex-1 min-w-[120px]" />
          <input value={v.genre} onChange={e => setV(s => ({ ...s, genre: e.target.value }))} className="border rounded px-1.5 py-1 text-[12px] w-20" placeholder="genre" />
          <input value={v.order} onChange={e => setV(s => ({ ...s, order: e.target.value }))} className="border rounded px-1.5 py-1 text-[12px] w-12" placeholder="order" />
          <button onClick={() => { onSave(c, v); setEdit(false) }} className="text-[11px] font-bold text-white rounded-full px-2 py-1" style={{ background: '#2a9d5c' }}>Save</button>
          <button onClick={() => setEdit(false)} className="text-[11px] text-gray-500">×</button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0"><span className="font-semibold text-gray-800">{c.title}</span> {c.genre && <span className="text-gray-400">({c.genre})</span>} <span className="text-gray-400">· {c.periodCount}p</span>{!!(c.warnings || []).length && <span className="text-amber-600" title={c.warnings.join('; ')}> ⚠️</span>}</div>
          <span className="text-[9px] font-bold rounded-full px-2 py-0.5" style={{ background: c.status === 'published' ? '#dcfce7' : '#f1f1f6', color: c.status === 'published' ? '#166534' : '#888' }}>{c.status}</span>
          <button onClick={() => setEdit(true)} className="text-[11px] text-indigo-600 font-bold">Edit</button>
          <button onClick={() => onStatus(c, c.status === 'published' ? 'draft' : 'published')} className="text-[11px] text-gray-600 font-bold">{c.status === 'published' ? 'Unpublish' : 'Publish'}</button>
          <button onClick={() => onDelete(c)} className="text-[11px] text-rose-500 font-bold">Del</button>
        </>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold text-indigo-900">{title}</div>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none hover:text-gray-600">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function DupGroup({ g, onResolve }) {
  const items = g.items || []
  const [keep, setKeep] = useState(items[0]?.id)
  const rname = `keep-${g.class}-${g.subject}-${g.number}`
  return (
    <div className="border rounded-xl p-3 mb-2">
      <div className="font-bold text-[13px] text-indigo-900 mb-2">Class {g.class} · {g.subject}{g.book ? ` · ${g.book}` : ''} · #{g.number} {g.title} <span className="text-rose-600 font-normal">({g.copies} copies)</span></div>
      <div className="space-y-1 mb-2">
        {items.map((it, i) => (
          <label key={it.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input type="radio" name={rname} checked={keep === it.id} onChange={() => setKeep(it.id)} />
            <span className="font-semibold">{i === 0 ? 'Oldest' : `Copy ${i + 1}`}</span>
            <span className="text-gray-500">{it.status} · {it.periodCount || 0}p</span>
            {it.sourceFile && <span className="text-gray-400 truncate max-w-[140px]">· {it.sourceFile}</span>}
            {it.createdAt && <span className="text-gray-400">· {new Date(it.createdAt).toLocaleDateString()}</span>}
          </label>
        ))}
      </div>
      <button onClick={() => onResolve(g, keep)} className="text-[11px] font-bold rounded-full px-3 py-1.5 text-white" style={{ background: '#e8452c' }}>Keep selected · move others to Trash</button>
    </div>
  )
}

function SettingsTab() {
  const [s, setS] = useState(null)
  const [classes, setClasses] = useState([])
  useEffect(() => {
    sget('/abp/admin/settings').then(r => setS(r.settings)).catch(() => {})
    sget('/abp/admin/chapters').then(r => {
      const list = r.chapters || []
      const cls = [...new Set(list.map(c => c.class))]
      const subs = [...new Set(list.map(c => `${c.class}|${c.subject}`))]
      setClasses({ cls, subs })
    }).catch(() => {})
  }, [])
  if (!s) return <div className="text-sm text-gray-400">Loading…</div>
  const save = async (patch) => { try { const r = await sput('/abp/admin/settings', patch); setS(r.settings); toast.success('Saved') } catch (e) { toast.error(e.message) } }
  const setDl = (level, key, val) => { const dl = { ...(s.download || {}) }; if (level === 'global') dl.global = val; else { dl[level] = { ...(dl[level] || {}) }; if (val === null) delete dl[level][key]; else dl[level][key] = val } save({ download: dl }) }
  const triState = (cur) => cur === true ? 'on' : cur === false ? 'off' : 'inherit'

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border p-4 space-y-3">
        <div className="font-bold text-sm text-indigo-900">Audience & limits</div>
        <Row label="Tool visible to teachers"><Toggle on={s.enabled} onChange={v => save({ enabled: v })} /></Row>
        <Row label="Who can VIEW periods"><Seg options={[['everyone', 'Everyone'], ['premium', 'Premium'], ['nobody', 'Nobody']]} value={s.viewAudience} onChange={v => save({ viewAudience: v })} /></Row>
        <Row label="First period free preview"><Toggle on={s.freeFirstPeriod} onChange={v => save({ freeFirstPeriod: v })} /></Row>
        <Row label="Who can DOWNLOAD PDF"><Seg options={[['everyone', 'Everyone'], ['premium', 'Premium'], ['nobody', 'Nobody']]} value={s.downloadWho} onChange={v => save({ downloadWho: v })} /></Row>
        <Row label="Download limit per chapter / user"><input type="number" value={s.downloadLimitPerChapter} onChange={e => save({ downloadLimitPerChapter: Number(e.target.value) })} className="border rounded-lg px-2 py-1 text-sm w-20" /></Row>
      </div>

      <div className="bg-white rounded-2xl border p-4 space-y-3">
        <div className="font-bold text-sm text-indigo-900">Download switch (lower level overrides higher)</div>
        <Row label="🌐 Global default"><Toggle on={!!s.download?.global} onChange={v => setDl('global', null, v)} /></Row>
        {(classes.cls || []).map(c => (
          <Row key={c} label={`📚 Class ${c}`}><TriBtn state={triState(s.download?.class?.[c])} onChange={st => setDl('class', c, st === 'inherit' ? null : st === 'on')} /></Row>
        ))}
        {(classes.subs || []).map(sk => {
          const [c, sub] = sk.split('|')
          return <Row key={sk} label={`📖 Class ${c} · ${sub}`}><TriBtn state={triState(s.download?.subject?.[sk])} onChange={st => setDl('subject', sk, st === 'inherit' ? null : st === 'on')} /></Row>
        })}
        <div className="text-[10px] text-gray-400">Chapter-level overrides can be added later. Default is OFF everywhere until turned on.</div>
      </div>
    </div>
  )
}
function Row({ label, children }) { return <div className="flex items-center justify-between gap-2"><span className="text-[12px] text-gray-700">{label}</span>{children}</div> }
function Toggle({ on, onChange }) { return <button onClick={() => onChange(!on)} className="w-11 h-6 rounded-full relative transition" style={{ background: on ? '#2a9d5c' : '#d1d5db' }}><span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all" style={{ left: on ? 22 : 2 }} /></button> }
function Seg({ options, value, onChange }) { return <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">{options.map(([k, l]) => <button key={k} onClick={() => onChange(k)} className={`text-[10px] font-bold rounded-full px-2 py-1 ${value === k ? 'bg-indigo-900 text-white' : 'text-gray-500'}`}>{l}</button>)}</div> }
function TriBtn({ state, onChange }) {
  const next = { inherit: 'on', on: 'off', off: 'inherit' }
  const col = { on: '#2a9d5c', off: '#e8452c', inherit: '#9ca3af' }
  const lab = { on: 'ON', off: 'OFF', inherit: 'Inherit' }
  return <button onClick={() => onChange(next[state])} className="text-[10px] font-bold rounded-full px-2.5 py-1 text-white" style={{ background: col[state] }}>{lab[state]}</button>
}

function AnalyticsTab() {
  const [a, setA] = useState(null)
  useEffect(() => { sget('/abp/admin/analytics').then(setA).catch(() => {}) }, [])
  if (!a) return <div className="text-sm text-gray-400">Loading…</div>
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[['Chapter views', a.views], ['Period views', a.periodViews], ['Downloads', a.downloads], ['Taught ticks', a.taughtTotal]].map(([l, v]) => <div key={l} className="bg-white border rounded-xl p-2 text-center"><div className="font-extrabold text-indigo-900 text-lg">{v}</div><div className="text-[10px] text-gray-400">{l}</div></div>)}
      </div>
      <div className="bg-white border rounded-xl p-3">
        <div className="text-[11px] font-bold text-gray-600 mb-1.5">Most-viewed chapters</div>
        {(a.top || []).length === 0 && <div className="text-[11px] text-gray-400">No views yet.</div>}
        {(a.top || []).map((t, i) => <div key={t.chapterId} className="flex items-center gap-2 text-[12px] py-1 border-b last:border-0"><span className="w-4 text-gray-400 font-bold">{i + 1}</span><span className="flex-1 truncate">Class {t.class} · {t.title}</span><span className="font-bold text-indigo-900">{t.views}</span></div>)}
      </div>
    </div>
  )
}
