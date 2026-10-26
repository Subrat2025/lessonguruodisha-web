'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Handshake, Download, RefreshCw, Loader2 } from 'lucide-react'

const getToken = () => (typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null)
const authFetch = async (path, opts = {}) => {
  const token = getToken()
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

// Admin: Partner Activations (Toolkit combos) — list + CSV + kill switch.
export default function AdminPartnerActivations() {
  const [enabled, setEnabled] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await authFetch('/admin/partner-activations')
      setEnabled(!!d.enabled)
      setRows(Array.isArray(d.activations) ? d.activations : [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const toggle = async (val) => {
    setToggling(true)
    try {
      await authFetch('/admin/partner-activations', { method: 'PUT', body: JSON.stringify({ enabled: val }) })
      setEnabled(val)
      toast.success(val ? 'Partner grant ENABLED' : 'Partner grant DISABLED')
    } catch (e) { toast.error(e.message) } finally { setToggling(false) }
  }

  const exportCsv = async () => {
    try {
      const token = getToken()
      const res = await fetch('/api/admin/partner-activations?format=csv', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `partner-activations-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) { toast.error(e.message) }
  }

  const statusBadge = (s) => {
    if (s === 'active') return <Badge className="bg-emerald-600">active</Badge>
    if (s === 'revoked') return <Badge className="bg-rose-600">revoked</Badge>
    return <Badge variant="secondary">{s}</Badge>
  }

  return (
    <Card className="p-4 rounded-2xl border-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-white shadow"><Handshake className="w-4 h-4" /></div>
        <div className="flex-1">
          <p className="font-bold text-sm">Partner Activations</p>
          <p className="text-[11px] text-muted-foreground">Teacher Utility Toolkit combos (Combo Master / Combo Duo). Each grants Premium for 365 days.</p>
        </div>
        <Button onClick={load} variant="ghost" size="icon" className="h-8 w-8"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></Button>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-muted p-3 mb-3">
        <div>
          <p className="text-[12px] font-bold">Kill switch — allow partner grants</p>
          <p className="text-[11px] text-muted-foreground">Default OFF. When OFF, <code>/api/partner/grant</code> returns 403. Revoke always works.</p>
        </div>
        <div className="flex items-center gap-2">
          {toggling && <Loader2 className="w-4 h-4 animate-spin" />}
          <Switch checked={enabled} onCheckedChange={toggle} disabled={toggling} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-bold">Recent activations <span className="text-muted-foreground font-normal">({rows.length})</span></p>
        <Button onClick={exportCsv} variant="outline" size="sm" className="h-8 rounded-lg"><Download className="w-3.5 h-3.5 mr-1" />CSV</Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-[12px]">
          <thead className="bg-muted/60">
            <tr className="text-left">
              <th className="p-2 font-bold">Date</th>
              <th className="p-2 font-bold">Phone</th>
              <th className="p-2 font-bold">Combo</th>
              <th className="p-2 font-bold">Days</th>
              <th className="p-2 font-bold">Order ID</th>
              <th className="p-2 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No activations yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.orderId} className="border-t">
                <td className="p-2 whitespace-nowrap">{r.date ? new Date(r.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                <td className="p-2 font-mono">****{r.phoneLast4}</td>
                <td className="p-2">{r.comboType === 'master' ? 'Master' : r.comboType === 'duo' ? 'Duo' : r.comboType}</td>
                <td className="p-2">{r.days}</td>
                <td className="p-2 font-mono text-[11px] max-w-[160px] truncate" title={r.orderId}>{r.orderId}</td>
                <td className="p-2">{statusBadge(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
