'use client'
import React, { useState } from 'react'
import { Upload, Loader2, X } from 'lucide-react'

// Self-contained Admin "Upload new version" control (button + modal).
// Props: cls, book, chapter? (chapter restricts the upload to one chapter).
// Uses same-origin fetch (cookie auth) against /api/lp/admin/version/*.
export default function LpVersionUpload({ cls, book, chapter = null, size = 'book' }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dry, setDry] = useState(null)
  const [err, setErr] = useState('')
  const [removeMissing, setRemoveMissing] = useState(false)
  const [versions, setVersions] = useState([])
  const [audit, setAudit] = useState([])
  const [applied, setApplied] = useState(null)

  // Auth: the app uses a Bearer JWT in localStorage (em_token / token), NOT cookies.
  const authToken = () => (typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token') || '') : '')
  const authHdr = (extra = {}) => { const t = authToken(); return { ...(t ? { Authorization: 'Bearer ' + t } : {}), ...extra } }

  const scopeForm = () => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('classId', cls?.id || '')
    fd.append('bookId', book?.id || '')
    if (chapter?.id) fd.append('chapterId', chapter.id)
    return fd
  }
  const loadVersions = async () => {
    try {
      const r = await fetch(`/api/lp/admin/version/book-versions?bookId=${encodeURIComponent(book.id)}`, { headers: authHdr() }).then(x => x.json())
      if (r.ok) { setVersions(r.versions || []); setAudit(r.audit || []) }
    } catch (_) {}
  }
  const openModal = () => { setOpen(true); setDry(null); setErr(''); setFile(null); setApplied(null); setRemoveMissing(false); loadVersions() }

  const runDryRun = async () => {
    if (!file) { setErr('Choose a .zip or .html file first.'); return }
    setBusy(true); setErr(''); setDry(null); setApplied(null)
    try {
      const fd = scopeForm(); if (removeMissing) fd.append('removeMissing', 'true')
      const r = await fetch('/api/lp/admin/version/dry-run', { method: 'POST', body: fd, headers: authHdr() }).then(x => x.json())
      if (!r.ok) throw new Error(r.error || 'Dry run failed')
      setDry(r)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const apply = async () => {
    if (!dry) return
    const msg = removeMissing
      ? `Apply ${dry.counts.New} new + ${dry.counts.Update} updated period(s) AND REMOVE ${dry.missing.filter(m => m.action === 'REMOVE').length} period(s) not in this upload?`
      : `Apply ${dry.counts.New} new + ${dry.counts.Update} updated period(s)? "Same" and "Error" rows are left untouched.`
    if (!window.confirm(msg)) return
    setBusy(true); setErr('')
    try {
      const fd = scopeForm()
      if (removeMissing) { fd.append('removeMissing', 'true'); fd.append('confirmRemove', 'true') }
      const r = await fetch('/api/lp/admin/version/apply', { method: 'POST', body: fd, headers: authHdr() }).then(x => x.json())
      if (!r.ok) throw new Error(r.error || 'Apply failed')
      setApplied(r); setDry(null); await loadVersions()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const restoreBatch = async (b) => {
    const prev = await fetch(`/api/lp/admin/version/batch-preview?batchId=${encodeURIComponent(b.id)}`, { headers: authHdr() }).then(x => x.json()).catch(() => null)
    const revert = prev?.willRevert || b.periodsUpdated || []
    const remove = prev?.willRemove || b.periodsAdded || []
    if (!window.confirm(`Restore this upload?\n\n• Put back ${revert.length} updated period(s): ${revert.join(', ') || '—'}\n• Remove ${remove.length} added period(s): ${remove.join(', ') || '—'}\n\nThis can itself be undone.`)) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/lp/admin/version/restore-batch', { method: 'POST', headers: authHdr({ 'Content-Type': 'application/json' }), body: JSON.stringify({ batchId: b.id }) }).then(x => x.json())
      if (!r.ok) throw new Error(r.error || 'Restore failed')
      setApplied({ restoredBatch: true, reverted: r.reverted, removed: r.removed }); await loadVersions()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const STATUS_COLOR = { New: '#16a34a', Update: '#2563eb', Same: '#64748b', Error: '#dc2626' }
  const btnH = size === 'chapter' ? 'h-6 w-6' : 'h-7 w-7'
  const icon = size === 'chapter' ? 'w-3 h-3' : 'w-3 h-3'

  return (
    <>
      <button type="button" onClick={openModal}
        title={chapter ? 'Upload new version (this chapter)' : 'Upload new version (whole book)'}
        className={`${btnH} inline-flex items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-50`}>
        <Upload className={icon} />
      </button>

      {open && (
        <div onClick={() => !busy && setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 820, marginTop: 24, boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <Upload className="w-4 h-4 text-indigo-600" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Upload new version</div>
                <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cls?.name} · {book?.name}{chapter ? ` · ${chapter.name}` : ' · whole book'}
                </div>
              </div>
              <button onClick={() => !busy && setOpen(false)} className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* File picker */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <input type="file" accept=".zip,.html,.htm" onChange={e => { setFile(e.target.files?.[0] || null); setDry(null); setApplied(null) }} style={{ fontSize: 12, flex: 1, minWidth: 180 }} />
                <button onClick={runDryRun} disabled={busy || !file} style={{ padding: '8px 14px', borderRadius: 9, background: '#4f46e5', color: '#fff', fontWeight: 700, fontSize: 12, opacity: busy || !file ? .5 : 1 }}>
                  {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Check (dry run)'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>{chapter ? 'One ZIP or a single period HTML for this chapter.' : 'One ZIP of period HTML files for this book (≤25 MB). PDFs are ignored. Nothing is saved until you click Apply.'}</p>
              {err && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: 8, fontSize: 12 }}>{err}</div>}

              {applied && (
                <div style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, fontSize: 12 }}>
                  {applied.restoredBatch
                    ? `✅ Restored. Reverted periods: ${applied.reverted?.join(', ') || '—'}; removed: ${applied.removed?.join(', ') || '—'}.`
                    : `✅ Applied. Added: ${applied.added?.join(', ') || '—'} · Updated: ${applied.updated?.join(', ') || '—'}${applied.removed?.length ? ` · Removed: ${applied.removed.join(', ')}` : ''}.`}
                </div>
              )}

              {/* DRY-RUN preview table */}
              {dry && (
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, fontSize: 12 }}>
                    {['New', 'Update', 'Same', 'Error'].map(s => (
                      <span key={s} style={{ background: `${STATUS_COLOR[s]}1a`, color: STATUS_COLOR[s], border: `1px solid ${STATUS_COLOR[s]}55`, borderRadius: 999, padding: '2px 10px', fontWeight: 700 }}>{s}: {dry.counts[s]}</span>
                    ))}
                  </div>
                  <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11.5, minWidth: 680, width: '100%' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                          {['Status', 'Period', 'File', 'Changes', 'LO: master / loCodes / unknown', 'Old → New', 'Notes'].map(h => (
                            <th key={h} style={{ padding: '6px 8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dry.rows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                            <td style={{ padding: '6px 8px' }}><span style={{ color: STATUS_COLOR[r.status], fontWeight: 700 }}>{r.status}</span></td>
                            <td style={{ padding: '6px 8px' }}>{r.period ?? '—'}</td>
                            <td style={{ padding: '6px 8px', maxWidth: 140, wordBreak: 'break-all' }}>{r.filename}</td>
                            <td style={{ padding: '6px 8px', maxWidth: 160 }}>{(r.changes || []).join(', ') || '—'}</td>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                              {r.lo ? <span>{(r.lo.newMatchedMaster + r.lo.oldMatchedMaster)} / {(r.lo.newMatchedLoCodes + r.lo.oldMatchedLoCodes)} / <b style={{ color: r.lo.unknown?.length ? '#b45309' : '#64748b' }}>{r.lo.unknown?.length || 0}</b></span> : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', maxWidth: 220 }}>
                              {Object.entries(r.diff || {}).filter(([f]) => ['cg', 'competency', 'learningOutcomes', 'loCodesNew', 'loCodesOld'].includes(f)).map(([f, d]) => (
                                <div key={f} style={{ marginBottom: 2 }}><b>{f}:</b> <span style={{ color: '#dc2626' }}>{JSON.stringify(d.old)}</span> → <span style={{ color: '#16a34a' }}>{JSON.stringify(d.new)}</span></div>
                              )) || null}
                              {!Object.keys(r.diff || {}).length && '—'}
                            </td>
                            <td style={{ padding: '6px 8px', maxWidth: 200, color: '#b45309' }}>
                              {(r.errors || []).map((e, j) => <div key={'e' + j} style={{ color: '#dc2626' }}>⛔ {e}</div>)}
                              {(r.warnings || []).map((w, j) => <div key={'w' + j}>⚠️ {w}</div>)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Missing periods */}
                  {dry.missing?.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        <input type="checkbox" checked={removeMissing} onChange={e => { setRemoveMissing(e.target.checked); setDry(null) }} />
                        Remove periods not in this upload ({dry.missing.length}) — off by default
                      </label>
                      <div style={{ color: '#64748b', marginTop: 4 }}>In app but not in upload: {dry.missing.map(m => `P${m.period}`).join(', ')} — {removeMissing ? 'will be REMOVED (re-run Check, then confirm on Apply)' : 'kept as they are'}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                    <button onClick={() => setOpen(false)} disabled={busy} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: 13 }}>Cancel</button>
                    <button onClick={apply} disabled={busy || (dry.counts.New + dry.counts.Update === 0 && !(removeMissing && dry.missing?.length))} style={{ padding: '9px 22px', borderRadius: 10, background: '#16a34a', color: '#fff', fontWeight: 800, fontSize: 13, opacity: busy ? .6 : 1 }}>
                      {busy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Apply update'}
                    </button>
                  </div>
                </div>
              )}

              {/* VERSIONS list */}
              <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Versions ({versions.length})</div>
                {versions.length === 0 && <div style={{ fontSize: 12, color: '#64748b' }}>No uploads yet for this book.</div>}
                {versions.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #eee', borderRadius: 8, marginBottom: 6, fontSize: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 600 }}>{new Date(v.at).toLocaleString()}</div>
                      <div style={{ color: '#64748b' }}>by {v.by?.name || 'admin'} · +{(v.periodsAdded || []).length} new · {(v.periodsUpdated || []).length} updated{(v.periodsRemoved || []).length ? ` · ${v.periodsRemoved.length} removed` : ''}</div>
                    </div>
                    <button onClick={() => restoreBatch(v)} disabled={busy} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #4f46e5', color: '#4f46e5', background: '#eef2ff', fontWeight: 700, fontSize: 12 }}>Restore this upload</button>
                  </div>
                ))}
                {audit.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 11, color: '#64748b', cursor: 'pointer' }}>Audit log ({audit.length})</summary>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                      {audit.map(a => <div key={a.id}>{new Date(a.at).toLocaleString()} · {a.action} · by {a.by?.name || 'admin'}</div>)}
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
