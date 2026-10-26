'use client'
import React, { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import { sget, spost, sput, sdel, API, getToken, money } from '@/components/store/api'
import AdminUnitTestsManager from '@/components/AdminUnitTestsManager'

const TABS = [['dashboard', 'Dashboard'], ['settings', 'Settings'], ['products', 'Products'], ['unittests', 'Unit Tests'], ['covers', 'Covers'], ['bulk', 'Answer Key Bulk Upload'], ['categories', 'Categories'], ['coupons', 'Coupons'], ['orders', 'Orders'], ['reviews', 'Reviews'], ['analytics', 'Analytics'], ['shipments', 'Shipments']]
const TYPES = ['answer_key', 'assessment_paper', 'pdf', 'excel', 'html', 'zip', 'bundle']

async function upload(productId, file, kind) {
  const fd = new FormData(); fd.append('file', file); if (kind) fd.append('kind', kind)
  const r = await fetch(`${API}/admin/store/products/${productId}/files`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Upload failed'); return d
}

export default function AdminStoreManager() {
  const [tab, setTab] = useState('dashboard')
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`text-xs font-bold rounded-full px-3 py-1.5 ${tab === k ? 'bg-indigo-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>)}
      </div>
      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'unittests' && <AdminUnitTestsManager />}
      {tab === 'covers' && <CoversTab />}
      {tab === 'bulk' && <BulkTab />}
      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'coupons' && <CouponsTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'shipments' && <ShipmentsTab />}
    </div>
  )
}

const MOTIFS = ['math', 'science', 'evs', 'odia', 'english', 'hindi', 'sanskrit', 'social', 'art', 'rainbow', 'sports', 'kaushal', 'book']

function CoversTab() {
  const [styles, setStyles] = useState(null)
  const [jobs, setJobs] = useState([])
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState({})
  const poll = useRef(null)
  const loadStyles = () => sget('/admin/store/covers/subject-styles').then(r => setStyles(r.styles || {})).catch(() => {})
  const loadJobs = () => sget('/admin/store/covers/jobs').then(r => setJobs(r.jobs || [])).catch(() => {})
  useEffect(() => { loadStyles(); loadJobs() }, [])
  useEffect(() => {
    const running = jobs.some(j => j.status === 'running')
    if (running && !poll.current) poll.current = setInterval(loadJobs, 2500)
    if (!running && poll.current) { clearInterval(poll.current); poll.current = null }
    return () => { if (poll.current && !jobs.some(j => j.status === 'running')) { clearInterval(poll.current); poll.current = null } }
  }, [jobs])
  const gen = async (payload, label) => {
    if (payload.scope === 'all' && !confirm('Regenerate covers for ALL products? This runs in the background and can take a while.')) return
    setBusy(true)
    try { const r = await spost('/admin/store/covers/generate', payload); toast.success(`${label}: ${r.total} queued`); loadJobs() } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const saveStyle = async (key) => {
    const s = edit[key] || styles[key]
    try { await spost('/admin/store/covers/subject-styles', { key, bg: s.bg, dark: s.dark, motif: s.motif }); toast.success(`${key} saved — regenerating its covers`); setEdit(e => ({ ...e, [key]: undefined })); loadStyles(); loadJobs() } catch (e) { toast.error(e.message) }
  }
  const downloadFailed = (job) => {
    const csv = 'productId\n' + (job.failedIds || []).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `cover-failures-${job.id.slice(0, 6)}.csv`; a.click()
  }
  const btn = 'text-xs font-bold rounded-full px-3 py-1.5 text-white disabled:opacity-50'
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="font-bold text-sm text-indigo-900 mb-1">Generate / regenerate covers</div>
        <div className="text-[11px] text-gray-500 mb-3">Runs as a background job. Covers are public images (no paid content). Products that fail keep the grey placeholder.</div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => gen({ scope: 'missing' }, 'Missing only')} className={btn} style={{ background: '#2a9d5c' }}>Generate missing only</button>
          <button disabled={busy} onClick={() => gen({ scope: 'all' }, 'All')} className={btn} style={{ background: '#e8452c' }}>Regenerate ALL</button>
        </div>
        <div className="text-[11px] text-gray-500 mt-3 mb-1">By class:</div>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map(c => <button key={c} disabled={busy} onClick={() => gen({ scope: 'class', class: c }, `Class ${c}`)} className="text-xs font-bold rounded-full px-3 py-1.5 bg-gray-100 text-gray-700 disabled:opacity-50">Class {c}</button>)}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between"><div className="font-bold text-sm text-indigo-900">Jobs</div><button onClick={loadJobs} className="text-[11px] text-gray-500">Refresh</button></div>
        {jobs.length === 0 && <div className="text-sm text-gray-400">No cover jobs yet.</div>}
        {jobs.map(j => {
          const pct = j.total ? Math.round((j.done / j.total) * 100) : 0
          return (
            <div key={j.id} className="bg-white rounded-xl border border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-1 text-[12px]">
                <span className="font-bold flex-1">{j.scope} · {j.done}/{j.total}</span>
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: j.status === 'done' ? '#2a9d5c' : '#1fa2d9' }}>{j.status}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: j.status === 'done' ? '#2a9d5c' : '#f7b32b' }} /></div>
              {(j.failedIds?.length > 0) && <div className="flex items-center justify-between mt-1.5 text-[11px] text-rose-600"><span>{j.failedIds.length} failed (placeholder kept)</span><button onClick={() => downloadFailed(j)} className="font-bold">Download failed CSV</button></div>}
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="font-bold text-sm text-indigo-900 mb-1">Subject styles</div>
        <div className="text-[11px] text-gray-500 mb-3">Edit background, dark text colour and motif per subject. Saving regenerates that subject's covers.</div>
        {!styles && <div className="text-sm text-gray-400">Loading…</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {styles && Object.entries(styles).map(([key, s0]) => {
            const s = edit[key] || s0
            const set = (k, v) => setEdit(e => ({ ...e, [key]: { ...s, [k]: v } }))
            const dirty = !!edit[key]
            return (
              <div key={key} className="border border-gray-100 rounded-xl p-2.5 flex items-center gap-2" style={{ background: s.bg }}>
                <div className="flex-1">
                  <div className="font-bold text-[12px]" style={{ color: s.dark }}>{key}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input type="color" value={s.bg} onChange={e => set('bg', e.target.value)} title="Background" className="w-6 h-6 rounded border-0 p-0 bg-transparent" />
                    <input type="color" value={s.dark} onChange={e => set('dark', e.target.value)} title="Dark text" className="w-6 h-6 rounded border-0 p-0 bg-transparent" />
                    <select value={s.motif} onChange={e => set('motif', e.target.value)} className="text-[11px] border rounded px-1 py-0.5 bg-white">{MOTIFS.map(m => <option key={m} value={m}>{m}</option>)}</select>
                  </div>
                </div>
                <button disabled={!dirty} onClick={() => saveStyle(key)} className="text-[11px] font-bold rounded-full px-3 py-1.5 text-white disabled:opacity-40" style={{ background: s.dark }}>Save</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}


function Money({ v }) { return <span>{money(v)}</span> }

function FunnelWidget() {
  const [f, setF] = useState(null)
  const [range, setRange] = useState('today') // 'today' | 'all'
  const [err, setErr] = useState('')
  useEffect(() => { sget('/admin/store/funnel').then(setF).catch(e => setErr(e.message)) }, [])
  const b = f && (range === 'today' ? f.today : f.all)
  const steps = b ? [
    { key: 'views', label: 'Views', v: b.views, color: '#6366f1', sub: `${b.listViews || 0} list · ${b.productViews || 0} product` },
    { key: 'cart', label: 'Add to cart', v: b.addToCart, color: '#8b5cf6', rate: b.rates?.viewToCart, rateLabel: 'of views' },
    { key: 'checkout', label: 'Checkout', v: b.checkout, color: '#f59e0b', rate: b.rates?.cartToCheckout, rateLabel: 'of carts' },
    { key: 'paid', label: 'Paid', v: b.paid, color: '#10b981', rate: b.rates?.checkoutToPaid, rateLabel: 'of checkouts' },
  ] : []
  const maxV = b ? Math.max(1, b.views, b.addToCart, b.checkout, b.paid) : 1
  return (
    <div className="bg-white border rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold text-gray-600">Conversion funnel <span className="font-normal text-gray-400">· TEST accounts excluded</span></div>
        <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
          {[['today', 'Today'], ['all', 'All time']].map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} className={`text-[10px] font-bold rounded-full px-2.5 py-1 ${range === k ? 'bg-indigo-900 text-white' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
      </div>
      {err && <div className="text-[11px] text-rose-500">{err}</div>}
      {!f && !err && <div className="text-[11px] text-gray-400">Loading…</div>}
      {b && (
        <div className="space-y-1.5">
          {steps.map(s => (
            <div key={s.key} className="flex items-center gap-2">
              <div className="w-20 text-[11px] font-bold text-gray-700 shrink-0">{s.label}</div>
              <div className="flex-1 h-7 bg-gray-50 rounded-md overflow-hidden relative">
                <div className="h-full rounded-md flex items-center px-2" style={{ width: `${Math.max(6, Math.round((s.v / maxV) * 100))}%`, background: s.color }}>
                  <span className="text-[11px] font-extrabold text-white">{s.v}</span>
                </div>
              </div>
              <div className="w-24 text-right shrink-0">
                {s.rate != null ? <span className="text-[10px] text-gray-500">{s.rate}% <span className="text-gray-400">{s.rateLabel}</span></span>
                  : <span className="text-[10px] text-gray-400">{s.sub}</span>}
              </div>
            </div>
          ))}
          <div className="text-[10px] text-gray-400 pt-1 border-t mt-1">Overall view → paid conversion: <span className="font-bold text-emerald-600">{b.rates?.viewToPaid ?? 0}%</span></div>
        </div>
      )}
    </div>
  )
}

function DashboardTab() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { sget('/admin/store/dashboard').then(setD).catch(e => setErr(e.message)) }, [])
  if (err) return <div className="text-sm text-rose-500">{err}</div>
  if (!d) return <div className="text-sm text-gray-400">Loading…</div>
  const maxRev = Math.max(1, ...((d.trend || []).map(t => t.revenue)))
  const dayLabel = (iso) => { try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }) } catch { return iso.slice(5) } }
  return (
    <div className="space-y-3">
      <div className="text-[10px] text-gray-400">Real sales only — TEST accounts & simulated payments excluded.</div>
      {/* Top stat cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border rounded-xl p-3">
          <div className="text-[10px] text-gray-400">Today</div>
          <div className="font-extrabold text-xl text-indigo-900"><Money v={d.today?.revenue} /></div>
          <div className="text-[11px] text-gray-500">{d.today?.orders || 0} order{(d.today?.orders || 0) === 1 ? '' : 's'}</div>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <div className="text-[10px] text-gray-400">This month</div>
          <div className="font-extrabold text-xl text-indigo-900"><Money v={d.month?.revenue} /></div>
          <div className="text-[11px] text-gray-500">{d.month?.orders || 0} order{(d.month?.orders || 0) === 1 ? '' : 's'}</div>
        </div>
      </div>
      {/* Conversion funnel */}
      <FunnelWidget />
      {/* 7-day trend */}
      <div className="bg-white border rounded-xl p-3">
        <div className="text-[11px] font-bold text-gray-600 mb-2">Last 7 days</div>
        <div className="flex items-end gap-1.5 h-28">
          {(d.trend || []).map(t => (
            <div key={t.date} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="text-[9px] text-gray-500 mb-0.5">{t.revenue ? `₹${t.revenue}` : ''}</div>
              <div className="w-full rounded-t bg-indigo-600" style={{ height: `${Math.round((t.revenue / maxRev) * 100)}%`, minHeight: t.revenue ? 4 : 2, background: t.revenue ? '#4f46e5' : '#e5e7eb' }} title={`${t.date}: ₹${t.revenue} (${t.orders})`} />
              <div className="text-[9px] text-gray-400 mt-1">{dayLabel(t.date)}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Best sellers */}
      <div className="bg-white border rounded-xl p-3">
        <div className="text-[11px] font-bold text-gray-600 mb-1.5">Top 5 best-sellers (this month)</div>
        {(d.top || []).length === 0 && <div className="text-[11px] text-gray-400">No sales yet this month.</div>}
        {(d.top || []).map((t, i) => (
          <div key={t.productId} className="flex items-center gap-2 text-[12px] py-1 border-b last:border-0">
            <span className="w-4 text-gray-400 font-bold">{i + 1}</span>
            <span className="flex-1 line-clamp-1">{t.titleOdia || t.title}</span>
            <span className="text-gray-500">{t.units}×</span>
            <span className="font-bold text-indigo-900"><Money v={t.revenue} /></span>
          </div>
        ))}
      </div>
      {/* Coupons + refunds */}
      <div className="grid grid-cols-1 gap-2">
        <div className="bg-white border rounded-xl p-3">
          <div className="text-[11px] font-bold text-gray-600 mb-1.5">Coupon usage</div>
          {(d.coupons || []).length === 0 && <div className="text-[11px] text-gray-400">No coupons used yet.</div>}
          {(d.coupons || []).map(c => (
            <div key={c.code} className="flex items-center gap-2 text-[12px] py-1 border-b last:border-0">
              <span className="font-mono font-bold flex-1">{c.code}</span>
              <span className="text-gray-500">{c.uses} use{c.uses === 1 ? '' : 's'}</span>
              <span className="text-rose-600">−<Money v={c.discount} /></span>
            </div>
          ))}
        </div>
        <div className="bg-white border rounded-xl p-3 flex items-center justify-between">
          <div className="text-[11px] font-bold text-gray-600">Refunds (this month)</div>
          <div className="text-[13px]"><span className="font-bold">{d.refunds?.count || 0}</span> · <span className="text-rose-600 font-bold"><Money v={d.refunds?.amount} /></span></div>
        </div>
      </div>
    </div>
  )
}

function SettingsTab() {
  const [s, setS] = useState(null)
  useEffect(() => { sget('/admin/store/settings').then(r => setS(r.settings)).catch(() => {}) }, [])
  const save = async () => { try { const r = await sput('/admin/store/settings', s); setS(r.settings); toast.success('Saved') } catch (e) { toast.error(e.message) } }
  const seed = async () => { try { const r = await spost('/admin/store/seed', {}); toast.success(`Seeded ${r.categoriesCreated} categories + indexes`) } catch (e) { toast.error(e.message) } }
  if (!s) return <div className="text-sm text-gray-400">Loading…</div>
  return (
    <div className="bg-white border rounded-xl p-3 space-y-3">
      <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.enabled} onChange={e => setS({ ...s, enabled: e.target.checked })} /><span className="font-bold text-sm">Master switch (store live for everyone)</span></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.physicalEnabled} onChange={e => setS({ ...s, physicalEnabled: e.target.checked })} /><span className="text-sm">Physical printed orders (beta)</span></label>
      <div><div className="text-[11px] font-bold">Beta testers (mobiles)</div><textarea rows={2} value={(s.betaTesters || []).join(', ')} onChange={e => setS({ ...s, betaTesters: e.target.value.split(/[\s,]+/).map(x => x.replace(/[^0-9]/g, '')).filter(Boolean) })} className="w-full border rounded-lg p-2 text-sm" /><div className="text-[10px] text-gray-400">When master switch OFF, only these see the store.</div></div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><div>Default security</div><select value={s.defaultSecurityLevel} onChange={e => setS({ ...s, defaultSecurityLevel: Number(e.target.value) })} className="w-full border rounded p-1">{[1, 2, 3, 4].map(n => <option key={n} value={n}>Level {n}</option>)}</select></div>
        <div><div>Flat delivery ₹</div><input type="number" value={s.flatDeliveryInr} onChange={e => setS({ ...s, flatDeliveryInr: Number(e.target.value) })} className="w-full border rounded p-1" /></div>
        <div><div>Support WhatsApp</div><input value={s.supportWhatsapp || ''} onChange={e => setS({ ...s, supportWhatsapp: e.target.value })} className="w-full border rounded p-1" /></div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><div>GSTIN (optional)</div><input value={s.gstin || ''} onChange={e => setS({ ...s, gstin: e.target.value })} className="w-full border rounded p-1" /></div>
        <div className="col-span-2"><div>GST legal name</div><input value={s.gstLegalName || ''} onChange={e => setS({ ...s, gstLegalName: e.target.value })} className="w-full border rounded p-1" /></div>
      </div>
      <div className="flex gap-2"><button onClick={save} className="bg-indigo-900 text-white text-sm font-bold rounded-full px-5 py-1.5">Save</button><button onClick={seed} className="bg-gray-100 text-sm rounded-full px-4 py-1.5">Seed categories + indexes</button></div>
    </div>
  )
}

