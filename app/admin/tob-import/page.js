'use client'
// === TOB === Manual importer UI. Class+Subject once, then a preview table per
// file (type / set letter / chapter no. / term — all editable dropdowns).
// Suggestions are pre-filled; low-confidence rows are red and block Save.
// Nothing saves until "Save". Duplicates offer Replace (old → Trash).
import { useState } from 'react'

const OR = { fontFamily: '"Noto Sans Oriya",system-ui,sans-serif' }
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : '')
const post = async (p, fd) => {
  const r = await fetch('/api' + p, { method: 'POST', headers: { Authorization: 'Bearer ' + tok() }, body: fd })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status))
  return j
}
const SETS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const TERMS = [['1', 'Term 1'], ['2', 'Term 2'], ['full', 'Full Year']]

export default function TobImport() {
  const [cls, setCls] = useState('4')
  const [subject, setSubject] = useState('OD')
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [summary, setSummary] = useState(null)

  const rowBad = (r) => !r.type || (r.type === 'set' ? !r.setCode : (r.chapterNo == null || r.chapterNo === '')) || !r.term
  const anyBad = (rows || []).some(rowBad)

  const preview = async () => {
    if (!file) { setErr('Choose a ZIP first'); return }
    setBusy(true); setErr(''); setSummary(null); setRows(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('class', cls); fd.append('subject', subject)
      const j = await post('/tob/admin/import-manual/peek', fd)
      setRows((j.rows || []).map(r => ({ ...r, replace: true })))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const save = async () => {
    if (anyBad) { setErr('Fix the red rows first (pick type + set/chapter + term).'); return }
    if (!window.confirm(`Save ${rows.length} item(s) for Class ${cls} ${subject}? Existing matches (same type+set/chapter+term) will be replaced (old → Trash).`)) return
    setBusy(true); setErr(''); setSummary(null)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('class', cls); fd.append('subject', subject)
      fd.append('rows', JSON.stringify(rows.map(r => ({ fileName: r.fileName, type: r.type, setCode: r.setCode, chapterNo: r.chapterNo, term: r.term, replace: r.replace }))))
      const j = await post('/tob/admin/import-manual/commit', fd)
      setSummary(j); setRows(null)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const upd = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))

  return (
    <div style={{ ...OR, minHeight: '100vh', background: '#f8fafc', padding: '14px 12px 70px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1e1b4b', margin: '0 0 4px' }}>ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ — Fresh upload</h1>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>Class + Subject apply to the whole ZIP. Every row is editable; red rows block Save. Nothing saves until you press Save.</p>

        <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>Class</span><input value={cls} onChange={e => setCls(e.target.value)} style={{ ...inp, width: 70 }} />
          <span style={{ fontSize: 13 }}>Subject</span><input value={subject} onChange={e => setSubject(e.target.value)} style={{ ...inp, width: 120 }} />
          <input type="file" accept=".zip" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
          <button onClick={preview} disabled={busy} style={btn}>Preview</button>
        </div>

        {busy && <div style={card}>Working…</div>}
        {err && <div style={{ ...card, background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}
        {summary && (
          <div style={{ ...card, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>
            Saved — added {summary.added}, replaced {summary.replaced}, skipped {summary.skipped}.
          </div>
        )}

        {rows && (
          <>
            <div style={{ position: 'sticky', top: 0, background: '#f8fafc', padding: '6px 0', zIndex: 5 }}>
              <button onClick={save} disabled={busy || anyBad} style={{ ...btn, width: '100%', background: anyBad ? '#cbd5e1' : '#07775A' }}>
                {anyBad ? 'Fix red rows to enable Save' : `Save ${rows.length} item(s)`}
              </button>
            </div>
            <div style={{ ...card, padding: 0, overflow: 'auto' }}>
              {rows.map((r, i) => (
                <div key={r.fileName + i} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4, padding: '10px 12px', borderBottom: i < rows.length - 1 ? '1px solid #f1f5f9' : 'none', background: rowBad(r) ? '#fef2f2' : '#fff' }}>
                  <div style={{ fontSize: 12.5, color: '#0f172a', fontWeight: 600, wordBreak: 'break-word' }}>{r.fileName}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{r.title || '(no title)'} · cards {r.cardsFound} · LO {r.coverage?.covered}/{r.coverage?.total}{!r.confident && <span style={{ color: '#b91c1c', fontWeight: 800 }}> · check values</span>}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    <select value={r.type} onChange={e => upd(i, { type: e.target.value, setCode: null, chapterNo: null })} style={sel}>
                      <option value="">type…</option><option value="set">Set</option><option value="chapter">Chapter</option>
                    </select>
                    {r.type === 'set' && (
                      <select value={r.setCode || ''} onChange={e => upd(i, { setCode: e.target.value })} style={sel}>
                        <option value="">set…</option>{SETS.map(s => <option key={s} value={s}>Set {s}</option>)}
                      </select>
                    )}
                    {r.type === 'chapter' && (
                      <input type="number" min="1" placeholder="ch no." value={r.chapterNo ?? ''} onChange={e => upd(i, { chapterNo: e.target.value })} style={{ ...sel, width: 80 }} />
                    )}
                    <select value={r.term || ''} onChange={e => upd(i, { term: e.target.value })} style={sel}>
                      <option value="">term…</option>{TERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#334155' }}>
                      <input type="checkbox" checked={r.replace !== false} onChange={e => upd(i, { replace: e.target.checked })} /> Replace if exists
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const inp = { padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, background: '#fff' }
const sel = { padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12.5, background: '#fff' }
const btn = { padding: '8px 16px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 13, color: '#334155' }
