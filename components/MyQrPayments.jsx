'use client'
/**
 * MyQrPayments — teacher-facing history of manual "Pay by QR Code" (UPI/UTR)
 * subscription payments.  Purely additive: only READS the user's own records
 * from GET /api/qr-payment/my.  Lives under Profile → "My QR Payments".
 */
import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowLeft, RefreshCw, QrCode, Loader2, CheckCircle2, Clock,
  XCircle, Copy, ReceiptText, Crown,
} from 'lucide-react'

const api = async (url, opts = {}) => {
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

const STATUS_META = {
  PENDING:   { label: 'Pending Verification', icon: Clock,        cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',   note: '⏳ Our team is verifying your payment. This usually takes a few hours.' },
  VERIFIED:  { label: 'Verified & Activated',  icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300', note: '✅ Your subscription has been activated.' },
  REJECTED:  { label: 'Rejected',              icon: XCircle,      cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',           note: '❌ This payment could not be verified. Please contact support.' },
  CANCELLED: { label: 'Cancelled',             icon: XCircle,      cls: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',          note: 'This request was cancelled.' },
}

const fmtDate = (v) => {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return String(v) }
}
const fmtDateTime = (v) => {
  if (!v) return '—'
  try { return new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return String(v) }
}

const MyQrPayments = ({ onBack }) => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api('/qr-payment/my')
      setRows(Array.isArray(r?.payments) ? r.payments : [])
    } catch (e) {
      toast.error(e?.message || 'Failed to load payments')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const copy = (txt, label) => {
    try {
      navigator.clipboard?.writeText(String(txt || ''))
      toast.success(`${label} copied`)
    } catch { /* ignore */ }
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white px-4 pt-6 pb-8 rounded-b-[1.75rem]">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-xl hover:bg-white/15 active:bg-white/25">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <QrCode className="w-6 h-6" />
            <div>
              <p className="font-extrabold text-lg leading-tight">My QR Payments</p>
              <p className="text-[11px] opacity-90">Track your Pay-by-QR subscription payments</p>
            </div>
          </div>
          <button onClick={load} className="ml-auto p-2 rounded-xl hover:bg-white/15 active:bg-white/25" aria-label="Refresh">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <Card className="p-8 rounded-2xl text-center border-2 border-dashed">
            <div className="text-5xl mb-2">🧾</div>
            <p className="font-bold">No QR payments yet</p>
            <p className="text-xs text-muted-foreground mt-1">When you pay a subscription using the "Pay by QR Code" option, it will appear here so you can track its status.</p>
            <Button onClick={onBack} variant="outline" className="rounded-xl mt-4">Back to Profile</Button>
          </Card>
        ) : (
          rows.map((r) => {
            const meta = STATUS_META[r.status] || STATUS_META.PENDING
            const Icon = meta.icon
            return (
              <Card key={r.id || r.referenceId} className="p-4 rounded-2xl border-2 space-y-3">
                {/* Top row: plan + status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0">
                      <Crown className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{r.planName || 'Subscription'}</p>
                      <p className="text-[11px] text-muted-foreground">Ref: {r.referenceId || '—'}</p>
                    </div>
                  </div>
                  <Badge className={`${meta.cls} border-0 text-[10px] shrink-0 flex items-center gap-1`}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </Badge>
                </div>

                {/* Amount + UTR + dates */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground">Amount</p>
                    <p className="font-extrabold text-sm">₹{r.expectedAmount ?? r.amountPaid ?? '—'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground">Submitted</p>
                    <p className="font-semibold">{fmtDateTime(r.submittedAt)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 col-span-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground">UTR / Transaction ID</p>
                      <p className="font-mono font-semibold truncate">{r.utrNumber || '—'}</p>
                    </div>
                    {r.utrNumber && (
                      <button onClick={() => copy(r.utrNumber, 'UTR')} className="p-1.5 rounded-lg hover:bg-background border shrink-0">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Verified extras */}
                {r.status === 'VERIFIED' && (r.subscriptionExpiry || r.verifiedAt) && (
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex flex-wrap gap-x-4 gap-y-1">
                    {r.verifiedAt && <span>Verified: {fmtDate(r.verifiedAt)}</span>}
                    {r.subscriptionExpiry && <span>Valid till: {fmtDate(r.subscriptionExpiry)}</span>}
                  </div>
                )}

                {/* Status note / admin note */}
                <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <ReceiptText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{r.adminNote ? r.adminNote : meta.note}</span>
                </div>
              </Card>
            )
          })
        )}

        {!loading && rows.length > 0 && (
          <p className="text-center text-[11px] text-muted-foreground pt-2">
            Need help with a payment? Contact us with your reference ID.
          </p>
        )}
      </div>
    </div>
  )
}

export default MyQrPayments
