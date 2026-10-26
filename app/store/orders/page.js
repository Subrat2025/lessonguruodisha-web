'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sget, getToken, requireLogin, COLORS, money } from '@/components/store/api'
import { StoreHeader } from '@/components/store/ui'

const STATUS_COLOR = { paid: '#2a9d5c', pending: '#f7b32b', refunded: '#e8452c', failed: '#e8452c' }

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState(null)
  useEffect(() => { if (!getToken()) return requireLogin('/store/orders'); (async () => { try { const r = await sget('/store/orders'); setOrders(r.orders || []) } catch { setOrders([]) } })() }, []) // eslint-disable-line
  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <StoreHeader back />
      <div className="max-w-3xl mx-auto px-3 pt-3">
        <h1 className="font-extrabold text-lg" style={{ color: COLORS.indigo }}>My Orders</h1>
        {orders === null && <div className="h-20 bg-gray-100 rounded-2xl animate-pulse mt-3" />}
        {orders?.length === 0 && <div className="text-center text-gray-400 py-12">No orders yet.</div>}
        <div className="space-y-2 mt-3">
          {orders?.map(o => (
            <button key={o.id} onClick={() => router.push(`/store/orders/${o.id}`)} className="w-full text-left bg-white rounded-2xl border border-gray-100 p-3">
              <div className="flex justify-between items-center"><span className="text-[12px] font-mono text-gray-400">#{o.id.slice(-8)}</span><span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: STATUS_COLOR[o.status] || '#888' }}>{o.status}</span></div>
              <div className="text-[13px] text-gray-700 mt-1 line-clamp-1">{o.items.map(i => i.title).join(', ')}</div>
              <div className="flex justify-between items-center mt-1"><span className="text-[11px] text-gray-400">{new Date(o.createdAt).toLocaleString('en-IN')}</span><span className="font-extrabold" style={{ color: COLORS.coral }}>{money(o.total)}</span></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
