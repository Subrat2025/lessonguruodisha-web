'use client'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Loader2, RefreshCw, ArrowLeft, Search, Gift, Users, Wallet, Activity, Shield,
  TrendingUp, TrendingDown, DollarSign, Zap, AlertTriangle, ChevronRight, X,
} from 'lucide-react'
import { AdminAICreditsDashboard } from '@/components/AdminAICreditsDashboard'

// ─────────────────────────────────────────────────────────────
//  Local API helper — admin JWT + JSON.
// ─────────────────────────────────────────────────────────────
const apiCall = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data?.error || `Request failed (${res.status})`); e.status = res.status; e.data = data; throw e }
  return data
}

// ─────────────────────────────────────────────────────────────
//  Formatting helpers
// ─────────────────────────────────────────────────────────────
const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const fmtN = (n) => Number(n || 0).toLocaleString('en-IN')
const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─────────────────────────────────────────────────────────────
//  KPI card (used across sub-tabs)
// ─────────────────────────────────────────────────────────────
const KPI = ({ icon: Icon, label, value, sub, tint = 'violet' }) => {
  const tints = {
    violet: 'from-violet-500 to-fuchsia-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-indigo-500',
    slate: 'from-slate-500 to-gray-600',
  }
  return (
    <Card className="p-3.5 rounded-2xl">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${tints[tint]} flex items-center justify-center text-white`}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
      </div>
      <p className="text-xl font-extrabold mt-1.5 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  )
}

// ═════════════════════════════════════════════════════════════
//  OVERVIEW TAB — enhanced summary using /admin/ai-credits/overview
// ═════════════════════════════════════════════════════════════
const OverviewTab = ({ days, setDays }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await apiCall(`/admin/ai-credits/overview?days=${days}`)) }
    catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [days])
  useEffect(() => { load() }, [load])

  if (!data && loading) return <div className="p-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
  if (!data) return null

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KPI icon={DollarSign}   label="Gross Revenue"     value={fmtINR(data.revenueINR)}          sub={`from ${data.plans.reduce((s,p)=>s+(p.purchases||0),0)} verified purchases`} tint="emerald" />
        <KPI icon={TrendingDown} label="Refunds"           value={fmtINR(data.refunds?.amountINR)}  sub={`${data.refunds?.count || 0} events`} tint="rose" />
        <KPI icon={DollarSign}   label="Net Revenue"       value={fmtINR(data.netRevenueINR)}       sub="Gross − Refunds" tint="emerald" />
        <KPI icon={Zap}          label="Est. Gemini Cost"  value={fmtINR(data.gemini?.costINR)}     sub={`${fmtN(data.gemini?.ok||0)} calls · ${fmtN((data.gemini?.tokensIn||0)+(data.gemini?.tokensOut||0)+(data.gemini?.tokensThinking||0))} tokens`} tint="amber" />
        <KPI icon={TrendingUp}   label="Gross Profit"      value={fmtINR(data.grossProfitINR)}      sub={`${data.marginPct}% margin`} tint="violet" />
        <KPI icon={Users}        label="Total AI Users"    value={fmtN(data.totalAIUsers)}          sub={`${data.activeAIUsers} active`} tint="blue" />
        <KPI icon={Wallet}       label="Credits In Wallets" value={fmtN(data.wallet?.balance)}      sub={`${fmtN(data.wallet?.purchased)} purchased · ${fmtN(data.wallet?.spent)} spent`} tint="blue" />
        <KPI icon={Gift}         label="Bonus Issued"      value={fmtN(data.bonusIssued?.credits)}  sub={`${data.bonusIssued?.count || 0} grants`} tint="violet" />
      </div>

      {/* Low balance / zero balance CTA row */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card className="p-3 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Low Balance Users</p>
          </div>
          <p className="text-2xl font-extrabold mt-1 text-amber-800">{data.lowBalanceUsers}</p>
          <p className="text-[10px] text-amber-700">Users with 1–9 credits — re-purchase candidates</p>
        </Card>
        <Card className="p-3 rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Zero Credit Users</p>
          </div>
          <p className="text-2xl font-extrabold mt-1 text-rose-800">{data.zeroBalanceUsers}</p>
          <p className="text-[10px] text-rose-700">Users at 0 — high re-buy intent</p>
        </Card>
      </div>

      {/* Plans table */}
      <div>
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">💳 AI Credit Plans ({days}d)</p>
        <Card className="rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2">Plan</th>
                  <th className="text-right px-2 py-2">Price</th>
                  <th className="text-right px-2 py-2">Credits</th>
                  <th className="text-right px-2 py-2">Bonus</th>
                  <th className="text-right px-2 py-2">Purchases</th>
                  <th className="text-right px-2 py-2">Credits Sold</th>
                  <th className="text-right px-3 py-2">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data.plans || []).map(p => (
                  <tr key={p._id} className={p.bestValue ? 'bg-violet-50/50' : ''}>
                    <td className="px-3 py-2">
                      <span className="font-bold">{p.name}</span>
                      {!p.active && <Badge variant="outline" className="ml-1 text-[9px]">off</Badge>}
                    </td>
                    <td className="text-right px-2 py-2">{fmtINR(p.priceINR)}</td>
                    <td className="text-right px-2 py-2">{fmtN(p.credits)}</td>
                    <td className="text-right px-2 py-2">{p.bonusCredits ? `+${p.bonusCredits}` : '—'}</td>
                    <td className="text-right px-2 py-2">{p.purchases}</td>
                    <td className="text-right px-2 py-2">{fmtN(p.creditsSold)}</td>
                    <td className="text-right px-3 py-2 font-bold text-emerald-700">{fmtINR(p.revenueINR)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="text-[10px] text-muted-foreground italic px-1">
        Estimated Gemini cost is calculated from recorded input/output token counts using the current published gemini-flash pricing.
        Not an actual Google invoice amount.
      </p>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
//  USERS TAB — searchable, click a row for full profile
// ═════════════════════════════════════════════════════════════
const UsersTab = ({ onSelectUser }) => {
  const [data, setData] = useState({ items: [], total: 0 })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('balance_desc')
  const [loading, setLoading] = useState(false)
  const [debouncedQ, setDebouncedQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(query), 300); return () => clearTimeout(t) }, [query])
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await apiCall(`/admin/ai-credits/users?limit=50&sort=${sort}&query=${encodeURIComponent(debouncedQ)}`)) }
    catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [debouncedQ, sort])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name or mobile…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 h-9" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs">
          <option value="balance_desc">Balance ↓</option>
          <option value="balance_asc">Balance ↑</option>
          <option value="purchased_desc">Purchased ↓</option>
          <option value="spent_desc">Spent ↓</option>
          <option value="recent">Recent activity</option>
        </select>
      </div>
      <p className="text-[11px] text-muted-foreground">{data.total} wallet users</p>
      <Card className="rounded-2xl overflow-hidden">
        {loading && <div className="p-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}
        <div className="divide-y">
          {(data.items || []).map(w => (
            <button key={w.userId} onClick={() => onSelectUser(w.userId)} className="w-full text-left p-3 hover:bg-accent/60 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {String((w.user?.name || w.user?.mobile || 'U')[0]).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{w.user?.name || 'Unknown'} <span className="text-[10.5px] font-normal text-muted-foreground">· {w.user?.mobile || w.userId.slice(0, 8)}</span></p>
                <p className="text-[10.5px] text-muted-foreground">Purchased {fmtN(w.lifetimePurchased)} · Spent {fmtN(w.lifetimeSpent)} · Refunded {fmtN(w.lifetimeRefunded)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-extrabold tabular-nums ${w.balance <= 0 ? 'text-rose-600' : w.balance < 10 ? 'text-amber-600' : 'text-emerald-700'}`}>{fmtN(w.balance)}</p>
                <p className="text-[9.5px] text-muted-foreground">credits</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          ))}
          {!loading && data.items?.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No users found.</p>}
        </div>
      </Card>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
