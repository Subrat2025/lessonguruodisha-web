'use client'
import { useEffect } from 'react'

// Route-level error boundary for /assessment/my — never show a raw JS error
// (e.g. "i is not a function") to a teacher. Log the real error for the admin.
export default function Error({ error, reset }) {
  useEffect(() => { try { console.error('[assessment/my] runtime error:', error) } catch {} }, [error])
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" style={{ fontFamily: "'Noto Sans Oriya', system-ui, sans-serif" }}>
      <div className="max-w-sm w-full text-center space-y-4 bg-white rounded-2xl border p-6 shadow-sm">
        <div className="text-4xl">😕</div>
        <p className="font-bold text-slate-700 leading-relaxed">କିଛି ସମସ୍ୟା ହେଲା — ପୃଷ୍ଠା ରିଫ୍ରେସ୍ କରନ୍ତୁ ବା WhatsApp କରନ୍ତୁ: +91 80934 14633</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => reset()} className="px-4 py-2 rounded-xl font-black text-white" style={{ background: '#241a5e' }}>🔄 ପୁଣି ଚେଷ୍ଟା</button>
          <a href="https://wa.me/918093414633" target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl font-black text-white" style={{ background: '#25D366' }}>💬 WhatsApp</a>
        </div>
      </div>
    </div>
  )
}
