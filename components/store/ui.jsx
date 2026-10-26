'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Star, Search, Lock, ChevronLeft, MessageCircle } from 'lucide-react'
import { COLORS, money, classColor, previewUrl, waHelpUrl } from '@/components/store/api'

// Small bilingual WhatsApp help link for payment / download support.
export function WhatsAppHelp({ context = '', variant = 'inline' }) {
  const msg = `ନମସ୍କାର, ମୋର LessonGuru Store ${context ? `(${context}) ` : ''}ସମ୍ବନ୍ଧୀୟ ସାହାଯ୍ୟ ଦରକାର — ପେମେଣ୍ଟ / ଡାଉନଲୋଡ୍।`
  if (variant === 'float') {
    return (
      <a href={waHelpUrl(msg)} target="_blank" rel="noopener noreferrer"
        className="fixed bottom-20 right-3 z-40 flex items-center gap-1.5 rounded-full shadow-lg px-3.5 py-2.5 text-white font-bold text-[13px]"
        style={{ background: '#25D366' }}>
        <MessageCircle className="w-5 h-5" /> ସାହାଯ୍ୟ
      </a>
    )
  }
  return (
    <a href={waHelpUrl(msg)} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold"
      style={{ background: '#25D36618', color: '#128C7E' }}>
      <MessageCircle className="w-4 h-4" /> ସାହାଯ୍ୟ · WhatsApp
    </a>
  )
}

export function StoreHeader({ cartCount = 0, onSearch, query, setQuery, back }) {
  const router = useRouter()
  return (
    <div className="sticky top-0 z-30 shadow-sm" style={{ background: COLORS.indigo }}>
      <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center gap-2">
        {back ? (
          <button onClick={() => router.back()} className="text-white p-1 -ml-1"><ChevronLeft className="w-6 h-6" /></button>
        ) : (
          <button onClick={() => router.push('/store')} className="text-white font-extrabold text-lg whitespace-nowrap">🛍️ Store</button>
        )}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query || ''} onChange={e => setQuery?.(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSearch?.() }}
            placeholder="ଶ୍ରେଣୀ, ବିଷୟ ବା ପରୀକ୍ଷା ଖୋଜନ୍ତୁ…" className="w-full rounded-full pl-9 pr-3 py-2 text-sm outline-none" />
        </div>
        <button onClick={() => router.push('/store/cart')} className="relative text-white p-1">
          <ShoppingCart className="w-6 h-6" />
          {cartCount > 0 && <span className="absolute -top-1 -right-1 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ background: COLORS.saffron, color: '#241a5e' }}>{cartCount}</span>}
        </button>
      </div>
    </div>
  )
}

export function Stars({ avg = 0, count = 0 }) {
  if (!count || count < 10) return null
  return <div className="flex items-center gap-0.5 text-[11px]"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /><span className="font-bold">{Number(avg).toFixed(1)}</span><span className="text-gray-400">({count})</span></div>
}

export function PriceBlock({ pricing, size = 'md' }) {
  if (!pricing) return null
  const big = size === 'lg'
  if (pricing.free) return <span className="font-extrabold" style={{ color: COLORS.green, fontSize: big ? 22 : 16 }}>FREE</span>
  return (
    <div className="flex items-baseline gap-1.5 flex-wrap">
      <span className="font-extrabold" style={{ color: COLORS.coral, fontSize: big ? 24 : 16 }}>{money(pricing.price)}</span>
      {pricing.mrp > pricing.price && <span className="text-gray-400 line-through" style={{ fontSize: big ? 14 : 11 }}>{money(pricing.mrp)}</span>}
      {pricing.discountPct > 0 && <span className="font-bold rounded px-1" style={{ color: COLORS.green, fontSize: big ? 13 : 10 }}>{pricing.discountPct}% off</span>}
    </div>
  )
}

export function Badge({ children, bg, color = '#fff' }) {
  return <span className="text-[9px] font-bold rounded px-1.5 py-0.5" style={{ background: bg, color }}>{children}</span>
}

export function ProductCard({ p, onBuy, onOpen }) {
  const col = classColor(p.classes?.[0] || 1)
  const isNew = p.createdAt && (Date.now() - new Date(p.createdAt).getTime() < 14 * 864e5)
  return (
    <div onClick={() => onOpen?.(p)} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 cursor-pointer active:scale-[0.99] transition">
      <div className="h-28 relative flex items-center justify-center" style={{ background: p.coverUrl ? undefined : `linear-gradient(135deg, ${col}22, ${col}11)` }}>
        {(p.coverThumbUrl || p.coverUrl) ? <img src={p.coverThumbUrl || p.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          : p.previewCount ? <img src={previewUrl(p.id, 0)} alt="" className="w-full h-full object-cover opacity-90" loading="lazy" />
          : <div className="text-center px-2"><div className="text-[11px] font-bold" style={{ color: col }}>{p.subject || p.type}</div><div className="text-[10px] text-gray-500 line-clamp-2">{p.titleOdia || p.titleEnglish}</div></div>}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          {p.salesCount >= 10 && <Badge bg={COLORS.saffron} color="#241a5e">Bestseller</Badge>}
          {isNew && <Badge bg={COLORS.pink}>New</Badge>}
        </div>
        {p.securityLevel >= 3 && <div className="absolute bottom-1.5 right-1.5"><Lock className="w-3.5 h-3.5 text-gray-500" /></div>}
      </div>
      <div className="p-2.5">
        <div className="flex gap-1 mb-1 flex-wrap">
          {p.classes?.[0] && <span className="text-[9px] font-bold rounded px-1.5 py-0.5" style={{ background: `${col}18`, color: col }}>Class {p.classes[0]}</span>}
          {p.subject && <span className="text-[9px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-600">{p.subject}</span>}
        </div>
        <div className="text-[12px] font-bold text-gray-800 leading-tight line-clamp-2 min-h-[2rem]">{p.titleOdia || p.titleEnglish}</div>
        <div className="mt-1"><Stars avg={p.ratingAvg} count={p.ratingCount} /></div>
        <div className="flex items-center justify-between mt-1.5">
          <PriceBlock pricing={p.pricing} />
          {p.owned ? <span className="text-[10px] font-bold" style={{ color: COLORS.green }}>Owned</span>
            : <button onClick={e => { e.stopPropagation(); onBuy?.(p) }} className="text-[11px] font-bold text-white rounded-full px-3 py-1" style={{ background: COLORS.coral }}>Buy</button>}
        </div>
      </div>
    </div>
  )
}

export function SkeletonCard() {
  return <div className="bg-white rounded-2xl overflow-hidden border border-gray-100"><div className="h-28 bg-gray-100 animate-pulse" /><div className="p-2.5 space-y-2"><div className="h-3 bg-gray-100 rounded animate-pulse" /><div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" /></div></div>
}

export function TrustStrip() {
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-600 px-3 py-3">
      {['🔒 Secure payment', '⚡ Instant access', '🎓 Made by Odisha teachers', '💬 WhatsApp support'].map(t => <div key={t} className="bg-white rounded-lg px-2 py-1.5 border border-gray-100 font-medium">{t}</div>)}
    </div>
  )
}
