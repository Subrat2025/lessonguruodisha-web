'use client'
// ============================================================================
//  📢 AdminAdsManager — reusable Advertisement / Promotion control panel.
//  Full admin control: ON/OFF, placement, schedule (IST), frequency, content,
//  image (Cloudinary), live preview (desktop/tablet/mobile) and analytics.
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Loader2, Upload, Trash2, Plus, RefreshCw } from 'lucide-react'
import PromoAd from '@/components/PromoAd'

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

const ALL_PLACEMENTS = [
  ['home', '🏠 Home (landing)'], ['dashboard', '📊 Teacher Dashboard'],
  ['store', '🛒 Store listing'], ['library', '🎒 My Library'],
]

const AdminAdsManager = () => {
  const [ads, setAds] = useState([])
  const [selId, setSelId] = useState(null)
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewDevice, setPreviewDevice] = useState('desktop')
  const [analytics, setAnalytics] = useState(null)
  const [diag, setDiag] = useState(null)
  const [range, setRange] = useState('today')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [globalSub, setGlobalSub] = useState(true)
  const [globalSubBusy, setGlobalSubBusy] = useState(false)

  const loadGlobalSub = async () => {
    try { const r = await api('/admin/ads/settings'); setGlobalSub(r.showToSubscribers !== false) } catch {}
  }
  const toggleGlobalSub = async (v) => {
    setGlobalSub(v); setGlobalSubBusy(true)
    try {
      const r = await api('/admin/ads/settings', { method: 'PUT', body: { showToSubscribers: v } })
      setGlobalSub(r.showToSubscribers !== false)
      toast.success(v ? '🟢 Subscribers will see ads (per-ad setting still applies)' : '🔕 Subscribers will NOT see ads (free users & visitors still do)')
    } catch (e) { toast.error(e.message); setGlobalSub(!v) } finally { setGlobalSubBusy(false) }
  }

  const load = async () => {
    setLoading(true)
    try {
      const r = await api('/admin/ads')
      setAds(r.ads || [])
      setSelId(prev => prev || (r.ads?.[0]?.id ?? null))
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { loadGlobalSub() }, [])

  const selected = useMemo(() => ads.find(a => a.id === selId) || null, [ads, selId])
  useEffect(() => { if (selected) setForm(JSON.parse(JSON.stringify(selected))) }, [selId, ads]) // eslint-disable-line

  const loadAnalytics = async (rng = range, c = custom) => {
    if (!selId) return
    try {
      let url = `/admin/ads/${selId}/analytics?range=${rng}`
      if (rng === 'custom') url += `&from=${c.from}&to=${c.to}`
      setAnalytics(await api(url))
    } catch (e) { toast.error(e.message) }
  }
  const loadDiag = async () => {
    if (!selId) return
    try { setDiag(await api(`/admin/ads/${selId}/diagnostics`)) } catch { setDiag(null) }
  }
  useEffect(() => { if (selId) { loadAnalytics('today'); loadDiag() } }, [selId]) // eslint-disable-line

  const setC = (k, v) => setForm(f => ({ ...f, content: { ...f.content, [k]: v } }))
  const setS = (k, v) => setForm(f => ({ ...f, schedule: { ...f.schedule, [k]: v } }))
  const togglePlacement = (p) => setForm(f => {
    const has = (f.placements || []).includes(p)
    return { ...f, placements: has ? f.placements.filter(x => x !== p) : [...(f.placements || []), p] }
  })

  const save = async () => {
    if (!form) return
    setSaving(true)
    try {
      const body = {
        name: form.name, status: form.status, placements: form.placements,
        schedule: form.schedule, frequencyPerDay: form.frequencyPerDay,
        showOncePerSession: form.showOncePerSession, showToSubscribers: form.showToSubscribers !== false,
        content: form.content,
      }
      const r = await api(`/admin/ads/${form.id}`, { method: 'PUT', body })
      toast.success('💾 Campaign saved')
      setAds(prev => prev.map(a => a.id === form.id ? r.ad : a))
      loadDiag()
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const toggleStatus = async () => {
    if (!form) return
    const next = form.status === 'on' ? 'off' : 'on'
    setForm(f => ({ ...f, status: next }))
    try {
      const r = await api(`/admin/ads/${form.id}`, { method: 'PUT', body: { status: next } })
      setAds(prev => prev.map(a => a.id === form.id ? r.ad : a))
      toast.success(next === 'on' ? '🟢 Advertisement is now LIVE (per schedule)' : '🔴 Advertisement disabled')
      loadDiag()
    } catch (e) { toast.error(e.message); setForm(f => ({ ...f, status: form.status })) }
  }

  const onImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !form) return
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file')
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const r = await api(`/admin/ads/${form.id}/image`, { method: 'POST', body: { dataUri: reader.result } })
        setC('imageUrl', r.imageUrl); setC('imagePublicId', r.imagePublicId)
        setAds(prev => prev.map(a => a.id === form.id ? { ...a, content: { ...a.content, imageUrl: r.imageUrl, imagePublicId: r.imagePublicId } } : a))
        toast.success('🖼️ Image updated')
      } catch (err) { toast.error(err.message) } finally { setUploading(false) }
    }
    reader.onerror = () => { setUploading(false); toast.error('Could not read file') }
    reader.readAsDataURL(file)
  }

  const createCampaign = async () => {
    const name = window.prompt('New campaign name:')
    if (!name) return
    try {
      const r = await api('/admin/ads', { method: 'POST', body: { name } })
      await load(); setSelId(r.ad.id); toast.success('Campaign created (OFF)')
    } catch (e) { toast.error(e.message) }
  }
  const removeCampaign = async () => {
    if (!form || !window.confirm(`Delete campaign "${form.name}"? This cannot be undone.`)) return
    try { await api(`/admin/ads/${form.id}`, { method: 'DELETE' }); setSelId(null); await load(); toast.success('Deleted') }
    catch (e) { toast.error(e.message) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-extrabold">📢 Advertisement Management</h2>
        <div className="flex-1" />
        <select value={selId || ''} onChange={(e) => setSelId(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
          {ads.map(a => <option key={a.id} value={a.id}>{a.name} {a.status === 'on' ? '🟢' : '🔴'}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={createCampaign} className="rounded-lg"><Plus className="w-4 h-4 mr-1" /> New</Button>
        <Button size="sm" variant="ghost" onClick={load} className="rounded-lg"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {/* 🌐 Global master switch — applies to EVERY ad */}
      <Card className="p-3.5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-extrabold text-sm">🌐 Show ads to subscribers (global)</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Master switch across ALL ads. When OFF, active subscribers see no ads anywhere — free users and logged-out visitors still do. Each ad also has its own switch; an ad shows to a subscriber only when BOTH are ON.</p>
          </div>
          <Switch checked={globalSub} disabled={globalSubBusy} onCheckedChange={toggleGlobalSub} />
        </div>
      </Card>

      {!form ? (
        <p className="text-muted-foreground text-sm">No campaign selected.</p>
      ) : (
        <>
          {/* Master ON/OFF */}
          <Card className={`p-4 rounded-2xl border-2 ${form.status === 'on' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-rose-300 bg-rose-50 dark:bg-rose-950/20'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-extrabold text-base">{form.status === 'on' ? '🟢 AD ACTIVE' : '🔴 AD DISABLED'}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Master switch — when ON, the ad shows to users according to the schedule below. Changes apply on the next page request (no deploy).</p>
              </div>
              <Button onClick={toggleStatus} className={`rounded-xl font-bold ${form.status === 'on' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white`}>
                {form.status === 'on' ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-3">
            {/* LEFT: settings */}
            <div className="space-y-3">
              <Card className="p-3.5 rounded-2xl space-y-2.5">
                <p className="font-bold text-sm">⚙️ Settings</p>
                <div>
                  <Label className="text-[11px]">Campaign name</Label>
                  <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-[11px]">Placement</Label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {ALL_PLACEMENTS.map(([id, lbl]) => (
                      <label key={id} className={`flex items-center gap-2 text-[12px] rounded-lg border px-2 py-1.5 cursor-pointer ${(form.placements || []).includes(id) ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border'}`}>
                        <input type="checkbox" checked={(form.placements || []).includes(id)} onChange={() => togglePlacement(id)} />
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-[11px]">Start date</Label><Input type="date" value={form.schedule?.startDate || ''} onChange={(e) => setS('startDate', e.target.value)} className="h-9 rounded-lg" /></div>
                  <div><Label className="text-[11px]">End date</Label><Input type="date" value={form.schedule?.endDate || ''} onChange={(e) => setS('endDate', e.target.value)} className="h-9 rounded-lg" /></div>
                  <div><Label className="text-[11px]">Daily start (IST)</Label><Input type="time" value={form.schedule?.dailyStart || ''} onChange={(e) => setS('dailyStart', e.target.value)} className="h-9 rounded-lg" /></div>
                  <div><Label className="text-[11px]">Daily end (IST)</Label><Input type="time" value={form.schedule?.dailyEnd || ''} onChange={(e) => setS('dailyEnd', e.target.value)} className="h-9 rounded-lg" /></div>
                </div>
                <p className="text-[10px] text-muted-foreground">Leave any field blank for no limit on that side. Timezone: Asia/Kolkata (IST).</p>
                <div className="grid grid-cols-2 gap-2 items-end">
                  <div>
                    <Label className="text-[11px]">Impressions / user / day</Label>
                    <select value={form.frequencyPerDay} onChange={(e) => setForm(f => ({ ...f, frequencyPerDay: Number(e.target.value) }))} className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
                      {[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}
                      <option value={0}>Unlimited</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-[12px] pb-2">
                    <Switch checked={!!form.showOncePerSession} onCheckedChange={(v) => setForm(f => ({ ...f, showOncePerSession: v }))} />
                    Show once / session
                  </label>
                </div>
                <label className="flex items-center justify-between gap-2 text-[12px] rounded-lg border px-2.5 py-2 bg-muted/30">
                  <span><b>Show ads to subscribers</b><br /><span className="text-[10px] text-muted-foreground">OFF ⇒ active subscribers won’t see THIS ad (free users & visitors still do)</span></span>
                  <Switch checked={form.showToSubscribers !== false} onCheckedChange={(v) => setForm(f => ({ ...f, showToSubscribers: v }))} />
                </label>
              </Card>

              <Card className="p-3.5 rounded-2xl space-y-2.5">
                <p className="font-bold text-sm">🖼️ Advertisement Image</p>
                {form.content?.imageUrl
                  ? <img src={form.content.imageUrl} alt="ad" className="w-full rounded-xl border max-h-56 object-contain bg-white" />
                  : <div className="w-full h-32 rounded-xl border flex items-center justify-center text-3xl">🖼️</div>}
                <label className="inline-flex">
                  <input type="file" accept="image/*" onChange={onImage} className="hidden" />
                  <span className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer border ${uploading ? 'opacity-60' : 'hover:bg-muted'}`}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload / Replace
                  </span>
                </label>
              </Card>
            </div>

            {/* RIGHT: content */}
            <Card className="p-3.5 rounded-2xl space-y-2.5">
              <p className="font-bold text-sm">✏️ Content</p>
              <div><Label className="text-[11px]">Headline</Label><Input value={form.content?.headline || ''} onChange={(e) => setC('headline', e.target.value)} className="h-9 rounded-lg" /></div>
              <div><Label className="text-[11px]">Subheadline</Label><Input value={form.content?.subheadline || ''} onChange={(e) => setC('subheadline', e.target.value)} className="h-9 rounded-lg" /></div>
              <div><Label className="text-[11px]">Feature lines (one per line)</Label>
                <Textarea rows={5} value={(form.content?.features || []).join('\n')} onChange={(e) => setC('features', e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} className="rounded-lg text-sm" />
              </div>
              <div><Label className="text-[11px]">CTA button text</Label><Input value={form.content?.ctaText || ''} onChange={(e) => setC('ctaText', e.target.value)} className="h-9 rounded-lg" /></div>
              <div className="grid grid-cols-1 gap-2 border-t pt-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Mobile compact copy</p>
                <div><Label className="text-[11px]">Headline (mobile)</Label><Input value={form.content?.headlineMobile || ''} onChange={(e) => setC('headlineMobile', e.target.value)} className="h-9 rounded-lg" /></div>
                <div><Label className="text-[11px]">Subheadline (mobile)</Label><Input value={form.content?.subheadlineMobile || ''} onChange={(e) => setC('subheadlineMobile', e.target.value)} className="h-9 rounded-lg" /></div>
                <div><Label className="text-[11px]">Feature line (mobile)</Label><Input value={form.content?.featuresMobileText || ''} onChange={(e) => setC('featuresMobileText', e.target.value)} className="h-9 rounded-lg" /></div>
              </div>
              <div><Label className="text-[11px]">Destination URL</Label><Input value={form.content?.destinationUrl || ''} onChange={(e) => setC('destinationUrl', e.target.value)} placeholder="https://…" className="h-9 rounded-lg" /></div>
            </Card>
          </div>

          {/* Save / delete */}
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="rounded-xl font-bold flex-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾 Save Campaign'}</Button>
            <Button onClick={removeCampaign} variant="destructive" className="rounded-xl"><Trash2 className="w-4 h-4" /></Button>
          </div>

          {/* Preview */}
          <Card className="p-3.5 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-sm">👁 Preview</p>
              <div className="flex gap-1">
                {['desktop', 'tablet', 'mobile'].map(dv => (
                  <Button key={dv} size="sm" variant={previewDevice === dv ? 'default' : 'outline'} onClick={() => setPreviewDevice(dv)} className="h-7 text-[11px] rounded-full capitalize">{dv}</Button>
                ))}
              </div>
            </div>
            <div className="bg-muted/40 rounded-xl p-3">
              <PromoAd preview previewData={form.content} previewVariant={previewDevice} />
            </div>
          </Card>

          {/* Diagnostics — why is / isn't the ad showing right now */}
          <Card className="p-3.5 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-bold text-sm">🩺 Live Diagnostics</p>
              <Button size="sm" variant="ghost" onClick={loadDiag} className="h-7 rounded-lg"><RefreshCw className="w-3.5 h-3.5" /></Button>
            </div>
            {!diag ? <p className="text-[11px] text-muted-foreground">Save to refresh diagnostics…</p> : (
              <div className="text-[12px] space-y-1.5">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>Status: <b className={diag.statusOn ? 'text-emerald-600' : 'text-rose-600'}>{diag.statusOn ? 'ON' : 'OFF'}</b></span>
                  <span>Now: <b>{diag.nowIST}</b></span>
                  <span>Date: {diag.dateCheck ? '✅' : '❌'}</span>
                  <span>Time: {diag.timeCheck ? '✅' : '❌'}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {(diag.perPlacement || []).map(p => (
                    <div key={p.placement} className={`rounded-lg border px-2 py-1 flex items-center justify-between ${p.visible ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : p.enabled ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : 'border-border opacity-60'}`}>
                      <span className="capitalize font-semibold">{p.placement}</span>
                      <span className="text-[10px]">{p.visible ? '✅ Eligible' : p.enabled ? `❌ ${p.reason}` : 'not selected'}</span>
                    </div>
                  ))}
                </div>
                {!diag.hasImage && <p className="text-[10px] text-amber-600">⚠️ No image set — a text+CTA fallback will show.</p>}
              </div>
            )}
          </Card>

          {/* Analytics */}
          <Card className="p-3.5 rounded-2xl">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="font-bold text-sm">📊 Analytics</p>
              <div className="flex gap-1 flex-wrap">
                {[['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['custom', 'Custom']].map(([r, l]) => (
                  <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => { setRange(r); if (r !== 'custom') loadAnalytics(r) }} className="h-7 text-[11px] rounded-full">{l}</Button>
                ))}
              </div>
            </div>
            {range === 'custom' && (
              <div className="flex gap-2 items-end mb-2">
                <div><Label className="text-[11px]">From</Label><Input type="date" value={custom.from} onChange={(e) => setCustom(c => ({ ...c, from: e.target.value }))} className="h-8 rounded-lg" /></div>
                <div><Label className="text-[11px]">To</Label><Input type="date" value={custom.to} onChange={(e) => setCustom(c => ({ ...c, to: e.target.value }))} className="h-8 rounded-lg" /></div>
                <Button size="sm" onClick={() => loadAnalytics('custom', custom)} className="h-8 rounded-lg">Apply</Button>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              {[['Impressions', analytics?.impressions], ['Clicks', analytics?.clicks], ['CTR', analytics != null ? `${analytics.ctr}%` : undefined], ['Unique', analytics?.uniqueViewers]].map(([l, v]) => (
                <div key={l} className="rounded-xl border p-2.5 text-center">
                  <p className="text-lg font-extrabold">{v ?? '—'}</p>
                  <p className="text-[10px] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </Card>

          <p className="text-[10px] text-muted-foreground text-center">Internal Lesson Guru promotion. Not a Google Ads placement and implies no third-party endorsement.</p>
        </>
      )}
    </div>
  )
}

export default AdminAdsManager
