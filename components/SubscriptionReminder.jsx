'use client'
// ============================================================================
//  SubscriptionReminder — Renewal banner shown when subscription is about to
//                        expire (within 3 days) or has already expired.
// ============================================================================
//  Behavior:
//   • ≤ 3 days to expiry → AMBER "expires in N days" reminder (dismissible for 8 hours)
//   • Already expired    → RED   "your subscription has ended" notice (dismissible for 4 hours)
//   • Hidden on the plans/checkout/login/register/forgot pages (no self-nagging)
//   • Trial users (no subscription yet) are not shown this banner — they see
//     the app's existing "upgrade" prompts elsewhere.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, X, Sparkles, Zap, MessageCircle } from 'lucide-react'
import { openRenewalWhatsApp } from '@/lib/renewal-whatsapp'

const HIDE_ON_VIEWS = new Set(['login', 'register', 'forgot', 'plans', 'contact', 'change-password'])
const STORAGE_KEY = 'em_subrem_dismissed_v1'

// Read/write dismissal state so the banner doesn't nag users every render.
const readDismiss = () => {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
const writeDismiss = (bucket, hours) => {
  try {
    const until = Date.now() + hours * 3600 * 1000
    const cur = readDismiss() || {}
    cur[bucket] = until
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cur))
  } catch {}
}
const isDismissed = (bucket) => {
  const cur = readDismiss(); if (!cur) return false
  return Number(cur[bucket] || 0) > Date.now()
}

export default function SubscriptionReminder({ user, view, onRenew }) {
  const [tick, setTick] = useState(0)   // rerender when user dismisses

  const state = useMemo(() => {
    if (!user) return null
    if (HIDE_ON_VIEWS.has(view)) return null
    const sub = user.subscription || null
    // No subscription record yet → no reminder (handled elsewhere)
    if (!sub || !sub.expiryDate) return null
    const now = new Date()
    const expiry = new Date(sub.expiryDate)
    // Lifetime plan → never expires
    if (sub.plan === 'lifetime' || expiry - now > 365 * 10 * 86400000) return null
    const ms = expiry.getTime() - now.getTime()
    const days = Math.ceil(ms / 86400000)
    const status = sub.status || (ms > 0 ? 'active' : 'expired')

    if (ms <= 0 || status !== 'active') {
      return { kind: 'expired', expiredDaysAgo: Math.max(0, -Math.ceil(ms / 86400000)), planLabel: sub.plan || 'Premium' }
    }
    if (days <= 3) {
      return { kind: 'expiring', daysLeft: Math.max(0, days), planLabel: sub.plan || 'Premium', expiryStr: expiry.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) }
    }
    return null
  }, [user, view, tick])

  // Recompute daily — expiry rolls over at midnight
  useEffect(() => {
    if (!state) return
    const t = setTimeout(() => setTick(x => x + 1), 6 * 3600 * 1000) // every 6h
    return () => clearTimeout(t)
  }, [state])

  if (!state) return null
  const bucket = state.kind === 'expired' ? 'expired' : `expiring-${state.daysLeft}`
  if (isDismissed(bucket)) return null

  const dismiss = () => {
    writeDismiss(bucket, state.kind === 'expired' ? 4 : 8)
    setTick(x => x + 1)
  }
  const go = () => {
    onRenew?.()   // App uses this to setView('plans')
  }

  // -------- EXPIRED (red) --------
  if (state.kind === 'expired') {
    return (
      <div className="sticky top-0 z-30 w-full bg-gradient-to-r from-red-600 via-rose-600 to-red-700 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-3 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] sm:text-sm font-bold leading-tight">
              ଆପଣଙ୍କର Premium Subscription ସମାପ୍ତ ହୋଇଛି
              {state.expiredDaysAgo > 0 && (
                <span className="ml-1 opacity-80 font-normal">· {state.expiredDaysAgo} day{state.expiredDaysAgo > 1 ? 's' : ''} ago</span>
              )}
            </div>
            <div className="text-[11px] sm:text-xs opacity-90 leading-tight hidden sm:block">
              Continue using all Premium features — Renew now.
            </div>
          </div>
          <button
            onClick={go}
            className="inline-flex items-center gap-1 rounded-full bg-white text-red-700 px-3 py-1.5 text-[12px] sm:text-sm font-bold shadow-sm hover:brightness-110 active:scale-95"
          >
            <Zap className="w-3.5 h-3.5" /> Renew Now
          </button>
          <button
            onClick={() => openRenewalWhatsApp()}
            aria-label="Renew via WhatsApp"
            className="inline-flex items-center gap-1 rounded-full bg-[#25D366] text-white px-2.5 sm:px-3 py-1.5 text-[12px] sm:text-sm font-bold shadow-sm hover:brightness-110 active:scale-95"
          >
            <MessageCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">WhatsApp</span>
          </button>
          <button aria-label="Dismiss" onClick={dismiss} className="p-1 rounded-full hover:bg-white/15 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  // -------- EXPIRING SOON (amber) --------
  const dayLabel = state.daysLeft === 0
    ? 'today'
    : state.daysLeft === 1 ? '1 day'
    : `${state.daysLeft} days`
  const dayLabelOdia = state.daysLeft === 0
    ? 'ଆଜି'
    : state.daysLeft === 1 ? '୧ ଦିନ ମଧ୍ୟରେ'
    : state.daysLeft === 2 ? '୨ ଦିନ ମଧ୍ୟରେ'
    : '୩ ଦିନ ମଧ୍ୟରେ'
  return (
    <div className="sticky top-0 z-30 w-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 text-white shadow-md">
      <div className="max-w-5xl mx-auto px-3 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-3">
        <Sparkles className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] sm:text-sm font-bold leading-tight">
            ଆପଣଙ୍କର Premium {dayLabelOdia} ଶେଷ ହେବ
            <span className="ml-1 opacity-80 font-normal">· expires {dayLabel} ({state.expiryStr})</span>
          </div>
          <div className="text-[11px] sm:text-xs opacity-90 leading-tight hidden sm:block">
            Renew now to keep uninterrupted access.
          </div>
        </div>
        <button
          onClick={go}
          className="inline-flex items-center gap-1 rounded-full bg-white text-orange-700 px-3 py-1.5 text-[12px] sm:text-sm font-bold shadow-sm hover:brightness-110 active:scale-95"
        >
          <Zap className="w-3.5 h-3.5" /> Renew
        </button>
        <button aria-label="Dismiss" onClick={dismiss} className="p-1 rounded-full hover:bg-white/15 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
