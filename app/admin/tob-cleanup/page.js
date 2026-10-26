'use client'
// === TOB === Admin "Clean-up plan" — PROPOSES one keeper per card and lists
// rows that would be UNPUBLISHED (status→draft, never deleted). Shows the plan;
// changes NOTHING until you press "Apply". Every apply has one-click Undo.
import { useState, useCallback, useEffect } from 'react'

const OR = { fontFamily: '"Noto Sans Oriya",system-ui,sans-serif' }
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : '')
const aapi = async (p, opts = {}) => {
  const r = await fetch('/api' + p, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok(), ...(opts.headers || {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status))
  return j
}
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toISOString().slice(0, 10) } catch { return '—' } }
const base = (k) => (k ? String(k).split('/').pop() : '—')

export default function TobCleanup() {
  const [cls, setCls] = useState('4')
  const [subject, setSubject] = useState('OD')
  const [plan, setPlan] = useState(null)
  const [sel, setSel] = useState({})       // itemId -> true (to unpublish)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [batches, setBatches] = useState([])

  const loadBatches = useCallback(() => { aapi('/tob/admin/cleanup-batches').then(r => setBatches(r.batches || [])).catch(() => {}) }, [])
  useEffect(() => { loadBatches() }, [loadBatches])

  const loadPlan = useCallback(() => {
    setBusy(true); setErr(''); setMsg(''); setPlan(null)
    const qs = []
    if (cls) qs.push('class=' + encodeURIComponent(cls))
    if (subject) qs.push('subject=' + encodeURIComponent(subject))
    aapi('/tob/admin/cleanup-plan' + (qs.length ? '?' + qs.join('&') : ''))
      .then(p => { setPlan(p); const s = {}; (p.autoUnpublishIds || []).forEach(id => { s[id] = true }); setSel(s) })
      .catch(e => setErr(e.message)).finally(() => setBusy(false))
  }, [cls, subject])

  const selectedIds = Object.keys(sel).filter(id => sel[id])

  const apply = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`Unpublish ${selectedIds.length} row(s)? They become DRAFT (never deleted) and can be undone with one click.`)) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await aapi('/tob/admin/cleanup-apply', { method: 'POST', body: JSON.stringify({ itemIds: selectedIds }) })
      setMsg(`Unpublished ${r.unpublished} row(s). Batch ${r.batchId?.slice(0, 8)} — use Undo below to revert.`)
      loadBatches(); loadPlan()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const undo = async (batchId) => {
    if (!window.confirm('Undo this clean-up batch? All its rows are re-published.')) return
    setBusy(true); setErr('')
    try { const r = await aapi('/tob/admin/cleanup-undo', { method: 'POST', body: JSON.stringify({ batchId }) }); setMsg(`Restored ${r.restored} row(s).`); loadBatches(); if (plan) loadPlan() }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ ...OR, minHeight: '100vh', background: '#f8fafc', padding: '14px 12px 70px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1e1b4b', margin: '0 0 4px' }}>ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ — Clean-up plan</h1>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
          Proposes ONE keeper per card (newest import; identical copies collapse). Nothing changes until you press Apply. Unpublish = status draft (never deleted); one-click Undo.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input placeholder="Class" value={cls} onChange={e => setCls(e.target.value)} style={inp} />
          <input placeholder="Subject id (OD/MATH)" value={subject} onChange={e => setSubject(e.target.value)} style={{ ...inp, width: 160 }} />
          <button onClick={loadPlan} disabled={busy} style={btn}>Build plan</button>
        </div>

        {busy && <div style={card}>Working…</div>}
        {err && <div style={{ ...card, background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}
        {msg && <div style={{ ...card, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>{msg}</div>}

        {plan && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8, marginBottom: 12 }}>
              <Stat n={plan.counts.cards} label="Cards (keep)" />
              <Stat n={plan.counts.autoUnpublish} label="Identical copies" danger={plan.counts.autoUnpublish > 0} />
              <Stat n={plan.counts.review} label="Different — review" warn={plan.counts.review > 0} />
            </div>

            <div style={{ position: 'sticky', top: 0, zIndex: 5, background: '#f8fafc', padding: '6px 0', marginBottom: 6 }}>
              <button onClick={apply} disabled={busy || !selectedIds.length} style={{ ...btn, width: '100%', background: selectedIds.length ? '#b91c1c' : '#cbd5e1' }}>
                Apply — unpublish {selectedIds.length} selected row(s)
              </button>
            </div>

            {plan.cards.map(c => (
              <div key={c.cardKey} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '9px 12px', background: '#eef2ff', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#3730a3' }}>{c.cardKey}</div>
                <div style={{ padding: '8px 12px', borderBottom: c.others.length ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: '#dbeafe', color: '#1e40af', height: 'fit-content' }}>KEEP</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                      <div style={{ color: '#0f172a', wordBreak: 'break-word' }}>{c.keep.title}</div>
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>{base(c.keep.fileKey)} · #{c.keep.contentHash || 'n/a'} · imported {fmtDate(c.keep.importedAt)} (newest)</div>
                    </div>
                  </div>
                </div>
                {c.others.map((o, i) => (
                  <label key={o.itemId} style={{ display: 'flex', gap: 8, alignItems: 'start', padding: '8px 12px', borderBottom: i < c.others.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', background: o.relation === 'different' ? '#fffbeb' : '#fff' }}>
                    <input type="checkbox" checked={!!sel[o.itemId]} onChange={e => setSel(s => ({ ...s, [o.itemId]: e.target.checked }))} style={{ marginTop: 3 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                      <div style={{ color: '#0f172a', wordBreak: 'break-word' }}>
                        {o.title}
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: o.relation === 'identical' ? '#fee2e2' : '#fde68a', color: o.relation === 'identical' ? '#b91c1c' : '#92400e' }}>
                          {o.relation === 'identical' ? 'identical copy' : 'different content — review'}
                        </span>
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>{base(o.fileKey)} · #{o.contentHash || 'n/a'} · imported {fmtDate(o.importedAt)}</div>
                    </div>
                  </label>
                ))}
              </div>
            ))}
            {!plan.cards.length && <div style={card}>No published cards found for this class+subject.</div>}
          </>
        )}

        {/* recent batches / undo */}
        {batches.length > 0 && (
          <div style={{ ...card, padding: 0, overflow: 'hidden', marginTop: 16 }}>
            <div style={{ padding: '9px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700 }}>Recent clean-up batches</div>
            {batches.map(b => (
              <div key={b.batchId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: 12.5 }}>
                <div>
                  <div style={{ color: '#0f172a' }}>{b.batchId?.slice(0, 8)} · {(b.items || []).length} row(s) · {fmtDate(b.at)}</div>
                  <div style={{ fontSize: 11, color: b.undone ? '#16a34a' : '#64748b' }}>{b.undone ? 'undone (restored)' : 'applied (draft)'}</div>
                </div>
                {!b.undone && <button onClick={() => undo(b.batchId)} disabled={busy} style={{ ...btn, background: '#0f766e', padding: '6px 12px' }}>Undo</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, width: 90, background: '#fff' }
const btn = { padding: '8px 16px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 13, color: '#334155' }

function Stat({ n, label, danger, warn }) {
  return (
    <div style={{ background: danger ? '#fef2f2' : warn ? '#fffbeb' : '#fff', border: `1px solid ${danger ? '#fecaca' : warn ? '#fde68a' : '#e2e8f0'}`, borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: danger ? '#b91c1c' : warn ? '#92400e' : '#1e1b4b' }}>{n}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
    </div>
  )
}