const BLANK = { type: 'answer_key', titleEnglish: '', titleOdia: '', shortDesc: '', fullDesc: '', classes: [], subject: '', exam: '', whatsInside: [], securityLevel: 2, mrpInr: 0, priceInr: 0, premiumPriceInr: '', visibility: 'public', status: 'draft', maxPerUser: 1, featured: false, categoryId: '', previewMode: 'blurred' }

function ProductsTab() {
  const [list, setList] = useState([])
  const [cats, setCats] = useState([])
  const [edit, setEdit] = useState(null)
  const load = async () => { try { const r = await sget('/admin/store/products'); setList(r.products || []); const c = await sget('/admin/store/categories'); setCats(c.categories || []) } catch (e) { toast.error(e.message) } }
  useEffect(() => { load() }, [])
  if (edit) return <ProductForm product={edit} cats={cats} onClose={() => { setEdit(null); load() }} />
  return (
    <div className="space-y-2">
      <button onClick={() => setEdit({ ...BLANK })} className="bg-rose-600 text-white text-sm font-bold rounded-full px-4 py-1.5">+ New product</button>
      {list.map(p => (
        <div key={p.id} className="bg-white border rounded-xl p-2.5 flex items-center gap-2">
          <div className="flex-1"><div className="text-[13px] font-bold line-clamp-1">{p.titleEnglish}</div><div className="text-[11px] text-gray-400">{p.type} • {p.status} • {p.visibility} • {money(p.pricing?.price)} • {p.salesCount || 0} sold</div></div>
          <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/store/p/${p.slug}`).then(() => toast.success('Link copied'))} className="text-[11px] rounded-full px-2 py-1 border">Copy link</button>
          <button onClick={() => setEdit({ ...p, _id: p.id })} className="text-[11px] font-bold rounded-full px-3 py-1 bg-indigo-900 text-white">Edit</button>
        </div>
      ))}
      {list.length === 0 && <div className="text-sm text-gray-400">No products yet.</div>}
    </div>
  )
}

function ProductForm({ product, cats, onClose }) {
  const [p, setP] = useState(product)
  const [files, setFiles] = useState([])
  const [history, setHistory] = useState([])
  const [allProds, setAllProds] = useState([])
  const isNew = !p._id
  const up = (k, v) => setP(s => ({ ...s, [k]: v }))
  useEffect(() => { sget('/admin/store/products').then(r => setAllProds((r.products || []).filter(x => x.type !== 'bundle'))).catch(() => {}) }, [])
  const loadFiles = async (id) => { try { const r = await sget(`/store/product/${(await sget('/admin/store/products')).products.find(x => x.id === id)?.slug}`); setFiles(r.product?.files || []) } catch {} }
  useEffect(() => { if (p._id) { sget(`/admin/store/products/${p._id}/price-history`).then(r => setHistory(r.history || [])).catch(() => {}) } }, [p._id])
  const save = async () => {
    try {
      if (isNew) { const r = await spost('/admin/store/products', p); up('_id', r.product.id); up('slug', r.product.slug); toast.success('Created — now add files'); }
      else { await sput(`/admin/store/products/${p._id}`, p); toast.success('Saved') }
    } catch (e) { toast.error(e.message) }
  }
  const doUpload = async (e) => { const f = e.target.files?.[0]; if (!f) return; if (!p._id) { toast.error('Save the product first'); return } try { const r = await upload(p._id, f); setFiles(x => [...x, r.file]); toast.success('File uploaded') } catch (err) { toast.error(err.message) } }
  const genPreview = async () => { try { await spost(`/admin/store/products/${p._id}/preview`, {}); toast.success('Blurred preview generated') } catch (e) { toast.error(e.message) } }
  const publish = async (status) => { try { await sput(`/admin/store/products/${p._id}`, { status }); up('status', status); toast.success(status) } catch (e) { toast.error(e.message) } }
  return (
    <div className="bg-white border rounded-xl p-3 space-y-2">
      <div className="flex justify-between"><div className="font-bold text-sm">{isNew ? 'New product' : p.titleEnglish}</div><button onClick={onClose} className="text-xs text-gray-400">Close</button></div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div><div>Type</div><select value={p.type} onChange={e => up('type', e.target.value)} className="w-full border rounded p-1">{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div><div>Category</div><select value={p.categoryId || ''} onChange={e => up('categoryId', e.target.value)} className="w-full border rounded p-1"><option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.nameEnglish}</option>)}</select></div>
      </div>
      <input placeholder="Title (English)" value={p.titleEnglish} onChange={e => up('titleEnglish', e.target.value)} className="w-full border rounded p-1.5 text-sm" />
      <input placeholder="Title (Odia)" value={p.titleOdia} onChange={e => up('titleOdia', e.target.value)} className="w-full border rounded p-1.5 text-sm" />
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><div>Classes (comma)</div><input value={(p.classes || []).join(',')} onChange={e => up('classes', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} className="w-full border rounded p-1" /></div>
        <div><div>Subject</div><input value={p.subject || ''} onChange={e => up('subject', e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Exam</div><input value={p.exam || ''} onChange={e => up('exam', e.target.value)} className="w-full border rounded p-1" /></div>
      </div>
      <textarea placeholder="What's inside (one per line)" rows={2} value={(p.whatsInside || []).join('\n')} onChange={e => up('whatsInside', e.target.value.split('\n').filter(Boolean))} className="w-full border rounded p-1.5 text-sm" />
      <textarea placeholder="Full description" rows={2} value={p.fullDesc || ''} onChange={e => up('fullDesc', e.target.value)} className="w-full border rounded p-1.5 text-sm" />
      <div className="grid grid-cols-4 gap-2 text-[11px]">
        <div><div>MRP ₹</div><input type="number" value={p.mrpInr} onChange={e => up('mrpInr', e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Price ₹</div><input type="number" value={p.priceInr} onChange={e => up('priceInr', e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Premium ₹</div><input type="number" value={p.premiumPriceInr} onChange={e => up('premiumPriceInr', e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Max/user</div><input type="number" value={p.maxPerUser} onChange={e => up('maxPerUser', Number(e.target.value))} className="w-full border rounded p-1" /></div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><div>Security</div><select value={p.securityLevel} onChange={e => up('securityLevel', Number(e.target.value))} className="w-full border rounded p-1">{[1, 2, 3, 4].map(n => <option key={n} value={n}>Level {n}</option>)}</select></div>
        <div><div>Preview</div><select value={p.previewMode} onChange={e => up('previewMode', e.target.value)} className="w-full border rounded p-1"><option value="blurred">Blurred</option><option value="sample">Sample</option><option value="first_free">First page free</option></select></div>
        <div><div>Visibility</div><select value={p.visibility} onChange={e => up('visibility', e.target.value)} className="w-full border rounded p-1"><option value="public">Public</option><option value="link_only">Link only</option></select></div>
      </div>
      <label className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={!!p.featured} onChange={e => up('featured', e.target.checked)} />Featured on home</label>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div><div>Launch price ₹</div><input type="number" value={p.launchPriceInr ?? ''} onChange={e => up('launchPriceInr', e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Launch start</div><input type="date" value={(p.launchStart || '').slice(0, 10)} onChange={e => up('launchStart', e.target.value ? new Date(e.target.value).toISOString() : null)} className="w-full border rounded p-1" /></div>
        <div><div>Launch end</div><input type="date" value={(p.launchEnd || '').slice(0, 10)} onChange={e => up('launchEnd', e.target.value ? new Date(e.target.value).toISOString() : null)} className="w-full border rounded p-1" /></div>
      </div>
      {p.type === 'bundle' && (
        <div className="border rounded-lg p-2 text-[11px]">
          <div className="font-bold mb-1">Bundle items (included products)</div>
          <div className="max-h-40 overflow-auto space-y-1">
            {allProds.map(x => (
              <label key={x.id} className="flex items-center gap-2">
                <input type="checkbox" checked={(p.bundleItems || []).includes(x.id)} onChange={e => up('bundleItems', e.target.checked ? [...(p.bundleItems || []), x.id] : (p.bundleItems || []).filter(i => i !== x.id))} />
                <span className="flex-1 truncate">{x.titleEnglish}</span><span className="text-gray-400">₹{x.pricing?.price}</span>
              </label>
            ))}
            {allProds.length === 0 && <div className="text-gray-400">Create some products first.</div>}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">Buyers get every included product. Set the bundle price above — the product page shows "bought separately ₹X, you save ₹Y".</div>
        </div>
      )}
      <button onClick={save} className="bg-indigo-900 text-white text-sm font-bold rounded-full px-5 py-1.5">{isNew ? 'Create' : 'Save'}</button>
      {p._id && (
        <div className="border-t pt-2 mt-2 space-y-2">
          <div className="text-[11px] font-bold">Files</div>
          {files.map(f => <div key={f.id} className="text-[11px] flex items-center gap-2"><span className="flex-1">{f.name} ({f.kind}{f.pages ? `, ${f.pages}p` : ''})</span><button onClick={async () => { await sdel(`/admin/store/products/${p._id}/files/${f.id}`); setFiles(x => x.filter(y => y.id !== f.id)) }} className="text-rose-500 text-[10px]">delete</button></div>)}
          <input type="file" onChange={doUpload} className="text-[11px]" />
          <div className="flex gap-2">
            <button onClick={genPreview} className="text-[11px] rounded-full px-3 py-1 bg-sky-100 text-sky-700">Generate blurred preview</button>
            <button onClick={() => publish('published')} className="text-[11px] rounded-full px-3 py-1 bg-green-600 text-white">Publish</button>
            <button onClick={() => publish('archived')} className="text-[11px] rounded-full px-3 py-1 bg-gray-200">Archive</button>
          </div>
          {history.length > 0 && <div className="text-[10px] text-gray-500"><b>Price history:</b> {history.map(h => `${h.field}: ${h.oldValue}→${h.newValue}`).join(' · ')}</div>}
        </div>
      )}
    </div>
  )
}

function CategoriesTab() {
  const [cats, setCats] = useState([])
  const [n, setN] = useState({ nameEnglish: '', nameOdia: '', icon: '📦', color: '#241a5e' })
  const load = () => sget('/admin/store/categories').then(r => setCats(r.categories || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const add = async () => { try { await spost('/admin/store/categories', n); setN({ nameEnglish: '', nameOdia: '', icon: '📦', color: '#241a5e' }); load(); toast.success('Added') } catch (e) { toast.error(e.message) } }
  return (
    <div className="space-y-2">
      <div className="bg-white border rounded-xl p-2 grid grid-cols-4 gap-2 text-[11px] items-end">
        <input placeholder="English" value={n.nameEnglish} onChange={e => setN({ ...n, nameEnglish: e.target.value })} className="border rounded p-1" />
        <input placeholder="Odia" value={n.nameOdia} onChange={e => setN({ ...n, nameOdia: e.target.value })} className="border rounded p-1" />
        <input placeholder="icon" value={n.icon} onChange={e => setN({ ...n, icon: e.target.value })} className="border rounded p-1" />
        <button onClick={add} className="bg-indigo-900 text-white rounded-full px-3 py-1">Add</button>
      </div>
      {cats.map(c => <div key={c.id} className="bg-white border rounded-xl p-2 text-[12px] flex items-center gap-2"><span>{c.icon}</span><span className="flex-1 font-bold">{c.nameEnglish}</span><span className="text-gray-400">{c.nameOdia}</span></div>)}
    </div>
  )
}

const BLANK_COUPON = { code: '', kind: 'pct', value: 20, maxDiscount: '', minOrder: 0, validFrom: '', validTo: '', usageLimit: '', perUserLimit: 1, active: true, labelOdia: '', labelEnglish: '' }

function CouponsTab() {
  const [list, setList] = useState([])
  const [edit, setEdit] = useState(null)
  const load = () => sget('/admin/store/coupons').then(r => setList(r.coupons || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const seedFestive = async () => { try { const r = await spost('/admin/store/seed-festive', {}); toast.success(`FESTIVE2026 ready`); load() } catch (e) { toast.error(e.message) } }
  const toISODate = (v) => v ? String(v).slice(0, 10) : ''
  const save = async (c) => {
    try {
      const body = { ...c }
      if (c.id) body.id = c.id
      // normalise date-only inputs to ISO (end-of-day for validTo)
      if (body.validFrom && body.validFrom.length === 10) body.validFrom = new Date(body.validFrom + 'T00:00:00').toISOString()
      if (body.validTo && body.validTo.length === 10) body.validTo = new Date(body.validTo + 'T23:59:59').toISOString()
      await spost('/admin/store/coupons', body)
      setEdit(null); load(); toast.success('Saved')
    } catch (e) { toast.error(e.message) }
  }
  const toggle = async (c) => { try { await spost('/admin/store/coupons', { id: c.id, active: !c.active }); load(); toast.success(c.active ? 'Turned off' : 'Turned on') } catch (e) { toast.error(e.message) } }
  if (edit) return <CouponForm coupon={edit} onSave={save} onClose={() => setEdit(null)} />
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button onClick={() => setEdit({ ...BLANK_COUPON })} className="bg-rose-600 text-white text-sm font-bold rounded-full px-4 py-1.5">+ New coupon</button>
        <button onClick={seedFestive} className="bg-amber-500 text-white text-sm font-bold rounded-full px-4 py-1.5">🎉 Create FESTIVE2026</button>
      </div>
      {list.map(c => {
        const expired = c.validTo && new Date(c.validTo).getTime() < Date.now()
        return (
          <div key={c.id} className="bg-white border rounded-xl p-2.5 text-[12px] flex items-center gap-2">
            <div className="flex-1">
              <div className="font-mono font-bold">{c.code} {!c.active && <span className="text-[10px] text-gray-400">(off)</span>}{expired && <span className="text-[10px] text-rose-500"> expired</span>}</div>
              <div className="text-[11px] text-gray-500">
                {c.kind === 'pct' ? `${c.value}%` : `₹${c.value}`}{c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ''}{c.minOrder ? ` • min ₹${c.minOrder}` : ''}{c.perUserLimit != null ? ` • ${c.perUserLimit}/buyer` : ''}{c.usageLimit != null ? ` • cap ${c.usageLimit}` : ''}{c.validTo ? ` • till ${(c.validTo || '').slice(0, 10)}` : ''}
              </div>
            </div>
            <button onClick={() => toggle(c)} className={`text-[10px] rounded-full px-2 py-0.5 border ${c.active ? 'text-green-600' : 'text-gray-400'}`}>{c.active ? 'On' : 'Off'}</button>
            <button onClick={() => setEdit({ ...c, validFrom: toISODate(c.validFrom), validTo: toISODate(c.validTo), maxDiscount: c.maxDiscount ?? '', usageLimit: c.usageLimit ?? '', perUserLimit: c.perUserLimit ?? '' })} className="text-[11px] font-bold rounded-full px-3 py-1 bg-indigo-900 text-white">Edit</button>
          </div>
        )
      })}
      {list.length === 0 && <div className="text-sm text-gray-400">No coupons yet.</div>}
    </div>
  )
}

function CouponForm({ coupon, onSave, onClose }) {
  const [c, setC] = useState(coupon)
  const up = (k, v) => setC(s => ({ ...s, [k]: v }))
  return (
    <div className="bg-white border rounded-xl p-3 space-y-2 text-[11px]">
      <div className="flex justify-between"><div className="font-bold text-sm">{c.id ? `Edit ${c.code}` : 'New coupon'}</div><button onClick={onClose} className="text-xs text-gray-400">Close</button></div>
      <div className="grid grid-cols-3 gap-2">
        <div><div>Code</div><input value={c.code} onChange={e => up('code', e.target.value.toUpperCase())} className="w-full border rounded p-1 font-mono" /></div>
        <div><div>Type</div><select value={c.kind} onChange={e => up('kind', e.target.value)} className="w-full border rounded p-1"><option value="pct">% percentage</option><option value="flat">₹ flat</option></select></div>
        <div><div>Value {c.kind === 'pct' ? '(%)' : '(₹)'}</div><input type="number" value={c.value} onChange={e => up('value', Number(e.target.value))} className="w-full border rounded p-1" /></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><div>Max discount ₹</div><input type="number" placeholder="no cap" value={c.maxDiscount} onChange={e => up('maxDiscount', e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Min order ₹</div><input type="number" value={c.minOrder} onChange={e => up('minOrder', Number(e.target.value))} className="w-full border rounded p-1" /></div>
        <div className="flex items-end"><label className="flex items-center gap-1.5"><input type="checkbox" checked={c.active !== false} onChange={e => up('active', e.target.checked)} />Active</label></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><div>Valid from</div><input type="date" value={c.validFrom || ''} onChange={e => up('validFrom', e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Valid to</div><input type="date" value={c.validTo || ''} onChange={e => up('validTo', e.target.value)} className="w-full border rounded p-1" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><div>Per buyer limit</div><input type="number" placeholder="unlimited" value={c.perUserLimit} onChange={e => up('perUserLimit', e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Total cap</div><input type="number" placeholder="no cap" value={c.usageLimit} onChange={e => up('usageLimit', e.target.value)} className="w-full border rounded p-1" /></div>
      </div>
      <div><div>Checkout label (Odia)</div><input value={c.labelOdia || ''} onChange={e => up('labelOdia', e.target.value)} className="w-full border rounded p-1" /></div>
      <button onClick={() => onSave(c)} className="bg-indigo-900 text-white text-sm font-bold rounded-full px-5 py-1.5">Save coupon</button>
    </div>
  )
}

function OrdersTab() {
  const [list, setList] = useState([])
  const load = () => sget('/admin/store/orders').then(r => setList(r.orders || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const refund = async (id) => { if (!confirm('Refund & revoke access?')) return; try { await spost('/admin/store/refund', { orderId: id }); load(); toast.success('Refunded') } catch (e) { toast.error(e.message) } }
  return (
    <div className="space-y-2">
      {list.map(o => <div key={o.id} className="bg-white border rounded-xl p-2 text-[12px] flex items-center gap-2"><div className="flex-1"><span className="font-mono">#{o.id.slice(-8)}</span> • {o.status} • {money(o.total)}<div className="text-[10px] text-gray-400 line-clamp-1">{o.items.map(i => i.title).join(', ')}</div></div>{o.status === 'paid' && <button onClick={() => refund(o.id)} className="text-[10px] text-rose-600 border rounded-full px-2 py-0.5">Refund</button>}</div>)}
      {list.length === 0 && <div className="text-sm text-gray-400">No orders.</div>}
    </div>
  )
}

function AnalyticsTab() {
  const [a, setA] = useState(null)
  useEffect(() => { sget('/admin/store/analytics').then(setA).catch(() => {}) }, [])
  if (!a) return <div className="text-sm text-gray-400">Loading…</div>
  const F = a.funnel || {}
  return (
    <div className="grid grid-cols-2 gap-2 text-[12px]">
      {[['Revenue (30d)', money(a.revenue)], ['Orders', a.orders], ['Avg order', money(a.aov)], ['Refunds', a.refunds], ['Views', F.views], ['Add to cart', F.carts], ['Checkouts', F.checkouts], ['Paid', F.paid], ['Denied access', a.denied]].map(([l, v]) => <div key={l} className="bg-white border rounded-xl p-2"><div className="text-[10px] text-gray-400">{l}</div><div className="font-extrabold text-indigo-900">{v}</div></div>)}
    </div>
  )
}

function BulkTab() {
  const [cls, setCls] = useState('6')
  const [exam, setExam] = useState('SA-1 2026')
  const [price, setPrice] = useState(29)
  const [mrp, setMrp] = useState(49)
  const [sec, setSec] = useState(3)
  const [cats, setCats] = useState([])
  const [catId, setCatId] = useState('')
  const [papers, setPapers] = useState([])
  const [files, setFiles] = useState([])
  const [map, setMap] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [shellBusy, setShellBusy] = useState(false)
  const createShells = async () => {
    if (!confirm(`Create DRAFT product shells for ${exam}${cls === 'all' ? ' (all classes, 63 papers)' : ` Class ${cls}`}? You upload files + publish each later.`)) return
    setShellBusy(true)
    try { const r = await spost('/admin/store/draft-shells', { exam, class: cls === 'all' ? null : cls, priceInr: price, mrpInr: mrp, securityLevel: sec, categoryId: catId }); toast.success(`Created ${r.created} drafts (${r.skipped} already existed)`) }
    catch (e) { toast.error(e.message) } finally { setShellBusy(false) }
  }
  useEffect(() => { sget('/admin/store/categories').then(r => { setCats(r.categories || []); setCatId((r.categories || []).find(c => c.nameEnglish === 'Answer Keys')?.id || '') }).catch(() => {}) }, [])
  useEffect(() => { sget(`/admin/store/papers?class=${cls}`).then(r => setPapers(r.papers || [])).catch(() => setPapers([])) }, [cls])
  const onFiles = (e) => { setFiles(Array.from(e.target.files || [])) }
  const submit = async () => {
    if (!files.length) { toast.error('Choose files'); return }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('class', cls); fd.append('exam', exam); fd.append('priceInr', String(price)); fd.append('mrpInr', String(mrp)); fd.append('securityLevel', String(sec)); fd.append('categoryId', catId)
      fd.append('mapping', JSON.stringify(map))
      files.forEach(f => fd.append('files', f))
      const r = await fetch(`${API}/admin/store/bulk/answer-keys`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed')
      setDone(d.created || []); toast.success(`Created ${d.count} draft products — review & publish in Products`)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="bg-white border rounded-xl p-3 space-y-2 text-[12px]">
      <div className="text-[11px] text-gray-500">Upload many answer-key PDFs at once. Pick class + exam once, map each file to a paper. Products are created as DRAFTS to review and publish together.</div>
      <div className="grid grid-cols-3 gap-2">
        <div><div>Class</div><select value={cls} onChange={e => setCls(e.target.value)} className="w-full border rounded p-1"><option value="all">All classes</option>{Array.from({ length: 10 }, (_, i) => String(i + 1)).map(c => <option key={c}>{c}</option>)}</select></div>
        <div><div>Exam</div><input value={exam} onChange={e => setExam(e.target.value)} className="w-full border rounded p-1" /></div>
        <div><div>Category</div><select value={catId} onChange={e => setCatId(e.target.value)} className="w-full border rounded p-1"><option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.nameEnglish}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><div>Price ₹</div><input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} className="w-full border rounded p-1" /></div>
        <div><div>MRP ₹</div><input type="number" value={mrp} onChange={e => setMrp(Number(e.target.value))} className="w-full border rounded p-1" /></div>
        <div><div>Security</div><select value={sec} onChange={e => setSec(Number(e.target.value))} className="w-full border rounded p-1">{[1, 2, 3, 4].map(n => <option key={n} value={n}>Level {n}</option>)}</select></div>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
        <div className="text-[11px] font-bold text-amber-800">Quick start — create draft shells</div>
        <div className="text-[10px] text-gray-600">Makes an empty DRAFT product for every paper (using the class/exam/defaults above). Then upload a file + publish each in Products.</div>
        <button disabled={shellBusy} onClick={createShells} className="mt-1 bg-amber-500 text-white font-bold rounded-full px-4 py-1 text-[11px] disabled:opacity-50">{shellBusy ? 'Creating…' : `Create drafts for ${cls === 'all' ? 'all classes' : 'Class ' + cls}`}</button>
      </div>
      <div><div>Files (PDF)</div><input type="file" multiple accept="application/pdf" onChange={onFiles} /></div>
      {files.map(f => (
        <div key={f.name} className="flex items-center gap-2">
          <span className="flex-1 truncate">{f.name}</span>
          <select value={map[f.name] || ''} onChange={e => setMap(m => ({ ...m, [f.name]: e.target.value }))} className="border rounded p-1 text-[11px] max-w-[55%]">
            <option value="">— map to paper —</option>
            {papers.map(p => <option key={p.id} value={p.id}>{p.nameEnglish} ({p.paperType})</option>)}
          </select>
        </div>
      ))}
      <button disabled={busy} onClick={submit} className="bg-rose-600 text-white font-bold rounded-full px-5 py-1.5 disabled:opacity-50">{busy ? 'Uploading…' : `Create ${files.length} drafts`}</button>
      {done && <div className="text-[11px] text-green-700">Created {done.filter(x => x.id).length} drafts. Go to Products to review & publish.</div>}
    </div>
  )
}

function ReviewsTab() {
  const [list, setList] = useState([])
  const load = () => sget('/admin/store/reviews').then(r => setList(r.reviews || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const toggle = async (id, hidden) => { try { await spost(`/admin/store/reviews/${id}/hide`, { hidden }); load(); toast.success(hidden ? 'Hidden' : 'Shown') } catch (e) { toast.error(e.message) } }
  return (
    <div className="space-y-2">
      {list.map(r => (
        <div key={r.id} className={`bg-white border rounded-xl p-2 text-[12px] ${r.hidden ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2"><span className="text-amber-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span><span className="font-bold">{r.userName}</span>{r.hidden && <span className="text-[10px] text-rose-500">hidden</span>}</div>
          {r.text && <div className="text-gray-600 mt-0.5">{r.text}</div>}
          <button onClick={() => toggle(r.id, !r.hidden)} className="mt-1 text-[10px] border rounded-full px-2 py-0.5">{r.hidden ? 'Unhide' : 'Hide'}</button>
        </div>
      ))}
      {list.length === 0 && <div className="text-sm text-gray-400">No reviews yet.</div>}
    </div>
  )
}

function ShipmentsTab() {
  const [list, setList] = useState([])
  useEffect(() => { sget('/admin/store/shipments').then(r => setList(r.shipments || [])).catch(() => {}) }, [])
  const update = async (id, status) => { try { await spost(`/admin/store/shipments/${id}/status`, { status }); setList(l => l.map(s => s.id === id ? { ...s, status } : s)); toast.success(status) } catch (e) { toast.error(e.message) } }
  const STEPS = ['Ordered', 'Confirmed', 'Printing', 'Packed', 'Shipped', 'Out for delivery', 'Delivered']
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-gray-400">Physical orders (feature flag — teacher screens stay hidden until enabled).</div>
      {list.map(s => <div key={s.id} className="bg-white border rounded-xl p-2 text-[12px]"><div className="flex justify-between"><span className="font-mono">#{s.id.slice(-8)}</span><span>{money(s.total)}</span></div><div className="text-[10px] text-gray-500">{s.copies} copies • {s.status}</div><select value={s.status} onChange={e => update(s.id, e.target.value)} className="border rounded p-1 text-[11px] mt-1">{STEPS.concat(['Cancelled', 'Returned']).map(x => <option key={x}>{x}</option>)}</select></div>)}
      {list.length === 0 && <div className="text-sm text-gray-400">No physical orders.</div>}
    </div>
  )
}
