'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { sget, spost, getToken, requireLogin, mergeGuestCart, guestCartGet, guestCartRemove, COLORS, money } from '@/components/store/api'
import { StoreHeader, WhatsAppHelp } from '@/components/store/ui'

const OD = '୦୧୨୩୪୫୬୭୮୯'
const odNum = (n) => String(n ?? '').replace(/[0-9]/g, d => OD[+d])

export default function CartPage() {
  const router = useRouter()
  const [data, setData] = useState(null)   // { items, groups, messages, subtotal, mrpTotal }
  const loggedIn = !!(typeof window !== 'undefined' && getToken())

  const guestData = () => {
    const items = guestCartGet().map(g => ({ id: g.id, titleOdia: g.titleOdia, titleEnglish: g.titleEnglish, pricing: { price: g.price, mrp: g.price, free: g.free } }))
    return { items, groups: [], messages: [], subtotal: items.reduce((a, p) => a + (p.pricing.price || 0), 0), mrpTotal: items.reduce((a, p) => a + (p.pricing.price || 0), 0) }
  }

  const load = async () => {
    if (!getToken()) { setData(guestData()); return }
    try { await mergeGuestCart() } catch {}
    try { const r = await sget('/store/cart'); setData({ items: r.items || [], groups: r.groups || [], messages: r.messages || [], subtotal: r.subtotal || 0, mrpTotal: r.mrpTotal || 0 }) } catch { setData({ items: [], groups: [], messages: [], subtotal: 0, mrpTotal: 0 }) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const remove = async (id) => {
    if (!getToken()) { guestCartRemove(id); setData(guestData()); return }
    try { await spost('/store/cart/remove', { productId: id }); load() } catch (e) { toast.error(e.message) }
  }

  const items = data?.items
  const subtotal = data?.subtotal || 0
  const mrpTotal = data?.mrpTotal || 0
  const savings = Math.max(0, mrpTotal - subtotal)
  const goCheckout = () => { if (!getToken()) return requireLogin('/store/checkout?cart=1'); router.push('/store/checkout?cart=1') }

  const setLabel = (p) => {
    if (p.type === 'unit_test_set' && p.setNo) return `${p.chapterTitle || p.titleOdia} — ସେଟ୍ ${odNum(p.setNo)}`
    if (p.isBundle) return `${p.chapterTitle || p.titleOdia} — ସବୁ ସେଟ୍`
    return p.titleOdia || p.titleEnglish
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <StoreHeader back />
      <div className="max-w-3xl mx-auto px-3 pt-3">
        <div className="flex items-center justify-between">
          <h1 className="font-extrabold text-lg" style={{ color: COLORS.indigo }}>କାର୍ଟ</h1>
          <WhatsAppHelp context="cart" />
        </div>
        {!loggedIn && items?.length > 0 && <div className="text-[12px] text-gray-500 mt-1">👋 ବ୍ରାଉଜ୍ କରନ୍ତୁ — Login is needed only at checkout.</div>}
        {data === null && <div className="h-20 bg-gray-100 rounded-2xl animate-pulse mt-3" />}
        {items?.length === 0 && <div className="text-center text-gray-400 py-12">Your cart is empty.<br /><button onClick={() => router.push('/store')} className="mt-3 font-bold text-white rounded-full px-5 py-2" style={{ background: COLORS.coral }}>Browse store</button></div>}

        {/* Auto-clean notices */}
        {data?.messages?.length > 0 && (
          <div className="mt-3 space-y-1">
            {data.messages.map((m, i) => <div key={i} className="text-[11px] rounded-lg px-3 py-1.5" style={{ background: '#fff7ed', color: '#b45309' }}>• {m.text}</div>)}
          </div>
        )}

        <div className="space-y-2 mt-3">
          {items?.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3">
              {p.coverThumbUrl && <img src={p.coverThumbUrl} alt="" className="w-12 rounded-lg object-cover shrink-0" style={{ height: 60 }} loading="lazy" />}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-gray-800 line-clamp-2">{setLabel(p)}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-extrabold text-[15px]" style={{ color: COLORS.coral }}>{p.pricing?.free ? 'FREE' : money(p.pricing?.price)}</span>
                  {p.pricing?.mrp > p.pricing?.price && <span className="text-[11px] line-through text-gray-400">{money(p.pricing.mrp)}</span>}
                </div>
              </div>
              <button onClick={() => remove(p.id)} className="text-gray-400 p-2"><Trash2 className="w-5 h-5" /></button>
            </div>
          ))}
        </div>

        {/* Totals box */}
        {items?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3">
            <div className="font-bold text-[13px] mb-2" style={{ color: COLORS.indigo }}>ଦେୟ ବିବରଣୀ</div>
            <div className="flex justify-between text-[13px] text-gray-600"><span>ମୋଟ MRP</span><span>{money(mrpTotal)}</span></div>
            {savings > 0 && <div className="flex justify-between text-[13px] mt-1" style={{ color: COLORS.green }}><span>ଛାଡ଼</span><span>−{money(savings)}</span></div>}
            <div className="flex justify-between font-extrabold text-[15px] mt-2 pt-2 border-t border-gray-100" style={{ color: COLORS.indigo }}><span>ମୋଟ ଦେୟ</span><span style={{ color: COLORS.coral }}>{money(subtotal)}</span></div>
            {savings > 0 && <div className="text-[11px] font-bold mt-1" style={{ color: COLORS.green }}>ଆପଣ ମୋଟ {money(savings)} ସଞ୍ଚୟ କରୁଛନ୍ତି</div>}
            <div className="text-[11px] text-gray-400 mt-1">କୁପନ୍ (ଥିଲେ) ପେମେଣ୍ଟ ପୃଷ୍ଠାରେ ଲାଗିବ · ସର୍ବନିମ୍ନ ₹20</div>
          </div>
        )}
      </div>

      {items?.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-30" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}><div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center gap-3">
          <div><div className="text-[11px] text-gray-500">ମୋଟ ଦେୟ</div><div className="font-extrabold text-lg" style={{ color: COLORS.coral }}>{money(subtotal)}</div></div>
          <button onClick={goCheckout} className="flex-1 font-extrabold text-white rounded-full py-3" style={{ background: COLORS.coral }}>{money(subtotal)} ପେମେଣ୍ଟ କରନ୍ତୁ</button>
        </div></div>
      )}
    </div>
  )
}
