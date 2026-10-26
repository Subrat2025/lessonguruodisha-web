'use client'
import React, { useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RotateCcw, Loader2 } from 'lucide-react'

const authFetch = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

// Admin: mark a Premium payment refunded (reason required, audited). A refunded
// payment no longer counts for referrals/milestones and triggers reward reversal.
export default function AdminPaymentRefund() {
  const [paymentId, setPaymentId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const submit = async (unrefund) => {
    if (!paymentId.trim()) return toast.error('Enter a payment id / order id')
    if (!reason.trim()) return toast.error('A reason is required')
    if (!window.confirm(`${unrefund ? 'UNREFUND' : 'Mark REFUNDED'} payment ${paymentId}?\nReason: ${reason}`)) return
    setBusy(true); setResult(null)
    try {
      const d = await authFetch('/admin/payment-refund', { method: 'POST', body: JSON.stringify({ paymentId: paymentId.trim(), reason: reason.trim(), unrefund }) })
      setResult(d)
      toast.success(unrefund ? '↩️ Unrefunded' : '✅ Marked refunded — referral rewards reversed where applicable')
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Card className="p-4 rounded-2xl border-2">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 grid place-items-center text-white shadow"><RotateCcw className="w-4 h-4" /></div>
        <div>
          <p className="font-bold text-sm">Mark Premium payment refunded</p>
          <p className="text-[11px] text-muted-foreground">Refunded payments stop counting for referrals/milestones. Reason is required and logged.</p>
        </div>
      </div>
      <label className="text-[11px] font-bold text-muted-foreground">Payment id or Razorpay order id</label>
      <Input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="payment id / order_xxx" className="h-10 rounded-xl mt-1 font-mono" />
      <label className="text-[11px] font-bold text-muted-foreground mt-3 block">Reason (required)</label>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. refunded via Razorpay dashboard" className="h-10 rounded-xl mt-1" />
      <div className="flex gap-2 mt-3">
        <Button onClick={() => submit(false)} disabled={busy} className="flex-1 h-10 rounded-xl font-bold bg-gradient-to-r from-rose-600 to-red-600">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mark refunded'}</Button>
        <Button onClick={() => submit(true)} disabled={busy} variant="outline" className="h-10 rounded-xl font-bold">Undo (unrefund)</Button>
      </div>
      {result && (
        <div className="mt-3 rounded-xl bg-muted p-2.5 text-[12px] font-semibold">
          {result.already ? 'No change — already in that state.' : (result.refunded ? '✅ Refunded.' : '↩️ Unrefunded.')}
          {result.reversal && <span className="ml-1 text-muted-foreground">Reward reversal: {JSON.stringify(result.reversal?.reversed ?? result.reversal?.ok ?? result.reversal)}</span>}
        </div>
      )}
    </Card>
  )
}
