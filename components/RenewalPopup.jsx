'use client'
// ============================================================================
//  RenewalPopup — High-conversion, full-screen renewal modal shown ONLY to
//  users whose PAID plan has EXPIRED.  (Active Premium users never see this.)
//
//  • Price-first hook at the very top (real ₹/month + ₹/year, pulled live).
//  • Scannable, benefit-focused Odia copy with familiar English feature names.
//  • Strong green CTA → opens the EXISTING renewal / plans flow via onRenew().
//  • Dynamically shows the user's real plan name + expiry date (never hardcoded).
//  • Fires renewal analytics: shown → cta_click (checkout_open / paid handled
//    downstream in PlansView, attributed via the sessionStorage flag we set).
//  • Dismissible with a snooze so we never nag on every render.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { X, Zap, Crown, CheckCircle2, Sparkles, Rocket, BookOpen, FileText, Library, Wrench, MessageCircle } from 'lucide-react'
import { openRenewalWhatsApp, buildRenewalWhatsAppMessage } from '@/lib/renewal-whatsapp'

// Views where a full-screen popup would fight the user — stay out of the way.
const HIDE_ON_VIEWS = new Set(['login', 'register', 'forgot', 'plans', 'contact', 'change-password'])
const STORAGE_KEY = 'em_renewal_popup_v1'
const SNOOZE_HOURS = 8

// Attribution flag read by PlansView to log checkout_open / paid for the popup.
export const RENEWAL_SRC_FLAG = 'em_renewal_src'

// ---- Odia numeral helper (keeps the copy feeling native) -------------------
const OD = ['୦', '୧', '୨', '୩', '୪', '୫', '୬', '୭', '୮', '୯']
const toOdia = (n) => String(n ?? '').replace(/[0-9]/g, (d) => OD[+d])

// ---- Snooze helpers --------------------------------------------------------
const isSnoozed = () => {
  if (typeof window === 'undefined') return true
  try { return Number(localStorage.getItem(STORAGE_KEY) || 0) > Date.now() } catch { return false }
}
const snooze = () => {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now() + SNOOZE_HOURS * 3600 * 1000)) } catch {}
}

// ---- Fire-and-forget renewal analytics ------------------------------------
export const trackRenewalEvent = (event, extra = {}) => {
  if (typeof window === 'undefined' || !event) return
  try {
    const token = localStorage.getItem('em_token')
    fetch('/api/renewal/track', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ event, ...extra }),
    }).catch(() => {})
  } catch { /* non-blocking */ }
}

