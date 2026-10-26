'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, RefreshCw, TrendingUp, DollarSign, RotateCcw, Zap, CircleGauge, Save, ArrowLeft, Gift, AlertTriangle, Activity, ShieldAlert } from 'lucide-react'

const apiCall = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const url = `/api${path}`
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  })
  const ct = res.headers.get('content-type') || ''
  let data = {}
  if (ct.includes('application/json')) {
    data = await res.json().catch(() => ({}))
  } else {
    const txt = await res.text().catch(() => '')
    data = { error: `Unexpected response (${res.status}). ${txt.slice(0, 100)}` }
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

const KPI = ({ icon: Icon, label, value, sub, tint = 'violet' }) => {
  const tints = {
    violet: 'from-violet-500 to-fuchsia-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-indigo-500',
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

export const AdminAICreditsDashboard = ({ onBack }) => {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [edits, setEdits] = useState({}) // costId → new credits
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiCall(`/admin/ai-credits/analytics?days=${days}`)
      setData(r)
    } catch (e) {
      toast.error(e.message)
    } finally { setLoading(false) }
  }, [days])
  useEffect(() => { load() }, [load])

  const saveCost = async (row) => {
    const newVal = Number(edits[row._id])
    if (!(newVal >= 1)) { toast.error('Minimum cost is 1 credit'); return }
    setSavingId(row._id)
    try {
      await apiCall('/admin/ai-credits/costs', { method: 'POST', body: { _id: row._id, credits: newVal } })
      toast.success(`${row.label}: ${newVal} credits`)
      setEdits((e) => { const { [row._id]: _, ...rest } = e; return rest })
      load()
    } catch (e) { toast.error(e.message) }
    finally { setSavingId(null) }
  }

  if (!data && loading) return <div className="p-8 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin" /></div>
  if (!data) return null

  const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

  return (
    <div className="pb-24">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          {onBack && <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full text-white hover:bg-white/20"><ArrowLeft className="w-5 h-5" /></Button>}
          <div className="flex-1 min-w-0">
            <p className="text-sm opacity-90">Admin</p>
            <p className="font-extrabold text-lg">AI Credits Margin Dashboard</p>
          </div>
          <Button variant="ghost" size="icon" onClick={load} className="rounded-full text-white hover:bg-white/20">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="opacity-90">Range:</span>
          {[7, 30, 90, 365].map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`px-3 py-1 rounded-full font-semibold ${days === n ? 'bg-white text-indigo-700' : 'bg-white/15 text-white hover:bg-white/25'}`}>
              {n}d
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-2.5">
        <KPI icon={DollarSign} label="Revenue" value={fmtINR(data.revenueINR)} sub={`${data.txnByType.credit.count} purchases`} tint="emerald" />
        <KPI icon={Zap} label="Gemini Cost" value={fmtINR(data.geminiSpendINR)} sub={`${data.geminiByStatus.ok.count} calls`} tint="amber" />
        <KPI icon={TrendingUp} label="Gross Profit" value={fmtINR(data.grossProfitINR)} sub={`${data.grossMarginPct}% margin`} tint="violet" />
        <KPI icon={RotateCcw} label="Refunds" value={`${data.txnByType.refund.totalCredits} cr`} sub={`${data.txnByType.refund.count} events`} tint="rose" />
        <KPI icon={CircleGauge} label="Cache Hit Rate" value={`${data.cache.cacheHitRate}%`} sub={`${data.cache.hits}/${data.cache.totalGenerations} served cached`} tint="blue" />
        <KPI icon={TrendingUp} label="Wallet Users" value={data.wallet.totalUsers} sub={`${data.wallet.totalBalance} cr in wallets`} tint="violet" />
      </div>

      <div className="px-4 mt-6">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Cost Editor + Margin Projection</p>
        <p className="text-[11px] text-muted-foreground mb-2">Change credit cost per generation. Estimated at ₹{data.inrPerCredit}/credit (Smart plan reference). Minimum: 1 credit.</p>
        <Card className="rounded-2xl overflow-hidden">
          <div className="max-h-[420px] overflow-y-auto divide-y">
            {(data.costsWithMargin || []).map((c) => {
              const editing = edits[c._id] !== undefined
              const val = editing ? edits[c._id] : c.credits
              return (
                <div key={c._id} className="p-3 flex items-center gap-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{c.label}</p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {c.zone} · {c.type} · Revenue {fmtINR(c.estRevenueINR)} · Gross {fmtINR(c.estGrossMarginINR)} ({c.estMarginPct}%)
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={val}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [c._id]: e.target.value }))}
                    className="w-16 h-8 text-sm text-center"
                  />
                  <Badge variant="outline" className="text-[10px]">
                    {c.estMarginPct >= 80 ? '🟢' : c.estMarginPct >= 50 ? '🟡' : '🔴'} {c.estMarginPct}%
                  </Badge>
                  <Button
                    size="sm"
                    onClick={() => saveCost(c)}
                    disabled={!editing || savingId === c._id || Number(val) < 1}
                    className="h-8 rounded-lg"
                  >
                    {savingId === c._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <div className="px-4 mt-6">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Top Generations ({data.rangeDays}d)</p>
        <Card className="rounded-2xl overflow-hidden">
          <div className="max-h-[280px] overflow-y-auto divide-y">
            {(data.zoneBreakdown || []).length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No generations yet.</p>}
            {(data.zoneBreakdown || []).map((z, i) => (
              <div key={i} className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize">{z._id.zone} · {z._id.type?.replace(/_/g, ' ')}</p>
                  <p className="text-[10.5px] text-muted-foreground">{z.creditsSpent} credits spent · {z.cacheHits}/{z.generations} cache hits</p>
                </div>
                <p className="text-sm font-bold tabular-nums">{z.generations}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="px-4 mt-6">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Revenue By Plan ({data.rangeDays}d)</p>
        <Card className="rounded-2xl overflow-hidden">
          <div className="divide-y">
            {(data.revenueByPlan || []).length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No purchases yet.</p>}
            {(data.revenueByPlan || []).map((r) => {
              const plan = (data.plans || []).find(p => p._id === r._id) || { name: r._id }
              return (
                <div key={r._id} className="p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="text-[10.5px] text-muted-foreground">{r.purchases} purchases · {r.credits} credits sold</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-700">{fmtINR(r.revenueINR)}</p>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <GiftCreditsPanel onGranted={load} />
      <GeminiStatusPanel />
    </div>
  )
}

// ─── Gift Credits Panel (admin bonus grants) ────────────────────────────────
const GiftCreditsPanel = ({ onGranted }) => {
  const [mobile, setMobile] = useState('')
  const [credits, setCredits] = useState('')
  const [reason, setReason] = useState('')
  const [override, setOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const SOFT_CAP = 10000
  const creditsNum = Math.floor(Number(credits) || 0)
  const isLarge = creditsNum > SOFT_CAP
  const canSubmit = mobile.replace(/\D/g, '').length === 10 && creditsNum > 0 && reason.trim().length >= 3 && (!isLarge || (override && overrideReason.trim().length >= 5))

  const grant = async () => {
    setBusy(true)
    try {
      const r = await apiCall('/admin/ai-credits/grant', {
        method: 'POST',
        body: {
          mobile: mobile.replace(/\D/g, ''),
          credits: creditsNum,
          reason: reason.trim(),
          overrideLargeGrant: override,
          overrideReason: override ? overrideReason.trim() : undefined,
        },
      })
      setLastResult(r)
      toast.success(r.message || 'Credits granted')
      setMobile(''); setCredits(''); setReason(''); setOverride(false); setOverrideReason('')
      setConfirming(false)
      onGranted && onGranted()
    } catch (e) {
      toast.error(e.message || 'Grant failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="px-4 mt-6">
      <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1"><Gift className="w-4 h-4" /> Gift Credits (Admin Bonus)</p>
      <Card className="p-4 rounded-2xl space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">User Mobile</label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10 digits" maxLength={13} className="h-9 mt-1" />
          </div>
          <div>
            <label className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Credits</label>
            <Input type="number" min={1} value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 100" className="h-9 mt-1" />
          </div>
        </div>
        <div>
          <label className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Reason (required)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Beta tester / support case / etc." className="h-9 mt-1" />
        </div>
        {isLarge && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 text-xs font-bold"><AlertTriangle className="w-4 h-4" /> Large grant (&gt; {SOFT_CAP.toLocaleString('en-IN')} credits)</div>
            <label className="flex items-center gap-2 text-xs text-amber-900">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              I confirm this override large grant
            </label>
            {override && (
              <div>
                <label className="text-[10.5px] font-semibold uppercase tracking-wider text-amber-800">Override reason (min 5 chars)</label>
                <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Marketing partnership grant" className="h-9 mt-1 bg-white" />
              </div>
            )}
          </div>
        )}
        {!confirming ? (
          <Button disabled={!canSubmit || busy} onClick={() => setConfirming(true)} className="w-full rounded-xl h-10 bg-violet-600 hover:bg-violet-700 text-white font-bold">
            <Gift className="w-4 h-4 mr-2" /> Review & Grant
          </Button>
        ) : (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
            <p className="text-xs font-bold text-emerald-900">Confirm grant?</p>
            <p className="text-[11px] text-emerald-900">
              Grant <b>{creditsNum.toLocaleString('en-IN')} credits</b> to <b>{mobile}</b> · reason: <i>&quot;{reason}&quot;</i>{isLarge && override ? <> · <b>OVERRIDE:</b> {overrideReason}</> : null}
            </p>
            <div className="flex gap-2">
              <Button onClick={grant} disabled={busy} className="flex-1 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Grant'}
              </Button>
              <Button onClick={() => setConfirming(false)} disabled={busy} variant="outline" className="flex-1 h-9 rounded-lg">Cancel</Button>
            </div>
          </div>
        )}
        {lastResult && lastResult.ok && (
          <p className="text-[11px] text-emerald-700 font-semibold">✓ Last grant: {lastResult.credited} credits → new balance {lastResult.balance}</p>
        )}
      </Card>
    </div>
  )
}

// ─── Gemini Quota / Status Panel (informational only) ───────────────────────
const GeminiStatusPanel = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await apiCall('/admin/ai-credits/gemini-status')) }
    catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  if (!data) return null

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN')
  return (
    <div className="px-4 mt-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Activity className="w-4 h-4" /> Gemini Status</p>
        <Button variant="ghost" size="icon" onClick={load} className="h-7 w-7"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
      </div>
      <Card className="p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Model</span>
          <span className="font-semibold">{data.model}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">API Key</span>
          <span className={`font-semibold ${data.keyConfigured ? 'text-emerald-700' : 'text-rose-700'}`}>{data.keyConfigured ? '✓ Configured' : '✗ Missing'}</span>
        </div>
        {data.quotaAlert && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0" />
            <div className="text-[11px] text-amber-900">{data.quotaAlertMessage}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="p-2 rounded-lg bg-muted">
            <p className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Today</p>
            <p>OK: <b>{fmt(data.today.ok)}</b> · Failed: <b className={data.today.failed ? 'text-rose-700' : ''}>{fmt(data.today.failed)}</b></p>
            <p>Error rate: <b>{data.errorRatePctToday}%</b></p>
            <p>Cost: <b>₹{data.today.costINR}</b></p>
          </div>
          <div className="p-2 rounded-lg bg-muted">
            <p className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">This Month</p>
            <p>OK: <b>{fmt(data.month.ok)}</b> · Failed: <b>{fmt(data.month.failed)}</b></p>
            <p>Tokens: <b>{fmt(data.month.tokensIn + data.month.tokensOut)}</b></p>
            <p>Cost: <b>₹{data.month.costINR}</b></p>
          </div>
        </div>
        {data.recentFailures && data.recentFailures.length > 0 && (
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Recent Failures</p>
            <div className="max-h-32 overflow-y-auto text-[10.5px] space-y-1">
              {data.recentFailures.map((f, i) => (
                <div key={i} className="p-2 rounded bg-rose-50 border border-rose-100 text-rose-900">
                  <div className="font-semibold">{f.zone}/{f.type} · {new Date(f.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="opacity-80 truncate">{f.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">Note: AI Credit zones (Engagement / Worksheets / Assessment) are Gemini-only. This dashboard is informational — no automatic provider switch.</p>
      </Card>
    </div>
  )
}
