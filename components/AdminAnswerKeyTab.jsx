'use client'
// ============================================================================
// === ANSWER KEY FEATURE === Admin: queue, prepare/upload, settings, analytics.
// ============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { RefreshCw, Download, Play, Upload, Replace, XCircle, RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import AdminAnswerKeyBundlesTab from '@/components/AdminAnswerKeyBundlesTab'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : null)
const authHeaders = () => { const t = token(); return t ? { Authorization: `Bearer ${t}` } : {} }
const jget = async (p) => { const r = await fetch(`/api${p}`, { headers: authHeaders(), cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d }
const jsend = async (p, method, body) => { const r = await fetch(`/api${p}`, { method, headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body || {}) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d }

const STCLS = { submitted: 'bg-blue-100 text-blue-700', in_progress: 'bg-indigo-100 text-indigo-700', ready_locked: 'bg-amber-100 text-amber-700', unlocked: 'bg-emerald-100 text-emerald-700', rejected: 'bg-red-100 text-red-700', cancelled: 'bg-slate-100 text-slate-500', refunded: 'bg-slate-100 text-slate-500' }

export default function AdminAnswerKeyTab() {
  const [tab, setTab] = useState('queue')
  const [settings, setSettings] = useState(null)
  const [queue, setQueue] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState({})
  const uploadRef = useRef({})

  const loadSettings = useCallback(async () => { try { const d = await jget('/admin/answer-key/settings'); setSettings(d.settings) } catch (e) { toast.error(e.message) } }, [])
  const loadQueue = useCallback(async () => { try { const d = await jget(`/admin/answer-key/queue${filter ? `?status=${filter}` : ''}`); setQueue(d.items || []) } catch (e) { toast.error(e.message) } }, [filter])
  const loadAnalytics = useCallback(async () => { try { setAnalytics(await jget('/admin/answer-key/analytics')) } catch (e) { toast.error(e.message) } }, [])
  useEffect(() => { loadSettings() }, [loadSettings])
  useEffect(() => { if (tab === 'queue') loadQueue(); if (tab === 'analytics') loadAnalytics() }, [tab, loadQueue, loadAnalytics])

  const saveSettings = async () => { try { const d = await jsend('/admin/answer-key/settings', 'PUT', settings); setSettings(d.settings); toast.success('Saved') } catch (e) { toast.error(e.message) } }

  const dl = async (id, p, fname) => { try { const r = await fetch(`/api${p}`, { headers: authHeaders() }); if (!r.ok) throw new Error('failed'); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000) } catch (e) { toast.error(e.message) } }
  const act = async (id, fn) => { setBusy(b => ({ ...b, [id]: true })); try { await fn() } catch (e) { toast.error(e.message) } finally { setBusy(b => ({ ...b, [id]: false })); loadQueue() } }

  const uploadKey = async (id, endpoint) => {
    const files = uploadRef.current[id]?.files
    if (!files || !files.length) return toast.error('Select the answer key PDF/photos first')
    setBusy(b => ({ ...b, [id]: true }))
    try {
      const fd = new FormData(); Array.from(files).slice(0, 8).forEach(f => fd.append('files', f))
      const r = await fetch(`/api/admin/answer-key/${id}/${endpoint}`, { method: 'POST', headers: authHeaders(), body: fd })
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Upload failed')
      toast.success(`Saved · ₹${d.priceInr} (${d.pages} pages)`); loadQueue()
    } catch (e) { toast.error(e.message) } finally { setBusy(b => ({ ...b, [id]: false })) }
  }

  const reject = async (id) => { const reason = prompt('Reject reason (Unreadable / Not a question paper / Duplicate / Other):'); if (!reason) return; await act(id, () => jsend(`/admin/answer-key/${id}/reject`, 'POST', { reason })) }
  const attach = async (id) => { const sourceRequestId = prompt('Source request ID to copy the answer key from:'); if (!sourceRequestId) return; await act(id, () => jsend(`/admin/answer-key/${id}/attach-existing`, 'POST', { sourceRequestId })) }
  const refund = async (id) => { if (!confirm('Refund & re-lock this answer key?')) return; await act(id, () => jsend(`/admin/answer-key/${id}/refund`, 'POST', { reason: 'admin refund' })) }

  if (!settings) return <div className="p-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Loading…</div>

  return (
    <div className="space-y-3 mt-3">
      <div className="flex gap-2">
        {['queue', 'bundles', 'settings', 'analytics'].map(t => (
          <Button key={t} size="sm" variant={tab === t ? 'default' : 'outline'} onClick={() => setTab(t)} className="rounded-full capitalize">{t}</Button>
        ))}
        {tab === 'queue' && <Button size="sm" variant="outline" onClick={loadQueue} className="rounded-full ml-auto"><RefreshCw className="w-3 h-3" /></Button>}
      </div>

      {tab === 'bundles' && <AdminAnswerKeyBundlesTab />}

      {tab === 'settings' && (
        <Card className="p-4 rounded-2xl border-2 space-y-3">
          <div className="flex items-center justify-between"><div><p className="font-bold text-sm">Feature master switch</p><p className="text-[11px] text-muted-foreground">OFF hides it from all teachers</p></div><Switch checked={!!settings.enabled} onCheckedChange={v => setSettings(s => ({ ...s, enabled: v }))} /></div>
          <div className="flex items-center justify-between"><div><p className="font-bold text-sm">First answer key free</p></div><Switch checked={!!settings.firstFree} onCheckedChange={v => setSettings(s => ({ ...s, firstFree: v }))} /></div>
          <div className="grid grid-cols-2 gap-2">
            {[['standardPriceInr', 'Standard ₹'], ['longPriceInr', 'Long ₹'], ['longPageThreshold', 'Long page threshold'], ['turnaroundHours', 'Turnaround hours'], ['maxUnpaidConcurrent', 'Max open/user'], ['maxPerDay', 'Max/day'], ['downloadsPerKey', 'Downloads/key'], ['slaAlertHoursBefore', 'SLA alert (h before)']].map(([k, l]) => (
              <div key={k}><Label className="text-[11px]">{l}</Label><Input type="number" value={settings[k]} onChange={e => setSettings(s => ({ ...s, [k]: e.target.value }))} /></div>
            ))}
          </div>
          <div><Label className="text-[11px]">Alert WhatsApp number (admin)</Label><Input value={settings.alertWhatsapp || ''} onChange={e => setSettings(s => ({ ...s, alertWhatsapp: e.target.value }))} placeholder="e.g. 919692604577 — blank uses default" /><p className="text-[10px] text-muted-foreground mt-0.5">Gets a WhatsApp when a prepaid request is within the SLA window above and still not delivered.</p></div>
          <div><Label className="text-[11px]">Beta testers (mobile numbers)</Label><textarea value={(settings.betaTesters || []).join(', ')} onChange={e => setSettings(s => ({ ...s, betaTesters: e.target.value.split(/[\s,\n]+/).map(x => x.replace(/[^0-9]/g, '')).filter(Boolean) }))} rows={2} className="w-full border rounded-lg p-2 text-sm" placeholder="9692604577, 8000000001" /><p className="text-[10px] text-muted-foreground mt-0.5">When the master switch is OFF, ONLY these numbers can see & use the Answer Key feature. Everyone else: hidden + endpoints return 404.</p></div>
          <Button onClick={saveSettings} className="rounded-full">Save settings</Button>
        </Card>
      )}

      {tab === 'analytics' && analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[['Received', analytics.received], ['Ready', analytics.ready], ['Unlocked', analytics.unlocked], ['Rejected', analytics.rejected], ['Conversion', analytics.conversionRate + '%'], ['Revenue ₹', analytics.revenueInr], ['Avg turnaround h', analytics.avgTurnaroundHours], ['Ready-unpaid', analytics.readyUnpaid]].map(([l, v]) => (
            <Card key={l} className="p-3 rounded-2xl border-2"><p className="text-[10px] text-muted-foreground font-bold">{l}</p><p className="text-2xl font-extrabold">{v}</p></Card>
          ))}
          {analytics.abuseWatch?.length > 0 && <Card className="col-span-full p-3 rounded-2xl border-2 border-red-200"><p className="text-xs font-bold text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Abuse watch: {analytics.abuseWatch.length} user(s) with ≥3 unpaid ready keys</p></Card>}
        </div>
      )}

      {tab === 'queue' && (
        <>
          <div className="flex gap-1 flex-wrap">
            {['', 'submitted', 'in_progress', 'ready_locked', 'unlocked', 'rejected'].map(f => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)} className="rounded-full text-[11px] h-7">{f || 'All'}</Button>
            ))}
          </div>
          {queue.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">No requests.</p>}
          {queue.map(it => (
            <Card key={it.id} className={`p-3 rounded-2xl border-2 ${it.overdue ? 'border-red-300' : ''}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{it.ownerName} · {it.ownerMobileMasked}</p>
                  <p className="text-[11px] text-muted-foreground">{it.class} · {it.subject}{it.examName ? ` · ${it.examName}` : ''} · {it.questionPageCount || '?'}pg · waited {it.waitingHours}h{it.overdue ? ' ⚠️' : ''}</p>
                  {it.userNote && <p className="text-[11px] italic mt-0.5">“{it.userNote}”</p>}
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-full ${STCLS[it.status] || ''}`}>{it.status}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-full" onClick={() => dl(it.id, `/admin/answer-key/${it.id}/question-file`, `question-${it.id}.pdf`)}><Download className="w-3 h-3 mr-1" /> Question</Button>
                {['submitted', 'in_progress'].includes(it.status) && <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-full" disabled={busy[it.id]} onClick={() => act(it.id, () => jsend(`/admin/answer-key/${it.id}/start`, 'POST'))}><Play className="w-3 h-3 mr-1" /> Start</Button>}
                {it.status !== 'cancelled' && it.status !== 'rejected' && (
                  <>
                    <input type="file" accept=".pdf,image/*" multiple className="hidden" ref={el => { uploadRef.current[it.id] = el }} onChange={() => uploadKey(it.id, it.status === 'unlocked' || it.status === 'ready_locked' ? 'replace-key' : 'upload-key')} />
                    <Button size="sm" className="h-7 text-[11px] rounded-full" disabled={busy[it.id]} onClick={() => uploadRef.current[it.id]?.click()}>
                      {busy[it.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : (it.status === 'unlocked' || it.status === 'ready_locked') ? <><Replace className="w-3 h-3 mr-1" /> Replace key</> : <><Upload className="w-3 h-3 mr-1" /> Upload key</>}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-full" onClick={() => attach(it.id)}>Attach existing</Button>
                  </>
                )}
                {['submitted', 'in_progress', 'ready_locked'].includes(it.status) && <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-full text-red-600" onClick={() => reject(it.id)}><XCircle className="w-3 h-3 mr-1" /> Reject</Button>}
                {it.status === 'unlocked' && <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-full text-red-600" onClick={() => refund(it.id)}><RotateCcw className="w-3 h-3 mr-1" /> Refund</Button>}
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}
