'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LogIn, RefreshCw, Loader2 } from 'lucide-react'

const getToken = () => (typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null)
const authFetch = async (path, opts = {}) => {
  const token = getToken()
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

// Admin: Toolkit auto-login (SSO) — per-host kill switch + audit log.
export default function AdminSsoToolkit() {
  const [settings, setSettings] = useState({ enabled_preview: true, enabled_live: false })
  const [currentHostType, setCurrentHostType] = useState('')
  const [audit, setAudit] = useState([])
  const [linked, setLinked] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [unlinking, setUnlinking] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const d = await authFetch('/admin/sso-toolkit')
      setSettings(d.settings || { enabled_preview: true, enabled_live: false })
      setCurrentHostType(d.currentHostType || '')
      setAudit(Array.isArray(d.audit) ? d.audit : [])
      setLinked(Array.isArray(d.linked) ? d.linked : [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const toggle = async (hostType, val) => {
    setBusy(hostType)
    try {
      const d = await authFetch('/admin/sso-toolkit', { method: 'PUT', body: JSON.stringify({ hostType, enabled: val }) })
      setSettings(d.settings)
      toast.success(`${hostType.toUpperCase()} auto-login ${val ? 'ENABLED' : 'DISABLED'}`)
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }

  const unlink = async (userId) => {
    setUnlinking(userId)
    try {
      await authFetch('/admin/sso-toolkit/unlink', { method: 'POST', body: JSON.stringify({ userId }) })
      setLinked((rows) => rows.filter((r) => r.id !== userId))
      toast.success('Account unlinked')
      load()
    } catch (e) { toast.error(e.message) } finally { setUnlinking('') }
  }

  const resultBadge = (r) => {
    if (r === 'ok' || r === 'ok_new') return <Badge className="bg-emerald-600">{r === 'ok_new' ? 'ok (new)' : 'ok'}</Badge>
    if (r === 'linked') return <Badge className="bg-emerald-600">linked</Badge>
    if (r === 'unlinked') return <Badge variant="secondary">unlinked</Badge>
    if (r === 'confirm_required') return <Badge className="bg-indigo-600">confirm OTP</Badge>
    if (r === 'disabled') return <Badge variant="secondary">disabled</Badge>
    if (r === 'rate_limited') return <Badge className="bg-amber-600">rate-limited</Badge>
    if (r === 'admin_blocked' || r === 'link_admin_blocked') return <Badge className="bg-rose-600">admin blocked</Badge>
    if (r === 'blocked') return <Badge className="bg-rose-600">blocked</Badge>
    if (r === 'nonce_reuse') return <Badge className="bg-rose-600">replay</Badge>
    if (r === 'link_mismatch') return <Badge className="bg-rose-600">phone mismatch</Badge>
    return <Badge variant="outline" className="text-rose-600 border-rose-300">{r}</Badge>
  }

  const Row = ({ label, hostType, enabled, isCurrent }) => (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{hostType}</span>
        {isCurrent && <Badge variant="outline" className="text-[10px]">you are here</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold ${enabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>{enabled ? 'ON' : 'OFF'}</span>
        {busy === hostType ? <Loader2 className="w-4 h-4 animate-spin" /> : (
          <Switch checked={!!enabled} onCheckedChange={(v) => toggle(hostType, v)} />
        )}
      </div>
    </div>
  )

  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center"><LogIn className="w-5 h-5 text-indigo-600" /></div>
          <div>
            <h3 className="font-bold leading-tight">Toolkit auto-login (SSO)</h3>
            <p className="text-[11px] text-muted-foreground">Auto-login from Teacher Utility Toolkit, per host</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="rounded-full"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <>
          <div className="rounded-xl border border-border divide-y divide-border px-3">
            <Row label="Preview" hostType="preview" enabled={settings.enabled_preview} isCurrent={currentHostType === 'preview'} />
            <Row label="Live" hostType="live" enabled={settings.enabled_live} isCurrent={currentHostType === 'live'} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Linked Toolkit accounts</h4>
              <span className="text-[11px] text-muted-foreground">{linked.length} linked</span>
            </div>
            {linked.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No linked accounts yet. Existing accounts must confirm via OTP before auto-login.</p>
            ) : (
              <div className="max-h-56 overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Phone</th>
                      <th className="px-3 py-2 font-semibold">Linked</th>
                      <th className="px-3 py-2 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linked.map((u) => (
                      <tr key={u.id} className="border-t border-border">
                        <td className="px-3 py-2">{u.name || '—'}{u.source === 'toolkit' && <span className="ml-1 text-[10px] text-muted-foreground">(new)</span>}</td>
                        <td className="px-3 py-2 font-mono">{u.phoneLast4 ? `••••${u.phoneLast4}` : '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{u.linkedAt ? new Date(u.linkedAt).toLocaleDateString() : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {unlinking === u.id ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (
                            <Button size="sm" variant="outline" className="h-7 rounded-full text-[11px]" onClick={() => unlink(u.id)}>Unlink</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Recent auto-logins (last 50)</h4>
              <span className="text-[11px] text-muted-foreground">{audit.length} entries</span>
            </div>
            {audit.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No activity yet.</p>
            ) : (
              <div className="max-h-72 overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Time</th>
                      <th className="px-3 py-2 font-semibold">Phone</th>
                      <th className="px-3 py-2 font-semibold">Host</th>
                      <th className="px-3 py-2 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((a, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 whitespace-nowrap">{a.at ? new Date(a.at).toLocaleString() : '-'}</td>
                        <td className="px-3 py-2 font-mono">{a.phoneLast4 ? `••••${a.phoneLast4}` : '—'}</td>
                        <td className="px-3 py-2">{a.hostType || '-'}</td>
                        <td className="px-3 py-2">{resultBadge(a.result)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
