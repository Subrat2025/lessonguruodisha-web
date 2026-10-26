'use client'
// ============================================================================
//  AdminAccountDeletions — process account deletion requests (Google Play policy).
//  Data: GET /api/admin/account-deletions?status · act: POST /api/admin/account-deletions/:id { action }
// ============================================================================
import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Trash2, RefreshCw } from 'lucide-react'

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
const day = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function AdminAccountDeletions() {
  const [status, setStatus] = useState('pending')
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState({})
  const load = () => { api('/admin/account-deletions?status=' + status).then(setData).catch(e => toast.error(e.message)) }
  useEffect(() => { load() }, [status])

  const act = async (r, action) => {
    const msg = action === 'process'
      ? `Permanently delete ${r.name} (${r.mobile})?\n\nTheir Cloud Library files are deleted and the account is anonymised. Payment records are kept for tax law. This cannot be undone.`
      : `Cancel the deletion request from ${r.name}? (Only if the teacher asked to keep the account.)`
    if (!confirm(msg)) return
    setBusy(b => ({ ...b, [r.id]: true }))
    try {
      const j = await api('/admin/account-deletions/' + r.id, { method: 'POST', body: { action } })
      toast.success(action === 'process' ? `Deleted · ${j.request.result?.filesDeleted || 0} cloud files removed` : 'Request cancelled')
      load()
    } catch (e) { toast.error(e.message) } finally { setBusy(b => ({ ...b, [r.id]: false })) }
  }

  const c = data?.counts || {}
  return (
    <div className="space-y-4 mt-3">
      <Card className="p-4 rounded-2xl border-0 text-white bg-gradient-to-br from-slate-700 to-slate-900">
        <p className="font-extrabold text-lg flex items-center gap-2"><Trash2 className="w-5 h-5" /> Account deletion requests</p>
        <p className="text-xs opacity-90 mt-1">Google Play requires every request to be completed. Process each within {data?.slaDays || 30} days.</p>
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          {[['Pending', c.pending], ['Done', c.processed], ['Cancelled', c.cancelled]].map(([l, v]) => (
            <div key={l} className="bg-white/10 rounded-xl py-2"><p className="text-xl font-extrabold">{v ?? '–'}</p><p className="text-[11px] opacity-80">{l}</p></div>
          ))}
        </div>
      </Card>
      <div className="flex gap-2">
        {['pending', 'processed', 'cancelled'].map(s => <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} className="rounded-full capitalize" onClick={() => setStatus(s)}>{s}</Button>)}
        <Button size="sm" variant="ghost" className="ml-auto rounded-full" onClick={load}><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>
      {!data ? <p className="text-sm text-muted-foreground text-center">Loading…</p> : data.requests.length === 0
        ? <p className="text-sm text-muted-foreground text-center py-6">No {status} requests.</p>
        : data.requests.map(r => (
          <Card key={r.id} className={`p-4 rounded-2xl border-2 ${r.overdue ? 'border-rose-400' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{r.name || '—'} <span className="font-normal text-muted-foreground text-sm">{r.mobile}</span></p>
                <p className="text-xs text-muted-foreground">Requested {day(r.requestedAt)}{r.status === 'pending' ? ` · due ${day(r.dueAt)}` : ''}{r.processedAt ? ` · done ${day(r.processedAt)}` : ''}</p>
                {r.reason && <p className="text-xs mt-1">“{r.reason}”</p>}
                {r.result && <p className="text-xs mt-1 text-emerald-700">{r.result.filesDeleted} cloud files removed</p>}
              </div>
              {r.overdue && <span className="text-[10px] font-bold bg-rose-600 text-white rounded-full px-2 py-0.5">OVERDUE</span>}
            </div>
            {r.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="destructive" disabled={busy[r.id]} onClick={() => act(r, 'process')}><Trash2 className="w-3.5 h-3.5 mr-1" />Delete account</Button>
                <Button size="sm" variant="outline" disabled={busy[r.id]} onClick={() => act(r, 'cancel')}>Cancel request</Button>
              </div>
            )}
          </Card>
        ))}
    </div>
  )
}
