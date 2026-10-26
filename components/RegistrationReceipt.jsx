'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, Download, Share2, Eye } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
//  Local API helper (same shape as page.js api())
// ─────────────────────────────────────────────────────────────
const apiCall = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data?.error || 'Request failed'); e.status = res.status; throw e }
  return data
}

const fmtDate = (v) => {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return '—' }
}
const fmtINR = (n) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`

// Colour palette per top-line status — each status renders with its own
// inline-styled gradient so the PDF renderer (html2canvas) can always draw
// the banner correctly (Tailwind gradient utility classes are unreliable
// inside html2pdf).
const STATUS_STYLES = {
  success: {
    headline: 'CONGRATULATIONS! 🎉',
    subhead: 'Registration Successful',
    text: '#065f46',
    badgeBg: '#059669',
    grad: 'linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #6366f1 100%)',
    banner: '🎊 PREMIUM ACCESS ACTIVE 🎊',
  },
  pending: {
    headline: 'ALMOST THERE!',
    subhead: 'Payment Pending Confirmation',
    text: '#92400e',
    badgeBg: '#f59e0b',
    grad: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)',
    banner: '⏳ AWAITING PAYMENT',
  },
  failed: {
    headline: 'PAYMENT UNSUCCESSFUL',
    subhead: 'Please retry your payment',
    text: '#9f1239',
    badgeBg: '#e11d48',
    grad: 'linear-gradient(135deg, #e11d48 0%, #ef4444 50%, #f97316 100%)',
    banner: '✕ PAYMENT FAILED',
  },
  expired: {
    headline: 'MEMBERSHIP EXPIRED',
    subhead: 'Renew to continue premium access',
    text: '#475569',
    badgeBg: '#64748b',
    grad: 'linear-gradient(135deg, #475569 0%, #64748b 50%, #94a3b8 100%)',
    banner: '⏱ RENEW YOUR PLAN',
  },
  none: {
    headline: 'WELCOME!',
    subhead: 'Complete your registration to unlock premium',
    text: '#3730a3',
    badgeBg: '#6366f1',
    grad: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)',
    banner: '⭐ REGISTER NOW',
  },
}

// ─────────────────────────────────────────────────────────────
//  Receipt Card — the exact node that gets rendered to PDF.
//  All colours are inline so html2canvas renders reliably.
// ─────────────────────────────────────────────────────────────
const ReceiptCardVisual = React.forwardRef(function ReceiptCardVisual({ data }, ref) {
  const status = data?.payment?.status || 'none'
  const S = STATUS_STYLES[status] || STATUS_STYLES.none
  const validity = data?.subscription || {}

  const cardStyle = {
    width: '360px',
    background: '#ffffff',
    borderRadius: '24px',
    boxShadow: '0 12px 48px rgba(15,23,42,0.18)',
    overflow: 'hidden',
    position: 'relative',
    fontFamily: "'Inter','Noto Sans Oriya','Segoe UI',sans-serif",
    color: '#0f172a',
  }
  const sectionCard = (color, bg, border) => ({
    background: bg, borderRadius: '14px', padding: '14px 14px 12px',
    marginBottom: '11px', border: `1px solid ${border}`,
  })
  const label = (color) => ({ fontSize: '9px', fontWeight: 800, letterSpacing: '2.2px', color, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' })
  const kv = { color: '#64748b', fontSize: '9.5px', marginBottom: '2px' }
  const val = { fontWeight: 700, fontSize: '11.5px', color: '#0f172a' }

  return (
    <div ref={ref} style={cardStyle}>
      {/* Diagonal watermark — extra-light so it never fights the content */}
      <div style={{
        position: 'absolute', top: '38%', left: '50%',
        transform: 'translate(-50%, -50%) rotate(-24deg)',
        fontSize: '38px', color: 'rgba(99,102,241,0.06)',
        fontWeight: 900, whiteSpace: 'nowrap', pointerEvents: 'none',
        zIndex: 0, letterSpacing: '4px',
      }}>
        LESSON GURU ODISHA
      </div>

      {/* Gradient hero header */}
      <div style={{
        background: S.grad, color: '#ffffff',
        padding: '24px 20px 30px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative confetti shapes */}
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '140px', height: '140px', background: 'rgba(255,255,255,0.15)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '40px', right: '20px', width: '20px', height: '20px', background: 'rgba(255,255,255,0.25)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '-30px', left: '-30px', width: '100px', height: '100px', background: 'rgba(255,255,255,0.10)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: '30px', left: '30px', width: '14px', height: '14px', background: 'rgba(255,255,255,0.30)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', top: '60px', left: '20px', width: '10px', height: '10px', background: 'rgba(255,255,255,0.35)', borderRadius: '50%' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Brand row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <div style={{
              width: '44px', height: '44px',
              background: 'rgba(255,255,255,0.25)',
              borderRadius: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', border: '2px solid rgba(255,255,255,0.35)',
            }}>🎓</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '1.5px', lineHeight: 1, color: '#ffffff' }}>
                LESSON GURU ODISHA
              </div>
              <div style={{ fontSize: '9px', letterSpacing: '2px', opacity: 0.9, marginTop: '4px', fontWeight: 600, color: '#ffffff' }}>
                SMART TEACHING • BETTER LEARNING
              </div>
            </div>
          </div>

          {/* Big celebration headline */}
          <div style={{ textAlign: 'center', marginTop: '8px' }}>
            <div style={{ fontSize: '40px', lineHeight: 1, marginBottom: '4px' }}>
              {status === 'success' && '🎉'}
              {status === 'pending' && '⏳'}
              {status === 'failed'  && '⚠️'}
              {status === 'expired' && '⏱️'}
              {status === 'none'    && '✨'}
            </div>
            <div style={{
              fontSize: '18px', fontWeight: 900, letterSpacing: '0.5px',
              color: '#ffffff', marginTop: '4px',
              textShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>{S.headline}</div>
            <div style={{ fontSize: '11px', marginTop: '6px', color: '#ffffff', opacity: 0.95, fontWeight: 500 }}>
              {S.subhead}
            </div>
          </div>

          {/* Receipt ID pill */}
          <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'center' }}>
            <div style={{
              background: 'rgba(255,255,255,0.28)',
              padding: '6px 16px', borderRadius: '999px',
              fontSize: '9.5px', fontWeight: 800,
              letterSpacing: '1px', color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.35)',
            }}>
              RECEIPT · {String(data?.receiptId || '').slice(0, 24)}
            </div>
          </div>
        </div>
      </div>

      {/* Body — details cards */}
      <div style={{ padding: '18px 16px 14px', position: 'relative', zIndex: 1 }}>
        {/* Member Details */}
        <div style={sectionCard('#0f172a', '#f8fafc', '#e2e8f0')}>
          <div style={label('#475569')}>👤 MEMBER DETAILS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={kv}>Name</div>
              <div style={val}>{data?.user?.name || 'Member'}</div>
            </div>
            <div>
              <div style={kv}>Mobile</div>
              <div style={val}>{data?.user?.mobile || '—'}</div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={kv}>Registered On</div>
              <div style={val}>{fmtDate(data?.registration?.date)}</div>
            </div>
          </div>
        </div>

        {/* Payment Details */}
        <div style={sectionCard('#065f46', status === 'success' ? '#f0fdf4' : status === 'failed' ? '#fef2f2' : status === 'pending' ? '#fffbeb' : '#f8fafc', status === 'success' ? '#bbf7d0' : status === 'failed' ? '#fecaca' : status === 'pending' ? '#fde68a' : '#e2e8f0')}>
          <div style={label(status === 'success' ? '#166534' : status === 'failed' ? '#9f1239' : status === 'pending' ? '#92400e' : '#475569')}>💳 PAYMENT DETAILS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={kv}>Plan</div>
              <div style={{ ...val, textTransform: 'capitalize' }}>{data?.subscription?.plan || '—'}</div>
            </div>
            <div>
              <div style={kv}>Amount</div>
              <div style={{ ...val, color: '#059669', fontSize: '13px' }}>{fmtINR(data?.payment?.amountINR)}</div>
            </div>
            <div>
              <div style={kv}>Status</div>
              <div style={{ ...val, color: S.text }}>
                {status === 'success' ? '✓ PAID' :
                 status === 'pending' ? '⏳ PENDING' :
                 status === 'failed'  ? '✕ FAILED' :
                 status === 'expired' ? '⏱ EXPIRED' : '— NOT PAID'}
              </div>
            </div>
            <div>
              <div style={kv}>Paid On</div>
              <div style={val}>{fmtDate(data?.payment?.date)}</div>
            </div>
            {data?.payment?.transactionId && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={kv}>Transaction ID</div>
                <div style={{ ...val, fontSize: '10.5px', wordBreak: 'break-all', color: '#475569' }}>{data.payment.transactionId}</div>
              </div>
            )}
          </div>
        </div>

        {/* Validity */}
        <div style={sectionCard('#1e40af', '#eff6ff', '#bfdbfe')}>
          <div style={label('#1e40af')}>📅 MEMBERSHIP VALIDITY</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={kv}>Valid From</div>
              <div style={val}>{fmtDate(validity.startDate)}</div>
            </div>
            <div>
              <div style={kv}>Valid Until</div>
              <div style={val}>{fmtDate(validity.expiryDate)}</div>
            </div>
          </div>
          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <span style={{
              display: 'inline-block',
              padding: '7px 18px', borderRadius: '999px',
              background: validity.isActive ? '#059669' : (validity.isExpired ? '#64748b' : '#94a3b8'),
              color: '#ffffff',
              fontSize: '10.5px', fontWeight: 900, letterSpacing: '1.2px',
              boxShadow: '0 4px 12px rgba(5,150,105,0.25)',
            }}>
              {validity.isActive ? '🟢 ACTIVE' : validity.isExpired ? '⏱ EXPIRED' : `• ${String(validity.status || 'INACTIVE').toUpperCase()}`}
            </span>
          </div>
        </div>

        {/* Status banner */}
        <div style={{
          margin: '14px 0 8px', textAlign: 'center',
          padding: '10px 14px', borderRadius: '12px',
          background: S.grad, color: '#ffffff',
          fontSize: '11.5px', fontWeight: 800, letterSpacing: '1px',
          boxShadow: '0 4px 14px rgba(15,23,42,0.15)',
        }}>
          {S.banner}
        </div>

        {/* Footer message */}
        <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
          {status === 'success' && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a' }}>Your educational journey starts here! 🚀</div>
              <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '3px' }}>Thank you for joining Lesson Guru Odisha.</div>
            </>
          )}
          {status === 'pending' && <div style={{ fontSize: '10.5px', color: '#92400e' }}>Please complete your payment to activate premium access.</div>}
          {status === 'failed'  && <div style={{ fontSize: '10.5px', color: '#9f1239' }}>Your payment could not be confirmed. Please try again.</div>}
          {status === 'expired' && <div style={{ fontSize: '10.5px', color: '#475569' }}>Renew your plan to continue enjoying premium features.</div>}
          {status === 'none'    && <div style={{ fontSize: '10.5px', color: '#3730a3' }}>Complete your registration to activate premium access.</div>}
        </div>

        {/* Footer strip */}
        <div style={{
          marginTop: '12px', padding: '8px 0 2px',
          borderTop: '1px dashed #cbd5e1', textAlign: 'center',
          fontSize: '8.5px', color: '#94a3b8',
          letterSpacing: '1.8px', fontWeight: 800,
        }}>
          LESSON GURU ODISHA · lessonguruodisha.in
        </div>
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────
//  Root component: shows receipt + View / Download / Share
// ─────────────────────────────────────────────────────────────
export const RegistrationReceipt = ({ onBack }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const cardRef = React.useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await apiCall('/user/registration-receipt')) }
    catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const filename = () => {
    const rid = String(data?.receiptId || 'RECEIPT').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 40)
    return `Lesson-Guru-Odisha-Receipt-${rid}.pdf`
  }

  // Build the PDF as a Blob once — used by View / Download / Share.
  const _buildBlob = async () => {
    const el = cardRef.current
    if (!el) throw new Error('Receipt not rendered yet')
    // Move node into a fixed off-screen container so html2canvas gets a
    // pristine layout regardless of any scroll containers on the page.
    const wrap = document.createElement('div')
    wrap.style.cssText = 'position:fixed;left:-10000px;top:0;background:#f1f5f9;padding:20px'
    const clone = el.cloneNode(true)
    wrap.appendChild(clone)
    document.body.appendChild(wrap)
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      // 9:16 mobile-friendly page — matches the on-screen preview exactly.
      // Card is 360px wide; give it a 400×720 pt page for a bit of breathing room.
      return await html2pdf().set({
        margin: 0,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#f1f5f9' },
        jsPDF: { unit: 'pt', format: [400, 720], orientation: 'portrait' },
      }).from(clone).outputPdf('blob')
    } finally { try { document.body.removeChild(wrap) } catch { /* noop */ } }
  }

  const viewPDF = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const blob = await _buildBlob()
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (!w) toast.error('Popup blocked — please allow popups.')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { toast.error(e.message || 'Could not preview PDF') }
    finally { setPdfBusy(false) }
  }

  const downloadPDF = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const blob = await _buildBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename(); document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success('✅ Receipt downloaded')
    } catch (e) { toast.error(e.message || 'Could not download PDF') }
    finally { setPdfBusy(false) }
  }

  const sharePDF = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const blob = await _buildBlob()
      const file = new File([blob], filename(), { type: 'application/pdf' })
      if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Lesson Guru Odisha Registration Receipt',
          text: '🎉 I have successfully registered with Lesson Guru Odisha.',
        })
        toast.success('📤 Share sheet opened')
        return
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Lesson Guru Odisha Registration Receipt',
          text: '🎉 I have successfully registered with Lesson Guru Odisha.',
          url: typeof window !== 'undefined' ? window.location.origin : '',
        })
        toast('📤 Share opened (file share unsupported — please download and share manually).')
        return
      }
      // Total fallback → force download and inform user.
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename(); document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.info('Share is not supported on this device. The receipt has been downloaded — please share it manually.')
    } catch (e) {
      if (e?.name !== 'AbortError') toast.error(e.message || 'Could not share PDF')
    } finally { setPdfBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-fuchsia-50 dark:from-slate-950 dark:via-indigo-950/30 dark:to-fuchsia-950/20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gradient-to-r from-indigo-600 to-violet-700 text-white px-4 py-3 flex items-center gap-3">
        {onBack && <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full text-white hover:bg-white/20"><ArrowLeft className="w-5 h-5" /></Button>}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] opacity-90 font-semibold tracking-wider">MY RECEIPT</p>
          <p className="font-extrabold truncate">Registration Certificate</p>
        </div>
      </div>

      <div className="flex flex-col items-center px-4 py-6">
        {loading && <div className="py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>}

        {data && (
          <>
            <ReceiptCardVisual data={data} ref={cardRef} />

            {/* Actions */}
            <div className="w-full max-w-[360px] mt-5 space-y-2">
              <Button onClick={downloadPDF} disabled={pdfBusy} className="w-full h-11 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold text-sm shadow-lg">
                {pdfBusy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Working…</> : <><Download className="w-4 h-4 mr-2" /> Download PDF</>}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={viewPDF} disabled={pdfBusy} className="h-10 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow">
                  <Eye className="w-4 h-4 mr-2" /> Preview
                </Button>
                <Button onClick={sharePDF} disabled={pdfBusy} className="h-10 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm shadow">
                  <Share2 className="w-4 h-4 mr-2" /> Share
                </Button>
              </div>
              {data?.payment?.status === 'pending' && (
                <p className="text-center text-[11px] text-amber-800 italic mt-2">Complete your payment to activate premium access.</p>
              )}
              {data?.payment?.status === 'failed' && (
                <p className="text-center text-[11px] text-rose-800 italic mt-2">Please retry your payment to activate premium access.</p>
              )}
              {data?.payment?.status === 'expired' && (
                <p className="text-center text-[11px] text-slate-700 italic mt-2">Renew your plan to continue premium access.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default RegistrationReceipt
