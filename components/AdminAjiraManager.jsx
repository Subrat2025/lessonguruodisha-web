'use client'
// =============================================================================
//  🛠️  Admin — Ajira Pathya Jojana Management
//  ---------------------------------------------------------------------------
//  A single-tab admin surface that lets the admin:
//    • Toggle the whole add-on on/off
//    • Edit ₹99 offer / ₹199 standalone / ₹1499 MRP live
//    • Bulk-upload new HTML lesson-plan books (per class)
//    • Browse, edit and delete individual lesson-day docs
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Save, Upload, Trash2, Pencil, Plus, RefreshCw, Search, X, Gift, UserX, Users } from 'lucide-react'

const CLASSES = [
  { code: 0,  label: 'Balvatika (Pre-Primary)' },
  { code: 1,  label: 'Class 1' },
  { code: 2,  label: 'Class 2' },
  { code: 3,  label: 'Class 3' },
  { code: 4,  label: 'Class 4' },
  { code: 5,  label: 'Class 5' },
  { code: 6,  label: 'Class 6' },
  { code: 7,  label: 'Class 7' },
  { code: 8,  label: 'Class 8' },
  { code: 9,  label: 'Class 9' },
  { code: 10, label: 'Class 10' },
]

// One badge color per class code — Balvatika (0) uses pink, 1-10 wrap around the
// existing 5-tone palette so the list stays scannable at a glance.
const CLASS_BADGE = {
  0: { bg: 'bg-pink-400',    short: 'BV' },
  1: { bg: 'bg-rose-500',    short: 'C1' },
  2: { bg: 'bg-orange-500',  short: 'C2' },
  3: { bg: 'bg-emerald-500', short: 'C3' },
  4: { bg: 'bg-blue-500',    short: 'C4' },
  5: { bg: 'bg-purple-500',  short: 'C5' },
  6: { bg: 'bg-rose-700',    short: 'C6' },
  7: { bg: 'bg-orange-700',  short: 'C7' },
  8: { bg: 'bg-emerald-700', short: 'C8' },
  9: { bg: 'bg-blue-700',    short: 'C9' },
  10:{ bg: 'bg-purple-700',  short: 'C10' },
}

