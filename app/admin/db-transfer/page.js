'use client'
// Admin "Export data to new database": copies every collection of the live database into a new
// MongoDB (e.g. Atlas) for moving to new hosting. The live database is only READ.
import { useState, useEffect, useCallback } from 'react'

const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : '')
const aapi = async (p, opts = {}) => {
  const r = await fetch('/api' + p, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok(), ...(opts.headers || {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status))
  return j
}
const box = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, marginBottom: 16 }
const inp = { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', marginTop: 4 }
const lbl = { display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginTop: 12 }
const STATUS = {
  idle: ['Not started', '#64748b'], running: ['Copying…', '#2563eb'], done: ['✅ Finished — all counts match', '#16a34a'],
  done_with_mismatch: ['⚠️ Finished, but some counts differ (run again)', '#d97706'], failed: ['❌ Failed', '#dc2626'],
}

export default function DbTransfer() {
  const [st, setSt] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ targetUrl: '', targetDb: '', password: '', confirm: '' })

  const load = useCallback(() => aapi('/admin/db-transfer').then((s) => { setSt(s); setErr('') }).catch((e) => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!st?.running) return; const t = setInterval(load, 2000); return () => clearInterval(t) }, [st?.running, load])
  useEffect(() => { if (st?.dbName && !f.targetDb) setF((x) => ({ ...x, targetDb: st.dbName })) }, [st?.dbName]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true); setErr('')
    try { setSt(await aapi('/admin/db-transfer', { method: 'POST', body: JSON.stringify(f) })); setF((x) => ({ ...x, password: '', confirm: '' })) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const rows = st?.rows || []
  const done = rows.filter((r) => r.state === 'ok' || r.state === 'mismatch').length
  const [label, color] = STATUS[st?.status || 'idle'] || STATUS.idle
  const totalSrc = rows.reduce((s, r) => s + (r.source || 0), 0)
  const totalCopied = rows.reduce((s, r) => s + (r.copied || 0), 0)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: 20, fontFamily: 'system-ui,sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
      <a href="/" style={{ color: '#2563eb', fontSize: 14 }}>← Back</a>
      <h1 style={{ fontSize: 24, margin: '10px 0 4px' }}>📦 Export data to new database</h1>
      <p style={{ color: '#475569', marginTop: 0 }}>Copies <b>all</b> data of this website (database <b>{st?.dbName || '…'}</b>) into your new MongoDB.
        This website&apos;s own data is only <b>read</b> — nothing here is changed or deleted. The new database is emptied first, so you can run it again any time (e.g. for the final copy).</p>
      {err && <div style={{ ...box, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c' }}>{err}</div>}

      <div style={box}>
        <h3 style={{ margin: 0 }}>1. New database</h3>
        <label style={lbl}>New MongoDB address (mongodb+srv://…)</label>
        <input style={inp} type="text" name="lg-target-url" autoComplete="off" spellCheck={false} placeholder="mongodb+srv://user:password@cluster.xxxxx.mongodb.net/" value={f.targetUrl} onChange={(e) => setF({ ...f, targetUrl: e.target.value })} />
        <small style={{ color: '#64748b' }}>Used only for this copy. It is not saved anywhere.</small>
        <label style={lbl}>Database name in the new MongoDB</label>
        <input style={inp} name="lg-target-db" autoComplete="off" spellCheck={false} value={f.targetDb} onChange={(e) => setF({ ...f, targetDb: e.target.value })} />
        <h3 style={{ margin: '18px 0 0' }}>2. Confirm</h3>
        <label style={lbl}>Your admin password</label>
        <input style={inp} type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <label style={lbl}>Type COPY</label>
        <input style={inp} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value.toUpperCase() })} />
        <button onClick={start} disabled={busy || st?.running || !f.targetUrl || !f.password || f.confirm !== 'COPY'}
          style={{ marginTop: 16, padding: '12px 20px', background: (busy || st?.running) ? '#94a3b8' : '#16a34a', color: '#fff', border: 0, borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
          {busy ? 'Connecting…' : st?.running ? 'Copy running…' : '📦 Start export'}
        </button>
      </div>

      <div style={box}>
        <h3 style={{ margin: 0 }}>Progress</h3>
        <p style={{ color, fontWeight: 700, margin: '8px 0' }}>{label}</p>
        {st?.target && <p style={{ margin: '4px 0', fontSize: 13, color: '#475569' }}>To: {st.target}{st.startedAt ? ` · started ${new Date(st.startedAt).toLocaleString('en-IN')}` : ''}{st.finishedAt ? ` · finished ${new Date(st.finishedAt).toLocaleString('en-IN')}` : ''}</p>}
        {st?.error && <p style={{ color: '#b91c1c', fontSize: 13 }}>{st.error}</p>}
        {rows.length > 0 && <>
          <p style={{ fontSize: 13, margin: '4px 0 10px' }}>{done} / {rows.length} collections · {totalCopied.toLocaleString('en-IN')} documents copied{st?.current ? ` · now: ${st.current}` : ''}</p>
          <div style={{ maxHeight: 460, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}><th style={{ padding: 8 }}>Collection</th><th style={{ padding: 8, textAlign: 'right' }}>Live site</th><th style={{ padding: 8, textAlign: 'right' }}>New database</th><th style={{ padding: 8 }}></th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.name} style={{ borderTop: '1px solid #f1f5f9', background: r.state === 'mismatch' ? '#fff7ed' : undefined }}>
                  <td style={{ padding: 8 }}>{r.name}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{r.source ?? '—'}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{r.target ?? (r.state === 'copying' ? r.copied : '—')}</td>
                  <td style={{ padding: 8 }}>{{ ok: '✅', mismatch: '⚠️', copying: '⏳', waiting: '' }[r.state]}</td>
                </tr>))}
                <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700 }}><td style={{ padding: 8 }}>Total</td><td style={{ padding: 8, textAlign: 'right' }}>{totalSrc.toLocaleString('en-IN')}</td><td style={{ padding: 8, textAlign: 'right' }}>{totalCopied.toLocaleString('en-IN')}</td><td></td></tr>
              </tbody>
            </table>
          </div>
        </>}
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 0 }}>You can close this page; the copy keeps running on the server. Open it again to see the result.</p>
      </div>
    </div>
  )
}
