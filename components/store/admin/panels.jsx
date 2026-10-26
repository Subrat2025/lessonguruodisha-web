'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { sget, spost, sput, money } from '@/components/store/api'

const IND = '#241a5e', CORAL = '#e8452c'
const H1 = ({ children }) => <h1 className="text-2xl font-extrabold mb-4" style={{ color: IND }}>{children}</h1>
const Cardy = ({ children, className = '' }) => <div className={`bg-white rounded-[18px] border border-gray-100 p-4 ${className}`}>{children}</div>

/* ---------------- Dashboard ---------------- */
export function DashboardPanel() {
  const [d, setD] = useState(null)
  useEffect(() => { sget('/admin/store/dashboard').then(setD).catch(() => {}) }, [])
  if (!d) return <div className="text-sm text-gray-400">Loading…</div>
  const maxRev = Math.max(1, ...((d.trend || []).map(t => t.revenue)))
  const dayLabel = (iso) => { try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' }) } catch { return iso.slice(5) } }
  return (
    <div>
      <H1>Dashboard</H1>
      <div className="text-[11px] text-gray-400 mb-3">Real sales only — TEST accounts & simulated payments excluded.</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[['Today', d.today?.revenue, `${d.today?.orders || 0} orders`], ['This month', d.month?.revenue, `${d.month?.orders || 0} orders`]].map(([l, v, s]) => (
          <Cardy key={l}><div className="text-[11px] text-gray-400">{l}</div><div className="text-2xl font-extrabold" style={{ color: IND }}>{money(v)}</div><div className="text-[12px] text-gray-500">{s}</div></Cardy>
        ))}
        <Cardy><div className="text-[11px] text-gray-400">Refunds (month)</div><div className="text-2xl font-extrabold" style={{ color: CORAL }}>{money(d.refunds?.amount)}</div><div className="text-[12px] text-gray-500">{d.refunds?.count || 0} refunds</div></Cardy>
        <Cardy><div className="text-[11px] text-gray-400">Coupons used</div><div className="text-2xl font-extrabold" style={{ color: IND }}>{(d.coupons || []).reduce((a, c) => a + c.uses, 0)}</div><div className="text-[12px] text-gray-500">{money((d.coupons || []).reduce((a, c) => a + c.discount, 0))} given</div></Cardy>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Cardy><div className="text-[12px] font-bold text-gray-600 mb-2">Last 7 days</div>
          <div className="flex items-end gap-2 h-32">{(d.trend || []).map(t => (<div key={t.date} className="flex-1 flex flex-col items-center justify-end h-full"><div className="text-[9px] text-gray-500 mb-0.5">{t.revenue ? `₹${t.revenue}` : ''}</div><div className="w-full rounded-t" style={{ height: `${Math.round((t.revenue / maxRev) * 100)}%`, minHeight: t.revenue ? 4 : 2, background: t.revenue ? IND : '#e5e7eb' }} /><div className="text-[9px] text-gray-400 mt-1">{dayLabel(t.date)}</div></div>))}</div>
        </Cardy>
        <Cardy><div className="text-[12px] font-bold text-gray-600 mb-1.5">Top 5 best-sellers (this month)</div>
          {(d.top || []).length === 0 && <div className="text-[12px] text-gray-400">No sales yet this month.</div>}
          {(d.top || []).map((t, i) => (<div key={t.productId} className="flex items-center gap-2 text-[12px] py-1.5 border-b last:border-0"><span className="w-4 text-gray-400 font-bold">{i + 1}</span><span className="flex-1 truncate">{t.titleOdia || t.title}</span><span className="text-gray-500">{t.units}×</span><span className="font-bold" style={{ color: IND }}>{money(t.revenue)}</span></div>))}
        </Cardy>
      </div>
    </div>
  )
}

