'use client'
import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

// "Confirm it's you" — shown when an EXISTING (not-yet-linked) Lesson Guru
// account is auto-login-targeted from the Toolkit. Because the Toolkit does not
// verify phone ownership, we require a real OTP login for the SAME phone before
// linking the account. After a successful OTP + link, future taps auto-login.
//
// The phone + destination are fetched from a server-side one-time handoff code
// (?c=) so nothing sensitive sits in the URL and it survives in-app webviews.
export default function SsoConfirm() {
  const [phone, setPhone] = useState('')
  const [to, setTo] = useState('/')
  const [code, setCode] = useState('')        // handoff code (?c=)
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('loading') // loading | intro | otp | error
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const tokenRef = useRef('')
  const startedRef = useRef(false)
  const loadTimerRef = useRef(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    // ⚡ Warm the Node server so the subsequent app route loads fast.
    try { fetch('/api/ping', { cache: 'no-store' }).catch(() => {}) } catch {}
    // 8s watchdog so the loader can never hang on a slow/failed handoff fetch.
    loadTimerRef.current = setTimeout(() => setStep((s) => (s === 'loading' ? 'error' : s)), 8000)
    ;(async () => {
      try {
        const url = new URL(window.location.href)
        const c = url.searchParams.get('c') || ''
        if (!c) { setStep('error'); return }
        const r = await fetch('/api/sso/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: c }) })
        const d = await r.json().catch(() => ({}))
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
        if (!r.ok || d?.kind !== 'confirm' || !d?.phone) { setStep('error'); return }
        let dest = d.to || '/'
        if (!/^\/[a-zA-Z0-9/_-]*$/.test(dest)) dest = '/'
        setCode(c); setPhone(String(d.phone)); setTo(dest); setStep('intro')
      } catch {
        if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
        setStep('error')
      }
    })()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const masked = phone ? `••••••${phone.slice(-4)}` : ''

  const sendOtp = async () => {
    setSending(true)
    try {
      const r = await fetch('/api/auth/send-login-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: phone }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Could not send OTP')
      setStep('otp'); setCooldown(30)
      toast.success(d?.message || 'OTP sent')
    } catch (e) { toast.error(e.message) } finally { setSending(false) }
  }

  const verifyAndLink = async () => {
    if (!/^\d{6}$/.test(otp)) { toast.error('Enter the 6-digit OTP'); return }
    setVerifying(true)
    try {
      // 1) Normal OTP login for THIS phone.
      const r = await fetch('/api/auth/verify-login-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mobile: phone, code: otp }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d?.token) throw new Error(d?.error || 'Incorrect OTP')
      tokenRef.current = d.token
      // 2) Link the account (server re-checks the phone matches the handoff).
      const lr = await fetch('/api/sso/link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${d.token}` }, body: JSON.stringify({ code }) })
      const ld = await lr.json().catch(() => ({}))
      if (!lr.ok) {
        setStep('error')
        toast.error(ld?.error || 'Could not confirm this account')
        return
      }
      // 3) Store the session exactly like OTP login, then continue.
      localStorage.setItem('em_token', d.token)
      window.location.replace(to)
    } catch (e) { toast.error(e.message) } finally { setVerifying(false) }
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ background: 'linear-gradient(180deg,#EEF2FF 0%,#F8FAFC 40%)', fontFamily: '"Noto Sans Oriya",Inter,sans-serif', color: '#1E1B4B' }}>
        <div className="w-16 h-16 rounded-2xl grid place-items-center mb-5" style={{ background: 'linear-gradient(135deg,#2563EB,#7C3AED)', boxShadow: '0 10px 24px rgba(79,70,229,.35)' }}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></svg>
        </div>
        <span className="w-6 h-6 rounded-full animate-spin" style={{ border: '3px solid #DDD6FE', borderTopColor: '#7C3AED' }} />
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background text-foreground">
        <div className="max-w-sm">
          <h1 className="text-lg font-bold mb-2">Couldn’t confirm this account</h1>
          <p className="text-sm text-muted-foreground mb-6">Please tap again in Teacher Utility, or log in with OTP.</p>
          <a href="/login" className="inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold">Login with OTP</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
        </div>
        <h1 className="text-lg font-bold mb-1 text-center">Confirm it’s you</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center">For your security, verify the number <span className="font-semibold text-foreground">{masked}</span> with a one-time OTP. This links your Teacher Utility to Lesson Guru so next time you’re signed in instantly.</p>

        {step !== 'otp' ? (
          <button onClick={sendOtp} disabled={sending || !phone} className="w-full h-12 rounded-xl font-bold bg-primary text-primary-foreground disabled:opacity-60">
            {sending ? 'Sending…' : 'Send OTP on WhatsApp'}
          </button>
        ) : (
          <div className="space-y-3">
            <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="Enter 6-digit OTP" className="w-full h-12 rounded-xl border border-border bg-background px-4 text-center text-lg tracking-widest" />
            <button onClick={verifyAndLink} disabled={verifying} className="w-full h-12 rounded-xl font-bold bg-primary text-primary-foreground disabled:opacity-60">
              {verifying ? 'Verifying…' : 'Verify & continue'}
            </button>
            <button onClick={sendOtp} disabled={cooldown > 0 || sending} className="w-full text-sm text-muted-foreground disabled:opacity-60">
              {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <a href="/login" className="text-sm text-muted-foreground underline">Use a different login</a>
        </div>
      </div>
    </div>
  )
}
