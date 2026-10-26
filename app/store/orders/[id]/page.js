'use client'
import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { sget, getToken, requireLogin, COLORS, money, API } from '@/components/store/api'
import { StoreHeader } from '@/components/store/ui'

async function downloadReceiptPdf(orderId) {
  const t = getToken()
  const res = await fetch(`${API}/store/order/${orderId}/receipt.pdf`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
  if (!res.ok) throw new Error('Could not generate receipt')
  const blob = await res.blob(); const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `receipt-${orderId.slice(-8)}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export default function OrderDetail() {
  const { id } = useParams()
  const router = useRouter()
  const [order, setOrder] = useState(null)
  const [receipt, setReceipt] = useState(null)
  useEffect(() => { if (!getToken()) return requireLogin(`/store/orders/${id}`); (async () => {
    try { const r = await sget(`/store/order/${id}`); setOrder(r.order); const rc = await sget(`/store/order/${id}/receipt`).catch(() => null); if (rc) setReceipt(rc.receipt) } catch { setOrder(false) }
  })() }, [id]) // eslint-disable-line
  if (order === false) return (<div className="min-h-screen bg-gray-50"><StoreHeader back /><div className="text-center p-10 text-gray-500">Order not found.</div></div>)
  if (!order) return (<div className="min-h-screen bg-gray-50"><StoreHeader back /><div className="max-w-3xl mx-auto p-4"><div className="h-32 bg-gray-100 rounded-2xl animate-pulse" /></div></div>)
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <StoreHeader back />
      <div className="max-w-3xl mx-auto px-3 pt-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex justify-between items-center"><h1 className="font-extrabold" style={{ color: COLORS.indigo }}>Order #{order.id.slice(-8)}</h1><span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: order.status === 'paid' ? COLORS.green : order.status === 'refunded' ? COLORS.coral : COLORS.saffron }}>{order.status}</span></div>
          <div className="text-[11px] text-gray-400 mt-0.5">{new Date(order.paidAt || order.createdAt).toLocaleString('en-IN')}</div>
          <div className="mt-3 space-y-1">{order.items.map(i => <div key={i.productId} className="flex justify-between text-[13px]"><span className="text-gray-700 pr-2 line-clamp-1">{i.title}</span><span className="font-bold">{money(i.price)}</span></div>)}</div>
          <div className="border-t mt-3 pt-2 text-[13px] space-y-1">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
            {order.discount > 0 && <div className="flex justify-between" style={{ color: COLORS.green }}><span>Discount {order.couponCode ? `(${order.couponCode})` : ''}</span><span>−{money(order.discount)}</span></div>}
            <div className="flex justify-between font-extrabold" style={{ color: COLORS.indigo }}><span>Total</span><span>{money(order.total)}</span></div>
          </div>
        </div>
        {order.status === 'paid' && <button onClick={() => router.push('/store/library')} className="w-full mt-3 font-extrabold text-white rounded-full py-3" style={{ background: COLORS.green }}>Open in My Library</button>}
        {receipt && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mt-3 text-[12px]">
            <div className="font-bold mb-1" style={{ color: COLORS.indigo }}>Receipt</div>
            <div className="text-gray-600">Seller: {receipt.seller}{receipt.gstin ? ` • GSTIN ${receipt.gstin}` : ''}</div>
            <div className="text-gray-600">Buyer: {receipt.buyer?.name}</div>
            <div className="text-gray-400 mt-1">Order #{receipt.orderId.slice(-8)} • {new Date(receipt.date).toLocaleDateString('en-IN')}</div>
            <button onClick={() => window.print()} className="mt-2 text-[11px] font-bold rounded-full px-3 py-1" style={{ background: `${COLORS.sky}18`, color: COLORS.sky }}>Print receipt</button>
            <button onClick={() => downloadReceiptPdf(order.id).catch(e => alert(e.message))} className="mt-2 ml-2 text-[11px] font-bold rounded-full px-3 py-1 text-white" style={{ background: COLORS.indigo }}>Download PDF</button>
          </div>
        )}
      </div>
    </div>
  )
}
