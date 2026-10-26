'use client'
// === TOB === Admin "Delete" — filter by class+subject, tick items, Delete
// selected / Delete ALL → Trash (restorable 30 days) → Empty trash (permanent).
// Uses the existing safe delete backend (lib/tob/admin-delete.js). Deleted items
// (trashed) are hidden from teachers. Paid items (once paid mode is on) are
// blocked from deletion and offer "Hide" instead.
import { useState, useCallback, useEffect } from 'react'

const OR = { fontFamily: '"Noto Sans Oriya",system-ui,sans-serif' }
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : '')
const aapi = async (p, opts = {}) => {
  const r = await fetch('/api' + p, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok(), ...(opts.headers || {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status))
  return j
}
const od = (n) => String(n ?? '').replace(/\d/g, d => '୦୧୨୩୪୫୬୭୮୯'[d])
const label = (it) => it.type === 'set' ? `Set ${it.setCode || '?'}` : it.type === 'chapter' ? `Chapter ${it.chapterNo ?? '?'}` : it.type

export default function TobDelete() {
  const [cls, setCls] = useState('4')
  const [subject, setSubject] = useState('OD')
  const [items, setItems] = useState(null)
  const [sel, setSel] = useState({})
  const [trash, setTrash] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const loadTrash = useCallback(() => { aapi('/tob/admin/trash').then(r => setTrash(r.trash || [])).catch(() => {}) }, [])
  useEffect(() => { loadTrash() }, [loadTrash])

  const loadItems = useCallback(() => {
    setBusy(true); setErr(''); setMsg(''); setSel({})
    aapi('/tob/admin/items?class=' + encodeURIComponent(cls) + '&subject=' + encodeURIComponent(subject))
      .then(r => setItems(r.items || [])).catch(e => setErr(e.message)).finally(() => setBusy(false))
  }, [cls, subject])

  const selIds = Object.keys(sel).filter(k => sel[k])
  const buyable = (it) => it.purchasedCount > 0 // set once paid mode is on + entitlements exist

  const trashIds = async (ids, label) => {
    if (!ids.length) return
    const blocked = (items || []).filter(it => ids.includes(it.id) && buyable(it))
    if (blocked.length) { setErr(`${blocked.length} item(s) କିଣିଛନ୍ତି — delete ହେବନି. Use "Hide" instead.`); return }
    if (!window.confirm(`Delete ${ids.length} item(s)${label ? ' of ' + label : ''}? They go to Trash (restorable 30 days).`)) return
    setBusy(true); setErr(''); setMsg('')
    try { const r = await aapi('/tob/admin/trash', { method: 'POST', body: JSON.stringify({ ids }) }); setMsg(`Moved ${r.trashed} item(s) to Trash. ${r.recordsKept ? r.recordsKept + ' teacher record(s) kept.' : ''}`); loadItems(); loadTrash() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const restore = async (ids) => { setBusy(true); try { const r = await aapi('/tob/admin/restore', { method: 'POST', body: JSON.stringify({ ids }) }); setMsg(`Restored ${r.restored}.`); loadItems(); loadTrash() } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const emptyTrash = async () => {
    const ids = trash.map(t => t.id); if (!ids.length) return
    if (!window.confirm(`Permanently delete ${ids.length} trashed item(s)? This cannot be undone (teacher records are kept).`)) return
    setBusy(true); setErr('')
    try { const r = await aapi('/tob/admin/purge', { method: 'POST', body: JSON.stringify({ ids }) }); setMsg(`Permanently deleted ${r.deleted}.`); loadTrash() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ ...OR, minHeight: '100vh', background: '#f8fafc', padding: '14px 12px 70px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1e1b4b', margin: '0 0 4px' }}>ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ — Delete</h1>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>Filter by class+subject, tick items, Delete selected or ALL. Deleted → Trash (restorable 30 days), then Empty trash. Paid items can't be deleted.</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input placeholder="Class" value={cls} onChange={e => setCls(e.target.value)} style={inp} />
          <input placeholder="Subject id (OD/MATH)" value={subject} onChange={e => setSubject(e.target.value)} style={{ ...inp, width: 150 }} />
          <button onClick={loadItems} disabled={busy} style={btn}>List items</button>
        </div>

        {busy && <div style={card}>Working…</div>}
        {err && <div style={{ ...card, background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}
        {msg && <div style={{ ...card, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>{msg}</div>}

        {items && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <button onClick={() => trashIds(selIds)} disabled={busy || !selIds.length} style={{ ...btn, background: selIds.length ? '#b91c1c' : '#cbd5e1' }}>Delete selected ({selIds.length})</button>
              <button onClick={() => trashIds((items || []).map(i => i.id), `Class ${cls} ${subject}`)} disabled={busy || !items.length} style={{ ...btn, background: '#7c2d12' }}>Delete ALL ({items.length})</button>
            </div>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {items.map((it, i) => (
                <label key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 12px', borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', opacity: it.status === 'trashed' ? 0.5 : 1 }}>
                  <input type="checkbox" checked={!!sel[it.id]} onChange={e => setSel(s => ({ ...s, [it.id]: e.target.checked }))} disabled={it.status === 'trashed'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#0f172a', wordBreak: 'break-word' }}>
                      <b>{label(it)}</b> · {it.title || '(no title)'}
                      {buyable(it) && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e' }}>କିଣିଛନ୍ତି — Hide only</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>type {it.type} · term {it.term ?? '—'} · {it.status}</div>
                  </div>
                </label>
              ))}
              {!items.length && <div style={{ padding: 14, color: '#64748b' }}>No items for this class+subject.</div>}
            </div>
          </>
        )}

        {/* Trash */}
        <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Trash ({trash.length})</span>
            {trash.length > 0 && <button onClick={emptyTrash} disabled={busy} style={{ ...btn, background: '#111827', padding: '6px 12px' }}>Empty trash</button>}
          </div>
          {trash.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: i < trash.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: 12.5 }}>
              <div>
                <div style={{ color: '#0f172a' }}>{label(t)} · {t.title}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Class {t.class} {t.subject_id} · {od(t.daysLeft)} day(s) left</div>
              </div>
              <button onClick={() => restore([t.id])} disabled={busy} style={{ ...btn, background: '#0f766e', padding: '6px 12px' }}>Restore</button>
            </div>
          ))}
          {!trash.length && <div style={{ padding: 12, color: '#94a3b8', fontSize: 12.5 }}>Trash is empty.</div>}
        </div>
      </div>
    </div>
  )
}

const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, width: 90, background: '#fff' }
const btn = { padding: '8px 16px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 13, color: '#334155' }
