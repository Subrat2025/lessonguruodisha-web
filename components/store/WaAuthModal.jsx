'use client'
import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { API, getToken } from '@/components/store/api'

const GREEN = '#25D366', IND = '#241a5e', CORAL = '#e8452c'

// Full WhatsApp OTP login / sign-up popup. Reuses the shared Lesson Guru OTP
// endpoints (/auth/send-login-otp, /auth/verify-login-otp, /auth/wa/complete-profile).
export function WaAuthModal({ open, onClose, onSuccess }) {
  const [step, setStep] = useState('phone')     // phone | otp | profile
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [signupToken, setSignupToken] = useState('')
  const [name, setName] = useState('')
  const [altMobile, setAltMobile] = useState('')
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => { if (open) { setStep('phone'); setPhone(''); setCode(''); setErr(''); setSignupToken(''); setName(''); setAltMobile(''); setPw(''); setPw2(''); setOptIn(false) } }, [open])
  useEffect(() => {
    if (resendIn <= 0) return
    timerRef.current = setTimeout(() => setResendIn(s => s - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [resendIn])
  if (!open) return null

  const getRef = () => { try { return new URLSearchParams(window.location.search).get('ref') || localStorage.getItem('lg_ref') || '' } catch { return '' } }
  const post = async (p, b) => {
    const r = await fetch(`${API}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || `Error ${r.status}`)
    return d
  }
  const finish = (d) => { try { localStorage.setItem('em_token', d.token) } catch {}; onSuccess ? onSuccess(d) : window.location.reload() }

  const sendOtp = async () => {
    setErr('')
    if (!/^[6-9]\d{9}$/.test(phone)) { setErr('Enter a valid 10-digit number (starts 6–9). ବୈଧ ନମ୍ବର ଦିଅନ୍ତୁ।'); return }
    setBusy(true)
    try { const d = await post('/auth/send-login-otp', { mobile: phone }); setStep('otp'); setResendIn(30); setCode('') }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const verify = async () => {
    setErr('')
    if (!/^\d{6}$/.test(code)) { setErr('Enter the 6-digit OTP. ୬-ଅଙ୍କ OTP ଦିଅନ୍ତୁ।'); return }
    setBusy(true)
    try {
      const d = await post('/auth/verify-login-otp', { mobile: phone, code })
      if (d.needsProfile) { setSignupToken(d.signupToken); setStep('profile') }
      else finish(d)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const saveProfile = async () => {
    setErr('')
    if (!name.trim()) { setErr('Name is required. ନାମ ଆବଶ୍ୟକ।'); return }
    if (pw.length < 6) { setErr('Password must be at least 6 characters. ପାସୱାର୍ଡ ଅତି କମରେ ୬ ଅକ୍ଷର।'); return }
    if (pw !== pw2) { setErr('Passwords do not match. ପାସୱାର୍ଡ ମେଳ ହେଉନାହିଁ।'); return }
    setBusy(true)
    try { const d = await post('/auth/wa/complete-profile', { signupToken, name: name.trim(), altMobile, password: pw, confirm: pw2, waOptIn: optIn, ref: getRef() }); finish(d) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const field = 'w-full border rounded-xl px-3 py-2.5 text-[15px] outline-none focus:border-indigo-500'
  const label = 'text-[12px] font-semibold text-gray-600 mb-1 block'

  const overlay = (
    <div onClick={onClose} style={{ fontFamily: "'Noto Sans Oriya','Noto Sans',system-ui,sans-serif" }} className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-7 max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-extrabold text-[17px]" style={{ color: IND }}>Login / Sign up</div>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>

        {step === 'phone' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-2xl p-3" style={{ background: '#e8f9ef' }}>
              <span style={{ fontSize: 26 }}>🟢</span>
              <div className="text-[12.5px] text-gray-700">WhatsApp ନମ୍ବର ଦେଇ Login / Sign up<br /><span className="text-gray-500">Login or sign up with your WhatsApp number</span></div>
            </div>
            <label className={label}>WhatsApp Number · WhatsApp ନମ୍ବର</label>
            <div className="flex items-center gap-2">
              <span className="px-3 py-2.5 rounded-xl bg-gray-100 text-[15px] font-bold text-gray-600">+91</span>
              <input inputMode="numeric" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" className={field} autoFocus />
            </div>
            {err && <div className="text-[12px] text-rose-600">{err}</div>}
            <button disabled={busy} onClick={sendOtp} className="w-full rounded-full py-3 font-bold text-white text-[15px] disabled:opacity-60" style={{ background: GREEN }}>{busy ? 'Sending…' : 'Send OTP on WhatsApp'}</button>
            <div className="text-[11px] text-gray-400 text-center">We’ll send a 6-digit code to your WhatsApp.</div>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-3">
            <div className="text-[13px] text-gray-600">OTP sent to WhatsApp on <b>+91 XXXXXX{phone.slice(-4)}</b>. <button onClick={() => setStep('phone')} className="text-indigo-600 font-semibold">change</button></div>
            <label className={label}>Enter 6-digit OTP · OTP ଦିଅନ୍ତୁ</label>
            <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="______" className={field + ' tracking-[0.5em] text-center text-[20px] font-bold'} autoFocus />
            {err && <div className="text-[12px] text-rose-600">{err}</div>}
            <button disabled={busy} onClick={verify} className="w-full rounded-full py-3 font-bold text-white text-[15px] disabled:opacity-60" style={{ background: IND }}>{busy ? 'Verifying…' : 'Verify & Continue'}</button>
            <div className="text-center text-[12px]">{resendIn > 0 ? <span className="text-gray-400">Resend in {resendIn}s</span> : <button onClick={sendOtp} className="text-indigo-600 font-semibold">Resend OTP</button>}</div>
          </div>
        )}

        {step === 'profile' && (
          <div className="space-y-3" style={{ color: '#1E1B4B' }}>
            <div className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold rounded-full px-3 py-1.5" style={{ background: '#DCFCE7', color: '#047857' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
              ନମ୍ବର ଯାଞ୍ଚ ହୋଇଗଲା
            </div>
            <h2 className="text-[22px] font-extrabold leading-tight">ଆଉ ଗୋଟିଏ ପଦକ୍ଷେପ!</h2>
            <p className="text-[13px] -mt-1" style={{ color: '#64748B' }}>ଆପଣଙ୍କ ନାମ ଓ Password ଦିଅନ୍ତୁ, ତା&apos; ପରେ ସିଧା ଆରମ୍ଭ।</p>
            <div>
              <label className="block text-[13px] font-bold mb-1.5">ପୂରା ନାମ</label>
              <div className="flex items-center rounded-[14px] h-[50px] px-3" style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC' }}>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="ଯେପରି: ସୁନୀତା ସାହୁ" className="flex-1 bg-transparent outline-none text-[15px]" autoFocus />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-bold mb-1.5">WhatsApp ନମ୍ବର <span className="text-[10.5px] font-bold rounded-full px-2 py-0.5 ml-1" style={{ background: '#DCFCE7', color: '#047857' }}>ଯାଞ୍ଚ ହୋଇଛି</span></label>
              <div className="flex items-center rounded-[14px] h-[50px] px-3 gap-2" style={{ border: '1.5px solid #86EFAC', background: '#F0FDF4' }}>
                <span className="font-bold pr-2" style={{ color: '#1E1B4B', borderRight: '1px solid #E2E8F0' }}>+91</span>
                <span className="flex-1 font-bold text-[15px]">{phone}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-bold mb-1.5">ଅନ୍ୟ ମୋବାଇଲ ନମ୍ବର <span className="font-semibold text-[12px]" style={{ color: '#64748B' }}>(ଇଚ୍ଛାଧୀନ)</span></label>
              <div className="flex items-center rounded-[14px] h-[50px] px-3 gap-2" style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC' }}>
                <span className="font-bold pr-2" style={{ color: '#1E1B4B', borderRight: '1px solid #E2E8F0' }}>+91</span>
                <input inputMode="numeric" maxLength={10} value={altMobile} onChange={e => setAltMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="ଯଦି ଅଲଗା ଥାଏ" className="flex-1 bg-transparent outline-none text-[15px]" />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-bold mb-1.5">Password ତିଆରି କରନ୍ତୁ</label>
              <div className="flex items-center rounded-[14px] h-[50px] px-3" style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC' }}>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="ଅତି କମ୍‌ରେ ୬ ଅକ୍ଷର" className="flex-1 bg-transparent outline-none text-[15px]" />
              </div>
              <p className="text-[11.5px] mt-1.5" style={{ color: '#64748B' }}>ପରେ ନମ୍ବର + Password ରେ ମଧ୍ୟ Login କରିପାରିବେ।</p>
            </div>
            <div>
              <label className="block text-[13px] font-bold mb-1.5">ପୁଣି Password ଦିଅନ୍ତୁ</label>
              <div className="flex items-center rounded-[14px] h-[50px] px-3" style={{ border: '1.5px solid #E2E8F0', background: '#F8FAFC' }}>
                <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Password" className="flex-1 bg-transparent outline-none text-[15px]" />
              </div>
            </div>
            <button type="button" onClick={() => setOptIn(v => !v)} className="w-full rounded-[12px] p-2.5 flex items-start gap-2.5 text-left" style={{ background: '#F8FAFC' }}>
              <span className="w-5 h-5 rounded-md grid place-items-center shrink-0 mt-0.5" style={optIn ? { background: '#7C3AED' } : { background: '#fff', border: '2px solid #CBD5E1' }}>
                {optIn && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
              </span>
              <span className="text-[12.5px] leading-snug">WhatsApp ରେ ନୂଆ Lesson Plan ଓ Offer ର ଖବର ପାଇବାକୁ ଚାହେଁ।</span>
            </button>
            {err && <div className="text-[12px] text-rose-600">{err}</div>}
            <button disabled={busy} onClick={saveProfile} className="w-full rounded-[14px] h-[52px] font-extrabold text-[16px] text-white flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: 'linear-gradient(90deg,#2563EB,#7C3AED)', boxShadow: '0 10px 20px rgba(79,70,229,.3)' }}>
              {busy ? 'Creating…' : <>ସେଭ୍ କରି ଆରମ୍ଭ କରନ୍ତୁ <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
  return (typeof document !== 'undefined') ? createPortal(overlay, document.body) : overlay
}

// Global mount for /store pages — opens the modal on a 'store:login-request' event
// (dispatched by requireLogin) and reloads the SAME page on success.
export default function StoreAuthMount() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const h = () => setOpen(true)
    window.addEventListener('store:login-request', h)
    return () => window.removeEventListener('store:login-request', h)
  }, [])
  return <WaAuthModal open={open} onClose={() => setOpen(false)} onSuccess={() => { setOpen(false); window.location.reload() }} />
}
