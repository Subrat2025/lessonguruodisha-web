'use client'
import React, { useEffect, useState } from 'react'

// Shown on the Profile for a user who is a District Head: gold badge, the
// "coming soon: special role" line, and the public-display consent toggle.
// Renders nothing for everyone else. No admin access is implied by this role.
const CROWN = `<svg width="20" height="20" viewBox="0 0 64 64"><path d="M22 13l4 4 6-8 6 8 4-4-2 8H24z" fill="#FACC15" stroke="#EAB308" stroke-width="1.2"/><circle cx="32" cy="29" r="9" fill="#F5C9A0"/><path d="M22 27c0-6 4-9 10-9s10 3 10 9c-2-2.5-5-4-10-4s-8 1.5-10 4z" fill="#3F2A1E"/></svg>`
const COMING = '\u0B36\u0B40\u0B18\u0B4D\u0B30 \u0B06\u0B38\u0B41\u0B1B\u0B3F: \u0B36\u0B3F\u0B15\u0B4D\u0B37\u0B3E \u0B38\u0B3E\u0B2E\u0B17\u0B4D\u0B30\u0B40 \u0B24\u0B3F\u0B06\u0B30\u0B3F Platform \u0B30\u0B47 \u0B2C\u0B3F\u0B36\u0B47\u0B37 \u0B2D\u0B42\u0B2E\u0B3F\u0B15\u0B3E'
const CONSENT = '\u0B2E\u0B4B \u0B28\u0B3E\u0B2E \u0B13 \u0B2B\u0B1F\u0B4B District Heads \u0B2A\u0B43\u0B37\u0B4D\u0B20\u0B3E\u0B30\u0B47 \u0B26\u0B47\u0B16\u0B3E\u0B07\u0B2C\u0B3E\u0B15\u0B41 \u0B2E\u0B41\u0B01 \u0B30\u0B3E\u0B1C\u0B3F'
const H = (h) => <span dangerouslySetInnerHTML={{ __html: h }} />
const api = async (p, o = {}) => {
  const t = localStorage.getItem('em_token') || localStorage.getItem('token')
  const r = await fetch(`/api${p}`, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined })
  return r.json()
}

export default function DistrictHeadPanel() {
  const [st, setSt] = useState(null)
  useEffect(() => { api('/me/district-head-consent').then(setSt).catch(() => {}) }, [])
  if (!st?.isDistrictHead) return null
  const toggle = async () => { const r = await api('/me/district-head-consent', { method: 'POST', body: { consent: !st.consent } }); if (r.ok) setSt({ ...st, consent: r.dhConsent }) }
  return (
    <div style={{ margin: '14px 0', borderRadius: 18, padding: 14, background: 'linear-gradient(135deg,#FFFBEB,#FEF9C3)', border: '2px solid #FDE047' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'grid', placeItems: 'center' }}>{H(CROWN)}</span>
        <b style={{ fontSize: 15, color: '#92400E' }}>District Head{st.district ? ` · ${st.district}` : ''}</b>
      </div>
      <p style={{ fontSize: 12.5, color: '#7C5E10', marginTop: 8, lineHeight: 1.5 }}>{COMING}</p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 12.5, color: '#4B3B2A', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!st.consent} onChange={toggle} style={{ marginTop: 2 }} />
        <span>{CONSENT}</span>
      </label>
    </div>
  )
}