//  USER DETAIL SHEET (opens over Users tab)
// ═════════════════════════════════════════════════════════════
const UserDetailSheet = ({ userId, onClose, onChanged }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [bonusOpen, setBonusOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await apiCall(`/admin/ai-credits/users/${userId}`)) }
    catch (e) { toast.error(e.message); onClose?.() }
    finally { setLoading(false) }
  }, [userId, onClose])
  useEffect(() => { load() }, [load])

  const grant = async () => {
    if (!amount || Number(amount) <= 0) { toast.error('Enter a positive credit amount'); return }
    if (!reason || reason.length < 4) { toast.error('Reason must be at least 4 characters'); return }
    setSaving(true)
    try {
      const r = await apiCall('/admin/ai-credits/bonus', { method: 'POST', body: { userId, amount: Number(amount), reason } })
      toast.success(`🎁 Granted ${amount} credits · new balance ${r.newBalance}`)
      setBonusOpen(false); setAmount(''); setReason('')
      await load(); onChanged?.()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  if (loading || !data) return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  )

  const { user, wallet, financial, purchases, transactions, generations, recentCalls } = data

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="sticky top-0 bg-gradient-to-br from-indigo-600 to-violet-700 text-white px-4 py-3 flex items-center gap-3 z-10">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-white hover:bg-white/20"><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] opacity-90">User Credit Profile</p>
          <p className="font-extrabold truncate">{user.name || 'Unknown'} · {user.mobile || user.id.slice(0, 8)}</p>
        </div>
        <Button size="sm" onClick={() => setBonusOpen(true)} className="bg-white text-indigo-700 hover:bg-white/90 font-bold gap-1"><Gift className="w-4 h-4" /> Give Bonus</Button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          <KPI icon={Wallet} label="Balance" value={fmtN(wallet.balance)} sub="credits" tint={wallet.balance > 0 ? 'emerald' : 'rose'} />
          <KPI icon={DollarSign} label="Total Paid" value={fmtINR(financial.totalAmountPaidINR)} sub={`${financial.totalPurchases} purchases`} tint="emerald" />
          <KPI icon={TrendingUp} label="Purchased" value={fmtN(wallet.lifetimePurchased)} tint="blue" />
          <KPI icon={Gift} label="Bonus" value={fmtN(wallet.lifetimeBonus)} tint="violet" />
          <KPI icon={Zap} label="Spent" value={fmtN(wallet.lifetimeSpent)} tint="amber" />
          <KPI icon={RefreshCw} label="Refunded" value={fmtN(wallet.lifetimeRefunded)} tint="rose" />
        </div>

        <div>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">🤖 AI Usage</p>
          <Card className="rounded-2xl p-3">
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div><p className="text-muted-foreground">Successful</p><p className="text-lg font-bold text-emerald-700">{fmtN(generations.ok)}</p></div>
              <div><p className="text-muted-foreground">Failed</p><p className="text-lg font-bold text-rose-700">{fmtN(generations.failed)}</p></div>
              <div><p className="text-muted-foreground">Est. Gemini Cost</p><p className="text-lg font-bold text-amber-700">{fmtINR(generations.costINR)}</p></div>
              <div className="col-span-3"><p className="text-muted-foreground">Tokens (in/out)</p><p className="font-semibold">{fmtN(generations.tokensIn)} / {fmtN(generations.tokensOut)}</p></div>
            </div>
          </Card>
        </div>

        <div>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">💳 Purchases</p>
          <Card className="rounded-2xl overflow-hidden">
            {(purchases || []).length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No purchases yet.</p>}
            <div className="divide-y">
              {(purchases || []).map(p => (
                <div key={p.id} className="p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{p.credits} credits — {p.planId}</p>
                    <p className="text-[10.5px] text-muted-foreground">{fmtDate(p.verifiedAt)} · {p.razorpay_payment_id?.slice(0, 12) || '—'}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-700 tabular-nums">{fmtINR(p.amount)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">⚡ Recent Transactions</p>
          <Card className="rounded-2xl overflow-hidden">
            {(transactions || []).length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No transactions yet.</p>}
            <div className="divide-y max-h-80 overflow-y-auto">
              {(transactions || []).slice(0, 50).map(t => {
                const positive = (Number(t.credits) || 0) >= 0
                const label = t.reason === 'purchase' ? 'PURCHASE' :
                              t.reason === 'admin_bonus' ? 'BONUS' :
                              t.reason === 'bulk_bonus' ? 'BULK BONUS' :
                              t.reason === 'refund' ? 'REFUND' :
                              t.type === 'debit' ? 'GENERATION' : String(t.reason || t.type).toUpperCase()
                return (
                  <div key={t._id} className="p-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="text-[10.5px] text-muted-foreground">{fmtDate(t.createdAt)}{t.zone ? ` · ${t.zone}/${t.generationType || ''}` : ''}</p>
                    </div>
                    <p className={`text-sm font-extrabold tabular-nums ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>{positive ? '+' : ''}{fmtN(t.credits)}</p>
                    <p className="text-[10.5px] text-muted-foreground w-14 text-right">bal {fmtN(t.balanceAfter)}</p>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <div>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">🤖 Recent Gemini Calls</p>
          <Card className="rounded-2xl overflow-hidden">
            {(recentCalls || []).length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No Gemini calls recorded.</p>}
            <div className="divide-y max-h-80 overflow-y-auto">
              {(recentCalls || []).map(c => (
                <div key={c._id} className="p-3 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Badge variant={c.status === 'ok' ? 'default' : 'destructive'} className="text-[9px]">{c.status}</Badge>
                    <span className="font-semibold">{c.zone}/{c.generationType}</span>
                    <span className="ml-auto text-muted-foreground">{fmtDate(c.startedAt)}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Model: {c.model || '—'} · in {fmtN(c.tokensIn)} · out {fmtN(c.tokensOut)} · {fmtINR(c.costINR)} · {c.durationMs}ms
                  </div>
                  {c.errorMessage && <div className="mt-1 text-rose-700 truncate">⚠️ {c.errorMessage}</div>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {bonusOpen && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end lg:items-center justify-center p-4" onClick={() => setBonusOpen(false)}>
          <Card onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-violet-600" />
              <p className="font-extrabold text-lg">Give Bonus Credits</p>
              <Button variant="ghost" size="icon" className="ml-auto rounded-full" onClick={() => setBonusOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">To: <b>{user.name || user.mobile}</b> · Current balance: {fmtN(wallet.balance)}</p>
            <Input type="number" placeholder="Credit amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Textarea placeholder="Reason (required, min 4 chars) — will be logged to the immutable audit trail" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            <Button onClick={grant} disabled={saving} className="w-full h-10 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold">
              {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Granting…</> : `🎁 Grant ${amount || 0} Credits`}
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
//  TRANSACTIONS TAB
// ═════════════════════════════════════════════════════════════
const TransactionsTab = () => {
  const [data, setData] = useState({ items: [], total: 0 })
  const [type, setType] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set('limit', '100')
      if (type) qs.set('type', type)
      if (reason) qs.set('reason', reason)
      setData(await apiCall(`/admin/ai-credits/transactions?${qs.toString()}`))
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [type, reason])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs">
          <option value="">All types</option>
          <option value="credit">Credit</option>
          <option value="debit">Debit</option>
          <option value="refund">Refund</option>
        </select>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs">
          <option value="">All reasons</option>
          <option value="purchase">Purchase</option>
          <option value="admin_bonus">Admin Bonus</option>
          <option value="bulk_bonus">Bulk Bonus</option>
          <option value="refund">Refund</option>
        </select>
        <p className="text-[11px] text-muted-foreground ml-auto">{data.total} total</p>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        {loading && <div className="p-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}
        <div className="divide-y max-h-[70vh] overflow-y-auto">
          {(data.items || []).map(t => {
            const positive = (Number(t.credits) || 0) >= 0
            return (
              <div key={t._id} className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.user?.name || t.userId.slice(0, 12)} <span className="text-[10.5px] font-normal text-muted-foreground">· {t.user?.mobile || ''}</span></p>
                  <p className="text-[10.5px] text-muted-foreground">
                    <Badge variant="outline" className="text-[9px] mr-1">{t.reason || t.type}</Badge>
                    {fmtDate(t.createdAt)}
                    {t.zone && ` · ${t.zone}/${t.generationType || ''}`}
                  </p>
                </div>
                <p className={`text-sm font-extrabold tabular-nums ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>{positive ? '+' : ''}{fmtN(t.credits)}</p>
              </div>
            )
          })}
          {!loading && (data.items || []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No transactions match.</p>}
        </div>
      </Card>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
//  GENERATIONS TAB (Gemini call log)
// ═════════════════════════════════════════════════════════════
const GenerationsTab = () => {
  const [data, setData] = useState({ items: [], total: 0 })
  const [status, setStatus] = useState('')
  const [zone, setZone] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set('limit', '100')
      if (status) qs.set('status', status)
      if (zone) qs.set('zone', zone)
      setData(await apiCall(`/admin/ai-credits/generations?${qs.toString()}`))
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [status, zone])
  useEffect(() => { load() }, [load])

  const totalCost = useMemo(() => (data.items || []).reduce((s, g) => s + (g.costINR || 0), 0), [data])

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs">
          <option value="">All statuses</option>
          <option value="ok">OK</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <select value={zone} onChange={(e) => setZone(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs">
          <option value="">All zones</option>
          <option value="engagement">Engagement</option>
          <option value="worksheet">Worksheet</option>
          <option value="assessment">Assessment</option>
          <option value="resource">Resource</option>
        </select>
        <p className="text-[11px] text-muted-foreground ml-auto">{data.total} total · est. cost {fmtINR(totalCost)}</p>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        {loading && <div className="p-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}
        <div className="divide-y max-h-[70vh] overflow-y-auto">
          {(data.items || []).map(g => (
            <div key={g._id} className="p-3 text-[11px]">
              <div className="flex items-center gap-2">
                <Badge variant={g.status === 'ok' ? 'default' : g.status === 'failed' ? 'destructive' : 'outline'} className="text-[9px]">{g.status}</Badge>
                <span className="font-semibold">{g.zone}/{g.generationType}</span>
                <span className="ml-auto text-muted-foreground">{fmtDate(g.startedAt)}</span>
              </div>
              <div className="mt-1 text-muted-foreground">
                {g.user?.mobile || g.userId?.slice(0, 12) || '—'} · Model: {g.model || '—'} · in {fmtN(g.tokensIn)} · out {fmtN(g.tokensOut)}
                {g.tokensThinking ? ` · think ${fmtN(g.tokensThinking)}` : ''} · {fmtINR(g.costINR)} · {g.durationMs}ms
                {g.tokensSource === 'estimated' && <span className="ml-1 text-amber-700"> · estimated</span>}
              </div>
              {g.creditsDeducted != null && (
                <div className="mt-0.5 text-[10px] text-emerald-700">Credits deducted: {g.creditsDeducted}</div>
              )}
              {g.errorMessage && <div className="mt-1 text-rose-700 truncate">⚠️ {g.errorMessage}</div>}
            </div>
          ))}
          {!loading && (data.items || []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No Gemini calls in the selected range.</p>}
        </div>
      </Card>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
//  AUDIT LOG TAB — read-only immutable admin actions
// ═════════════════════════════════════════════════════════════
const AuditTab = () => {
  const [data, setData] = useState({ items: [], total: 0 })
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set('limit', '100')
      if (action) qs.set('action', action)
      setData(await apiCall(`/admin/ai-credits/audit?${qs.toString()}`))
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [action])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center flex-wrap">
        <Shield className="w-4 h-4 text-violet-600" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Immutable admin audit trail</p>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-xs ml-auto">
          <option value="">All actions</option>
          <option value="BONUS_GRANTED">Bonus Granted</option>
          <option value="BULK_BONUS_GRANTED">Bulk Bonus</option>
          <option value="CREDIT_ADJUSTED">Credit Adjusted</option>
          <option value="MANUAL_REFUND">Manual Refund</option>
          <option value="BONUS_REVERSED">Bonus Reversed</option>
        </select>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        {loading && <div className="p-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}
        <div className="divide-y max-h-[70vh] overflow-y-auto">
          {(data.items || []).map(a => (
            <div key={a._id} className="p-3 text-[11.5px]">
              <div className="flex items-center gap-2">
                <Badge className="text-[9px] bg-violet-100 text-violet-800 hover:bg-violet-100">{a.action}</Badge>
                <span className="ml-auto text-muted-foreground text-[10px]">{fmtDate(a.timestamp)}</span>
              </div>
              <p className="mt-1">
                <span className="text-muted-foreground">Admin:</span> <b>{a.admin?.name || a.adminName || 'Admin'}</b> ({a.admin?.mobile || a.adminMobile || '—'})
                {a.userId && (<> → <span className="text-muted-foreground">User:</span> <b>{a.user?.name || 'Unknown'}</b> ({a.user?.mobile || a.userId.slice(0, 8)})</>)}
              </p>
              {a.amount != null && (
                <p className="mt-0.5 text-emerald-700">
                  {a.amount >= 0 ? '+' : ''}{fmtN(a.amount)} credits · balance {fmtN(a.previousBalance)} → {fmtN(a.newBalance)}
                </p>
              )}
              {a.reason && <p className="mt-0.5 text-muted-foreground italic">Reason: {a.reason}</p>}
            </div>
          ))}
          {!loading && (data.items || []).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No audit entries yet.</p>}
        </div>
      </Card>
      <p className="text-[10px] text-muted-foreground italic px-1">
        Audit entries are append-only. Corrections must be logged as new reversal rows (e.g. BONUS_REVERSED) — never edited or deleted.
      </p>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
//  ROOT — tab shell
// ═════════════════════════════════════════════════════════════
const TABS = [
  { key: 'overview',      label: '📊 Overview' },
  { key: 'users',         label: '👤 Users' },
  { key: 'transactions',  label: '⚡ Transactions' },
  { key: 'generations',   label: '🤖 Gemini Calls' },
  { key: 'audit',         label: '🔐 Audit Log' },
  { key: 'legacy',        label: '⚙️ Costs / Gemini' },
]

export const AdminAICreditManagement = ({ onBack }) => {
  const [tab, setTab] = useState('overview')
  const [days, setDays] = useState(30)
  const [selectedUser, setSelectedUser] = useState(null)

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          {onBack && <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full text-white hover:bg-white/20"><ArrowLeft className="w-5 h-5" /></Button>}
          <div className="flex-1 min-w-0">
            <p className="text-sm opacity-90">Admin</p>
            <p className="font-extrabold text-lg">AI Credit Management</p>
          </div>
        </div>
        {tab === 'overview' && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="opacity-90">Range:</span>
            {[
              { k: 1,   l: 'Today' },
              { k: 7,   l: '7d' },
              { k: 30,  l: '30d' },
              { k: 90,  l: '90d' },
              { k: 365, l: '1y' },
            ].map(({ k, l }) => (
              <button key={k} onClick={() => setDays(k)} className={`px-3 py-1 rounded-full font-semibold ${days === k ? 'bg-white text-indigo-700' : 'bg-white/15 text-white hover:bg-white/25'}`}>{l}</button>
            ))}
          </div>
        )}
      </div>

      {/* Tab strip */}
      <div className="sticky top-0 z-20 bg-background border-b overflow-x-auto">
        <div className="flex">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2.5 text-[11.5px] font-bold whitespace-nowrap border-b-2 transition-colors ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {tab === 'overview'     && <OverviewTab days={days} setDays={setDays} />}
        {tab === 'users'        && <UsersTab onSelectUser={setSelectedUser} />}
        {tab === 'transactions' && <TransactionsTab />}
        {tab === 'generations'  && <GenerationsTab />}
        {tab === 'audit'        && <AuditTab />}
        {tab === 'legacy'       && <AdminAICreditsDashboard onBack={null} />}
      </div>

      {selectedUser && <UserDetailSheet userId={selectedUser} onClose={() => setSelectedUser(null)} onChanged={() => {}} />}
    </div>
  )
}

export default AdminAICreditManagement
