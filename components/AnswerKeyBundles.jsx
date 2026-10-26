'use client'
// === ANSWER KEY BUNDLES === Teacher UI: buy class bundles, submit papers via slots.
import React, { useCallback, useEffect, useState } from 'react'
import { inNativeApp } from '@/lib/in-app'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Package, Check, Clock, Upload, Loader2 } from 'lucide-react'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : null)
const H = () => { const t = token(); return t ? { Authorization: `Bearer ${t}` } : {} }
const jget = async (p) => { const r = await fetch(`/api${p}`, { headers: H(), cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d }
const jpost = async (p, b) => { const r = await fetch(`/api${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...H() }, body: JSON.stringify(b || {}) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d }
const loadRzp = () => new Promise((res) => { if (window.Razorpay) return res(true); const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = () => res(true); s.onerror = () => res(false); document.body.appendChild(s) })

export default function AnswerKeyBundles({ user }) {
  if (inNativeApp()) return null // bundles are a store: not sold inside the app
  const [exams, setExams] = useState([])
  const [examId, setExamId] = useState('')
  const [products, setProducts] = useState([])
  const [mine, setMine] = useState([])
  const [busy, setBusy] = useState({})
  const [slotFile, setSlotFile] = useState({})

  const load = useCallback(async () => {
    try {
      const e = await jget('/answer-key/bundles/exams'); setExams(e.exams || []); if (!examId && e.exams?.[0]) setExamId(e.exams[0].id)
      const p = await jget('/answer-key/bundles/products'); setProducts(p.products || [])
      const m = await jget('/answer-key/bundles/my'); setMine(m.items || [])
    } catch (_) {}
  }, [examId])
  useEffect(() => { if (user) load() }, [user]) // eslint-disable-line

  const buy = async (prod) => {
    if (!examId) return toast.error('Select an exam first')
    setBusy(b => ({ ...b, [prod.id]: true }))
    try {
      const ok = await loadRzp(); if (!ok) throw new Error('Payment failed to load')
      const o = await jpost('/answer-key/bundles/checkout', { productId: prod.id, examId })
      if (o.overlapClasses?.length) { if (!confirm(`You already have a bundle covering Class ${o.overlapClasses.join(', ')} for this exam. Buy anyway?`)) { setBusy(b => ({ ...b, [prod.id]: false })); return } }
      const rzp = new window.Razorpay({ key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency, name: 'LessonGuru', description: `${prod.nameEnglish} bundle`, prefill: { contact: user?.mobile || '', name: user?.name || '' }, theme: { color: '#ea580c' },
        handler: async (resp) => { try { await jpost('/answer-key/bundles/verify', { razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }); toast.success('Bundle activated!'); load() } catch (e) { toast.error(e.message) } } })
      rzp.open()
    } catch (e) { toast.error(e.message) } finally { setBusy(b => ({ ...b, [prod.id]: false })) }
  }

  const submitSlot = async (bundleId, paperId) => {
    const f = slotFile[`${bundleId}:${paperId}`]
    if (!f) return toast.error('Choose a file first')
    setBusy(b => ({ ...b, [paperId]: true }))
    try {
      const fd = new FormData(); Array.from(f).slice(0, 8).forEach(x => fd.append('files', x)); fd.append('paperId', paperId)
      const r = await fetch(`/api/answer-key/bundles/${bundleId}/submit`, { method: 'POST', headers: H(), body: fd })
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Submit failed')
      toast.success('Submitted! You will get a WhatsApp when ready.'); load()
    } catch (e) { toast.error(e.message) } finally { setBusy(b => ({ ...b, [paperId]: false })) }
  }

  return (
    <div className="space-y-4">
      {exams.length > 0 && (
        <Card className="p-4 rounded-2xl border-2">
          <p className="font-bold text-sm flex items-center gap-2"><Package className="w-4 h-4 text-orange-600" /> Class Bundles</p>
          <p className="text-[11px] text-muted-foreground mb-2">Buy once per exam, then submit every paper for that class free. Unused papers expire with the exam — no refund.</p>
          <select value={examId} onChange={e => { setExamId(e.target.value) }} className="w-full border rounded-lg p-2 text-sm mb-3">
            {exams.map(e => <option key={e.id} value={e.id}>{e.name} (ends {new Date(e.endDate).toLocaleDateString('en-IN')})</option>)}
          </select>
          <div className="grid sm:grid-cols-2 gap-2">
            {products.map(p => (
              <Card key={p.id} className="p-3 rounded-xl border">
                <p className="font-bold text-sm">{p.nameEnglish}</p>
                <p className="text-[10px] text-muted-foreground">{p.paperCount} papers</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-extrabold text-orange-600">₹{p.priceInr}</span>
                  {p.separately > p.priceInr && <span className="text-[11px] text-muted-foreground line-through">₹{p.separately}</span>}
                  {p.saveInr > 0 && <span className="text-[10px] font-bold text-green-600">Save ₹{p.saveInr}</span>}
                </div>
                <Button size="sm" className="w-full rounded-full mt-2" disabled={busy[p.id]} onClick={() => buy(p)}>{busy[p.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buy bundle'}</Button>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {mine.length > 0 && (
        <Card className="p-4 rounded-2xl border-2">
          <p className="font-bold text-sm mb-2">My Bundles</p>
          {mine.map(b => (
            <div key={b.id} className="border rounded-xl p-2 mb-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold">Classes {b.classes.join(', ')}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${b.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{b.status}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{b.slotsUsed}/{b.slotsTotal} papers used · expires {new Date(b.expiresAt).toLocaleDateString('en-IN')}</p>
              {b.status === 'active' && b.slots.map(s => (
                <div key={s.paperId} className="flex items-center gap-2 mt-1 text-[11px]">
                  <span className="flex-1 truncate">Class {s.class} · {s.paperId}</span>
                  {s.used ? <span className="text-emerald-600 flex items-center gap-1"><Check className="w-3 h-3" /> submitted</span> : (
                    <>
                      <input type="file" accept=".pdf,image/*" multiple className="hidden" id={`sf-${b.id}-${s.paperId}`} onChange={e => setSlotFile(m => ({ ...m, [`${b.id}:${s.paperId}`]: e.target.files }))} />
                      <label htmlFor={`sf-${b.id}-${s.paperId}`} className="text-orange-600 cursor-pointer underline">{slotFile[`${b.id}:${s.paperId}`] ? 'file ready' : 'choose'}</label>
                      <Button size="sm" className="h-6 text-[10px] rounded-full" disabled={busy[s.paperId]} onClick={() => submitSlot(b.id, s.paperId)}>{busy[s.paperId] ? '…' : 'Submit'}</Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
