'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { sget, spost, API, getToken } from '@/components/store/api'

export default function AdminLoMasterManager() {
  const [matrix, setMatrix] = useState(null)
  const [versions, setVersions] = useState([])
  const [cls, setCls] = useState('4')
  const [subject, setSubject] = useState('OD')
  const [summary, setSummary] = useState(null)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadMeta = () => { sget('/lomaster/matrix').then(setMatrix).catch(() => {}); sget('/lomaster/admin/versions').then(r => setVersions(r.versions || [])).catch(() => {}) }
  useEffect(loadMeta, [])
  useEffect(() => { if (cls && subject) sget(`/lomaster/summary?class=${cls}&subject=${subject}`).then(setSummary).catch(() => setSummary(null)) }, [cls, subject])

  const subjectsForClass = matrix ? [...new Set(matrix.items.filter(i => i.class === cls).map(i => i.subject_id))] : []

  const upload = async (file) => {
    setBusy(true)
    const fd = new FormData(); fd.append('file', file); fd.append('note', `uploaded ${file.name}`)
    try {
      const r = await fetch(`${API}/lomaster/admin/import`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      const d = await r.json(); if (!r.ok) throw new Error(d.error)
      toast.success(`Version ${d.version.version} imported (${d.version.rowCount} rows)`); loadMeta()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const activate = async (v) => { try { await spost('/lomaster/admin/activate', { version: v }); toast.success(`Version ${v} active`); loadMeta() } catch (e) { toast.error(e.message) } }
  const doSearch = async () => { try { const r = await sget(`/lomaster/search?class=${cls}&subject=${subject}&q=${encodeURIComponent(search)}`); setResults(r.rows || []) } catch (e) { toast.error(e.message) } }

  return (
    <div className="space-y-3">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-[11px] text-indigo-900">
        <b>LO Master (OCF-SE 2026-27)</b> — the single source of truth for CG / Competency / LO. Read-only for other tools; only this tab uploads a new version. Old versions are never deleted.
      </div>

      {/* versions + upload */}
      <div className="bg-white border rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm text-indigo-900">Versions</div>
          <label className={`text-xs font-bold rounded-full px-3 py-1.5 text-white cursor-pointer ${busy ? 'opacity-50' : ''}`} style={{ background: '#2a9d5c' }}>
            {busy ? 'Uploading…' : '⬆️ Upload new version'}
            <input type="file" accept=".json" className="hidden" disabled={busy} onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>
        {versions.length === 0 && <div className="text-[11px] text-gray-400">No versions yet.</div>}
        <div className="space-y-1">
          {versions.map(v => (
            <div key={v.version} className="flex items-center gap-2 text-[12px] border-b last:border-0 py-1">
              <span className="font-bold w-8">v{v.version}</span>
              <span className="flex-1 text-gray-600 truncate">{v.rowCount} rows · {new Date(v.createdAt).toLocaleString()} {v.note ? `· ${v.note}` : ''}</span>
              {v.active ? <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: '#dcfce7', color: '#166534' }}>ACTIVE</span>
                : <button onClick={() => activate(v.version)} className="text-[11px] font-bold text-indigo-600">Activate</button>}
            </div>
          ))}
        </div>
      </div>

      {/* class + subject picker */}
      <div className="bg-white border rounded-xl p-3">
        <div className="flex gap-2 flex-wrap items-center mb-2">
          <select value={cls} onChange={e => { setCls(e.target.value); setResults(null) }} className="border rounded-lg px-2 py-1.5 text-sm">
            {(matrix?.classes || []).map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>
          <select value={subject} onChange={e => { setSubject(e.target.value); setResults(null) }} className="border rounded-lg px-2 py-1.5 text-sm">
            {subjectsForClass.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {summary && <span className="text-[11px] text-gray-500">{summary.subject_printed} · {summary.stage}</span>}
        </div>
        {summary && (
          <div className="grid grid-cols-3 gap-2 text-center mb-2">
            {[['CG', summary.counts.cg], ['Competency', summary.counts.competency], ['LO', summary.counts.lo]].map(([l, n]) => <div key={l} className="bg-gray-50 rounded-lg p-2"><div className="font-extrabold text-indigo-900 text-lg">{n}</div><div className="text-[10px] text-gray-400">{l}</div></div>)}
          </div>
        )}
        <div className="flex gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="Search LO code / text / CG / competency…" className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
          <button onClick={doSearch} className="text-xs font-bold rounded-full px-3 py-1.5 bg-indigo-900 text-white">Search</button>
        </div>
      </div>

      {/* LO list */}
      <div className="bg-white border rounded-xl p-3">
        <div className="text-[11px] font-bold text-gray-600 mb-1.5">{results ? `Search results (${results.length})` : `All LOs — Class ${cls} ${subject}`}</div>
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
          {(results || summary?.los || []).map((r, i) => (
            <div key={i} className="border-b last:border-0 pb-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: '#eceafc', color: '#241a5e' }}>{r.lo_code}</span>
                {r.cg && <span className="text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: '#e0f2fe', color: '#075985' }}>{r.cg}</span>}
                {r.competency && <span className="text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: '#fef9e7', color: '#92400e' }}>{r.competency}</span>}
              </div>
              <div className="text-[12px] text-gray-800 mt-0.5">{r.lo_text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