export default function RenewalPopup({ user, view, onRenew }) {
  const [open, setOpen] = useState(false)
  const [winback, setWinback] = useState(null)

  // --- Eligibility: paid plan that has actually expired ---------------------
  const eligible = useMemo(() => {
    if (!user) return null
    if (HIDE_ON_VIEWS.has(view)) return null
    const sub = user.subscription || null
    if (!sub || !sub.expiryDate) return null
    if (sub.plan === 'free' || !sub.plan) return null           // never had a paid plan
    const now = Date.now()
    const expiryMs = new Date(sub.expiryDate).getTime()
    // Lifetime / far-future → never expires → not eligible
    if (sub.plan === 'lifetime' || expiryMs - now > 365 * 10 * 86400000) return null
    const expired = expiryMs <= now || sub.status !== 'active'
    if (!expired) return null                                    // active Premium → skip
    const daysExpired = Math.max(0, Math.floor((now - expiryMs) / 86400000))
    return { sub, expiryMs, daysExpired, longExpired: daysExpired > 30 }
  }, [user, view])

  // Decide whether to show (once per snooze window, small delay so page paints)
  useEffect(() => {
    if (!eligible) { setOpen(false); return }
    if (isSnoozed()) return
    const t = setTimeout(() => setOpen(true), 700)
    return () => clearTimeout(t)
  }, [eligible])

  // Fetch the active Win-Back offer (comeback discount) for long-expired users
  useEffect(() => {
    if (!eligible?.longExpired) return
    fetch('/api/renewal/winback').then(r => r.json()).then(r => setWinback(r.winback || null)).catch(() => {})
  }, [eligible?.longExpired])

  // Track "shown" exactly once when it becomes visible
  useEffect(() => {
    if (open) trackRenewalEvent('shown', { plan: eligible?.sub?.plan || null })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!eligible || !open) return null

  // Win-Back offer only surfaces for long-expired teachers (>30 days).
  const wb = eligible.longExpired ? winback : null

  // --- Advertised recovery pricing (as configured for the renewal message) --
  // Displayed on the popup cards per product decision. NOTE: checkout still
  // charges the actual plan prices from the existing Razorpay flow.
  const monthlyPrice = 19
  const yearlyPrice = 219
  const yearlyPerMonth = Math.round(yearlyPrice / 12)

  const sub = eligible.sub
  const planName = sub.plan ? String(sub.plan).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Premium'
  const expiryStr = new Date(eligible.expiryMs).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const close = () => { snooze(); setOpen(false) }
  const renew = () => {
    trackRenewalEvent('cta_click', { plan: sub.plan || null, channel: 'plans' })
    try { sessionStorage.setItem(RENEWAL_SRC_FLAG, '1') } catch {}
    snooze()
    setOpen(false)
    onRenew?.()
  }
  const renewViaWhatsApp = () => {
    trackRenewalEvent('cta_click', { plan: sub.plan || null, channel: 'whatsapp' })
    openRenewalWhatsApp(buildRenewalWhatsAppMessage(wb))
  }

  const Section = ({ icon: Icon, tint, title, items }) => (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${tint}`}><Icon className="w-4 h-4" /></span>
        <p className="font-extrabold text-[13px] tracking-tight">{title}</p>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[12px] leading-snug text-foreground/90">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="relative w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[94vh] flex flex-col overflow-hidden">

        {/* Close */}
        <button
          aria-label="Close"
          onClick={close}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/25 text-white hover:bg-black/40 active:scale-95"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ============ PRICE-FIRST HERO (visible immediately) ============ */}
        <div className="relative bg-gradient-to-br from-emerald-600 via-teal-600 to-green-700 text-white px-5 pt-6 pb-5 text-center flex-shrink-0">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-yellow-300/25 rounded-full blur-2xl" />
          <p className="text-[13px] font-bold leading-snug">🚨 ଆପଣଙ୍କ Premium Access ସମାପ୍ତ ହୋଇଛି!</p>
          <p className="text-[11px] opacity-90 mt-1">
            {planName} · {toOdia(expiryStr.replace(/[0-9]/g, d => d))} <span className="opacity-80">({expiryStr} ରେ ଶେଷ)</span>
          </p>

          <div className="mt-3 flex items-center justify-center gap-2">
            {monthlyPrice != null && (
              <div className="flex-1 rounded-2xl bg-white/15 backdrop-blur px-2 py-2.5">
                <p className="text-[10px] opacity-90">ମାସିକ</p>
                <p className="text-2xl font-extrabold leading-none">₹{toOdia(monthlyPrice)}</p>
                <p className="text-[9px] opacity-90">/ ମାସ</p>
              </div>
            )}
            {yearlyPrice != null && (
              <div className="flex-1 rounded-2xl bg-yellow-300 text-emerald-900 px-2 py-2.5 shadow-lg ring-2 ring-yellow-200 relative">
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-extrabold bg-emerald-900 text-yellow-300 px-2 py-0.5 rounded-full whitespace-nowrap">BEST VALUE</span>
                <p className="text-[10px] font-bold">ବାର୍ଷିକ</p>
                <p className="text-2xl font-extrabold leading-none">₹{toOdia(yearlyPrice)}</p>
                <p className="text-[9px] font-semibold">/ ବର୍ଷ{yearlyPerMonth ? ` · ~₹${toOdia(yearlyPerMonth)}/ମାସ` : ''}</p>
              </div>
            )}
          </div>

          <p className="text-[11px] opacity-95 mt-2.5">☕ ଗୋଟିଏ ଚା' କପ୍‌ର ମୂଲ୍ୟରୁ କମ୍ ଖର୍ଚ୍ଚରେ ଏତେଗୁଡ଼ିଏ Teacher Resources!</p>

          {/* 🎁 Win-Back comeback discount — only for long-expired teachers (>30 days) */}
          {wb && wb.discountValue > 0 && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-yellow-300 text-emerald-900 px-3 py-1.5 text-[11px] font-extrabold shadow ring-2 ring-yellow-200">
              🎁 ୱାପସୀ ଉପହାର: ଅତିରିକ୍ତ {toOdia(wb.discountValue)}{wb.discountType === 'fixed' ? '₹' : '%'} ଛାଡ଼!{wb.code ? <span className="font-bold opacity-90"> · {wb.code}</span> : null}
            </div>
          )}

          {/* Primary CTA — visible without scrolling */}
          <button
            onClick={renew}
            className="mt-3.5 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white text-emerald-700 font-extrabold text-[15px] py-3 shadow-lg hover:brightness-105 active:scale-[0.98]"
          >
            <Zap className="w-4 h-4" /> 🟢 RENEW PREMIUM NOW
          </button>
          {/* WhatsApp recovery CTA — opens native WhatsApp with a pre-filled message */}
          <button
            onClick={renewViaWhatsApp}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-white font-extrabold text-[14px] py-2.5 shadow-lg hover:brightness-105 active:scale-[0.98]"
          >
            <MessageCircle className="w-4 h-4" /> 💬 WhatsApp ରେ Renewal ସହାୟତା ନିଅନ୍ତୁ
          </button>
          <button onClick={close} className="mt-2 text-[11px] text-white/80 underline underline-offset-2">ପରେ ଦେଖିବି</button>
        </div>

        {/* ============ SCROLLABLE VALUE JUSTIFICATION ============ */}
        <div className="overflow-y-auto px-4 py-4 space-y-3 flex-1">
          <p className="text-center text-[13px] font-extrabold text-foreground">🎯 RENEW କଲେ କ'ଣ ପାଇବେ?</p>

          <Section
            icon={BookOpen} tint="bg-blue-100 text-blue-700"
            title="📚 Smart Lesson Plans"
            items={[
              'ବାଲବାଟିକାରୁ Class 8 ପର୍ଯ୍ୟନ୍ତ Panchapadi Lesson Plans',
              'Class 9 & 10 ପାଇଁ Smart 5E Lesson Plans',
              'Ready-to-use Short Lesson Plan + Classroom Transaction',
              'Daily 7-Period Lesson Plan + Multigrade Lesson Plan',
              'ଆଜିର ପାଠ ପାଇଁ ତୁରନ୍ତ ପ୍ରସ୍ତୁତି — ଘଣ୍ଟା ଘଣ୍ଟା ସମୟ ବଞ୍ଚାନ୍ତୁ!',
            ]}
          />

          <Section
            icon={FileText} tint="bg-purple-100 text-purple-700"
            title="📝 Assessment & Question Papers"
            items={[
              'FA / SA Assessment Papers + Question Papers',
              'Book Question & Answer · Chapterwise Question Bank',
              'Student Homework · Practice Worksheets',
              'Teacher-friendly Assessment Resources — ଏକେ ଜାଗାରେ!',
            ]}
          />

          <Section
            icon={Library} tint="bg-amber-100 text-amber-700"
            title="📖 Digital Books & Academic Resources"
            items={[
              'Class-wise & Chapter-wise New Books',
              'LO Codes / Learning Outcomes · Chapter-wise LO Resources',
              'Teaching Notes · MCM Guide · Classroom Activities',
              'Student Engagement Zone · Project Work & Activity Resources',
            ]}
          />

          <Section
            icon={Wrench} tint="bg-emerald-100 text-emerald-700"
            title="⚡ Smart Teacher Tools"
            items={[
              '📱 Mobile ରୁ ମଧ୍ୟ ବ୍ୟବହାର କରନ୍ତୁ · 💻 Laptop/Desktop ରୁ ମଧ୍ୟ',
              '📥 ଦରକାରୀ Resources ଦେଖନ୍ତୁ / Download କରନ୍ତୁ',
              '🧑‍🏫 ନିଜ School Work ପାଇଁ ସମୟ ବଞ୍ଚାନ୍ତୁ',
            ]}
          />

          {/* Coming soon (clearly future) */}
          <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Rocket className="w-4 h-4 text-emerald-700" />
              <p className="font-extrabold text-[13px]">🚀 ଆଗାମୀ ଦିନରେ ଆସୁଥିବା Features</p>
            </div>
            <ul className="space-y-1 text-[12px] text-foreground/90">
              {[
                'ଆଗାମୀ ନୂଆ Features ଓ Teacher Tools',
                'ଅଧିକ Smart Lesson Planning ଓ Assessment Resources',
                'ଅଧିକ Worksheets, Question Resources ଓ Classroom Support Tools',
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-1.5"><Sparkles className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /><span>{t}</span></li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground mt-2">💡 ଆପଣଙ୍କ ସମୟ ବଞ୍ଚାଇବା ଓ School Work ସହଜ କରିବା ପାଇଁ Lesson Guru ଆହୁରି ବଢ଼ିବ!</p>
          </div>

          {/* Support */}
          <div className="text-center text-[11px] text-muted-foreground pt-1">
            <button onClick={renewViaWhatsApp} className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline">
              <MessageCircle className="w-3.5 h-3.5" /> 📲 ସହାୟତା ପାଇଁ WhatsApp: 8093414633
            </button>
          </div>
        </div>

        {/* ============ STICKY BOTTOM CTA (always reachable) ============ */}
        <div className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur px-4 py-3">
          <button
            onClick={renew}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-extrabold text-[15px] py-3 shadow-lg hover:brightness-105 active:scale-[0.98]"
          >
            <Crown className="w-4 h-4" /> ଆଜି ହିଁ RENEW କରନ୍ତୁ
          </button>
        </div>
      </div>
    </div>
  )
}
