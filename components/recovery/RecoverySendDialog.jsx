'use client'
import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

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

const money = (cur, n) => `${cur || '₹'}${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// Per-message rates are fractions of a rupee (e.g. ₹0.9926) — show full precision.
const rate = (cur, n) => `${cur || '₹'}${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const statusTone = { eligible: 'bg-emerald-500', skipped: 'bg-slate-400', blocked: 'bg-amber-500' }

// Controlled dialog. Parent passes the selected users (max 50) + open state.
export default function RecoverySendDialog({ open, onOpenChange, users = [], onComplete }) {
  const [phase, setPhase] = useState('loading') // loading | preview | sending | report | error
  const [data, setData] = useState(null)
  const [report, setReport] = useState(null)
  const [err, setErr] = useState('')

  const ids = users.map(u => u.id)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setPhase('loading'); setData(null); setReport(null); setErr('')
    ;(async () => {
      try {
        const r = await api('/admin/recovery-send', { method: 'POST', body: { mode: 'dry-run', userIds: ids } })
        if (!cancelled) { setData(r); setPhase('preview') }
      } catch (e) { if (!cancelled) { setErr(e.message); setPhase('error') } }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const confirmSend = async () => {
    setPhase('sending')
    try {
      const r = await api('/admin/recovery-send', { method: 'POST', body: { mode: 'send', userIds: ids } })
      setReport(r.report); setPhase('report')
      toast.success(`Sent ${r.report.sentCount} · failed ${r.report.failedCount} · skipped ${r.report.skippedCount}`)
      onComplete?.()
    } catch (e) {
      setErr(e.message); setPhase('error')
      toast.error(e.message)
    }
  }

  const c = data?.counts || {}
  const cost = data?.cost || {}
  const w = data?.wallet || {}

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🤖 Auto-Send Renewal via BulkyMarketing</DialogTitle>
        </DialogHeader>

        {phase === 'loading' && <div className="py-10 text-center text-sm text-muted-foreground">Preparing dry-run preview…</div>}

        {phase === 'error' && (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-red-600 font-semibold">{err || 'Something went wrong'}</p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        )}

        {phase === 'preview' && data && (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <b>Dry-run (nothing sent yet).</b> Review the numbers below, then confirm to send real WhatsApp messages.
            </div>

            {/* Counts */}
            <div className="grid grid-cols-3 gap-2">
              {[['Selected', c.total], ['Eligible', c.eligible], ['Skipped', c.skipped], ['Blocked', c.blocked], ['Marketing', c.marketing], ['Utility', c.utility]].map(([l, v]) => (
                <div key={l} className="rounded-xl border bg-muted/40 px-2 py-1.5 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase">{l}</p>
                  <p className="text-base font-black leading-tight">{v ?? 0}</p>
                </div>
              ))}
            </div>

            {/* Cost estimate (display-only) */}
            <div className="rounded-xl border p-3 space-y-1">
              <p className="font-semibold text-xs uppercase text-muted-foreground">Estimated cost (display only)</p>
              <p className="text-xs text-muted-foreground">Marketing {rate(cost.currency, cost.rateMarketing)}/msg · Utility {rate(cost.currency, cost.rateUtility)}/msg</p>
              <p className="text-lg font-black">{money(cost.currency, cost.estCost)} <span className="text-xs font-normal text-muted-foreground">for {c.eligible} message{c.eligible === 1 ? '' : 's'}</span></p>
              <p className="text-[11px] text-muted-foreground">BulkyMarketing deducts from its own wallet — this is an estimate.</p>
            </div>

            {/* Wallet gate */}
            <div className={`rounded-xl border p-3 space-y-1 ${w.canSend ? '' : 'border-red-300 bg-red-50 dark:bg-red-950/30'}`}>
              <p className="font-semibold text-xs uppercase text-muted-foreground">Wallet (OTP reserve protected)</p>
              <div className="flex justify-between text-xs"><span>Stored balance</span><b>{money(w.currency || cost.currency, w.balance)}</b></div>
              <div className="flex justify-between text-xs"><span>OTP reserve</span><span>{money(w.currency || cost.currency, w.otpReserve)}</span></div>
              <div className="flex justify-between text-xs"><span>Balance after send</span><b>{money(w.currency || cost.currency, w.balanceAfter)}</b></div>
              {w.stale && <p className="text-[11px] text-amber-700 dark:text-amber-300">⚠️ Balance estimate is stale — re-sync it in WhatsApp settings after a top-up.</p>}
              {!w.canSend && <p className="text-[11px] text-red-600 font-semibold">{w.blockReason}</p>}
            </div>

            {/* Templates + approval + preview */}
            {Object.keys(data.approvals || {}).length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold text-xs uppercase text-muted-foreground">Templates</p>
                {Object.entries(data.approvals).map(([t, st]) => (
                  <div key={t} className="rounded-xl border p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold">{t}</span>
                      <Badge className={st === 'APPROVED' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}>{st}</Badge>
                    </div>
                    <pre className="mt-1.5 whitespace-pre-wrap text-[11px] text-muted-foreground font-sans">{data.previews?.[t]}</pre>
                  </div>
                ))}
              </div>
            )}

            {/* Per-user list */}
            <div className="space-y-1">
              <p className="font-semibold text-xs uppercase text-muted-foreground">Recipients ({data.items.length})</p>
              <div className="max-h-40 overflow-y-auto rounded-xl border divide-y">
                {data.items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                    <Badge className={`${statusTone[it.status] || 'bg-slate-400'} text-white text-[9px]`}>{it.status}</Badge>
                    <span className="font-semibold truncate flex-1">{it.name || '(no name)'} · {it.mobile || '—'}</span>
                    <span className="text-muted-foreground">{it.reason || it.template || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {phase === 'sending' && <div className="py-10 text-center text-sm text-muted-foreground">Sending via BulkyMarketing… please wait.</div>}

        {phase === 'report' && report && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              {[['✅ Sent', report.sentCount, 'from-emerald-500 to-green-600'], ['❌ Failed', report.failedCount, 'from-red-500 to-rose-600'], ['⏭ Skipped', report.skippedCount, 'from-slate-400 to-slate-600']].map(([l, v, g]) => (
                <div key={l} className={`rounded-xl p-2.5 text-white text-center bg-gradient-to-br ${g}`}>
                  <p className="text-[10px] font-semibold opacity-90">{l}</p>
                  <p className="text-lg font-black">{v}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">Estimated spend: {money(report.currency, report.spend)}</p>
            {report.failed?.length > 0 && (
              <div className="space-y-1">
                <p className="font-semibold text-xs uppercase text-red-600">Failed</p>
                <div className="max-h-32 overflow-y-auto rounded-xl border divide-y">
                  {report.failed.map((f, i) => <div key={i} className="px-2.5 py-1 text-[11px]"><b>{f.name || f.mobile}</b> — {f.error}</div>)}
                </div>
              </div>
            )}
            {report.skipped?.length > 0 && (
              <div className="space-y-1">
                <p className="font-semibold text-xs uppercase text-muted-foreground">Skipped / Blocked</p>
                <div className="max-h-32 overflow-y-auto rounded-xl border divide-y">
                  {report.skipped.map((s, i) => <div key={i} className="px-2.5 py-1 text-[11px]"><b>{s.name || s.mobile || '(user)'}</b> — {s.reason}</div>)}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === 'preview' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={confirmSend} disabled={!w.canSend || !(c.eligible > 0)} className="bg-emerald-700 text-white">
                Send {c.eligible} message{c.eligible === 1 ? '' : 's'}
              </Button>
            </>
          )}
          {phase === 'report' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
