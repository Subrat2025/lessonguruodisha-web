'use client'
import React, { useEffect, useState } from 'react'
import { Home, BookOpen, Search, Crown, User as UserIcon } from 'lucide-react'
import { inNativeApp } from '@/lib/in-app'

// Colourful shared bottom navigation. Rendered once at the app root so every
// SPA view (home, lessons, search, premium, profile, admin, lesson/PDF viewer,
// login, create-account) gets the same bar. The centre "Premium" is a raised
// gold button with a PRO badge. Mobile-first, centred at max-width 440px.
//
// Props:
//   view : current SPA view id
//   go   : (id) => void  navigation callback
const ITEMS = [
  { id: 'home', label: 'Home', Icon: Home, color: '#2563EB', tile: '#DBEAFE' },
  { id: 'classes', label: 'Lessons', Icon: BookOpen, color: '#0D9488', tile: '#CCFBF1' },
  { id: 'search', label: 'Search', Icon: Search, color: '#EA580C', tile: '#FFEDD5' },
  { id: 'plans', label: 'Premium', Icon: Crown, color: '#D97706', center: true },
  { id: 'profile', label: 'Profile', Icon: UserIcon, color: '#DB2777', tile: '#FCE7F3' },
]

const isActive = (id, view) =>
  view === id ||
  (id === 'classes' && ['books', 'chapters', 'lessons', 'lesson-view'].includes(view)) ||
  (id === 'profile' && ['admin', 'change-password', 'dashboard'].includes(view))

export default function AppBottomNav({ view, go }) {
  // In the Android app nothing is sold, so the centre button is a plain "My Plan" status page
  const [inApp, setInApp] = useState(false)
  useEffect(() => { setInApp(inNativeApp()) }, [])
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div
        className="max-w-[440px] mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-black/5 dark:border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5 items-end px-1 pt-1.5 pb-1">
          {ITEMS.map((it) => {
            const active = isActive(it.id, view)
            const { Icon } = it

            // Centre Premium — raised gold button with PRO badge.
            if (it.center) {
              return (
                <button
                  key={it.id}
                  onClick={() => go(it.id)}
                  className="relative flex flex-col items-center justify-end -mt-5 focus:outline-none"
                  aria-label={inApp ? 'My Plan' : 'Premium'}
                >
                  {!inApp && <span className="absolute -top-4 right-5 z-10 px-1.5 py-[1px] rounded-full bg-rose-500 text-white text-[8px] font-extrabold shadow">PRO</span>}
                  <span
                    className="grid place-items-center w-14 h-14 rounded-full text-white shadow-lg ring-4 ring-white dark:ring-slate-900 transition-transform active:scale-95"
                    style={{ background: 'radial-gradient(circle at 30% 25%, #FDE047, #F59E0B 70%)', boxShadow: '0 10px 22px rgba(245,158,11,.5)' }}
                  >
                    <Crown className="w-6 h-6" strokeWidth={2.5} fill="rgba(255,255,255,.35)" />
                  </span>
                  <span className="mt-1 text-[10px] font-extrabold" style={{ color: it.color }}>{inApp ? 'My Plan' : it.label}</span>
                </button>
              )
            }

            return (
              <button
                key={it.id}
                onClick={() => go(it.id)}
                className="flex flex-col items-center justify-center py-1.5 gap-1 focus:outline-none"
                aria-label={it.label}
              >
                <span
                  className="grid place-items-center w-10 h-10 rounded-2xl transition-all"
                  style={{
                    background: active ? it.color : it.tile,
                    transform: active ? 'translateY(-2px) scale(1.06)' : 'none',
                    boxShadow: active ? `0 6px 14px ${it.color}55` : 'none',
                  }}
                >
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.6 : 2.2} style={{ color: active ? '#fff' : it.color }} />
                </span>
                <span
                  className="text-[10px] transition-all"
                  style={{ color: it.color, fontWeight: active ? 800 : 600 }}
                >
                  {it.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
