'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { sget, COLORS, classColor } from '@/components/store/api'
import { StoreHeader, ProductCard, SkeletonCard, TrustStrip } from '@/components/store/ui'
import PromoAd from '@/components/PromoAd'
import AppBottomNav from '@/components/nav/AppBottomNav'

const STORE_NAV_HREF = { home: '/', classes: '/lessons', search: '/search', plans: '/plans', profile: '/dashboard' }
const OD = '୦୧୨୩୪୫୬୭୮୯'
const odNum = (n) => String(n ?? '').replace(/[0-9]/g, d => OD[+d])

export default function StoreHome() {
  const router = useRouter()
  const [config, setConfig] = useState(null)
  const [products, setProducts] = useState(null)
  const [query, setQuery] = useState('')
  const [cls, setCls] = useState('')
  const [cat, setCat] = useState('')
  const [utRange, setUtRange] = useState('')

  useEffect(() => {
    sget('/store/unit-tests/classes').then(r => {
      const nums = (r.classes || []).map(c => parseInt(c.class, 10)).filter(n => !isNaN(n))
      if (nums.length) setUtRange(`ଶ୍ରେଣୀ ${odNum(Math.min(...nums))}–${odNum(Math.max(...nums))}`)
    }).catch(() => {})
  }, [])

  const loadProducts = async (f = {}) => {
    try { const r = await sget(`/store/products?${new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()}`); setProducts(r.products || []) }
    catch (e) { setProducts([]); if (e.status === 404) setConfig(c => ({ ...(c || {}), enabled: false })) }
  }
  useEffect(() => {
    (async () => {
      try { const c = await sget('/store/config'); setConfig(c); if (c.enabled) { loadProducts() } else { setProducts([]) } }
      catch { setConfig({ enabled: false }); setProducts([]) }
    })()
  }, [])

  const openProduct = (p) => router.push(`/store/p/${p.slug}`)
  const buy = (p) => router.push(`/store/checkout?pid=${p.id}`)

  if (config && !config.enabled) {
    return (<div className="min-h-screen bg-gray-50"><StoreHeader /><div className="max-w-md mx-auto text-center p-10"><div className="text-5xl mb-3">🛍️</div><h2 className="font-extrabold text-lg" style={{ color: COLORS.indigo }}>Store opening soon</h2><p className="text-sm text-gray-500 mt-2">The LessonGuru Store is in beta. You’ll get access shortly.</p><button onClick={() => router.push('/')} className="mt-4 text-sm font-bold text-white rounded-full px-5 py-2" style={{ background: COLORS.coral }}>Back to app</button></div></div>)
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <StoreHeader query={query} setQuery={setQuery} onSearch={() => loadProducts({ q: query, cls, categoryId: cat })} cartCount={0} />
      {/* hero */}
      <div className="max-w-3xl mx-auto px-3 pt-3">
        <div className="rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${COLORS.indigo}, #3b2a8c)` }}>
          <div className="text-[11px] font-bold" style={{ color: COLORS.saffron }}>LESSONGURU STORE</div>
          <div className="text-lg font-extrabold leading-tight mt-1">Answer keys, papers & registers — instant, secure, affordable</div>
          <div className="text-[11px] opacity-90 mt-1">SA-1 2026 ready • Made by Odisha teachers</div>
        </div>
        {/* Unit Tests entry banner */}
        <button onClick={() => router.push('/store/unit-tests')} className="w-full mt-3 rounded-2xl p-4 text-left text-white flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${COLORS.saffron}, ${COLORS.coral})` }}>
          <div className="flex-1">
            <div className="text-[18px] font-extrabold leading-tight">ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ</div>
            <div className="text-[11px] opacity-95 mt-0.5">{config?.setsLive ? `${utRange || 'ଶ୍ରେଣୀ'} · ସବୁ ବିଷୟ · ପ୍ରତି ଅଧ୍ୟାୟ ୫ଟି ସେଟ୍` : `${utRange || 'ଶ୍ରେଣୀ'} · ସବୁ ବିଷୟ · ପ୍ରତି ଅଧ୍ୟାୟ ୫ଟି ପରୀକ୍ଷା`}</div>
          </div>
          <span className="text-[12px] font-bold rounded-full px-3 py-1.5 whitespace-nowrap" style={{ background: '#fff', color: COLORS.coral }}>{config?.setsLive ? 'ସେଟ୍ ପ୍ରତି ମାତ୍ର ₹୨' : 'ମାତ୍ର ₹୨ · ଏବେ ଦେଖନ୍ତୁ'}</span>
        </button>
      </div>
      {/* 📢 Promotion slot (store listing) — admin-controlled, dismissible */}
      <div className="max-w-3xl mx-auto"><PromoAd placement="store" /></div>
      <div className="max-w-3xl mx-auto px-3 pt-4">
        <div className="text-sm font-bold mb-2" style={{ color: COLORS.indigo }}>Choose your class</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(c => (
            <button key={c} onClick={() => { setCls(c); loadProducts({ cls: c }) }} className="min-w-[52px] h-13 rounded-xl flex flex-col items-center justify-center py-2 text-white font-bold text-xs" style={{ background: classColor(c) }}>
              <span className="text-[9px] opacity-80">Class</span>{c}
            </button>
          ))}
        </div>
      </div>
      {/* categories */}
      {config?.categories?.length > 0 && (
        <div className="max-w-3xl mx-auto px-3 pt-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {config.categories.map(c => (
              <button key={c.id} onClick={() => { setCat(c.id); loadProducts({ categoryId: c.id }) }} className="whitespace-nowrap text-[12px] font-semibold rounded-full px-3 py-1.5 border" style={{ borderColor: c.color, color: c.color }}>{c.icon} {c.nameEnglish}</button>
            ))}
          </div>
        </div>
      )}
      {/* products */}
      <div className="max-w-3xl mx-auto px-3 pt-4">
        <div className="text-sm font-bold mb-2" style={{ color: COLORS.indigo }}>{query || cls || cat ? 'Results' : 'Featured & new'}</div>
        <div className="grid grid-cols-2 gap-3">
          {products === null && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          {products?.map(p => <ProductCard key={p.id} p={p} onOpen={openProduct} onBuy={buy} />)}
        </div>
        {products?.length === 0 && <div className="text-center text-sm text-gray-400 py-10">No products yet. Check back soon!</div>}
      </div>
      {/* cross links */}
      <div className="max-w-3xl mx-auto px-3 pt-4 grid grid-cols-2 gap-2">
        <button onClick={() => router.push('/')} className="bg-white rounded-xl p-3 text-left border border-gray-100"><div className="text-[12px] font-bold" style={{ color: COLORS.sky }}>🔑 Request a custom answer key</div></button>
        <button onClick={() => router.push('/assessment')} className="bg-white rounded-xl p-3 text-left border border-gray-100"><div className="text-[12px] font-bold" style={{ color: COLORS.green }}>🛍️ Assessment Store</div></button>
      </div>
      <TrustStrip />
      <AppBottomNav view="" go={(id) => router.push(STORE_NAV_HREF[id] || '/')} />
    </div>
  )
}
