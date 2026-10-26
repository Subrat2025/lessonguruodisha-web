'use client'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { UploadCloud, FileArchive, RefreshCw, Download } from 'lucide-react'
import { API, getToken, sget, spost, money } from '@/components/store/api'

const IND = '#241a5e', CORAL = '#e8452c', SAFF = '#f7b32b', GREEN = '#2a9d5c'
// Canonical class list used by every dropdown.
const CLASS_LIST = [['BV', 'Balvatika'], ['1', 'Class 1'], ['2', 'Class 2'], ['3', 'Class 3'], ['4', 'Class 4'], ['5', 'Class 5'], ['6', 'Class 6'], ['7', 'Class 7'], ['8', 'Class 8'], ['9', 'Class 9'], ['10', 'Class 10']]
// Catalog subjects selectable in the folder→subject mapping table.
const SUBJECTS = [['math', 'Math'], ['odia', 'Odia'], ['mil', 'Odia (MIL)'], ['english', 'English'], ['hindi', 'Hindi'], ['sanskrit', 'Sanskrit'], ['science', 'Science'], ['social', 'Social Science'], ['sports', 'Sports'], ['art', 'Art'], ['kaushal', 'Vocational / Skill'], ['evs', 'EVS'], ['indradhanu', 'Indradhanu'], ['nabarasa', 'Nabarasa']]
const SUBJECT_ODIA = { math: 'ଗଣିତ', odia: 'ଓଡ଼ିଆ', mil: 'ଓଡ଼ିଆ (MIL)', english: 'ଇଂରାଜୀ', hindi: 'ହିନ୍ଦୀ', sanskrit: 'ସଂସ୍କୃତ', science: 'ବିଜ୍ଞାନ', social: 'ସାମାଜିକ ବିଜ୍ଞାନ', sports: 'ଖେଳ ଶିକ୍ଷା', art: 'କଳା', kaushal: 'କୌଶଳ', evs: 'ପରିବେଶ', indradhanu: 'ଇନ୍ଦ୍ରଧନୁ', nabarasa: 'ନବରସ' }
const subjLabel = (k) => (SUBJECTS.find(s => s[0] === k) || [])[1] || k
const subjOdia = (k) => SUBJECT_ODIA[k] || subjLabel(k)
const H1 = ({ children }) => <h1 className="text-2xl font-extrabold mb-1" style={{ color: IND }}>{children}</h1>
const Card = ({ children, className = '' }) => <div className={`bg-white rounded-[18px] border border-gray-100 p-4 ${className}`}>{children}</div>

