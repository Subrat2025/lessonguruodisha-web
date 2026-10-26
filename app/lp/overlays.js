// ============================================================================
// /lp — Overlays (Sticky bar, Floating notifications, Exit intent, Splash)
// ============================================================================
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, Rocket, Zap, X, Sparkles, MapPin, ArrowRight } from 'lucide-react'
import { track } from './tracking'
import { WHATSAPP_URL, PLANS_URL } from './sections'

// ==========================================================================
// LoadingSplash — 2 second premium intro
// ==========================================================================
export const LoadingSplash = () => {
  const [show, setShow] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 1800)
    return () => clearTimeout(t)
  }, [])
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[100] bg-white flex items-center justify-center"
          aria-hidden
        >
          <div className="text-center">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-[#0B5FFF] to-[#FF9800] flex items-center justify-center text-white text-3xl font-black shadow-2xl"
            >
              L
            </motion.div>
            <motion.div
              initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mt-4 text-xl font-black text-slate-900"
            >
              LessonGuru <span className="text-[#0B5FFF]">Odisha</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
              className="mt-2 text-xs text-slate-500 uppercase tracking-widest"
            >
              Odisha ର #୧ Premium Platform
            </motion.div>
            <div className="mt-6 flex items-center justify-center gap-1">
              {[0,1,2].map(i => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-[#0B5FFF]"
                  animate={{ y: [0, -6, 0], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==========================================================================
// Sticky Bottom CTA — always visible on mobile
// ==========================================================================
export const StickyBottomCTA = ({ onTryDemo }) => (
  <div className="fixed bottom-0 left-0 right-0 z-40 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 px-3 bg-gradient-to-t from-white via-white/95 to-white/70 backdrop-blur border-t border-slate-200/70 shadow-[0_-8px_30px_-10px_rgba(0,0,0,0.15)]">
    <div className="max-w-3xl mx-auto grid grid-cols-3 gap-2">
      <a
        href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
        onClick={() => track({ fb: 'Contact', ga: 'whatsapp_click', props: { location: 'sticky_bar' } })}
        className="flex items-center justify-center gap-1.5 rounded-full py-3 bg-[#22C55E] text-white text-xs sm:text-sm font-bold shadow-md active:scale-[0.97]"
      >
        <MessageCircle className="w-4 h-4" /> WhatsApp
      </a>
      <button
        onClick={() => { track({ fb: 'Lead', ga: 'try_demo_click', props: { location: 'sticky_bar' } }); onTryDemo?.() }}
        className="flex items-center justify-center gap-1.5 rounded-full py-3 bg-[#0B5FFF] text-white text-xs sm:text-sm font-bold shadow-md active:scale-[0.97]"
      >
        <Rocket className="w-4 h-4" /> Try Demo
      </button>
      <a
        href={PLANS_URL}
        onClick={() => track({ fb: 'InitiateCheckout', ga: 'buy_premium_click', props: { location: 'sticky_bar' } })}
        className="flex items-center justify-center gap-1.5 rounded-full py-3 bg-gradient-to-r from-[#FF9800] to-[#FF6A00] text-white text-xs sm:text-sm font-bold shadow-md active:scale-[0.97]"
      >
        <Zap className="w-4 h-4" /> Buy Now
      </a>
    </div>
  </div>
)

// ==========================================================================
// FloatingWhatsApp — round WA button, right-bottom (above the sticky bar)
// ==========================================================================
export const FloatingWhatsApp = () => (
  <a
    href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
    aria-label="WhatsApp us"
    onClick={() => track({ fb: 'Contact', ga: 'whatsapp_click', props: { location: 'floating' } })}
    className="fixed right-3 bottom-[92px] sm:bottom-[92px] z-30 w-14 h-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-[0_15px_30px_-5px_rgba(37,211,102,0.6)] hover:scale-105 active:scale-95 transition-transform"
  >
    <MessageCircle className="w-6 h-6" />
    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white ring-2 ring-[#25D366] animate-pulse" />
  </a>
)

// ==========================================================================
// FloatingNotifications — scripted social proof popups
// ==========================================================================
export const FloatingNotifications = () => {
  const items = useMemo(() => ([
    { name: 'ଗଞ୍ଜାମର ଜଣେ ଶିକ୍ଷକ',   action: 'Lesson Plan Generate କଲେ', emoji: '📝' },
    { name: 'କଟକର ଜଣେ ଶିକ୍ଷକ',    action: 'Premium ନେଲେ',              emoji: '🎉' },
    { name: 'ବାଲେଶ୍ୱରର ଜଣେ ଶିକ୍ଷକ', action: 'Worksheet Download କଲେ',   emoji: '📄' },
    { name: 'ଖୋର୍ଦ୍ଧାର ଜଣେ ଶିକ୍ଷକ',  action: 'Question Bank ଦେଖିଲେ',     emoji: '❓' },
    { name: 'ସମ୍ବଲପୁରର ଜଣେ ଶିକ୍ଷକ', action: 'Assessment Generate କଲେ',  emoji: '✅' },
    { name: 'ପୁରୀର ଜଣେ ଶିକ୍ଷକ',     action: 'Yearly Plan ନେଲେ',         emoji: '🎁' },
    { name: 'ଢେଙ୍କାନାଳର ଜଣେ ଶିକ୍ଷକ', action: 'Books Library ଦେଖିଲେ',     emoji: '📚' },
    { name: 'କେନ୍ଦ୍ରାପଡ଼ାର ଜଣେ ଶିକ୍ଷକ', action: 'Panchapadi Plan Download କଲେ', emoji: '📘' },
  ]), [])
  const [current, setCurrent] = useState(null)
  const idxRef = useRef(0)
  useEffect(() => {
    // Start after 5s, then repeat every ~25s (10s visible + 15s gap)
    let show
    const cycle = () => {
      const it = items[idxRef.current % items.length]
      idxRef.current += 1
      setCurrent({ ...it, seconds: 2 + Math.floor(Math.random() * 8) })
      show = setTimeout(() => setCurrent(null), 5500)
    }
    const first = setTimeout(cycle, 5000)
    const interval = setInterval(cycle, 22000)
    return () => { clearTimeout(first); clearTimeout(show); clearInterval(interval) }
  }, [items])

  return (
    <div className="fixed left-3 bottom-[92px] z-30 pointer-events-none">
      <AnimatePresence>
        {current && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 22 }}
            className="pointer-events-auto rounded-2xl bg-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.25)] ring-1 ring-slate-100 pl-2 pr-3 py-2 flex items-center gap-2 max-w-[85vw]"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0B5FFF] to-[#3B82F6] flex items-center justify-center text-white text-lg">
              {current.emoji}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-slate-900 truncate flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#0B5FFF]" />
                {current.name}
              </div>
              <div className="text-[11px] text-slate-600 truncate">{current.action}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{current.seconds} minutes ago</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ==========================================================================
// ExitIntentModal — mouse-out (desktop) + scroll-up-fast (mobile) trigger
// ==========================================================================
export const ExitIntentModal = ({ onTryDemo }) => {
  const [open, setOpen] = useState(false)
  const shownRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem('lp_exit_shown') === '1') return

    // Desktop: mouse leaves top of viewport
    const onMouseLeave = (e) => {
      if (shownRef.current) return
      if (e.clientY <= 0) trigger()
    }
    // Mobile: fast upward scroll near top (proxy for "back gesture")
    let lastY = window.scrollY, lastT = Date.now()
    const onScroll = () => {
      if (shownRef.current) return
      const y = window.scrollY, t = Date.now(), dy = y - lastY, dt = t - lastT
      if (dy < -40 && dt < 300 && y < 200) trigger()
      lastY = y; lastT = t
    }
    // Fallback timer: 45s inactivity
    const timer = setTimeout(() => { if (!shownRef.current) trigger() }, 45000)

    const trigger = () => {
      if (shownRef.current) return
      shownRef.current = true
      setOpen(true)
      try { sessionStorage.setItem('lp_exit_shown', '1') } catch {}
      track({ fb: 'ViewContent', ga: 'exit_intent_shown', custom: true })
    }
    document.addEventListener('mouseout', onMouseLeave)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('mouseout', onMouseLeave)
      window.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
    }
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 22 }}
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF9800] to-[#FF6A00] text-white flex items-center justify-center shadow-lg">
              <Sparkles className="w-7 h-7" />
            </div>
            <div className="mt-4 text-xl font-black text-slate-900 leading-tight">
              ଯିବା ପୂର୍ବରୁ ମାଗଣା Demo ଦେଖନ୍ତୁ!
            </div>
            <div className="mt-2 text-sm text-slate-600 leading-relaxed">
              ମାତ୍ର ୨ ମିନିଟରେ Panchapadi ପାଠ ଯୋଜନା କିପରି ପ୍ରସ୍ତୁତ ହୁଏ — ଦେଖନ୍ତୁ। ପସନ୍ଦ ଆସିଲେ ପରେ Premium ନେବେ।
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2">
              <button
                onClick={() => {
                  track({ fb: 'Lead', ga: 'try_demo_click', props: { location: 'exit_intent' } })
                  setOpen(false); onTryDemo?.()
                }}
                className="w-full rounded-full py-3.5 bg-[#0B5FFF] text-white font-bold shadow-lg hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                🎥 Demo ଦେଖନ୍ତୁ (Free) <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
                onClick={() => track({ fb: 'Contact', ga: 'whatsapp_click', props: { location: 'exit_intent' } })}
                className="w-full rounded-full py-3.5 bg-[#22C55E] text-white font-bold shadow-lg hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                💬 WhatsApp ରେ ପଚାରନ୍ତୁ
              </a>
              <button
                onClick={() => setOpen(false)}
                className="w-full text-slate-500 text-sm py-2 hover:text-slate-700"
              >
                No thanks, exit anyway
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ==========================================================================
// ScrollDepthTracker — fires custom scroll-depth events to FB/GA
// ==========================================================================
export const ScrollDepthTracker = () => {
  const firedRef = useRef({ 25: false, 50: false, 75: false, 100: false })
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const total = doc.scrollHeight - window.innerHeight
      if (total <= 0) return
      const p = Math.min(100, Math.round((window.scrollY / total) * 100))
      const marks = [25, 50, 75, 100]
      for (const m of marks) {
        if (p >= m && !firedRef.current[m]) {
          firedRef.current[m] = true
          track({ fb: `ScrollDepth${m}`, custom: true, ga: 'scroll_depth', props: { percent: m } })
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return null
}
