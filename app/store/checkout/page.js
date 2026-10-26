'use client'
import React, { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { sget, spost, getToken, requireLogin, mergeGuestCart, loadRazorpay, COLORS, money } from '@/components/store/api'
import { StoreHeader, WhatsAppHelp } from '@/components/store/ui'

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <CheckoutInner />
    </Suspense>
  )
}

function CheckoutInner() {
  const router = useRouter()
  const sp = useSearchParams()
  const src = sp.get('src') || ''
  const [items, setItems] = useState(null)
  const [productIds, setProductIds] = useState([])
  const [coupon, setCoupon] = useState('')
  const [applied, setApplied] = useState(null)   // { discount, total }
  const [busy, setBusy] = useState(false)
  const [priceChanges, setPriceChanges] = useState(null)
  const [featured, setFeatured] = useState(null)

  useEffect(() => { sget('/store/coupon/featured').then(r => setFeatured(r.coupon)).catch(() => {}) }, [])

  useEffect(() => { if (!getToken()) return requireLogin('/store/checkout' + window.location.search); (async () => {
    try { await mergeGuestCart() } catch {}
    let ids = []
    if (sp.get('cart')) { const r = await sget('/store/cart'); ids = (r.items || []).map(p => p.id); setItems(r.items || []) }
    else if (sp.get('pid')) { ids = [sp.get('pid')]; try { const r = await sget('/store/product/' + sp.get('pid')); if (r.product) setItems([r.product]) } catch {} }
    setProductIds(ids)
  })() }, []) // eslint-disable-line

  const subtotal = (items || []).reduce((a, p) => a + (p.pricing?.price || 0), 0)
  const total = applied ? applied.total : subtotal

  const applyCoupon = async (codeArg) => {
    const code = typeof codeArg === 'string' ? codeArg : coupon
    if (!code) return
    try { const r = await spost('/store/coupon/validate', { code, productIds }); if (r.ok) { setCoupon(code); setApplied({ discount: r.discount, total: r.total }); toast.success(`Coupon applied −${money(r.discount)}`) } else { setApplied(null); toast.error(r.reason || 'Invalid coupon') } }
    catch (e) { toast.error(e.message) }
  }

  const pay = async (confirm = false) => {
    setBusy(true)
    try {
      const clientPrices = Object.fromEntries((items || []).map(p => [p.id, p.pricing?.price || 0]))
      const res = await spost('/store/checkout', { productIds, couponCode: applied ? coupon : '', clientPrices, confirm, src })
      if (res.priceChanged) { setPriceChanges(res.priceChanges); setApplied(res.draft ? { discount: res.draft.discount, total: res.draft.total } : applied); toast.message('Prices updated — please review'); setBusy(false); return }
      if (res.free) { toast.success('Unlocked! Opening your library…'); router.push('/store/library'); return }
      if (res.razorpayOrderId) {
        const ok = await loadRazorpay(); if (!ok) throw new Error('Could not load payment')
        const rzp = new window.Razorpay({ key: res.keyId, order_id: res.razorpayOrderId, amount: res.amount, currency: res.currency, name: 'LessonGuru Store',
          theme: { color: COLORS.coral },
          handler: async (resp) => { try { await spost('/store/checkout/verify', { razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature }); toast.success('Payment successful!'); router.push('/store/library') } catch (e) { toast.error(e.message + ' — if debited, access will appear shortly') } } })
        rzp.open()
      } else if (res.error) toast.error(res.error)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <StoreHeader back />
      <div className="max-w-3xl mx-auto px-3 pt-3">
        <h1 className="font-extrabold text-lg flex items-center justify-between" style={{ color: COLORS.indigo }}>Checkout <WhatsAppHelp context="checkout" /></h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3 space-y-2">
          {items === null && <div className="h-5 bg-gray-100 rounded animate-pulse" />}
          {items?.map(p => <div key={p.id} className="flex justify-between text-[13px]"><span className="text-gray-700 line-clamp-1 pr-2">{p.titleOdia || p.titleEnglish}</span><span className="font-bold">{p.pricing?.free ? 'FREE' : money(p.pricing?.price)}</span></div>)}
        </div>
        {priceChanges && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mt-3 text-[12px]"><div className="font-bold text-amber-700 mb-1">Prices changed since you added these:</div>{priceChanges.map(c => <div key={c.productId}>• {c.title}: {money(c.oldPrice)} → <b>{money(c.newPrice)}</b></div>)}<div className="mt-1 text-amber-700">Tap Pay again to continue at the new price.</div></div>}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3">
          {featured && !featured.expired && !featured.notStarted && (
            <button onClick={() => applyCoupon(featured.code)} className="w-full text-left mb-2 rounded-xl px-3 py-2 border" style={{ background: '#fff7ed', borderColor: '#fed7aa' }}>
              <div className="text-[12px] font-bold" style={{ color: '#c2410c' }}>🎉 {featured.labelOdia || `${featured.code} — ${featured.value}% off`}</div>
              <div className="text-[10px] text-gray-500">Tap to apply{featured.maxDiscount ? ` · max ${money(featured.maxDiscount)}` : ''}</div>
            </button>
          )}
          {featured && featured.expired && (
            <div className="mb-2 rounded-xl px-3 py-2 bg-gray-50 border text-[12px] text-gray-500">{featured.code} — {featured.expiredLabelOdia}</div>
          )}
          <div className="flex gap-2"><input value={coupon} onChange={e => setCoupon(e.target.value.toUpperCase())} placeholder="Coupon code" className="flex-1 border rounded-lg px-3 py-2 text-sm" /><button onClick={applyCoupon} className="font-bold text-sm rounded-lg px-4" style={{ background: `${COLORS.sky}18`, color: COLORS.sky }}>Apply</button></div>
          {applied && <div className="flex justify-between text-[13px] mt-2" style={{ color: COLORS.green }}><span>Discount</span><span>−{money(applied.discount)}</span></div>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3 flex justify-between items-center"><span className="font-bold" style={{ color: COLORS.indigo }}>Total</span><span className="font-extrabold text-lg" style={{ color: COLORS.coral }}>{money(total)}</span></div>
        <div className="text-[10px] text-gray-400 text-center mt-2">🔒 Secure UPI / card payment via Razorpay</div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-30"><div className="max-w-3xl mx-auto px-3 py-2.5"><button disabled={busy || !items?.length} onClick={() => pay(!!priceChanges)} className="w-full font-extrabold text-white rounded-full py-3 disabled:opacity-50" style={{ background: COLORS.coral }}>{busy ? 'Please wait…' : priceChanges ? `Pay new total ${money(total)}` : `Pay ${money(total)}`}</button></div></div>
    </div>
  )
}