/* ---------------- Coupons ---------------- */
const BLANK_C = { code: '', kind: 'pct', value: 20, maxDiscount: '', minOrder: 0, validFrom: '', validTo: '', usageLimit: '', perUserLimit: 1, active: true, labelOdia: '' }
export function CouponsPanel() {
  const [list, setList] = useState([]); const [edit, setEdit] = useState(null)
  const load = () => sget('/admin/store/coupons').then(r => setList(r.coupons || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const toISO = v => v ? String(v).slice(0, 10) : ''
  const save = async (c) => {
    try { const b = { ...c }; if (c.id) b.id = c.id; if (b.validFrom && b.validFrom.length === 10) b.validFrom = new Date(b.validFrom + 'T00:00:00').toISOString(); if (b.validTo && b.validTo.length === 10) b.validTo = new Date(b.validTo + 'T23:59:59').toISOString(); await spost('/admin/store/coupons', b); setEdit(null); load(); toast.success('Saved') } catch (e) { toast.error(e.message) }
  }
  const toggle = async (c) => { try { await spost('/admin/store/coupons', { id: c.id, active: !c.active }); load() } catch (e) { toast.error(e.message) } }
  const seedFestive = async () => { try { await spost('/admin/store/seed-festive', {}); load(); toast.success('FESTIVE2026 ready') } catch (e) { toast.error(e.message) } }
  if (edit) return <CouponForm c={edit} onSave={save} onClose={() => setEdit(null)} />
  return (
    <div><H1>Coupons</H1>
      <div className="flex gap-2 mb-3"><button onClick={() => setEdit({ ...BLANK_C })} className="font-bold text-sm rounded-full px-4 py-2 text-white" style={{ background: CORAL }}>+ New coupon</button><button onClick={seedFestive} className="font-bold text-sm rounded-full px-4 py-2 text-white" style={{ background: '#f7b32b' }}>🎉 Create FESTIVE2026</button></div>
      <div className="space-y-2">{list.map(c => { const exp = c.validTo && new Date(c.validTo).getTime() < Date.now(); return (
        <div key={c.id} className="bg-white rounded-[18px] border border-gray-100 p-3 flex items-center gap-2 text-[13px]">
          <div className="flex-1"><div className="font-mono font-bold">{c.code} {!c.active && <span className="text-[10px] text-gray-400">(off)</span>}{exp && <span className="text-[10px] text-rose-500"> expired</span>}</div><div className="text-[11px] text-gray-500">{c.kind === 'pct' ? `${c.value}%` : `₹${c.value}`}{c.maxDiscount ? ` (max ₹${c.maxDiscount})` : ''}{c.perUserLimit != null ? ` · ${c.perUserLimit}/buyer` : ''}{c.validTo ? ` · till ${(c.validTo || '').slice(0, 10)}` : ''}</div></div>
          <button onClick={() => toggle(c)} className="text-[11px] rounded-full px-2 py-0.5 border" style={{ color: c.active ? '#2a9d5c' : '#9ca3af' }}>{c.active ? 'On' : 'Off'}</button>
          <button onClick={() => setEdit({ ...c, validFrom: toISO(c.validFrom), validTo: toISO(c.validTo), maxDiscount: c.maxDiscount ?? '', usageLimit: c.usageLimit ?? '', perUserLimit: c.perUserLimit ?? '' })} className="text-[12px] font-bold rounded-full px-3 py-1 text-white" style={{ background: IND }}>Edit</button>
        </div>) })}
        {list.length === 0 && <div className="text-sm text-gray-400">No coupons yet.</div>}
      </div>
    </div>
  )
}
function CouponForm({ c, onSave, onClose }) {
  const [s, setS] = useState(c); const up = (k, v) => setS(x => ({ ...x, [k]: v }))
  const inp = 'w-full border rounded-lg px-3 py-2 text-sm'
  return (<Cardy><div className="flex justify-between mb-2"><div className="font-bold" style={{ color: IND }}>{c.id ? `Edit ${c.code}` : 'New coupon'}</div><button onClick={onClose} className="text-xs text-gray-400">Close</button></div>
    <div className="grid grid-cols-3 gap-3 text-[12px]">
      <div><div>Code</div><input value={s.code} onChange={e => up('code', e.target.value.toUpperCase())} className={inp + ' font-mono'} /></div>
      <div><div>Type</div><select value={s.kind} onChange={e => up('kind', e.target.value)} className={inp}><option value="pct">% percentage</option><option value="flat">₹ flat</option></select></div>
      <div><div>Value</div><input type="number" value={s.value} onChange={e => up('value', Number(e.target.value))} className={inp} /></div>
      <div><div>Max discount ₹</div><input type="number" placeholder="no cap" value={s.maxDiscount} onChange={e => up('maxDiscount', e.target.value)} className={inp} /></div>
      <div><div>Min order ₹</div><input type="number" value={s.minOrder} onChange={e => up('minOrder', Number(e.target.value))} className={inp} /></div>
      <div className="flex items-end"><label className="flex items-center gap-1.5"><input type="checkbox" checked={s.active !== false} onChange={e => up('active', e.target.checked)} />Active</label></div>
      <div><div>Valid from</div><input type="date" value={s.validFrom || ''} onChange={e => up('validFrom', e.target.value)} className={inp} /></div>
      <div><div>Valid to</div><input type="date" value={s.validTo || ''} onChange={e => up('validTo', e.target.value)} className={inp} /></div>
      <div><div>Per buyer</div><input type="number" placeholder="∞" value={s.perUserLimit} onChange={e => up('perUserLimit', e.target.value)} className={inp} /></div>
      <div className="col-span-3"><div>Checkout label (Odia)</div><input value={s.labelOdia || ''} onChange={e => up('labelOdia', e.target.value)} className={inp} /></div>
    </div>
    <button onClick={() => onSave(s)} className="mt-3 font-bold text-white rounded-full px-5 py-2 text-sm" style={{ background: IND }}>Save coupon</button>
  </Cardy>)
}

/* ---------------- Orders ---------------- */
export function OrdersPanel() {
  const [list, setList] = useState([])
  const load = () => sget('/admin/store/orders').then(r => setList(r.orders || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const refund = async (id) => { if (!confirm('Refund & revoke access?')) return; try { await spost('/admin/store/refund', { orderId: id }); load(); toast.success('Refunded') } catch (e) { toast.error(e.message) } }
  return (<div><H1>Orders</H1><div className="space-y-2">{list.map(o => (
    <div key={o.id} className="bg-white rounded-[18px] border border-gray-100 p-3 flex items-center gap-2 text-[13px]"><div className="flex-1"><span className="font-mono">#{o.id.slice(-8)}</span> · <b>{o.status}</b> · {money(o.total)}<div className="text-[11px] text-gray-400 truncate">{o.items.map(i => i.title).join(', ')}</div></div>{o.status === 'paid' && <button onClick={() => refund(o.id)} className="text-[11px] text-rose-600 border rounded-full px-3 py-1">Refund</button>}</div>))}
    {list.length === 0 && <div className="text-sm text-gray-400">No orders.</div>}</div></div>)
}

/* ---------------- Categories ---------------- */
export function CategoriesPanel() {
  const [cats, setCats] = useState([]); const [n, setN] = useState({ nameEnglish: '', nameOdia: '', icon: '📦' })
  const load = () => sget('/admin/store/categories').then(r => setCats(r.categories || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const add = async () => { try { await spost('/admin/store/categories', n); setN({ nameEnglish: '', nameOdia: '', icon: '📦' }); load(); toast.success('Added') } catch (e) { toast.error(e.message) } }
  const seed = async () => { try { const r = await spost('/admin/store/seed', {}); toast.success(`Seeded ${r.categoriesCreated} categories`); load() } catch (e) { toast.error(e.message) } }
  const inp = 'border rounded-lg px-3 py-2 text-sm'
  return (<div><H1>Categories</H1>
    <Cardy className="mb-3"><div className="grid grid-cols-4 gap-2 items-end"><input placeholder="English" value={n.nameEnglish} onChange={e => setN({ ...n, nameEnglish: e.target.value })} className={inp} /><input placeholder="Odia" value={n.nameOdia} onChange={e => setN({ ...n, nameOdia: e.target.value })} className={inp} /><input placeholder="icon" value={n.icon} onChange={e => setN({ ...n, icon: e.target.value })} className={inp} /><button onClick={add} className="font-bold text-white rounded-full px-3 py-2 text-sm" style={{ background: IND }}>Add</button></div>
      <button onClick={seed} className="mt-2 text-[12px] rounded-full px-3 py-1.5 bg-gray-100">Seed default categories + indexes</button></Cardy>
    <div className="space-y-2">{cats.map(c => <div key={c.id} className="bg-white rounded-[18px] border border-gray-100 p-3 flex items-center gap-2 text-[13px]"><span>{c.icon}</span><span className="flex-1 font-bold">{c.nameEnglish}</span><span className="text-gray-400">{c.nameOdia}</span></div>)}</div>
  </div>)
}

/* ---------------- Share links ---------------- */
export function ShareLinksPanel() {
  const [links, setLinks] = useState([]); const [prods, setProds] = useState({})
  useEffect(() => { sget('/admin/store/share-links').then(r => setLinks(r.links || [])).catch(() => {}); sget('/admin/store/products').then(r => setProds(Object.fromEntries((r.products || []).map(p => [p.id, p.titleEnglish])))).catch(() => {}) }, [])
  return (<div><H1>Share links</H1><div className="text-[12px] text-gray-400 mb-3">Tagged links (?src=) tracked per product. Build new ones from Products → Share.</div>
    <div className="bg-white rounded-[18px] border border-gray-100 overflow-hidden">{links.map((l, i) => (<div key={l.id} className="flex items-center gap-2 px-4 py-3 text-[13px]" style={{ borderTop: i ? '1px solid #f1f1f4' : 'none' }}><div className="flex-1 truncate"><span className="font-mono" style={{ color: IND }}>?src={l.tag}</span> <span className="text-gray-400">· {prods[l.productId] || l.productId.slice(-6)}</span></div><span className="text-gray-500">{l.clicks} clicks</span></div>))}
      {links.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No share links yet.</div>}</div></div>)
}

/* ---------------- Analytics ---------------- */
export function AnalyticsPanel() {
  const [a, setA] = useState(null)
  useEffect(() => { sget('/admin/store/analytics').then(setA).catch(() => {}) }, [])
  if (!a) return <div className="text-sm text-gray-400">Loading…</div>
  const F = a.funnel || {}
  return (<div><H1>Analytics (30 days)</H1><div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{[['Revenue', money(a.revenue)], ['Orders', a.orders], ['Avg order', money(a.aov)], ['Refunds', a.refunds], ['Views', F.views], ['Add to cart', F.carts], ['Checkouts', F.checkouts], ['Paid', F.paid], ['Denied access', a.denied]].map(([l, v]) => <Cardy key={l}><div className="text-[11px] text-gray-400">{l}</div><div className="text-xl font-extrabold" style={{ color: IND }}>{v}</div></Cardy>)}</div></div>)
}

/* ---------------- Settings ---------------- */
export function SettingsPanel() {
  const [s, setS] = useState(null)
  useEffect(() => { sget('/admin/store/settings').then(r => setS(r.settings)).catch(() => {}) }, [])
  const save = async () => { try { const r = await sput('/admin/store/settings', s); setS(r.settings); toast.success('Saved') } catch (e) { toast.error(e.message) } }
  if (!s) return <div className="text-sm text-gray-400">Loading…</div>
  const inp = 'w-full border rounded-lg px-3 py-2 text-sm'
  return (<div><H1>Settings</H1><Cardy className="space-y-3">
    <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.enabled} onChange={e => setS({ ...s, enabled: e.target.checked })} /><span className="font-bold text-sm">Master switch (store live for everyone)</span></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.physicalEnabled} onChange={e => setS({ ...s, physicalEnabled: e.target.checked })} /><span className="text-sm">Physical printed orders (beta)</span></label>
    <div><div className="text-[12px] font-bold">Beta testers (mobiles)</div><textarea rows={2} value={(s.betaTesters || []).join(', ')} onChange={e => setS({ ...s, betaTesters: e.target.value.split(/[\s,]+/).map(x => x.replace(/[^0-9]/g, '')).filter(Boolean) })} className={inp} /><div className="text-[10px] text-gray-400">When master switch OFF, only these see the catalog.</div></div>
    <div className="grid grid-cols-3 gap-2 text-[12px]"><div><div>Default security</div><select value={s.defaultSecurityLevel} onChange={e => setS({ ...s, defaultSecurityLevel: Number(e.target.value) })} className={inp}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>Level {n}</option>)}</select></div><div><div>Support WhatsApp</div><input value={s.supportWhatsapp || ''} onChange={e => setS({ ...s, supportWhatsapp: e.target.value })} className={inp} /></div><div><div>GSTIN</div><input value={s.gstin || ''} onChange={e => setS({ ...s, gstin: e.target.value })} className={inp} /></div></div>
    <button onClick={save} className="font-bold text-white rounded-full px-5 py-2 text-sm" style={{ background: IND }}>Save</button>
  </Cardy></div>)
}

/* ---------------- Banners (lightweight) ---------------- */
export function BannersPanel() {
  return (<div><H1>Banners</H1><Cardy><div className="text-sm text-gray-600">The store home hero shows your <b>Featured</b> products. To feature a product, open it in <b>Products</b> and turn on “Feature on store home”. Dedicated promo banners can be added later.</div></Cardy></div>)
}
