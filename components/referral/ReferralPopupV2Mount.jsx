'use client'
import React from 'react'
import ReferralPopupV2 from './ReferralPopupV2'

// Handles ALL trigger rules so page.js stays clean:
//  • auto: logged-in non-admin, on Home, ~5s after load; NOT during
//    login/otp/payment/lesson/pdf views; NOT on signup day; max once/24h;
//    after 3 "Maybe Later" → once/7 days.
//  • manual entry points dispatch window event 'lg:open-referral'.
//  • Also renders a floating "Share & Earn" pill on Home.
// Gated by admin setting REFERRAL_POPUP_V2 (config.popupV2).
const SNOOZE_KEY = 'lg_refpopup_snooze_until'
const COUNT_KEY = 'lg_refpopup_maybe_count'
const DAY = 86400000
const BLOCKED_VIEWS = ['login', 'register', 'forgot', 'change-password', 'plans', 'checkout', 'payment', 'lesson-view', 'instant-search', 'viewer', 'pdf', 'reader']

const api = async (path) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

// True when some OTHER modal/popup is currently open (e.g. the mandatory
// Password-Recovery setup, OTP sheet, any shadcn Dialog/AlertDialog). We never
// want the referral popup to stack on top of these.
const isVisible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length))
const anotherModalOpen = () => {
  if (typeof document === 'undefined') return false
  try {
    // Radix (shadcn) dialogs / alert dialogs / sheets.
    if (document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]')) return true
    // Hand-rolled full-screen overlays use `fixed inset-0` with a high z-index.
    const overlays = document.querySelectorAll('.fixed.inset-0, [class*="fixed"][class*="inset-0"]')
    for (const el of overlays) {
      if (el.hasAttribute('data-referral-popup') || el.closest('[data-referral-popup]')) continue
      const z = parseInt(window.getComputedStyle(el).zIndex || '0', 10)
      if (z >= 90 && isVisible(el)) return true
    }
  } catch (_) { /* fail open */ }
  return false
}

export default function ReferralPopupV2Mount({ user, view }) {
  const [open, setOpen] = React.useState(false)
  const [config, setConfig] = React.useState(null)
  const [data, setData] = React.useState(null)
  const loadedRef = React.useRef(false)

  const isAdmin = user?.role === 'admin'
  const onHome = !view || view === 'home' || view === 'dashboard'

  // Load config + personal referral data once, for a logged-in non-admin user.
  React.useEffect(() => {
    if (!user || isAdmin || loadedRef.current) return
    loadedRef.current = true
    ;(async () => {
      try {
        const cfg = await api('/referral/milestone-config')
        setConfig(cfg)
        if (!cfg?.popupV2) return
        const me = await api('/me/referral')
        // Overlay the NEW milestone count (ever-paid rule) onto the data.
        try {
          const mc = await api('/referral/my-milestone')
          me.stats = { ...(me.stats || {}), milestoneCount: mc.count }
        } catch (_) {}
        setData(me)
      } catch (_) { /* silent */ }
    })()
  }, [user, isAdmin])

  // Manual entry-point listener (Home button / Profile menu item).
  React.useEffect(() => {
    const openNow = () => { if (config?.popupV2 && data && !anotherModalOpen()) setOpen(true) }
    window.addEventListener('lg:open-referral', openNow)
    return () => window.removeEventListener('lg:open-referral', openNow)
  }, [config, data])

  // Auto trigger.
  React.useEffect(() => {
    if (!config?.popupV2 || !data || isAdmin || !onHome) return
    if (BLOCKED_VIEWS.includes(view)) return
    // Not on signup day.
    const created = user?.createdAt ? new Date(user.createdAt).getTime() : 0
    if (created && Date.now() - created < DAY) return
    // Snooze window.
    try {
      const until = parseInt(localStorage.getItem(SNOOZE_KEY) || '0', 10)
      if (until && Date.now() < until) return
    } catch (_) {}
    // Wait for the 5s delay, then only open once no other modal/popup is open.
    // If another modal (e.g. password-recovery) is up, keep re-checking; after
    // ~30s of waiting we silently skip this visit (no stacking, no snooze burn).
    let timer
    let tries = 0
    const attempt = () => {
      if (anotherModalOpen()) {
        tries += 1
        if (tries > 20) return
        timer = setTimeout(attempt, 1500)
        return
      }
      setOpen(true)
    }
    timer = setTimeout(attempt, 5000)
    return () => clearTimeout(timer)
  }, [config, data, isAdmin, onHome, view, user])

  const snooze = () => {
    try {
      const n = (parseInt(localStorage.getItem(COUNT_KEY) || '0', 10) || 0) + 1
      localStorage.setItem(COUNT_KEY, String(n))
      const span = n >= 3 ? 7 * DAY : DAY
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + span))
    } catch (_) {}
    setOpen(false)
  }
  const close = () => {
    // Closing via X also respects the 24h rule (lighter than Maybe Later).
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + DAY)) } catch (_) {}
    setOpen(false)
  }

  if (!user || isAdmin || !config?.popupV2) return null

  return (
    <>
      {onHome && (
        <button
          onClick={() => data && setOpen(true)}
          style={{
            position: 'fixed', right: 14, bottom: 84, zIndex: 60, border: 0, cursor: 'pointer',
            borderRadius: 999, padding: '11px 16px', fontWeight: 800, fontSize: 13, color: '#fff',
            background: 'linear-gradient(90deg,#7C3AED,#EC4899)', boxShadow: '0 8px 20px rgba(124,58,237,.45)',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >✨ Share &amp; Earn</button>
      )}
      {open && data && (
        <ReferralPopupV2 data={data} config={config} onClose={close} onMaybeLater={snooze} />
      )}
    </>
  )
}
