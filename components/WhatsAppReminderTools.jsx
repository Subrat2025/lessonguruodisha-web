'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, FlaskConical, Send, ShieldOff, Settings2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const call = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

const STAGES = ['7 days', '3 days', '1 day']

export default function WhatsAppReminderTools() {
  const [tpls, setTpls] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState('upgrade_premium')
  const [audience, setAudience] = useState('free')
  const [var2, setVar2] = useState('')
  const [stage, setStage] = useState('7 days')
  const [dry, setDry] = useState(null)
  const [busy, setBusy] = useState('')
  const [optouts, setOptouts] = useState(null)
  const [pauseText, setPauseText] = useState('')
  const [pauseDays, setPauseDays] = useState(7)

  const load = async () => {
    setLoading(true)
    try {
      const [t, s] = await Promise.all([call('/admin/wa/known-templates'), call('/admin/wa/settings')])
      setTpls(t.templates || [])
      setSettings(s.settings)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const cur = tpls.find(t => t.name === sel)
  const isUtility = cur?.category === 'utility'

  const runDry = async () => {
    setBusy('dry')
    try {
      const body = { template: sel, audience, var2: var2 || undefined, stage: isUtility ? stage : undefined }
      setDry(await call('/admin/wa/dry-run', { method: 'POST', body }))
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }
  const testSend = async () => {
    if (!cur?.approved) { toast.error('Template not approved yet'); return }
    setBusy('test')
    try {
      const r = await call('/admin/wa/test-send', { method: 'POST', body: { template: sel, var2: var2 || undefined, stage } })
      r.ok ? toast.success('✅ Test sent to your number (message_status: ' + (r.messageStatus || 'ok') + ')')
           : toast.error('Send failed: ' + (r.messageStatus || r.status))
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }
  const saveSettings = async () => {
    setBusy('settings')
    try {
      const s = await call('/admin/wa/settings', { method: 'PUT', body: settings })
      setSettings(s.settings); toast.success('Cost settings saved')
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }
  const loadOptouts = async () => {
    try { const r = await call('/admin/wa/optouts'); setOptouts(r) } catch (e) { toast.error(e.message) }
  }
  const runMarketingPause = async (action) => {
    const nums = pauseText.trim()
    if (!nums) { toast.error('Paste the numbers first'); return }
    setBusy('pause')
    try {
      const r = await call('/admin/wa/marketing-pause', { method: 'POST', body: { mobiles: nums, days: Number(pauseDays) || 7, action } })
      toast.success(action === 'unpause'
        ? `Un-paused ${r.matched}/${r.numbers} numbers`
        : `Paused ${r.matched}/${r.numbers} numbers for ${r.days}d${r.notFound ? ` · ${r.notFound} not found` : ''}`)
    } catch (e) { toast.error(e.message) } finally { setBusy('') }
  }
  const toggleOptout = async (userId, action) => {
    try { await call('/admin/wa/optout', { method: 'POST', body: { userId, action } }); loadOptouts() }
    catch (e) { toast.error(e.message) }
  }

  if (loading || !settings) return <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Loading…</div>

  return (
    <div className="space-y-4">
      {/* Template status */}
      <Card className="p-3.5 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <p className="font-black text-sm">📋 Reminder templates (live status)</p>
          <Button size="sm" variant="ghost" onClick={load} className="h-7"><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          {tpls.map(t => (
            <div key={t.name} className="flex items-center justify-between text-[11px] border rounded-lg px-2.5 py-1.5">
              <span className="font-mono">{t.name} <span className="text-muted-foreground">· {t.category}</span></span>
              <Badge variant={t.approved ? 'default' : 'secondary'} className={t.approved ? 'bg-emerald-600' : 'bg-amber-500'}>{t.status}</Badge>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Only <b>Approved</b> templates can be sent. Pending ones are skipped automatically.</p>
      </Card>

      {/* Dry run + test */}
      <Card className="p-3.5 rounded-2xl space-y-2.5">
        <p className="font-black text-sm flex items-center gap-1.5"><FlaskConical className="w-4 h-4" /> Dry run &amp; test</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">Template</Label>
            <select value={sel} onChange={e => { setSel(e.target.value); setDry(null) }} className="w-full text-[11px] border rounded-lg px-2 py-1.5 bg-background">
              {tpls.map(t => <option key={t.name} value={t.name}>{t.name}{t.approved ? '' : ' (pending)'}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px]">Audience</Label>
            <select value={audience} onChange={e => { setAudience(e.target.value); setDry(null) }} className="w-full text-[11px] border rounded-lg px-2 py-1.5 bg-background">
              {['all', 'free', 'subscribers', 'expired', 'district', 'class'].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        {isUtility ? (
          <div>
            <Label className="text-[10px]">Stage ({'{{2}}'})</Label>
            <select value={stage} onChange={e => setStage(e.target.value)} className="w-full text-[11px] border rounded-lg px-2 py-1.5 bg-background">
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ) : (cur?.vars?.includes('price') || cur?.vars?.includes('offer')) ? (
          <div>
            <Label className="text-[10px]">{cur.vars.includes('price') ? 'Price ({{2}}) — blank = lowest plan' : 'Offer ({{2}}) e.g. 20%'}</Label>
            <Input value={var2} onChange={e => setVar2(e.target.value)} placeholder={cur.vars.includes('price') ? '(auto from plans)' : '20%'} className="h-8 text-[11px]" />
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" onClick={runDry} disabled={busy === 'dry'} className="flex-1 h-8 text-[11px]">
            {busy === 'dry' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Dry run'}
          </Button>
          <Button size="sm" variant="outline" onClick={testSend} disabled={busy === 'test' || !cur?.approved} className="flex-1 h-8 text-[11px]">
            {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5 mr-1" />Test to my number</>}
          </Button>
        </div>
        {dry && (
          <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] space-y-1.5">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><b>Recipients:</b> {dry.count}</span>
              <span><b>Category:</b> {dry.category}</span>
              <span><b>Cost/msg:</b> {dry.currency}{dry.costPerMsg}</span>
              <span><b>Est. cost:</b> {dry.currency}{dry.estCost}</span>
              <span><b>Approved:</b> {dry.approved ? '✅' : '❌'}</span>
              <span><b>In window:</b> {dry.withinWindow ? '✅' : '⏳ queued'}</span>
            </div>
            {dry.breakdown && (
              <div className="rounded-md bg-background/70 border p-2 text-[10.5px] space-y-0.5">
                <p className="font-semibold">Audience breakdown (report only — nothing sent):</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>Matched: <b>{dry.breakdown.matched}</b></span>
                  {dry.category !== 'utility' && <span className="text-amber-700">⏸ Paused (got marketing in last {dry.breakdown.capDays}d): <b>{dry.breakdown.capPaused}</b></span>}
                  {dry.category !== 'utility' && <span>Opted-out: <b>{dry.breakdown.optOut}</b></span>}
                  <span>Invalid number: <b>{dry.breakdown.invalidMobile}</b></span>
                  <span className="text-emerald-700">→ Will send: <b>{dry.breakdown.final}</b></span>
                </div>
              </div>
            )}
            {dry.wallet && (
              <div className={`rounded-md border p-2 text-[10.5px] ${dry.wallet.canSend ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300' : 'bg-rose-50 dark:bg-rose-950/30 border-rose-300'}`}>
                <span><b>Wallet:</b> {dry.currency}{dry.wallet.balance} · reserve {dry.currency}{dry.wallet.otpReserve} · after {dry.currency}{dry.wallet.balanceAfter} · {dry.wallet.canSend ? '✅ can send' : '🚫 blocked'}</span>
                {dry.wallet.blockReason && <div className="text-rose-700 mt-0.5">{dry.wallet.blockReason}</div>}
              </div>
            )}
            {dry.note && <p className="text-amber-600 font-semibold">{dry.note}</p>}
            {dry.payloadSample && (
              <details>
                <summary className="font-semibold cursor-pointer">Exact provider payload (sample, report only)</summary>
                <pre className="mt-1 font-mono text-[9.5px] bg-background rounded px-2 py-1 overflow-auto max-h-32 whitespace-pre-wrap break-all">{JSON.stringify(dry.payloadSample, null, 2)}</pre>
              </details>
            )}
            <div className="space-y-1">
              <p className="font-semibold">Sample previews:</p>
              {(dry.samples || []).map((s, i) => (
                <div key={i} className="font-mono text-[10px] bg-background rounded px-2 py-1">{s.mobile} → {JSON.stringify(s.variables)}</div>
              ))}
              {(!dry.samples || !dry.samples.length) && <p className="text-muted-foreground">No recipients match.</p>}
            </div>
          </div>
        )}
      </Card>

      {/* Cost settings */}
      <Card className="p-3.5 rounded-2xl space-y-2">
        <p className="font-black text-sm flex items-center gap-1.5"><Settings2 className="w-4 h-4" /> Cost &amp; window</p>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-[10px]">Utility rate (₹)</Label><Input type="number" step="0.01" value={settings.costUtility} onChange={e => setSettings(s => ({ ...s, costUtility: e.target.value }))} className="h-8 text-[11px]" /></div>
          <div><Label className="text-[10px]">Marketing rate (₹)</Label><Input type="number" step="0.01" value={settings.costMarketing} onChange={e => setSettings(s => ({ ...s, costMarketing: e.target.value }))} className="h-8 text-[11px]" /></div>
          <div><Label className="text-[10px]">Window start (IST h)</Label><Input type="number" value={settings.windowStartHour} onChange={e => setSettings(s => ({ ...s, windowStartHour: e.target.value }))} className="h-8 text-[11px]" /></div>
          <div><Label className="text-[10px]">Window end (IST h)</Label><Input type="number" value={settings.windowEndHour} onChange={e => setSettings(s => ({ ...s, windowEndHour: e.target.value }))} className="h-8 text-[11px]" /></div>
        </div>
        <Button size="sm" onClick={saveSettings} disabled={busy === 'settings'} className="h-8 text-[11px]">Save settings</Button>
      </Card>

      {/* Marketing pause (131049 — Meta per-user marketing limit) */}
      <Card className="p-3.5 rounded-2xl space-y-2">
        <p className="font-black text-sm flex items-center gap-1.5"><ShieldOff className="w-4 h-4" /> Marketing pause (7-day · error 131049)</p>
        <p className="text-[10.5px] text-muted-foreground">Paste the numbers BulkyMarketing reported as failed with Meta's per-user marketing limit (131049). They'll be skipped for all MARKETING for the set days. OTP & utility messages are unaffected. (Auto-pause also runs when a campaign batch is refused with 131049.)</p>
        <textarea value={pauseText} onChange={e => setPauseText(e.target.value)} rows={3} placeholder="9876543210, 9123456780 …" className="w-full text-[11px] border rounded-lg px-2 py-1.5 bg-background font-mono" />
        <div className="flex items-center gap-2">
          <Label className="text-[10px]">Days</Label>
          <Input type="number" min="1" max="90" value={pauseDays} onChange={e => setPauseDays(e.target.value)} className="h-8 w-20 text-[11px]" />
          <Button size="sm" onClick={() => runMarketingPause('pause')} disabled={busy === 'pause'} className="h-8 text-[11px]">
            {busy === 'pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Pause marketing'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => runMarketingPause('unpause')} disabled={busy === 'pause'} className="h-8 text-[11px]">Un-pause</Button>
        </div>
      </Card>

      {/* Opt-outs */}
      <Card className="p-3.5 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-black text-sm flex items-center gap-1.5"><ShieldOff className="w-4 h-4" /> Marketing opt-outs</p>
          <Button size="sm" variant="ghost" onClick={loadOptouts} className="h-7 text-[11px]">Load</Button>
        </div>
        {optouts && (
          <div className="text-[11px] space-y-1">
            <p className="text-muted-foreground">{optouts.optedOut?.length || 0} opted-out · {optouts.inboundEvents?.length || 0} inbound events</p>
            {(optouts.optedOut || []).slice(0, 30).map(u => (
              <div key={u.id} className="flex items-center justify-between border rounded-lg px-2 py-1">
                <span>{u.name || '—'} · XXXXXX{String(u.mobile).slice(-4)} <span className="text-muted-foreground">({u.waOptOutReason || '—'})</span></span>
                <Button size="sm" variant="outline" onClick={() => toggleOptout(u.id, 'opt_in')} className="h-6 text-[10px]">Opt back in</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
