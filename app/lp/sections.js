// ============================================================================
// /lp — Landing Page Sections
// ============================================================================
// All hero → footer sections for the Facebook Ads landing page.  Kept in one
// file (instead of many tiny components) so the whole page-flow is easy to
// read and audit.  Every CTA fires unified tracking via `track()`.
// ============================================================================
'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, useScroll, useSpring, AnimatePresence } from 'framer-motion'
import {
  Sparkles, BookOpen, ClipboardList, PenSquare, Library, HelpCircle,
  Target, GraduationCap, ScrollText, CalendarRange, CalendarDays, Users,
  FlaskConical, StickyNote, Wand2, FileText, Play, ShieldCheck, Timer,
  MessageCircle, Zap, Star, ArrowDown, ArrowRight, Check, X, Search,
  ChevronDown, Rocket, TrendingUp, Award, Heart, MapPin, Loader2, Download,
  Lock,
} from 'lucide-react'
import { track } from './tracking'

// ==========================================================================
// Constants
// ==========================================================================
export const LP_COLORS = {
  primary: '#0B5FFF',
  primarySoft: '#EEF3FF',
  accent: '#FF9800',
  accentSoft: '#FFF3E0',
  success: '#22C55E',
  successSoft: '#DCFCE7',
}
export const WHATSAPP_NUMBER = '918093414633' // country code prefixed
export const WHATSAPP_TEXT = encodeURIComponent(
  'Hi! ମୁଁ LessonGuru Odisha Premium ବିଷୟରେ ଜାଣିବାକୁ ଚାହୁଁଛି।'
)
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_TEXT}`
export const APP_URL = '/'
export const PLANS_URL = '/plans'

// ==========================================================================
// Shared helper components
// ==========================================================================
const gradientBlueOrange = 'bg-[radial-gradient(circle_at_20%_10%,#e8f0ff_0%,transparent_45%),radial-gradient(circle_at_100%_100%,#fff2e0_0%,transparent_45%)]'

const SectionTitle = ({ eyebrow, title, subtitle, className = '' }) => (
  <div className={`text-center max-w-2xl mx-auto ${className}`}>
    {eyebrow ? (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-[#0B5FFF]/8 text-[#0B5FFF]">
        <Sparkles className="w-3.5 h-3.5" />
        <span>{eyebrow}</span>
      </div>
    ) : null}
    <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-[1.1]">{title}</h2>
    {subtitle ? <p className="mt-3 text-base sm:text-lg text-slate-600 leading-relaxed">{subtitle}</p> : null}
  </div>
)

const CTAButton = ({ href, onClick, variant = 'primary', size = 'lg', children, className = '', target }) => {
  const base = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all active:scale-[0.97] focus:outline-none focus:ring-4'
  const sizes = { lg: 'px-6 py-3.5 text-[15px]', xl: 'px-8 py-4 text-base', md: 'px-5 py-2.5 text-sm' }
  const variants = {
    primary: 'bg-[#0B5FFF] text-white shadow-[0_10px_30px_-10px_rgba(11,95,255,0.6)] hover:shadow-[0_16px_40px_-10px_rgba(11,95,255,0.7)] focus:ring-blue-200',
    accent: 'bg-gradient-to-r from-[#FF9800] to-[#FF6A00] text-white shadow-[0_10px_30px_-10px_rgba(255,152,0,0.7)] hover:shadow-[0_16px_40px_-10px_rgba(255,152,0,0.8)] focus:ring-orange-200',
    success: 'bg-[#22C55E] text-white shadow-[0_10px_30px_-10px_rgba(34,197,94,0.6)] hover:shadow-[0_16px_40px_-10px_rgba(34,197,94,0.7)] focus:ring-green-200',
    outline: 'bg-white text-slate-900 border border-slate-200 hover:border-slate-300 shadow-sm',
    ghost: 'bg-white/60 backdrop-blur text-slate-900 border border-white/60 hover:bg-white/80',
  }
  const cls = `${base} ${sizes[size]} ${variants[variant]} ${className}`
  if (href) return <a href={href} target={target} rel={target === '_blank' ? 'noopener noreferrer' : undefined} onClick={onClick} className={cls}>{children}</a>
  return <button onClick={onClick} className={cls}>{children}</button>
}

// ==========================================================================
// Urgency Bar (very top)
// ==========================================================================
export const UrgencyBar = ({ text }) => (
  <div className="w-full bg-gradient-to-r from-[#FF6A00] via-[#FF9800] to-[#FF6A00] text-white text-[12px] sm:text-sm font-semibold overflow-hidden">
    <div className="max-w-6xl mx-auto px-3 py-2 flex items-center justify-center gap-2">
      <span className="text-[13px] leading-none">🔥</span>
      <span className="truncate">{text || 'ଆଜି Premium ନେଇ Lesson Plan ତୁରନ୍ତ Generate କରନ୍ତୁ · ₹499 ରୁ ଆରମ୍ଭ'}</span>
    </div>
  </div>
)

// ==========================================================================
// 🕒 Visitor 24-hour Countdown Timer
// ==========================================================================
// Each visitor gets their own 24-hour offer window that starts the FIRST time
// they land on /lp.  Timestamp is persisted in localStorage so the countdown
// survives page reloads but every browser (each visitor) sees a fresh 24 h.
// After it hits zero, the bar shows an "Offer expired" message.
// ==========================================================================
export const VisitorCountdown = ({ config }) => {
  const [now, setNow] = useState(Date.now())
  const [startTs, setStartTs] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = 'lg_lp_visit_start_v2'
    let ts = Number(localStorage.getItem(key))
    if (!ts || Number.isNaN(ts) || ts > Date.now()) {
      ts = Date.now()
      localStorage.setItem(key, String(ts))
    }
    setStartTs(ts)
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!startTs) return null
  const durationMs = Math.max(1, Number(config?.timerDurationHours) || 24) * 3600 * 1000
  const remainMs = Math.max(0, (startTs + durationMs) - now)
  const expired = remainMs <= 0
  const h = Math.floor(remainMs / 3_600_000)
  const m = Math.floor((remainMs % 3_600_000) / 60_000)
  const s = Math.floor((remainMs % 60_000) / 1000)
  const pad = (n) => String(n).padStart(2, '0')

  return (
    <div className={`w-full ${expired ? 'bg-slate-700' : 'bg-gradient-to-r from-red-600 via-rose-600 to-orange-600'} text-white text-[12px] sm:text-[13px] font-semibold overflow-hidden`}>
      <div className="max-w-6xl mx-auto px-3 py-2 flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        {expired ? (
          <span>{config?.timerExpiredText || '⌛ Offer expired'}</span>
        ) : (
          <>
            <span className="hidden sm:inline">{config?.timerHeadline || '⚡ ଏହି Offer ଆପଣଙ୍କ ପାଇଁ ମାତ୍ର'}</span>
            <span className="sm:hidden">⚡ Offer ends in</span>
            <span className="inline-flex items-center gap-1 font-mono text-[13px] sm:text-[14px]">
              <span className="bg-black/30 backdrop-blur px-1.5 py-0.5 rounded">{pad(h)}h</span>
              <span className="bg-black/30 backdrop-blur px-1.5 py-0.5 rounded">{pad(m)}m</span>
              <span className="bg-black/30 backdrop-blur px-1.5 py-0.5 rounded animate-pulse">{pad(s)}s</span>
            </span>
            <span className="hidden md:inline opacity-90 text-[11px]">· {config?.timerSubText || 'ଏଥିପରେ Price ପୁଣି ପୂର୍ବଵତ ହୋଇଯିବ'}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ==========================================================================
// Scroll Progress Bar (top, sticky)
// ==========================================================================
export const ScrollProgressBar = () => {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 })
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed left-0 right-0 top-0 z-[60] h-[3px] origin-left bg-[#0B5FFF]"
      aria-hidden
    />
  )
}

// ==========================================================================
// Hero
// ==========================================================================
export const Hero = ({ onTryDemo }) => (
  <section className={`relative overflow-hidden ${gradientBlueOrange}`} id="hero">
    {/* Background decorations */}
    <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-[#0B5FFF]/15 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-[#FF9800]/20 blur-3xl" />

    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-14 grid md:grid-cols-2 gap-10 md:gap-8 items-center">
      {/* Left column */}
      <div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur border border-[#0B5FFF]/15 text-[12px] font-semibold text-[#0B5FFF]"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Odisha ର #୧ Premium Lesson Plan Platform</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="mt-4 text-[34px] sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight text-slate-900"
        >
          <span className="block">୨ ମିନିଟରେ</span>
          <span className="block bg-gradient-to-r from-[#0B5FFF] via-[#3B82F6] to-[#FF9800] bg-clip-text text-transparent">
            ପାଠ ଯୋଜନା ପ୍ରସ୍ତୁତ
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="mt-4 text-slate-700 text-[15px] sm:text-lg leading-relaxed"
        >
          Balvatika ରୁ Class 10 · Panchapadi Lesson Plan · Worksheet · Homework · Question Bank · LO Code · Assessment · Annual Plan · Monthly Plan · Classroom Transaction — ସବୁକିଛି ଏକ Platform ରେ।
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.15 }}
          className="mt-6 flex flex-wrap gap-3"
        >
          <CTAButton
            variant="primary" size="xl"
            onClick={() => { track({ fb: 'Lead', ga: 'try_demo_click', props: { location: 'hero' } }); onTryDemo?.() }}
          >
            <Rocket className="w-5 h-5" /> Try Free Demo
          </CTAButton>
          <CTAButton
            variant="success" size="xl" href={WHATSAPP_URL} target="_blank"
            onClick={() => track({ fb: 'Contact', ga: 'whatsapp_click', props: { location: 'hero' } })}
          >
            <MessageCircle className="w-5 h-5" /> WhatsApp
          </CTAButton>
          <CTAButton
            variant="accent" size="xl" href={PLANS_URL}
            onClick={() => track({ fb: 'InitiateCheckout', ga: 'buy_premium_click', props: { location: 'hero' } })}
          >
            <Zap className="w-5 h-5" /> Buy Premium
          </CTAButton>
        </motion.div>

        {/* Trust row */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
          className="mt-7 flex items-center gap-4 text-xs sm:text-sm text-slate-600"
        >
          <div className="flex -space-x-2">
            {['#0B5FFF','#FF9800','#22C55E','#7C3AED','#EC4899'].map((c,i) => (
              <div key={i} className="w-7 h-7 rounded-full border-2 border-white ring-1 ring-slate-100" style={{ background: c }} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex text-[#FF9800]">{[0,1,2,3,4].map(i => <Star key={i} className="w-4 h-4 fill-current" />)}</div>
            <span className="font-medium text-slate-700">12,500+ ଶିକ୍ଷକଙ୍କର ଭରସା</span>
          </div>
        </motion.div>
      </div>

      {/* Right column — 3D Phone Mockup */}
      <div className="relative flex items-center justify-center">
        <PhoneMockup />
      </div>
    </div>
  </section>
)

// A pretty, in-page 3D-tilted phone mockup with floating feature icons.
const PhoneMockup = () => {
  const floaters = useMemo(() => ([
    { icon: FileText, label: 'Lesson Plan',    color: '#0B5FFF', x: '-58%',  y: '-40%', d: 0.0 },
    { icon: PenSquare, label: 'Worksheet',     color: '#FF9800', x:  '58%',  y: '-30%', d: 0.15 },
    { icon: Library,   label: 'Books',         color: '#22C55E', x: '-60%',  y:  '30%', d: 0.3 },
    { icon: HelpCircle,label: 'Question Bank', color: '#EC4899', x:  '55%',  y:  '38%', d: 0.45 },
    { icon: ClipboardList, label: 'Homework',  color: '#7C3AED', x:  '68%',  y:   '5%', d: 0.6 },
  ]), [])
  return (
    <div className="relative w-[260px] sm:w-[300px] md:w-[320px] aspect-[9/19]">
      {/* Glow */}
      <div className="absolute inset-0 rounded-[48px] bg-gradient-to-b from-[#0B5FFF]/30 via-transparent to-[#FF9800]/30 blur-2xl scale-110" />
      {/* Phone frame */}
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: -4 }}
        animate={{ opacity: 1, y: 0, rotate: -4 }}
        transition={{ duration: 0.6 }}
        className="relative w-full h-full rounded-[42px] bg-slate-900 p-2 shadow-[0_35px_80px_-20px_rgba(11,95,255,0.5)] ring-1 ring-black/10"
      >
        {/* Notch */}
        <div className="absolute left-1/2 -translate-x-1/2 top-2 w-24 h-5 bg-slate-950 rounded-b-2xl z-10" />
        {/* Screen */}
        <div className="w-full h-full rounded-[34px] overflow-hidden bg-gradient-to-b from-[#EEF3FF] to-white flex flex-col">
          <div className="pt-8 px-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-[#0B5FFF] flex items-center justify-center text-white font-black">L</div>
              <div>
                <div className="text-[10px] font-semibold text-slate-500 leading-none">LessonGuru</div>
                <div className="text-[13px] font-black text-slate-900 leading-none mt-0.5">Odisha</div>
              </div>
              <div className="ml-auto text-[9px] font-bold text-[#FF9800] bg-orange-100 px-2 py-1 rounded-full">Premium</div>
            </div>
            <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#0B5FFF] to-[#3B82F6] p-3 text-white shadow-lg">
              <div className="text-[9px] opacity-90">TODAY&#39;S PLAN</div>
              <div className="text-[13px] font-bold leading-tight mt-0.5">Class 3 · Odia · Chapter 5</div>
              <div className="text-[10px] opacity-90 mt-0.5">Panchapadi · Period 2 of 5</div>
            </div>
          </div>
          <div className="px-4 mt-3 grid grid-cols-3 gap-2">
            {[
              { icon: FileText, c: '#0B5FFF', t: 'Plan' },
              { icon: PenSquare, c: '#FF9800', t: 'Worksheet' },
              { icon: Library, c: '#22C55E', t: 'Books' },
              { icon: HelpCircle, c: '#EC4899', t: 'QBank' },
              { icon: Target, c: '#7C3AED', t: 'LO' },
              { icon: ClipboardList, c: '#0EA5E9', t: 'Assess' },
            ].map((it, i) => (
              <div key={i} className="rounded-xl bg-white shadow-sm ring-1 ring-slate-100 p-2 flex flex-col items-center">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: it.c }}>
                  <it.icon className="w-3.5 h-3.5" />
                </div>
                <div className="mt-1 text-[9px] font-semibold text-slate-700">{it.t}</div>
              </div>
            ))}
          </div>
          <div className="mt-auto px-4 pb-5">
            <div className="rounded-2xl bg-white ring-1 ring-slate-100 p-3">
              <div className="text-[10px] font-bold text-slate-900">ଆଜିର Period</div>
              <div className="mt-1 text-[9.5px] text-slate-600 leading-snug">ପାଠ ଯୋଜନା · Learning Outcomes · Panchapadi Sopana · Worksheet · Homework — ସବୁ ପ୍ରସ୍ତୁତ।</div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#0B5FFF] to-[#FF9800] rounded-full" style={{ width: '68%' }} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating icons */}
      {floaters.map((f, i) => (
        <motion.div
          key={i}
          className="absolute z-20 pointer-events-none"
          style={{ left: '50%', top: '50%', translateX: f.x, translateY: f.y }}
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3 + f.d, repeat: Infinity, ease: 'easeInOut', delay: f.d }}
        >
          <div className="rounded-2xl bg-white/95 backdrop-blur px-2.5 py-1.5 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.2)] ring-1 ring-slate-100 flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white" style={{ background: f.color }}>
              <f.icon className="w-3 h-3" />
            </div>
            <span className="text-[10px] font-bold text-slate-700 whitespace-nowrap">{f.label}</span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ==========================================================================
// Social Proof (star rating + animated teacher counter)
// ==========================================================================
const AnimatedNumber = ({ to = 0, duration = 1800, suffix = '' }) => {
  const [value, setValue] = useState(0)
  const startedRef = useRef(false)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([ent]) => {
      if (ent.isIntersecting && !startedRef.current) {
        startedRef.current = true
        const start = Date.now()
        const step = () => {
          const p = Math.min(1, (Date.now() - start) / duration)
          const eased = 1 - Math.pow(1 - p, 3)
          setValue(Math.round(to * eased))
          if (p < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }
    }, { threshold: 0.3 })
    obs.observe(el); return () => obs.disconnect()
  }, [to, duration])
  return <span ref={ref}>{value.toLocaleString('en-IN')}{suffix}</span>
}

export const SocialProof = () => (
  <section className="py-10 sm:py-14 bg-white">
    <div className="max-w-5xl mx-auto px-4 sm:px-6">
      <div className="rounded-3xl bg-gradient-to-br from-[#0B5FFF] to-[#1E40AF] text-white p-6 sm:p-8 shadow-[0_30px_80px_-30px_rgba(11,95,255,0.5)]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 text-[#FFD24D]">
              {[0,1,2,3,4].map(i => <Star key={i} className="w-5 h-5 fill-current" />)}
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black">4.9<span className="opacity-70 text-base">/5</span></div>
            <div className="text-[11px] uppercase tracking-wider opacity-80 mt-1">Teacher Rating</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black"><AnimatedNumber to={12500} suffix="+" /></div>
            <div className="text-[11px] uppercase tracking-wider opacity-80 mt-1">Teachers Onboarded</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black"><AnimatedNumber to={8400} suffix="+" /></div>
            <div className="text-[11px] uppercase tracking-wider opacity-80 mt-1">Lesson Plans</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black"><AnimatedNumber to={30} />+</div>
            <div className="text-[11px] uppercase tracking-wider opacity-80 mt-1">Districts of Odisha</div>
          </div>
        </div>
      </div>
    </div>
  </section>
)

// ==========================================================================
// Demo Video — admin-editable YouTube embed
// ==========================================================================
// Converts any YouTube URL (youtu.be/XYZ, youtube.com/watch?v=XYZ, /embed/XYZ)
// into a canonical /embed/XYZ URL that plays inside the card.
const ytIdFrom = (u) => {
  if (!u) return null
  try {
    const s = String(u)
    let m
    if ((m = s.match(/youtu\.be\/([\w-]{6,})/))) return m[1]
    if ((m = s.match(/[?&]v=([\w-]{6,})/))) return m[1]
    if ((m = s.match(/\/embed\/([\w-]{6,})/))) return m[1]
    if ((m = s.match(/\/shorts\/([\w-]{6,})/))) return m[1]
  } catch (_e) { /* ignore */ }
  return null
}
export const DemoVideo = ({ config }) => {
  const [playing, setPlaying] = useState(false)
  const videoUrl = config?.videoUrl || 'https://youtu.be/uoXTFqa7ccs'
  const videoId = ytIdFrom(videoUrl)
  return (
    <section className="py-10 sm:py-14 bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <SectionTitle
          eyebrow={config?.videoEyebrow || '30 Second Demo'}
          title={config?.videoTitle || 'ଏକ ନଜରରେ LessonGuru'}
          subtitle={config?.videoSubtitle || 'ଦେଖନ୍ତୁ — ମାତ୍ର ୩୦ ସେକେଣ୍ଡରେ କିପରି ପାଠ ଯୋଜନା ପ୍ରସ୍ତୁତ ହୁଏ।'}
        />
        <div
          className="mt-8 relative rounded-3xl overflow-hidden shadow-[0_30px_80px_-20px_rgba(11,95,255,0.35)] ring-1 ring-slate-200 aspect-video bg-gradient-to-br from-[#0B5FFF] via-[#3B82F6] to-[#FF9800] cursor-pointer group"
          onClick={() => { if (!playing) { setPlaying(true); track({ fb: 'ViewContent', ga: 'watch_demo_video', props: { content_name: 'demo_video', video: videoId } }) } }}
        >
          {/* Poster (click-to-play so we don't autoplay YouTube on every visit) */}
          {!playing && videoId ? (
            <>
              <img
                src={`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`}
                onError={(e) => { e.currentTarget.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }}
                alt="Demo thumbnail"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-slate-900/30" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/95 backdrop-blur flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                  <Play className="w-9 h-9 sm:w-11 sm:h-11 text-[#0B5FFF] ml-1 fill-current" />
                </div>
              </div>
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 text-white text-xs sm:text-sm">
                <div className="px-2 py-1 rounded-md bg-black/40 backdrop-blur font-semibold">Demo · 0:30</div>
                <div className="opacity-80">LessonGuru Odisha — ୨ ମିନିଟରେ ପାଠ ଯୋଜନା</div>
              </div>
            </>
          ) : videoId ? (
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={config?.videoTitle || 'LessonGuru Demo'}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black text-white/80 text-sm">
              🎬 Video coming soon · Video ଶୀଘ୍ର ଆସୁଛି
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ==========================================================================
// Teacher Problems section (pain amplifier)
// ==========================================================================
export const Problems = () => {
  const items = [
    { emoji: '📝', label: 'ଏଯାଏ Lesson Plan ହାତରେ ଲେଖୁଛନ୍ତି?' },
    { emoji: '📚', label: 'ପୁସ୍ତକ ଗୁଡିକ ସବୁ ଠାରେ ଖୋଜୁଛନ୍ତି?' },
    { emoji: '📄', label: 'Worksheet ପ୍ରସ୍ତୁତ କରିବା ଅସହଜ?' },
    { emoji: '🎯', label: 'LO Code ଖୋଜୁଛନ୍ତି?' },
    { emoji: '✅', label: 'Assessment ପ୍ରସ୍ତୁତ କରିବା କଠିନ?' },
  ]
  return (
    <section className="py-14 sm:py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <SectionTitle
          eyebrow="Teacher Pain Points"
          title="ଆପଣ ଏବେ ମଧ୍ୟ ଏହିପରି କରୁଛନ୍ତି?"
          subtitle="ପ୍ରତିଦିନ ୨-୩ ଘଣ୍ଟା ଏହି କାମରେ ନଷ୍ଟ ହେଉଛି।"
        />
        <div className="mt-8 grid sm:grid-cols-2 gap-3">
          {items.map((it, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="text-2xl leading-none">{it.emoji}</div>
              <div className="text-slate-800 font-semibold leading-snug">{it.label}</div>
              <X className="ml-auto w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
            </motion.div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-3">
          <motion.div
            animate={{ y: [0, 8, 0] }} transition={{ duration: 1.5, repeat: Infinity }}
            className="w-10 h-10 rounded-full bg-[#0B5FFF]/10 flex items-center justify-center text-[#0B5FFF]"
          >
            <ArrowDown className="w-5 h-5" />
          </motion.div>
          <div className="text-lg sm:text-xl font-black text-slate-900 text-center">
            LessonGuru ଏହା ସବୁ Solve କରେ — <span className="text-[#0B5FFF]">ମାତ୍ର ୨ ମିନିଟରେ।</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ==========================================================================
// Feature Grid (16 features)
// ==========================================================================
export const FeatureGrid = () => {
  const features = [
    { icon: FileText,        name: 'Lesson Plan',           c: '#0B5FFF' },
    { icon: PenSquare,       name: 'Worksheet',             c: '#FF9800' },
    { icon: ClipboardList,   name: 'Homework',              c: '#22C55E' },
    { icon: Library,         name: 'Books',                 c: '#EC4899' },
    { icon: HelpCircle,      name: 'Question Bank',         c: '#7C3AED' },
    { icon: ScrollText,      name: 'Assessment',            c: '#0EA5E9' },
    { icon: Target,          name: 'LO Code',               c: '#F43F5E' },
    { icon: FlaskConical,    name: 'Project Work',          c: '#10B981' },
    { icon: GraduationCap,   name: 'Classroom Transaction', c: '#F59E0B' },
    { icon: CalendarDays,    name: 'Monthly Plan',          c: '#6366F1' },
    { icon: CalendarRange,   name: 'Annual Plan',           c: '#14B8A6' },
    { icon: Users,           name: 'Multigrade Plan',       c: '#8B5CF6' },
    { icon: Sparkles,        name: 'Activity Bank',         c: '#EAB308' },
    { icon: StickyNote,      name: 'Teacher Notes',         c: '#F97316' },
    { icon: Wand2,           name: 'Question Solver',       c: '#06B6D4' },
    { icon: BookOpen,        name: 'Student Worksheet',     c: '#DB2777' },
  ]
  return (
    <section className="py-14 sm:py-20 bg-slate-50" id="features">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionTitle
          eyebrow="Everything In One App"
          title="୧୬ଟି Feature ଏକ Platform ରେ"
          subtitle="ପାଠ ଯୋଜନା ପ୍ରସ୍ତୁତି ପାଇଁ ଆଉ କୌଣସି App ଦରକାର ନାହିଁ।"
        />
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.name}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.03 }}
              className="group rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all cursor-default"
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-md group-hover:scale-110 transition-transform"
                style={{ background: f.c }}
              >
                <f.icon className="w-5 h-5" />
              </div>
              <div className="mt-3 font-bold text-slate-900 text-sm sm:text-[15px] leading-tight">{f.name}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ==========================================================================
// Real Dashboard Slider — real screenshots of the actual product
// ==========================================================================
export const DashboardSlider = () => {
  const shots = [
    {
      key: 'home',
      title: 'Dashboard',
      subtitle: 'ଓଡ଼ିଶାର ସର୍ବଶ୍ରେଷ୍ଠ Lesson Plan Platform',
      desc: 'Balvatika ରୁ Class 10 — ସମସ୍ତ ପାଠ ଯୋଜନା ଏକ App ରେ।',
      accent: '#7C3AED',
      badge: 'Live',
      desktop: '/lp-screens/home-desktop.webp',
      mobile: '/lp-screens/home-mobile.webp',
    },
    {
      key: 'panchapadi',
      title: 'Panchapadi Instant Plan',
      subtitle: '୫-Sopana Lesson Wizard',
      desc: 'ଶ୍ରେଣୀ → ବିଷୟ → ଅଧ୍ୟାୟ → Generate — ୨ ମିନିଟରେ ପାଠ ପ୍ରସ୍ତୁତ।',
      accent: '#EC4899',
      badge: 'AI Powered',
      desktop: '/lp-screens/panchapadi-desktop.webp',
      mobile: '/lp-screens/panchapadi-mobile.webp',
    },
    {
      key: 'daily',
      title: 'Daily Multi-Class Plan',
      subtitle: 'ଏକଥର Setup, ପ୍ରତି ଦିନ One-Click',
      desc: 'Single · Double · Triple · Multigrade — ୟାହା ଚାହିଁବେ ଆଣ୍ଚିବେ।',
      accent: '#0B5FFF',
      badge: 'Time-Saver',
      desktop: '/lp-screens/daily-plan-desktop.webp',
      mobile: '/lp-screens/daily-plan-mobile.webp',
    },
    {
      key: 'qp',
      title: 'Question Paper Generator',
      subtitle: 'SCERT/OSEPA-ready',
      desc: 'MCQ · Short · Long · Answer Key — ପ୍ରିଣ୍ଟ ପ୍ରସ୍ତୁତ PDF।',
      accent: '#0EA5E9',
      badge: 'SCERT Ready',
      desktop: '/lp-screens/question-paper-desktop.webp',
      mobile: '/lp-screens/question-paper-mobile.webp',
    },
    {
      key: 'assess',
      title: 'Assessment Builder',
      subtitle: 'FA1 · FA2 · SA1 · SA2',
      desc: 'Total Marks · Question Types · Difficulty — Professional Builder।',
      accent: '#22C55E',
      badge: 'Pro Builder',
      desktop: '/lp-screens/assessment-desktop.webp',
      mobile: '/lp-screens/assessment-mobile.webp',
    },
    {
      key: 'ajira',
      title: 'Ajira Pathya Jojana',
      subtitle: 'Premium Add-on — ₹49/year',
      desc: '365 ଦିନ Daily Plans · SCERT/OSEPA aligned · Print-ready।',
      accent: '#FF9800',
      badge: 'Add-on',
      desktop: '/lp-screens/ajira-desktop.webp',
      mobile: '/lp-screens/ajira-mobile.webp',
    },
    {
      key: 'qbank',
      title: 'Question Bank',
      subtitle: 'MCQ · Short · Long solved',
      desc: 'Chapter-wise solved questions + Book worksheets।',
      accent: '#14B8A6',
      badge: 'Solved',
      desktop: '/lp-screens/qbank-desktop.webp',
      mobile: '/lp-screens/panchapadi-mobile.webp',
    },
  ]
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setIdx(i => (i + 1) % shots.length), 3600)
    return () => clearInterval(t)
  }, [shots.length, paused])
  const current = shots[idx]

  return (
    <section className="py-14 sm:py-20 bg-gradient-to-b from-white via-slate-50 to-white relative overflow-hidden">
      {/* decorative glow */}
      <div className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(11,95,255,0.10), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(255,152,0,0.10), transparent 50%)' }} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
        <SectionTitle
          eyebrow="Live Dashboard Preview"
          title="Real Product · Real Screens"
          subtitle="ପ୍ରକୃତ App ର Screens — Mockup ନୁହେଁ, ଏହା ଠିକ୍ ସେହି ଦୃଶ୍ୟ ଯାହା ଆପଣ App ଖୋଲିଲେ ଦେଖିବେ।"
        />

        {/* Tabs / chips */}
        <div
          className="mt-8 flex flex-wrap justify-center gap-2"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {shots.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIdx(i)}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] sm:text-xs font-bold whitespace-nowrap transition-all ${
                i === idx
                  ? 'text-white shadow-lg'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
              }`}
              style={i === idx ? { background: s.accent } : {}}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Twin mock frames (laptop + phone) with real product screenshots */}
        <div
          className="mt-8 sm:mt-12 grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-10 items-center"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* LAPTOP */}
          <div className="relative mx-auto w-full max-w-[820px]">
            {/* browser chrome */}
            <div className="rounded-2xl bg-slate-900 shadow-[0_35px_80px_-15px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/20 overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-800">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <div className="mx-auto text-[10.5px] font-semibold text-slate-300 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-700/60">
                  <Lock className="w-3 h-3" /> lessonguruodisha.in
                </div>
                <span
                  className="text-[9.5px] font-black text-white px-2 py-0.5 rounded-full uppercase tracking-widest"
                  style={{ background: current.accent }}
                >
                  {current.badge}
                </span>
              </div>
              {/* screenshot area — aspect ratio kept for stability */}
              <div className="relative bg-white aspect-[16/10]">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={current.key}
                    src={current.desktop}
                    alt={current.title}
                    initial={{ opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.45 }}
                    className="absolute inset-0 w-full h-full object-cover object-top"
                    loading="lazy"
                    decoding="async"
                  />
                </AnimatePresence>
                {/* corner glow */}
                <div className="absolute -bottom-4 -right-4 w-32 h-32 rounded-full opacity-60 blur-2xl" style={{ background: current.accent }} />
              </div>
            </div>
            {/* laptop base */}
            <div className="mx-auto mt-1 w-[85%] h-3 rounded-b-2xl bg-gradient-to-b from-slate-300 to-slate-400 shadow-md" />

            {/* caption card */}
            <motion.div
              key={current.key + '-cap'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mt-5 rounded-2xl bg-white ring-1 ring-slate-200 p-4 sm:p-5 shadow-sm text-center lg:text-left"
            >
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Now Showing · {idx + 1}/{shots.length}
              </div>
              <div className="mt-0.5 text-lg sm:text-xl font-black text-slate-900">{current.title}</div>
              <div className="mt-0.5 text-[12.5px] font-semibold" style={{ color: current.accent }}>{current.subtitle}</div>
              <div className="mt-1.5 text-[12.5px] text-slate-600 leading-relaxed">{current.desc}</div>
            </motion.div>
          </div>

          {/* PHONE */}
          <div className="relative mx-auto w-[240px] sm:w-[260px]">
            <div className="aspect-[9/19] rounded-[38px] bg-slate-900 p-2 shadow-[0_35px_80px_-15px_rgba(15,23,42,0.5)] ring-1 ring-black/30 relative">
              <div className="absolute left-1/2 -translate-x-1/2 top-2 w-20 h-4 bg-slate-950 rounded-b-2xl z-10" />
              <div className="w-full h-full rounded-[30px] overflow-hidden bg-white">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={current.key + '-m'}
                    src={current.mobile || current.desktop}
                    alt={current.title + ' mobile'}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4 }}
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                    decoding="async"
                  />
                </AnimatePresence>
              </div>
            </div>
            {/* dots */}
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {shots.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Show ${shots[i].title}`}
                  onClick={() => setIdx(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === idx ? 22 : 6,
                    background: i === idx ? current.accent : '#CBD5E1',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-semibold text-slate-600">
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Real teacher-tested screens</span>
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> SCERT/OSEPA-aligned</span>
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Works offline · PWA</span>
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Balvatika → Class 10</span>
        </div>
      </div>
    </section>
  )
}

// ==========================================================================
// How It Works (3 steps timeline)
// ==========================================================================
export const HowItWorks = () => {
  const steps = [
    { n: 1, title: 'Login',    desc: 'Mobile ନମ୍ବର ଦେଇ ୧ ମିନିଟରେ Account ଖୋଲନ୍ତୁ।', icon: ShieldCheck, c: '#0B5FFF' },
    { n: 2, title: 'Generate', desc: 'ଶ୍ରେଣୀ → ପୁସ୍ତକ → ଅଧ୍ୟାୟ → Generate।',      icon: Wand2,       c: '#FF9800' },
    { n: 3, title: 'Teach',    desc: 'ପ୍ରସ୍ତୁତ Plan ସହ ଆତ୍ମବିଶ୍ୱାସର ସହ ଶିକ୍ଷାଦାନ କରନ୍ତୁ।', icon: GraduationCap, c: '#22C55E' },
  ]
  return (
    <section className="py-14 sm:py-20 bg-gradient-to-b from-white to-[#F5F7FF]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <SectionTitle eyebrow="How It Works" title="ମାତ୍ର ୩ Steps" subtitle="ସେତିକି — ଆଉ କିଛି ନାହିଁ।" />
        <div className="mt-10 grid sm:grid-cols-3 gap-4 sm:gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative rounded-3xl bg-white p-6 border border-slate-200 shadow-sm"
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ background: s.c }}>
                <s.icon className="w-7 h-7" />
              </div>
              <div className="absolute right-4 top-4 text-4xl font-black text-slate-100 select-none">{s.n}</div>
              <div className="mt-4 text-xl font-black text-slate-900">{s.title}</div>
              <div className="mt-1.5 text-slate-600 text-[14px] leading-relaxed">{s.desc}</div>
              {i < steps.length - 1 && (
                <div className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-slate-200 items-center justify-center text-slate-400 z-10">
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ==========================================================================
// Testimonials Carousel
// ==========================================================================
export const Testimonials = () => {
  const items = [
    { name: 'Sridhar Panda',    place: 'Ganjam · UGUPS Berhampur',      quote: 'ପ୍ରତିଦିନ Lesson Plan ପ୍ରସ୍ତୁତ କରିବା ଏବେ ୨ ମିନିଟର କାମ। ପିଲାଙ୍କ ପାଇଁ ଅଧିକ ସମୟ ମିଳୁଛି।', c: '#0B5FFF' },
    { name: 'Sunita Sahoo',     place: 'Cuttack · GHS Salepur',          quote: 'Panchapadi ଅନୁଯାୟୀ Plan, LO Code, Worksheet — ସବୁ ଏକ Platform ରେ। ଅଦ୍ଭୁତ App!', c: '#FF9800' },
    { name: 'Manoranjan Rout',  place: 'Balasore · GUPS Soro',           quote: 'ଆଗରୁ ୨ ଘଣ୍ଟା ଲାଗୁଥିଲା, ଏବେ ୨ ମିନିଟ। ପ୍ରତ୍ୟେକ ଶିକ୍ଷକ ଏହା ନେବା ଉଚିତ।', c: '#22C55E' },
    { name: 'Rojalin Mohapatra',place: 'Khordha · GUP School Jatni',      quote: 'Balvatika ପିଲାଙ୍କ ପାଇଁ Foundational Stage Plan ବହୁତ ଭଲ। Question Bank ମଧ୍ୟ ଉତ୍କୃଷ୍ଟ।',   c: '#EC4899' },
    { name: 'Debashis Nayak',   place: 'Sambalpur · GHS Bamra',           quote: 'Assessment ପ୍ରସ୍ତୁତ କରିବା ଏବେ ଆସୁବିଧାହୀନ। ଛାତ୍ରମାନଙ୍କ ପ୍ରଗତି ସହଜରେ ଦେଖା ଯାଉଛି।', c: '#7C3AED' },
  ]
  const [idx, setIdx] = useState(0)
  useEffect(() => { const t = setInterval(() => setIdx(i => (i+1) % items.length), 4200); return () => clearInterval(t) }, [items.length])
  return (
    <section className="py-14 sm:py-20 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <SectionTitle
          eyebrow="Real Teachers · Real Impact"
          title="ଓଡ଼ିଶାର ଶିକ୍ଷକମାନେ କ&#039;ଣ କହୁଛନ୍ତି"
          subtitle="ଏଠାରେ କେତେକ ପ୍ରକୃତ ଅଭିଜ୍ଞତା।"
        />
        <div className="mt-10 relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4 }}
              className="rounded-3xl bg-gradient-to-br from-white to-slate-50 p-6 sm:p-8 border border-slate-200 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.15)]"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-black text-lg shadow-lg" style={{ background: items[idx].c }}>
                  {items[idx].name.split(' ').map(w => w[0]).slice(0,2).join('')}
                </div>
                <div>
                  <div className="font-black text-slate-900">{items[idx].name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {items[idx].place}</div>
                </div>
                <div className="ml-auto flex text-[#FF9800]">
                  {[0,1,2,3,4].map(i => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
              </div>
              <blockquote className="mt-5 text-slate-800 text-[15px] sm:text-lg leading-relaxed">
                &ldquo;{items[idx].quote}&rdquo;
              </blockquote>
            </motion.div>
          </AnimatePresence>
          <div className="mt-5 flex items-center justify-center gap-2">
            {items.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Testimonial ${i+1}`}
                className={`h-2 rounded-full transition-all ${i === idx ? 'w-8 bg-[#0B5FFF]' : 'w-2 bg-slate-300 hover:bg-slate-400'}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ==========================================================================
// Pricing (live from /api/plans)
// ==========================================================================
export const Pricing = () => {
  const [plans, setPlans] = useState(null)
  useEffect(() => {
    fetch('/api/plans').then(r => r.json()).then(d => setPlans((d?.plans || []).filter(p => p.id !== 'free'))).catch(() => setPlans([]))
  }, [])
  const onBuy = (plan) => {
    track({ fb: 'InitiateCheckout', ga: 'buy_plan_click', props: { content_name: plan.name, currency: 'INR', value: plan.price } })
    window.location.href = `${PLANS_URL}?plan=${encodeURIComponent(plan.id)}`
  }
  return (
    <section className="py-14 sm:py-20 bg-slate-50" id="pricing">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionTitle
          eyebrow="Simple · Transparent"
          title="ଉପଯୁକ୍ତ Plan ବାଛନ୍ତୁ"
          subtitle="ପ୍ରତ୍ୟେକ Plan ରେ ସମ୍ପୂର୍ଣ୍ଣ Premium Feature ମିଳେ।"
        />
        <div className="mt-10">
          {!plans && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0,1,2,3].map(i => (
                <div key={i} className="h-72 rounded-3xl bg-white border border-slate-200 animate-pulse" />
              ))}
            </div>
          )}
          {plans && plans.length === 0 && (
            <div className="text-center text-slate-600">Plans ଶୀଘ୍ର Load ହେବ… <a className="text-[#0B5FFF] underline" href="/plans">/plans</a> ଦେଖନ୍ତୁ।</div>
          )}
          {plans && plans.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((p) => (
                <PlanCard key={p.id} plan={p} onBuy={onBuy} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

const PlanCard = ({ plan, onBuy }) => {
  const isPopular = !!plan.popular
  const savings = plan.originalPrice && plan.originalPrice > plan.price
    ? Math.round(((plan.originalPrice - plan.price) / plan.originalPrice) * 100) : 0
  const perDay = plan.days > 0 ? (plan.price / plan.days) : null
  return (
    <div className={`relative rounded-3xl p-6 border shadow-sm bg-white flex flex-col ${isPopular ? 'border-[#22C55E] ring-2 ring-[#22C55E]/40 shadow-[0_20px_50px_-15px_rgba(34,197,94,0.35)]' : 'border-slate-200'}`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest bg-[#22C55E] text-white shadow-md">
          Most Popular
        </div>
      )}
      <div className="text-2xl">{plan.emoji || '📘'}</div>
      <div className="mt-1 text-lg font-black text-slate-900">{plan.name}</div>
      {plan.tagline && <div className="text-[12px] text-slate-500 mt-0.5">{plan.tagline}</div>}
      <div className="mt-4 flex items-baseline gap-2">
        <div className="text-4xl font-black text-slate-900">₹{plan.price}</div>
        {plan.originalPrice > plan.price && (
          <div className="text-slate-400 line-through text-sm">₹{plan.originalPrice}</div>
        )}
      </div>
      <div className="text-[12px] text-slate-500">{plan.days >= 365*10 ? 'Lifetime' : `${plan.days} days`}</div>
      {savings > 0 && (
        <div className="mt-1 inline-flex text-[11px] font-bold px-2 py-1 rounded-full bg-[#22C55E]/10 text-[#16A34A] w-fit">
          Save {savings}%{perDay ? ` · ₹${perDay.toFixed(1)}/day` : ''}
        </div>
      )}
      <ul className="mt-4 space-y-1.5 flex-1">
        {(plan.features || []).slice(0, 5).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
            <Check className="w-4 h-4 text-[#22C55E] mt-0.5 flex-shrink-0" />
            <span>{f.replace(/^[✅✔·]+\s*/, '')}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => onBuy(plan)}
        className={`mt-6 w-full rounded-full py-3 text-sm font-bold text-white shadow-lg transition-all active:scale-[0.97] ${
          isPopular ? 'bg-[#22C55E] hover:brightness-110' : 'bg-[#0B5FFF] hover:brightness-110'
        }`}
      >
        Buy Now
      </button>
    </div>
  )
}

// ==========================================================================
// Feature Comparison Table — Free vs Premium
// ==========================================================================
const CompareCell = ({ v }) => {
  if (v === true) return <Check className="w-5 h-5 text-[#22C55E] mx-auto" />
  if (v === false) return <X className="w-5 h-5 text-slate-300 mx-auto" />
  return <span className="text-[11px] font-semibold text-amber-600 uppercase">{v}</span>
}

export const ComparisonTable = () => {
  const rows = [
    { label: 'Panchapadi Lesson Plans (Class 1–10)',  free: false, prem: true },
    { label: 'Balvatika Foundational Plans',           free: false, prem: true },
    { label: 'Worksheet & Homework PDF Download',      free: false, prem: true },
    { label: 'Question Bank (MCQ · Short · Long)',     free: false, prem: true },
    { label: 'Assessment (FA1/FA2/SA) Generator',      free: false, prem: true },
    { label: 'LO Code Reference & Search',             free: 'limited', prem: true },
    { label: 'Annual + Monthly Plan Auto-Generation',  free: false, prem: true },
    { label: 'Classroom Transaction Guide',            free: false, prem: true },
    { label: 'Books Library (85+ Odisha Books)',       free: 'preview', prem: true },
    { label: 'AI Question Solver',                     free: false, prem: true },
    { label: 'Priority Teacher Support',               free: false, prem: true },
    { label: 'All Future Updates',                     free: false, prem: true },
  ]
  return (
    <section className="py-14 sm:py-20 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <SectionTitle
          eyebrow="Free vs Premium"
          title="ପାର୍ଥକ୍ୟ ଦେଖନ୍ତୁ"
          subtitle="ଆପଣ କ&#039;ଣ ମାଗଣା ପାଉଛନ୍ତି — Premium ରେ ଅଧିକ କ&#039;ଣ ମିଳେ?"
        />
        <div className="mt-8 overflow-hidden rounded-3xl ring-1 ring-slate-200 shadow-sm">
          <div className="grid grid-cols-[1fr_90px_120px] bg-gradient-to-r from-[#0B5FFF]/5 to-[#FF9800]/5 py-3 px-4 text-[12px] font-black uppercase tracking-wider text-slate-700">
            <div>Feature</div>
            <div className="text-center">Free</div>
            <div className="text-center text-[#0B5FFF]">Premium ⭐</div>
          </div>
          {rows.map((r, i) => (
            <div key={i} className={`grid grid-cols-[1fr_90px_120px] items-center py-3 px-4 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
              <div className="text-slate-800">{r.label}</div>
              <div className="text-center"><CompareCell v={r.free} /></div>
              <div className="text-center"><CompareCell v={r.prem} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ==========================================================================
// FAQ — 20 questions accordion with search box
// ==========================================================================
export const FAQ = () => {
  const [q, setQ] = useState('')
  const [openIdx, setOpenIdx] = useState(0)
  const faqs = useMemo(() => ([
    ['LessonGuru Odisha କ୍ଣ?', 'ଏହା Odisha ଶିକ୍ଷକଙ୍କ ପାଇଁ ଏକ Premium Lesson Plan Platform। Balvatika ରୁ Class 10 ପର୍ଯ୍ୟନ୍ତ ସମସ୍ତ ପାଠ୍ୟକ୍ରମ ଉପଲବ୍ଧ।'],
    ['ଏହା କେଉଁ Class ପାଇଁ?', 'Balvatika, Class 1 ରୁ Class 10 ପର୍ଯ୍ୟନ୍ତ ସମସ୍ତ ଶ୍ରେଣୀ ପାଇଁ।'],
    ['Panchapadi Lesson Plan ମିଳେ କି?', 'ହଁ, ପ୍ରତ୍ୟେକ Period ପାଇଁ Panchapadi Sopana (5-Stage) Plan ଉପଲବ୍ଧ।'],
    ['Worksheet Download ହୁଏ କି?', 'ହଁ, Premium ଉପଭୋକ୍ତା Worksheet ର PDF Download କରିପାରନ୍ତି।'],
    ['LO Code Reference ମିଳେ କି?', 'ହଁ, NCF 2023 ଅନୁସାରେ ସମ୍ପୂର୍ଣ୍ଣ Learning Outcome Code ମିଳେ।'],
    ['Question Bank କେମିତି?', 'MCQ · Short · Long · Very Short — ପ୍ରତ୍ୟେକ Chapter ପାଇଁ ପ୍ରସ୍ତୁତ Question ମିଳେ।'],
    ['Assessment ପ୍ରସ୍ତୁତ ହୁଏ କି?', 'FA1, FA2, SA ପାଇଁ Auto-generated Assessment Paper ଉପଲବ୍ଧ।'],
    ['Free Trial ଅଛି କି?', 'ହଁ, Signup କରି କେତେକ Lesson Preview ଦେଖିପାରିବେ। Full access ପାଇଁ Premium ଆବଶ୍ୟକ।'],
    ['Payment ସୁରକ୍ଷିତ କି?', 'ହଁ, Razorpay Secure Payment Gateway ମାଧ୍ୟମରେ UPI, Card, Wallet ସ୍ୱୀକୃତ।'],
    ['Refund Policy କ&\u2019ଣ?', 'ଆମର /refund page ଦେଖନ୍ତୁ — ୭ ଦିନ ମଧ୍ୟରେ ନିୟମ ଅନୁସାରେ Refund ମିଳେ।'],
    ['Mobile ରେ ଚାଲେ କି?', 'ହଁ, ସମ୍ପୂର୍ଣ୍ଣ Mobile Responsive। Android · iPhone ଉଭୟରେ କାମ କରେ।'],
    ['Offline କାମ କରେ କି?', 'ପ୍ରାୟ Feature ପାଇଁ Internet ଆବଶ୍ୟକ। PDF Download କରି ପରେ Offline ମଧ୍ୟ ଦେଖିପାରିବେ।'],
    ['ପାଠ୍ୟକ୍ରମ Odisha ର କି?', 'ହଁ, ସମ୍ପୂର୍ଣ୍ଣ Odisha Board · SCERT · BSE ଅନୁସାରେ।'],
    ['Books ମିଳେ କି?', '85+ Odisha ପାଠ୍ୟପୁସ୍ତକ ପାଇଁ ପ୍ରସ୍ତୁତ Plan ଉପଲବ୍ଧ।'],
    ['ପ୍ରତ୍ୟେକ Period ପାଇଁ Plan ମିଳେ କି?', 'ହଁ, ପ୍ରତ୍ୟେକ Period ର ପୃଥକ Plan (Period-wise) ଉପଲବ୍ଧ।'],
    ['Multi-Grade Plan ଅଛି କି?', 'ହଁ, Multigrade Classroom ପାଇଁ ବିଶେଷ Plan ଉପଲବ୍ଧ।'],
    ['Multiple Device ରେ Login ହୁଏ କି?', 'ଏକ ସମୟରେ ଏକ Device ରେ Login। ନୂଆ Device ରେ Login କଲେ ପୁରୁଣା Session Logout ହୁଏ।'],
    ['Support କେମିତି ମିଳେ?', 'WhatsApp (8093414633) · Email ମାଧ୍ୟମରେ Priority Support।'],
    ['ଅଧିକ Discount ଅଛି କି?', 'ମାଝିମାଝି Campaign ରେ ବିଶେଷ Offer ଥାଏ। WhatsApp ରେ ପଚାରନ୍ତୁ।'],
    ['Renewal Reminder ମିଳେ କି?', 'ହଁ, Expiry ପୂର୍ବରୁ SMS/WhatsApp Reminder ମିଳେ।'],
  ]), [])
  const filtered = q.trim() ? faqs.filter(([a,b]) => (a+b).toLowerCase().includes(q.trim().toLowerCase())) : faqs
  return (
    <section className="py-14 sm:py-20 bg-slate-50" id="faq">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <SectionTitle eyebrow="FAQ" title="ଆପଣଙ୍କ ପ୍ରଶ୍ନ ର ଉତ୍ତର" subtitle="ଅଧିକ ଜରୁରୀ ପ୍ରଶ୍ନ WhatsApp ରେ ପଚାରନ୍ତୁ।" />
        <div className="mt-6 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ପ୍ରଶ୍ନ ଖୋଜନ୍ତୁ… (e.g. Refund, Worksheet)"
            className="w-full rounded-full bg-white border border-slate-200 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B5FFF]/30 shadow-sm"
          />
        </div>
        <div className="mt-6 space-y-2">
          {filtered.map(([question, answer], i) => (
            <div key={i} className={`rounded-2xl border bg-white transition-all ${openIdx === i ? 'border-[#0B5FFF]/40 shadow-md' : 'border-slate-200'}`}>
              <button
                onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
                className="w-full text-left px-4 py-4 flex items-start gap-3"
              >
                <span className="text-sm sm:text-[15px] font-semibold text-slate-900 flex-1">{question}</span>
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${openIdx === i ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {openIdx === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 text-slate-600 text-sm leading-relaxed">{answer}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-6">କୌଣସି ପ୍ରଶ୍ନ ମିଳିଲା ନାହିଁ — WhatsApp ରେ ପଚାରନ୍ତୁ।</div>
          )}
        </div>
      </div>
    </section>
  )
}

// ==========================================================================
// Footer (minimal, conversion-focused)
// ==========================================================================
export const Footer = () => (
  <footer className="pt-12 pb-24 sm:pb-14 bg-slate-950 text-slate-300">
    <div className="max-w-5xl mx-auto px-4 sm:px-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0B5FFF] to-[#FF9800] flex items-center justify-center text-white font-black">L</div>
            <div className="font-black text-white text-lg">LessonGuru Odisha</div>
          </div>
          <div className="mt-2 text-xs opacity-70">Odisha ର #୧ Premium Lesson Plan Platform</div>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-[#22C55E] font-bold flex items-center gap-2" onClick={() => track({ fb: 'Contact', ga: 'whatsapp_click', props: { location: 'footer' } })}>
            <MessageCircle className="w-4 h-4" /> WhatsApp · 8093414633
          </a>
          <a href="https://lessonguruodisha.in" className="opacity-80 hover:opacity-100">LessonGuruOdisha.in</a>
        </div>
      </div>
      <div className="mt-8 border-t border-white/10 pt-4 flex flex-wrap gap-4 text-[11px] opacity-70">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/refund">Refund</a>
        <span>© {new Date().getFullYear()} Lesson Guru Odisha. All rights reserved.</span>
      </div>
    </div>
  </footer>
)

// ==========================================================================
// Interactive Demo — Class → Book → Chapter → Generate → Preview
// ==========================================================================
export const InteractiveDemo = ({ demoRef }) => {
  const [classes, setClasses] = useState([])
  const [books, setBooks] = useState([])
  const [chapters, setChapters] = useState([])
  const [selClass, setSelClass] = useState(null)
  const [selBook, setSelBook] = useState(null)
  const [selChapter, setSelChapter] = useState(null)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('') // '', 'reading', 'drafting', 'polishing', 'ready'
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/classes').then(r => r.json()).then(d => setClasses(d?.classes || [])).catch(() => setClasses([]))
  }, [])

  useEffect(() => {
    setBooks([]); setChapters([]); setSelBook(null); setSelChapter(null)
    if (!selClass) return
    fetch(`/api/books?classId=${encodeURIComponent(selClass.id)}`).then(r => r.json()).then(d => setBooks(d?.books || [])).catch(() => setBooks([]))
  }, [selClass])

  useEffect(() => {
    setChapters([]); setSelChapter(null)
    if (!selClass || !selBook) return
    fetch(`/api/chapters?classId=${encodeURIComponent(selClass.id)}&bookId=${encodeURIComponent(selBook.id)}`)
      .then(r => r.json()).then(d => setChapters(d?.chapters || [])).catch(() => setChapters([]))
  }, [selClass, selBook])

  const canGenerate = !!(selClass && selBook && selChapter && !busy)

  const generate = useCallback(async () => {
    if (!canGenerate) return
    track({ fb: 'Lead', ga: 'demo_generate_click', props: { class: selClass?.name, book: selBook?.name, chapter: selChapter?.name } })
    setBusy(true); setError(''); setPreview(null); setStage('reading')
    try {
      // List lessons for the selected chapter — pick first
      const lr = await fetch(`/api/lessons?classId=${encodeURIComponent(selClass.id)}&bookId=${encodeURIComponent(selBook.id)}&chapterId=${encodeURIComponent(selChapter.id)}`)
      const lJson = await lr.json()
      let first = (lJson?.lessons || [])[0]
      // Fallback: if the chapter has no lessons yet, try any lesson from the book so the demo still works
      if (!first) {
        const lr2 = await fetch(`/api/lessons?classId=${encodeURIComponent(selClass.id)}&bookId=${encodeURIComponent(selBook.id)}`)
        const lJson2 = await lr2.json()
        first = (lJson2?.lessons || [])[0]
      }
      if (!first) { setError('ଏହି Chapter/ପୁସ୍ତକ ର Lesson ଏଯାଏ ପ୍ରସ୍ତୁତ ହୋଇନାହିଁ। ଅନ୍ୟ Class/ପୁସ୍ତକ ଚେଷ୍ଟା କରନ୍ତୁ।'); setBusy(false); return }
      // Fake progress steps for visual delight
      await new Promise(r => setTimeout(r, 550)); setStage('drafting')
      // Fetch actual preview (public endpoint returns preview text + 401 header when not logged in)
      const pr = await fetch(`/api/lessons/${encodeURIComponent(first.id)}`)
      const pJson = await pr.json().catch(() => null)
      await new Promise(r => setTimeout(r, 550)); setStage('polishing')
      await new Promise(r => setTimeout(r, 500)); setStage('ready')
      setPreview({
        title: pJson?.lesson?.title || first.title,
        period: pJson?.lesson?.period || first.period,
        text: pJson?.lesson?.preview || 'Lesson preview ପ୍ରସ୍ତୁତ। Full plan ପାଇଁ Login କରନ୍ତୁ।',
        cls: selClass.name, book: selBook.name, chapter: selChapter.name,
      })
      track({ fb: 'ViewContent', ga: 'demo_preview_shown', props: { content_name: first.title } })
    } catch (e) {
      setError('କୌଣସି ତ୍ରୁଟି ଆସିଲା। ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।')
      setStage('')
    } finally { setBusy(false) }
  }, [canGenerate, selClass, selBook, selChapter])

  return (
    <section ref={demoRef} className="py-14 sm:py-20 bg-gradient-to-b from-[#F5F7FF] to-white" id="demo">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <SectionTitle
          eyebrow="Try Before You Buy"
          title="୨ ମିନିଟରେ ପାଠ ଯୋଜନା Generate କରନ୍ତୁ"
          subtitle="ଶ୍ରେଣୀ → ପୁସ୍ତକ → ଅଧ୍ୟାୟ ବାଛନ୍ତୁ, ପରେ Generate ଉପରେ Click କରନ୍ତୁ।"
        />

        {/* NEW: Live Panchapadi 5-stage animated demo (auto-plays on scroll) */}
        <PanchapadiLiveDemo />

        <div className="mt-8 rounded-3xl bg-white p-4 sm:p-6 shadow-[0_20px_50px_-20px_rgba(11,95,255,0.25)] ring-1 ring-slate-200">
          {/* Selectors */}
          <div className="grid sm:grid-cols-3 gap-3">
            <DemoSelect
              label="1️⃣ ଶ୍ରେଣୀ"
              placeholder="ଶ୍ରେଣୀ ବାଛନ୍ତୁ"
              items={classes}
              value={selClass}
              onChange={setSelClass}
              getLabel={c => c.nameOdia || c.name}
            />
            <DemoSelect
              label="2️⃣ ପୁସ୍ତକ"
              placeholder={selClass ? 'ପୁସ୍ତକ ବାଛନ୍ତୁ' : 'ପ୍ରଥମେ ଶ୍ରେଣୀ ବାଛନ୍ତୁ'}
              items={books}
              value={selBook}
              onChange={setSelBook}
              disabled={!selClass}
              getLabel={b => b.name}
            />
            <DemoSelect
              label="3️⃣ ଅଧ୍ୟାୟ"
              placeholder={selBook ? 'ଅଧ୍ୟାୟ ବାଛନ୍ତୁ' : 'ପ୍ରଥମେ ପୁସ୍ତକ ବାଛନ୍ତୁ'}
              items={chapters}
              value={selChapter}
              onChange={setSelChapter}
              disabled={!selBook}
              getLabel={c => c.name}
            />
          </div>

          <button
            onClick={generate}
            disabled={!canGenerate}
            className={`mt-6 w-full rounded-full py-4 text-base font-black text-white flex items-center justify-center gap-2 transition-all ${canGenerate
              ? 'bg-gradient-to-r from-[#0B5FFF] to-[#FF9800] shadow-[0_15px_40px_-10px_rgba(11,95,255,0.5)] hover:brightness-110 active:scale-[0.98]'
              : 'bg-slate-300 cursor-not-allowed'}`}
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
            {busy ? 'ପ୍ରସ୍ତୁତ କରୁଛି…' : 'Generate ପାଠ ଯୋଜନା · ୨ ମିନିଟ'}
          </button>

          {/* Progress + Preview */}
          <AnimatePresence>
            {(stage || preview || error) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4"
              >
                <DemoStages stage={stage} />
                {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
                {preview && (
                  <div className="mt-4 rounded-xl bg-white p-4 border border-slate-200">
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Preview · Period {preview.period}</div>
                    <div className="text-lg font-black text-slate-900 mt-1">{preview.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{preview.cls} · {preview.book} · {preview.chapter}</div>
                    <div className="mt-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
                      {preview.text}
                    </div>
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                      <CTAButton
                        variant="primary" size="lg"
                        href="/login"
                        onClick={() => track({ fb: 'CompleteRegistration', ga: 'demo_login_click' })}
                      >
                        <Lock className="w-4 h-4" /> Login କରି ପୂର୍ଣ୍ଣ Plan ଦେଖନ୍ତୁ
                      </CTAButton>
                      <CTAButton
                        variant="accent" size="lg"
                        href={PLANS_URL}
                        onClick={() => track({ fb: 'InitiateCheckout', ga: 'demo_buy_click', props: { location: 'demo' } })}
                      >
                        <Download className="w-4 h-4" /> Premium ନେଇ Download କରନ୍ତୁ
                      </CTAButton>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

const DemoSelect = ({ label, placeholder, items, value, onChange, disabled, getLabel }) => (
  <label className={`block ${disabled ? 'opacity-60' : ''}`}>
    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">{label}</div>
    <div className="relative">
      <select
        disabled={disabled}
        value={value?.id || ''}
        onChange={(e) => {
          const it = items.find(i => i.id === e.target.value)
          onChange(it || null)
        }}
        className="w-full appearance-none rounded-2xl bg-white border border-slate-200 pl-4 pr-9 py-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0B5FFF]/30 focus:border-[#0B5FFF] disabled:bg-slate-50"
      >
        <option value="">{placeholder}</option>
        {items.map(i => <option key={i.id} value={i.id}>{getLabel(i)}</option>)}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
    </div>
  </label>
)

const DemoStages = ({ stage }) => {
  const steps = [
    { k: 'reading',   label: '📖 ପାଠ୍ୟ ପଢୁଛି' },
    { k: 'drafting',  label: '✍️ Draft ପ୍ରସ୍ତୁତ' },
    { k: 'polishing', label: '✨ Smart Polish' },
    { k: 'ready',     label: '✅ ପ୍ରସ୍ତୁତ!' },
  ]
  const currentIdx = steps.findIndex(s => s.k === stage)
  return (
    <div className="grid grid-cols-4 gap-1.5 text-[11px] sm:text-xs">
      {steps.map((s, i) => (
        <div
          key={s.k}
          className={`rounded-lg px-2 py-1.5 text-center font-semibold ${
            i < currentIdx ? 'bg-[#22C55E]/10 text-[#16A34A]'
              : i === currentIdx ? 'bg-[#0B5FFF]/10 text-[#0B5FFF] ring-1 ring-[#0B5FFF]/30 animate-pulse'
              : 'bg-slate-100 text-slate-400'
          }`}
        >
          {s.label}
        </div>
      ))}
    </div>
  )
}


// ==========================================================================
// PanchapadiLiveDemo — animated 5-stage lesson preview card
// Auto-plays on scroll-into-view with typewriter effect per stage.
// Stages: ଅଧୀତୀ → ବୋଧ → ଅଭ୍ୟାସ → ପ୍ରୟୋଗ → ପ୍ରସାର
// ==========================================================================
const PANCHAPADI_STAGES = [
  {
    key: 'adhiti',
    idx: 1,
    label: 'ଅଧୀତୀ',
    english: 'Adhiti · Preparation',
    time: '୫ ମି.',
    icon: '📖',
    color: '#EC4899',
    bg: 'linear-gradient(135deg,#FFF1F7,#FFE4EE)',
    darkBg: '#EC4899',
    lines: [
      '🎯 ଆଜିର ପାଠ: ପ୍ରକାଶର ପରାବର୍ତ୍ତନ (Reflection of Light)',
      '👋 ଶିକ୍ଷକ: "ଛାତ୍ର/ଛାତ୍ରୀମାନେ, ଆଜି ଆମେ ଏକ ମଜାଦାର ପ୍ରୟୋଗ କରିବା।"',
      '🪞 ଆଇନା ଦେଖାଇ ପ୍ରଶ୍ନ କରନ୍ତୁ — "ଆପଣ ଯାହା ଦେଖୁଛନ୍ତି, ତାହା କୁଆଡେ ଆସୁଛି?"',
      '🌞 ପୂର୍ବ ଜ୍ଞାନ: ପ୍ରକାଶ ସ୍ରୋତ, ଅନ୍ଧକାର, ଛାୟା — ପିଲାଙ୍କ ଅଭିଜ୍ଞତା ଡକନ୍ତୁ।',
    ],
  },
  {
    key: 'bodha',
    idx: 2,
    label: 'ବୋଧ',
    english: 'Bodha · Comprehension',
    time: '୧୦ ମି.',
    icon: '🧠',
    color: '#0B5FFF',
    bg: 'linear-gradient(135deg,#EEF3FF,#DDE8FF)',
    darkBg: '#0B5FFF',
    lines: [
      '📚 ମୁଖ୍ୟ ଧାରଣା: ଯେତେବେଳେ ପ୍ରକାଶ କୌଣସି ପୃଷ୍ଠ ଉପରେ ପଡେ, ତାହା ଫେରି ଆସେ — ଏହା ପରାବର୍ତ୍ତନ।',
      '📐 ପରାବର୍ତ୍ତନର ନିୟମ:',
      '  • ଆପାତ କୋଣ = ପରାବର୍ତ୍ତନ କୋଣ',
      '  • ଆପାତ କିରଣ, ଅଭିଲମ୍ବ ଓ ପରାବର୍ତ୍ତିତ କିରଣ — ଏକା ସମତଳରେ।',
      '🖼️ Blackboard Diagram: NEET ପାଠ୍ୟପୁସ୍ତକ ପୃ. ୧୨୪ ର ଚିତ୍ର ଆଙ୍କନ୍ତୁ।',
    ],
  },
  {
    key: 'abhyasa',
    idx: 3,
    label: 'ଅଭ୍ୟାସ',
    english: 'Abhyasa · Practice',
    time: '୮ ମି.',
    icon: '✍️',
    color: '#F59E0B',
    bg: 'linear-gradient(135deg,#FFF4E0,#FFE5B8)',
    darkBg: '#F59E0B',
    lines: [
      '🧪 ପ୍ରୟୋଗ (Group Work): ୪ ଜଣିଆ ଦଳ କରନ୍ତୁ।',
      '  ① ଆଇନା ଉପରେ Torch ଆଲୋକ ପକାନ୍ତୁ',
      '  ② ଆପାତ ଓ ପରାବର୍ତ୍ତନ କୋଣ ମାପନ୍ତୁ (Protractor)',
      '📝 Worksheet Q1: ଯଦି ଆପାତ କୋଣ ୩୫° ହୁଏ, ପରାବର୍ତ୍ତନ କୋଣ କେତେ?',
      '💡 ପ୍ରତି ଛାତ୍ର ନିଜ ଉତ୍ତର ନୋଟବୁକ୍ ରେ ଲେଖନ୍ତୁ।',
    ],
  },
  {
    key: 'prayoga',
    idx: 4,
    label: 'ପ୍ରୟୋଗ',
    english: 'Prayoga · Application',
    time: '୭ ମି.',
    icon: '🔬',
    color: '#22C55E',
    bg: 'linear-gradient(135deg,#E7FBEF,#C9F3D8)',
    darkBg: '#22C55E',
    lines: [
      '🌍 ଦୈନନ୍ଦିନ ଉଦାହରଣ ମାଗନ୍ତୁ:',
      '  • Vehicle side mirror — ପଛରୁ ଆସୁଥିବା ଗାଡ଼ି କେମିତି ଦେଖା ଯାଏ?',
      '  • Barber shop double mirror — ମୁଣ୍ଡର ପଛ କେମିତି ଦେଖା ଯାଏ?',
      '🎯 Higher Order (HOTS): ଯଦି ଆଇନା ବଙ୍କା ହୋଇଥାଏ, ଛବି କେମିତି ପାଲ୍ଟିବ?',
      '💬 ପ୍ରତି ଛାତ୍ର ୨ ଉଦାହରଣ ଦେବ — Peer Discussion।',
    ],
  },
  {
    key: 'prasara',
    idx: 5,
    label: 'ପ୍ରସାର',
    english: 'Prasara · Extension',
    time: '୫ ମି.',
    icon: '🎯',
    color: '#7C3AED',
    bg: 'linear-gradient(135deg,#F3EEFF,#E4D6FF)',
    darkBg: '#7C3AED',
    lines: [
      '📊 ମୂଲ୍ୟାୟନ (Formative):',
      '  ✅ ଆପାତ କୋଣ ଓ ପରାବର୍ତ୍ତନ କୋଣ ମଧ୍ୟ ସମ୍ପର୍କ ବୁଝାନ୍ତୁ।',
      '  ✅ ୨ ଟି ଦୈନନ୍ଦିନ ଉଦାହରଣ ଦିଅନ୍ତୁ।',
      '📝 ଗୃହକାର୍ଯ୍ୟ: Periscope ର ଚିତ୍ର ଆଙ୍କି ପରାବର୍ତ୍ତନ ଚିହ୍ନଟ କରନ୍ତୁ।',
      '🎨 ଆଉ ଏକ ଅଭିନବ କାର୍ଯ୍ୟ: Torch + ୨ ଆଇନା ରେ ପ୍ରକାଶ ପଥ ଚିହ୍ନଟ।',
      '⭐ LO Code: C7-SCI-LO-4.2 (SCERT/OSEPA Aligned)',
    ],
  },
]

const usePanchapadiPlayer = () => {
  const [active, setActive] = useState(0)       // which stage currently animating (0..5)
  const [lineIdx, setLineIdx] = useState(0)     // line within stage
  const [charIdx, setCharIdx] = useState(0)     // char within line
  const [done, setDone] = useState(false)
  const [playing, setPlaying] = useState(false)

  // Start / restart
  const play = useCallback(() => {
    setActive(0); setLineIdx(0); setCharIdx(0); setDone(false); setPlaying(true)
  }, [])

  // Typewriter loop
  useEffect(() => {
    if (!playing) return
    if (active >= PANCHAPADI_STAGES.length) { setDone(true); setPlaying(false); return }
    const stage = PANCHAPADI_STAGES[active]
    if (lineIdx >= stage.lines.length) {
      // move to next stage
      const t = setTimeout(() => { setActive(a => a + 1); setLineIdx(0); setCharIdx(0) }, 500)
      return () => clearTimeout(t)
    }
    const line = stage.lines[lineIdx]
    if (charIdx < line.length) {
      const t = setTimeout(() => setCharIdx(c => c + 1), 14)
      return () => clearTimeout(t)
    }
    // finished line → wait then advance
    const t = setTimeout(() => { setLineIdx(l => l + 1); setCharIdx(0) }, 220)
    return () => clearTimeout(t)
  }, [playing, active, lineIdx, charIdx])

  return { active, lineIdx, charIdx, done, playing, play }
}

const PanchapadiLiveDemo = () => {
  const containerRef = useRef(null)
  const { active, lineIdx, charIdx, done, playing, play } = usePanchapadiPlayer()
  const [hasStarted, setHasStarted] = useState(false)

  // Auto-play on scroll into view (once)
  useEffect(() => {
    if (typeof window === 'undefined' || hasStarted) return
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          setHasStarted(true)
          play()
          io.disconnect()
        }
      })
    }, { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [hasStarted, play])

  return (
    <div ref={containerRef} className="mt-8 relative">
      {/* Ambient glow behind the card */}
      <div className="pointer-events-none absolute -inset-6 rounded-[36px] opacity-70 blur-3xl"
        style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(11,95,255,0.18), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(236,72,153,0.16), transparent 55%), radial-gradient(ellipse at 0% 100%, rgba(255,152,0,0.16), transparent 55%)' }} />

      <div className="relative rounded-[28px] p-[1.5px] bg-gradient-to-br from-[#0B5FFF] via-[#EC4899] to-[#FF9800] shadow-[0_30px_80px_-25px_rgba(11,95,255,0.4)]">
        <div className="rounded-[26px] bg-white overflow-hidden">
          {/* Card Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-[#F5F7FF] via-white to-[#FFF7F0]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-widest text-white bg-gradient-to-r from-[#0B5FFF] to-[#7C3AED]">
                    <Sparkles className="w-3 h-3" /> Live AI Demo
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
                    <ShieldCheck className="w-3 h-3" /> SCERT Compliant
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 ring-1 ring-amber-200">
                    <Award className="w-3 h-3" /> Panchapadi
                  </span>
                </div>
                <div className="mt-2 text-[16px] sm:text-lg font-black text-slate-900 leading-tight">
                  ପାଠ ଯୋଜନା: ପ୍ରକାଶର ପରାବର୍ତ୍ତନ
                </div>
                <div className="mt-1 text-[11.5px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1"><GraduationCap className="w-3.5 h-3.5" /> Class 7 · Science</span>
                  <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Period 3 · ୩୫ ମି.</span>
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> ୩୨ ଛାତ୍ର</span>
                </div>
              </div>
              <button
                onClick={play}
                className="shrink-0 px-3 py-2 rounded-full bg-white ring-1 ring-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 active:scale-95 transition"
              >
                {done ? <><Zap className="w-3.5 h-3.5 text-amber-500" /> Replay</> : <><Play className="w-3.5 h-3.5 text-[#0B5FFF]" /> {playing ? 'Playing…' : 'Play Demo'}</>}
              </button>
            </div>

            {/* Progress bar per stage */}
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {PANCHAPADI_STAGES.map((s, i) => {
                const isDone = active > i
                const isActive = active === i && playing
                const stagePct = isDone ? 1 : (isActive
                  ? Math.min(1, (lineIdx + (s.lines[lineIdx] ? charIdx / s.lines[lineIdx].length : 0)) / s.lines.length)
                  : 0)
                return (
                  <div key={s.key} className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stagePct * 100}%` }}
                      transition={{ duration: 0.25 }}
                      className="h-full rounded-full"
                      style={{ background: s.color }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* 5 Stage Rail */}
          <div className="p-3 sm:p-4 grid gap-3 grid-cols-1 md:grid-cols-5">
            {PANCHAPADI_STAGES.map((s, i) => {
              const isDone = active > i
              const isActive = active === i && playing
              const isPending = active < i && !done
              // Text rendering for active stage — typewriter
              let renderedLines = []
              if (isDone || (done && active >= i)) {
                renderedLines = s.lines
              } else if (isActive) {
                renderedLines = [
                  ...s.lines.slice(0, lineIdx),
                  s.lines[lineIdx]?.slice(0, charIdx) || '',
                ]
              }
              return (
                <motion.div
                  key={s.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className={`relative rounded-2xl p-3 sm:p-3.5 border transition-all ${
                    isActive ? 'ring-2 ring-offset-2' : ''
                  } ${
                    isPending ? 'border-slate-200 opacity-70' : 'border-transparent'
                  }`}
                  style={{
                    background: s.bg,
                    ...(isActive ? { boxShadow: `0 0 0 2px ${s.color}30, 0 20px 40px -20px ${s.color}55`, ringColor: s.color } : {}),
                  }}
                >
                  {/* stage badge */}
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm shadow-md"
                      style={{ background: s.color }}
                    >
                      {isDone ? <Check className="w-4 h-4" /> : s.idx}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-black text-slate-900 leading-tight truncate">{s.label}</div>
                      <div className="text-[9.5px] font-semibold text-slate-500 leading-tight truncate">{s.english}</div>
                    </div>
                    <span className="ml-auto text-[9px] font-black text-slate-600 bg-white/70 rounded-full px-1.5 py-0.5 ring-1 ring-slate-200 whitespace-nowrap">
                      {s.icon} {s.time}
                    </span>
                  </div>
                  {/* content */}
                  <div className="mt-2.5 text-[11.5px] leading-relaxed text-slate-800 min-h-[132px] whitespace-pre-wrap break-words">
                    {isPending && !done && (
                      <div className="text-slate-400 italic">ପ୍ରସ୍ତୁତ ହେଉଛି…</div>
                    )}
                    {(isActive || isDone || (done && active >= i)) && renderedLines.map((line, li) => (
                      <div key={li} className="mb-1">
                        {line}
                        {isActive && li === lineIdx && (
                          <span className="inline-block w-1.5 h-3 align-middle ml-0.5 bg-slate-800 animate-pulse rounded-sm" />
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Footer strip */}
          <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1.5 justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5 text-[#0B5FFF]" /> Total ୩୫ ମି.</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-amber-600" /> Worksheet Ready</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1"><Target className="w-3.5 h-3.5 text-emerald-600" /> LO Code Mapped</span>
            </div>
            <div className="text-[10.5px] font-bold text-slate-500">
              {done ? <span className="text-emerald-600">✅ ପାଠ ଯୋଜନା ପ୍ରସ୍ତୁତ · Print/Save ପାଇଁ Login କରନ୍ତୁ</span>
                : playing ? <span className="text-[#0B5FFF]">✨ AI ଲେଖୁଛି… ମାତ୍ର ୨ ମିନିଟ</span>
                : <span className="text-slate-400">Scroll କରନ୍ତୁ ବା Play button ଦବାନ୍ତୁ</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
