'use client'
// ============================================================================
//  📢 PromoAd — user-facing promotional card (reusable Ads module)
//  • Live mode: fetches GET /ads/active?placement=… (server decides schedule +
//    frequency), records impression/click, honours show-once-per-session, and
//    is always dismissible so it can NEVER block the app.
//  • Preview mode: renders supplied content at a chosen device width (used by
//    the Admin manager) with NO fetching / tracking.
// ============================================================================
import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const deviceOf = () => {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w < 640) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

// Built-in API fallback so standalone pages (store, My Library) can mount
// <PromoAd placement="…" /> without threading an `api` helper through props.
const _defaultApi = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  return res.json().catch(() => ({}))
}

// Pure visual card — used by both live + preview modes.
export const AdCard = ({ content = {}, variant = 'auto', onOpen }) => {
  const c = content || {}
  const forceMobile = variant === 'mobile'
  const forceDesktop = variant === 'desktop' || variant === 'tablet'
  const open = () => { if (onOpen) onOpen() }
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-300 dark:border-emerald-800 shadow-lg bg-gradient-to-br from-emerald-50 via-yellow-50 to-white dark:from-emerald-950/40 dark:via-amber-950/20 dark:to-slate-900">
      {/* tiny truthful label — internal promo, not a Google ad */}
      <span className="absolute top-2 right-9 z-10 text-[8px] font-bold uppercase tracking-wide bg-black/10 dark:bg-white/10 text-muted-foreground px-1.5 py-0.5 rounded-full">Promotion</span>
      <div className={`flex ${forceMobile ? 'flex-col' : 'flex-col sm:flex-row'} items-stretch`}>
        {/* Creative */}
        <button type="button" onClick={open} className={`shrink-0 ${forceMobile ? 'w-full' : 'w-full sm:w-[42%]'} bg-white/40`}>
          {c.imageUrl ? (
            <img src={c.imageUrl} alt={c.headline || 'Promotion'} className="w-full h-full object-cover max-h-64 sm:max-h-none" loading="lazy" />
          ) : (
            <div className="w-full h-40 flex items-center justify-center text-4xl">🖼️</div>
          )}
        </button>
        {/* Copy */}
        <div className="flex-1 p-3.5 flex flex-col justify-center min-w-0">
          {/* Mobile-compact copy */}
          <div className={`${forceDesktop ? 'hidden' : forceMobile ? 'block' : 'block sm:hidden'}`}>
            <p className="font-extrabold text-[15px] leading-tight text-emerald-900 dark:text-emerald-200" lang="or">{c.headlineMobile || c.headline}</p>
            {(c.subheadlineMobile || c.subheadline) && <p className="text-[12px] mt-1 font-semibold text-foreground/80" lang="or">{c.subheadlineMobile || c.subheadline}</p>}
            {c.featuresMobileText && <p className="text-[11px] mt-1.5 text-muted-foreground">{c.featuresMobileText}</p>}
          </div>
          {/* Desktop / tablet full copy */}
          <div className={`${forceMobile ? 'hidden' : forceDesktop ? 'block' : 'hidden sm:block'}`}>
            <p className="font-extrabold text-lg leading-tight text-emerald-900 dark:text-emerald-200" lang="or">{c.headline}</p>
            {c.subheadline && <p className="text-[13px] mt-1 font-semibold text-foreground/80" lang="or">{c.subheadline}</p>}
            {Array.isArray(c.features) && c.features.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.features.map((f, i) => (
                  <span key={i} className="text-[11px] font-semibold bg-white/70 dark:bg-white/10 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5">{f}</span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={open}
            className="mt-3 self-start inline-flex items-center gap-1 rounded-xl px-4 py-2 text-sm font-extrabold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-md active:scale-[0.98] transition"
            lang="or"
          >
            {c.ctaText || '🚀 ଏବେ ଦେଖନ୍ତୁ'}
          </button>
        </div>
      </div>
    </div>
  )
}

const PromoAd = ({ api, placement = 'home', preview = false, previewData = null, previewVariant = 'desktop' }) => {
  const [ad, setAd] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const apiFn = typeof api === 'function' ? api : _defaultApi

  useEffect(() => {
    if (preview) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await apiFn(`/ads/active?placement=${encodeURIComponent(placement)}&_t=${Date.now()}`)
        if (cancelled || !r?.ad) return
        const a = r.ad
        const shownKey = `em_ad_shown_${a.id}_${placement}`
        if (a.showOncePerSession && typeof window !== 'undefined' && sessionStorage.getItem(shownKey)) return
        setAd(a)
        // Record impression (once) + set session flag.
        try {
          if (typeof window !== 'undefined') sessionStorage.setItem(shownKey, '1')
          apiFn(`/ads/${a.id}/event`, { method: 'POST', body: { action: 'impression', placement, device: deviceOf() } }).catch(() => {})
        } catch {}
      } catch { /* silent — ads must never break the page */ }
    })()
    return () => { cancelled = true }
  }, [api, placement, preview]) // eslint-disable-line

  // ---- Preview mode ----
  if (preview) {
    const widths = { mobile: 380, tablet: 640, desktop: 900 }
    return (
      <div className="mx-auto" style={{ maxWidth: widths[previewVariant] || 900 }}>
        <AdCard content={previewData || {}} variant={previewVariant} onOpen={() => {}} />
      </div>
    )
  }

  // ---- Live mode ----
  if (!ad || dismissed) return null
  const openDestination = () => {
    const url = ad?.content?.destinationUrl
    apiFn(`/ads/${ad.id}/event`, { method: 'POST', body: { action: 'click', placement, device: deviceOf() } }).catch(() => {})
    if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer')
  }
  return (
    <div className="px-4 mt-4 mb-24">
      <div className="relative">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="absolute top-2 right-2 z-20 h-6 w-6 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <AdCard content={ad.content} variant="auto" onOpen={openDestination} />
      </div>
    </div>
  )
}

export default PromoAd
