'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Loader2, Play, Pause, XCircle, Copy, Trash2, Eye, Send, Plus, RefreshCw, Users, MessageSquare, Image as ImageIcon, Link as LinkIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import WhatsAppReminderTools from '@/components/WhatsAppReminderTools'
import ErrorBoundary from '@/components/ErrorBoundary'

// -----------------------------------------------------------------------------
// Small internal fetch helper — mirrors the `api()` used elsewhere in page.js
// -----------------------------------------------------------------------------
const call = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

// =============================================================================
//  📱 AdminWhatsAppCampaignsTab
// =============================================================================
export default function AdminWhatsAppCampaignsTab() {
  const [tab, setTab] = useState('list')            // 'list' | 'create'
  const [campaigns, setCampaigns] = useState([])
  const [kpis, setKpis] = useState({ todayCount: 0, monthCount: 0, deliveredMonth: 0, failedMonth: 0, successRate: 0 })
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)      // campaign object being edited/created
  const [reportId, setReportId] = useState(null)    // id of the campaign whose report is open

  const load = async () => {
    setLoading(true)
    try {
      const r = await call('/admin/wa/campaigns')
      setCampaigns(r.campaigns || [])
      setKpis(r.kpis || {})
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }
  const loadTemplates = async () => {
    try {
      const r = await call('/admin/wa/templates')
      const list = r?.data?.data || r?.data || []
      setTemplates(Array.isArray(list) ? list.filter(t => t.status === 'APPROVED' || !t.status) : [])
    } catch (e) { toast.error('Failed to fetch WhatsApp templates: ' + e.message) }
  }
  useEffect(() => { load(); loadTemplates() }, [])
  // Auto-refresh campaign list every 6s while any campaign is running
  useEffect(() => {
    const running = campaigns.some(c => c.status === 'running')
    if (!running) return
    const t = setInterval(load, 6000)
    return () => clearInterval(t)
  }, [campaigns])

  return (
    <div className="space-y-3 mt-3">
      {/* Header + KPIs */}
      <Card className="p-3 rounded-2xl border-2 bg-gradient-to-br from-emerald-50 to-lime-50 dark:from-emerald-950/30 dark:to-lime-950/30 border-emerald-200 dark:border-emerald-800">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">📱</span>
          <div className="flex-1">
            <p className="font-black text-sm">WhatsApp Campaigns</p>
            <p className="text-[10.5px] text-muted-foreground">Send bulk WhatsApp messages to filtered user segments via Bulkymarketing.</p>
          </div>
          <Button size="sm" onClick={() => { setEditing({}); setTab('create') }}
            className="h-8 text-[11px] rounded-full bg-emerald-600 hover:bg-emerald-700 font-black">
            <Plus className="w-3.5 h-3.5 mr-1" /> New
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Kpi label="Today"      value={kpis.todayCount} color="bg-white/70 dark:bg-slate-800/70" />
          <Kpi label="This Month" value={kpis.monthCount} color="bg-white/70 dark:bg-slate-800/70" />
          <Kpi label="Accepted"   value={kpis.deliveredMonth} color="bg-emerald-100 dark:bg-emerald-900/40" />
          <Kpi label="Success %"  value={`${kpis.successRate}%`} color="bg-blue-100 dark:bg-blue-900/40" />
        </div>
      </Card>

      {/* 💰 Wallet balance + OTP reserve + cost rates (item 1/2/6) */}
      <WalletBar />

      {/* Tab switch */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
        <button onClick={() => { setTab('list'); setEditing(null) }}
          className={`flex-1 text-[11px] font-black rounded-lg px-3 py-1.5 transition ${tab === 'list' ? 'bg-white dark:bg-slate-700 shadow' : 'text-slate-500'}`}>
          📋 Campaigns ({campaigns.length})
        </button>
        <button onClick={() => { setEditing({}); setTab('create') }}
          className={`flex-1 text-[11px] font-black rounded-lg px-3 py-1.5 transition ${tab === 'create' ? 'bg-white dark:bg-slate-700 shadow' : 'text-slate-500'}`}>
          ✍️ {editing?.id ? 'Edit' : 'Create'}
        </button>
        <button onClick={() => setTab('reminders')}
          className={`flex-1 text-[11px] font-black rounded-lg px-3 py-1.5 transition ${tab === 'reminders' ? 'bg-white dark:bg-slate-700 shadow' : 'text-slate-500'}`}>
          🔔 Reminders &amp; Tools
        </button>
      </div>

      {tab === 'reminders' && <WhatsAppReminderTools />}

      {tab === 'list' && (
        <CampaignList campaigns={campaigns} loading={loading} onRefresh={load}
          onEdit={(c) => { setEditing(c); setTab('create') }}
          onReport={(id) => setReportId(id)}
        />
      )}
      {tab === 'create' && (
        <CampaignEditor
          initial={editing || {}}
          templates={templates}
          onSaved={() => { setEditing(null); setTab('list'); load() }}
          onCancel={() => { setEditing(null); setTab('list') }}
        />
      )}
      {reportId && (
        <ErrorBoundary
          key={reportId}
          onClose={() => setReportId(null)}
          fallback={(err, reset) => (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3" onClick={() => setReportId(null)}>
              <div className="bg-background rounded-2xl w-full max-w-md p-5 text-center" onClick={e => e.stopPropagation()}>
                <div className="text-3xl">⚠️</div>
                <p className="font-extrabold text-sm mt-2">Could not display this report</p>
                <p className="text-[11px] text-rose-600 mt-1 break-words">{String(err?.message || err || 'Unexpected error').slice(0, 240)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">This is usually an old-format campaign. You can still use "Mark FAILED" from the list.</p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={reset}>Retry</Button>
                  <Button size="sm" className="rounded-full" onClick={() => setReportId(null)}>Close</Button>
                </div>
              </div>
            </div>
          )}
        >
          <CampaignReport id={reportId} onClose={() => setReportId(null)} />
        </ErrorBoundary>
      )}
    </div>
  )
}

const Kpi = ({ label, value, color }) => (
  <div className={`rounded-xl p-2 text-center ${color}`}>
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    <p className="text-base font-black leading-tight">{value}</p>
  </div>
)

// -----------------------------------------------------------------------------
// 💰 WalletBar — shows BulkyMarketing wallet balance + OTP reserve, a low-balance
// banner, a stale (>7d) reminder, an "Update balance" input (after a top-up),
// and an editable cost-rate panel. Protects OTP: campaigns can never use reserve.
// -----------------------------------------------------------------------------
const WalletBar = () => {
  const [w, setW] = useState(null)
  const [s, setS] = useState(null)
  const [editBal, setEditBal] = useState('')
  const [showRates, setShowRates] = useState(false)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    try { const r = await call('/admin/wa/settings'); setW(r.wallet); setS(r.settings); setEditBal(String(r.wallet?.balance ?? '')) } catch (_) {}
  }
  useEffect(() => { load() }, [])
  if (!w || !s) return null
  const cur = w.currency || '₹'
  const saveBal = async () => {
    const n = Number(String(editBal).replace(/[₹,\s]/g, ''))
    if (!Number.isFinite(n) || n < 0) { toast.error('Enter a valid amount, e.g. 2782.46'); return }
    setBusy(true)
    try { const r = await call('/admin/wa/wallet', { method: 'PUT', body: { balance: n } }); setW(r.wallet); setEditBal(String(r.wallet?.balance ?? n)); toast.success('Wallet balance updated') }
    catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const saveRate = async (key, val) => {
    try { const r = await call('/admin/wa/settings', { method: 'PUT', body: { [key]: Number(val) } }); setS(r.settings); toast.success('Saved') }
    catch (e) { toast.error(e.message) }
  }
  const staleDays = w.balanceUpdatedAt ? Math.floor((Date.now() - new Date(w.balanceUpdatedAt).getTime()) / 86400000) : null
  return (
    <Card className={`p-3 rounded-2xl border-2 ${w.low ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : 'border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20'}`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">💰</span>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">BulkyMarketing wallet</p>
          <p className="text-lg font-black leading-tight">{cur}{Number(w.balance).toFixed(2)}
            {w.low && <span className="ml-2 text-[10px] font-black text-red-600 align-middle">LOW</span>}
          </p>
          <p className="text-[10px] text-muted-foreground">Spendable {cur}{Number(w.spendable).toFixed(2)} · OTP reserve {cur}{w.otpReserve} protected</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1">
            <Input value={editBal} onChange={e => setEditBal(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="h-8 w-24 text-[12px] text-right" placeholder="balance" />
            <Button size="sm" disabled={busy} onClick={saveBal} className="h-8 text-[11px] rounded-full bg-indigo-600 hover:bg-indigo-700 font-black">Update</Button>
          </div>
          <button onClick={() => setShowRates(v => !v)} className="text-[10px] text-indigo-600 font-bold mt-1 underline">{showRates ? 'Hide rates' : 'Edit cost rates'}</button>
        </div>
      </div>
      {w.low && (
        <div className="mt-2 text-[11px] font-bold text-red-700 bg-red-100 dark:bg-red-900/40 rounded-lg px-2 py-1.5">
          ⚠️ Balance is below {cur}{w.lowBalanceThreshold}. Top up the BulkyMarketing wallet and update the balance here so campaigns keep sending and OTP/login stays protected.
        </div>
      )}
      {w.stale && (
        <div className="mt-2 text-[11px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/40 rounded-lg px-2 py-1.5">
          🕒 Balance last updated {staleDays == null ? 'never' : `${staleDays} day${staleDays === 1 ? '' : 's'} ago`}. If you topped up recently, update it above to keep the estimate accurate.
        </div>
      )}
      {showRates && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ['Marketing /msg', 'costMarketing'],
            ['Utility /msg', 'costUtility'],
            ['Authentication /msg', 'costAuthentication'],
            ['OTP reserve', 'otpReserve'],
            ['Low-balance alert', 'lowBalanceThreshold'],
            ['Test batch default', 'testBatchDefault'],
          ].map(([label, key]) => (
            <div key={key}>
              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</Label>
              <Input defaultValue={s[key]} onBlur={e => { if (String(e.target.value) !== String(s[key])) saveRate(key, e.target.value) }} className="h-8 text-[12px]" />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}


// -----------------------------------------------------------------------------
// Campaign list — each row shows status, counts, and quick action buttons.
// -----------------------------------------------------------------------------
const CampaignList = ({ campaigns, loading, onRefresh, onEdit, onReport }) => {
  const [busy, setBusy] = useState(null)
  const act = async (id, verb) => {
    setBusy(id + verb)
    try {
      if (verb === 'send') {
        const c = (campaigns || []).find(x => x.id === id) || {}
        // Required dry-run before quick-send: fetch count + cost, confirm, then send.
        const dry = await call('/admin/wa/dry-run', { method: 'POST', body: { template: c.templateId, templateId: c.templateId, filter: c.filter || {}, variables: c.variables || {} } })
        if (!dry.approved) { toast.error('Template is NOT approved — cannot send.'); setBusy(null); return }
        if (dry.count === 0) { toast.error('No recipients matched.'); setBusy(null); return }
        if (dry.wallet && !dry.wallet.canSend) { toast.error('🚫 ' + (dry.wallet.blockReason || 'Insufficient wallet balance.')); setBusy(null); return }
        const wline = dry.wallet ? `\nWallet ${dry.currency || '₹'}${Number(dry.wallet.balance).toFixed(2)} → ${dry.currency || '₹'}${Number(dry.wallet.balanceAfter).toFixed(2)} after (OTP reserve ${dry.currency || '₹'}${dry.wallet.otpReserve} protected)` : ''
        if (!confirm(`Dry-run: send "${c.name || id}" to ${dry.count} recipient${dry.count === 1 ? '' : 's'} · est ${dry.currency || '₹'}${dry.estCost}${wline}${dry.withinWindow ? '' : '\n\n⚠️ Outside 9am–8pm IST — it will be deferred.'}\n\nProceed?`)) { setBusy(null); return }
        const r = await call(`/admin/wa/campaigns/${id}/send`, { method: 'POST', body: { dryRunConfirmed: true } })
        toast.success(`✅ Campaign started — ${r.total} recipient${r.total === 1 ? '' : 's'}`)
      } else if (verb === 'continue') {
        const r = await call(`/admin/wa/campaigns/${id}/continue`, { method: 'POST', body: {} })
        toast.success(`✅ Continuing — ${r.total} more recipient${r.total === 1 ? '' : 's'}`)
      } else if (verb === 'markfailed') {
        const c = (campaigns || []).find(x => x.id === id) || {}
        const reason = window.prompt('Reason for FAILED status:', 'Insufficient wallet balance')
        if (reason === null) { setBusy(null); return }
        const cntStr = window.prompt('How many were FAILED?', String(c.counts?.total || 0))
        if (cntStr === null) { setBusy(null); return }
        const failedCount = Math.max(0, Math.floor(Number(String(cntStr).replace(/[^0-9]/g, '')) || 0))
        await call(`/admin/wa/campaigns/${id}/mark-failed`, { method: 'POST', body: { reason, failedCount, code: 'INSUFFICIENT_BALANCE' } })
        toast.success(`Marked FAILED (${failedCount})`)
      } else if (verb === 'delete') {
        if (!confirm('Delete this campaign?')) { setBusy(null); return }
        await call(`/admin/wa/campaigns/${id}`, { method: 'DELETE' })
        toast.success('Campaign removed')
      } else if (verb === 'duplicate') {
        await call(`/admin/wa/campaigns/duplicate/${id}`, { method: 'POST' })
        toast.success('Campaign duplicated')
      } else {
        await call(`/admin/wa/campaigns/${id}/${verb}`, { method: 'POST' })
        toast.success(`Campaign ${verb}d`)
      }
      onRefresh()
    } catch (e) { toast.error(e.message) }
    finally { setBusy(null) }
  }
  const statusChip = (s) => ({
    draft:     'bg-slate-500',
    scheduled: 'bg-blue-500',
    running:   'bg-emerald-600 animate-pulse',
    paused:    'bg-amber-500',
    completed: 'bg-blue-600',
    cancelled: 'bg-red-500',
    failed:    'bg-red-600',
  }[s] || 'bg-slate-500')

  if (loading && campaigns.length === 0) {
    return <div className="p-6 text-center text-slate-500 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading campaigns…</div>
  }
  if (campaigns.length === 0) {
    return <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed p-6 text-center text-[11px] text-slate-500">No campaigns yet. Tap <b>New</b> to create your first one.</div>
  }
  return (
    <div className="space-y-2">
      {campaigns.map(c => {
        const total = c.counts?.total || 0
        const accepted = c.counts?.accepted ?? c.counts?.delivered ?? c.counts?.sent ?? 0
        const failed = c.counts?.failed || 0
        const processed = accepted + failed
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0
        return (
          <Card key={c.id} className="p-3 rounded-2xl border-2">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-black text-sm truncate">{c.name}</span>
                  <Badge className={`text-[9px] px-1.5 py-0 text-white ${statusChip(c.status)}`}>{c.status?.toUpperCase()}</Badge>
                  {c.templateName && <Badge variant="outline" className="text-[9px]">📋 {c.templateName}</Badge>}
                  {c.isTestBatch && <Badge variant="outline" className="text-[9px] border-amber-400 text-amber-700">🧪 Test batch</Badge>}
                </div>
                <div className="text-[10.5px] text-muted-foreground truncate">
                  {c.filter?.audience === 'all' ? 'All users' :
                   c.filter?.audience === 'no_sub' ? 'No subscription' :
                   c.filter?.audience === 'active' ? 'Active premium' :
                   c.filter?.audience === 'expired' ? 'Expired premium' :
                   c.filter?.audience === 'plan' ? `Plan: ${c.filter?.planId}` :
                   c.filter?.audience === 'referrals' ? 'Referral users' :
                   c.filter?.audience === 'csv' ? `${c.filter?.mobiles?.length || 0} numbers (CSV)` :
                   'Custom'}
                  {total > 0 && <> · 👥 {total}</>}
                  {c.scheduledFor && c.status === 'scheduled' && (
                    <> · 📅 <b>{new Date(c.scheduledFor).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</b></>
                  )}
                </div>
                {c.status === 'failed' && (c.failReason || failed > 0) && (
                  <div className="mt-1 text-[10px] font-bold text-red-700 bg-red-50 dark:bg-red-950/30 rounded px-1.5 py-1">
                    ❌ FAILED — {c.failReason || 'provider refused the sends'}{c.failCode ? ` (${c.failCode})` : ''}
                  </div>
                )}
                {total > 0 && (
                  <>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className={`h-full ${c.status === 'failed' || (failed > 0 && processed === total && accepted === 0) ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[9.5px] text-slate-500 mt-0.5">
                      <span title="Accepted by provider (not yet confirmed delivered)">📨 Accepted {accepted}</span>
                      <span>❌ Failed {failed}</span>
                      <span>⏳ {c.counts?.pending || 0}</span>
                      <span className="font-bold">{pct}%</span>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 flex gap-1 flex-wrap">
              {c.status === 'draft' && (
                <Button size="sm" onClick={() => act(c.id, 'send')} disabled={busy === c.id + 'send'}
                  className="h-7 text-[10px] rounded-full bg-emerald-600 hover:bg-emerald-700 font-black">
                  {busy === c.id + 'send' ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" />Send Now</>}
                </Button>
              )}
              {c.isTestBatch && ['completed', 'failed'].includes(c.status) && (
                <Button size="sm" onClick={() => act(c.id, 'continue')} disabled={busy === c.id + 'continue'}
                  className="h-7 text-[10px] rounded-full bg-indigo-600 hover:bg-indigo-700 font-black text-white">
                  {busy === c.id + 'continue' ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3 mr-1" />Continue remaining</>}
                </Button>
              )}
              {c.status !== 'failed' && c.status !== 'draft' && c.status !== 'scheduled' && (
                <Button size="sm" variant="outline" onClick={() => act(c.id, 'markfailed')} disabled={busy === c.id + 'markfailed'}
                  className="h-7 text-[10px] rounded-full border-red-300 text-red-700 font-black">
                  {busy === c.id + 'markfailed' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark FAILED'}
                </Button>
              )}
              {c.status === 'running' && (
                <Button size="sm" variant="outline" onClick={() => act(c.id, 'pause')} className="h-7 text-[10px] rounded-full">
                  <Pause className="w-3 h-3 mr-1" />Pause
                </Button>
              )}
              {c.status === 'paused' && (
                <Button size="sm" onClick={() => act(c.id, 'resume')} className="h-7 text-[10px] rounded-full bg-emerald-600 hover:bg-emerald-700">
                  <Play className="w-3 h-3 mr-1" />Resume
                </Button>
              )}
              {['running', 'paused'].includes(c.status) && (
                <Button size="sm" variant="outline" onClick={() => act(c.id, 'cancel')} className="h-7 text-[10px] rounded-full text-red-600 border-red-300">
                  <XCircle className="w-3 h-3 mr-1" />Cancel
                </Button>
              )}
              {c.status !== 'running' && (
                <Button size="sm" variant="outline" onClick={() => onEdit(c)} className="h-7 text-[10px] rounded-full">Edit</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => act(c.id, 'duplicate')} className="h-7 text-[10px] rounded-full">
                <Copy className="w-3 h-3 mr-1" />Copy
              </Button>
              {total > 0 && (
                <Button size="sm" variant="outline" onClick={() => onReport(c.id)} className="h-7 text-[10px] rounded-full">
                  <Eye className="w-3 h-3 mr-1" />Report
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => act(c.id, 'delete')} className="h-7 text-[10px] rounded-full text-red-600 border-red-300">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Create / edit form — recipient filter + template + variables + preview
// -----------------------------------------------------------------------------
const AUDIENCE_OPTIONS = [
  { id: 'all',       label: '👥 All registered users' },
  { id: 'no_sub',    label: '🚫 No subscription' },
  { id: 'active',    label: '⭐ Active premium users' },
  { id: 'expired',   label: '⏰ Expired premium users' },
  { id: 'plan',      label: '💎 Specific plan' },
  { id: 'referrals', label: '🎁 Referral users' },
  { id: 'csv',       label: '📄 Upload / paste mobile numbers' },
]

// -----------------------------------------------------------------------------
// 🎁 Ready-made campaign presets — one tap fills the create form.
//    Templates that aren't yet approved in Bulkymarketing show up as drafts
//    that admin can hook up to a real templateId later.
// -----------------------------------------------------------------------------
export const PRESETS = [
  {
    key: 'welcome', emoji: '🎉', label: 'Welcome',
    tagline: 'Greet fresh signups',
    apply: () => ({
      name: '🎉 Welcome to LessonGuru Odisha',
      templateId: 'welcome_lessonguru',
      language: 'en_US',
      message: 'Namaskar {{1}}! Welcome to LessonGuru Odisha — your one-stop lesson plan companion.',
      variables: { 1: 'Teacher' },
      ctaLink: 'https://lessonguruodisha.com',
      filter: { audience: 'no_sub' },
    }),
  },
  {
    key: 'upgrade', emoji: '⭐', label: 'Upgrade Premium',
    tagline: 'Nudge free users to buy',
    apply: () => ({
      name: '⭐ Upgrade to Premium',
      templateId: 'upgrade_premium',
      language: 'en_US',
      variables: { 1: 'Teacher', 2: '₹199' },
      ctaLink: 'https://lessonguruodisha.com/plans',
      filter: { audience: 'no_sub' },
    }),
  },
  {
    key: 'expiring', emoji: '⏰', label: 'Expiring Soon',
    tagline: 'Warn users before their plan ends',
    apply: () => ({
      name: '⏰ Your Premium Plan Expires Soon',
      templateId: 'plan_expiring_soon',
      language: 'en_US',
      variables: { 1: 'Teacher', 2: '3 days' },
      ctaLink: 'https://lessonguruodisha.com/plans',
      filter: { audience: 'active' },
    }),
  },
  {
    key: 'offer', emoji: '🎁', label: 'Special Offer',
    tagline: 'Time-boxed discount push',
    apply: () => ({
      name: '🎁 Special Offer — Ends Today',
      templateId: 'special_offer_today',
      language: 'en_US',
      variables: { 1: 'Teacher', 2: '30%' },
      ctaLink: 'https://lessonguruodisha.com/plans',
      filter: { audience: 'no_sub' },
    }),
  },
  {
    key: 'invite', emoji: '👥', label: 'Invite & Earn',
    tagline: 'Referral push to premium users',
    apply: () => ({
      name: '👥 Invite Teachers & Earn Rewards',
      templateId: 'referral_invite',
      language: 'en_US',
      variables: { 1: 'Teacher' },
      ctaLink: 'https://lessonguruodisha.com/referrals',
      filter: { audience: 'active' },
    }),
  },
  {
    key: 'material', emoji: '📚', label: 'New Study Material',
    tagline: 'Announce fresh content',
    apply: () => ({
      name: '📚 New Study Material Available',
      templateId: 'new_material_alert',
      language: 'en_US',
      variables: { 1: 'Teacher' },
      ctaLink: 'https://lessonguruodisha.com',
      filter: { audience: 'all' },
    }),
  },
  {
    key: 'otp', emoji: '🔒', label: 'Password Reset OTP',
    tagline: 'Auth flow (auto-triggered by Forgot Password)',
    apply: () => ({
      name: '🔒 Password Reset OTP',
      templateId: 'otptemplate',
      language: 'en_US',
      variables: { 1: '123456' },
      filter: { audience: 'csv' },
    }),
  },
]

// Small chip grid rendered at the top of the CampaignEditor.
const PresetsPicker = ({ presets, onPick, onManage }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        🎁 Ready-made Templates <span className="text-slate-400 normal-case font-normal">(one-tap prefill)</span>
      </Label>
      {onManage && (
        <button onClick={onManage} className="text-[10px] font-black text-emerald-700 underline">✏️ Edit</button>
      )}
    </div>
    <div className="grid grid-cols-2 gap-1.5">
      {(presets || []).map(p => (
        <button key={p.id || p.key} type="button" onClick={() => onPick({
          name: p.name, templateId: p.templateId, language: p.language,
          ctaLink: p.ctaLink, filter: { audience: p.audience },
          variables: p.variables || {},
        })}
          className="text-left rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30 p-2 transition">
          <div className="flex items-center gap-1">
            <span className="text-base">{p.emoji}</span>
            <span className="font-black text-[10.5px] truncate">{p.label}</span>
          </div>
          <div className="text-[9.5px] text-muted-foreground truncate mt-0.5">{p.tagline}</div>
        </button>
      ))}
    </div>
  </div>
)

const CampaignEditor = ({ initial, templates, onSaved, onCancel }) => {
  const [form, setForm] = useState({
    id: initial.id || undefined,
    name: initial.name || '',
    templateId: initial.templateId || '',
    templateName: initial.templateName || '',
    language: initial.language || 'en_US',
    message: initial.message || '',
    imageUrl: initial.imageUrl || '',
    documentUrl: initial.documentUrl || '',
    ctaLink: initial.ctaLink || '',
    variables: initial.variables || {},
    filter: initial.filter || { audience: 'all' },
    scheduledFor: initial.scheduledFor ? new Date(initial.scheduledFor).toISOString().slice(0, 16) : '',
  })
  const [csvText, setCsvText] = useState((initial.filter?.mobiles || []).join('\n'))
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dryRun, setDryRun] = useState(null)   // { count, estCost, currency, samples, approved, withinWindow, wallet }
  const [dryBusy, setDryBusy] = useState(false)
  const [testBatch, setTestBatch] = useState('')   // "Send to first N" (blank = all)
  const [plans, setPlans] = useState([])
  const [presets, setPresets] = useState([])
  const [managePresets, setManagePresets] = useState(false)
  const loadPresets = async () => {
    try { const r = await call('/admin/wa/presets'); setPresets(r.presets || []) } catch {}
  }
  useEffect(() => { call('/admin/plans').then(r => setPlans(r.plans || [])).catch(() => {}); loadPresets() }, [])

  // Sync CSV text into filter.mobiles whenever the CSV audience is picked.
  useEffect(() => {
    if (form.filter?.audience === 'csv') {
      const list = csvText.split(/[\s,;]+/).map(x => x.replace(/\D/g, '')).filter(x => x.length >= 10)
      setForm(f => ({ ...f, filter: { ...f.filter, mobiles: list } }))
    }
  }, [csvText, form.filter?.audience])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setFilter = (k, v) => setForm(f => ({ ...f, filter: { ...f.filter, [k]: v } }))

  // Sync template dropdown: also snap language + name
  const chooseTemplate = (tpl) => {
    setForm(f => ({
      ...f,
      templateId: tpl.name || tpl.id,
      templateName: tpl.name,
      language: tpl.language || 'en_US',
    }))
  }

  const previewRecipients = async () => {
    try {
      const r = await call('/admin/wa/preview-recipients', { method: 'POST', body: { filter: form.filter } })
      setPreview(r)
      toast.success(`Matched ${r.total} recipient${r.total === 1 ? '' : 's'}`)
    } catch (e) { toast.error(e.message) }
  }

  const save = async (thenSend = false, confirmed = false) => {
    if (!form.name.trim()) { toast.error('Campaign name required'); return }
    if (!form.templateId) { toast.error('Pick a template first'); return }
    setSaving(true)
    try {
      // Convert scheduledFor datetime-local → ISO string; keep null if empty.
      const payload = {
        ...form,
        scheduledFor: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : null,
        status: (thenSend && !form.scheduledFor) ? 'draft' : (form.scheduledFor ? 'scheduled' : 'draft'),
        dryRunConfirmed: confirmed === true,
        dryRunCount: dryRun?.count,
      }
      const r = await call('/admin/wa/campaigns', { method: 'POST', body: payload })
      const isScheduled = !!payload.scheduledFor
      if (isScheduled) toast.success(`📅 Scheduled for ${new Date(payload.scheduledFor).toLocaleString('en-IN')}`)
      else             toast.success('Saved as draft')
      if (thenSend && !isScheduled) {
        const n = Number(testBatch)
        const sendBody = { dryRunConfirmed: true }
        if (n > 0) sendBody.testBatchSize = Math.floor(n)
        const sr = await call(`/admin/wa/campaigns/${r.campaign.id}/send`, { method: 'POST', body: sendBody })
        toast.success(sr.testBatch ? `🚀 Test batch started (${sr.total} of ${sr.totalMatched}; ${sr.remaining} remaining)` : '🚀 Campaign started')
      }
      setDryRun(null)
      onSaved()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  // Required dry-run before Schedule / Send: fetch count + cost + 3 samples.
  const startDryRun = async () => {
    if (!form.name.trim()) { toast.error('Campaign name required'); return }
    if (!form.templateId) { toast.error('Pick a template first'); return }
    setDryBusy(true)
    try {
      const r = await call('/admin/wa/dry-run', { method: 'POST', body: {
        template: form.templateId, templateId: form.templateId,
        filter: form.filter, variables: form.variables,
      } })
      setDryRun(r)   // opens the confirmation modal
      if (!r.approved) toast.error('Template is NOT approved — sending is blocked.')
    } catch (e) { toast.error(e.message) }
    finally { setDryBusy(false) }
  }

  return (
    <Card className="p-3 rounded-2xl border-2 space-y-3">
      {/* Ready-made preset picker — fills the form in one tap */}
      <PresetsPicker presets={presets} onManage={() => setManagePresets(true)}
        onPick={(patch) => setForm(f => ({ ...f, ...patch, variables: { ...(f.variables || {}), ...(patch.variables || {}) } }))} />
      {managePresets && <PresetsManager presets={presets} onClose={() => { setManagePresets(false); loadPresets() }} />}
      {/* Campaign name */}
      <div>
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Campaign Name</Label>
        <Input value={form.name} onChange={e => setField('name', e.target.value)}
          placeholder="e.g. Independence Day Offer 2026"
          className="h-9 text-xs rounded-lg" maxLength={120} />
      </div>

      {/* Template picker */}
      <div>
        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">WhatsApp Template</Label>
        <select value={form.templateId} onChange={e => {
          const tpl = templates.find(t => (t.name || t.id) === e.target.value)
          if (tpl) chooseTemplate(tpl)
          else setField('templateId', e.target.value)
        }}
          className="w-full h-9 text-xs rounded-lg border border-input px-2 bg-background">
          <option value="">— Select an approved template —</option>
          {templates.map(t => (
            <option key={t.id || t.name} value={t.name || t.id}>
              {t.name} · {t.language} · {t.category}
            </option>
          ))}
        </select>
        {templates.length === 0 && (
          <p className="text-[9.5px] text-amber-700 mt-1">
            No templates loaded. Verify your Bulkymarketing credentials and template approvals.
          </p>
        )}
      </div>

      {/* Optional: media + CTA */}
      <div className="grid grid-cols-1 gap-2">
        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"><ImageIcon className="w-3 h-3 inline mr-1" />Image URL <span className="text-slate-400">(optional)</span></Label>
          <Input value={form.imageUrl} onChange={e => setField('imageUrl', e.target.value)} placeholder="https://…" className="h-8 text-xs rounded-lg" />
        </div>
        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"><LinkIcon className="w-3 h-3 inline mr-1" />CTA / Deep Link <span className="text-slate-400">(optional)</span></Label>
          <Input value={form.ctaLink} onChange={e => setField('ctaLink', e.target.value)} placeholder="https://lessonguruodisha.com/plans" className="h-8 text-xs rounded-lg" />
        </div>
      </div>

      {/* Variables — free-form key/value editor */}
      <VariablesEditor value={form.variables} onChange={(v) => setField('variables', v)} />

      {/* Recipient filter */}
      <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 p-2 space-y-2 bg-emerald-50/40 dark:bg-emerald-950/20">
        <Label className="text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300 flex items-center gap-1"><Users className="w-3 h-3" />Audience</Label>
        <div className="grid grid-cols-1 gap-1">
          {AUDIENCE_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => setFilter('audience', opt.id)}
              className={`text-left text-[11px] rounded-lg px-2.5 py-1.5 border-2 transition ${form.filter?.audience === opt.id ? 'border-emerald-500 bg-white dark:bg-emerald-950/60' : 'border-transparent bg-white/60 dark:bg-slate-900/40'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        {form.filter?.audience === 'plan' && (
          <select value={form.filter?.planId || ''} onChange={e => setFilter('planId', e.target.value)}
            className="w-full h-8 text-xs rounded-lg border border-input px-2 bg-background">
            <option value="">— pick a plan —</option>
            {plans.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        )}
        {form.filter?.audience === 'csv' && (
          <div>
            <Textarea value={csvText} onChange={e => setCsvText(e.target.value)}
              placeholder="Paste one mobile number per line, or comma separated. 10-digit or 91XXXXXXXXXX."
              className="min-h-[70px] text-xs rounded-lg" />
            <p className="text-[10px] text-muted-foreground mt-1">
              Detected {form.filter?.mobiles?.length || 0} valid number{(form.filter?.mobiles?.length || 0) === 1 ? '' : 's'}
            </p>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={previewRecipients} className="h-7 text-[10px] rounded-full">
          <Eye className="w-3 h-3 mr-1" />Preview count
        </Button>
        {preview && (
          <div className="rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 p-2 text-[10.5px]">
            <b>{preview.total}</b> recipient{preview.total === 1 ? '' : 's'} will receive this campaign.
            {preview.preview?.length > 0 && (
              <div className="mt-1 text-slate-500 text-[9.5px] truncate">
                Sample: {preview.preview.slice(0, 5).map(r => r.mobile).join(', ')}{preview.total > 5 ? ` … +${preview.total - 5} more` : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 📅 Schedule for later (optional) */}
      <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 p-2 bg-blue-50/40 dark:bg-blue-950/20">
        <Label className="text-[10px] font-black uppercase tracking-widest text-blue-800 dark:text-blue-300 flex items-center gap-1">
          📅 Schedule (optional)
        </Label>
        <div className="flex gap-1 mt-1">
          <Input type="datetime-local" value={form.scheduledFor}
            onChange={e => setForm(f => ({ ...f, scheduledFor: e.target.value }))}
            className="h-8 text-xs rounded-lg flex-1"
            min={new Date().toISOString().slice(0, 16)} />
          {form.scheduledFor && (
            <Button size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, scheduledFor: '' }))}
              className="h-8 text-[10px] rounded-lg">Clear</Button>
          )}
        </div>
        <p className="text-[9.5px] text-muted-foreground mt-1">
          {form.scheduledFor
            ? <>Will auto-launch on <b>{new Date(form.scheduledFor).toLocaleString('en-IN')}</b>. Server-side scheduler ticks every 60 s.</>
            : 'Leave empty to launch immediately with Save & Send.'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} className="h-9 flex-1 text-[11px] rounded-lg">Cancel</Button>
        <Button variant="outline" onClick={() => save(false)} disabled={saving} className="h-9 flex-1 text-[11px] rounded-lg">
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : '💾'} Save Draft
        </Button>
        <Button onClick={startDryRun} disabled={saving || dryBusy}
          className="h-9 flex-1 text-[11px] rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 font-black">
          {dryBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3 h-3 mr-1" />}
          {form.scheduledFor ? 'Review & Schedule' : 'Review & Send'}
        </Button>
      </div>

      {/* Required dry-run confirmation popup: recipient count + est cost + 3 samples */}
      {dryRun && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setDryRun(null)}>
          <Card className="w-full max-w-md p-4 rounded-2xl border-2 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="font-black text-sm mb-1">Confirm {form.scheduledFor ? 'schedule' : 'send'} · dry-run</div>
            <div className="grid grid-cols-2 gap-2 my-2">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-blue-600">Recipients</div>
                <div className="text-2xl font-black text-blue-700 dark:text-blue-300">{dryRun.count}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Est. cost</div>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{dryRun.currency || '₹'}{dryRun.estCost}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[10px] mb-2">
              <Badge className={`border-0 ${dryRun.approved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{dryRun.approved ? 'APPROVED' : 'NOT APPROVED'}</Badge>
              <Badge className={`border-0 ${dryRun.withinWindow ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{dryRun.withinWindow ? 'Within 9am–8pm IST' : 'Outside window — will defer'}</Badge>
              <span className="text-muted-foreground">{dryRun.category} · {dryRun.currency || '₹'}{dryRun.costPerMsg}/msg</span>
            </div>
            {/* 💰 Wallet safety — balance, balance-after, OTP reserve, block flag */}
            {dryRun.wallet && (
              <div className={`rounded-xl p-2.5 mb-2 text-[11px] border-2 ${dryRun.wallet.canSend ? 'border-indigo-200 bg-indigo-50/70 dark:bg-indigo-950/20' : 'border-red-300 bg-red-50 dark:bg-red-950/30'}`}>
                <div className="flex justify-between"><span className="text-muted-foreground">Wallet balance</span><span className="font-black">{dryRun.currency || '₹'}{Number(dryRun.wallet.balance).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">After this send</span><span className={`font-black ${dryRun.wallet.balanceAfter < 0 ? 'text-red-600' : ''}`}>{dryRun.currency || '₹'}{Number(dryRun.wallet.balanceAfter).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">OTP reserve (protected)</span><span className="font-bold">{dryRun.currency || '₹'}{dryRun.wallet.otpReserve}</span></div>
                {!dryRun.wallet.canSend && <div className="mt-1 font-black text-red-700">🚫 {dryRun.wallet.blockReason}</div>}
                {dryRun.wallet.stale && <div className="mt-1 text-amber-700 font-semibold">🕒 Balance may be out of date — update it in the wallet bar after a top-up.</div>}
              </div>
            )}
            {/* 🧪 Test batch — send to first N recipients only */}
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">Test batch (first N)</Label>
              <Input value={testBatch} onChange={e => setTestBatch(e.target.value.replace(/[^0-9]/g, ''))} placeholder="all" className="h-8 w-20 text-[12px]" />
              <span className="text-[10px] text-muted-foreground">{Number(testBatch) > 0 ? `will send ${Math.min(Number(testBatch), dryRun.count)} now; continue the rest later` : 'leave blank to send to everyone'}</span>
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-2 mb-1">3 sample previews</div>
            <div className="space-y-1">
              {(dryRun.samples || []).map((s, i) => (
                <div key={i} className="rounded-lg border p-2 text-[10.5px]">
                  <span className="font-mono">{s.mobile}</span> · <span className="text-muted-foreground">{JSON.stringify(s.variables)}</span>
                </div>
              ))}
              {(dryRun.samples || []).length === 0 && <div className="text-[10.5px] text-muted-foreground">No recipients matched.</div>}
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" onClick={() => setDryRun(null)} disabled={saving} className="h-9 flex-1 text-[11px] rounded-lg">Cancel</Button>
              <Button onClick={() => save(true, true)} disabled={saving || !dryRun.approved || dryRun.count === 0 || (dryRun.wallet && !dryRun.wallet.canSend)}
                className="h-9 flex-1 text-[11px] rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 font-black">
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : '✅'} Confirm {form.scheduledFor ? 'schedule' : (Number(testBatch) > 0 ? `send ${Math.min(Number(testBatch), dryRun.count)}` : `send to ${dryRun.count}`)}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Card>
  )
}

// -----------------------------------------------------------------------------
// ✏️ PresetsManager — modal for admins to edit / add / delete presets.
// -----------------------------------------------------------------------------
const PresetsManager = ({ presets: initial, onClose }) => {
  const [rows, setRows] = useState(initial || [])
  const [saving, setSaving] = useState(false)
  useEffect(() => { setRows(initial || []) }, [initial])
  const update = (idx, patch) => setRows(r => r.map((x, i) => i === idx ? { ...x, ...patch } : x))
  const addNew = () => setRows(r => [...r, { key: '', emoji: '📣', label: 'New Preset', tagline: '', name: '', templateId: '', language: 'en_US', ctaLink: '', audience: 'all', variables: {}, order: (r.length || 0) + 1 }])
  const remove = async (row) => {
    if (!confirm(`Delete preset "${row.label}"?`)) return
    if (row.id) { try { await call(`/admin/wa/presets/${row.id}`, { method: 'DELETE' }); toast.success('Deleted') } catch (e) { toast.error(e.message); return } }
    setRows(r => r.filter(x => x !== row))
  }
  const saveOne = async (row) => {
    setSaving(true)
    try { const r = await call('/admin/wa/presets', { method: 'POST', body: row }); toast.success('Saved'); return r.preset }
    catch (e) { toast.error(e.message); return null }
    finally { setSaving(false) }
  }
  const saveAll = async () => {
    setSaving(true)
    try {
      for (let i = 0; i < rows.length; i++) {
        const saved = await call('/admin/wa/presets', { method: 'POST', body: rows[i] })
        rows[i] = saved.preset
      }
      toast.success(`✅ Saved ${rows.length} preset${rows.length === 1 ? '' : 's'}`)
      onClose()
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-background rounded-2xl w-full max-w-md p-3 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">✏️</span>
          <div className="flex-1"><p className="font-black text-sm">Edit Campaign Presets</p><p className="text-[10.5px] text-muted-foreground">Add, tweak, or remove the tap-to-fill templates.</p></div>
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">✕</Button>
        </div>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.id || `new-${i}`} className="rounded-xl border-2 p-2 space-y-1.5">
              <div className="flex items-center gap-1">
                <Input value={row.emoji || ''} onChange={e => update(i, { emoji: e.target.value })} className="w-12 h-8 text-center text-lg rounded-lg" maxLength={4} />
                <Input value={row.label || ''} onChange={e => update(i, { label: e.target.value })} placeholder="Label" className="flex-1 h-8 text-xs rounded-lg" />
                <Button size="icon" variant="outline" onClick={() => remove(row)} className="h-8 w-8 rounded-lg text-red-600 border-red-300">✕</Button>
              </div>
              <Input value={row.tagline || ''} onChange={e => update(i, { tagline: e.target.value })} placeholder="Short description" className="h-7 text-xs rounded-lg" />
              <div className="grid grid-cols-2 gap-1.5">
                <Input value={row.templateId || ''} onChange={e => update(i, { templateId: e.target.value })} placeholder="template_id" className="h-7 text-xs rounded-lg" />
                <select value={row.audience || 'all'} onChange={e => update(i, { audience: e.target.value })} className="h-7 text-xs rounded-lg border border-input px-1 bg-background">
                  {AUDIENCE_OPTIONS.map(o => (<option key={o.id} value={o.id}>{o.label}</option>))}
                </select>
              </div>
              <Input value={row.ctaLink || ''} onChange={e => update(i, { ctaLink: e.target.value })} placeholder="CTA link (optional)" className="h-7 text-xs rounded-lg" />
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={async () => { const s = await saveOne(row); if (s) update(i, s) }} disabled={saving} className="h-7 text-[10px] rounded-full">Save</Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addNew} className="w-full h-8 text-[10.5px] rounded-lg">+ Add Preset</Button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button variant="outline" onClick={onClose} className="h-9 flex-1 text-[11px] rounded-lg">Close</Button>
          <Button onClick={saveAll} disabled={saving} className="h-9 flex-1 text-[11px] rounded-lg bg-emerald-600 hover:bg-emerald-700 font-black">
            {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : '💾'} Save all
          </Button>
        </div>
      </div>
    </div>
  )
}
const VariablesEditor = ({ value = {}, onChange }) => {
  const entries = Object.entries(value)
  const setEntry = (idx, key, val) => {
    const next = entries.slice()
    next[idx] = [key, val]
    onChange(Object.fromEntries(next.filter(([k]) => k !== '')))
  }
  const addRow = () => onChange({ ...value, [`var${entries.length + 1}`]: '' })
  const removeRow = (idx) => {
    const next = entries.filter((_, i) => i !== idx)
    onChange(Object.fromEntries(next))
  }
  return (
    <div>
      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
        <MessageSquare className="w-3 h-3" />Template Variables <span className="text-slate-400 normal-case font-normal">(optional — {`{{1}}, {{2}}…`} or named)</span>
      </Label>
      <div className="space-y-1 mt-1">
        {entries.map(([k, v], i) => (
          <div key={i} className="flex gap-1">
            <Input value={k} onChange={e => setEntry(i, e.target.value, v)}
              placeholder="key (e.g. 1)" className="h-7 text-xs rounded-lg flex-1" />
            <Input value={v} onChange={e => setEntry(i, k, e.target.value)}
              placeholder="value (e.g. Rahul)" className="h-7 text-xs rounded-lg flex-1" />
            <Button size="sm" variant="outline" onClick={() => removeRow(i)} className="h-7 w-8 p-0 rounded-lg">✕</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={addRow} className="h-7 text-[10px] rounded-full">+ Add variable</Button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Report — modal with delivery breakdown and per-recipient log
// -----------------------------------------------------------------------------
const CampaignReport = ({ id, onClose }) => {
  const [data, setData] = useState(null)
  // NOTE: All hooks MUST be declared before any early return, otherwise the hook
  // count changes between the loading render and the loaded render → React throws
  // "Rendered more hooks than during the previous render" (the client-side crash
  // seen when opening a report). Keep retrying/marking state up here.
  const [retrying, setRetrying] = useState(false)
  const [marking, setMarking] = useState(false)
  const load = async () => {
    try { const r = await call(`/admin/wa/campaigns/${id}/report`); setData(r) }
    catch (e) { toast.error(e.message) }
  }
  useEffect(() => { load() }, [id])

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3" onClick={onClose}>
        <div className="bg-background rounded-2xl p-6 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading report…
        </div>
      </div>
    )
  }
  // 🛡️ Defensive defaults — old campaign records (created before the new
  // accepted/failed/failReason fields) must NOT crash the report view.
  const c = data.campaign || {}
  const counts = c.counts || {}
  const deliveries = (Array.isArray(data.deliveries) ? data.deliveries : []).filter(Boolean)
  const failReasons = (Array.isArray(data.failReasons) ? data.failReasons : []).filter(Boolean)
  const total = Number(data.total ?? counts.total ?? 0)
  const accepted = Number(data.accepted ?? counts.accepted ?? counts.delivered ?? counts.sent ?? 0)
  const delivered = Number(data.delivered ?? counts.delivered ?? 0)
  const failed = Number(data.failed ?? counts.failed ?? 0)
  const failReason = data.failReason || c.failReason || null
  const processed = accepted + failed
  const rate = processed > 0 ? Math.round((accepted / processed) * 100) : 0

  const exportFailedCSV = () => {
    const failedRows = deliveries.filter(d => d.status === 'failed')
    if (!failedRows.length) return toast.info('No failed deliveries to export')
    const rows = [['Mobile', 'User ID', 'Error', 'Timestamp'].join(',')]
    for (const d of failedRows) rows.push([d.mobile, d.userId || '', (d.error || '').replace(/,/g, ';'), d.ts].join(','))
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `campaign_${c.id}_failed.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  // 🔁 One-click retry — re-send to the numbers that failed
  const retryFailed = async () => {
    if (failed === 0) return toast.info('No failed deliveries to retry')
    if (!confirm(`Retry ${failed} failed deliveries?`)) return
    setRetrying(true)
    try {
      const r = await call(`/admin/wa/campaigns/${c.id}/retry-failed`, { method: 'POST' })
      toast.success(`🔁 Retrying ${r.retrying} number${r.retrying === 1 ? '' : 's'}…`)
      // Poll the report every 4s while retry is running
      const iv = setInterval(async () => { try { await load() } catch {} }, 4000)
      setTimeout(() => clearInterval(iv), 60_000)
    } catch (e) { toast.error(e.message) }
    finally { setRetrying(false) }
  }

  // ❌ One-click correction — mark a mis-recorded campaign as FAILED (e.g. the
  // RENWAAL ALERT the provider refused for insufficient balance).
  const markFailed = async () => {
    const reason = window.prompt('Reason for FAILED status:', 'Insufficient wallet balance')
    if (reason === null) return
    const cntStr = window.prompt('How many were FAILED?', String(c.counts?.total || total || 0))
    if (cntStr === null) return
    const failedCount = Math.max(0, Math.floor(Number(String(cntStr).replace(/[^0-9]/g, '')) || 0))
    setMarking(true)
    try {
      await call(`/admin/wa/campaigns/${c.id}/mark-failed`, { method: 'POST', body: { reason, failedCount, code: 'INSUFFICIENT_BALANCE' } })
      toast.success(`Marked FAILED (${failedCount})`)
      await load()
    } catch (e) { toast.error(e.message) }
    finally { setMarking(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-background rounded-2xl w-full max-w-md p-4 shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-black text-base truncate">📊 {c.name}</p>
            <p className="text-[10.5px] text-muted-foreground">Template: {c.templateName || c.templateId}</p>
          </div>
          {c.status !== 'failed' && (
            <Button size="sm" variant="outline" onClick={markFailed} disabled={marking}
              className="h-8 text-[10px] rounded-full border-red-300 text-red-700 font-black">
              {marking ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark FAILED'}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} className="h-8 w-8">✕</Button>
        </div>
        {(c.status === 'failed' || failReason) && (
          <div className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-950/30 p-2.5 text-[11px]">
            <div className="font-black text-red-700">❌ Campaign FAILED{c.failCode ? ` · ${c.failCode}` : ''}</div>
            {failReason && <div className="text-red-700 mt-0.5">{failReason}</div>}
            {(failReasons || []).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {failReasons.slice(0, 5).map((fr, i) => (
                  <div key={i} className="text-[10px] text-red-600">• {fr._id?.reason || fr._id?.code || 'error'} — {fr.count}</div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1.5 mb-1">
          <Kpi label="Accepted"  value={accepted || 0} color="bg-indigo-100 dark:bg-indigo-900/40" />
          <Kpi label="Delivered" value={delivered || 0} color="bg-emerald-100 dark:bg-emerald-900/40" />
          <Kpi label="Failed"    value={failed || 0}    color="bg-red-100 dark:bg-red-900/40" />
          <Kpi label="Accept %"  value={`${rate}%`} color="bg-blue-100 dark:bg-blue-900/40" />
        </div>
        <p className="text-[9px] text-muted-foreground mb-2">“Accepted” = taken by the provider. “Delivered” is confirmed only via a delivery webhook (pending), so it stays 0 for now.</p>
        <div className="flex gap-1 mb-2">
          <Button size="sm" variant="outline" onClick={load} className="h-7 text-[10px] rounded-full">
            <RefreshCw className="w-3 h-3 mr-1" />Refresh
          </Button>
          {failed > 0 && (
            <Button size="sm" variant="outline" onClick={exportFailedCSV} className="h-7 text-[10px] rounded-full">
              ⬇ Failed CSV
            </Button>
          )}
          {failed > 0 && (
            <Button size="sm" onClick={retryFailed} disabled={retrying}
              className="h-7 text-[10px] rounded-full bg-red-600 hover:bg-red-700 text-white font-black">
              {retrying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : '🔁'} Retry {failed}
            </Button>
          )}
        </div>
        <div className="rounded-xl border max-h-[60vh] overflow-y-auto divide-y">
          {deliveries.map((d, di) => (
            <div key={d.id || di} className="p-2 text-[10.5px] flex items-center gap-1">
              <span className={`inline-flex w-4 h-4 rounded-full text-[9px] items-center justify-center ${d.status === 'delivered' ? 'bg-emerald-500 text-white' : d.status === 'accepted' ? 'bg-indigo-500 text-white' : 'bg-red-500 text-white'}`}>
                {d.status === 'failed' ? '✕' : (d.status === 'delivered' ? '✓' : '📨')}
              </span>
              <span className="font-mono">{d.mobile}</span>
              <span className="text-slate-500 ml-auto text-[9.5px]">{d.ts ? new Date(d.ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              {d.error && <span className="text-[9px] text-red-600 truncate max-w-[140px]" title={d.error}>· {d.error}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
