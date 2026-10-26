'use client'
// ============================================================================
//  📞 Assessment Store — Contact / Support (ଯୋଗାଯୋଗ)
//  Simple page showing the Mulyayan Bhandar support WhatsApp line + hours.
//  Reads everything from /api/assess/config (admin-editable). Additive.
// ============================================================================
import React, { useEffect, useState } from 'react'

const digits = (s) => String(s || '').replace(/\D/g, '')
// "918093414633" → "+91 80934 14633"
const prettyPhone = (wa) => {
  const ten = digits(wa).slice(-10) || '0000000000'
  return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`
}
const waHref = (wa, text) => `https://wa.me/91${digits(wa).slice(-10)}?text=${encodeURIComponent(text || 'Lesson Guru Odisha — ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର ସମ୍ପର୍କରେ ସାହାଯ୍ୟ ଦରକାର।')}`

export default function AssessmentContact() {
  const [cfg, setCfg] = useState({ settings: {} })
  useEffect(() => { fetch('/api/assess/config', { cache: 'no-store' }).then(r => r.json()).then(setCfg).catch(() => {}) }, [])
  const s = cfg.settings || {}
  const wa = s.whatsapp_number || '918093414633'
  const email = s.support_email || 'support@lessonguruodisha.in'
  const hours = s.store_hours || 'ସୋମ – ଶନି · ସକାଳ ୧୦ଟା – ସନ୍ଧ୍ୟା ୭ଟା'
  const storeName = s.store_name || 'ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର'
  const footer = s.footer_note || 'Lesson Guru Odisha — ସ୍ୱାଧୀନ ଶିକ୍ଷକ ସହାୟକ ସାମଗ୍ରୀ।'

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Noto Sans Oriya', system-ui, sans-serif" }}>
      <div className="text-white" style={{ background: 'linear-gradient(135deg,#241a5e,#1fa2d9)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-2xl">📞</span>
          <div className="flex-1"><div className="font-black text-lg">ଯୋଗାଯୋଗ / ସାହାଯ୍ୟ</div><div className="text-[11px] opacity-80">{storeName} · Contact & Support</div></div>
          <a href="/assessment" className="text-[12px] bg-white/20 rounded-full px-3 py-1.5 font-bold">← ଭଣ୍ଡାର</a>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* WhatsApp support card */}
        <div className="bg-white border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 font-black text-white flex items-center gap-2" style={{ background: '#2a9d5c' }}>
            <span>💬</span> WhatsApp ସହାୟତା
          </div>
          <div className="p-4 space-y-3">
            <p className="text-[13px] text-slate-600 leading-relaxed">
              ପେମେଣ୍ଟ, ଡାଉନଲୋଡ୍ କିମ୍ବା ଶିକ୍ଷକ ଯାଞ୍ଚ ସମ୍ବନ୍ଧୀୟ ଯେକୌଣସି ପ୍ରଶ୍ନ ପାଇଁ ଆମ WhatsApp ନମ୍ବରରେ ମେସେଜ୍ କରନ୍ତୁ।
            </p>
            <div className="flex items-center gap-3 rounded-xl border p-3" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
              <span className="text-2xl">📱</span>
              <div className="flex-1">
                <div className="text-[11px] text-slate-500 font-bold">WhatsApp / Support</div>
                <div className="text-lg font-black tracking-wide" style={{ color: '#166534' }}>{prettyPhone(wa)}</div>
              </div>
            </div>
            <a href={waHref(wa)} target="_blank" rel="noopener noreferrer"
               className="block w-full text-center py-3 rounded-xl font-black text-white" style={{ background: '#2a9d5c' }}>
              WhatsApp‌ରେ ମେସେଜ୍ କରନ୍ତୁ
            </a>
          </div>
        </div>

        {/* Hours + email */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-white border rounded-2xl p-4">
            <div className="text-[11px] text-slate-500 font-bold mb-1">🕘 ସହାୟତା ସମୟ</div>
            <div className="text-[14px] font-bold text-slate-700 leading-snug">{hours}</div>
          </div>
          <div className="bg-white border rounded-2xl p-4">
            <div className="text-[11px] text-slate-500 font-bold mb-1">✉️ ଇମେଲ୍</div>
            <a href={`mailto:${email}`} className="text-[14px] font-bold break-all" style={{ color: '#1fa2d9' }}>{email}</a>
          </div>
        </div>

        {/* Quick links */}
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 font-bold mb-2">🔗 ଶୀଘ୍ର ଲିଙ୍କ୍</div>
          <div className="flex flex-wrap gap-2">
            <a href="/assessment" className="text-[12px] font-bold rounded-full px-3 py-1.5 border" style={{ borderColor: '#241a5e', color: '#241a5e' }}>🛒 ଭଣ୍ଡାର</a>
            <a href="/assessment/my" className="text-[12px] font-bold rounded-full px-3 py-1.5 border" style={{ borderColor: '#241a5e', color: '#241a5e' }}>🎒 ମୋ କିଣା</a>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 text-center px-2 pt-1">{footer}</p>
      </div>
    </div>
  )
}
