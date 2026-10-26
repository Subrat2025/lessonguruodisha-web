'use client'
// ============================================================================
//  AdminOtpHealth — why WhatsApp OTPs are (not) arriving.
//  Data: GET /api/admin/otp-health · test send: POST /api/admin/otp-health { mobile }
// ============================================================================
import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { RefreshCw, Send, CheckCircle2, AlertTriangle } from 'lucide-react'

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
const when = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function AdminOtpHealth() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [mobile, setMobile] = useState('')
  const [test, setTest] = useState(null)

  const load = () => { setBusy(true); api('/admin/otp-health').then(setData).catch(e => toast.error(e.message)).finally(() => setBusy(false)) }
  useEffect(() => { load() }, [])

  const sendTest = async () => {
    setTest(null)
    try {
      const r = await api('/admin/otp-health', { method: 'POST', body: { mobile } })
      setTest(r)
      r.ok ? toast.success('Accepted by BulkyMarketing — check WhatsApp on that number') : toast.error('Provider rejected the test OTP')
      load()
    } catch (e) { toast.error(e.message) }
  }

  if (!data) return <p className="text-sm text-muted-foreground mt-6 text-center">{busy ? 'Checking OTP service…' : 'No data'}</p>
  const ok = data.problems.length === 0
  const counts = data.last24h.counts || {}
  const sent = counts.sent || 0
  const failed = Object.entries(counts).filter(([k]) => k.startsWith('failed')).reduce((a, [, n]) => a + n, 0)
  const blocked = Object.entries(counts).filter(([k]) => k.startsWith('blocked')).reduce((a, [, n]) => a + n, 0)

  return (
    <div className="space-y-4 mt-3">
      <Card className={`p-4 rounded-2xl border-0 text-white bg-gradient-to-br ${ok ? 'from-emerald-500 to-teal-600' : 'from-rose-500 to-orange-500'}`}>
        <div className="flex items-start gap-3">
          {ok ? <CheckCircle2 className="w-7 h-7 shrink-0" /> : <AlertTriangle className="w-7 h-7 shrink-0" />}
          <div className="flex-1">
            <p className="font-extrabold text-lg leading-tight">{ok ? 'WhatsApp OTP looks healthy' : 'WhatsApp OTP needs attention'}</p>
            {ok ? <p className="text-xs opacity-90 mt-1">Keys set, template approved, sends are being accepted.</p>
              : <ul className="text-xs mt-1 space-y-1 list-disc pl-4">{data.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          </div>
          <Button size="sm" variant="secondary" onClick={load} disabled={busy} className="rounded-full"><RefreshCw className="w-3.5 h-3.5 mr-1" />Recheck</Button>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {[['Sent (24h)', sent, 'from-blue-500 to-indigo-600'], ['Failed', failed, 'from-rose-500 to-pink-600'], ['Rate-limited', blocked, 'from-amber-500 to-orange-600']].map(([l, v, g]) => (
          <Card key={l} className={`p-3 rounded-2xl border-0 text-white bg-gradient-to-br ${g}`}><p className="text-2xl font-extrabold">{v}</p><p className="text-[11px] opacity-90">{l}</p></Card>
        ))}
      </div>

      <Card className="p-4 rounded-2xl border-2 text-sm space-y-1.5">
        <p className="font-bold">Provider setup</p>
        <p>Provider: <b>{data.config.provider}</b> · {data.config.baseUrl}</p>
        <p>API keys: <b className={data.config.credentialsSet ? 'text-emerald-600' : 'text-rose-600'}>{data.config.credentialsSet ? 'set' : 'MISSING'}</b></p>
        <p>OTP template: <b>{data.config.templateId}</b> ({data.config.language}) — {data.template.found
          ? <b className={data.template.status === 'APPROVED' ? 'text-emerald-600' : 'text-rose-600'}>{data.template.status}</b>
          : <span className="text-rose-600">{data.template.error || 'not checked'}</span>}</p>
        {data.wallet && <p>Wallet estimate: <b>₹{Number(data.wallet.balance || 0).toLocaleString('en-IN')}</b>{data.wallet.stale ? ' (stale — update it in WhatsApp Campaigns)' : ''}</p>}
      </Card>

      <Card className="p-4 rounded-2xl border-2">
        <p className="font-bold text-sm">Send a test OTP</p>
        <p className="text-xs text-muted-foreground mt-0.5">Sends a real WhatsApp OTP through the same template. The code isn't saved, so it can't be used to log in.</p>
        <div className="flex gap-2 mt-3">
          <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="10-digit WhatsApp number" inputMode="numeric" />
          <Button onClick={sendTest} disabled={mobile.replace(/\D/g, '').length < 10}><Send className="w-4 h-4 mr-1" />Send</Button>
        </div>
        {test && (
          <div className={`mt-3 rounded-xl p-3 text-xs ${test.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
            <p className="font-bold">{test.ok ? 'Accepted' : 'Rejected'} · HTTP {test.providerStatus} · {test.messageStatus || '—'}{test.providerRef ? ' · ref ' + test.providerRef : ''}</p>
            <p className="mt-1 break-all font-mono">{test.reply}</p>
            <p className="mt-1">{test.hint}</p>
          </div>
        )}
      </Card>

      <Card className="p-4 rounded-2xl border-2">
        <p className="font-bold text-sm">Recent failures & blocks</p>
        {data.recentProblems.length === 0 ? <p className="text-xs text-muted-foreground mt-2">None in the last 24 hours 🎉</p> : (
          <div className="mt-2 space-y-2">{data.recentProblems.map((r, i) => (
            <div key={i} className="text-xs border rounded-xl p-2">
              <p><b>{when(r.at)}</b> · {r.purpose} · ••{r.last4} · <b className={r.result === 'failed' ? 'text-rose-600' : 'text-amber-600'}>{r.result}{r.reason ? ' (' + r.reason + ')' : ''}</b></p>
              {r.detail && <p className="font-mono break-all text-muted-foreground mt-1">{r.detail}</p>}
            </div>
          ))}</div>
        )}
      </Card>
    </div>
  )
}