const AdminAjiraManager = ({ api }) => {
  const [tab, setTab] = useState('settings')   // 'settings' | 'lessons' | 'upload' | 'access'
  return (
    <div className="space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'settings', label: '⚙️ Settings & Pricing' },
          { id: 'lessons',  label: '📚 Lesson Plans' },
          { id: 'upload',   label: '📤 Upload HTML' },
          { id: 'access',   label: '🎁 Grant Access' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap border transition ${tab === t.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}
          >{t.label}</button>
        ))}
      </div>
      {tab === 'settings' && <AjiraSettings api={api} />}
      {tab === 'lessons'  && <AjiraLessons  api={api} />}
      {tab === 'upload'   && <AjiraUpload   api={api} />}
      {tab === 'access'   && <AjiraAccessManager api={api} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  ⚙️  Settings & Pricing
// ---------------------------------------------------------------------------
const AjiraSettings = ({ api }) => {
  const [s, setS] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = () => api('/admin/ajira/settings').then(setS).catch(e => toast.error(e?.message || 'Could not load settings'))
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  const save = async () => {
    setSaving(true)
    try {
      await api('/admin/ajira/settings', { method: 'PUT', body: s })
      toast.success('Settings saved')
      load()
    } catch (e) { toast.error(e?.message || 'Save failed') } finally { setSaving(false) }
  }
  if (!s) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
  return (
    <Card className="p-4 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-extrabold">Enable Ajira Pathya Jojana add-on</p>
          <p className="text-[11px] text-muted-foreground">When off, existing purchases stay active but no new checkouts start.</p>
        </div>
        <button
          type="button"
          onClick={() => setS(x => ({ ...x, enabled: !x.enabled }))}
          className={`w-14 h-7 rounded-full relative transition ${s.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
          aria-pressed={s.enabled}
        >
          <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${s.enabled ? 'left-7' : 'left-0.5'}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">₹ Yearly Premium price</Label>
          <Input type="number" min={1} value={s.yearlyAddonPrice || 49} onChange={(e) => setS({ ...s, yearlyAddonPrice: Number(e.target.value) })} className="rounded-xl" />
          <p className="text-[10px] text-muted-foreground mt-0.5">For Yearly Premium users</p>
        </div>
        <div>
          <Label className="text-[11px]">₹ Monthly / Quarterly price</Label>
          <Input type="number" min={1} value={s.addonPrice} onChange={(e) => setS({ ...s, addonPrice: Number(e.target.value) })} className="rounded-xl" />
          <p className="text-[10px] text-muted-foreground mt-0.5">For Monthly/Quarterly users</p>
        </div>
        <div>
          <Label className="text-[11px]">₹ Standalone price</Label>
          <Input type="number" min={1} value={s.standalonePrice} onChange={(e) => setS({ ...s, standalonePrice: Number(e.target.value) })} className="rounded-xl" />
          <p className="text-[10px] text-muted-foreground mt-0.5">For non-subscribers</p>
        </div>
        <div>
          <Label className="text-[11px]">₹ MRP (strike-through)</Label>
          <Input type="number" min={1} value={s.mrpPrice} onChange={(e) => setS({ ...s, mrpPrice: Number(e.target.value) })} className="rounded-xl" />
          <p className="text-[10px] text-muted-foreground mt-0.5">Displayed as ~ ₹1499 ~</p>
        </div>
      </div>

      <div className="rounded-xl bg-muted p-2.5 text-[11px]">
        <p className="font-bold">Pricing preview</p>
        <p>• Yearly Premium → <b>₹{s.yearlyAddonPrice || 49}</b> for 365 days (adds on top of existing yearly validity)</p>
        <p>• Monthly / Quarterly Premium → <b>₹{s.addonPrice}</b> for 365 days (MRP ₹{s.mrpPrice})</p>
        <p>• No subscription → <b>₹{s.standalonePrice}</b> for 365 days (MRP ₹{s.mrpPrice})</p>
      </div>

      <Button onClick={save} disabled={saving} className="w-full h-11 rounded-xl font-bold">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save Changes</>}
      </Button>

      {/* WhatsApp receipt template — test send + copy-paste helper */}
      <TestReceipt api={api} />
    </Card>
  )
}

/**
 * Small helper card inside the Settings tab that lets the admin test-send the
 * `ajira_addon_success` WhatsApp template.  Handy for verifying template
 * approval on Bulkymarketing without needing an actual purchase to happen.
 */
const TestReceipt = ({ api }) => {
  const [mobile, setMobile] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [showTpl, setShowTpl] = useState(false)
  const send = async () => {
    setBusy(true); setResult(null)
    try {
      const r = await api('/admin/ajira/test-receipt', { method: 'POST', body: { mobile } })
      setResult({ ok: true, msg: r.message })
      toast.success(r.message || 'Test receipt sent!')
    } catch (e) {
      setResult({ ok: false, msg: e?.message || 'Send failed', hint: e?.hint })
      toast.error(e?.message || 'Send failed — template may not be approved yet')
    } finally { setBusy(false) }
  }
  const templateBody = `Hi {{1}}, ✅ Your Ajira Pathya Jojana add-on is now active!

💰 Amount paid: {{2}}
📅 Valid till: {{3}}

Open the app and start planning your Panchapadi lessons for Class 1–5.

Need help? Reply to this message.`
  return (
    <div className="rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 p-3 space-y-2 bg-emerald-50/50 dark:bg-emerald-950/20">
      <p className="text-[12.5px] font-extrabold flex items-center gap-1">
        📲 WhatsApp Receipt Template
        <Badge className="bg-emerald-500 text-white text-[9px] ml-1">ajira_addon_success</Badge>
      </p>
      <p className="text-[10.5px] text-muted-foreground">
        Fired automatically after every successful purchase. Test it here to confirm your
        Bulkymarketing/Meta approval.
      </p>
      <div className="flex gap-2">
        <Input
          placeholder="10-digit mobile (default: your admin mobile)"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
          className="rounded-lg h-9 text-sm"
        />
        <Button onClick={send} disabled={busy} className="rounded-xl h-9 font-bold shrink-0">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '📤 Send Test'}
        </Button>
      </div>
      {result && (
        <div className={`text-[11px] rounded-lg p-2 ${result.ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100' : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-100'}`}>
          <p className="font-bold">{result.ok ? '✅ ' : '❌ '}{result.msg}</p>
          {result.hint && <p className="mt-1 text-[10.5px]">{result.hint}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowTpl(v => !v)}
        className="w-full text-left text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
      >
        {showTpl ? '▾' : '▸'} Show template body to submit on Bulkymarketing
      </button>
      {showTpl && (
        <div className="rounded-lg bg-card border p-2.5 space-y-2">
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Category</p>
            <p className="text-[11px] font-mono">UTILITY · en_US · Name: <b>ajira_addon_success</b></p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-2">
              Body
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(templateBody).then(() => toast.success('Copied to clipboard')) }}
                className="text-emerald-700 dark:text-emerald-300 hover:underline"
              >📋 Copy</button>
            </p>
            <pre className="text-[10.5px] whitespace-pre-wrap bg-muted p-2 rounded font-mono leading-snug">{templateBody}</pre>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Sample variables</p>
            <p className="text-[11px] font-mono">
              {'{{1}}'} → <b>Subrat</b> &nbsp;·&nbsp; {'{{2}}'} → <b>₹99</b> &nbsp;·&nbsp; {'{{3}}'} → <b>03 Aug 2027</b>
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Footer (optional)</p>
            <p className="text-[11px]">Lesson Guru Odisha · lessonguruodisha.com</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">URL Button (optional)</p>
            <p className="text-[11px]">Text: <b>Open Ajira Pathya Jojana</b> — URL: <span className="font-mono">https://lessonguruodisha.com/ajira-pathya-jojana</span></p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  📚 Lesson Plans — browse / edit / delete
// ---------------------------------------------------------------------------
const AjiraLessons = ({ api }) => {
  const [filters, setFilters] = useState({ classCode: '1', from: '', to: '' })
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(null)   // full doc being edited

  const load = () => {
    setLoading(true)
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString()
    api(`/admin/ajira/lessons?${qs}&limit=100`)
      .then(d => { setItems(d.items); setTotal(d.total) })
      .catch(e => toast.error(e?.message || 'Load failed'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])

  const del = async (it) => {
    if (!confirm(`Delete lesson plan for Class ${it.classCode} · ${it.dateISO}?`)) return
    try {
      await api(`/admin/ajira/lessons/${it.classCode}/${it.dateISO}`, { method: 'DELETE' })
      toast.success('Deleted')
      load()
    } catch (e) { toast.error(e?.message || 'Delete failed') }
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <Card className="p-3 rounded-2xl grid grid-cols-4 gap-2 items-end">
        <div>
          <Label className="text-[10px]">Class</Label>
          <select value={filters.classCode} onChange={e => setFilters({ ...filters, classCode: e.target.value })} className="w-full h-9 rounded-lg border border-input bg-transparent px-2 text-sm">
            <option value="">All</option>
            {CLASSES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-[10px]">From</Label>
          <Input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} className="rounded-lg h-9" />
        </div>
        <div>
          <Label className="text-[10px]">To</Label>
          <Input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} className="rounded-lg h-9" />
        </div>
        <Button onClick={load} disabled={loading} className="rounded-xl h-9 font-bold">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" /> Filter</>}
        </Button>
      </Card>

      <p className="text-[11px] text-muted-foreground">Showing {items.length} of {total} lesson-day docs</p>

      {/* Rows */}
      <div className="space-y-2 max-h-[520px] overflow-y-auto">
        {items.map(it => (
          <Card key={`${it.classCode}-${it.dateISO}`} className="p-3 rounded-xl">
            <div className="flex items-center gap-2">
              <div className={`w-11 h-11 rounded-lg flex items-center justify-center font-extrabold text-white shrink-0 text-[10.5px] ${(CLASS_BADGE[it.classCode] || CLASS_BADGE[1]).bg}`}>
                {(CLASS_BADGE[it.classCode] || CLASS_BADGE[1]).short}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold truncate">{it.dateText || it.dateISO} · {it.dayName}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Week {it.weekNo} · Teaching day {it.teachingDayNo} · {it.periods?.length || 0} periods
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="outline" onClick={() => setEditing(it)} className="rounded-lg h-8 w-8"><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="outline" onClick={() => del(it)} className="rounded-lg h-8 w-8 text-red-600 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </Card>
        ))}
        {!loading && items.length === 0 && (
          <Card className="p-6 rounded-xl text-center text-muted-foreground">
            <p className="text-sm">No lesson plans match these filters.</p>
          </Card>
        )}
      </div>

      {editing && <LessonEditor doc={editing} api={api} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

// Full-doc editor modal — edits the raw JSON so admins have complete control.
const LessonEditor = ({ doc, api, onClose, onSaved }) => {
  const [text, setText] = useState(JSON.stringify(doc, null, 2))
  const [saving, setSaving] = useState(false)
  const save = async () => {
    let parsed
    try { parsed = JSON.parse(text) } catch { return toast.error('Invalid JSON') }
    setSaving(true)
    try {
      await api('/admin/ajira/lessons', { method: 'POST', body: parsed })
      toast.success('Saved')
      onSaved?.()
    } catch (e) { toast.error(e?.message || 'Save failed') } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3" onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="w-full max-w-2xl bg-card rounded-2xl shadow-2xl border overflow-hidden">
        <div className="p-3 flex items-center justify-between border-b">
          <p className="font-extrabold text-sm">Edit — Class {doc.classCode} · {doc.dateISO}</p>
          <Button size="icon" variant="ghost" onClick={onClose} className="rounded-full h-8 w-8"><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-3">
          <p className="text-[10.5px] text-muted-foreground mb-1">Edit the full JSON below. Careful — periods, panchapadi, codes, everything.</p>
          <Textarea value={text} onChange={e => setText(e.target.value)} rows={22} className="font-mono text-[10.5px] rounded-xl" />
        </div>
        <div className="p-3 border-t flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={save} disabled={saving} className="rounded-xl font-bold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" /> Save</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  📤 Upload HTML — bulk-import a new lesson-plan book
// ---------------------------------------------------------------------------
const AjiraUpload = ({ api }) => {
  const [classCode, setClassCode] = useState('1')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const submit = async () => {
    if (!file) return toast.error('Choose an HTML file first')
    setUploading(true); setResult(null)
    try {
      // FormData path — needs raw fetch (the `api` helper is JSON-only).
      const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : ''
      const fd = new FormData()
      fd.append('file', file); fd.append('classCode', classCode)
      const res = await fetch('/api/admin/ajira/upload-html', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      setResult(data)
      toast.success(`Imported ${data.parsed} lesson-day docs`)
    } catch (e) { toast.error(e?.message || 'Upload failed') } finally { setUploading(false) }
  }
  return (
    <Card className="p-4 rounded-2xl space-y-3">
      <p className="text-[13px] font-extrabold">📤 Upload a Class Lesson Plan Book</p>
      <p className="text-[11px] text-muted-foreground">
        Upload the HTML lesson-plan book generated by SCERT/OSEPA. The importer will parse every
        <b> ଦୈନିକ ପାଠ ଯୋଜନା</b> page and upsert (class, date) into the lesson store.
      </p>
      <div>
        <Label className="text-[11px]">Class</Label>
        <select value={classCode} onChange={e => setClassCode(e.target.value)} className="w-full h-10 rounded-lg border border-input bg-transparent px-2 text-sm font-bold">
          {CLASSES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <Label className="text-[11px]">HTML file</Label>
        <Input type="file" accept=".html,text/html" onChange={e => setFile(e.target.files?.[0] || null)} className="rounded-lg" />
        {file && <p className="text-[10px] text-muted-foreground mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}
      </div>
      <Button onClick={submit} disabled={uploading || !file} className="w-full h-11 rounded-xl font-bold">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4 mr-1.5" /> Import Now</>}
      </Button>
      {result && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-[11px]">
          <p className="font-bold text-emerald-700 dark:text-emerald-200">✅ Import successful</p>
          <p>Parsed {result.parsed} plans · {result.upsert} new · {result.modified} updated</p>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
//  🎁 Grant Access — single & bulk activation + revoke + active list
// ---------------------------------------------------------------------------
const PLAN_TYPES = [
  { id: 'monthly',      label: 'Monthly Premium'    },
  { id: 'quarterly',    label: 'Quarterly Premium'  },
  { id: 'half-yearly',  label: 'Half-Yearly Premium' },
  { id: 'yearly',       label: 'Yearly Premium'     },
  { id: 'all-premium',  label: '🌟 All active Premium users' },
  { id: 'none',         label: '❌ Users with no subscription' },
  { id: 'all-users',    label: '🌍 EVERYONE (except admins)' },
]
const DAY_PRESETS = [
  { id: 30,   label: '30 days'  },
  { id: 90,   label: '90 days'  },
  { id: 180,  label: '180 days' },
  { id: 365,  label: '365 days (1 year)' },
  { id: 730,  label: '730 days (2 years)' },
]

const AjiraAccessManager = ({ api }) => {
  return (
    <div className="space-y-3">
      <CheckUserCard api={api} />
      <SingleGrantCard api={api} />
      <BulkGrantCard api={api} />
      <RevokeCard api={api} />
      <ActiveAddonsList api={api} />
    </div>
  )
}

// 🔎 Check User — one-glance diagnostic (user + subscription + access + addon
// history + payment history) for any mobile number.  Solves "user paid but I
// can't find them in the list" confusion.
const CheckUserCard = ({ api }) => {
  const [mobile, setMobile] = useState('')
  const [busy, setBusy]     = useState(false)
  const [data, setData]     = useState(null)
  const submit = async () => {
    const m = String(mobile).replace(/\D/g, '').slice(-10)
    if (m.length !== 10) return toast.error('Enter a valid 10-digit mobile number.')
    setBusy(true); setData(null)
    try {
      const r = await api(`/admin/ajira/check?mobile=${m}`)
      setData(r)
    } catch (e) { toast.error(e?.message || 'Lookup failed') } finally { setBusy(false) }
  }
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'
  const dt = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
  const accessLabel = (src) => ({
    'admin':                    { txt: '👑 Admin (free access)',            cls: 'bg-purple-100 text-purple-700 border-purple-300' },
    'yearly-premium':           { txt: '🔒 Paywalled — Yearly (₹yearlyAddonPrice)', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
    'addon':                    { txt: '🎁 Active Addon',                   cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
    'premium-monthly-quarterly':{ txt: '🔒 Paywalled — Monthly/Quarterly (₹addonPrice)', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
    'no-subscription':          { txt: '🔒 Paywalled — No Sub (₹standalone)', cls: 'bg-red-100 text-red-700 border-red-300' },
    'disabled':                 { txt: '❌ Add-on disabled globally',        cls: 'bg-slate-200 text-slate-700 border-slate-300' },
  }[src] || { txt: src, cls: 'bg-muted' })
  return (
    <Card className="p-4 rounded-2xl space-y-3 border-2 border-sky-200 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-900/60">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-sky-600" />
        <p className="text-[13px] font-extrabold">Check user access · diagnostic</p>
      </div>
      <p className="text-[11px] text-muted-foreground">Type any user mobile to see if they exist, what unlocks their Ajira access, their full addon history, and every Ajira payment (created / success / failed).</p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-[11px]">Mobile (10 digits)</Label>
          <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="9124601131" className="rounded-lg" maxLength={10} />
        </div>
        <Button onClick={submit} disabled={busy || !mobile} className="h-10 rounded-xl font-bold bg-sky-600 hover:bg-sky-700 text-white">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" /> Check</>}
        </Button>
      </div>

      {data && !data.found && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-800 p-3">
          <p className="text-[12px] font-bold text-red-700 dark:text-red-200">❌ No user found for mobile <span className="font-mono">{data.mobile}</span></p>
          <p className="text-[10.5px] text-muted-foreground mt-0.5">This mobile is not registered on lessonguruodisha.com yet.</p>
        </div>
      )}

      {data && data.found && (
        <div className="space-y-2">
          {/* User summary */}
          <div className="rounded-xl border-2 border-sky-300 bg-white dark:bg-slate-900 p-3">
            <p className="text-[12px] font-bold">{data.user.name || '(no name)'} · <span className="font-mono">{data.user.mobile}</span></p>
            <p className="text-[10.5px] text-muted-foreground">
              Role: {data.user.role} · Sub: <b>{data.user.subscription?.plan || 'none'}</b>
              {data.user.subscription?.status ? ` (${data.user.subscription.status})` : ''}
              {data.user.subscription?.expiryDate ? ` · till ${dt(data.user.subscription.expiryDate)}` : ''}
            </p>
          </div>

          {/* Current access */}
          <div className="rounded-xl border-2 border-border p-3 bg-card">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Current Ajira Access</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${accessLabel(data.access.source).cls}`}>
                {accessLabel(data.access.source).txt}
              </span>
              <span className="text-[11px] font-bold">
                {data.access.hasAccess ? '✅ Unlocked' : '🔒 Locked'}
              </span>
              {!data.access.hasAccess && data.access.priceRupees ? (
                <span className="text-[10.5px] text-muted-foreground">· needs ₹{data.access.priceRupees}</span>
              ) : null}
            </div>
          </div>

          {/* Addon records */}
          <div className="rounded-xl border-2 border-border p-3 bg-card">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Addon records ({data.addons.length})</p>
            {data.addons.length === 0 && <p className="text-[10.5px] text-muted-foreground">No addon rows for this user.</p>}
            {data.addons.map(a => (
              <div key={a.id} className="text-[10.5px] py-1 border-b border-border last:border-0">
                <div>
                  <b className="uppercase text-[9.5px]">{a.status}</b>
                  {' · '}src=<span className="font-mono">{a.source}</span>
                  {a.amount ? ` · ₹${a.amount}` : ''}
                  {a.grantedDays ? ` · ${a.grantedDays}d` : ''}
                  {a.grantedByName ? ` · by ${a.grantedByName}` : ''}
                </div>
                <div className="text-muted-foreground">Purchased: {dt(a.purchasedAt)} · Expires: {dt(a.expiresAt)}</div>
              </div>
            ))}
          </div>

          {/* Payment records */}
          <div className="rounded-xl border-2 border-border p-3 bg-card">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment records ({data.payments.length})</p>
            {data.payments.length === 0 && <p className="text-[10.5px] text-muted-foreground">No Ajira payments for this user.</p>}
            {data.payments.map(p => (
              <div key={p.id} className="text-[10.5px] py-1 border-b border-border last:border-0">
                <div>
                  <b className="uppercase text-[9.5px]">{p.status}</b>
                  {' · ₹'}{p.amount}
                  {' · '}<span className="font-mono">{p.razorpay_order_id?.slice(0,20)}…</span>
                </div>
                <div className="text-muted-foreground">Created: {fmt(p.createdAt)}{p.verifiedAt ? ` · Verified: ${fmt(p.verifiedAt)}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

const SingleGrantCard = ({ api }) => {
  const [mobile, setMobile]   = useState('')
  const [days, setDays]       = useState(365)
  const [saving, setSaving]   = useState(false)
  const submit = async () => {
    const m = String(mobile).replace(/\D/g, '').slice(-10)
    if (m.length !== 10) return toast.error('Enter a valid 10-digit mobile number.')
    setSaving(true)
    try {
      const r = await api('/admin/ajira/grant', { method: 'POST', body: { mobile: m, days: Number(days) } })
      const expiry = new Date(r?.addon?.expiresAt || Date.now()).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
      toast.success(`✅ Granted to ${r?.user?.name || r?.user?.mobile}. Valid till ${expiry}.`)
      setMobile('')
    } catch (e) { toast.error(e?.message || 'Grant failed') } finally { setSaving(false) }
  }
  return (
    <Card className="p-4 rounded-2xl space-y-3">
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-emerald-600" />
        <p className="text-[13px] font-extrabold">Grant to a single user</p>
      </div>
      <p className="text-[11px] text-muted-foreground">Search by 10-digit mobile. The addon adds days on top of any existing validity.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-[11px]">Mobile (10 digits)</Label>
          <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="9999999999" className="rounded-lg" maxLength={10} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-[11px]">Validity</Label>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="w-full h-10 rounded-lg border border-input bg-transparent px-2 text-sm font-bold">
            {DAY_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <Button onClick={submit} disabled={saving || !mobile} className="w-full h-10 rounded-xl font-bold">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Gift className="w-4 h-4 mr-1.5" /> Grant Access</>}
      </Button>
    </Card>
  )
}

const BulkGrantCard = ({ api }) => {
  const [planType, setPlanType] = useState('monthly')
  const [days, setDays]         = useState(365)
  const [saving, setSaving]     = useState(false)
  const [result, setResult]     = useState(null)
  const submit = async () => {
    const label = PLAN_TYPES.find(p => p.id === planType)?.label || planType
    if (!window.confirm(`Grant ${days}-day Ajira access to: "${label}"?\n\nThis cannot be un-done in bulk (only per-user Revoke).`)) return
    setSaving(true); setResult(null)
    try {
      const r = await api('/admin/ajira/grant-bulk', { method: 'POST', body: { planType, days: Number(days) } })
      setResult(r)
      toast.success(`✅ Bulk-granted to ${r?.totalUsers || 0} users`)
    } catch (e) { toast.error(e?.message || 'Bulk grant failed') } finally { setSaving(false) }
  }
  return (
    <Card className="p-4 rounded-2xl space-y-3 border-2 border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/60">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-amber-600" />
        <p className="text-[13px] font-extrabold">Bulk grant by subscriber type</p>
      </div>
      <p className="text-[11px] text-muted-foreground">Grants Ajira addon in one shot to every user matching the selected subscription plan type. Use with care.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-[11px]">Target group</Label>
          <select value={planType} onChange={e => setPlanType(e.target.value)} className="w-full h-10 rounded-lg border border-input bg-transparent px-2 text-sm font-bold">
            {PLAN_TYPES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-[11px]">Validity</Label>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="w-full h-10 rounded-lg border border-input bg-transparent px-2 text-sm font-bold">
            {DAY_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <Button onClick={submit} disabled={saving} className="w-full h-10 rounded-xl font-bold bg-amber-600 hover:bg-amber-700 text-white">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Users className="w-4 h-4 mr-1.5" /> Bulk Grant Now</>}
      </Button>
      {result && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-[11px]">
          <p className="font-bold text-emerald-700 dark:text-emerald-200">✅ Bulk grant complete</p>
          <p>Total users: {result.totalUsers} · Newly granted: {result.newlyGranted} · Extended (already had addon): {result.extended}</p>
        </div>
      )}
    </Card>
  )
}

const RevokeCard = ({ api }) => {
  const [mobile, setMobile] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    const m = String(mobile).replace(/\D/g, '').slice(-10)
    if (m.length !== 10) return toast.error('Enter a valid 10-digit mobile number.')
    if (!window.confirm(`Revoke Ajira addon for +91 ${m}?`)) return
    setSaving(true)
    try {
      const r = await api('/admin/ajira/revoke', { method: 'POST', body: { mobile: m } })
      toast.success(`✅ Revoked ${r?.revoked || 0} addon record(s) for ${r?.user?.name || r?.user?.mobile}`)
      setMobile('')
    } catch (e) { toast.error(e?.message || 'Revoke failed') } finally { setSaving(false) }
  }
  return (
    <Card className="p-4 rounded-2xl space-y-3 border-2 border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/60">
      <div className="flex items-center gap-2">
        <UserX className="w-4 h-4 text-red-600" />
        <p className="text-[13px] font-extrabold">Revoke access for a user</p>
      </div>
      <p className="text-[11px] text-muted-foreground">Marks all active Ajira addon records for this user as revoked. The user will see the paywall on next reload.</p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-[11px]">Mobile (10 digits)</Label>
          <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="9999999999" className="rounded-lg" maxLength={10} />
        </div>
        <Button onClick={submit} disabled={saving || !mobile} variant="destructive" className="h-10 rounded-xl font-bold">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserX className="w-4 h-4 mr-1.5" /> Revoke</>}
        </Button>
      </div>
    </Card>
  )
}

const ActiveAddonsList = ({ api }) => {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    try {
      const r = await api(`/admin/ajira/addons?q=${encodeURIComponent(q)}&status=${status}&limit=100`)
      setItems(r?.items || []); setTotal(r?.total || 0)
    } catch (e) { toast.error(e?.message || 'Failed to load') } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [status])
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'
  const sourceEmoji = (s) => {
    if (s === 'admin-grant')       return '🎁'
    if (s === 'admin-grant-bulk')  return '🎯'
    if (s === 'webhook')           return '💳'
    if (s === 'verify-recovery')   return '🩹'
    return '💳'
  }
  return (
    <Card className="p-4 rounded-2xl space-y-3">
      <div className="flex items-center gap-2 justify-between">
        <p className="text-[13px] font-extrabold flex items-center gap-1.5"><Search className="w-4 h-4" /> Active Ajira Addons</p>
        <Badge variant="secondary" className="rounded-full">{total} {status === 'all' ? 'total' : status}</Badge>
      </div>
      <div className="flex gap-2 flex-wrap">
        {['active', 'superseded', 'revoked', 'all'].map(s => (
          <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${status === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>{s}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name / mobile / email" className="rounded-lg" />
        <Button onClick={load} disabled={loading} variant="outline" className="rounded-xl h-10">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" /> Search</>}
        </Button>
      </div>
      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {items.map((a) => (
          <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border">
            <div className="text-lg" title={a.source}>{sourceEmoji(a.source)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold truncate">{a.user?.name || '(no name)'} · <span className="font-mono">{a.user?.mobile || '—'}</span></p>
              <p className="text-[10px] text-muted-foreground truncate">
                Expires: <b>{fmt(a.expiresAt)}</b>{a.grantedByName ? ` · by ${a.grantedByName}` : ''}{a.amount ? ` · ₹${a.amount}` : ''}
                {a.user?.subscription?.plan ? ` · Plan: ${a.user.subscription.plan}` : ''}
              </p>
            </div>
            {a.status === 'active' && (
              <Button size="sm" variant="ghost" className="rounded-lg h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40" onClick={async () => {
                if (!window.confirm(`Revoke this addon for ${a.user?.mobile}?`)) return
                try {
                  await api('/admin/ajira/revoke', { method: 'POST', body: { mobile: a.user?.mobile } })
                  toast.success('Revoked')
                  load()
                } catch (e) { toast.error(e?.message || 'Revoke failed') }
              }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
        {!loading && !items.length && (
          <p className="text-center text-[11px] text-muted-foreground py-6">No addons found for the current filter.</p>
        )}
      </div>
    </Card>
  )
}

export default AdminAjiraManager
