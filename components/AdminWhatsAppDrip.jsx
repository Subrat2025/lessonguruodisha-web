'use client'
/**
 * Admin panel for the automatic WhatsApp drip:
 *   • Auto welcome (user_registration_2) — fires right after signup.
 *   • Upgrade nudge (lesson_guru_activate_01) — fires N hours later if the
 *     user has no active subscription.
 * Also shows real-time stats + a manual "Run now" button + recent log.
 */
import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Send, MessageCircle, Users, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'

const call = async (url, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : ''
  const res = await fetch(`/api${url}`, {
    ...opts,
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
  return j
}

const StatCard = ({ label, value, sub, icon: Icon, color = 'from-blue-500 to-indigo-600' }) => (
  <div className={`rounded-2xl p-3 text-white shadow bg-gradient-to-br ${color}`}>
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" />
      <div className="text-[9.5px] font-black uppercase tracking-widest opacity-90">{label}</div>
    </div>
    <div className="text-2xl font-black leading-none mt-1.5">{value}</div>
    {sub && <div className="text-[10px] mt-0.5 opacity-90">{sub}</div>}
  </div>
)

const statusBadge = (s) => {
  const map = {
    accepted:  { label: 'Accepted',  className: 'bg-blue-100 text-blue-700' },
    sent:      { label: 'Accepted',  className: 'bg-blue-100 text-blue-700' },
    delivered: { label: 'Delivered', className: 'bg-emerald-100 text-emerald-700' },
    read:      { label: 'Read',      className: 'bg-emerald-100 text-emerald-700' },
    failed:    { label: 'Failed',    className: 'bg-red-100 text-red-700' },
    blocked:   { label: 'Blocked',   className: 'bg-amber-100 text-amber-700' },
    skipped:   { label: 'Skipped',   className: 'bg-slate-100 text-slate-600' },
  }
  return map[s] || { label: s || '—', className: 'bg-slate-100 text-slate-700' }
}

const LEGACY_TPLS = ['user_registration_2', 'lesson_guru_activate_01', 'premium_offer1', 'panchapdi_photo']

const AdminWhatsAppDrip = () => {
  const [cfg, setCfg] = useState(null)
  const [stats, setStats] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [logFilter, setLogFilter] = useState('')
  const [applying, setApplying] = useState(false)
  const [confirmRemap, setConfirmRemap] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, l] = await Promise.all([
        call('/admin/whatsapp-drip/stats'),
        call(`/admin/whatsapp-drip/logs?limit=50${logFilter ? '&template=' + encodeURIComponent(logFilter) : ''}`).catch(() => ({ items: [] })),
      ])
      setCfg(s.config)
      setStats(s)
      setLogs(l.items || [])
    } catch (e) {
      // Stats failed — still load the config so the master switch/panel renders
      // (never leave the admin stuck on a spinner or a blank card).
      try {
        const c = await call('/admin/whatsapp-drip/config')
        setCfg(c.config)
        setStats({ config: c.config, degraded: true, perTemplate: {}, sequenceStats: (c.config?.sequence || []), recentLogs: [] })
      } catch (_) {}
      toast.error(e?.message || 'Failed to load drip stats (showing settings only)')
    } finally { setLoading(false) }
  }, [logFilter])

  useEffect(() => { load() }, [load])

  const applyRemap = async () => {
    setApplying(true)
    try {
      const res = await call('/admin/whatsapp-drip/apply-remap', { method: 'POST', body: {} })
      toast.success(`Templates updated — drip stays ${res?.config?.enabled ? 'ACTIVE' : 'PAUSED'}`)
      setConfirmRemap(false)
      await load()
    } catch (e) { toast.error(e?.message || 'Failed to apply remap') }
    finally { setApplying(false) }
  }

  const needsRemap = cfg && (
    cfg.welcomeTemplate !== 'welcome_lessonguru' ||
    cfg.nudgeTemplate !== 'upgrade_premium' ||
    (cfg.sequence || []).length !== 1 ||
    (cfg.sequence || []).some(s => s.template !== 'upgrade_premium')
  )

  const save = async (patch) => {
    setSaving(true)
    try {
      const next = await call('/admin/whatsapp-drip/config', { method: 'PUT', body: { settings: patch } })
      setCfg(next.config)
      toast.success('Saved')
    } catch (e) {
      toast.error(e?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const r = await call('/admin/whatsapp-drip/run', { method: 'POST', body: {} })
      toast.success(`Drip: ${r.sent || 0} sent · ${r.failed || 0} failed · ${r.skipped || 0} skipped (${r.scanned || 0} scanned)`, { duration: 6000 })
      await load()
    } catch (e) {
      toast.error(e?.message || 'Run failed')
    } finally { setRunning(false) }
  }

  if (loading && !cfg) {
    return (
      <Card className="p-6 rounded-2xl text-center text-muted-foreground">
        <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" />
        Loading WhatsApp drip settings…
      </Card>
    )
  }
  if (!cfg) return null

  return (
    <div className="space-y-3">
      {/* Header */}
      <Card className="p-4 rounded-2xl border-2 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white shadow shrink-0">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-slate-900 dark:text-slate-100">📱 WhatsApp Drip &amp; Welcome</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Auto welcome on signup + upgrade nudge {cfg.delayHours}h later for users without a subscription. One send per user per template — never spammy.</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${cfg.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {cfg.enabled ? 'Active' : 'Paused'}
            </span>
            <Switch checked={!!cfg.enabled} onCheckedChange={(v) => save({ enabled: v })} disabled={saving} />
          </div>
        </div>
      </Card>

      {/* One-click recommended template remap (before/after) */}
      {needsRemap && (
        <Card className="p-4 rounded-2xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/15">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-black text-amber-800 dark:text-amber-300 text-[13px]">Recommended template remap</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                This moves the drip onto the approved templates and the single Day-3 step. The drip stays <b>{cfg.enabled ? 'ACTIVE' : 'PAUSED'}</b> — nothing is enabled or sent by this action.
              </div>
              <div className="mt-3 rounded-xl bg-white dark:bg-slate-900 border-2 border-amber-200 dark:border-amber-800 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-amber-100/60 dark:bg-amber-900/30">
                      <th className="py-1.5 px-2 text-left font-black uppercase tracking-widest text-[9px] text-amber-700">Field</th>
                      <th className="py-1.5 px-2 text-left font-black uppercase tracking-widest text-[9px] text-red-600">Before</th>
                      <th className="py-1.5 px-2 text-left font-black uppercase tracking-widest text-[9px] text-emerald-700">After</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr className="border-t border-amber-100 dark:border-amber-900/40">
                      <td className="py-1.5 px-2 font-sans font-bold">Welcome</td>
                      <td className="py-1.5 px-2 text-red-600 line-through">{cfg.welcomeTemplate}</td>
                      <td className="py-1.5 px-2 text-emerald-700">welcome_lessonguru</td>
                    </tr>
                    <tr className="border-t border-amber-100 dark:border-amber-900/40">
                      <td className="py-1.5 px-2 font-sans font-bold">Nudge (Day 3)</td>
                      <td className="py-1.5 px-2 text-red-600 line-through">{cfg.nudgeTemplate}</td>
                      <td className="py-1.5 px-2 text-emerald-700">upgrade_premium</td>
                    </tr>
                    <tr className="border-t border-amber-100 dark:border-amber-900/40">
                      <td className="py-1.5 px-2 font-sans font-bold">Sequence</td>
                      <td className="py-1.5 px-2 text-red-600">{(cfg.sequence || []).map(s => s.label || s.template).join(', ') || '—'}</td>
                      <td className="py-1.5 px-2 text-emerald-700">Day 3 · Upgrade (only)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {(cfg.sequence || []).some(s => ['premium_offer1', 'panchapdi_photo'].includes(s.template)) && (
                <div className="text-[10.5px] text-red-600 mt-2 font-semibold">Removes: Day 7 (premium_offer1) and Day 14 (panchapdi_photo).</div>
              )}
              {!confirmRemap ? (
                <Button onClick={() => setConfirmRemap(true)} size="sm" className="mt-3 h-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[11px] font-black">
                  Apply recommended remap
                </Button>
              ) : (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black text-amber-800 dark:text-amber-300">Apply this change now?</span>
                  <Button onClick={applyRemap} disabled={applying} size="sm" className="h-8 rounded-full bg-emerald-600 text-white text-[11px] font-black">
                    {applying ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}{applying ? 'Applying…' : 'Yes, apply'}
                  </Button>
                  <Button onClick={() => setConfirmRemap(false)} disabled={applying} size="sm" variant="outline" className="h-8 rounded-full text-[11px] font-black">Cancel</Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
      {/* Stats — OLD system (before 9 Oct) vs NEW system, clearly labeled */}
      {stats && (
        <div className="space-y-2">
          <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Old system · before 9 Oct (legacy templates — now blocked)</div>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Accepted (old)" value={stats.oldSystem?.sent ?? ((stats.welcomeSent || 0) + (stats.nudgeSent || 0))} sub="submitted to provider" icon={Send} color="from-slate-400 to-slate-500" />
              <StatCard label="Failed (old)" value={stats.oldSystem?.failed ?? ((stats.welcomeFailed || 0) + (stats.nudgeFailed || 0))} sub="rejected by Meta" icon={XCircle} color="from-slate-400 to-slate-600" />
              <StatCard label="Blocked (old)" value={stats.oldSystem?.blocked || 0} sub="stopped by our gate" icon={AlertTriangle} color="from-slate-400 to-slate-500" />
            </div>
          </div>
          <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 p-3 bg-emerald-50/40 dark:bg-emerald-900/10">
            <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">New system (welcome_lessonguru + upgrade_premium)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard label="Accepted (new)" value={stats.newSystem?.sent || 0} sub="provider accepted" icon={CheckCircle2} color="from-emerald-500 to-green-600" />
              <StatCard label="Converted" value={stats.newSystem?.converted || 0} sub="subscribed after send" icon={CheckCircle2} color="from-blue-500 to-indigo-600" />
              <StatCard label="Pending nudge" value={stats.pendingNudge} sub={`eligible after drip ON · >${cfg.sequence?.[0]?.delayHours || cfg.delayHours}h old, no plan`} icon={Users} color="from-amber-500 to-orange-600" />
              <StatCard label="Failed / Blocked" value={`${stats.newSystem?.failed || 0} / ${stats.newSystem?.blocked || 0}`} sub="new templates" icon={XCircle} color="from-red-500 to-rose-600" />
            </div>
          </div>
        </div>
      )}

      {/* Sequence — Day-3 / Day-7 / Day-14 steps with conversion counter */}
      {stats?.sequenceStats?.length > 0 && (
        <Card className="p-4 rounded-2xl border-2">
          <div className="font-black text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-500" /> Multi-step drip sequence
          </div>
          <div className="space-y-2">
            {stats.sequenceStats.map((step, idx) => (
              <div key={idx} className="rounded-xl border-2 border-slate-100 dark:border-slate-800 p-3 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 shadow ${
                  idx === 0 ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                  : idx === 1 ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                  : 'bg-gradient-to-br from-purple-500 to-fuchsia-600'
                }`}>
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-[12px] text-slate-900 dark:text-slate-100 truncate">{step.label || step.template}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">{step.template} · Day {(step.delayHours / 24).toFixed(1)}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center shrink-0">
                  <div className="min-w-[42px]">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Sent</div>
                    <div className="text-sm font-black text-slate-900 dark:text-slate-100 leading-none">{step.sent || 0}</div>
                  </div>
                  <div className="min-w-[42px]">
                    <div className="text-[8px] font-black uppercase tracking-widest text-emerald-600">Converted</div>
                    <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 leading-none">{step.converted || 0}</div>
                  </div>
                  <div className="min-w-[42px]">
                    <div className="text-[8px] font-black uppercase tracking-widest text-blue-600">Rate</div>
                    <div className="text-sm font-black text-blue-700 dark:text-blue-400 leading-none">{step.conversionRate || 0}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Config */}
      <Card className="p-4 rounded-2xl border-2">
        <div className="font-black text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-500" /> Configuration
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] font-black uppercase tracking-widest">Welcome template (MARKETING)</Label>
            <Input value={cfg.welcomeTemplate} onChange={(e) => setCfg({ ...cfg, welcomeTemplate: e.target.value })} onBlur={(e) => save({ welcomeTemplate: e.target.value })} className="mt-1 h-9 rounded-xl font-mono text-xs" />
            <div className="text-[10px] text-muted-foreground mt-1">Variable {'{{1}}'} = first name. Sent right after signup. (Meta reclassified this as MARKETING.)</div>
          </div>
          <div>
            <Label className="text-[11px] font-black uppercase tracking-widest">Nudge template (MARKETING)</Label>
            <Input value={cfg.nudgeTemplate} onChange={(e) => setCfg({ ...cfg, nudgeTemplate: e.target.value })} onBlur={(e) => save({ nudgeTemplate: e.target.value })} className="mt-1 h-9 rounded-xl font-mono text-xs" />
            <div className="text-[10px] text-muted-foreground mt-1">Variables {'{{1}}'} = name, {'{{2}}'} = plans URL.</div>
          </div>
          <div>
            <Label className="text-[11px] font-black uppercase tracking-widest">Delay (hours after signup)</Label>
            <Input type="number" min={1} max={720} value={cfg.delayHours} onChange={(e) => setCfg({ ...cfg, delayHours: Number(e.target.value) || 72 })} onBlur={(e) => save({ delayHours: Number(e.target.value) || 72 })} className="mt-1 h-9 rounded-xl" />
            <div className="text-[10px] text-muted-foreground mt-1">Example: 72 = 3 days. Users without a subscription after this get the nudge.</div>
          </div>
          <div>
            <Label className="text-[11px] font-black uppercase tracking-widest">Batch size / run</Label>
            <Input type="number" min={1} max={500} value={cfg.batchSize} onChange={(e) => setCfg({ ...cfg, batchSize: Number(e.target.value) || 50 })} onBlur={(e) => save({ batchSize: Number(e.target.value) || 50 })} className="mt-1 h-9 rounded-xl" />
            <div className="text-[10px] text-muted-foreground mt-1">Max number of nudges sent per hourly tick.</div>
          </div>
          <div className="md:col-span-2">
            <Label className="text-[11px] font-black uppercase tracking-widest">Plans URL (used in nudge variable {'{{2}}'})</Label>
            <Input value={cfg.planUrl} onChange={(e) => setCfg({ ...cfg, planUrl: e.target.value })} onBlur={(e) => save({ planUrl: e.target.value })} className="mt-1 h-9 rounded-xl font-mono text-xs" />
          </div>
        </div>
        {cfg.lastRunAt && (
          <div className="mt-3 text-[10.5px] text-muted-foreground border-t border-slate-200 dark:border-slate-800 pt-2">
            Last automatic run: <b>{new Date(cfg.lastRunAt).toLocaleString('en-IN')}</b> · Sent <b>{cfg.lastRunSent || 0}</b>{cfg.lastRunError ? ` · Last error: ${cfg.lastRunError}` : ''}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button onClick={runNow} disabled={running || !cfg.enabled} size="sm" className="h-8 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[11px] font-black">
            {running ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            {running ? 'Sending…' : 'Send nudge now'}
          </Button>
          <Button onClick={load} disabled={loading} size="sm" variant="outline" className="h-8 rounded-full text-[11px] font-black">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </Card>

      {/* Logs */}
      <Card className="p-4 rounded-2xl border-2">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="font-black text-slate-900 dark:text-slate-100">Recent sends</div>
          <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)} className="h-8 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-background text-[11px] px-2 font-semibold">
            <option value="">All templates</option>
            <option value={cfg.welcomeTemplate}>Welcome only</option>
            <option value={cfg.nudgeTemplate}>Nudge only</option>
          </select>
        </div>
        {logs.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-[11px]">No sends yet.</div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1 text-left font-black uppercase tracking-widest text-[9px] text-muted-foreground">Time</th>
                  <th className="py-1 text-left font-black uppercase tracking-widest text-[9px] text-muted-foreground">Mobile</th>
                  <th className="py-1 text-left font-black uppercase tracking-widest text-[9px] text-muted-foreground">Template</th>
                  <th className="py-1 text-left font-black uppercase tracking-widest text-[9px] text-muted-foreground">Status</th>
                  <th className="py-1 text-left font-black uppercase tracking-widest text-[9px] text-muted-foreground">Reason</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((r, i) => {
                  const sb = statusBadge(r.status)
                  return (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{new Date(r.sentAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="py-1.5 pr-2 font-mono">{r.mobile}</td>
                      <td className="py-1.5 pr-2 font-mono text-[10px]">{r.template}</td>
                      <td className="py-1.5"><Badge className={`text-[9px] font-black uppercase tracking-widest ${sb.className} border-0`}>{sb.label}</Badge></td>
                      <td className="py-1.5 pr-2 text-[10px] text-muted-foreground max-w-[220px] truncate" title={r.reason || ''}>{r.reason || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

export default AdminWhatsAppDrip
