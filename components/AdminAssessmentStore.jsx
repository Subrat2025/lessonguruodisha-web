'use client'
// ============================================================================
//  🛒 AdminAssessmentStore — Assessment Store (ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର) admin console.
//  Prompt 2: Catalog, chunked Cloudinary uploads, price mgmt (+history),
//  coupons, orders (read-only), settings & CSV import. assess_* only.
// ============================================================================
import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, Upload, Trash2, Plus, RefreshCw, Save, Eye, FileUp, Tag, Settings as SettingsIcon, ShoppingBag, IndianRupee, Ticket, History, UserCheck, Fingerprint, Check, X, BarChart3, ShieldAlert, Lock, Unlock } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { OATH_DEFAULTS } from '@/lib/assess-oath-defaults'

const api = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const inr = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN')
const fmtBytes = (b) => !b ? '—' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1024).toFixed(0) + ' KB'

// ---- Chunked upload helper (base64, ~512KB chunks) ----
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const uuid4 = () => (crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 0x3 | 0x8)).toString(16) }))

// Direct signed chunked upload: browser → Cloudinary. Server only signs + records.
// `ctrl` = { paused:bool, cancelled:bool } is checked between chunks for Pause/Resume.
async function directCloudinaryUpload(file, meta, { onProgress, ctrl } = {}) {
  const kind = /\.zip$/i.test(file.name) ? 'zip' : 'pdf'
  const sig = await api('/admin/assess/upload-signature', { method: 'POST', body: { file_name: file.name, class: meta.class, subject: meta.subject, kind } })
  const CHUNK = 6 * 1024 * 1024
  const total = file.size
  const uid = uuid4()
  let start = 0, cloudResp = null
  while (start < total) {
    if (ctrl?.cancelled) throw new Error('Cancelled')
    while (ctrl?.paused) { await sleep(400); if (ctrl?.cancelled) throw new Error('Cancelled') }
    const end = Math.min(start + CHUNK, total)
    const blob = file.slice(start, end)
    const fd = new FormData()
    fd.append('file', blob)
    fd.append('api_key', sig.api_key)
    fd.append('timestamp', String(sig.timestamp))
    fd.append('signature', sig.signature)
    fd.append('public_id', sig.public_id)
    fd.append('folder', sig.folder)
    fd.append('type', sig.type)
    fd.append('tags', sig.tags)
    let attempt = 0, ok = false, resp
    while (attempt < 3 && !ok) {
      try {
        const r = await fetch(sig.upload_url, { method: 'POST', headers: { 'X-Unique-Upload-Id': uid, 'Content-Range': `bytes ${start}-${end - 1}/${total}` }, body: fd })
        resp = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(resp?.error?.message || `Chunk failed (${r.status})`)
        ok = true
      } catch (e) { attempt++; if (attempt >= 3) throw e; await sleep(1000 * attempt) }
    }
    if (end >= total) cloudResp = resp
    start = end
    onProgress && onProgress(Math.min(99, Math.round(end / total * 100)))
  }
  const complete = await api('/admin/assess/upload-complete', { method: 'POST', body: {
    public_id: cloudResp.public_id, version: cloudResp.version, bytes: cloudResp.bytes,
    resource_type: cloudResp.resource_type, format: cloudResp.format, kind,
    file_name: file.name, class: meta.class, subject: meta.subject, doc_type: meta.doc_type,
    replace: meta.replace, extract_zip: meta.extract_zip, is_free_sample: meta.is_free_sample,
  } })
  onProgress && onProgress(100)
  return { kind, complete }
}


const SUBTABS = [
  ['overview', 'Overview', ShoppingBag],
  ['catalog', 'Catalog', FileUp],
  ['upload', 'Uploads', Upload],
  ['pricing', 'Packs & Pricing', IndianRupee],
  ['coupons', 'Coupons', Ticket],
  ['orders', 'Orders', Tag],
  ['teachers', 'Teachers', UserCheck],
  ['trace', 'Leak Trace', Fingerprint],
  ['security', 'Security', ShieldAlert],
  ['oaths', 'Oath Log', Check],
  ['analytics', 'Analytics', BarChart3],
  ['settings', 'Settings', SettingsIcon],
]

