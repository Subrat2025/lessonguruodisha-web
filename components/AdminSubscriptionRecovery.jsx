'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { openWhatsAppTo, buildAdminRecoveryMessage, normalizeIndianWhatsApp } from '@/lib/renewal-whatsapp'
import RecoveryExportDialog from '@/components/recovery/RecoveryExportDialog'
import RecoverySendDialog from '@/components/recovery/RecoverySendDialog'

const api = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const inr = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN')

// Message variants. ODIA is the default recovery message (exact copy, kept
// intact). English variants remain available as optional alternates.
const firstNameOf = (name) => String(name || '').trim().split(/\s+/)[0] || ''
const VARIANTS = {
  ODIA: { label: 'ଓଡ଼ିଆ (default)', build: (v) => buildAdminRecoveryMessage(firstNameOf(v.name)) },
  A: { label: 'Friendly (EN)', build: (v) => `👋 Hello ${v.name}!\n\nYour ${v.plan} access on LessonGuru Odisha expired on ${v.expiry}. Whenever it's convenient, you can renew and pick up right where you left off.\n\n🔄 Renew here: ${v.link}\n\nThank you for being part of LessonGuru Odisha 🙏` },
  B: { label: 'Value (EN)', build: (v) => `👋 Hello ${v.name}!\n\nYour ${v.plan} plan expired on ${v.expiry}. Renewing restores your access to Lesson Plans, Worksheets, Assessments and Academic Resources — no need to rebuild your workflow.\n\n📚 Continue teaching with all your tools:\n${v.link}\n\nWarm regards, LessonGuru Odisha 💙` },
  C: { label: 'Re-engage (EN)', build: (v) => `👋 Hello ${v.name}!\n\nWe'd love to have you back on LessonGuru Odisha. Your ${v.plan} plan expired on ${v.expiry}. You can renew any time to continue using the platform.\n\n🔄 ${v.link}\n\nThank you 🙏` },
  D: { label: 'Long-expired (EN)', build: (v) => `👋 Hello ${v.name}!\n\nIt has been ${v.days} days since your LessonGuru Odisha access expired (${v.expiry}). If you'd like to continue, your plan can be renewed here:\n\n${v.link}\n\nWe'd be glad to welcome you back 🙏` },
}

const bucketBadge = (d) => {
  if (d == null) return null
  if (d <= 7) return 'bg-amber-500'
  if (d <= 30) return 'bg-orange-500'
  if (d <= 60) return 'bg-red-500'
  if (d <= 90) return 'bg-rose-600'
  return 'bg-slate-600'
}

