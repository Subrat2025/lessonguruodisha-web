'use client'
import React, { useEffect, useState } from 'react'
import { districtLabel } from '@/lib/odisha-districts'
import AppBottomNav from '@/components/nav/AppBottomNav'
import { inNativeApp } from '@/lib/in-app'

const NAV_HREF = { home: '/', classes: '/lessons', search: '/search', plans: '/plans', profile: '/dashboard' }
const navGo = (id) => { if (typeof window !== 'undefined') window.location.href = (id === 'plans' && inNativeApp() ? '/my-plan' : NAV_HREF[id]) || '/' }

// Odia strings via \u escapes (kept exact; avoids any editor codepoint drift).
const T = {
  title: 'District Heads',
  subtitle: '\u0B13\u0B21\u0B3F\u0B36\u0B3E\u0B30 30 \u0B1C\u0B3F\u0B32\u0B4D\u0B32\u0B30 District Head', // ଓଡ଼ିଶାର 30 ଜିଲ୍ଲର District Head
  empty: '\u0B16\u0B3E\u0B32\u0B3F \u0B05\u0B1B\u0B3F, Refer \u0B15\u0B30\u0B3F \u0B06\u0B2A\u0B23 \u0B39\u0B41\u0B05\u0B28\u0B4D\u0B24\u0B41!', // ଖାଲି ଅଛି, Refer କରି ଆପଣ ହୁଅନ୍ତୁ!
  becomeBtn: 'Refer \u0B15\u0B30\u0B28\u0B4D\u0B24\u0B41', // Refer କରନ୍ତୁ
  privateTxt: '\u0B17\u0B4B\u0B2A\u0B28\u0B40\u0B5F (\u0B28\u0B3E\u0B2E \u0B32\u0B41\u0B15\u0B4D\u0B15\u0B3E\u0B5F\u0B3F\u0B24)', // ଗୋପନୀୟ (ନାମ ଲୁକ୍କାୟିତ)
  since: '\u0B20\u0B3E\u0B30\u0B41', // ଠାରୁ (since)
}
const CROWN = `<svg width="46" height="46" viewBox="0 0 64 64"><ellipse cx="32" cy="59" rx="20" ry="3.5" fill="#BFDBFE"/><path d="M14 58c0-11 8-18 18-18s18 7 18 18z" fill="#2563EB"/><path d="M26 41l6 9 6-9" fill="#fff"/><circle cx="32" cy="29" r="10.5" fill="#F5C9A0"/><path d="M21.5 27c0-7 4.5-10.5 10.5-10.5S42.5 20 42.5 27c-2-3-5.5-4.5-10.5-4.5S23.5 24 21.5 27z" fill="#3F2A1E"/><circle cx="28.2" cy="29.5" r="1.2" fill="#3F2A1E"/><circle cx="35.8" cy="29.5" r="1.2" fill="#3F2A1E"/><path d="M28.5 33.5c2 1.8 5 1.8 7 0" stroke="#B45309" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M22 13l4 4 6-8 6 8 4-4-2 8H24z" fill="#FACC15" stroke="#EAB308" stroke-width="1"/><circle cx="32" cy="9" r="1.6" fill="#F43F5E"/></svg>`
const H = (html) => <span dangerouslySetInnerHTML={{ __html: html }} />
const monYear = (d) => { if (!d) return ''; const x = new Date(d); return x.toLocaleString('en-US', { month: 'short', year: 'numeric' }) }

export default function DistrictHeadsPage() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  // Feature gate: this public page is hidden (redirect home) whenever the
  // REFERRAL_POPUP_V2 master switch (referral_milestone_config.popupV2) is OFF,
  // so teachers never see an empty directory before the referral offer launches.
  const [gate, setGate] = useState('checking') // checking | ok | blocked
  useEffect(() => {
    let alive = true
    fetch('/api/settings/public')
      .then(r => r.json())
      .then(cfg => {
        if (!alive) return
        if (cfg && cfg.referralPopupV2) {
          setGate('ok')
          fetch('/api/district-heads').then(r => r.json()).then(d => { if (alive) { setList(d.districts || []); setLoading(false) } }).catch(() => alive && setLoading(false))
        } else {
          setGate('blocked')
          if (typeof window !== 'undefined') window.location.replace('/')
        }
      })
      .catch(() => { if (alive) { setGate('blocked'); if (typeof window !== 'undefined') window.location.replace('/') } })
    return () => { alive = false }
  }, [])

  if (gate !== 'ok') {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F5F3FF', color: '#8C7BA8' }}>Loading…</div>
  }
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#F5F3FF,#FFF)', fontFamily: '"Noto Sans Oriya",Inter,sans-serif' }}>
      {/* Colourful header banner — purple→pink gradient with crowned-teacher clipart */}
      <div style={{ background: 'linear-gradient(135deg,#7C3AED 0%,#A855F7 45%,#EC4899 100%)', padding: '26px 16px 46px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,.10)' }} />
        <div style={{ position: 'absolute', bottom: -50, left: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: 72, height: 72, borderRadius: 22, background: 'linear-gradient(145deg,#FDE047,#F59E0B)', margin: '0 auto 10px', boxShadow: '0 10px 24px rgba(0,0,0,.18)', border: '3px solid rgba(255,255,255,.55)' }}>{H(CROWN)}</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: 0, letterSpacing: .2 }}>{T.title}</h1>
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,.92)', marginTop: 6, fontWeight: 600 }}>{T.subtitle}</p>
        </div>
      </div>
      <div style={{ maxWidth: 820, margin: '-26px auto 0', padding: '0 14px 110px', position: 'relative' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#8C7BA8', padding: 40 }}>Loading…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
            {list.map((c) => (
              <div key={c.district} style={{ borderRadius: 18, padding: 14, background: '#fff', border: c.status === 'filled' ? '2px solid #FDE047' : '1px solid #E9D5FF', boxShadow: '0 4px 14px rgba(91,33,182,.08)' }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: .2, color: '#7C3AED' }}>{districtLabel(c.district)}</div>
                {c.status === 'filled' && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 14, overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center', background: '#EFF6FF' }}>
                      {c.head.photo ? <img src={c.head.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : H(CROWN)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1235' }}>{c.head.name}</div>
                      {c.head.school && <div style={{ fontSize: 12, color: '#6B5A86' }}>{c.head.school}</div>}
                      {c.head.since && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{T.since} {monYear(c.head.since)}</div>}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, fontWeight: 800, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 999 }}>★ District Head</span>
                    </div>
                  </div>
                )}
                {c.status === 'private' && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#6B5A86', display: 'flex', alignItems: 'center', gap: 8 }}>{H(CROWN)} {T.privateTxt}</div>
                )}
                {c.status === 'empty' && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, color: '#4B3B66', lineHeight: 1.4 }}>{T.empty}</div>
                    <a href="/?ref=1" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 800, color: '#fff', textDecoration: 'none', background: 'linear-gradient(90deg,#7C3AED,#EC4899)', padding: '7px 12px', borderRadius: 10 }}>{T.becomeBtn}</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <AppBottomNav view="" go={navGo} />
    </div>
  )
}
