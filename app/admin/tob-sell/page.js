'use client'
// === TOB === Dedicated Admin Sell-config screen ("ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ — ବିକ୍ରି").
// Reuses the SellTab from AdminTobManager (paywall toggle + prices + per-class
// overrides + keep-free list + live preview). Also embedded inside the admin
// panel's Teacher Observation tool. Admin token (em_token) required.
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { SellTab } from '@/components/AdminTobManager'

export default function TobSellAdminPage() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  useEffect(() => { try { setAuthed(!!localStorage.getItem('em_token')) } catch {} setReady(true) }, [])
  return (
    <div style={{ background: '#f6f7fb', minHeight: '100vh' }}>
      <Toaster position="top-center" />
      <div className="max-w-2xl mx-auto px-3 py-4">
        <div className="mb-3">
          <a href="/store/teacher-observation" className="text-[11px] font-bold text-indigo-600">↗ View store page</a>
          <h1 className="text-lg font-extrabold text-indigo-900 mt-1" style={{ fontFamily: '"Noto Sans Oriya",system-ui,sans-serif' }}>ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ — ବିକ୍ରି</h1>
          <p className="text-[11px] text-gray-500">Paywall switch, default prices, per-class overrides & keep-free list, with a live preview.</p>
        </div>
        {!ready ? <div className="text-sm text-gray-400">Loading…</div>
          : authed ? <SellTab />
            : <div className="bg-white border rounded-2xl p-6 text-center text-sm text-gray-600">Please <a href="/" className="text-indigo-600 font-bold">log in as admin</a> first, then reopen this page.</div>}
      </div>
    </div>
  )
}
