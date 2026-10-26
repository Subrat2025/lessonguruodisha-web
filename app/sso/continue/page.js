'use client'
import React, { useEffect, useRef, useState } from 'react'

// Tiny client bridge: exchanges the one-time handoff code (?c=) for the session
// token via POST, stores it in localStorage (em_token) exactly like OTP login,
// then forwards to the destination view.
//
// Hardened against React dev double-invoke + network hangs:
//   • startedRef guard => the exchange fires exactly ONCE (no 2nd 410 clobber).
//   • if a token is already saved, a late/failed response is ignored.
//   • 8s watchdog => never hangs on "Signing you in…"; shows a Try again path.
export default function SsoContinue() {
  const startedRef = useRef(false)
  const timerRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    // ⚡ Warm the Node server + the destination route immediately (fire-and-forget)
    // so the real app (/lessons, /plans) is already compiled by the time we
    // navigate — this is the biggest part of the perceived auto-login delay.
    try { fetch('/api/ping', { cache: 'no-store' }).catch(() => {}) } catch {}

    const fail = () => { if (timerRef.current) clearTimeout(timerRef.current); setFailed(true) }
    const go = (to) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      let dest = to || '/'
      if (!/^\/[a-zA-Z0-9/_-]*$/.test(dest)) dest = '/'
      try { window.history.replaceState(null, '', window.location.pathname) } catch {}
      window.location.replace(dest)
    }

    // 8s watchdog so the spinner can never hang forever.
    timerRef.current = setTimeout(() => { if (!localStorage.getItem('em_token')) setFailed(true) }, 8000)

    ;(async () => {
      try {
        const code = new URL(window.location.href).searchParams.get('c') || ''
        if (!code) { fail(); return }
        const r = await fetch('/api/sso/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
        const d = await r.json().catch(() => ({}))
        if (r.ok && d?.token) {
          localStorage.setItem('em_token', d.token)
          go(d.to)
          return
        }
        // Non-OK (e.g. a late duplicate 410): if we already have a token, proceed.
        if (localStorage.getItem('em_token')) { go('/'); return }
        fail()
      } catch (_) {
        if (localStorage.getItem('em_token')) { go('/'); return }
        fail()
      }
    })()
  }, [])

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background text-foreground">
        <div className="max-w-sm">
          <p className="text-base font-semibold mb-2">Couldn’t finish sign-in</p>
          <p className="text-sm text-muted-foreground mb-5">Please tap the link again in Teacher Utility, or log in with OTP.</p>
          <a href="/login" className="inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold">Login with OTP</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ background: 'linear-gradient(180deg,#EEF2FF 0%,#F8FAFC 40%)', fontFamily: '"Noto Sans Oriya",Inter,sans-serif', color: '#1E1B4B' }}>
      <div className="w-16 h-16 rounded-2xl grid place-items-center mb-5" style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)', boxShadow: '0 10px 24px rgba(79,70,229,.35)' }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></svg>
      </div>
      <p className="text-[17px] font-extrabold">Lesson Guru ଖୋଲୁଛି…</p>
      <p className="text-[13px] mt-1 mb-5" style={{ color: '#64748B' }}>Signing you in · ଅପେକ୍ଷା କରନ୍ତୁ</p>
      <span className="w-6 h-6 rounded-full animate-spin" style={{ border: '3px solid #DDD6FE', borderTopColor: '#7C3AED' }} />
    </div>
  )
}
