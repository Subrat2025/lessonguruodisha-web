'use client'
// ============================================================================
//  AdminRenewalAnalytics — visualizes the expired-plan renewal-popup funnel.
//  Data: GET /api/admin/renewal/analytics?from&to
//  Funnel: shown → cta_click → checkout_open → paid  (+ revenue & conversion).
// ============================================================================
import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { RefreshCw, Eye, MousePointerClick, CreditCard, CheckCircle2, TrendingUp, MessageCircle, Zap } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts'

const api = async (path) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const inr = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN')
const isoDay = (d) => new Date(d).toISOString().slice(0, 10)

export default function AdminRenewalAnalytics({ onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [from, setFrom] = useState(isoDay(Date.now() - 30 * 86400000))
  const [to, setTo] = useState(isoDay(Date.now()))

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const r = await api(`/admin/renewal/analytics?from=${from}&to=${to}`)
      setData(r)
    } catch (e) {
      setErr(e.message || 'Failed to load')
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const c = data?.counts || { shown: 0, cta_click: 0, checkout_open: 0, paid: 0 }
  const conv = data?.conversion || {}
  const split = data?.channelSplit || { plans: 0, whatsapp: 0, unknown: 0 }
  const splitTotal = (split.plans || 0) + (split.whatsapp || 0) + (split.unknown || 0)
  const splitPct = (n) => (splitTotal > 0 ? Math.round((n / splitTotal) * 1000) / 10 : 0)
  const funnel = [
    { stage: 'Shown', value: c.shown, icon: Eye, tint: 'from-blue-500 to-indigo-600', fill: '#6366f1' },
    { stage: 'CTA Click', value: c.cta_click, icon: MousePointerClick, tint: 'from-violet-500 to-purple-600', fill: '#8b5cf6' },
    { stage: 'Checkout', value: c.checkout_open, icon: CreditCard, tint: 'from-amber-500 to-orange-600', fill: '#f59e0b' },
    { stage: 'Paid', value: c.paid, icon: CheckCircle2, tint: 'from-emerald-500 to-teal-600', fill: '#10b981' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-extrabold text-lg flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /> Renewal Funnel</p>
          <p className="text-[11px] text-muted-foreground">Expired-plan renewal popup — shown → click → checkout → paid.</p>
        </div>
        {onBack && <Button size="sm" variant="outline" onClick={onBack} className="rounded-full">← Back</Button>}
      </div>

      {/* Date range */}
      <Card className="p-3 rounded-2xl border-2 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">From</label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground block mb-1">To</label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Button size="sm" onClick={load} className="rounded-full h-9"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh</Button>
      </Card>

      {loading && !data ? (
        <Card className="p-8 rounded-2xl border-2 text-center text-sm text-muted-foreground">Loading…</Card>
      ) : err ? (
        <Card className="p-6 rounded-2xl border-2 border-red-200 text-center">
          <p className="text-sm text-red-600 font-semibold">{err}</p>
          <Button size="sm" onClick={load} className="rounded-full mt-3"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry</Button>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {funnel.map((f, i) => (
              <Card key={i} className={`p-4 rounded-2xl bg-gradient-to-br ${f.tint} text-white border-0`}>
                <f.icon className="w-5 h-5 opacity-90" />
                <p className="font-extrabold text-2xl mt-2">{Number(f.value || 0).toLocaleString('en-IN')}</p>
                <p className="text-[11px] opacity-90">{f.stage}</p>
              </Card>
            ))}
          </div>

          {/* Revenue + conversion strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3 rounded-2xl border-2">
              <p className="text-[10px] text-muted-foreground">Revenue (attributed)</p>
              <p className="font-extrabold text-lg text-emerald-600">{inr(data?.revenue)}</p>
            </Card>
            <Card className="p-3 rounded-2xl border-2">
              <p className="text-[10px] text-muted-foreground">Shown → Click</p>
              <p className="font-extrabold text-lg">{conv.shownToClickPct ?? 0}%</p>
            </Card>
            <Card className="p-3 rounded-2xl border-2">
              <p className="text-[10px] text-muted-foreground">Checkout → Paid</p>
              <p className="font-extrabold text-lg">{conv.checkoutToPaidPct ?? 0}%</p>
            </Card>
            <Card className="p-3 rounded-2xl border-2">
              <p className="text-[10px] text-muted-foreground">Shown → Paid</p>
              <p className="font-extrabold text-lg text-emerald-600">{conv.shownToPaidPct ?? 0}%</p>
            </Card>
          </div>

          {/* Channel split — WhatsApp vs In-App renew clicks */}
          <Card className="p-4 rounded-2xl border-2">
            <p className="font-bold text-sm mb-3">CTA Channel Split (which channel teachers tap)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-3 bg-gradient-to-br from-emerald-500 to-green-600 text-white">
                <div className="flex items-center gap-1.5"><Zap className="w-4 h-4" /><span className="text-[11px] opacity-90">In-App Renew</span></div>
                <p className="font-extrabold text-2xl mt-1">{Number(split.plans || 0).toLocaleString('en-IN')}</p>
                <p className="text-[10px] opacity-90">{splitPct(split.plans)}% of clicks</p>
              </div>
              <div className="rounded-2xl p-3 bg-[#25D366] text-white">
                <div className="flex items-center gap-1.5"><MessageCircle className="w-4 h-4" /><span className="text-[11px] opacity-90">WhatsApp</span></div>
                <p className="font-extrabold text-2xl mt-1">{Number(split.whatsapp || 0).toLocaleString('en-IN')}</p>
                <p className="text-[10px] opacity-90">{splitPct(split.whatsapp)}% of clicks</p>
              </div>
            </div>
            {/* proportion bar */}
            <div className="mt-3 h-3 w-full rounded-full overflow-hidden bg-muted flex">
              <div className="h-full bg-emerald-500" style={{ width: `${splitPct(split.plans)}%` }} title={`In-App ${splitPct(split.plans)}%`} />
              <div className="h-full bg-[#25D366]" style={{ width: `${splitPct(split.whatsapp)}%` }} title={`WhatsApp ${splitPct(split.whatsapp)}%`} />
              {split.unknown > 0 && <div className="h-full bg-slate-400" style={{ width: `${splitPct(split.unknown)}%` }} title={`Unknown ${splitPct(split.unknown)}%`} />}
            </div>
            {split.unknown > 0 && <p className="text-[10px] text-muted-foreground mt-1.5">{split.unknown} older click(s) without a channel tag.</p>}
          </Card>

          {/* Funnel bar chart */}
          <Card className="p-4 rounded-2xl border-2">
            <p className="font-bold text-sm mb-3">Funnel</p>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={funnel} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Daily trend */}
          <Card className="p-4 rounded-2xl border-2">
            <p className="font-bold text-sm mb-3">Daily Trend</p>
            {(data?.trend || []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No events in this range yet.</p>
            ) : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={data.trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="shown" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cta_click" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="checkout_open" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="paid" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
