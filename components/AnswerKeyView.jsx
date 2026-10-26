'use client'
// ============================================================================
// === ANSWER KEY FEATURE === Teacher UI: submit, list, blurred preview,
// unlock (Razorpay / free), view + download. All private & owner-only.
// ============================================================================
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { inNativeApp } from '@/lib/in-app'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Upload, FileText, Lock, Unlock, Download, Clock, CheckCircle2, XCircle, Trash2, Loader2 } from 'lucide-react'
import AnswerKeyBundles from '@/components/AnswerKeyBundles'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : null)
const authHeaders = () => { const t = token(); return t ? { Authorization: `Bearer ${t}` } : {} }
const jget = async (p) => { const r = await fetch(`/api${p}`, { headers: authHeaders(), cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d }
const jpost = async (p, body) => { const r = await fetch(`/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body || {}) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d }
const blobFetch = async (p) => { const r = await fetch(`/api${p}`, { headers: authHeaders(), cache: 'no-store' }); if (!r.ok) throw new Error('fetch failed'); return await r.blob() }

const STATUS = {
  submitted:    { label: 'Submitted',   cls: 'bg-blue-100 text-blue-700',     Icon: Clock },
  in_progress:  { label: 'In progress', cls: 'bg-indigo-100 text-indigo-700', Icon: Loader2 },
  ready_locked: { label: 'Ready — Locked', cls: 'bg-amber-100 text-amber-700', Icon: Lock },
  unlocked:     { label: 'Unlocked',    cls: 'bg-emerald-100 text-emerald-700', Icon: Unlock },
  rejected:     { label: 'Rejected',    cls: 'bg-red-100 text-red-700',       Icon: XCircle },
  cancelled:    { label: 'Cancelled',   cls: 'bg-slate-100 text-slate-500',   Icon: XCircle },
  refunded:     { label: 'Refunded',    cls: 'bg-slate-100 text-slate-500',   Icon: XCircle },
}

const loadRazorpay = () => new Promise((resolve) => {
  if (window.Razorpay) return resolve(true)
  const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'
  s.onload = () => resolve(true); s.onerror = () => resolve(false); document.body.appendChild(s)
})

// Self-contained menu entry — renders ONLY when the master switch is ON,
// so the feature stays invisible to teachers until admin enables it.
export function AnswerKeyMenuCard({ onOpen }) {
  const [show, setShow] = useState(false)
  useEffect(() => { jget('/answer-key/my').then(d => setShow(!!d.enabled)).catch(() => setShow(false)) }, [])
  if (!show) return null
  return (
    <div onClick={onOpen} className="p-4 rounded-2xl border-2 cursor-pointer flex items-center gap-3 bg-card">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow"><FileText className="w-4 h-4" /></div>
      <div className="flex-1"><div className="font-semibold">ଉତ୍ତର ସୂଚୀ / Answer Key</div><div className="text-[10px] text-muted-foreground">Upload a question paper, get the answer key prepared</div></div>
    </div>
  )
}

export default function AnswerKeyView({ user }) {
  const [data, setData] = useState(null)
  const [files, setFiles] = useState([])
  const [form, setForm] = useState({ class: '', subject: '', examName: '', language: '', userNote: '' })
  const [submitting, setSubmitting] = useState(false)
  const [previews, setPreviews] = useState({})   // id -> objectURL
  const [upsells, setUpsells] = useState({})      // id -> bundle upsell info | null
  const [viewUrl, setViewUrl] = useState(null)
  const [busy, setBusy] = useState({})
  const fileRef = useRef(null)

  const load = useCallback(async () => { try { setData(await jget('/answer-key/my')) } catch (e) { /* silent */ } }, [])
  useEffect(() => { if (user) load() }, [user, load])

  // lazily load blurred previews for ready_locked items
  useEffect(() => {
    (data?.items || []).forEach(async (it) => {
      if (it.hasPreview && !previews[it.id]) {
        try { const b = await blobFetch(`/answer-key/${it.id}/preview`); setPreviews(p => ({ ...p, [it.id]: URL.createObjectURL(b) })) } catch (_) {}
      }
    })
  }, [data]) // eslint-disable-line

  // lazily load the bundle upsell for each locked single key
  useEffect(() => {
    (data?.items || []).forEach(async (it) => {
      if (it.status === 'ready_locked' && upsells[it.id] === undefined) {
        try { const r = await jget(`/answer-key/${it.id}/upsell`); setUpsells(u => ({ ...u, [it.id]: r.upsell || null })) }
        catch (_) { setUpsells(u => ({ ...u, [it.id]: null })) }
      }
    })
  }, [data]) // eslint-disable-line

  const buyBundleUpsell = async (it, up) => {
    setBusy(b => ({ ...b, [`up-${it.id}`]: true }))
    try {
      const ok = await loadRazorpay(); if (!ok) throw new Error('Could not load payment. Check your connection.')
      const o = await jpost('/answer-key/bundles/checkout', { productId: up.productId, examId: up.examId })
      if (o.overlapClasses?.length) { if (!confirm(`You already have a bundle covering Class ${o.overlapClasses.join(', ')} for this exam. Buy anyway?`)) { setBusy(b => ({ ...b, [`up-${it.id}`]: false })); return } }
      const rzp = new window.Razorpay({
        key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency,
        name: 'LessonGuru', description: `${up.nameEnglish} bundle`,
        prefill: { contact: user?.mobile || '', name: user?.name || '' }, theme: { color: '#ea580c' },
        handler: async (resp) => {
          try { await jpost('/answer-key/bundles/verify', { razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }); toast.success('Bundle activated! Submit your papers under “My Bundles”.'); load() }
          catch (e) { toast.error(e.message + ' — if money was debited it will activate shortly.') }
        },
      })
      rzp.open()
    } catch (e) { toast.error(e.message) } finally { setBusy(b => ({ ...b, [`up-${it.id}`]: false })) }
  }

  const submit = async () => {
    if (!form.class.trim() || !form.subject.trim()) return toast.error('Class and Subject are required')
    if (!files.length) return toast.error('Upload a PDF or photos')
    setSubmitting(true)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      Object.entries(form).forEach(([k, v]) => fd.append(k, v))
      const r = await fetch('/api/answer-key/submit', { method: 'POST', headers: authHeaders(), body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Submit failed')
      toast.success(`Submitted! Ready within ${d.turnaroundHours || 24} hours. We'll WhatsApp you.`)
      setFiles([]); setForm({ class: '', subject: '', examName: '', language: '', userNote: '' }); if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (e) { toast.error(e.message) } finally { setSubmitting(false) }
  }

  const cancel = async (id) => { if (!confirm('Cancel this request?')) return; try { await jpost(`/answer-key/${id}/cancel`); toast.success('Cancelled'); load() } catch (e) { toast.error(e.message) } }

  const unlockPaid = async (it) => {
    setBusy(b => ({ ...b, [it.id]: true }))
    try {
      const ok = await loadRazorpay(); if (!ok) throw new Error('Could not load payment. Check your connection.')
      const o = await jpost(`/answer-key/${it.id}/checkout`)
      const rzp = new window.Razorpay({
        key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency,
        name: 'LessonGuru', description: `Answer Key — ${it.class} ${it.subject}`,
        prefill: { contact: user?.mobile || '', name: user?.name || '' },
        theme: { color: '#ea580c' },
        handler: async (resp) => {
          try {
            await jpost(`/answer-key/${it.id}/verify`, { razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature })
            toast.success('Unlocked! You can now view & download.'); load()
          } catch (e) { toast.error(e.message + ' — if money was debited it will unlock shortly.') }
        },
      })
      rzp.open()
    } catch (e) { toast.error(e.message) } finally { setBusy(b => ({ ...b, [it.id]: false })) }
  }

  const unlockFree = async (it) => { setBusy(b => ({ ...b, [it.id]: true })); try { await jpost(`/answer-key/${it.id}/unlock-free`); toast.success('Unlocked free!'); load() } catch (e) { toast.error(e.message) } finally { setBusy(b => ({ ...b, [it.id]: false })) } }

  const getPdfBlob = async (it) => { const t = await jpost(`/answer-key/${it.id}/download-token`); return await blobFetch(`/answer-key/download?token=${encodeURIComponent(t.token)}`) }
  const view = async (it) => { try { const b = await getPdfBlob(it); setViewUrl(URL.createObjectURL(b)) } catch (e) { toast.error(e.message) } }
  const download = async (it) => {
    try { const b = await getPdfBlob(it); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `answer-key-${it.class}-${it.subject}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); load() }
    catch (e) { toast.error(e.message) }
  }

  if (!data) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> Loading…</div>
  if (!data.enabled) return <div className="p-8 text-center text-muted-foreground">This feature is not available yet.</div>

  const s = data.settings || {}
  return (
    <div className="container max-w-3xl py-4 space-y-5">
      <div>
        <h1 className="text-xl font-black flex items-center gap-2"><FileText className="w-5 h-5 text-orange-600" /> ଉତ୍ତର ସୂଚୀ / Answer Key</h1>
        <p className="text-xs text-muted-foreground mt-1">Upload a question paper. Our team prepares the answer key within {s.turnaroundHours || 24} hours. Unlock for ₹{s.standardPriceInr} (₹{s.longPriceInr} for long papers).</p>
      </div>

      {/* Submit */}
      <Card className="p-4 rounded-2xl border-2 space-y-3">
        <p className="font-bold text-sm">New request</p>
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer hover:bg-muted/40 transition">
          <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
          <p className="text-sm font-semibold">{files.length ? `${files.length} file(s) selected` : 'Tap to upload PDF or up to 8 photos'}</p>
          <p className="text-[11px] text-muted-foreground">PDF / JPG / PNG / WEBP / HEIC · max 10 MB total</p>
          <input ref={fileRef} type="file" accept=".pdf,image/*" multiple className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 8))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-[11px]">Class *</Label><Input value={form.class} onChange={e => setForm(f => ({ ...f, class: e.target.value }))} placeholder="e.g. Class VII" /></div>
          <div><Label className="text-[11px]">Subject *</Label><Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Science" /></div>
          <div><Label className="text-[11px]">Exam name</Label><Input value={form.examName} onChange={e => setForm(f => ({ ...f, examName: e.target.value }))} placeholder="optional" /></div>
          <div><Label className="text-[11px]">Language</Label><Input value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} placeholder="Odia / English / Hindi" /></div>
        </div>
        <div><Label className="text-[11px]">Note to admin</Label><Textarea rows={2} value={form.userNote} onChange={e => setForm(f => ({ ...f, userNote: e.target.value }))} placeholder="optional" /></div>
        <Button onClick={submit} disabled={submitting} className="w-full rounded-full">{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit request'}</Button>
      </Card>

      {/* Class bundles (Phase F) */}
      <AnswerKeyBundles user={user} />

      {/* My list */}
      <div className="space-y-2">
        <p className="font-bold text-sm">My Answer Keys ({data.items.length})</p>
        {data.items.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No requests yet.</p>}
        {data.items.map(it => {
          const st = STATUS[it.status] || STATUS.submitted
          return (
            <Card key={it.id} className="p-3 rounded-2xl border-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{it.class} · {it.subject}{it.examName ? ` · ${it.examName}` : ''}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(it.submittedAt).toLocaleDateString('en-IN')}{it.answerPageCount ? ` · ${it.answerPageCount} pages` : ''}{it.priceInr ? ` · ₹${it.priceInr}` : ''}</p>
                  {it.status === 'rejected' && it.rejectReason && <p className="text-[11px] text-red-600 mt-1">Reason: {it.rejectReason}</p>}
                </div>
                <span className={`text-[10px] font-black px-2 py-1 rounded-full ${st.cls}`}>{st.label}</span>
              </div>

              {it.status === 'ready_locked' && (
                <div className="mt-2">
                  {previews[it.id]
                    ? <img src={previews[it.id]} alt="Blurred preview" className="w-full max-w-[280px] rounded-lg border mx-auto select-none pointer-events-none" draggable={false} />
                    : <div className="h-28 bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground"><Lock className="w-4 h-4 mr-1" /> preview…</div>}
                  <div className="flex gap-2 mt-2">
                    {!inNativeApp() && <Button onClick={() => unlockPaid(it)} disabled={busy[it.id]} className="flex-1 rounded-full">{busy[it.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Unlock for ₹{it.priceInr}</>}</Button>}
                    {data.freeEligible && <Button variant="outline" onClick={() => unlockFree(it)} disabled={busy[it.id]} className="rounded-full">Free</Button>}
                  </div>
                  {upsells[it.id] && !inNativeApp() && (
                    <div className="mt-2 p-2.5 rounded-xl bg-orange-50 border border-orange-200">
                      <p className="text-[12px] font-extrabold text-orange-700">Get all Class {upsells[it.id].classNum} papers for ₹{upsells[it.id].priceInr}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{upsells[it.id].paperCount} papers this term{upsells[it.id].saveInr > 0 ? ` · save ₹${upsells[it.id].saveInr} vs separate` : ''} · {upsells[it.id].examName}</p>
                      <Button size="sm" variant="outline" className="w-full rounded-full mt-1.5 border-orange-300 text-orange-700 hover:bg-orange-100" disabled={busy[`up-${it.id}`]} onClick={() => buyBundleUpsell(it, upsells[it.id])}>{busy[`up-${it.id}`] ? <Loader2 className="w-4 h-4 animate-spin" /> : `Get the bundle · ₹${upsells[it.id].priceInr}`}</Button>
                    </div>
                  )}
                </div>
              )}

              {it.status === 'unlocked' && (
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" onClick={() => view(it)} className="flex-1 rounded-full"><FileText className="w-4 h-4 mr-1" /> View</Button>
                  <Button onClick={() => download(it)} className="flex-1 rounded-full"><Download className="w-4 h-4 mr-1" /> Download PDF</Button>
                </div>
              )}

              {it.status === 'submitted' && <Button variant="ghost" size="sm" onClick={() => cancel(it.id)} className="mt-1 text-red-600 h-7 text-xs"><Trash2 className="w-3 h-3 mr-1" /> Cancel</Button>}
            </Card>
          )
        })}
      </div>

      {viewUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={() => { URL.revokeObjectURL(viewUrl); setViewUrl(null) }}>
          <div className="bg-white rounded-xl w-full max-w-3xl h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-2 border-b"><span className="text-sm font-bold px-2">Answer Key</span><Button size="sm" variant="ghost" onClick={() => { URL.revokeObjectURL(viewUrl); setViewUrl(null) }}>Close</Button></div>
            <iframe src={viewUrl} title="Answer Key" className="w-full h-[calc(85vh-44px)]" />
          </div>
        </div>
      )}
    </div>
  )
}
