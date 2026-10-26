'use client'
import React, { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Share2, Check, ShieldCheck } from 'lucide-react'
import { sget, spost, getToken, requireLogin, addToCartSmart, COLORS, money, classColor, previewUrl } from '@/components/store/api'
import { StoreHeader, PriceBlock, Stars } from '@/components/store/ui'

export default function ProductPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <ProductInner />
    </Suspense>
  )
}

function ProductInner() {
  const { slug } = useParams()
  const sp = useSearchParams()
  const src = sp.get('src') || ''
  const router = useRouter()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [pi, setPi] = useState(0)
  const [reviews, setReviews] = useState(null)
  const [rStar, setRStar] = useState(5)
  const [rText, setRText] = useState('')
  const loadReviews = async () => { try { const r = await sget(`/store/product/${slug}/reviews`); setReviews(r.reviews || []); if (r.mine?.rating) { setRStar(r.mine.rating); setRText(r.mine.text || '') } } catch { setReviews([]) } }
  useEffect(() => { if (slug) loadReviews() }, [slug]) // eslint-disable-line
  const submitReview = async () => { try { await spost(`/store/product/${p.id}/review`, { rating: rStar, text: rText }); toast.success('Thanks for your review!'); loadReviews() } catch (e) { toast.error(e.message) } }

  useEffect(() => { (async () => {
    try { const r = await sget(`/store/product/${slug}${src ? `?src=${encodeURIComponent(src)}` : ''}`); setData(r) }
    catch (e) { setErr(e.status === 404 ? 'This product is not available.' : e.message) }
  })() }, [slug]) // eslint-disable-line

  const p = data?.product
  const buy = () => { router.push(`/store/checkout?pid=${p.id}${src ? `&src=${encodeURIComponent(src)}` : ''}`) }
  const addCart = async () => { try { await addToCartSmart(p); toast.success(getToken() ? 'Added to cart' : 'କାର୍ଟରେ ଯୋଡ଼ାଗଲା · Login only at checkout') } catch (e) { toast.error(e.message) } }
  const share = async () => {
    let link = `${window.location.origin}/store/p/${p.slug}`
    try { const me = getToken() ? await sget('/referral/my-code').catch(() => null) : null; if (me?.code) link += `?ref=${me.code}` } catch {}
    const text = `${p.titleOdia || p.titleEnglish} — ${p.pricing.free ? 'FREE' : money(p.pricing.price)}\n${link}`
    if (navigator.share) { try { await navigator.share({ title: p.titleEnglish, text, url: link }) } catch {} }
    else { try { await navigator.clipboard.writeText(text); toast.success('Link copied') } catch {} }
  }

  if (err) return (<div className="min-h-screen bg-gray-50"><StoreHeader back /><div className="text-center p-10 text-gray-500">{err}</div></div>)
  if (!p) return (<div className="min-h-screen bg-gray-50"><StoreHeader back /><div className="max-w-3xl mx-auto p-4"><div className="h-56 bg-gray-100 rounded-2xl animate-pulse" /></div></div>)
  const col = classColor(p.classes?.[0] || 1)
  const previews = Array.from({ length: p.previewCount || 0 }, (_, i) => i)
  const slides = [ ...(p.coverUrl ? [{ kind: 'cover', url: p.coverUrl }] : []), ...previews.map(i => ({ kind: 'prev', idx: i })) ]
  const curSlide = slides[pi] || slides[0]
  const secWords = { 1: 'Direct download', 2: 'Your copy is personalised with your name', 3: 'Personalised + protected (no editing/copying)', 4: 'View-only inside the app (no download)' }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <StoreHeader back />
      <div className="max-w-3xl mx-auto px-3 pt-3">
        {/* gallery */}
        <div className="rounded-2xl overflow-hidden bg-white border border-gray-100">
          <div className="h-60 flex items-center justify-center" style={{ background: curSlide?.kind === 'cover' ? '#fff' : `linear-gradient(135deg, ${col}18, ${col}0a)` }}>
            {curSlide?.kind === 'cover' ? <img src={curSlide.url} alt="cover" className="h-full w-full object-contain" />
              : curSlide?.kind === 'prev' ? <img src={previewUrl(p.id, curSlide.idx)} alt="preview" className="h-full w-full object-contain" />
              : p.coverUrl ? <img src={p.coverUrl} alt="" className="h-full w-full object-contain" />
              : <div className="text-center"><div className="font-bold" style={{ color: col }}>{p.subject}</div><div className="text-xs text-gray-500 px-6">{p.titleOdia || p.titleEnglish}</div></div>}
          </div>
          {slides.length > 1 && <div className="flex gap-1.5 p-2 overflow-x-auto">{slides.map((s, i) => <button key={i} onClick={() => setPi(i)} className={`w-12 h-12 rounded-lg overflow-hidden border-2 ${pi === i ? '' : 'opacity-60'}`} style={{ borderColor: pi === i ? col : 'transparent' }}><img src={s.kind === 'cover' ? s.url : previewUrl(p.id, s.idx)} alt="" className="w-full h-full object-cover" /></button>)}</div>}
        </div>
        {/* title + price */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3">
          <div className="flex gap-1.5 flex-wrap mb-1.5">
            {p.classes?.map(c => <span key={c} className="text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: `${col}18`, color: col }}>Class {c}</span>)}
            {p.subject && <span className="text-[10px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-600">{p.subject}</span>}
            {p.exam && <span className="text-[10px] rounded px-1.5 py-0.5 bg-gray-100 text-gray-600">{p.exam}</span>}
          </div>
          <h1 className="font-extrabold text-base leading-tight" style={{ color: COLORS.indigo }}>{p.titleOdia || p.titleEnglish}</h1>
          {p.titleOdia && p.titleEnglish && <div className="text-xs text-gray-400">{p.titleEnglish}</div>}
          <div className="flex items-center gap-3 mt-1.5"><Stars avg={p.ratingAvg} count={p.ratingCount} />{p.salesCount >= 10 && <span className="text-[11px] text-gray-500">{p.salesCount} teachers bought this</span>}</div>
          <div className="mt-2"><PriceBlock pricing={p.pricing} size="lg" /></div>
          {p.pricing.savings > 0 && <div className="text-[12px] font-bold mt-0.5" style={{ color: COLORS.green }}>You save {money(p.pricing.savings)}</div>}
          {p.pricing.launchActive && p.pricing.launchEndsAt && <div className="text-[11px] mt-0.5" style={{ color: COLORS.coral }}>Launch offer ends {new Date(p.pricing.launchEndsAt).toLocaleDateString('en-IN')}</div>}
          {data.bundleSavings && <div className="text-[12px] mt-1 rounded-lg p-2" style={{ background: `${COLORS.saffron}22`, color: COLORS.indigo }}>🎁 Bundle — bought separately {money(data.bundleSavings.separately)}, you save {money(Math.max(0, data.bundleSavings.separately - p.pricing.price))}</div>}
        </div>
        {/* whats inside */}
        {p.whatsInside?.length > 0 && <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3"><div className="font-bold text-sm mb-1.5" style={{ color: COLORS.indigo }}>What’s inside</div>{p.whatsInside.map((w, i) => <div key={i} className="flex items-start gap-2 text-[13px] text-gray-700 py-0.5"><Check className="w-4 h-4 mt-0.5" style={{ color: COLORS.green }} />{w}</div>)}</div>}
        {p.fullDesc && <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3 text-[13px] text-gray-700 whitespace-pre-wrap">{p.fullDesc}</div>}
        {/* === SET: bundle upsell + sibling sets === */}
        {data.setInfo && (() => {
          const si = data.setInfo; const OD = '୦୧୨୩୪୫୬୭୮୯'; const od = (n) => String(n ?? '').replace(/[0-9]/g, x => OD[+x])
          return (<>
            {si.chapter?.owned ? (
              <div className="mt-3 flex items-center justify-between rounded-2xl p-3" style={{ background: `${COLORS.green}10` }}>
                <span className="text-[13px] font-bold" style={{ color: COLORS.green }}>ପୂରା ଅଧ୍ୟାୟ କିଣିସାରିଛନ୍ତି</span>
                <button onClick={() => router.push('/store/library')} className="text-[12px] font-bold" style={{ color: COLORS.green }}>ଖୋଲନ୍ତୁ →</button>
              </div>
            ) : si.bundle && !si.bundle.fullyOwned && (
              <div className="mt-3 rounded-2xl p-3 flex items-center gap-3" style={{ background: `${COLORS.saffron}22` }}>
                <div className="flex-1">
                  <div className="text-[13px] font-extrabold" style={{ color: COLORS.indigo }}>{si.bundle.ownedSetCount > 0 ? `ବାକି ${od(si.bundle.remaining)}ଟି ସେଟ୍` : `ଏହି ଅଧ୍ୟାୟର ସବୁ ${od(si.chapter.setCount)}ଟି ସେଟ୍`}</div>
                  <div className="text-[11px] text-gray-600">{money(si.bundle.price)} · ପ୍ରତି ପରୀକ୍ଷା ₹2{si.bundle.credit > 0 ? ` · ₹${si.bundle.credit} ଆଗରୁ ଦେଇଛନ୍ତି` : ''}</div>
                </div>
                <button onClick={async () => { try { await addToCartSmart({ id: si.chapter.id, titleOdia: si.chapter.title, price: si.bundle.price }); toast.success('ପୂରା ଅଧ୍ୟାୟ କାର୍ଟରେ ଯୋଡାଗଲା'); router.push('/store/cart') } catch (e) { toast.error(e.message) } }} className="shrink-0 text-white font-bold text-[12px] rounded-xl px-3 py-2.5" style={{ background: COLORS.indigo }}>{si.bundle.ownedSetCount > 0 ? 'ବାକି ନିଅନ୍ତୁ' : `ସବୁ ${od(si.chapter.setCount)}ଟି ନିଅନ୍ତୁ`}</button>
              </div>
            )}
            {si.siblings?.length > 1 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3">
                <div className="font-bold text-sm mb-2" style={{ color: COLORS.indigo }}>ଏହି ଅଧ୍ୟାୟର ଅନ୍ୟ ସେଟ୍</div>
                <div className="grid grid-cols-4 gap-2">
                  {si.siblings.filter(s => !s.current).map(s => (
                    <button key={s.id} onClick={() => router.push(`/store/p/${s.slug}`)} className="relative rounded-xl border p-2 text-center" style={{ borderColor: s.owned ? `${COLORS.green}66` : '#e5e7eb', background: s.owned ? `${COLORS.green}0d` : '#fff' }}>
                      <div className="mx-auto w-9 h-11 rounded bg-white border border-gray-200 relative mb-1">
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white" style={{ background: COLORS.saffron }}>{od(s.setNo)}</span>
                      </div>
                      <div className="text-[10px] font-bold" style={{ color: COLORS.indigo }}>ସେଟ୍ {od(s.setNo)}</div>
                      <div className="text-[10px] font-bold" style={{ color: s.owned ? COLORS.green : COLORS.coral }}>{s.owned ? 'କିଣିଛନ୍ତି' : money(s.pricing.price)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>)
        })()}
        {/* files + security */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3">
          <div className="text-[12px] text-gray-500">Files: {p.files?.map(f => `${f.kind.toUpperCase()}${f.pages ? ` (${f.pages}p)` : ''}`).join(', ') || '—'} • {p.language === 'english' ? 'English' : 'Odia'}</div>
          <div className="flex items-start gap-2 mt-2 text-[12px] text-gray-700"><ShieldCheck className="w-4 h-4 mt-0.5" style={{ color: COLORS.sky }} />{secWords[p.securityLevel]}</div>
        </div>
        {/* reviews */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 mt-3">
          <div className="font-bold text-sm mb-1.5" style={{ color: COLORS.indigo }}>Reviews {reviews?.length ? `(${reviews.length})` : ''}</div>
          {p.owned && (
            <div className="bg-gray-50 rounded-xl p-2.5 mb-2">
              <div className="flex gap-1 mb-1.5">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setRStar(n)} className="text-lg" style={{ color: n <= rStar ? '#f59e0b' : '#d1d5db' }}>★</button>)}</div>
              <textarea value={rText} onChange={e => setRText(e.target.value)} rows={2} placeholder="Share your experience (optional)" className="w-full border rounded-lg p-2 text-[13px]" />
              <button onClick={submitReview} className="mt-1.5 text-[12px] font-bold text-white rounded-full px-4 py-1.5" style={{ background: COLORS.indigo }}>Post review</button>
            </div>
          )}
          {reviews === null && <div className="text-[12px] text-gray-400">Loading…</div>}
          {reviews?.length === 0 && <div className="text-[12px] text-gray-400">No reviews yet{p.owned ? ' — be the first!' : ''}.</div>}
          {reviews?.map(r => (
            <div key={r.id} className="border-t border-gray-100 py-2 first:border-0">
              <div className="flex items-center gap-2"><span className="text-amber-500 text-[12px]">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span><span className="text-[12px] font-bold text-gray-700">{r.userName}</span></div>
              {r.text && <div className="text-[12px] text-gray-600 mt-0.5">{r.text}</div>}
            </div>
          ))}
        </div>
      </div>
      {/* sticky buy bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
        <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center gap-2">
          <button onClick={share} className="p-2.5 rounded-full border border-gray-200" style={{ color: COLORS.sky }}><Share2 className="w-5 h-5" /></button>
          {p.owned ? (
            <button onClick={() => router.push('/store/library')} className="flex-1 font-bold text-white rounded-full py-3" style={{ background: COLORS.green }}>Open in My Library</button>
          ) : (<>
            <button onClick={addCart} className="px-4 py-3 rounded-full border font-bold text-sm" style={{ borderColor: COLORS.indigo, color: COLORS.indigo }}>+ Cart</button>
            <button onClick={buy} className="flex-1 font-extrabold text-white rounded-full py-3" style={{ background: COLORS.coral }}>Buy now • {p.pricing.free ? 'FREE' : money(p.pricing.price)}</button>
          </>)}
        </div>
      </div>
    </div>
  )
}