function scanZipReq(file, onDone, onErr) {
  const fd = new FormData(); fd.append('file', file)
  const xhr = new XMLHttpRequest()
  xhr.open('POST', `${API}/admin/store/unit-tests/scan`)
  xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`)
  xhr.onload = () => { let d = {}; try { d = JSON.parse(xhr.responseText) } catch {}; xhr.status < 300 ? onDone(d) : onErr(new Error(d.error || 'Scan failed')) }
  xhr.onerror = () => onErr(new Error('Network error'))
  xhr.send(fd)
}

function toCSV(job) {
  const rows = [['chapter', 'subject', 'action']]
  for (const r of job.report || []) rows.push([r.chapter, r.subject, r.action])
  for (const w of job.warnings || []) rows.push([w.chapter, w.subject, `warning:pages=${w.pages}`])
  for (const e of job.errors || []) rows.push([e.chapter || '', e.subject || '', `error:${e.error}`])
  return rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export default function AdminUnitTestsManager() {
  const [tab, setTab] = useState('import')
  const [isSuper, setIsSuper] = useState(false)
  useEffect(() => { sget('/admin/store/sets/rollout-access').then(r => setIsSuper(!!r.super)).catch(() => setIsSuper(false)) }, [])
  const tabs = [['import', 'Import ZIP'], ['catalog', 'Catalog'], ['buyers', 'Buyers']]
  if (isSuper) tabs.push(['rollout', '🚦 Sets Rollout'])
  return (
    <div>
      <H1>Unit Tests</H1>
      <div className="text-[12px] text-gray-400 mb-3">ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ · bulk import & catalog</div>
      <div className="flex gap-1.5 mb-4">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className="text-[12px] font-bold rounded-full px-3 py-1.5" style={tab === k ? { background: IND, color: '#fff' } : { background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb' }}>{l}</button>)}
      </div>
      {tab === 'import' ? <ImportTab /> : tab === 'rollout' ? <RolloutTab /> : tab === 'buyers' ? <BuyersTab /> : <CatalogTab />}
    </div>
  )
}

function BuyersTab() {
  const [cls, setCls] = useState('8')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const load = (c) => { setLoading(true); sget(`/admin/store/unit-tests/buyers?class=${c}`).then(r => { setData(r); setLoading(false) }).catch(e => { toast.error(e.message); setLoading(false) }) }
  useEffect(() => { load(cls) }, []) // eslint-disable-line
  const t = data?.totals
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-bold text-[15px]" style={{ color: IND }}>Who bought this class</div>
          <select value={cls} onChange={e => { setCls(e.target.value); load(e.target.value) }} className="border rounded-lg px-2 py-1.5 text-[12px]">{CLASS_LIST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button onClick={() => load(cls)} className="text-[12px] flex items-center gap-1 text-gray-500"><RefreshCw size={13} /> Refresh</button>
        </div>
        {t && (
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="rounded-xl p-2" style={{ background: '#f6f5ff' }}><div className="text-[20px] font-extrabold" style={{ color: IND }}>{t.buyers}</div><div className="text-[10px] text-gray-500">buyers ({t.grantOnly} grant-only)</div></div>
            <div className="rounded-xl p-2" style={{ background: '#f6f5ff' }}><div className="text-[20px] font-extrabold" style={{ color: IND }}>{t.orders}</div><div className="text-[10px] text-gray-500">paid orders</div></div>
            <div className="rounded-xl p-2" style={{ background: '#f0fdf4' }}><div className="text-[20px] font-extrabold" style={{ color: '#166534' }}>{money(t.amount)}</div><div className="text-[10px] text-gray-500">total collected</div></div>
          </div>
        )}
      </Card>
      {loading ? <div className="text-sm text-gray-400">Loading…</div> : (
        (data?.buyers || []).length === 0 ? <div className="text-sm text-gray-400 p-4 bg-white rounded-[18px] border border-gray-100">No buyers for Class {cls} yet. 🎉 Safe to re-import.</div> : (
          <div className="bg-white rounded-[18px] border border-gray-100 overflow-hidden">
            {data.buyers.map((b, i) => (
              <div key={b.userId} className="px-3 py-2.5 text-[12px]" style={{ borderTop: i ? '1px solid #f1f1f4' : 'none' }}>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0"><span className="font-semibold">{b.name || '—'}</span> <span className="text-gray-400">· {b.mobile || b.userId?.slice(0, 8)}</span>{b.grantOnly && <span className="ml-1 text-[10px] rounded-full px-1.5 py-0.5" style={{ background: '#fef3c7', color: '#92400e' }}>grant</span>}</div>
                  <span className="text-gray-400">{b.items.length} item(s)</span>
                  <span className="font-bold" style={{ color: IND }}>{money(b.amount)}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 truncate">{b.items.map(it => it.title).join(' · ')}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function ImportTab() {
  const [mode, setMode] = useState('skip')
  const [publish, setPublish] = useState(false)
  const [replaceClass, setReplaceClass] = useState(false)
  const [jobs, setJobs] = useState([])
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scan, setScan] = useState(null)      // { scanId, zipName, detectedClass, total, folders, skipped }
  const [className, setClassName] = useState('')
  const [mapping, setMapping] = useState({})   // folder -> subjectKey
  const [openFolder, setOpenFolder] = useState(null)
  const pollRef = useRef(null)
  const fileRef = useRef(null)

  const loadJobs = () => sget('/admin/store/unit-tests/jobs').then(r => setJobs(r.jobs || [])).catch(() => {})
  useEffect(() => { loadJobs() }, [])
  useEffect(() => {
    const anyRunning = jobs.some(j => j.status === 'running')
    if (anyRunning && !pollRef.current) { pollRef.current = setInterval(loadJobs, 2500) }
    if (!anyRunning && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    return () => { if (pollRef.current && !jobs.some(j => j.status === 'running')) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [jobs])

  const onPick = (e) => {
    const file = (e.target.files || [])[0]; if (!file) return
    setScanning(true); setScan(null)
    scanZipReq(file, (d) => {
      setScanning(false)
      if (fileRef.current) fileRef.current.value = ''
      setScan(d)
      setClassName(d.detectedClass || '')
      const init = {}; for (const f of (d.folders || [])) init[f.folder] = f.suggestedKey
      setMapping(init)
      if (!d.detectedClass) toast.info('Could not detect class — please pick it below.')
    }, (err) => { setScanning(false); toast.error(err.message) })
  }

  const doImport = () => {
    if (!className) { toast.error('Pick a class first (never import with class undefined).'); return }
    const map = {}
    for (const f of (scan.folders || [])) { const k = mapping[f.folder] || f.suggestedKey; map[f.folder] = { subjectKey: k, nameEnglish: subjLabel(k), nameOdia: subjOdia(k) } }
    setImporting(true)
    spost('/admin/store/unit-tests/import', { scanId: scan.scanId, className, mode, publish, replaceClass, mapping: map, zipName: scan.zipName })
      .then(() => { setImporting(false); toast.success(`Import started · Class ${className} · ${publish ? 'published' : 'draft (unpublished)'}`); setScan(null); loadJobs(); if (!pollRef.current) pollRef.current = setInterval(loadJobs, 2500) })
      .catch(e => { setImporting(false); toast.error(e.message) })
  }

  const downloadCSV = (job) => { const blob = new Blob([toCSV(job)], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `unit-tests-class${job.className}-${job.id.slice(0, 6)}.csv`; a.click() }
  const rebuildPacks = async (cls) => { try { await spost('/admin/store/unit-tests/rebuild-packs', { class: cls }); toast.success(`Packs rebuilt for Class ${cls}`) } catch (e) { toast.error(e.message) } }
  const retryFailed = async (job, m) => {
    try { const r = await spost(`/admin/store/unit-tests/jobs/${job.id}/${m}`, {}); if (r.nothing) { toast.info('No failed files to retry'); return } toast.success(m === 'resume' ? 'Resuming job…' : `Retrying ${r.retrying} file(s)…`); loadJobs(); if (!pollRef.current) pollRef.current = setInterval(loadJobs, 2500) }
    catch (e) { toast.error(e.status === 409 ? 'Zip no longer cached (server restarted) — re-upload the class zip.' : e.message) }
  }
  const sel = 'border rounded-lg px-2 py-1.5 text-[12px]'

  return (
    <div className="space-y-4">
      <Card>
        <div className="font-bold text-[15px] mb-1" style={{ color: IND }}>Import unit test ZIPs</div>
        <div className="text-[12px] text-gray-500 mb-3">Upload a <b>Class-N-Unit-Tests-PDF.zip</b>. Each PDF = 5 chapterwise tests. Subject = the folder each PDF sits in. You'll confirm a folder → subject mapping before anything is imported.</div>
        <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-sm rounded-full px-5 py-2.5 text-white" style={{ background: scanning ? '#9ca3af' : CORAL }}>
          <UploadCloud size={18} /> {scanning ? 'Scanning…' : 'Choose ZIP file'}
          <input ref={fileRef} type="file" accept=".zip" className="hidden" disabled={scanning} onChange={onPick} />
        </label>
      </Card>

      {/* ---- Preview mapping (step 2) ---- */}
      {scan && (
        <Card className="border-2" >
          <div className="flex items-center justify-between mb-2">
            <div className="font-extrabold text-[15px]" style={{ color: IND }}>Confirm import · {scan.zipName}</div>
            <button onClick={() => setScan(null)} className="text-[12px] text-gray-400">✕ cancel</button>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="flex items-center gap-1.5 text-[12px]"><span className="text-gray-500">Class <b className="text-rose-600">*</b></span>
              <select value={className} onChange={e => setClassName(e.target.value)} className={sel} style={!className ? { borderColor: '#e8452c' } : {}}>
                <option value="">— pick class —</option>{CLASS_LIST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 text-[12px]"><span className="text-gray-500">On duplicate:</span>
              <select value={mode} onChange={e => setMode(e.target.value)} className={sel}><option value="skip">Skip</option><option value="replace">Replace file</option><option value="new">Import as new</option></select>
            </div>
            <label className="flex items-center gap-1.5 text-[12px] cursor-pointer"><input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} /><span className="text-gray-600">Publish now (default: <b>unpublished / draft</b>)</span></label>
          </div>
          <label className="flex items-start gap-1.5 text-[12px] cursor-pointer mb-2 rounded-lg p-2" style={{ background: replaceClass ? '#fef2f2' : '#f9fafb' }}>
            <input type="checkbox" checked={replaceClass} onChange={e => setReplaceClass(e.target.checked)} className="mt-0.5" />
            <span className="text-gray-700"><b className="text-rose-700">Replace entire class first</b> — before importing, remove ALL existing Class {className || 'N'} unit tests &amp; packs. Items with buyers are <b>archived</b> (buyers keep access); unsold items are deleted. Use this to clean up a wrong earlier import without creating duplicates.</span>
          </label>
          <div className="text-[12px] text-gray-600 mb-1"><b>{scan.total}</b> PDFs across <b>{scan.folders?.length || 0}</b> folders{scan.skipped?.length ? <span className="text-rose-600"> · {scan.skipped.length} skipped</span> : ''}</div>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-gray-400" style={{ background: '#faf9ff' }}><th className="p-2">Folder</th><th className="p-2 w-14 text-center">Files</th><th className="p-2 w-52">→ Catalog subject</th><th className="p-2 w-16"></th></tr></thead>
              <tbody>
                {(scan.folders || []).map(f => (
                  <React.Fragment key={f.folder}>
                    <tr className="border-t">
                      <td className="p-2 font-semibold truncate max-w-[180px]">{f.folder}</td>
                      <td className="p-2 text-center">{f.count}</td>
                      <td className="p-2">
                        <select value={mapping[f.folder] || f.suggestedKey} onChange={e => setMapping(m => ({ ...m, [f.folder]: e.target.value }))} className="border rounded-lg px-2 py-1 text-[12px] w-full">
                          {!SUBJECTS.find(s => s[0] === (mapping[f.folder] || f.suggestedKey)) && <option value={f.suggestedKey}>{f.suggestedName} (custom)</option>}
                          {SUBJECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </td>
                      <td className="p-2 text-right"><button onClick={() => setOpenFolder(openFolder === f.folder ? null : f.folder)} className="text-[11px] font-bold" style={{ color: IND }}>{openFolder === f.folder ? 'hide' : 'names'}</button></td>
                    </tr>
                    {openFolder === f.folder && <tr className="border-t" style={{ background: '#fafafa' }}><td colSpan={4} className="p-2 text-[11px] text-gray-500"><ul className="list-disc ml-4 max-h-40 overflow-auto">{f.chapters.map((c, i) => <li key={i}>{c}</li>)}</ul></td></tr>}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {scan.skipped?.length > 0 && (
            <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
              <b>Skipped {scan.skipped.length} file(s):</b> {scan.skipped.map((s, i) => <span key={i}>{s.name} ({s.reason}){i < scan.skipped.length - 1 ? ', ' : ''}</span>)}
            </div>
          )}
          <button disabled={importing || !className} onClick={doImport} className="mt-3 font-bold text-white rounded-full px-5 py-2.5 text-sm disabled:opacity-50" style={{ background: CORAL }}>{importing ? 'Starting…' : `Confirm & import ${scan.total} tests`}</button>
        </Card>
      )}

      {/* ---- Jobs ---- */}
      <div className="flex items-center justify-between"><div className="text-[12px] font-bold text-gray-500">Import jobs</div><button onClick={loadJobs} className="text-[12px] flex items-center gap-1 text-gray-500"><RefreshCw size={13} /> Refresh</button></div>
      <div className="space-y-2">
        {jobs.map(j => {
          const pct = j.total ? Math.round((j.done / j.total) * 100) : 0
          return (
            <Card key={j.id}>
              <div className="flex items-center gap-2 mb-1">
                <FileArchive size={16} style={{ color: IND }} />
                <div className="font-bold text-[13px] flex-1 truncate">{j.zipName || `Class ${j.className}`} <span className="text-gray-400 font-normal">· Class {j.className} · mode: {j.mode}</span></div>
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: j.status === 'done' ? '#2a9d5c' : j.status === 'error' ? '#e8452c' : '#1fa2d9' }}>{j.status}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: j.status === 'done' ? '#2a9d5c' : SAFF }} /></div>
              {j.errors?.length > 0 && (
                <div className="mt-1.5 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 max-h-28 overflow-auto">
                  <div className="font-bold mb-0.5">⚠ {j.errors.length} ଟି ଫାଇଲ୍ ବିଫଳ:</div>
                  {j.errors.slice(0, 12).map((e, i) => <div key={i}>• {e.fileName || e.chapter || ''} {(e.class || e.subject) ? `(ଶ୍ରେଣୀ ${e.class || ''} ${e.subject || ''})` : ''} — {e.reason || e.error}</div>)}
                </div>
              )}
              {j.cleared && (
                <div className="mt-1.5 text-[11px] rounded-lg p-2" style={{ background: '#fff7ed', color: '#9a3412' }}>
                  Replace-class: {j.cleared.deleted} deleted · {j.cleared.archived} archived (buyers kept access)
                </div>
              )}
              {j.expected && (
                <div className="mt-1.5 text-[11px] rounded-lg p-2" style={{ background: j.expected.mismatchZip ? '#fef2f2' : j.expected.mismatchRef ? '#fffbeb' : '#f0fdf4', color: j.expected.mismatchZip ? '#b91c1c' : j.expected.mismatchRef ? '#b45309' : '#166534' }}>
                  ଶ୍ରେଣୀ {j.expected.class}: ZIP {j.expected.zip} · Imported {j.expected.imported} · Reference {j.expected.reference ?? '—'}
                  {j.expected.mismatchRef && <span> · ⚠ ZIP {j.expected.zip} vs reference {j.expected.reference}</span>}
                </div>
              )}
              <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500">
                <span>{j.done}/{j.total} · imported {j.imported} · skipped {j.skipped} · replaced {j.replaced} · {j.errors?.length || 0} errors · {j.warnings?.length || 0} page-warnings</span>
                <div className="flex gap-2">
                  {j.status === 'done' && j.errors?.length > 0 && <button onClick={() => retryFailed(j, 'retry-failed')} className="text-[11px] font-bold" style={{ color: CORAL }}>Retry failed</button>}
                  {j.status !== 'running' && <button onClick={() => retryFailed(j, 'resume')} className="text-[11px] font-bold text-gray-500">Resume</button>}
                  {j.status === 'done' && <button onClick={() => rebuildPacks(j.className)} className="text-[11px] font-bold" style={{ color: IND }}>Rebuild packs</button>}
                  {(j.report?.length || j.errors?.length) ? <button onClick={() => downloadCSV(j)} className="flex items-center gap-1 text-[11px] font-bold" style={{ color: CORAL }}><Download size={12} /> CSV</button> : null}
                </div>
              </div>
            </Card>
          )
        })}
        {jobs.length === 0 && <div className="text-sm text-gray-400">No import jobs yet.</div>}
      </div>
    </div>
  )
}

function CatalogTab() {
  const [items, setItems] = useState([])
  const [f, setF] = useState({ class: '', subjectKey: '', status: '', type: '', search: '' })
  const [subjects, setSubjects] = useState([])
  const [edit, setEdit] = useState(null)
  const load = () => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
    sget(`/admin/store/unit-tests${qs ? '?' + qs : ''}`).then(r => setItems(r.items || [])).catch(e => toast.error(e.message))
  }
  useEffect(() => { load() }, [f]) // eslint-disable-line
  useEffect(() => { sget(`/admin/store/unit-tests/subjects${f.class ? '?class=' + f.class : ''}`).then(r => setSubjects(r.subjects || [])).catch(() => {}) }, [f.class])
  const sel = 'border rounded-lg px-2 py-1.5 text-[12px]'
  const tests = items.filter(i => i.type === 'unit_test')
  const packs = items.filter(i => i.type === 'unit_test_pack')
  const save = async (p) => { try { await fetch(`${API}/admin/store/unit-tests/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(p) }).then(r => r.json()); toast.success('Saved'); setEdit(null); load() } catch (e) { toast.error(e.message) } }
  const del = async (p) => {
    if (!confirm(p.salesCount > 0 ? 'This has buyers — it will be ARCHIVED (buyers keep access). Continue?' : 'No purchases — this will be permanently DELETED. Continue?')) return
    try { const r = await fetch(`${API}/admin/store/unit-tests/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } }).then(x => x.json()); toast.success(r.action === 'archived' ? 'Archived (buyers keep access)' : 'Deleted'); load() } catch (e) { toast.error(e.message) }
  }
  const replace = async (p, file) => { const fd = new FormData(); fd.append('file', file); try { await fetch(`${API}/admin/store/unit-tests/${p.id}/replace`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }).then(r => r.json()); toast.success('PDF replaced & preview regenerated'); load() } catch (e) { toast.error(e.message) } }
  const regenCover = async (p) => { try { await spost(`/admin/store/products/${p.id}/cover`, { action: 'regenerate' }); toast.success('Cover regenerated') } catch (e) { toast.error(e.message) } }
  const publishAll = async (action) => {
    if (!f.class) { toast.error('Pick a class first.'); return }
    const target = action === 'publish' ? 'draft' : 'published'
    let cnt = { t: 0, p: 0 }
    try {
      const r = await sget(`/admin/store/unit-tests?${new URLSearchParams({ class: f.class, status: target })}`)
      const its = r.items || []
      cnt = { t: its.filter(i => i.type === 'unit_test').length, p: its.filter(i => i.type === 'unit_test_pack').length }
    } catch (e) { toast.error(e.message); return }
    const label = (CLASS_LIST.find(c => c[0] === f.class) || [])[1] || ('Class ' + f.class)
    const verb = action === 'publish' ? 'Publish' : 'Unpublish'
    if (cnt.t + cnt.p === 0) { toast.info(`Nothing to ${action.toLowerCase()} for ${label}.`); return }
    if (!confirm(`${verb} ${cnt.t} tests + ${cnt.p} packs of ${label}?`)) return
    try { const r = await spost('/admin/store/unit-tests/publish-all', { class: f.class, action }); toast.success(`${verb}ed ${r.tests} tests + ${r.packs} packs`); load() } catch (e) { toast.error(e.message) }
  }
  return (
    <div className="space-y-3">
      {edit && <EditModal p={edit} subjects={subjects} onSave={save} onClose={() => setEdit(null)} />}
      <Card>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={f.class} onChange={e => setF({ ...f, class: e.target.value, subjectKey: '' })} className={sel}><option value="">All classes</option>{CLASS_LIST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <select value={f.subjectKey} onChange={e => setF({ ...f, subjectKey: e.target.value })} className={sel}><option value="">All subjects</option>{subjects.map(s => <option key={s.id} value={s.subjectKey}>{s.nameEnglish}</option>)}</select>
          <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} className={sel}><option value="">Any status</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
          <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} className={sel}><option value="">Tests + Packs</option><option value="unit_test">Tests only</option><option value="unit_test_pack">Packs only</option></select>
          <input value={f.search} onChange={e => setF({ ...f, search: e.target.value })} placeholder="Search chapter…" className={sel + ' flex-1 min-w-[160px]'} />
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="text-[11px] text-gray-400">{tests.length} tests · {packs.length} packs</div>
          {f.class && (
            <div className="flex gap-1.5">
              <button onClick={() => publishAll('publish')} className="text-[11px] font-bold rounded-full px-3 py-1.5 text-white" style={{ background: GREEN }}>Publish all</button>
              <button onClick={() => publishAll('unpublish')} className="text-[11px] font-bold rounded-full px-3 py-1.5" style={{ background: '#f3f4f6', color: '#374151' }}>Unpublish all</button>
            </div>
          )}
        </div>
      </Card>
      {packs.length > 0 && (
        <Card>
          <div className="font-bold text-[13px] mb-2" style={{ color: IND }}>Packs</div>
          {packs.map(p => <div key={p.id} className="flex items-center gap-2 text-[12px] py-1.5 border-b last:border-0"><span className="flex-1 truncate">{p.titleEnglish}</span>{p.priceWarn && <span title="Below ₹5 per chapter" className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: '#fdecea', color: '#e8452c' }}>⚠ ₹{p.perChapter}/ch</span>}<span className="text-gray-400">{p.packMeta?.chapters || 0} ch</span><span className="font-bold" style={{ color: IND }}>{money(p.priceInr)}</span><button onClick={() => setEdit(p)} className="text-[11px] font-bold" style={{ color: IND }}>Edit</button></div>)}
        </Card>
      )}
      <div className="bg-white rounded-[18px] border border-gray-100 overflow-hidden">
        {tests.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 px-3 py-2.5 text-[12px]" style={{ borderTop: i ? '1px solid #f1f1f4' : 'none' }}>
            <div className="flex-1 min-w-0"><div className="truncate font-semibold">{p.unitTest?.chapterTitle}</div><div className="text-[10px] text-gray-400">Class {p.unitTest?.class} · {p.subjectKey || p.unitTest?.subjectKey} · {p.language} · {p.pages}p</div></div>
            <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: p.status === 'published' ? '#e7f6ee' : p.status === 'archived' ? '#fdecea' : '#f3f4f6', color: p.status === 'published' ? '#2a9d5c' : p.status === 'archived' ? '#e8452c' : '#6b7280' }}>{p.status}</span>
            <span className="font-bold" style={{ color: IND }}>{money(p.priceInr)}</span>
            <span className="text-gray-400 w-12 text-right">{p.salesCount || 0} sold</span>
            <button onClick={() => setEdit(p)} className="text-[11px] font-bold rounded px-2 py-1" style={{ background: '#eef0fb', color: IND }}>Edit</button>
            <label className="text-[11px] font-bold rounded px-2 py-1 cursor-pointer" style={{ background: '#e7f1fb', color: '#1fa2d9' }}>Replace<input type="file" accept=".pdf" className="hidden" onChange={e => e.target.files[0] && replace(p, e.target.files[0])} /></label>
            <button onClick={() => regenCover(p)} title="Regenerate cover image" className="text-[11px] font-bold rounded px-2 py-1" style={{ background: '#fff7e6', color: '#b8860b' }}>Cover</button>
            <button onClick={() => del(p)} className="text-[11px] font-bold rounded px-2 py-1" style={{ background: '#fdecea', color: '#e8452c' }}>Del</button>
          </div>
        ))}
        {tests.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No unit tests. Import a ZIP first.</div>}
      </div>
    </div>
  )
}

function EditModal({ p, subjects, onSave, onClose }) {
  const [s, setS] = useState({ id: p.id, chapterTitle: p.unitTest?.chapterTitle || '', subjectKey: p.subjectKey || p.unitTest?.subjectKey || '', titleOdia: p.titleOdia || '', titleEnglish: p.titleEnglish || '', priceInr: p.priceInr, mrpInr: p.mrpInr, status: p.status, sortOrder: p.sortOrder || 0 })
  const up = (k, v) => setS(x => ({ ...x, [k]: v }))
  const coverRegen = async () => { try { await spost(`/admin/store/products/${p.id}/cover`, { action: 'regenerate' }); toast.success('Cover regenerated') } catch (e) { toast.error(e.message) } }
  const coverReset = async () => { try { await spost(`/admin/store/products/${p.id}/cover`, { action: 'reset' }); toast.success('Reset to auto (regenerated)') } catch (e) { toast.error(e.message) } }
  const coverUpload = async (file) => { const fd = new FormData(); fd.append('file', file); try { const r = await fetch(`${API}/admin/store/products/${p.id}/cover/upload`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }).then(x => x.json()); if (r.error) throw new Error(r.error); toast.success('Custom cover uploaded') } catch (e) { toast.error(e.message) } }
  const inp = 'w-full border rounded-lg px-3 py-2 text-sm'
  const isPack = p.type === 'unit_test_pack'
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-4 w-full max-w-md space-y-2 text-[12px]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between"><div className="font-bold text-sm" style={{ color: IND }}>Edit {isPack ? 'pack' : 'unit test'}</div><button onClick={onClose} className="text-gray-400">✕</button></div>
        {!isPack && <><div><div>Chapter title</div><input value={s.chapterTitle} onChange={e => up('chapterTitle', e.target.value)} className={inp} /></div>
          <div><div>Subject</div><select value={s.subjectKey} onChange={e => up('subjectKey', e.target.value)} className={inp}>{subjects.map(x => <option key={x.id} value={x.subjectKey}>{x.nameEnglish}</option>)}</select></div></>}
        <div><div>Title (Odia)</div><input value={s.titleOdia} onChange={e => up('titleOdia', e.target.value)} className={inp} /></div>
        <div className="grid grid-cols-3 gap-2">
          <div><div>Price ₹</div><input type="number" value={s.priceInr} onChange={e => up('priceInr', Number(e.target.value))} className={inp} /></div>
          <div><div>MRP ₹</div><input type="number" value={s.mrpInr} onChange={e => up('mrpInr', Number(e.target.value))} className={inp} /></div>
          <div><div>Sort</div><input type="number" value={s.sortOrder} onChange={e => up('sortOrder', Number(e.target.value))} className={inp} /></div>
        </div>
        <div><div>Status</div><select value={s.status} onChange={e => up('status', e.target.value)} className={inp}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
        <div className="border-t pt-2">
          <div className="text-[11px] font-bold text-indigo-900 mb-1">Cover image</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-bold rounded px-2 py-1 cursor-pointer" style={{ background: '#e7f1fb', color: '#1fa2d9' }}>Upload my own<input type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && coverUpload(e.target.files[0])} /></label>
            <button onClick={coverRegen} className="text-[11px] font-bold rounded px-2 py-1" style={{ background: '#fff7e6', color: '#b8860b' }}>Regenerate auto</button>
            <button onClick={coverReset} className="text-[11px] font-bold rounded px-2 py-1" style={{ background: '#f3f4f6', color: '#374151' }}>Reset to auto</button>
          </div>
        </div>
        <div className="text-[10px] text-gray-400">Price changes apply only to new orders (logged in price history).</div>
        <button onClick={() => onSave(s)} className="w-full font-bold text-white rounded-full py-2 text-sm" style={{ background: IND }}>Save</button>
      </div>
    </div>
  )
}


// ======================= SETS ROLLOUT (super-admin only) =======================
function RolloutTab() {
  const [points, setPoints] = useState([])
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [switchRes, setSwitchRes] = useState(null)

  const load = () => {
    sget('/admin/store/sets/restore-points').then(r => setPoints(r.points || [])).catch(() => {})
    sget('/admin/store/sets/switch-plan').then(r => setPlan(r.plan)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const runSwitch = async () => {
    if (!confirm('Run the ATOMIC SETS SWITCH now?\n\nThis sets chapters ₹10, sets ₹2, applies all approved pack prices, makes sets visible and turns setsLive ON. A "Before sets switch" restore point is saved first. On any error it auto-rolls-back.\n\nProceed?')) return
    setBusy(true); setSwitchRes(null)
    try { const r = await spost('/admin/store/sets/rollout-switch', {}); setSwitchRes(r); r.ok ? toast.success('Switch applied ✓') : toast.error('Switch blocked: ' + (r.reason || r.error)); load() }
    catch (e) { toast.error(e.message || 'Switch failed') }
    finally { setBusy(false) }
  }
  const saveNow = async () => {
    const label = prompt('Name this restore point:', 'Saved ' + new Date().toISOString().slice(0, 16).replace('T', ' '))
    if (!label) return
    setBusy(true)
    try { await spost('/admin/store/sets/restore-points', { label }); toast.success('Restore point saved'); load() }
    catch (e) { toast.error(e.message || 'Failed') } finally { setBusy(false) }
  }
  const doPreview = async (id) => {
    setBusy(true)
    try { const r = await sget(`/admin/store/sets/restore-points/${id}/preview`); setPreview(r) }
    catch (e) { toast.error(e.message || 'Failed') } finally { setBusy(false) }
  }
  const doRestore = async (p) => {
    if (!confirm(`RESTORE to "${p.label}"?\n\nThis reverts all unit-test chapter, set and pack prices, set visibility and the setsLive flag to that snapshot. Orders, payments and buyer access are NOT touched — buyers keep everything they own. A safety snapshot of the current state is saved first.\n\nProceed?`)) return
    setBusy(true)
    try { const r = await spost(`/admin/store/sets/restore-points/${p.id}/restore`, {}); r.ok ? toast.success('Restored ✓ (' + r.productsModified + ' products)') : toast.error('Restore failed: ' + (r.error || r.reason)); setPreview(null); load() }
    catch (e) { toast.error(e.message || 'Failed') } finally { setBusy(false) }
  }

  const packUp = (plan?.packPlan || []).filter(p => p.from !== p.to)
  const chUp = (plan?.chapterPlan || []).filter(c => c.from !== c.to).length

  return (
    <div className="space-y-4">
      <Card>
        <div className="font-extrabold text-[15px]" style={{ color: IND }}>🚦 Sets Go-Live Switch</div>
        <div className="text-[12px] text-gray-500 mb-3">Atomic: validate → save "Before" restore point → apply prices (sets hidden) → make sets visible + setsLive ON (banner flips) → verify → auto-rollback on any error. Never touches orders/payments/access.</div>
        {plan && (
          <div className="grid grid-cols-3 gap-2 mb-3 text-center">
            <div className="rounded-xl p-2" style={{ background: '#f6f5ff' }}><div className="text-[18px] font-extrabold" style={{ color: IND }}>{plan.chaptersCount}</div><div className="text-[10px] text-gray-500">chapters ({chUp} reprice)</div></div>
            <div className="rounded-xl p-2" style={{ background: '#f6f5ff' }}><div className="text-[18px] font-extrabold" style={{ color: IND }}>{plan.setsCount}</div><div className="text-[10px] text-gray-500">sets (→₹2 each)</div></div>
            <div className="rounded-xl p-2" style={{ background: '#f6f5ff' }}><div className="text-[18px] font-extrabold" style={{ color: IND }}>{plan.packsCount}</div><div className="text-[10px] text-gray-500">packs ({packUp.length} change)</div></div>
          </div>
        )}
        {plan?.warnings?.length ? <div className="text-[12px] rounded-lg p-2 mb-2" style={{ background: '#fee2e2', color: '#991b1b' }}>⚠ {plan.warnings.length} pack price(s) not below buy-separately — switch will be BLOCKED until fixed.</div> : null}
        {packUp.length ? (
          <div className="mb-3 max-h-48 overflow-auto border rounded-lg">
            <table className="w-full text-[11px]"><thead><tr className="text-gray-400 text-left"><th className="p-1.5">Pack</th><th className="p-1.5">Type</th><th className="p-1.5">Now</th><th className="p-1.5">After</th><th className="p-1.5">Separately</th></tr></thead>
              <tbody>{packUp.map(p => <tr key={p.id} className="border-t"><td className="p-1.5 truncate max-w-[220px]">{p.title}</td><td className="p-1.5">{p.kind}</td><td className="p-1.5">₹{p.from}</td><td className="p-1.5 font-bold" style={{ color: IND }}>₹{p.to}</td><td className="p-1.5 text-gray-400">₹{p.separately}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
        <button disabled={busy} onClick={runSwitch} className="font-bold text-white rounded-full px-4 py-2 text-sm disabled:opacity-50" style={{ background: CORAL }}>{busy ? 'Working…' : 'Run atomic sets switch'}</button>
        {switchRes && <pre className="text-[10px] mt-2 p-2 rounded-lg overflow-auto max-h-48" style={{ background: switchRes.ok ? '#ecfdf5' : '#fef2f2', color: '#374151' }}>{JSON.stringify(switchRes, null, 1)}</pre>}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="font-extrabold text-[15px]" style={{ color: IND }}>↩ Restore points</div>
          <button disabled={busy} onClick={saveNow} className="text-[11px] font-bold rounded-full px-3 py-1.5" style={{ background: '#f3f4f6', color: '#374151' }}>+ Save restore point now</button>
        </div>
        {!points.length && <div className="text-[12px] text-gray-400">No restore points yet. One is created automatically when you run the switch.</div>}
        <div className="space-y-2">
          {points.map(p => (
            <div key={p.id} className="border rounded-xl p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-[13px]" style={{ color: IND }}>{p.label} {p.kind === 'pre_switch' ? '🟦' : p.kind === 'approved' ? '🟩' : ''}</div>
                  <div className="text-[10px] text-gray-400">{new Date(p.createdAt).toLocaleString('en-IN')} · setsLive={String(p.summary?.setsLive)} · {p.summary?.sets} sets ({p.summary?.setsVisible} visible) · {p.summary?.packs} packs</div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button disabled={busy} onClick={() => doPreview(p.id)} className="text-[11px] font-bold rounded px-2 py-1" style={{ background: '#eef2ff', color: IND }}>Preview</button>
                  <button disabled={busy} onClick={() => doRestore(p)} className="text-[11px] font-bold rounded px-2 py-1 text-white" style={{ background: IND }}>Restore</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {preview && (
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="font-extrabold text-[14px]" style={{ color: IND }}>Preview restore → "{preview.restorePoint?.label}"</div>
            <button onClick={() => setPreview(null)} className="text-[11px] text-gray-400">✕ close</button>
          </div>
          <div className="text-[12px] mb-2">setsLive: <b>{String(preview.setsLive?.from)}</b> → <b>{String(preview.setsLive?.to)}</b> · {preview.totalChanges} product change(s) — chapters {preview.byType?.chapters}, sets {preview.byType?.sets}, packs {preview.byType?.packs}</div>
          {preview.packChanges?.length ? (
            <div className="max-h-56 overflow-auto border rounded-lg">
              <table className="w-full text-[11px]"><thead><tr className="text-gray-400 text-left"><th className="p-1.5">Pack</th><th className="p-1.5">Now</th><th className="p-1.5">After restore</th></tr></thead>
                <tbody>{preview.packChanges.map(d => <tr key={d.id} className="border-t"><td className="p-1.5 truncate max-w-[260px]">{d.title}</td><td className="p-1.5">₹{d.priceFrom}</td><td className="p-1.5 font-bold" style={{ color: IND }}>₹{d.priceTo}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <div className="text-[12px] text-gray-400">No pack price changes in this restore.</div>}
        </Card>
      )}
    </div>
  )
}