export default function AdminSubscriptionRecovery({ onBack }) {
  const [kpis, setKpis] = useState(null)
  const [plans, setPlans] = useState([])
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [bucket, setBucket] = useState('')
  const [plan, setPlan] = useState('')
  const [contact, setContact] = useState('')
  const [search, setSearch] = useState('')
  const [variant, setVariant] = useState('ODIA')
  const [detail, setDetail] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [queue, setQueue] = useState(null)   // { users:[], idx:number } for sequential send
  const [sendOpen, setSendOpen] = useState(false)   // Phase 2 auto-send dialog
  const [sendUsers, setSendUsers] = useState([])    // users passed to auto-send

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (bucket) qs.set('bucket', bucket)
      if (plan) qs.set('plan', plan)
      if (contact) qs.set('contact', contact)
      if (search) qs.set('search', search)
      const r = await api('/admin/subscription-recovery?' + qs.toString())
      setKpis(r.kpis); setPlans(r.plans || []); setRows(r.users || []); setTotal(r.total || 0)
    } catch (e) { toast.error(e.message) }
    setLoading(false)
  }, [page, pageSize, bucket, plan, contact, search])

  useEffect(() => { load() }, [load])

  const buildMsg = useCallback((u) => {
    const link = (typeof window !== 'undefined' ? window.location.origin : 'https://lessonguruodisha.in') + '/'
    return VARIANTS[variant].build({ name: u.name || 'Teacher', plan: u.plan || 'premium', expiry: fmtDate(u.expiryDate), days: u.daysExpired ?? '', link })
  }, [variant])

  // Opens WhatsApp to THIS user's own registered number (never the support line).
  const waSend = async (u, opts = {}) => {
    const num = normalizeIndianWhatsApp(u.mobile)
    if (!num) { toast.error(`⚠️ Invalid WhatsApp number for ${u.name || 'user'}`); return false }
    if (!opts.skipConfirm && u.lastContact) {
      const hrs = (Date.now() - new Date(u.lastContact).getTime()) / 3600000
      if (hrs < 24 && !confirm(`⚠️ ${u.name} was contacted ${hrs < 1 ? 'less than an hour' : Math.round(hrs) + ' hours'} ago (total ${u.contactCount}). Send anyway?`)) return false
    }
    const ok = openWhatsAppTo(u.mobile, buildMsg(u))
    if (!ok) { toast.error('⚠️ Could not open WhatsApp — invalid number'); return false }
    try { await api('/admin/subscription-recovery/contact', { method: 'POST', body: { userId: u.id, variant, phone: u.mobile } }); toast.success(`WhatsApp opened for ${u.name || num} · contact logged`); load() }
    catch (e) { toast.error(e.message) }
    return true
  }

  // --- selection helpers ---
  const toggleSel = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOnPageSelected = rows.length > 0 && rows.every(u => selected.has(u.id))
  const toggleSelectAll = () => setSelected(prev => {
    const n = new Set(prev)
    if (rows.every(u => n.has(u.id))) rows.forEach(u => n.delete(u.id))
    else rows.forEach(u => n.add(u.id))
    return n
  })
  const startQueue = () => {
    const users = rows.filter(u => selected.has(u.id) && normalizeIndianWhatsApp(u.mobile))
    if (users.length === 0) { toast.error('Select at least one expired user with a valid number'); return }
    setQueue({ users, idx: 0 })
  }
  const queueSendCurrent = async () => {
    if (!queue) return
    const u = queue.users[queue.idx]
    await waSend(u, { skipConfirm: true })
    setQueue(q => (q && q.idx < q.users.length - 1 ? { ...q, idx: q.idx + 1 } : null))
    if (queue.idx >= queue.users.length - 1) { toast.success('✅ Sequential send finished'); setSelected(new Set()) }
  }
  const queueSkip = () => setQueue(q => (q && q.idx < q.users.length - 1 ? { ...q, idx: q.idx + 1 } : (toast.success('✅ Done'), null)))

  // Phase 2 — automated BulkyMarketing send (dry-run first). Max 50 per click.
  const startAutoSend = () => {
    const users = rows.filter(u => selected.has(u.id))
    if (users.length === 0) { toast.error('Select at least one user'); return }
    if (users.length > 50) { toast.error('Max 50 users per send — please deselect some.'); return }
    setSendUsers(users); setSendOpen(true)
  }

  const openDetail = async (u) => {
    try { const r = await api('/admin/subscription-recovery/user/' + u.id); setDetail(r) } catch (e) { toast.error(e.message) }
  }

  const exportCsv = () => {
    const token = localStorage.getItem('em_token') || localStorage.getItem('token')
    const qs = new URLSearchParams(); if (plan) qs.set('plan', plan)
    fetch('/api/admin/subscription-recovery/export?' + qs.toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.blob()).then(b => { const url = URL.createObjectURL(b); const a = document.createElement('a'); a.href = url; a.download = 'subscription-recovery.csv'; a.click(); URL.revokeObjectURL(url) })
      .catch(() => toast.error('Export failed'))
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const K = kpis || {}
  const kpiCards = [
    ['⏰ Expired', K.expired, 'from-orange-500 to-red-500'],
    ['❌ Not Renewed', K.notRenewed, 'from-red-500 to-rose-600'],
    ['✅ Renewed', K.renewedAfterExpiry, 'from-emerald-500 to-green-600'],
    ['💬 Contacted', K.contacted, 'from-blue-500 to-indigo-600'],
    ['📈 Renewal %', (K.renewalRatePct ?? 0) + '%', 'from-fuchsia-500 to-purple-600'],
    ['💰 Renewal Rev', inr(K.renewalRevenue), 'from-teal-500 to-cyan-600'],
  ]

  return (
    <div className="max-w-4xl mx-auto px-3 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onBack} className="rounded-full h-8">← Back</Button>
        <h1 className="font-black text-lg flex-1">🔄 Subscription Recovery</h1>
        <RecoveryExportDialog filters={{ bucket, plan, contact, search }} />
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">Recover expired users and understand renewal behavior. Renewal % and revenue are observed historical metrics.</p>

      <div className="grid grid-cols-3 gap-2">
        {kpiCards.map(([label, val, grad]) => (
          <div key={label} className={`rounded-2xl p-2.5 text-white bg-gradient-to-br ${grad}`}>
            <p className="text-[10px] font-semibold opacity-90">{label}</p>
            <p className="text-lg font-black leading-tight">{val ?? '—'}</p>
          </div>
        ))}
      </div>

      <Card className="p-2.5 rounded-2xl border-2 space-y-2">
        <div className="flex flex-wrap gap-1">
          {['', '1-7', '8-30', '31-60', '61-90', '90+'].map(b => (
            <button key={b || 'all'} onClick={() => { setBucket(b); setPage(1) }} className={`text-[10px] px-2 py-1 rounded-full font-bold ${bucket === b ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{b ? b + 'd' : 'All'}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <select value={plan} onChange={e => { setPlan(e.target.value); setPage(1) }} className="h-8 rounded-md border px-2 text-xs">
            <option value="">All Plans</option>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={contact} onChange={e => { setContact(e.target.value); setPage(1) }} className="h-8 rounded-md border px-2 text-xs">
            <option value="">All Contact</option>
            <option value="not">Not Contacted</option>
            <option value="contacted">Contacted</option>
          </select>
          <Input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load() } }} placeholder="Name / mobile / email" className="h-8 text-xs flex-1 min-w-[140px]" style={{ fontSize: 16 }} />
          <select value={variant} onChange={e => setVariant(e.target.value)} className="h-8 rounded-md border px-2 text-xs" title="WhatsApp message variant">
            {Object.entries(VARIANTS).map(([k, v]) => <option key={k} value={k}>Msg: {v.label}</option>)}
          </select>
        </div>
      </Card>

      <p className="text-[11px] text-muted-foreground">{loading ? 'Loading…' : `${total} expired · page ${page}/${totalPages}`}</p>

      {/* Bulk selection bar */}
      <div className="flex items-center gap-2 flex-wrap bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3 py-2 border">
        <label className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer select-none">
          <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-indigo-600" />
          ☑ Select All Expired (page)
        </label>
        <span className="text-[10px] text-muted-foreground">{selected.size} selected</span>
        <div className="flex-1" />
        {selected.size > 0 && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-7 text-[10px] rounded-full">Clear</Button>
            <Button size="sm" onClick={startQueue} className="h-7 text-[10px] rounded-full bg-green-600 text-white">📲 Manual WhatsApp ({Array.from(selected).length})</Button>
            <Button size="sm" onClick={startAutoSend} className="h-7 text-[10px] rounded-full bg-emerald-700 text-white">🤖 Auto Send ({Array.from(selected).length})</Button>
          </>
        )}
      </div>

      <div className="space-y-2">
        {rows.map(u => (
          <Card key={u.id} className={`p-3 rounded-2xl border-2 ${selected.has(u.id) ? 'ring-2 ring-indigo-400' : ''}`}>
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSel(u.id)} className="w-4 h-4 mt-1 accent-indigo-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[13px] truncate">👤 {u.name || '(no name)'} {u.contactCount > 0 && <span className="text-[9px] text-blue-600">· 💬{u.contactCount}</span>}</p>
                <p className="text-[11px] text-muted-foreground">📱 {u.mobile || '—'} {u.email ? '· ' + u.email : ''}</p>
                <div className="flex flex-wrap gap-1 mt-1 text-[9px]">
                  <Badge variant="secondary">{u.plan || 'plan'}</Badge>
                  <Badge variant="outline">exp {fmtDate(u.expiryDate)}</Badge>
                  <Badge className={`${bucketBadge(u.daysExpired)} text-white`}>⏰ {u.daysExpired}d ago</Badge>
                  {u.lastAmount != null && <Badge variant="outline">last {inr(u.lastAmount)}</Badge>}
                  <Badge className={u.contactCount > 0 ? 'bg-blue-500 text-white' : 'bg-slate-400 text-white'}>📩 {u.contactCount > 0 ? 'Contacted' : 'Not Contacted'}</Badge>
                  <Badge className={u.renewalStatus === 'Payment Pending' ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'}>{u.renewalStatus === 'Payment Pending' ? '⏳ Pending' : '❌ Not Renewed'}</Badge>
                </div>
                {u.lastContact && <p className="text-[9px] text-muted-foreground mt-1">Last contacted {fmtDate(u.lastContact)}</p>}
              </div>
            </div>
            <div className="flex gap-1.5 mt-2">
              <Button size="sm" onClick={() => waSend(u)} disabled={!u.mobile} className="h-7 text-[10px] rounded-full bg-green-600 text-white flex-1">💬 WhatsApp Renewal</Button>
              <Button size="sm" variant="outline" onClick={() => openDetail(u)} className="h-7 text-[10px] rounded-full">👁 View</Button>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(u.mobile || ''); toast.success('Number copied') }} className="h-7 text-[10px] rounded-full">📋</Button>
            </div>
          </Card>
        ))}
        {!loading && rows.length === 0 && <Card className="p-6 text-center rounded-2xl border-2 border-dashed"><p className="text-sm text-muted-foreground">No expired-and-not-renewed users match this filter. 🎉</p></Card>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-full h-8">← Prev</Button>
          <span className="text-xs font-bold">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-full h-8">Next →</Button>
        </div>
      )}

      {/* Sequential WhatsApp send — one user at a time (no auto-spam) */}
      {queue && (() => {
        const u = queue.users[queue.idx]
        const num = normalizeIndianWhatsApp(u?.mobile)
        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3" onClick={() => setQueue(null)}>
            <Card className="max-w-sm w-full p-4 rounded-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-1">
                <p className="font-black text-sm">📲 WhatsApp Renewal — Sequential</p>
                <button onClick={() => setQueue(null)} className="text-xl leading-none">✕</button>
              </div>
              <p className="text-[11px] text-muted-foreground">User {queue.idx + 1} of {queue.users.length}</p>
              <div className="mt-3 rounded-xl border-2 p-3 bg-slate-50 dark:bg-slate-900/40">
                <p className="font-bold text-[14px]">👤 {u?.name || '(no name)'}</p>
                <p className="text-[12px] text-muted-foreground">📱 {u?.mobile} → <span className="font-mono">+{num}</span></p>
                <p className="text-[10px] text-muted-foreground mt-1">Message: {VARIANTS[variant].label} · opens on this user's own number (not support).</p>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={queueSendCurrent} className="h-9 text-[12px] rounded-full bg-green-600 text-white flex-1">💬 Open WhatsApp</Button>
                <Button size="sm" variant="outline" onClick={queueSkip} className="h-9 text-[12px] rounded-full">Skip →</Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">After WhatsApp opens, press <b>Send</b> manually, return here, then continue to the next teacher.</p>
            </Card>
          </div>
        )
      })()}

      {/* Phase 2 — automated BulkyMarketing send (dry-run → confirm → report) */}
      <RecoverySendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        users={sendUsers}
        onComplete={() => { load(); setSelected(new Set()) }}
      />

      {detail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3" onClick={() => setDetail(null)}>
          <Card className="max-w-md w-full max-h-[85vh] overflow-y-auto p-4 rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <p className="font-black text-sm">🔎 {detail.user?.name}</p>
              <button onClick={() => setDetail(null)} className="text-xl leading-none">✕</button>
            </div>
            <p className="text-[11px] text-muted-foreground">📱 {detail.user?.mobile} · Total paid: <b>{inr(detail.lifetimePaid)}</b></p>
            <div className="mt-2">
              <p className="text-[11px] font-bold">Current plan: {detail.user?.subscription?.plan || '—'}</p>
              <p className="text-[10px] text-muted-foreground">Activated {fmtDate(detail.user?.subscription?.startDate)} · Expired {fmtDate(detail.user?.subscription?.expiryDate)}</p>
            </div>
            <p className="text-[11px] font-bold mt-3">💳 Payment history</p>
            <div className="space-y-1 mt-1">
              {(detail.payments || []).map((p, i) => (
                <div key={i} className="flex justify-between text-[10px] border-b py-0.5">
                  <span>{fmtDate(p.createdAt)} · {p.plan || ''} · {p.method || ''}</span>
                  <span className={p.status === 'success' ? 'text-emerald-600 font-bold' : 'text-amber-600'}>{inr(p.amount)} {p.status}</span>
                </div>
              ))}
              {(detail.payments || []).length === 0 && <p className="text-[10px] text-muted-foreground">No payments recorded.</p>}
            </div>
            <p className="text-[11px] font-bold mt-3">💬 Contact history</p>
            <div className="space-y-1 mt-1">
              {(detail.contacts || []).map((c, i) => <p key={i} className="text-[10px]">{fmtDate(c.at)} · {VARIANTS[c.variant]?.label || c.variant} · {c.adminName}</p>)}
              {(detail.contacts || []).length === 0 && <p className="text-[10px] text-muted-foreground">Not contacted yet.</p>}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
