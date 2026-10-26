'use client'
import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ODISHA_DISTRICTS } from '@/lib/odisha-districts'

const api = async (path, opts = {}) => {
  const token = localStorage.getItem('em_token') || localStorage.getItem('token')
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
  return d
}

const REWARDS = [['recharge', 'Recharge given'], ['gift', 'Gift sent'], ['districtHead', 'District Head assigned']]

export default function AdminReferralMilestone() {
  const [cfg, setCfg] = useState(null)
  const [reached, setReached] = useState([])
  const [target, setTarget] = useState(500)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [ladder, setLadder] = useState(true)       // continuous-ladder master switch (default ON)
  const [notice, setNotice] = useState({ enabled: true, text: '' })
  const [savingLadder, setSavingLadder] = useState(false)
  const [kill, setKill] = useState(true)           // Ambassador ₹99 plan kill switch (default ON)
  const [savingKill, setSavingKill] = useState(false)
  const [switchOff, setSwitchOff] = useState(null)
  const [switchOffLoading, setSwitchOffLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api('/admin/referral-milestone')   // fast: config/switch/notice only
      setCfg(r.config); setReached(r.reached || []); setTarget(r.target)
      setLadder(r.continuousLadder !== false)
      setKill(r.ambassadorKill !== false)
      setNotice(r.notice || { enabled: true, text: '' })
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  // Heavy "milestone reached" list — loaded separately so it never blocks the
  // settings card / Referral Popup V2 switch from rendering.
  const loadReached = async () => {
    try { const r = await api('/admin/referral-milestone?withReached=1'); setReached(r.reached || []); if (r.target) setTarget(r.target) } catch (_) {}
  }
  const loadPreview = async () => {
    setPreviewLoading(true)
    try { const r = await api('/admin/referral-milestone/preview?limit=20'); setPreview(r) }
    catch (e) { /* non-fatal */ } finally { setPreviewLoading(false) }
  }
  const loadSwitchOff = async () => {
    setSwitchOffLoading(true)
    try { const r = await api('/admin/referral-milestone/switch-off-preview'); setSwitchOff(r) }
    catch (e) { setSwitchOff({ ok: false, error: e.message }) } finally { setSwitchOffLoading(false) }
  }
  useEffect(() => { load(); loadReached(); loadPreview(); loadSwitchOff() }, [])

  const saveCfg = async () => {
    setSaving(true)
    try { const r = await api('/admin/referral-milestone', { method: 'PUT', body: cfg }); setCfg(r.config); toast.success('Settings saved') }
    catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const toggleLadder = async (v) => {
    const msg = v
      ? 'Turn the Continuous ladder ON (OLD behaviour: +1 year every 50 referrals, forever)?'
      : 'Turn the Continuous ladder OFF (NEW rule: one-time 5/15/30/50/100, then ₹99/year Ambassador plan)?\n\nAlready-granted rewards are never removed.'
    if (!window.confirm(msg)) return
    setSavingLadder(true)
    try {
      const r = await api('/admin/referral-milestone', { method: 'PUT', body: { continuousLadder: v } })
      setLadder(r.continuousLadder !== false)
      toast.success(v ? 'Continuous ladder ON (old behaviour)' : 'Continuous ladder OFF (new rule + Ambassador plan live)')
    } catch (e) { toast.error(e.message) } finally { setSavingLadder(false) }
  }
  const toggleKill = async (v) => {
    // v = switch value (true = kill ON = plan blocked). We invert label below.
    const msg = v
      ? 'Turn the Ambassador ₹99 plan KILL-SWITCH ON?\n\nThe ₹99 plan will be BLOCKED everywhere (list / order / QR / verify) for everyone.'
      : 'Turn the KILL-SWITCH OFF and make the ₹99 Ambassador plan AVAILABLE?\n\nIt will still require: Continuous ladder OFF + the teacher being Ambassador-eligible (X ≥ required).'
    if (!window.confirm(msg)) return
    setSavingKill(true)
    try {
      const r = await api('/admin/referral-milestone', { method: 'PUT', body: { ambassadorKill: v } })
      setKill(r.ambassadorKill !== false)
      toast.success(v ? 'Kill-switch ON — ₹99 plan blocked' : 'Kill-switch OFF — ₹99 plan available (still gated)')
    } catch (e) { toast.error(e.message) } finally { setSavingKill(false) }
  }
  const saveNotice = async () => {
    try { const r = await api('/admin/referral-milestone', { method: 'PUT', body: { referralNotice: notice } }); setNotice(r.notice || notice); toast.success('Notice saved') }
    catch (e) { toast.error(e.message) }
  }

  const mark = async (userId, reward, action) => {
    let note = '', reason = ''
    if (action === 'give') note = window.prompt('Note (recharge txn id / courier number / remark):', '') ?? ''
    if (action === 'undo') { reason = window.prompt('Reason for undo (required):', '') || ''; if (!reason) return }
    try { await api('/admin/referral-milestone/mark', { method: 'POST', body: { userId, reward, action, note, reason } }); toast.success('Updated'); load() }
    catch (e) { toast.error(e.message === 'already-given' ? 'Already marked given' : e.message) }
  }

  const assignDH = async (userId, district, force = false) => {
    if (!district) { toast.error('Pick a district'); return }
    try {
      await api('/admin/district-head', { method: 'POST', body: { userId, district, action: 'assign', force } })
      toast.success('District Head assigned'); load()
    } catch (e) {
      if (String(e.message).includes('district-occupied') || String(e.message).includes('occupied')) {
        if (window.confirm(`${district} already has a District Head. Replace them?`)) assignDH(userId, district, true)
      } else toast.error(e.message)
    }
  }
  const removeDH = async (userId) => {
    if (!window.confirm('Remove District Head role from this teacher?')) return
    try { await api('/admin/district-head', { method: 'POST', body: { userId, action: 'remove' } }); toast.success('Removed'); load() }
    catch (e) { toast.error(e.message) }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading milestone data…</div>
  if (!cfg) return null
  const setRw = (k, patch) => setCfg({ ...cfg, rewards: { ...cfg.rewards, [k]: { ...cfg.rewards[k], ...patch } } })

  return (
    <div className="space-y-6">
      {/* 🔔 Referral Popup V2 (REFERRAL_POPUP_V2) — prominent, top of the panel */}
      <div className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-sm">🔔 Referral Popup V2 {cfg.popupV2 ? '(ON — new popup)' : '(OFF — old popup)'}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
              Master switch for the new home-screen referral popup (REFERRAL_POPUP_V2). Keep OFF to use the old popup. Only ONE popup ever shows. Click Save after changing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!cfg.popupV2} onCheckedChange={v => setCfg({ ...cfg, popupV2: v })} />
            <Button size="sm" onClick={saveCfg} disabled={saving} className="rounded-xl font-bold">{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </div>

      {/* Continuous-ladder master switch (SAFETY) */}
      <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-sm">Continuous ladder {ladder ? '(ON — old behaviour)' : '(OFF — new rule)'}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
              ON = +1 year every 50 referrals, forever (default, nothing changes). OFF = one-time 5/15/30/50/100, then the ₹99/year Ambassador plan + new texts go live. Already-granted rewards are never removed.
            </p>
          </div>
          <Switch checked={ladder} disabled={savingLadder} onCheckedChange={toggleLadder} />
        </div>
      </div>

      {/* Ambassador ₹99 plan KILL-SWITCH (SAFETY, DEFAULT ON) */}
      <div className={`rounded-2xl border-2 p-4 ${kill ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-sm">Ambassador ₹99 plan — Kill-switch {kill ? '(ON — plan BLOCKED)' : '(OFF — plan available)'}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-md">
              ON (default, safe) = the ₹99 Ambassador plan is blocked everywhere (list / order / QR / verify) for everyone. OFF = plan becomes available, but still only for teachers who are Ambassador-eligible (ladder OFF + X ≥ required). Keep this ON until Ambassador rules are approved.
            </p>
          </div>
          <Switch checked={kill} disabled={savingKill} onCheckedChange={toggleKill} />
        </div>
      </div>

      {/* 🔮 SWITCH-OFF PREVIEW (read-only "what-if") */}
      <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-black text-base">🔮 Switch-OFF preview (read-only)</h3>
          <Button size="sm" variant="outline" onClick={loadSwitchOff} disabled={switchOffLoading}>{switchOffLoading ? 'Loading…' : 'Refresh'}</Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          If you turn the Continuous ladder <b>OFF</b> now, these one-time rewards will be granted (using the unified all-time count X; already-granted milestones are skipped). <b>Nothing is granted until you actually switch OFF.</b>
        </p>
        {switchOffLoading ? (
          <div className="text-sm text-muted-foreground py-3">Computing preview…</div>
        ) : !switchOff || switchOff.ok === false ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">{switchOff?.error || 'Could not load preview. Click Refresh.'}</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl bg-white border p-3 text-center">
                <div className="text-2xl font-black text-indigo-700">{switchOff.teacherCount || 0}</div>
                <div className="text-[11px] text-muted-foreground">teachers get a reward</div>
              </div>
              <div className="rounded-xl bg-white border p-3 text-center">
                <div className="text-2xl font-black text-emerald-700">{switchOff.totalFreeDays || 0}</div>
                <div className="text-[11px] text-muted-foreground">total free days granted</div>
              </div>
              <div className="rounded-xl bg-white border p-3 text-center">
                <div className="text-2xl font-black text-rose-700">{switchOff.ambassadorCount || 0}</div>
                <div className="text-[11px] text-muted-foreground">become Ambassador (X ≥ {switchOff.ambassadorThreshold || 500})</div>
              </div>
            </div>
            {switchOff.rows?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1.5 pr-2">Teacher</th>
                      <th className="py-1.5 pr-2">Phone</th>
                      <th className="py-1.5 pr-2">X</th>
                      <th className="py-1.5 pr-2">Milestone</th>
                      <th className="py-1.5 pr-2">Free days</th>
                      <th className="py-1.5 pr-2">Ambassador</th>
                    </tr>
                  </thead>
                  <tbody>
                    {switchOff.rows.map((x) => (
                      <tr key={x.userId} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 font-semibold">{x.name}</td>
                        <td className="py-1.5 pr-2 font-mono">••••{x.mobileLast4}</td>
                        <td className="py-1.5 pr-2">{x.X}</td>
                        <td className="py-1.5 pr-2">{x.milestone ? x.milestone : '—'}</td>
                        <td className="py-1.5 pr-2">{x.freeDays || 0}</td>
                        <td className="py-1.5 pr-2">{x.becomesAmbassador ? <Badge className="bg-rose-600 text-white">Yes</Badge> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-3">No rewards would be granted right now.</div>
            )}
          </>
        )}
      </div>

      {/* New-rule notice banner editor (shown on referral page only when ladder is OFF) */}
      <div className="rounded-2xl border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-black text-sm">📢 Referral notice banner</p>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Show</span>
            <Switch checked={notice.enabled !== false} onCheckedChange={(v) => setNotice({ ...notice, enabled: v })} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Appears at the top of the referral page only when the ladder is OFF. Teachers can dismiss it.</p>
        <textarea value={notice.text || ''} onChange={(e) => setNotice({ ...notice, text: e.target.value })} rows={3}
          className="w-full rounded-xl border p-2 text-[13px]" style={{ fontFamily: '"Noto Sans Oriya",Inter,sans-serif' }} />
        <Button size="sm" onClick={saveNotice} className="rounded-xl font-bold">Save notice</Button>
      </div>

      {/* Settings */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-base">🏆 Milestone Settings</h3>
          <Button size="sm" onClick={saveCfg} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2"><Switch checked={cfg.popupV2} onCheckedChange={v => setCfg({ ...cfg, popupV2: v })} /> New popup (REFERRAL_POPUP_V2)</label>
          <label className="flex items-center gap-2"><Switch checked={cfg.milestoneEnabled} onCheckedChange={v => setCfg({ ...cfg, milestoneEnabled: v })} /> Milestone enabled</label>
          <label className="flex flex-col gap-1"><span className="text-[12px] font-semibold">Target</span><Input type="number" className="h-9 w-full" value={cfg.target} onChange={e => setCfg({ ...cfg, target: e.target.value })} /></label>
          <label className="flex flex-col gap-1" title="Referral count X at which a teacher becomes an Ambassador (₹99/yr plan + recharge + gift + District Head). Used only when the Continuous ladder is OFF."><span className="text-[12px] font-semibold">Ambassador required referrals</span><Input type="number" className="h-9 w-full" value={cfg.ambassadorRequiredReferrals ?? 500} onChange={e => setCfg({ ...cfg, ambassadorRequiredReferrals: e.target.value })} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[12px] font-semibold">Recharge limit</span><Input className="h-9 w-full" value={cfg.rechargeLimit} onChange={e => setCfg({ ...cfg, rechargeLimit: e.target.value })} /></label>
        </div>
        <div className="space-y-2">
          {['recharge', 'gift', 'districtHead'].map(k => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <Switch checked={cfg.rewards[k].enabled} onCheckedChange={v => setRw(k, { enabled: v })} />
              <span className="w-24 font-semibold capitalize">{k}</span>
              <Input className="h-8 flex-1" value={cfg.rewards[k].title} onChange={e => setRw(k, { title: e.target.value })} />
              <Input className="h-8 flex-1" value={cfg.rewards[k].subtitle} onChange={e => setRw(k, { subtitle: e.target.value })} />
            </div>
          ))}
        </div>
      </div>

      {/* Read-only Milestone Preview — top 20 by the NEW all-time count */}
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-black text-base">👀 Milestone preview (read-only)</h3>
          <Button size="sm" variant="outline" onClick={loadPreview} disabled={previewLoading}>{previewLoading ? 'Loading…' : 'Refresh'}</Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Top 20 teachers by the NEW milestone rule (referred teacher EVER made a successful paid Premium — all-time, no self-referral, same phone/email counted once). The old “Premium” number (currently-active referrals) is shown for comparison. Nothing is written and no messages are sent.
        </p>
        {/* 🔎 COUNT CHECK — old admin paid total vs new milestone total */}
        {preview?.countCheck && (
          <div className="mb-3 rounded-xl border-2 border-sky-300 bg-sky-50 p-3">
            <div className="font-black text-sm mb-1">🔎 Count check (old admin vs new milestone)</div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="rounded-lg bg-white border p-2 text-center">
                <div className="text-xl font-black text-slate-700">{preview.countCheck.oldAdminActiveTotal}</div>
                <div className="text-[10px] text-muted-foreground">OLD admin paid total (active subs)</div>
              </div>
              <div className="rounded-lg bg-white border p-2 text-center">
                <div className="text-xl font-black text-emerald-700">{preview.countCheck.newMilestoneActiveDeduped}</div>
                <div className="text-[10px] text-muted-foreground">NEW active (deduped by phone)</div>
              </div>
              <div className="rounded-lg bg-white border p-2 text-center">
                <div className="text-xl font-black text-indigo-700">{preview.countCheck.newMilestoneEverPaid}</div>
                <div className="text-[10px] text-muted-foreground">NEW ever-paid (milestone count)</div>
              </div>
            </div>
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-muted-foreground border-b"><th className="py-1">Top referrer</th><th className="py-1">Old premium</th><th className="py-1">New milestone</th></tr></thead>
              <tbody>
                {preview.countCheck.top?.map((x, i) => (
                  <tr key={i} className="border-b last:border-0"><td className="py-1 font-semibold">{x.name}</td><td className="py-1">{x.oldPremium}</td><td className="py-1 font-bold text-indigo-700">{x.newMilestone}</td></tr>
                ))}
              </tbody>
            </table>
            {preview.countCheck.calculatedAt && <div className="mt-1.5 text-[10px] text-muted-foreground">Last calculated: {new Date(preview.countCheck.calculatedAt).toLocaleString()} · ever-paid ≥ active (expired teachers still count; refunds don't)</div>}
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
              <div className="rounded bg-white border px-2 py-1">From payments: <b>{preview.countCheck.fromPayments ?? 0}</b></div>
              <div className="rounded bg-white border px-2 py-1">From QR: <b>{preview.countCheck.fromQR ?? 0}</b></div>
              <div className="rounded bg-white border px-2 py-1">From old subscription: <b>{preview.countCheck.fromOldSubscription ?? 0}</b></div>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11px]">
              <div className="rounded bg-rose-50 border border-rose-200 px-2 py-1">Excluded free grants: <b>{preview.countCheck.excludedFreeGrants ?? 0}</b></div>
              <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1">Ambiguous old records: <b>{preview.countCheck.ambiguousOldRecords ?? 0}</b></div>
              <div className="rounded bg-slate-50 border px-2 py-1">Refunded: <b>excluded</b></div>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">“Free grants” = admin/referral-reward/partner(Combo)/trial/coupon Premium (never paid). “Ambiguous” = old paid-looking sub with no amount/payment-id and no payments/QR row — NOT counted.</div>
          </div>
        )}
        {preview?.atOrAboveTarget?.length > 0 ? (
          <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-800">
            <b>⚠️ {preview.atOrAboveTarget.length} teacher(s) already at/above {preview.target}:</b>
            {preview.atOrAboveTarget.map((x, i) => <span key={i} className="ml-2">{x.name} (••••{x.mobileLast4}) — {x.milestoneCount}</span>)}
          </div>
        ) : (
          <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] text-emerald-800">
            ✓ Nobody is at or above the {preview?.target || target} milestone yet.
          </div>
        )}
        {preview?.continuous && (
          <div className="mb-3 rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-[12px] text-violet-900">
            <b>Teachers with a 100+ / continuous reward: {preview.continuous.count}</b>
            {preview.continuous.earners?.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {preview.continuous.earners.slice(0, 20).map((e, i) => (
                  <div key={i} className="text-[11px]">
                    {e.name} (••••{e.mobileLast4}) — earned {e.highestReward}; now at {e.qualified} of {e.nextStep}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {previewLoading ? (
          <div className="text-sm text-muted-foreground py-3">Loading preview…</div>
        ) : (preview?.top?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-1.5 pr-2">#</th>
                  <th className="py-1.5 pr-2">Teacher</th>
                  <th className="py-1.5 pr-2">Phone</th>
                  <th className="py-1.5 pr-2">Milestone (new)</th>
                  <th className="py-1.5 pr-2">Old “Premium”</th>
                </tr>
              </thead>
              <tbody>
                {preview.top.map((x, i) => (
                  <tr key={x.userId} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-2 font-semibold">{x.name}</td>
                    <td className="py-1.5 pr-2 font-mono">••••{x.mobileLast4}</td>
                    <td className="py-1.5 pr-2">
                      <Badge className={x.reached ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}>{x.milestoneCount} / {preview.target}</Badge>
                    </td>
                    <td className="py-1.5 pr-2 text-muted-foreground">{x.oldPremiumCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-3">No referrers with a paid-Premium referral yet.</div>
        ))}
      </div>

      {/* Reached list */}
      <div className="rounded-2xl border p-4">
        <h3 className="font-black text-base mb-1">🚩 Milestone reached — pending approval ({reached.length})</h3>
        <p className="text-xs text-muted-foreground mb-3">Target: {target} successful referrals. No automatic payouts — mark each reward after you give it.</p>
        {reached.length === 0 && <div className="text-sm text-muted-foreground py-4">No teacher has reached {target} yet.</div>}
        <div className="space-y-3">
          {reached.map(u => (
            <div key={u.userId} className="rounded-xl border p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <b className="text-sm">{u.name}</b> <span className="text-xs text-muted-foreground">{u.mobileMasked}</span>
                  <Badge className="ml-2 bg-emerald-600 text-white">{u.count} referrals</Badge>
                  {u.districtHead && <Badge className="ml-1 bg-amber-500 text-white">District Head{u.district ? ` · ${u.district}` : ''}</Badge>}
                </div>
              </div>
              <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
                ⚠️ Fraud check: {u.fraud.join(' · ')}
                <div className="text-[10px] text-muted-foreground mt-0.5">Payment-account &amp; device dedupe: not tracked yet (only phone/email signals available).</div>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {REWARDS.map(([k, label]) => {
                  const m = u.marks?.[k]
                  return (
                    <div key={k} className="rounded-lg border px-2 py-1.5 text-xs">
                      <div className="font-semibold">{label}</div>
                      {m?.given ? (
                        <>
                          <div className="text-emerald-700 mt-0.5">✓ given by {m.byName || 'admin'} · {new Date(m.at).toLocaleDateString()}</div>
                          {m.note && <div className="text-muted-foreground truncate">note: {m.note}</div>}
                          <button className="text-[11px] text-red-600 underline mt-1" onClick={() => mark(u.userId, k, 'undo')}>Undo</button>
                        </>
                      ) : (
                        <button className="text-[11px] text-indigo-600 underline mt-1" onClick={() => mark(u.userId, k, 'give')}>Mark given</button>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                <span className="text-[11px] font-semibold text-amber-700">District Head:</span>
                {u.districtHead ? (
                  <>
                    <Badge className="bg-amber-500 text-white">Assigned{u.district ? ` · ${u.district}` : ''}</Badge>
                    <button className="text-[11px] text-red-600 underline" onClick={() => removeDH(u.userId)}>Remove</button>
                  </>
                ) : (
                  <>
                    <select id={`dh-${u.userId}`} defaultValue="" className="h-7 text-[11px] rounded border px-1">
                      <option value="" disabled>Choose district…</option>
                      {ODISHA_DISTRICTS.map(dn => <option key={dn} value={dn}>{dn}</option>)}
                    </select>
                    <button className="text-[11px] text-indigo-600 underline" onClick={() => assignDH(u.userId, document.getElementById(`dh-${u.userId}`)?.value)}>Assign District Head</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
