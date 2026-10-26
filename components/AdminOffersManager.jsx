'use client'
// =============================================================================
//  AdminOffersManager — Full CRUD UI for the Premium Offer campaigns.
//    - List all offers (active + inactive)
//    - Create / Edit / Delete / Duplicate / Toggle status
//    - Fields: name, banner text, badge, dates, discount type & value,
//              applicable plans, colour, validity mode, priority, status
//    - Talks to /api/admin/offers · /admin/offers/:id · /admin/offers/:id/duplicate
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Edit3, Trash2, Copy, X, Loader2, Zap, ZapOff, Sparkles, Calendar, Percent, IndianRupee, Tag, BarChart3, TrendingUp, MousePointerClick, Eye, ShoppingCart, IndianRupee as INR, Trophy, Target } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from 'recharts'

const authedFetch = async (url, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

// Format Date → local "yyyy-MM-ddThh:mm" string for <input type="datetime-local">
const toLocalInput = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

// -----------------------------------------------------------------------------
export default function AdminOffersManager() {
  const [tab, setTab] = useState('campaigns')  // 'campaigns' | 'analytics'
  const [offers, setOffers] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)                  // full offer object or {} for new
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const [o, p] = await Promise.all([
        authedFetch('/api/admin/offers'),
        authedFetch('/api/plans'),
      ])
      setOffers(o.offers || [])
      setPlans((p.plans || []).filter(pl => pl.id !== 'free'))
    } catch (e) { toast.error(e.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const now = Date.now()
  const withStatus = useMemo(() => offers.map(o => {
    const startsMs = new Date(o.startsAt).getTime()
    const endsMs = new Date(o.endsAt).getTime()
    let liveStatus = 'inactive'
    if (o.status === 'active') {
      if (endsMs <= now) liveStatus = 'expired'
      else if (startsMs > now) liveStatus = 'scheduled'
      else liveStatus = 'live'
    }
    return { ...o, liveStatus, startsMs, endsMs }
  }), [offers, now])

  const remove = async (id) => {
    if (!confirm('Delete this offer permanently?')) return
    try {
      setBusyId(id)
      await authedFetch(`/api/admin/offers/${id}`, { method: 'DELETE' })
      toast.success('Offer deleted.')
      load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyId(null) }
  }

  const duplicate = async (id) => {
    try {
      setBusyId(id)
      await authedFetch(`/api/admin/offers/${id}/duplicate`, { method: 'POST' })
      toast.success('Offer duplicated as an inactive draft.')
      load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyId(null) }
  }

  const toggleStatus = async (offer) => {
    try {
      setBusyId(offer.id)
      const next = offer.status === 'active' ? 'inactive' : 'active'
      await authedFetch(`/api/admin/offers/${offer.id}`, { method: 'PUT', body: JSON.stringify({ status: next }) })
      toast.success(`Offer ${next === 'active' ? 'enabled' : 'disabled'}.`)
      load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      {/* Tab Switcher */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100">
        <button
          onClick={() => setTab('campaigns')}
          className={`flex-1 text-[11px] font-black rounded-lg px-3 py-1.5 flex items-center justify-center gap-1 transition ${tab === 'campaigns' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <Sparkles className="w-3 h-3" /> Campaigns
        </button>
        <button
          onClick={() => setTab('analytics')}
          className={`flex-1 text-[11px] font-black rounded-lg px-3 py-1.5 flex items-center justify-center gap-1 transition ${tab === 'analytics' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <BarChart3 className="w-3 h-3" /> Analytics
        </button>
      </div>

      {tab === 'analytics' ? (
        <AnalyticsPanel offers={offers} />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-black text-slate-900 flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-amber-600" /> Offer Campaigns
              </div>
              <div className="text-[10.5px] text-slate-500">Create limited-time offers with live countdowns and per-plan discounts.</div>
            </div>
            <button onClick={() => setEditing({})}
              className="text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full px-3 py-1.5 shadow flex items-center gap-1 active:scale-95">
              <Plus className="w-3.5 h-3.5" /> New Offer
            </button>
          </div>

          {/* Offers list */}
          {loading ? (
            <div className="p-6 text-center text-slate-500 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading offers…</div>
          ) : !offers.length ? (
            <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 p-4 text-center text-[11px] text-slate-500">
              No offers yet. Click <b>New Offer</b> to launch your first limited-time campaign.
            </div>
          ) : (
            <div className="space-y-2">
              {withStatus.map(o => (
                <OfferRow key={o.id} offer={o} busy={busyId === o.id}
                  onEdit={() => setEditing(o)} onDelete={() => remove(o.id)}
                  onDuplicate={() => duplicate(o.id)} onToggle={() => toggleStatus(o)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Editor modal */}
      <AnimatePresence>
        {editing !== null && (
          <OfferEditor offer={editing} plans={plans}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// -----------------------------------------------------------------------------
const STATUS_CHIP = {
  live:      'bg-emerald-100 text-emerald-800 border-emerald-300',
  scheduled: 'bg-blue-100 text-blue-800 border-blue-300',
  expired:   'bg-slate-100 text-slate-500 border-slate-200',
  inactive:  'bg-amber-50 text-amber-700 border-amber-200',
}
const STATUS_LABEL = { live: '🟢 LIVE NOW', scheduled: '📅 SCHEDULED', expired: '⏰ EXPIRED', inactive: '⏸️ DRAFT' }

const OfferRow = ({ offer, busy, onEdit, onDelete, onDuplicate, onToggle }) => {
  const startsMs = new Date(offer.startsAt).getTime()
  const endsMs   = new Date(offer.endsAt).getTime()
  const chip = STATUS_CHIP[offer.liveStatus] || STATUS_CHIP.inactive
  const label = STATUS_LABEL[offer.liveStatus] || STATUS_LABEL.inactive
  const discountStr = offer.discountType === 'percent'
    ? `${offer.discountValue}% OFF`
    : `₹${offer.discountValue} OFF`
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 hover:border-amber-300 transition">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="text-[11px] font-black text-slate-900 truncate">{offer.name}</div>
            <span className={`text-[9px] font-black uppercase rounded px-1.5 py-0.5 border ${chip}`}>{label}</span>
            <span className="text-[9px] font-bold bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">{discountStr}</span>
            {offer.priority > 0 && <span className="text-[9px] font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">P{offer.priority}</span>}
          </div>
          <div className="text-[10px] text-slate-600 truncate mt-0.5">{offer.badge} · {offer.bannerText}</div>
          <div className="text-[9.5px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" /> {new Date(startsMs).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <span>→</span>
            <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" /> {new Date(endsMs).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <span className="text-slate-300">·</span>
            <span>Plans: {(offer.applicablePlanIds && offer.applicablePlanIds.length) ? offer.applicablePlanIds.length : 'ALL'}</span>
            <span className="text-slate-300">·</span>
            <span>Validity: {offer.validity === 'reset' ? 'reset' : 'extend'}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-1">
        <button onClick={onToggle} disabled={busy}
          className={`text-[10px] font-bold rounded-lg px-2 py-1 flex items-center gap-1 border ${offer.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}>
          {offer.status === 'active' ? <><Zap className="w-2.5 h-2.5" /> Enabled</> : <><ZapOff className="w-2.5 h-2.5" /> Disabled</>}
        </button>
        <button onClick={onEdit} disabled={busy}
          className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-1 flex items-center gap-1 hover:bg-blue-100">
          <Edit3 className="w-2.5 h-2.5" /> Edit
        </button>
        <button onClick={onDuplicate} disabled={busy}
          className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 rounded-lg px-2 py-1 flex items-center gap-1 hover:bg-purple-100">
          <Copy className="w-2.5 h-2.5" /> Duplicate
        </button>
        <button onClick={onDelete} disabled={busy}
          className="ml-auto text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 rounded-lg px-2 py-1 flex items-center gap-1 hover:bg-red-100">
          <Trash2 className="w-2.5 h-2.5" /> Delete
        </button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
const OfferEditor = ({ offer, plans, onClose, onSaved }) => {
  const isEdit = !!offer?.id
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name:          offer.name || '',
    bannerText:    offer.bannerText || '🔥 LIMITED TIME TEACHER OFFER',
    badge:         offer.badge || '🔥 Limited Offer',
    startsAt:      toLocalInput(offer.startsAt || new Date()),
    endsAt:        toLocalInput(offer.endsAt || new Date(Date.now() + 7 * 86400000)),
    discountType:  offer.discountType || 'percent',
    discountValue: offer.discountValue ?? 20,
    applicablePlanIds: Array.isArray(offer.applicablePlanIds) ? offer.applicablePlanIds : [],
    color:         offer.color || '#F59E0B',
    validity:      offer.validity || 'extend',
    status:        offer.status || 'inactive',
    priority:      offer.priority ?? 0,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const togglePlan = (planId) => set('applicablePlanIds', form.applicablePlanIds.includes(planId)
    ? form.applicablePlanIds.filter(x => x !== planId)
    : [...form.applicablePlanIds, planId])

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Offer name is required')
    if (!form.startsAt || !form.endsAt) return toast.error('Start and end dates are required')
    if (new Date(form.endsAt) <= new Date(form.startsAt)) return toast.error('End date must be after start date')
    if (form.discountValue < 0) return toast.error('Discount cannot be negative')
    if (form.discountType === 'percent' && form.discountValue > 100) return toast.error('Percent discount cannot exceed 100')

    try {
      setSaving(true)
      const payload = {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        discountValue: Number(form.discountValue),
        priority: Number(form.priority),
      }
      if (isEdit) {
        await authedFetch(`/api/admin/offers/${offer.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        toast.success('Offer updated.')
      } else {
        await authedFetch('/api/admin/offers', { method: 'POST', body: JSON.stringify(payload) })
        toast.success('Offer created.')
      }
      onSaved()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-3"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 320 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
          <Sparkles className="w-4 h-4 text-amber-700" />
          <div className="text-sm font-black text-slate-900">{isEdit ? 'Edit Offer' : 'New Offer Campaign'}</div>
          <button onClick={onClose} className="ml-auto p-1 rounded-full hover:bg-white/70"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-3 space-y-3 overflow-y-auto">
          <Field label="Offer Name *" hint="Internal name shown only to admin">
            <input value={form.name} onChange={e => set('name', e.target.value)} maxLength={120}
              placeholder="Independence Day Blast"
              className="w-full text-sm font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-amber-500 outline-none" />
          </Field>

          <Field label="Banner Text" hint="Big headline shown to users above plans">
            <input value={form.bannerText} onChange={e => set('bannerText', e.target.value)} maxLength={200}
              placeholder="🔥 LIMITED TIME TEACHER OFFER"
              className="w-full text-sm font-bold border border-slate-300 rounded-lg px-2.5 py-1.5" />
          </Field>

          <Field label="Badge" hint="Small ribbon shown on plan cards (emoji + short phrase)">
            <div className="grid grid-cols-2 gap-1.5">
              {['🔥 Limited Offer', '⭐ Most Popular', '💎 Best Value', '🚀 Recommended'].map(b => (
                <button key={b} type="button" onClick={() => set('badge', b)}
                  className={`text-[11px] font-black rounded-lg border-2 px-2 py-1.5 ${form.badge === b ? 'bg-amber-100 border-amber-500' : 'bg-white border-slate-200'}`}>{b}</button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts At *">
              <input type="datetime-local" value={form.startsAt} onChange={e => set('startsAt', e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5" />
            </Field>
            <Field label="Ends At *">
              <input type="datetime-local" value={form.endsAt} onChange={e => set('endsAt', e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5" />
            </Field>
          </div>

          <Field label="Discount">
            <div className="flex gap-1.5">
              <select value={form.discountType} onChange={e => set('discountType', e.target.value)}
                className="text-sm font-bold border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                <option value="percent">% Percent</option>
                <option value="fixed">₹ Fixed</option>
              </select>
              <div className="flex-1 relative">
                <input type="number" value={form.discountValue} onChange={e => set('discountValue', Number(e.target.value))}
                  min="0" max={form.discountType === 'percent' ? 100 : 100000}
                  className="w-full text-sm font-bold border border-slate-300 rounded-lg pl-7 pr-2 py-1.5" />
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">
                  {form.discountType === 'percent' ? <Percent className="w-3.5 h-3.5" /> : <IndianRupee className="w-3.5 h-3.5" />}
                </div>
              </div>
            </div>
          </Field>

          <Field label="Applicable Plans" hint="Empty = applies to ALL paid plans">
            <div className="space-y-1">
              {plans.map(p => (
                <label key={p.id} className={`flex items-center gap-2 text-[11px] font-bold rounded-lg border px-2 py-1.5 cursor-pointer ${form.applicablePlanIds.includes(p.id) ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'}`}>
                  <input type="checkbox" checked={form.applicablePlanIds.includes(p.id)} onChange={() => togglePlan(p.id)} />
                  <Tag className="w-3 h-3 text-amber-600" />
                  <span className="flex-1">{p.name}</span>
                  <span className="text-slate-500">₹{p.price}</span>
                </label>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Validity Mode">
              <select value={form.validity} onChange={e => set('validity', e.target.value)}
                className="w-full text-sm font-bold border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                <option value="extend">Extend (add to existing expiry)</option>
                <option value="reset">Reset (start fresh from today)</option>
              </select>
            </Field>
            <Field label="Priority">
              <input type="number" value={form.priority} onChange={e => set('priority', Number(e.target.value))} min="0" max="99"
                className="w-full text-sm font-bold border border-slate-300 rounded-lg px-2.5 py-1.5" />
            </Field>
          </div>

          <Field label="Status">
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => set('status', 'active')}
                className={`text-[11px] font-black rounded-lg border-2 px-2 py-1.5 ${form.status === 'active' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-white border-slate-200'}`}>🟢 Active</button>
              <button type="button" onClick={() => set('status', 'inactive')}
                className={`text-[11px] font-black rounded-lg border-2 px-2 py-1.5 ${form.status === 'inactive' ? 'bg-slate-100 border-slate-400' : 'bg-white border-slate-200'}`}>⏸️ Inactive</button>
            </div>
          </Field>
        </div>

        <div className="p-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
          <button onClick={onClose} disabled={saving}
            className="text-xs font-black text-slate-700 bg-white border border-slate-300 rounded-full px-3 py-1.5">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="text-xs font-black text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-full px-4 py-1.5 flex items-center gap-1 shadow disabled:opacity-50">
            {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</> : <><Sparkles className="w-3.5 h-3.5" /> {isEdit ? 'Update Offer' : 'Create Offer'}</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

const Field = ({ label, hint, children }) => (
  <div>
    <div className="text-[9.5px] uppercase font-black tracking-widest text-slate-500 mb-1">{label}</div>
    {children}
    {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
  </div>
)

// =============================================================================
//  📊 AnalyticsPanel — Views, Clicks, Purchases, Revenue & Conversion Rate.
//  Talks to /api/admin/offers/analytics.  Supports date-range toggle
//  (7d / 30d / 90d / all) and per-offer breakdown table.
// =============================================================================
const RANGE_OPTIONS = [
  { key: '7',   label: 'Last 7 Days',  days: 7 },
  { key: '30',  label: 'Last 30 Days', days: 30 },
  { key: '90',  label: 'Last 90 Days', days: 90 },
  { key: 'all', label: 'All Time',     days: 365 * 5 },
]

const AnalyticsPanel = ({ offers }) => {
  const [range, setRange] = useState('30')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offerFilter, setOfferFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const days = RANGE_OPTIONS.find(r => r.key === range)?.days || 30
      const from = new Date(Date.now() - days * 86400000)
      const to = new Date()
      const params = new URLSearchParams({
        from: from.toISOString().slice(0, 10),
        to:   to.toISOString().slice(0, 10),
      })
      if (offerFilter) params.set('offerId', offerFilter)
      const res = await authedFetch(`/api/admin/offers/analytics?${params.toString()}`)
      setData(res)
    } catch (e) { toast.error(e.message || 'Failed to load analytics') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [range, offerFilter])

  if (loading && !data) {
    return <div className="p-8 text-center text-slate-500 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading analytics…</div>
  }

  const t = data?.totals || { views: 0, clicks: 0, purchases: 0, revenue: 0, conversionRate: 0, avgOrderValue: 0, clickThroughRate: 0 }
  const perOffer = data?.perOffer || []
  const perPlan = data?.perPlan || []
  const daily = data?.daily || []
  const topOffer = data?.topOffer

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 flex-1 min-w-[240px]">
          {RANGE_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setRange(opt.key)}
              className={`flex-1 text-[10px] font-black rounded-md px-2 py-1 transition ${range === opt.key ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <select value={offerFilter} onChange={e => setOfferFilter(e.target.value)}
          className="text-[10px] font-bold border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
          <option value="">All Offers</option>
          {offers.map(o => (<option key={o.id} value={o.id}>{o.name}</option>))}
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi icon={Eye}                 label="Views"           value={t.views.toLocaleString('en-IN')}                   color="bg-sky-50 text-sky-700 border-sky-200" />
        <Kpi icon={MousePointerClick}   label="Clicks"          value={t.clicks.toLocaleString('en-IN')}                  color="bg-indigo-50 text-indigo-700 border-indigo-200" />
        <Kpi icon={ShoppingCart}        label="Purchases"       value={t.purchases.toLocaleString('en-IN')}               color="bg-emerald-50 text-emerald-700 border-emerald-200" />
        <Kpi icon={INR}                 label="Revenue"         value={`₹${t.revenue.toLocaleString('en-IN')}`}           color="bg-amber-50 text-amber-800 border-amber-200" />
        <Kpi icon={Target}              label="Conversion Rate" value={`${t.conversionRate}%`}                            color="bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" />
        <Kpi icon={TrendingUp}          label="Click-Thru Rate" value={`${t.clickThroughRate}%`}                          color="bg-violet-50 text-violet-700 border-violet-200" />
        <Kpi icon={INR}                 label="Avg Order Value" value={`₹${t.avgOrderValue.toLocaleString('en-IN')}`}     color="bg-teal-50 text-teal-700 border-teal-200" />
        <Kpi icon={Trophy}              label="Top Offer"       value={topOffer?.offerName?.slice(0, 14) || '—'}          color="bg-rose-50 text-rose-700 border-rose-200" hint={topOffer ? `₹${(topOffer.revenue || 0).toLocaleString('en-IN')} rev` : ''} />
      </div>

      {/* Daily Trend Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-xs font-black text-slate-800 flex items-center gap-1 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Daily Trend
        </div>
        {daily.length === 0 ? (
          <div className="text-[11px] text-slate-400 py-8 text-center">No data in this date range yet.</div>
        ) : (
          <div className="w-full h-56">
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 5, right: 8, left: -8, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 9 }} />
                <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #cbd5e1' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="views"     stroke="#0284c7" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="clicks"    stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="purchases" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Per-Offer Breakdown Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-1 bg-slate-50 border-b border-slate-200">
          <BarChart3 className="w-3.5 h-3.5 text-amber-600" />
          <div className="text-xs font-black text-slate-800">Per-Offer Performance</div>
          <div className="ml-auto text-[10px] text-slate-500">{perOffer.length} offer{perOffer.length === 1 ? '' : 's'}</div>
        </div>
        {perOffer.length === 0 ? (
          <div className="text-[11px] text-slate-400 py-6 text-center">No offer activity in this date range.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10.5px]">
              <thead className="bg-slate-50 text-slate-500 text-[9.5px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2 font-black">Offer</th>
                  <th className="text-right px-2 py-2 font-black">Discount</th>
                  <th className="text-right px-2 py-2 font-black">Views</th>
                  <th className="text-right px-2 py-2 font-black">Clicks</th>
                  <th className="text-right px-2 py-2 font-black">Sales</th>
                  <th className="text-right px-2 py-2 font-black">Revenue</th>
                  <th className="text-right px-3 py-2 font-black">Conv %</th>
                </tr>
              </thead>
              <tbody>
                {perOffer.map((r, i) => (
                  <tr key={r.offerId} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                    <td className="px-3 py-2 font-bold text-slate-800 truncate max-w-[160px]" title={r.offerName}>
                      {i === 0 && <Trophy className="w-3 h-3 text-amber-500 inline mr-1" />}
                      {r.offerName}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-600">{r.discount}</td>
                    <td className="px-2 py-2 text-right text-sky-700 font-bold">{r.views.toLocaleString('en-IN')}</td>
                    <td className="px-2 py-2 text-right text-indigo-700 font-bold">{r.clicks.toLocaleString('en-IN')}</td>
                    <td className="px-2 py-2 text-right text-emerald-700 font-bold">{r.purchases}</td>
                    <td className="px-2 py-2 text-right text-amber-800 font-black">₹{r.revenue.toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2 text-right text-fuchsia-700 font-bold">{r.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-Plan Breakdown */}
      {perPlan.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-3 py-2 flex items-center gap-1 bg-slate-50 border-b border-slate-200">
            <Tag className="w-3.5 h-3.5 text-indigo-600" />
            <div className="text-xs font-black text-slate-800">Sales by Plan (Offer-Attributed)</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3">
            {perPlan.map(p => (
              <div key={p.planId} className="rounded-lg border border-slate-200 p-2">
                <div className="text-[10px] font-black uppercase text-slate-500">{p.planName}</div>
                <div className="text-sm font-black text-slate-900 mt-0.5">{p.purchases} sales</div>
                <div className="text-[11px] font-bold text-emerald-700">₹{p.revenue.toLocaleString('en-IN')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[9.5px] text-slate-400 text-center pt-1">
        Purchases & revenue attributed to offers only · Data auto-refreshes when you switch tabs.
      </div>
    </div>
  )
}

const Kpi = ({ icon: Icon, label, value, color, hint }) => (
  <div className={`rounded-xl border p-2.5 ${color || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
    <div className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-widest opacity-80">
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </div>
    <div className="text-lg font-black leading-tight mt-1 truncate">{value}</div>
    {hint && <div className="text-[9.5px] opacity-70 mt-0.5 truncate">{hint}</div>}
  </div>
)
