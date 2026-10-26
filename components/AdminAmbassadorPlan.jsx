'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Crown, Loader2 } from 'lucide-react'

const authFetch = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

// Admin: edit the Ambassador Renewal plan price + ON/OFF (settings key 'ambassador_plan').
export default function AdminAmbassadorPlan() {
  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = () => authFetch('/admin/ambassador-plan').then(d => setCfg(d.config)).catch(() => {}).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      const d = await authFetch('/admin/ambassador-plan', { method: 'PUT', body: JSON.stringify(cfg) })
      setCfg(d.config)
      toast.success('✅ Ambassador plan saved')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  if (loading || !cfg) return <Card className="p-4 rounded-2xl border-2 text-sm text-muted-foreground">Loading Ambassador plan…</Card>
  return (
    <Card className="p-4 rounded-2xl border-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500 to-pink-600 grid place-items-center text-white shadow"><Crown className="w-4 h-4" /></div>
        <div className="flex-1">
          <p className="font-bold text-sm">Ambassador Renewal Plan</p>
          <p className="text-[11px] text-muted-foreground">₹/year plan shown only to teachers who reached the required referral milestone (set in Referrals → Milestone Settings · “Ambassador required referrals”, default 500).</p>
        </div>
        <Switch checked={cfg.enabled !== false} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">Price (₹/year)</label>
          <Input type="number" value={cfg.priceInr} onChange={(e) => setCfg({ ...cfg, priceInr: e.target.value })} className="h-10 rounded-xl mt-1" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">Days</label>
          <Input type="number" value={cfg.days} onChange={(e) => setCfg({ ...cfg, days: e.target.value })} className="h-10 rounded-xl mt-1" />
        </div>
      </div>
      <div className="mt-3">
        <label className="text-[11px] font-bold text-muted-foreground">Odia label (shown on card)</label>
        <Input value={cfg.labelOdia || ''} onChange={(e) => setCfg({ ...cfg, labelOdia: e.target.value })} className="h-10 rounded-xl mt-1" style={{ fontFamily: '"Noto Sans Oriya",Inter,sans-serif' }} />
      </div>
      <Button onClick={save} disabled={saving} className="w-full h-10 rounded-xl font-bold mt-3 bg-gradient-to-r from-fuchsia-600 to-pink-600">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Ambassador Plan'}</Button>
    </Card>
  )
}