const AdminAssessmentStore = () => {
  const [sub, setSub] = useState('overview')
  const [secOpen, setSecOpen] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () => api('/admin/assess/security?status=open').then(r => { if (alive) setSecOpen(r.open_count || 0) }).catch(() => {})
    load(); const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🛒</span>
        <div>
          <h2 className="text-xl font-black text-indigo-900">Assessment Store — ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର</h2>
          <p className="text-xs text-slate-500">Prompt 2 · Catalog, uploads, pricing, coupons, orders & settings</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUBTABS.map(([k, label, Icon]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`relative flex items-center gap-1.5 text-sm font-bold rounded-full px-3.5 py-1.5 border transition ${sub === k ? 'bg-indigo-900 text-white border-indigo-900' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
            {k === 'security' && secOpen > 0 && <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black">{secOpen}</span>}
          </button>
        ))}
      </div>
      {sub === 'overview' && <Overview />}
      {sub === 'catalog' && <Catalog />}
      {sub === 'upload' && <Uploads />}
      {sub === 'pricing' && <Pricing />}
      {sub === 'coupons' && <Coupons />}
      {sub === 'orders' && <Orders />}
      {sub === 'teachers' && <Teachers />}
      {sub === 'trace' && <Trace />}
      {sub === 'security' && <Security onChange={() => api('/admin/assess/security?status=open').then(r => setSecOpen(r.open_count || 0)).catch(() => {})} />}
      {sub === 'oaths' && <OathLog />}
      {sub === 'analytics' && <Analytics />}
      {sub === 'settings' && <SettingsTab />}
    </div>
  )
}

// ---------------------------------------------------------------- Overview
const Overview = () => {
  const [s, setS] = useState(null)
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState(null)
  const [seeding, setSeeding] = useState(false)
  const [bundleOrders, setBundleOrders] = useState(null) // null = closed; [] = open
  const [boLoading, setBoLoading] = useState(false)
  const openBundleOrders = async () => {
    setBundleOrders([]); setBoLoading(true)
    try { const r = await api('/admin/assess/bundle-orders'); setBundleOrders(r.orders || []) }
    catch (e) { toast.error(e.message); setBundleOrders(null) } finally { setBoLoading(false) }
  }
  const load = useCallback(async () => {
    setLoading(true)
    try { setS(await api('/admin/assess/overview')) } catch (e) { toast.error(e.message) } finally { setLoading(false) }
    try { setHealth(await api('/admin/assess/health')) } catch (e) { /* non-fatal */ }
  }, [])
  useEffect(() => { load() }, [load])
  const seedBundles = async () => {
    if (!window.confirm('Seed bundle child links (additive — adds missing only, deletes nothing)?')) return
    setSeeding(true)
    try { const r = await api('/admin/assess/bundles/seed', { method: 'POST', body: {} }); toast.success('Bundles seeded'); console.log('seed report', r.report); load() }
    catch (e) { toast.error(e.message) } finally { setSeeding(false) }
  }
  if (loading) return <Spinner />
  if (!s) return <div className="p-8 text-center text-gray-500">Failed to load overview data. Please refresh.</div>
  const cells = [
    ['Documents', s.docs, 'text-indigo-900'], ['With file', s.docsWithFile, 'text-emerald-600'],
    ['Missing file', s.docsMissingFile, 'text-rose-600'], ['Free samples', s.freeSamples, 'text-emerald-600'],
    ['Packs', s.packs, 'text-indigo-900'], ['Active packs', s.activePacks, 'text-emerald-600'],
    ['Coupons', s.coupons, 'text-amber-600'], ['Orders', s.orders, 'text-indigo-900'],
    ['Paid orders', s.paidOrders, 'text-emerald-600'], ['Revenue', inr(s.revenue_inr), 'text-emerald-700'],
  ]
  const bwc = health?.bundles_without_children_count ?? null
  const zdo = health?.paid_orders_zero_docs_count ?? null
  const healthBad = (bwc || 0) > 0 || (zdo || 0) > 0
  return (
    <div>
      <div className="flex justify-end gap-2 mb-2">
        <Button size="sm" variant="outline" onClick={openBundleOrders}>📦 Bundle orders</Button>
        <Button size="sm" variant="outline" onClick={seedBundles} disabled={seeding}>{seeding ? 'Seeding…' : '🔗 Seed bundle links'}</Button>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
      </div>
      {health && (
        <div className={`mb-3 rounded-lg border p-3 ${healthBad ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'}`}>
          <div className="font-black text-[13px] mb-1">{healthBad ? '⚠️ Store health — action needed' : '✅ Store health — all good'}</div>
          <div className="grid sm:grid-cols-2 gap-2 text-[12.5px]">
            <div className={(bwc || 0) > 0 ? 'text-rose-700 font-bold' : 'text-slate-600'}>
              Bundles without child links: <b>{bwc ?? '—'}</b>
              {(bwc || 0) > 0 && <div className="text-[11px]">{(health.bundles_without_children || []).join(', ')} — click “Seed bundle links”.</div>}
            </div>
            <div className={(zdo || 0) > 0 ? 'text-rose-700 font-bold' : 'text-slate-600'}>
              Paid orders resolving to 0 documents: <b>{zdo ?? '—'}</b>
              {(zdo || 0) > 0 && <div className="text-[11px]">{(health.paid_orders_zero_docs || []).slice(0, 6).map(o => `${o.pack_code} (${o.mobile || '—'})`).join(', ')}</div>}
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cells.map(([l, v, c]) => (
          <Card key={l} className="p-3">
            <div className="text-[11px] uppercase font-bold text-slate-400">{l}</div>
            <div className={`text-2xl font-black ${c}`}>{v}</div>
          </Card>
        ))}
      </div>
      <ImportPanel onDone={load} />
      {bundleOrders !== null && (
        <Modal onClose={() => setBundleOrders(null)} title="Paid bundle / school orders — live document count">
          {boLoading ? <Spinner /> : bundleOrders.length === 0 ? <p className="text-sm text-slate-400">No paid bundle/school orders.</p> : (
            <div className="overflow-auto max-h-[60vh] border rounded-lg">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-slate-100"><tr className="text-left">
                  <th className="p-2">Date</th><th className="p-2">Buyer</th><th className="p-2">Pack</th><th className="p-2">Docs</th><th className="p-2">₹</th>
                </tr></thead>
                <tbody>
                  {bundleOrders.map((o, i) => (
                    <tr key={o.id || i} className={`border-t ${o.doc_count === 0 ? 'bg-rose-50' : ''}`}>
                      <td className="p-2 whitespace-nowrap">{o.paid_at ? new Date(o.paid_at).toLocaleDateString('en-IN') : '—'}</td>
                      <td className="p-2">{o.user_name || '—'}<div className="text-[10px] text-slate-400">{o.user_mobile || ''}</div></td>
                      <td className="p-2">{o.pack_code}</td>
                      <td className={`p-2 font-black ${o.doc_count === 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{o.doc_count}{o.doc_count === 0 ? ' ⚠️' : ''}</td>
                      <td className="p-2">{o.is_manual ? <Badge variant="outline">manual</Badge> : inr(o.amount_inr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!boLoading && <p className="text-[11px] text-slate-400 mt-2">Rows in red resolve to 0 documents — click “🔗 Seed bundle links”.</p>}
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- CSV Import
const parseCsv = (txt) => {
  const lines = txt.replace(/\r/g, '').split('\n').filter(l => l.trim().length)
  const splitRow = (line) => {
    const out = []; let cur = ''; let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
      else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur); return out
  }
  const headers = splitRow(lines[0]).map(h => h.trim())
  return lines.slice(1).map(line => {
    const cells = splitRow(line); const o = {}
    headers.forEach((h, i) => { o[h] = (cells[i] ?? '').trim() }); return o
  })
}
const ImportPanel = ({ onDone }) => {
  const [busy, setBusy] = useState(false)
  const doImport = async (kind, file) => {
    if (!file) return
    setBusy(true)
    try {
      const rows = parseCsv(await file.text())
      const ep = kind === 'packs' ? '/admin/assess/import/packs' : '/admin/assess/import/catalog'
      const r = await api(ep, { method: 'POST', body: { rows } })
      toast.success(`Imported: ${r.created} new, ${r.updated} updated${r.links != null ? `, ${r.links} links` : ''}`)
      onDone && onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Card className="p-4 mt-4">
      <div className="font-bold text-sm mb-2 flex items-center gap-1.5"><FileUp className="w-4 h-4" /> CSV Import {busy && <Loader2 className="w-4 h-4 animate-spin" />}</div>
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div className="border rounded-lg p-3">
          <div className="font-bold mb-1">Price list (packs)</div>
          <p className="text-slate-500 mb-2">Columns: pack_code, pack_name, pack_type, includes, mrp_inr, sale_price_inr, is_active, note</p>
          <input type="file" accept=".csv" disabled={busy} onChange={e => doImport('packs', e.target.files[0])} />
        </div>
        <div className="border rounded-lg p-3">
          <div className="font-bold mb-1">Catalog (documents)</div>
          <p className="text-slate-500 mb-2">Columns: file_name, class, subject, doc_type, pages, set_b, is_free_sample, subject_pack, class_pack</p>
          <input type="file" accept=".csv" disabled={busy} onChange={e => doImport('catalog', e.target.files[0])} />
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- Catalog
// Bulk release-date setter (filter by class/subject/type/term → set/clear release_at)
const BulkRelease = ({ facets, onDone }) => {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ class: '', subject: '', doc_type: '', term: '' })
  const [dt, setDt] = useState('')
  const [count, setCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const filter = () => Object.fromEntries(Object.entries(f).filter(([, v]) => v))
  const doPreview = async () => {
    setBusy(true)
    try { setCount((await api('/admin/assess/bulk-release', { method: 'POST', body: { filter: filter(), preview: true } })).count) }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const apply = async (clear) => {
    if (!clear && !dt) { toast.error('Pick a date/time first'); return }
    if (!confirm(clear ? 'Clear release date (make available now) for matching documents?' : `Set release date to ${dt} (IST) for matching documents?`)) return
    setBusy(true)
    try {
      const r = await api('/admin/assess/bulk-release', { method: 'POST', body: { filter: filter(), release_at: clear ? null : new Date(dt).toISOString(), clear } })
      toast.success(`Updated ${r.affected} document(s)`); setCount(null); onDone && onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Card className="p-3 mb-3 border-2 border-indigo-200">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-[13px] font-black text-indigo-900">
        <span>📅 Bulk release dates (exam scheduling)</span><span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2 items-end">
            <Sel label="Class" value={f.class} onChange={v => setF({ ...f, class: v })} opts={facets?.classes || []} />
            <Sel label="Subject" value={f.subject} onChange={v => setF({ ...f, subject: v })} opts={facets?.subjects || []} />
            <Sel label="Type" value={f.doc_type} onChange={v => setF({ ...f, doc_type: v })} opts={facets?.doc_types || []} />
            <div><Label className="text-[11px]">Term/keyword</Label><Input className="h-8 w-32" value={f.term} onChange={e => setF({ ...f, term: e.target.value })} placeholder="e.g. Answer Key" /></div>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div><Label className="text-[11px]">Release at (IST)</Label><Input type="datetime-local" className="h-8" value={dt} onChange={e => setDt(e.target.value)} /></div>
            <Button size="sm" variant="outline" onClick={doPreview} disabled={busy}>Preview count</Button>
            <Button size="sm" onClick={() => apply(false)} disabled={busy} className="bg-indigo-700">Set date</Button>
            <Button size="sm" variant="outline" onClick={() => apply(true)} disabled={busy}>Clear (available now)</Button>
          </div>
          {count !== null && <p className="text-[12px] font-bold text-indigo-700">{count} document(s) match this filter.</p>}
          <p className="text-[10px] text-slate-400">Tip: schedule Answer Keys for a later date (e.g. exam day) by filtering Type/keyword “Answer Key”. New documents default to available immediately.</p>
        </div>
      )}
    </Card>
  )
}

const Catalog = () => {
  const [data, setData] = useState({ documents: [], total: 0, facets: { classes: [], subjects: [], doc_types: [] } })
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState({ class: '', subject: '', doc_type: '', has_file: '', q: '' })
  const [edit, setEdit] = useState(null)
  const [preview, setPreview] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v) })
      params.set('limit', '300')
      setData(await api(`/admin/assess/documents?${params.toString()}`))
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [f])
  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      await api(`/admin/assess/documents/${edit.id}`, { method: 'PUT', body: edit })
      toast.success('Saved'); setEdit(null); load()
    } catch (e) { toast.error(e.message) }
  }
  const del = async (id) => {
    if (!confirm('Delete this document (and its Cloudinary file)?')) return
    try { await api(`/admin/assess/documents/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load() } catch (e) { toast.error(e.message) }
  }
  const showPreview = async (docu) => {
    try { const r = await api(`/admin/assess/documents/${docu.id}/preview`); setPreview({ ...r, docu }) } catch (e) { toast.error(e.message) }
  }

  return (
    <div>
      <BulkRelease facets={data.facets} onDone={load} />
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <Sel label="Class" value={f.class} onChange={v => setF({ ...f, class: v })} opts={data.facets.classes} />
        <Sel label="Subject" value={f.subject} onChange={v => setF({ ...f, subject: v })} opts={data.facets.subjects} />
        <Sel label="Type" value={f.doc_type} onChange={v => setF({ ...f, doc_type: v })} opts={data.facets.doc_types} />
        <Sel label="File" value={f.has_file} onChange={v => setF({ ...f, has_file: v })} opts={[{ v: 'yes', l: 'Uploaded' }, { v: 'no', l: 'Missing' }]} raw />
        <div><Label className="text-[11px]">Search</Label><Input className="h-8 w-44" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="title / file name" /></div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>
      <div className="text-xs text-slate-500 mb-2">{data.total} documents</div>
      {loading ? <Spinner /> : (
        <div className="overflow-auto border rounded-lg max-h-[62vh]">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-slate-100"><tr className="text-left">
              <th className="p-2">Title / File</th><th className="p-2">Class</th><th className="p-2">Subject</th><th className="p-2">Type</th><th className="p-2">Pages</th><th className="p-2">File</th><th className="p-2">Free</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {data.documents.map(dc => (
                <tr key={dc.id} className="border-t hover:bg-slate-50">
                  <td className="p-2"><div className="font-bold leading-tight">{dc.title_or}</div><div className="text-[10px] text-slate-400">{dc.file_name}</div></td>
                  <td className="p-2">{dc.class}</td><td className="p-2">{dc.subject}</td><td className="p-2">{dc.doc_type}</td><td className="p-2">{dc.pages || '—'}</td>
                  <td className="p-2">{dc.cld_public_id ? <Badge className="bg-emerald-600">{fmtBytes(dc.bytes)}</Badge> : <Badge variant="outline" className="text-rose-500">none</Badge>}</td>
                  <td className="p-2">{dc.is_free_sample ? <Badge className="bg-emerald-600">free</Badge> : '—'}</td>
                  <td className="p-2 whitespace-nowrap">
                    {dc.cld_public_id && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => showPreview(dc)}><Eye className="w-3.5 h-3.5" /></Button>}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit({ ...dc, release_at: dc.release_at ? String(dc.release_at).slice(0, 10) : '' })}>✏️</Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={() => del(dc.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <Modal onClose={() => setEdit(null)} title="Edit document">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Fld label="Title (Odia)" span2><Input value={edit.title_or || ''} onChange={e => setEdit({ ...edit, title_or: e.target.value })} /></Fld>
            <Fld label="File name" span2><Input value={edit.file_name || ''} onChange={e => setEdit({ ...edit, file_name: e.target.value })} /></Fld>
            <Fld label="Class"><Input value={edit.class || ''} onChange={e => setEdit({ ...edit, class: e.target.value })} /></Fld>
            <Fld label="Subject"><Input value={edit.subject || ''} onChange={e => setEdit({ ...edit, subject: e.target.value })} /></Fld>
            <Fld label="Doc type"><Input value={edit.doc_type || ''} onChange={e => setEdit({ ...edit, doc_type: e.target.value })} /></Fld>
            <Fld label="Pages"><Input type="number" value={edit.pages || 0} onChange={e => setEdit({ ...edit, pages: e.target.value })} /></Fld>
            <Fld label="Release date"><Input type="date" value={edit.release_at || ''} onChange={e => setEdit({ ...edit, release_at: e.target.value })} /></Fld>
            <Fld label="Exam window note"><Input value={edit.exam_window_note || ''} onChange={e => setEdit({ ...edit, exam_window_note: e.target.value })} /></Fld>
            <div className="flex items-center gap-2"><Switch checked={!!edit.is_free_sample} onCheckedChange={v => setEdit({ ...edit, is_free_sample: v })} /><span className="text-xs font-bold">Free sample</span></div>
            <div className="flex items-center gap-2"><Switch checked={!!edit.set_b} onCheckedChange={v => setEdit({ ...edit, set_b: v })} /><span className="text-xs font-bold">Set B</span></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}><Save className="w-4 h-4 mr-1" />Save</Button></div>
        </Modal>
      )}
      {preview && (
        <Modal onClose={() => setPreview(null)} title={preview.docu.title_or}>
          {preview.thumb_url && <img src={preview.thumb_url} alt="preview" className="max-h-[50vh] mx-auto border rounded" />}
          {preview.download_url && <a href={preview.download_url} target="_blank" rel="noopener noreferrer" className="block text-center mt-3 text-sm font-bold text-indigo-700 underline">Open signed file ↗</a>}
          <p className="text-[11px] text-slate-400 mt-2 text-center">Signed link valid ~15 min. Master file is not public.</p>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Uploads
const MAX_BYTES = 10 * 1024 * 1024
const cleanClassName = (s) => String(s || '').replace(/^\d+[_\-\s]*/, '').replace(/_/g, ' ').trim()
const detectFromPath = (path) => {
  const parts = String(path || '').split('/').filter(Boolean)
  return {
    class: parts.length >= 3 ? cleanClassName(parts[parts.length - 3]) : '',
    subject: parts.length >= 2 ? parts[parts.length - 2].replace(/_/g, ' ').trim() : '',
  }
}

const Uploads = () => {
  const [meta, setMeta] = useState({ class: '', subject: '', doc_type: '', is_free_sample: false, replace: false })
  const [queue, setQueue] = useState([])   // {name,path,size,blob?,zipEntry?,cls,subj,status,progress,error,note}
  const [running, setRunning] = useState(false)
  const [scanning, setScanning] = useState(false)
  const queueRef = React.useRef([])
  const ctrlRef = React.useRef({ paused: false, cancelled: false })
  queueRef.current = queue

  const patch = (i, p) => setQueue(q => q.map((x, idx) => idx === i ? { ...x, ...p } : x))

  // Warn before closing the tab while uploading.
  useEffect(() => {
    const h = (e) => { if (running) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [running])

  const onFiles = async (files) => {
    setScanning(true)
    const items = []
    for (const file of Array.from(files)) {
      if (/\.zip$/i.test(file.name)) {
        try {
          const JSZip = (await import('jszip')).default
          const zip = await JSZip.loadAsync(file)
          zip.forEach((relPath, entry) => {
            if (entry.dir) return
            const base = relPath.split('/').pop()
            if (relPath.includes('__MACOSX') || base.startsWith('.') || !/\.pdf$/i.test(base)) return
            const det = detectFromPath(relPath)
            items.push({ name: base, path: relPath, size: entry._data?.uncompressedSize || 0, zipEntry: entry, cls: det.class, subj: det.subject, status: 'queued', progress: 0 })
          })
        } catch (e) { toast.error(`Could not open ${file.name}: ${e.message}`) }
      } else if (/\.pdf$/i.test(file.name)) {
        items.push({ name: file.name, path: file.name, size: file.size, blob: file, cls: '', subj: '', status: 'queued', progress: 0 })
      } else {
        toast.error(`${file.name}: only PDF/ZIP allowed`)
      }
    }
    setQueue(q => [...q, ...items])
    setScanning(false)
    if (items.length) toast.success(`${items.length} PDF(s) found`)
  }

  const uploadItem = async (i) => {
    const item = queueRef.current[i]
    if (!item || item.status === 'done') return
    patch(i, { status: 'uploading', error: null, progress: 0 })
    try {
      let blob = item.blob
      if (!blob && item.zipEntry) blob = await item.zipEntry.async('blob')
      if (!blob) throw new Error('No file data')
      if (blob.size > MAX_BYTES) { patch(i, { status: 'error', error: 'ଫାଇଲ୍ ୧୦ MB ରୁ ବଡ଼ — Cloudinary ସୀମା' }); return }
      const file = new File([blob], item.name, { type: 'application/pdf' })
      const { complete } = await directCloudinaryUpload(file, {
        class: item.cls || meta.class, subject: item.subj || meta.subject, doc_type: meta.doc_type,
        is_free_sample: meta.is_free_sample, replace: meta.replace,
      }, { onProgress: (p) => patch(i, { progress: p }), ctrl: ctrlRef.current })
      if (complete.skipped) patch(i, { status: 'done', progress: 100, note: 'Skipped (duplicate)' })
      else patch(i, { status: 'done', progress: 100, note: complete.matched ? 'Matched to catalog' : complete.created ? 'Added new document' : 'Uploaded' })
    } catch (e) {
      if (e.code === 'NO_CATALOG_MATCH' || /catalog match/i.test(e.message)) patch(i, { status: 'error', error: 'Not in catalog — set Class/Subject' })
      else patch(i, { status: 'error', error: e.message || 'Failed' })
    }
  }

  // Upload with a concurrency of 3.
  const runAll = async () => {
    ctrlRef.current.cancelled = false; ctrlRef.current.paused = false
    setRunning(true)
    const idxs = queueRef.current.map((x, i) => i).filter(i => !['done'].includes(queueRef.current[i].status))
    let cursor = 0
    const worker = async () => {
      while (cursor < idxs.length) {
        if (ctrlRef.current.cancelled) return
        const myIdx = idxs[cursor++]
        await uploadItem(myIdx)
      }
    }
    await Promise.all([worker(), worker(), worker()])
    setRunning(false)
    const fails = queueRef.current.filter(x => x.status === 'error').length
    if (fails) toast.error(`Finished with errors: ${fails} failed`); else toast.success('All uploads complete')
  }

  const togglePauseAll = () => { ctrlRef.current.paused = !ctrlRef.current.paused; setRunning(r => r); setQueue(q => [...q]) }

  const doneCount = queue.filter(x => x.status === 'done').length
  const failCount = queue.filter(x => x.status === 'error').length
  const allSettled = queue.length > 0 && queue.every(x => ['done', 'error'].includes(x.status))
  const pending = queue.filter(x => !['done'].includes(x.status)).length

  const badge = (x) => {
    const map = {
      queued: ['bg-slate-100 text-slate-500', 'Queued'], uploading: ['bg-indigo-100 text-indigo-700', `Uploading ${x.progress}%`],
      done: ['bg-emerald-100 text-emerald-700', x.note || 'Done ✓'], error: ['bg-rose-100 text-rose-700', 'Failed ✗'],
    }
    const [cls, label] = map[x.status] || ['bg-slate-100', x.status]
    return <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${cls}`}>{label}</span>
  }

  return (
    <Card className="p-4">
      <div className="grid sm:grid-cols-4 gap-3 mb-3">
        <Fld label="Class (fallback)"><Input value={meta.class} onChange={e => setMeta({ ...meta, class: e.target.value })} placeholder="auto from ZIP path" /></Fld>
        <Fld label="Subject (fallback)"><Input value={meta.subject} onChange={e => setMeta({ ...meta, subject: e.target.value })} placeholder="auto from ZIP path" /></Fld>
        <Fld label="Doc type (optional)"><Input value={meta.doc_type} onChange={e => setMeta({ ...meta, doc_type: e.target.value })} placeholder="FA-1 / SA-1 / HPC" /></Fld>
        <div className="flex flex-col gap-1 pt-4">
          <label className="flex items-center gap-2 text-xs font-bold"><Switch checked={meta.is_free_sample} onCheckedChange={v => setMeta({ ...meta, is_free_sample: v })} />Free sample</label>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 mb-3 text-xs font-bold">
        <label className="flex items-center gap-2"><Switch checked={meta.replace} onCheckedChange={v => setMeta({ ...meta, replace: v })} />Replace duplicates</label>
      </div>
      <label className="block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:bg-slate-50">
        <Upload className="w-6 h-6 mx-auto text-slate-400 mb-1" />
        <div className="text-sm font-bold">{scanning ? 'Reading ZIP…' : 'Choose PDF or ZIP files'}</div>
        <div className="text-[11px] text-slate-400">ZIPs are <b>unzipped in your browser</b>; each PDF (&lt;10&nbsp;MB) uploads directly to Cloudinary, 3 at a time, auto-matched to the catalog. ZIPs are never stored in Cloudinary.</div>
        <input type="file" multiple accept=".pdf,.zip" className="hidden" onChange={e => { onFiles(e.target.files); e.target.value = '' }} />
      </label>
      {queue.length > 0 && (
        <div className="mt-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[12px] font-bold">
              {allSettled ? (failCount ? <span className="text-rose-600">Finished with errors: {failCount} failed</span> : <span className="text-emerald-600">Upload batch finished ✓ ({doneCount})</span>) : running ? <span className="text-indigo-600">Uploading {doneCount}/{queue.length}{ctrlRef.current.paused ? ' (paused)' : ''}</span> : `${queue.length} PDF(s) queued`}
            </span>
            <div className="flex gap-2">
              {running && <Button variant="outline" size="sm" onClick={togglePauseAll}>{ctrlRef.current.paused ? 'Resume' : 'Pause'}</Button>}
              <Button variant="outline" size="sm" disabled={running} onClick={() => setQueue([])}>Clear</Button>
              {failCount > 0 && !running && <Button variant="outline" size="sm" className="text-rose-600" onClick={runAll}>Retry failed</Button>}
              <Button size="sm" disabled={running || pending === 0} onClick={runAll}>{running ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}Upload {pending}</Button>
            </div>
          </div>
          {running && <p className="text-[11px] text-amber-600 mb-2">⚠️ ଅପଲୋଡ୍ ଚାଲିଛି — ଏହି ଟାବ୍ ବନ୍ଦ କରନ୍ତୁ ନାହିଁ</p>}
          <div className="max-h-[52vh] overflow-auto space-y-1.5">
            {queue.map((x, i) => (
              <div key={i} className="flex items-center gap-2 text-xs border rounded-lg p-2">
                <span className="flex-1 truncate"><b>{x.name}</b> {x.cls ? <span className="text-slate-400">· {x.cls}/{x.subj}</span> : null} <span className="text-slate-400 font-normal">{x.size ? fmtBytes(x.size) : ''}</span>{x.error ? <span className="text-rose-500 block">{x.error}</span> : null}</span>
                <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${x.progress}%` }} /></div>
                {badge(x)}
                {x.status === 'error' && !running && <button onClick={() => uploadItem(i)} className="text-rose-600 font-bold">Retry</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Pricing
const Pricing = () => {
  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(null)
  const [creating, setCreating] = useState(false)
  const [history, setHistory] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setPacks((await api('/admin/assess/packs')).packs || []) } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    try {
      if (creating) await api('/admin/assess/packs', { method: 'POST', body: edit })
      else await api(`/admin/assess/packs/${edit.id}`, { method: 'PUT', body: edit })
      toast.success('Saved'); setEdit(null); setCreating(false); load()
    } catch (e) { toast.error(e.message) }
  }
  const del = async (id) => {
    if (!confirm('Delete this pack?')) return
    try { await api(`/admin/assess/packs/${id}`, { method: 'DELETE' }); toast.success('Deleted'); load() } catch (e) { toast.error(e.message) }
  }
  const showHistory = async (pack) => {
    try { const r = await api(`/admin/assess/price-history?pack_id=${pack.id}`); setHistory({ pack, rows: r.history }) } catch (e) { toast.error(e.message) }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="text-xs text-slate-500">{packs.length} packs</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
          <Button size="sm" onClick={() => { setCreating(true); setEdit({ pack_type: 'subject', is_active: true, mrp_inr: 0, sale_price_inr: 0 }) }}><Plus className="w-4 h-4 mr-1" />New pack</Button>
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-auto border rounded-lg max-h-[62vh]">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-slate-100"><tr className="text-left">
              <th className="p-2">Pack</th><th className="p-2">Type</th><th className="p-2">MRP</th><th className="p-2">Sale</th><th className="p-2">Offer</th><th className="p-2">%</th><th className="p-2">Active</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {packs.map(p => (
                <tr key={p.id} className="border-t hover:bg-slate-50">
                  <td className="p-2"><div className="font-bold">{p.pack_name}</div><div className="text-[10px] text-slate-400">{p.pack_code}</div></td>
                  <td className="p-2">{p.pack_type}</td>
                  <td className="p-2">{inr(p.mrp_inr)}</td>
                  <td className="p-2 font-bold text-rose-600">{p.is_free ? 'FREE' : inr(p.sale_price_inr)}</td>
                  <td className="p-2">{p.offer_price_inr != null ? inr(p.offer_price_inr) : '—'}</td>
                  <td className="p-2">{p.discount_pct || 0}%</td>
                  <td className="p-2">{p.is_active ? <Badge className="bg-emerald-600">on</Badge> : <Badge variant="outline">off</Badge>}</td>
                  <td className="p-2 whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => showHistory(p)}><History className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setCreating(false); setEdit({ ...p, offer_start: p.offer_start ? String(p.offer_start).slice(0, 16) : '', offer_end: p.offer_end ? String(p.offer_end).slice(0, 16) : '' }) }}>✏️</Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={() => del(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <Modal onClose={() => { setEdit(null); setCreating(false) }} title={creating ? 'New pack' : 'Edit pack'}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {creating && <Fld label="Pack code"><Input value={edit.pack_code || ''} onChange={e => setEdit({ ...edit, pack_code: e.target.value })} /></Fld>}
            <Fld label="Pack name" span2={!creating}><Input value={edit.pack_name || ''} onChange={e => setEdit({ ...edit, pack_name: e.target.value })} /></Fld>
            <Fld label="Type">
              <select className="w-full h-9 border rounded-md px-2" value={edit.pack_type || 'subject'} onChange={e => setEdit({ ...edit, pack_type: e.target.value })}>
                {['subject', 'class', 'bundle', 'school', 'single'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Fld>
            <Fld label="MRP ₹"><Input type="number" value={edit.mrp_inr ?? 0} onChange={e => setEdit({ ...edit, mrp_inr: e.target.value })} /></Fld>
            <Fld label="Sale ₹"><Input type="number" value={edit.sale_price_inr ?? 0} onChange={e => setEdit({ ...edit, sale_price_inr: e.target.value })} /></Fld>
            <Fld label="Sort order"><Input type="number" value={edit.sort_order ?? 0} onChange={e => setEdit({ ...edit, sort_order: e.target.value })} /></Fld>
            <Fld label="Includes text" span2><Textarea rows={2} value={edit.includes_text || ''} onChange={e => setEdit({ ...edit, includes_text: e.target.value })} /></Fld>
            <div className="col-span-2 border-t pt-2 text-[11px] font-black uppercase text-slate-400">Time-boxed offer (optional)</div>
            <Fld label="Offer ₹"><Input type="number" value={edit.offer_price_inr ?? ''} onChange={e => setEdit({ ...edit, offer_price_inr: e.target.value })} placeholder="blank = none" /></Fld>
            <Fld label="Offer label"><Input value={edit.offer_label || ''} onChange={e => setEdit({ ...edit, offer_label: e.target.value })} /></Fld>
            <Fld label="Offer start"><Input type="datetime-local" value={edit.offer_start || ''} onChange={e => setEdit({ ...edit, offer_start: e.target.value })} /></Fld>
            <Fld label="Offer end"><Input type="datetime-local" value={edit.offer_end || ''} onChange={e => setEdit({ ...edit, offer_end: e.target.value })} /></Fld>
            <div className="flex items-center gap-2 col-span-2"><Switch checked={edit.is_active !== false} onCheckedChange={v => setEdit({ ...edit, is_active: v })} /><span className="text-xs font-bold">Active (visible in store)</span></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => { setEdit(null); setCreating(false) }}>Cancel</Button><Button onClick={save}><Save className="w-4 h-4 mr-1" />Save</Button></div>
        </Modal>
      )}
      {history && (
        <Modal onClose={() => setHistory(null)} title={`Price history — ${history.pack.pack_name}`}>
          {history.rows.length === 0 ? <p className="text-sm text-slate-400">No price changes recorded.</p> : (
            <div className="space-y-2 text-xs max-h-[50vh] overflow-auto">
              {history.rows.map(h => (
                <div key={h.id} className="border rounded-lg p-2">
                  <div className="text-slate-400">{new Date(h.at).toLocaleString('en-IN')} · {h.changed_by_name}</div>
                  <div>MRP {inr(h.old.mrp_inr)} → <b>{inr(h.new.mrp_inr)}</b> · Sale {inr(h.old.sale_price_inr)} → <b>{inr(h.new.sale_price_inr)}</b></div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Coupons
const Coupons = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(null)
  const [creating, setCreating] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows((await api('/admin/assess/coupons')).coupons || []) } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const save = async () => {
    try {
      if (creating) await api('/admin/assess/coupons', { method: 'POST', body: edit })
      else await api(`/admin/assess/coupons/${edit.id}`, { method: 'PUT', body: edit })
      toast.success('Saved'); setEdit(null); setCreating(false); load()
    } catch (e) { toast.error(e.message) }
  }
  const del = async (id) => { if (!confirm('Delete coupon?')) return; try { await api(`/admin/assess/coupons/${id}`, { method: 'DELETE' }); load() } catch (e) { toast.error(e.message) } }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <div className="text-xs text-slate-500">{rows.length} coupons</div>
        <Button size="sm" onClick={() => { setCreating(true); setEdit({ type: 'percent', value: 10, applies_to: 'all', is_active: true }) }}><Plus className="w-4 h-4 mr-1" />New coupon</Button>
      </div>
      {loading ? <Spinner /> : (
        <div className="overflow-auto border rounded-lg max-h-[62vh]">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-slate-100"><tr className="text-left">
              <th className="p-2">Code</th><th className="p-2">Type</th><th className="p-2">Value</th><th className="p-2">Applies</th><th className="p-2">Used</th><th className="p-2">Valid till</th><th className="p-2">Active</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-black">{c.code}</td>
                  <td className="p-2">{c.type}</td>
                  <td className="p-2">{c.type === 'percent' ? `${c.value}%` : inr(c.value)}</td>
                  <td className="p-2 text-[11px]">{c.applies_to}{c.pack_codes?.length ? ` (${c.pack_codes.join(',')})` : ''}{c.pack_types?.length ? ` (${c.pack_types.join(',')})` : ''}</td>
                  <td className="p-2">{c.used_count || 0}{c.max_uses ? `/${c.max_uses}` : ''}</td>
                  <td className="p-2">{c.valid_till ? new Date(c.valid_till).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="p-2">{c.is_active ? <Badge className="bg-emerald-600">on</Badge> : <Badge variant="outline">off</Badge>}</td>
                  <td className="p-2 whitespace-nowrap">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setCreating(false); setEdit({ ...c, valid_from: c.valid_from ? String(c.valid_from).slice(0, 10) : '', valid_till: c.valid_till ? String(c.valid_till).slice(0, 10) : '' }) }}>✏️</Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={() => del(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Modal onClose={() => { setEdit(null); setCreating(false) }} title={creating ? 'New coupon' : 'Edit coupon'}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Fld label="Code"><Input value={edit.code || ''} disabled={!creating} onChange={e => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Fld>
            <Fld label="Type">
              <select className="w-full h-9 border rounded-md px-2" value={edit.type} onChange={e => setEdit({ ...edit, type: e.target.value })}>
                <option value="percent">percent</option><option value="flat">flat ₹</option>
              </select>
            </Fld>
            <Fld label="Value"><Input type="number" value={edit.value ?? 0} onChange={e => setEdit({ ...edit, value: e.target.value })} /></Fld>
            <Fld label="Min order ₹"><Input type="number" value={edit.min_order_inr ?? 0} onChange={e => setEdit({ ...edit, min_order_inr: e.target.value })} /></Fld>
            <Fld label="Applies to">
              <select className="w-full h-9 border rounded-md px-2" value={edit.applies_to} onChange={e => setEdit({ ...edit, applies_to: e.target.value })}>
                <option value="all">all</option><option value="pack_codes">specific codes</option><option value="pack_type">pack type</option>
              </select>
            </Fld>
            <Fld label="Max uses (0=∞)"><Input type="number" value={edit.max_uses ?? 0} onChange={e => setEdit({ ...edit, max_uses: e.target.value })} /></Fld>
            {edit.applies_to === 'pack_codes' && <Fld label="Pack codes (comma)" span2><Input value={(edit.pack_codes || []).join(',')} onChange={e => setEdit({ ...edit, pack_codes: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></Fld>}
            {edit.applies_to === 'pack_type' && <Fld label="Pack types (comma)" span2><Input value={(edit.pack_types || []).join(',')} onChange={e => setEdit({ ...edit, pack_types: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></Fld>}
            <Fld label="Valid from"><Input type="date" value={edit.valid_from || ''} onChange={e => setEdit({ ...edit, valid_from: e.target.value })} /></Fld>
            <Fld label="Valid till"><Input type="date" value={edit.valid_till || ''} onChange={e => setEdit({ ...edit, valid_till: e.target.value })} /></Fld>
            <div className="flex items-center gap-2 col-span-2"><Switch checked={edit.is_active !== false} onCheckedChange={v => setEdit({ ...edit, is_active: v })} /><span className="text-xs font-bold">Active</span></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => { setEdit(null); setCreating(false) }}>Cancel</Button><Button onClick={save}><Save className="w-4 h-4 mr-1" />Save</Button></div>
        </Modal>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Orders
const Orders = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState({ status: '', q: '' })
  const [grant, setGrant] = useState(null) // {user_mobile, pack_code, reason, packQuery}
  const [packs, setPacks] = useState([])
  const [access, setAccess] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f.status) params.set('status', f.status); if (f.q) params.set('q', f.q)
      setRows((await api(`/admin/assess/orders?${params.toString()}`)).orders || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [f])
  useEffect(() => { load() }, [load])
  useEffect(() => { api('/admin/assess/packs').then(r => setPacks(r.packs || [])).catch(() => {}) }, [])
  const doGrant = async () => {
    if (!grant.pack_code) { toast.error('Select a pack'); return }
    try {
      const r = await api('/admin/assess/grant', { method: 'POST', body: { user_mobile: grant.user_mobile, pack_code: grant.pack_code, reason: grant.reason } })
      toast.success(r.already_owned ? 'User already owns this pack' : 'Access granted')
      setGrant(null); load()
    } catch (e) { toast.error(e.message) }
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <Sel label="Status" value={f.status} onChange={v => setF({ ...f, status: v })} opts={[{ v: 'paid', l: 'Paid' }, { v: 'created', l: 'Created' }, { v: 'failed', l: 'Failed' }]} raw />
        <div><Label className="text-[11px]">Search</Label><Input className="h-8 w-48" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="name / mobile / pack / order id" /></div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
        <Button size="sm" onClick={() => setGrant({ user_mobile: '', pack_code: '', reason: 'compensation — bundle bug', packQuery: '' })}><Plus className="w-4 h-4 mr-1" />Grant access manually</Button>
      </div>
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
        <span className="text-base leading-none">💸</span>
        <span><b>Refund =</b> Razorpay dashboard → then <b>Revoke access</b> here. <span className="text-amber-700/80">(Refunding money does not auto-remove access — open the buyer under Security → “Trace a leaked copy” and click <b>Revoke access</b>.)</span></span>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-slate-400">No orders yet.</p> : (
        <div className="overflow-auto border rounded-lg max-h-[62vh]">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-slate-100"><tr className="text-left">
              <th className="p-2">Date</th><th className="p-2">User</th><th className="p-2">Pack</th><th className="p-2">Amount</th><th className="p-2">Via</th><th className="p-2">Status</th><th className="p-2">Order id</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={o.id || i} className="border-t">
                  <td className="p-2">{o.paid_at ? new Date(o.paid_at).toLocaleString('en-IN') : (o.created_at ? new Date(o.created_at).toLocaleString('en-IN') : '—')}</td>
                  <td className="p-2">{o.user_name || '—'}<div className="text-[10px] text-slate-400">{o.user_mobile || ''}</div></td>
                  <td className="p-2">{o.pack_code || '—'}</td>
                  <td className="p-2 font-bold">{inr(o.amount_inr)}{o.coupon_code ? <div className="text-[10px] text-emerald-600">{o.coupon_code}</div> : null}</td>
                  <td className="p-2">{o.payment_provider || '—'}</td>
                  <td className="p-2">{o.status === 'paid' ? <Badge className="bg-emerald-600">paid</Badge> : o.status === 'failed' ? <Badge variant="outline" className="text-rose-500">failed</Badge> : <Badge variant="outline">{o.status}</Badge>}</td>
                  <td className="p-2 text-[10px]">{o.razorpay_order_id || o.id || '—'}</td>
                  <td className="p-2">{(o.user_mobile || o.user_id) && <Button size="sm" variant="outline" className="h-7" onClick={() => setAccess({ mobile: o.user_mobile, userId: o.user_id })}>Check access</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {access && <CheckAccessModal mobile={access.mobile} userId={access.userId} onClose={() => setAccess(null)} />}
      {grant && (() => {
        const selected = packs.find(p => p.pack_code === grant.pack_code)
        const qq = (grant.packQuery || '').toLowerCase().trim()
        const matches = qq
          ? packs.filter(p => `${p.pack_name} ${p.pack_code}`.toLowerCase().includes(qq)).slice(0, 12)
          : []
        return (
        <Modal onClose={() => setGrant(null)} title="Grant access manually (WhatsApp/offline)">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Fld label="User mobile (registered)" span2><Input value={grant.user_mobile} onChange={e => setGrant({ ...grant, user_mobile: e.target.value })} placeholder="10-digit mobile" /></Fld>
            <Fld label="Pack" span2>
              {selected ? (
                <div className="flex items-center justify-between gap-2 border rounded-md px-3 py-2 bg-emerald-50 border-emerald-300">
                  <span className="text-[12.5px] font-semibold">{selected.pack_name} <span className="text-slate-500">({selected.pack_code})</span> — ₹{selected.sale_price_inr ?? selected.mrp_inr ?? 0}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-rose-500" onClick={() => setGrant({ ...grant, pack_code: '', packQuery: '' })}>Change</Button>
                </div>
              ) : (
                <>
                  <Input value={grant.packQuery} onChange={e => setGrant({ ...grant, packQuery: e.target.value })} placeholder="Search pack name or code…" />
                  {matches.length > 0 && (
                    <div className="mt-1 max-h-48 overflow-auto border rounded-md divide-y">
                      {matches.map(p => (
                        <button key={p.pack_code} type="button" className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-[12.5px]"
                          onClick={() => setGrant({ ...grant, pack_code: p.pack_code, packQuery: '' })}>
                          <span className="font-semibold">{p.pack_name}</span> <span className="text-slate-500">({p.pack_code})</span> — ₹{p.sale_price_inr ?? p.mrp_inr ?? 0}
                          {['bundle', 'school'].includes(p.pack_type) ? <span className="ml-1 text-[10px] text-indigo-600">bundle</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                  {qq && matches.length === 0 && <div className="text-[11px] text-slate-400 mt-1">No matching pack</div>}
                </>
              )}
            </Fld>
            <Fld label="Reason (saved with the order)" span2><Input value={grant.reason} onChange={e => setGrant({ ...grant, reason: e.target.value })} placeholder="e.g. compensation — bundle bug" /></Fld>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Manual grants are recorded as ₹0 and are excluded from sales totals.</p>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setGrant(null)}>Cancel</Button><Button onClick={doGrant} disabled={!grant.pack_code || !grant.user_mobile}><Save className="w-4 h-4 mr-1" />Grant</Button></div>
        </Modal>
        )
      })()}
    </div>
  )
}

// ---------------------------------------------------------------- Teachers
const Teachers = () => {
  const [rows, setRows] = useState([])
  const [pending, setPending] = useState(0)
  const [pendingDistricts, setPendingDistricts] = useState([])
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState({ status: 'pending', q: '' })
  const [access, setAccess] = useState(null)
  const [bulkDistrict, setBulkDistrict] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (f.status) params.set('status', f.status); if (f.q) params.set('q', f.q)
      const r = await api(`/admin/assess/teachers?${params.toString()}`)
      setRows(r.teachers || []); setPending(r.pending_count || 0); setPendingDistricts(r.pending_districts || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [f])
  useEffect(() => { load() }, [load])
  const act = async (id, action) => {
    try {
      const body = action === 'reject' ? { reason: prompt('Reason (optional)') || 'Not verified' } : {}
      await api(`/admin/assess/teachers/${id}/${action}`, { method: 'POST', body })
      toast.success(action === 'approve' ? 'Approved' : 'Rejected'); load()
    } catch (e) { toast.error(e.message) }
  }
  const bulkApprove = async () => {
    const label = bulkDistrict ? `all pending teachers in "${bulkDistrict}"` : 'ALL pending teachers'
    if (!confirm(`Approve ${label}?`)) return
    try {
      const r = await api('/admin/assess/teachers/approve-pending', { method: 'POST', body: bulkDistrict ? { district: bulkDistrict } : {} })
      toast.success(`Approved ${r.approved} teacher(s)`); setBulkDistrict(''); load()
    } catch (e) { toast.error(e.message) }
  }
  const exportCsv = () => {
    const cols = ['Name', 'School', 'District', 'Block', 'Cluster', 'UDISE', 'Employee ID/Teacher Code', 'Mobile', 'WhatsApp Code', 'Status']
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const lines = [cols.join(',')]
    for (const t of rows) {
      lines.push([
        t.name_en || t.name || '', t.school_en || t.school || '', t.district || '', t.block || '',
        t.cluster || '', t.udise || '', t.employee_id || '', t.mobile || t.user_mobile || '',
        t.verify_code || '', t.status || '',
      ].map(esc).join(','))
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `teachers-${f.status || 'all'}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <Sel label="Status" value={f.status} onChange={v => setF({ ...f, status: v })} opts={[{ v: 'pending', l: 'Pending' }, { v: 'approved', l: 'Approved' }, { v: 'rejected', l: 'Rejected' }]} raw />
        <div><Label className="text-[11px]">Search</Label><Input className="h-8 w-48" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="name / school / mobile / district / cluster / emp id" /></div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}><Save className="w-3.5 h-3.5 mr-1" />CSV</Button>
        {pending > 0 && <Badge className="bg-amber-500">{pending} pending</Badge>}
      </div>
      {pending > 0 && (
        <div className="flex flex-wrap items-end gap-2 mb-3 p-2.5 rounded-lg border bg-amber-50">
          <div>
            <Label className="text-[11px]">Bulk approve pending</Label>
            <select className="block h-8 border rounded-md px-2 text-sm min-w-[160px]" value={bulkDistrict} onChange={e => setBulkDistrict(e.target.value)}>
              <option value="">All districts</option>
              {pendingDistricts.map(dd => <option key={dd} value={dd}>{dd}</option>)}
            </select>
          </div>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={bulkApprove}><Check className="w-4 h-4 mr-1" />Approve {bulkDistrict ? `"${bulkDistrict}"` : 'all pending'}</Button>
        </div>
      )}
      {loading ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-slate-400">No teacher profiles.</p> : (
        <div className="overflow-auto border rounded-lg max-h-[62vh]">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-slate-100"><tr className="text-left">
              <th className="p-2">Name</th><th className="p-2">School</th><th className="p-2">District</th><th className="p-2">Block</th><th className="p-2">Cluster</th><th className="p-2">UDISE</th><th className="p-2">Emp ID / Code</th><th className="p-2">Mobile</th><th className="p-2">WA code</th><th className="p-2">Status</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id} className="border-t hover:bg-slate-50">
                  <td className="p-2"><div className="font-bold">{t.name_en || t.name || '—'}</div>{t.user_email ? <div className="text-[10px] text-slate-400">{t.user_email}</div> : null}</td>
                  <td className="p-2">{t.school_en || t.school || '—'}</td>
                  <td className="p-2">{t.district || '—'}</td>
                  <td className="p-2">{t.block || '—'}</td>
                  <td className="p-2">{t.cluster || '—'}</td>
                  <td className="p-2 text-[11px]">{t.udise || '—'}</td>
                  <td className="p-2 text-[11px]">{t.employee_id || '—'}</td>
                  <td className="p-2 text-[11px]">{t.mobile || t.user_mobile || '—'}</td>
                  <td className="p-2">{t.verify_code ? <span className="font-mono font-bold text-indigo-700">{t.verify_code}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="p-2">{t.status === 'approved' ? <Badge className="bg-emerald-600">approved</Badge> : t.status === 'rejected' ? <Badge variant="outline" className="text-rose-500">rejected</Badge> : <Badge className="bg-amber-500">pending</Badge>}</td>
                  <td className="p-2 whitespace-nowrap">
                    {t.status !== 'approved' && <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => act(t.id, 'approve')}><Check className="w-4 h-4" /></Button>}
                    {t.status !== 'rejected' && <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-500" onClick={() => act(t.id, 'reject')}><X className="w-4 h-4" /></Button>}
                    <Button size="sm" variant="outline" className="h-7 ml-1" onClick={() => setAccess({ mobile: t.user_mobile, userId: t.user_id })}>Access</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {access && <CheckAccessModal mobile={access.mobile} userId={access.userId} onClose={() => setAccess(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------- Leak Trace
const Trace = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [hit, setHit] = useState(null) // exact copy_id result

  const isCopyId = (v) => /^[A-Za-z0-9]{8}$/.test(String(v).trim())
  const search = async () => {
    setLoading(true); setHit(null)
    try {
      const term = q.trim()
      if (isCopyId(term)) {
        // Precise leak trace: copy_id printed on the PDF → exact buyer.
        const r = await api(`/admin/assess/trace?copy_id=${encodeURIComponent(term.toUpperCase())}`)
        setHit(r)
        setRows([])
      } else {
        const params = new URLSearchParams()
        if (term) params.set('q', term)
        const r = await api(`/admin/assess/downloads?${params.toString()}`)
        setRows(r.downloads || [])
      }
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  const toggleBlock = async (block) => {
    const uid = hit?.buyer?.id; if (!uid) return
    if (block && !window.confirm('Block this teacher and REVOKE access to all their purchased packs? They will be unable to download or view until unblocked.')) return
    const reason = block ? (window.prompt('Reason (saved in logs):', 'Leaked copy ' + hit.copy_id) || '') : ''
    try {
      const r = await api('/admin/assess/block-user', { method: 'POST', body: { user_id: uid, block, reason } })
      toast.success(block ? `Blocked · ${r.orders_revoked} order(s) revoked` : `Unblocked · ${r.orders_restored} order(s) restored`)
      search()
    } catch (e) { toast.error(e.message) }
  }
  useEffect(() => { search() }, []) // eslint-disable-line
  return (
    <div>
      <div className="flex gap-2 items-end mb-3">
        <div><Label className="text-[11px]">Copy ID (from PDF) · or name / mobile / title</Label><Input className="h-8 w-80" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="e.g. A1B2C3D4" /></div>
        <Button size="sm" onClick={search}><Fingerprint className="w-4 h-4 mr-1" />Trace</Button>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">Every personal PDF is stamped with a unique <b>Copy ID</b> (footer + metadata). Paste the Copy ID from a leaked file to find the exact buyer, or search by name/mobile/title.</p>

      {loading && <Spinner />}

      {/* Exact copy_id result */}
      {!loading && hit && (
        hit.found ? (
          <Card className="p-4 mb-3 border-2 border-emerald-500">
            <div className="flex items-center gap-2 mb-2"><Fingerprint className="w-4 h-4 text-emerald-600" /><span className="font-black text-emerald-700">Buyer found · Copy ID {hit.copy_id}</span></div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
              <div><span className="text-slate-400">Name (account):</span> <b>{hit.buyer?.name || '—'}</b></div>
              <div><span className="text-slate-400">Mobile:</span> <b>{hit.buyer?.mobile || '—'}</b></div>
              <div><span className="text-slate-400">Email:</span> <b>{hit.buyer?.email || '—'}</b></div>
              <div><span className="text-slate-400">User ID:</span> <span className="font-mono text-[11px]">{hit.buyer?.id || '—'}</span></div>
              <div><span className="text-slate-400">Licence name (EN):</span> <b>{hit.profile?.name_en || hit.profile?.name || '—'}</b></div>
              <div><span className="text-slate-400">School:</span> <b>{hit.profile?.school_en || hit.profile?.school || '—'}</b></div>
              <div><span className="text-slate-400">District/Block:</span> {hit.profile?.district || '—'}{hit.profile?.block ? ' / ' + hit.profile.block : ''}</div>
              <div><span className="text-slate-400">Verification:</span> {hit.profile?.status || '—'}</div>
              <div><span className="text-slate-400">Order:</span> <span className="font-mono text-[11px]">{hit.order?.id || hit.copies?.[0]?.order_id || '—'}</span> {hit.order?.pack_code ? `· ${hit.order.pack_code}` : ''}</div>
              <div><span className="text-slate-400">Admin test copy:</span> {hit.copies?.[0]?.admin_test ? 'YES' : 'No'}</div>
              <div className="sm:col-span-2"><span className="text-slate-400">Oath:</span> {hit.copies?.[0]?.oath_accepted_at ? <b className="text-emerald-700">accepted on {new Date(hit.copies[0].oath_accepted_at).toLocaleString('en-IN')} by “{hit.copies[0].oath_typed_name || '—'}”</b> : <span className="text-slate-400">—</span>}</div>
            </div>
            {hit.copies?.length > 0 && (
              <div className="mt-3 overflow-auto border rounded-lg">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-100"><tr className="text-left"><th className="p-2">When</th><th className="p-2">Copy ID</th><th className="p-2">Document</th><th className="p-2">Via</th><th className="p-2">Device</th></tr></thead>
                  <tbody>{hit.copies.map((cp, i) => (
                    <tr key={cp.copy_id + i} className="border-t">
                      <td className="p-2">{new Date(cp.at).toLocaleString('en-IN')}</td>
                      <td className="p-2 font-black">{cp.copy_id}</td>
                      <td className="p-2">{cp.document_title || cp.pack_code || '—'}</td>
                      <td className="p-2">{cp.via || 'single'}</td>
                      <td className="p-2 font-mono text-[10px]">{cp.device_id || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap">
              {hit.buyer?.assess_blocked
                ? (<><Badge className="bg-rose-600">🚫 BLOCKED</Badge><Button size="sm" variant="outline" onClick={() => toggleBlock(false)}><RefreshCw className="w-4 h-4 mr-1" />Unblock + restore access</Button></>)
                : (<Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={() => toggleBlock(true)}><X className="w-4 h-4 mr-1" />Block account + revoke access</Button>)}
              <span className="text-[11px] text-slate-400">Blocking stops all downloads/views and revokes paid access. Reversible.</span>
            </div>
          </Card>
        ) : (
          <Card className="p-4 mb-3 border-2 border-amber-400"><span className="font-bold text-amber-700">No copy found for Copy ID “{hit.copy_id}”.</span> <span className="text-slate-500 text-[12px]">It may predate the new stamping, or the code was mis-read.</span></Card>
        )
      )}

      {/* Generic search results */}
      {!loading && !hit && (rows.length === 0 ? <p className="text-sm text-slate-400">No matching records.</p> : (
        <div className="overflow-auto border rounded-lg max-h-[62vh]">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-slate-100"><tr className="text-left">
              <th className="p-2">When</th><th className="p-2">Copy ID</th><th className="p-2">Buyer</th><th className="p-2">Document</th><th className="p-2">Mode</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{new Date(r.at).toLocaleString('en-IN')}</td>
                  <td className="p-2 font-black">{r.copy_id || r.trace_code || '—'}</td>
                  <td className="p-2">{r.user_name || '—'}<div className="text-[10px] text-slate-400">{r.user_mobile} · {r.user_email}</div></td>
                  <td className="p-2">{r.document_title || r.document_id}</td>
                  <td className="p-2">{r.mode === 'view' ? 'view' : (r.watermarked ? 'download (wm)' : 'download')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Settings
// Trace a leaked copy — manual copy_id OR upload a leaked PDF/photo.
const TraceLeak = () => {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [note, setNote] = useState('')
  const lookup = async () => {
    if (!code.trim()) { toast.error('Enter a copy_id'); return }
    setBusy(true); setRes(null)
    try { setRes(await api('/admin/assess/trace?copy_id=' + encodeURIComponent(code.trim()))) } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const onFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const isImg = /image\//.test(file.type)
    const max = isImg ? 5 : 10
    if (file.size > max * 1024 * 1024) { toast.error(`File too large (max ${max} MB)`); return }
    setBusy(true); setRes(null)
    try {
      const b64 = await new Promise((rs, rj) => { const r = new FileReader(); r.onload = () => rs(r.result); r.onerror = rj; r.readAsDataURL(file) })
      const r = await api('/admin/assess/trace-upload', { method: 'POST', body: { kind: isImg ? 'image' : 'pdf', file_base64: b64 } })
      if (r.needs_manual) { toast.message(r.message || 'Enter copy_id manually') }
      else { setRes(r); if (r.copy_id) setCode(r.copy_id) }
    } catch (e) { toast.error(e.message) } finally { setBusy(false); e.target.value = '' }
  }
  const act = async (action, uid) => {
    if (!uid) return
    if ((action === 'revoke_order') && !confirm('Revoke access & lock this user?')) return
    try {
      const body = { user_id: uid, action }
      if (action === 'add_note') { if (!note.trim()) { toast.error('Type a note'); return } body.note = note; body.copy_id = res?.copy_id }
      if (action === 'revoke_order') body.order_id = res?.order?.id
      await api('/admin/assess/security/action', { method: 'POST', body })
      toast.success('Done'); if (action === 'add_note') setNote('')
    } catch (e) { toast.error(e.message) }
  }
  const p = res
  return (
    <Card className="p-3 mb-3 border-2 border-rose-200">
      <div className="font-black text-rose-800 text-[13px] mb-2 flex items-center gap-1.5"><Fingerprint className="w-4 h-4" /> Trace a leaked copy</div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="copy_id (e.g. LG-XXXX-XXXX)" className="h-8 w-48" />
        <Button size="sm" onClick={lookup} disabled={busy}>Lookup</Button>
        <label className="text-[12px] font-bold border rounded-md px-2 py-1.5 cursor-pointer bg-slate-50">📄 Upload leaked PDF/photo<input type="file" accept=".pdf,image/*" className="hidden" onChange={onFile} /></label>
        <span className="text-[10px] text-slate-400">PDF≤10MB · photo≤5MB · file not stored</span>
      </div>
      {p && (
        <div className="mt-3 border-t pt-2 text-[12px] space-y-1">
          {!p.found ? <div className="text-rose-600 font-bold">copy_id {p.copy_id}: no matching buyer found.</div> : (
            <>
              <div><b>copy_id:</b> {p.copy_id} · <span className={p.buyer?.assess_download_lock?.locked || p.buyer?.assess_blocked ? 'text-rose-600 font-bold' : 'text-emerald-600'}>{p.buyer?.assess_download_lock?.locked || p.buyer?.assess_blocked ? '🔒 locked' : 'active'}</span></div>
              <div><b>Teacher:</b> {p.profile?.name || p.buyer?.name} ({p.profile?.name_en || '—'}) · 📱 {p.buyer?.mobile}</div>
              <div><b>School:</b> {p.profile?.school || '—'} · UDISE {p.profile?.udise || '—'} · {p.profile?.district || ''}</div>
              {p.order && <div><b>Order:</b> {p.order.id} · ₹{p.order.amount_inr ?? p.order.amount ?? '—'} · {p.order.status}</div>}
              {(p.copies || []).slice(0, 3).map((c, i) => <div key={i} className="text-[11px] text-slate-500">⬇ {c.document_title || c.via} · {c.at ? new Date(c.at).toLocaleString('en-IN') : ''} {c.oath_accepted_at ? '· oath ' + new Date(c.oath_accepted_at).toLocaleDateString('en-IN') : ''}</div>)}
              {(p.downloads || []).slice(0, 2).map((c, i) => <div key={'d' + i} className="text-[11px] text-slate-400">IP {c.ip || '—'} · dev {(c.device_id || '—').slice(0, 10)} · {c.at ? new Date(c.at).toLocaleString('en-IN') : ''}</div>)}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act('keep', p.buyer?.id)}><Lock className="w-3 h-3 mr-1" />Lock user</Button>
                <Button size="sm" className="h-7 text-[11px] bg-rose-600" onClick={() => act('revoke_order', p.buyer?.id)}>Revoke access</Button>
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Add note…" className="h-7 text-[11px] w-40" />
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => act('add_note', p.buyer?.id)}>Add note</Button>
                <Button size="sm" className="h-7 text-[11px] bg-emerald-600" onClick={() => act('unlock', p.buyer?.id)}><Unlock className="w-3 h-3 mr-1" />Unlock</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- Security
const SEC_LABELS = {
  rapid_downloads: '⚡ Too many downloads / hour',
  many_ips: '🌐 Many different IPs (24h)',
  many_devices: '📱 Too many devices',
  many_wrong_codes: '🔑 Repeated wrong codes',
  token_device_mismatch: '🔀 Token used on another device',
  admin_block: '⛔ Admin block',
}
const Security = ({ onChange }) => {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('open')
  const [detail, setDetail] = useState(null)   // { user, history, events }
  const load = useCallback(async () => {
    setLoading(true)
    try { setEvents((await api('/admin/assess/security?status=' + status)).events || []) }
    catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [status])
  useEffect(() => { load() }, [load])
  const openUser = async (uid) => {
    try { setDetail(await api('/admin/assess/security/user/' + uid)) } catch (e) { toast.error(e.message) }
  }
  const act = async (uid, action, extra = {}) => {
    if (action === 'revoke_order' && !confirm('Revoke this order and keep the user locked?')) return
    try {
      await api('/admin/assess/security/action', { method: 'POST', body: { user_id: uid, action, ...extra } })
      toast.success('Done')
      setDetail(null); load(); onChange && onChange()
    } catch (e) { toast.error(e.message) }
  }
  const fmt = (t) => t ? new Date(t).toLocaleString('en-IN') : '—'
  if (loading) return <Spinner />
  return (
    <Card className="p-4">
      <TraceLeak />
      <div className="flex items-center justify-between mb-3">
        <div className="font-black text-indigo-900 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Security Events</div>
        <div className="flex gap-2">
          <select value={status} onChange={e => setStatus(e.target.value)} className="text-xs border rounded-full px-3 py-1">
            <option value="open">Open</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option><option value="all">All</option>
          </select>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      {events.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No {status} events. Normal multi-document downloads never trigger a lock. ✅</p> : (
        <div className="space-y-2">
          {events.map(e => (
            <div key={e.id} className="border rounded-xl p-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-bold">{SEC_LABELS[e.type] || e.type} {e.locked && <span className="ml-1 text-[10px] bg-red-100 text-red-700 rounded px-1.5 py-0.5 font-black">LOCKED</span>}</div>
                <div className="text-[11px] text-slate-600">👤 {e.user_name || '—'} · 📱 {e.user_mobile || '—'}</div>
                <div className="text-[10px] text-slate-400">{fmt(e.created_at)} · IP {e.ip || '—'} · dev {(e.device_id || '—').slice(0, 10)} · {JSON.stringify(e.details || {})}</div>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openUser(e.user_id)}><Eye className="w-3 h-3 mr-1" />History</Button>
                <Button size="sm" className="h-7 text-[10px] bg-emerald-600" onClick={() => act(e.user_id, 'unlock')}><Unlock className="w-3 h-3 mr-1" />Unlock</Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => act(e.user_id, 'keep', { event_id: e.id })}><Lock className="w-3 h-3 mr-1" />Keep locked</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3" onClick={() => setDetail(null)}>
          <Card className="max-w-lg w-full max-h-[85vh] overflow-y-auto p-4" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-black text-sm">👤 {detail.user?.name} · 📱 {detail.user?.mobile}</div>
                <div className="text-[11px]">{detail.user?.locked ? <span className="text-red-600 font-bold">🔒 Downloads locked</span> : <span className="text-emerald-600 font-bold">✅ Not locked</span>}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-xl leading-none">✕</button>
            </div>
            <div className="flex gap-2 mb-3">
              <Button size="sm" className="h-8 text-[11px] bg-emerald-600" onClick={() => act(detail.user.id, 'unlock')}>Unlock downloads</Button>
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => act(detail.user.id, 'keep')}>Keep locked</Button>
            </div>
            <div className="text-[11px] font-bold mb-1">Recent downloads</div>
            <div className="space-y-1">
              {(detail.history || []).slice(0, 60).map((h, i) => (
                <div key={i} className="text-[10px] text-slate-600 border-b py-1 flex justify-between gap-2">
                  <span className="truncate">{h.type === 'zip' ? '📦 ZIP ' + (h.pack_code || '') : h.mode === 'view' ? '👁 ' + (h.document_title || '') : '⬇ ' + (h.document_title || '')} {h.copy_id ? '· ' + h.copy_id : ''}</span>
                  <span className="whitespace-nowrap text-slate-400">{fmt(h.at)} · {(h.ip || '—')}</span>
                </div>
              ))}
              {(detail.history || []).length === 0 && <p className="text-[11px] text-slate-400">No download history.</p>}
            </div>
          </Card>
        </div>
      )}
    </Card>
  )
}

const SettingsTab = () => {
  const [s, setS] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setS((await api('/admin/assess/settings')).settings || {}) } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const save = async () => {
    setSaving(true)
    try { await api('/admin/assess/settings', { method: 'PUT', body: { settings: s } }); toast.success('Settings saved') } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  if (loading) return <Spinner />
  const set = (k, v) => setS({ ...s, [k]: v })
  return (
    <Card className="p-4 max-w-2xl">
      <div className="space-y-3 text-sm">
        <Fld label="Store name"><Input value={s.store_name || ''} onChange={e => set('store_name', e.target.value)} /></Fld>
        <Fld label="WhatsApp number"><Input value={s.whatsapp_number || ''} onChange={e => set('whatsapp_number', e.target.value)} placeholder="918093414633" /></Fld>
        <p className="text-[11px] text-slate-400 -mt-2">Store support/payment WhatsApp. Include country code, e.g. <b>918093414633</b> (displays as +91 80934 14633). Used by every WhatsApp button in the store.</p>
        <Fld label="Support email"><Input value={s.support_email || ''} onChange={e => set('support_email', e.target.value)} /></Fld>
        <Fld label="Store hours (shown on Contact page)"><Input value={s.store_hours || ''} onChange={e => set('store_hours', e.target.value)} placeholder="ସୋମ – ଶନି · ସକାଳ ୧୦ଟା – ସନ୍ଧ୍ୟା ୭ଟା" /></Fld>
        <Fld label="Daily download limit (legacy global — not used by new per-doc logic)"><Input type="number" value={s.daily_download_limit ?? 5} onChange={e => set('daily_download_limit', parseInt(e.target.value) || 0)} /></Fld>
        <div className="grid grid-cols-3 gap-2">
          <Fld label="Per-document / day"><Input type="number" value={s.per_document_daily_limit ?? 2} onChange={e => set('per_document_daily_limit', parseInt(e.target.value) || 0)} /></Fld>
          <Fld label="Pack ZIP / day"><Input type="number" value={s.pack_zip_daily_limit ?? 2} onChange={e => set('pack_zip_daily_limit', parseInt(e.target.value) || 0)} /></Fld>
          <Fld label="Per-document total (lifetime)"><Input type="number" value={s.per_document_total_limit ?? 10} onChange={e => set('per_document_total_limit', parseInt(e.target.value) || 0)} /></Fld>
        </div>
        <p className="text-[11px] text-slate-400 -mt-1">Counts reset at 00:00 IST. Per-document & pack-ZIP counters are independent; online view never counts.</p>
        <ResetCountTool />
        <div className="border-t pt-3 mt-1">
          <div className="font-black text-indigo-900 text-[13px] mb-2 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Abuse detection (auto-lock thresholds)</div>
          <div className="grid grid-cols-3 gap-2">
            <Fld label="Max downloads / hour"><Input type="number" value={s.abuse_max_downloads_per_hour ?? 40} onChange={e => set('abuse_max_downloads_per_hour', parseInt(e.target.value) || 0)} /></Fld>
            <Fld label="Max IPs / 24h"><Input type="number" value={s.abuse_max_ips_24h ?? 5} onChange={e => set('abuse_max_ips_24h', parseInt(e.target.value) || 0)} /></Fld>
            <Fld label="Max devices"><Input type="number" value={s.abuse_max_devices ?? 2} onChange={e => set('abuse_max_devices', parseInt(e.target.value) || 0)} /></Fld>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Tripping a rule auto-locks the teacher's store downloads (online view too) and opens a Security event. Set 0 to disable a rule. Normal multi-document use won't trigger a lock.</p>
        </div>
        <div className="border-t pt-3 mt-1">
          <div className="font-black text-indigo-900 text-[13px] mb-2">⏱️ Rate limiting (store API only)</div>
          <div className="grid grid-cols-3 gap-2">
            <Fld label="Requests / min · user"><Input type="number" value={s.rate_per_user_min ?? 30} onChange={e => set('rate_per_user_min', parseInt(e.target.value) || 0)} /></Fld>
            <Fld label="Requests / min · IP"><Input type="number" value={s.rate_per_ip_min ?? 60} onChange={e => set('rate_per_ip_min', parseInt(e.target.value) || 0)} /></Fld>
            <Fld label="Downloads / min · user"><Input type="number" value={s.rate_download_per_user_min ?? 10} onChange={e => set('rate_download_per_user_min', parseInt(e.target.value) || 0)} /></Fld>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Applies only to /api/assess/* (storefront). 0 disables. The rest of the website is never rate-limited here.</p>
        </div>
        <div className="flex items-center gap-2"><Switch checked={!!s.launch_banner_active} onCheckedChange={v => set('launch_banner_active', v)} /><span className="text-xs font-bold">Launch banner active</span></div>
        <div className="flex items-center gap-2"><Switch checked={s.whatsapp_fallback_enabled !== false} onCheckedChange={v => set('whatsapp_fallback_enabled', v)} /><span className="text-xs font-bold">WhatsApp fallback link (storefront)</span></div>
        <div className="flex items-center gap-2"><Switch checked={s.require_teacher_verification !== false} onCheckedChange={v => set('require_teacher_verification', v)} /><span className="text-xs font-bold">Require teacher verification before paid downloads</span></div>
        <div className="flex items-center gap-2"><Switch checked={s.watermark_enabled !== false} onCheckedChange={v => set('watermark_enabled', v)} /><span className="text-xs font-bold">Personalised watermark on downloaded PDFs</span></div>
        <Fld label="Launch banner text"><Textarea rows={2} value={s.launch_banner_text || ''} onChange={e => set('launch_banner_text', e.target.value)} /></Fld>
        <Fld label="Footer note"><Textarea rows={2} value={s.footer_note || ''} onChange={e => set('footer_note', e.target.value)} /></Fld>
        <div className="border-t pt-3 mt-1">
          <div className="font-black text-indigo-900 text-[13px] mb-2">🔒 Confidentiality Oath (ଗୋପନୀୟତା ଶପଥ)</div>
          <Fld label="Terms version (change this → every teacher must accept the FULL oath again)"><Input value={s.terms_version ?? '1'} onChange={e => set('terms_version', e.target.value)} /></Fld>
          <div className="flex items-center gap-2 mt-2"><Switch checked={!!s.oath_full_every_download} onCheckedChange={v => set('oath_full_every_download', v)} /><span className="text-xs font-bold">Show FULL oath on every download (default OFF → short reminder after first)</span></div>
          <OathTextsField value={s.oath_texts} onChange={obj => set('oath_texts', obj)} />
        </div>
      </div>
      <div className="flex justify-end mt-4"><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}Save settings</Button></div>
    </Card>
  )
}

// Admin tool: reset a teacher's TODAY download count (preserves history).
const ResetCountTool = () => {
  const [mobile, setMobile] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    const m = mobile.replace(/\D/g, '').slice(-10)
    if (m.length !== 10) { toast.error('Enter a 10-digit mobile'); return }
    setBusy(true)
    try {
      const r = await api('/admin/assess/reset-downloads', { method: 'POST', body: { mobile: m } })
      toast.success(`Reset done — ${r.reset || 0} record(s) cleared for today`)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="border rounded-lg p-2.5 bg-slate-50 dark:bg-slate-900/40">
      <div className="text-[12px] font-bold mb-1">♻️ Reset today's download count (for a teacher)</div>
      <div className="flex gap-2">
        <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Teacher mobile (10 digits)" className="h-9 text-sm" />
        <Button size="sm" onClick={run} disabled={busy} className="h-9 whitespace-nowrap">{busy ? '…' : 'Reset today'}</Button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">Clears today's per-document & pack-ZIP counts so the teacher can download again. History is preserved (audit-logged).</p>
    </div>
  )
}

// Edit all oath Odia texts as JSON (rules & warnings are arrays). Merged over
// defaults so the admin always sees the current wording. Saved with Settings.
const OathTextsField = ({ value, onChange }) => {
  const [str, setStr] = useState(JSON.stringify({ ...OATH_DEFAULTS, ...(value || {}) }, null, 2))
  const [err, setErr] = useState('')
  const onEdit = (v) => { setStr(v); try { const o = JSON.parse(v); setErr(''); onChange(o) } catch (_e) { setErr('Invalid JSON — fix before saving') } }
  return (
    <div className="mt-3">
      <Label className="text-[11px]">All oath text (Odia) — edit any line, then Save settings. “rules” and “warn_items” are lists.</Label>
      <Textarea rows={12} className="font-mono text-[11px] leading-snug" value={str} onChange={e => onEdit(e.target.value)} />
      {err ? <p className="text-[11px] text-rose-600 mt-1">{err}</p> : <p className="text-[11px] text-slate-400 mt-1">Placeholders: {'{teacher_name}'} in ribbon, {'{whatsapp}'} in footer, {'{n}'} in progress.</p>}
    </div>
  )
}

// Admin → Analytics: oath acceptances per day/pack + top teachers by downloads.
const Analytics = () => {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { (async () => { try { setD(await api('/admin/assess/analytics')) } catch (e) { toast.error(e.message) } finally { setLoading(false) } })() }, [])
  if (loading) return <Spinner />
  if (!d) return <p className="text-sm text-slate-400">No data.</p>
  const Stat = ({ label, value, color }) => (<Card className="p-3 flex-1"><div className="text-[11px] text-slate-400 font-bold">{label}</div><div className="text-2xl font-black" style={{ color }}>{value}</div></Card>)
  const maxTeacher = Math.max(1, ...(d.topTeachers || []).map(t => t.count))
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Stat label="Oath acceptances (30d)" value={d.totals?.acceptances || 0} color="#241a5e" />
        <Stat label="Total downloads" value={d.totals?.downloads || 0} color="#2a9d5c" />
        <Stat label="Active teachers" value={d.totals?.teachers || 0} color="#1fa2d9" />
      </div>

      <Card className="p-4">
        <div className="font-black text-[13px] mb-2">Oath acceptances per day (last 30 days)</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={d.perDay || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="full" stroke="#e8452c" strokeWidth={2} dot={false} name="Full" />
            <Line type="monotone" dataKey="short" stroke="#1fa2d9" strokeWidth={2} dot={false} name="Short" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4">
        <div className="font-black text-[13px] mb-2">Acceptances per pack (top 12)</div>
        <ResponsiveContainer width="100%" height={Math.max(160, (d.perPack || []).length * 28)}>
          <BarChart data={d.perPack || []} layout="vertical" margin={{ left: 10, right: 20 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#7048e8" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4">
        <div className="font-black text-[13px] mb-2">Top teachers by downloads</div>
        {(d.topTeachers || []).length === 0 ? <p className="text-sm text-slate-400">No downloads yet.</p> : (
          <div className="space-y-1.5">
            {d.topTeachers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[12.5px]">
                <span className="w-40 truncate font-bold">{t.user_name || '—'}</span>
                <span className="w-24 text-slate-400">{t.user_mobile}</span>
                <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden"><div className="h-full rounded" style={{ width: `${(t.count / maxTeacher) * 100}%`, background: '#2a9d5c' }} /></div>
                <span className="w-8 text-right font-black">{t.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
const OathLog = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [f, setF] = useState({ pack: '', user: '', from: '', to: '' })
  const load = async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      Object.entries(f).forEach(([k, v]) => v && p.set(k, v))
      const r = await api(`/admin/assess/oath-acceptances?${p.toString()}`)
      setRows(r.acceptances || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line
  const csv = () => {
    const p = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => v && p.set(k, v))
    p.set('format', 'csv')
    const token = (typeof window !== 'undefined') ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
    fetch(`/api/admin/assess/oath-acceptances?${p.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.blob()).then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'oath-acceptances.csv'; a.click(); URL.revokeObjectURL(a.href) })
      .catch(e => toast.error(e.message))
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div><Label className="text-[11px]">Pack code / id</Label><Input className="h-8 w-40" value={f.pack} onChange={e => setF({ ...f, pack: e.target.value })} /></div>
        <div><Label className="text-[11px]">Mobile</Label><Input className="h-8 w-36" value={f.user} onChange={e => setF({ ...f, user: e.target.value })} /></div>
        <div><Label className="text-[11px]">From</Label><Input type="date" className="h-8" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></div>
        <div><Label className="text-[11px]">To</Label><Input type="date" className="h-8" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></div>
        <Button size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Filter</Button>
        <Button size="sm" variant="outline" onClick={csv}><Save className="w-4 h-4 mr-1" />CSV</Button>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-slate-400">No oath acceptances yet.</p> : (
        <div className="overflow-auto border rounded-lg max-h-[62vh]">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-slate-100"><tr className="text-left">
              <th className="p-2">When</th><th className="p-2">Type</th><th className="p-2">Teacher (typed name)</th><th className="p-2">Mobile</th><th className="p-2">Pack</th><th className="p-2">Ver</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{new Date(r.accepted_at).toLocaleString('en-IN')}</td>
                  <td className="p-2"><Badge className={r.type === 'full' ? 'bg-indigo-900' : 'bg-slate-500'}>{r.type}</Badge></td>
                  <td className="p-2 font-bold">{r.typed_name || r.user_name || '—'}</td>
                  <td className="p-2">{r.user_mobile}</td>
                  <td className="p-2">{r.pack_name || r.pack_code}</td>
                  <td className="p-2">{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- small UI bits
const Spinner = () => <div className="py-10 grid place-items-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
const Fld = ({ label, children, span2 }) => <div className={span2 ? 'col-span-2' : ''}><Label className="text-[11px]">{label}</Label>{children}</div>
const Sel = ({ label, value, onChange, opts, raw }) => (
  <div>
    <Label className="text-[11px]">{label}</Label>
    <select className="block h-8 border rounded-md px-2 text-sm min-w-[120px]" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">All</option>
      {opts.map(o => raw ? <option key={o.v} value={o.v}>{o.l}</option> : <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
)
const Modal = ({ title, children, onClose }) => (
  <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-3" onClick={onClose}>
    <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-center p-3 border-b"><div className="font-black text-indigo-900">{title}</div><button onClick={onClose} className="text-slate-400 text-xl">✕</button></div>
      <div className="p-4 overflow-y-auto">{children}</div>
    </div>
  </div>
)

const STATUS_BADGE = {
  available: ['bg-emerald-600', 'available'], verification_pending: ['bg-amber-500', 'verify pending'],
  not_released: ['bg-indigo-500', 'not released'], file_missing: ['bg-slate-400', 'file missing'], not_owned: ['bg-rose-500', 'not owned'],
}
const CheckAccessModal = ({ mobile, userId, onClose }) => {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const qs = userId ? `user_id=${encodeURIComponent(userId)}` : `mobile=${encodeURIComponent(mobile)}`
    api(`/admin/assess/user-access?${qs}`).then(setD).catch(e => setErr(e.message))
  }, [mobile, userId])
  return (
    <Modal title="Check access" onClose={onClose}>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {!d && !err && <Spinner />}
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-indigo-900">{d.user.name} · {d.user.mobile}</Badge>
            <Badge className={d.verified ? 'bg-emerald-600' : 'bg-amber-500'}>teacher: {d.teacher_status || 'none'}</Badge>
            <Badge className={d.terms_accepted ? 'bg-emerald-600' : 'bg-slate-400'}>terms: {d.terms_accepted ? 'yes' : 'no'}</Badge>
            <Badge variant="outline">{d.owned_docs} owned docs</Badge>
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-lg">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-slate-100"><tr className="text-left"><th className="p-2">Document</th><th className="p-2">Class</th><th className="p-2">Type</th><th className="p-2">Status</th></tr></thead>
              <tbody>
                {d.documents.map(x => {
                  const [cls, label] = STATUS_BADGE[x.status] || ['bg-slate-500', x.status]
                  return <tr key={x.id} className="border-t"><td className="p-2">{x.title_or}</td><td className="p-2">{x.class}</td><td className="p-2">{x.doc_type}</td><td className="p-2"><Badge className={cls}>{label}</Badge>{x.status === 'not_released' && x.release_at ? <span className="text-[10px] text-slate-400 ml-1">{new Date(x.release_at).toLocaleDateString('en-IN')}</span> : null}</td></tr>
                })}
                {d.documents.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-400">No owned documents.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default AdminAssessmentStore
