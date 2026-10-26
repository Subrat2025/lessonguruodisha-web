'use client'
// === TOB === Lightweight admin wrapper so the full Teacher-Observation manager
// (Import / One-ZIP / Items / Sell / Trash / Audit / Settings) is reachable at a
// direct URL for review & screenshots. Admin token (em_token) required.
import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import AdminTobManager from '@/components/AdminTobManager'

export default function TobAdminPage() {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState('items')
  useEffect(() => {
    try { setAuthed(!!localStorage.getItem('em_token')) } catch {}
    try { const t = new URLSearchParams(window.location.search).get('tab'); if (t) setTab(t) } catch {}
    setReady(true)
  }, [])
  return (
    <div style={{ background: '#f6f7fb', minHeight: '100vh' }}>
      <Toaster position="top-center" />
      <div className="max-w-3xl mx-auto px-3 py-4">
        <h1 className="text-lg font-extrabold text-indigo-900 mb-2">Teacher Observation — Admin</h1>
        {!ready ? <div className="text-sm text-gray-400">Loading…</div>
          : authed ? <AdminTobManager initialTab={tab} goLoMaster={() => { window.location.href = '/' }} />
            : <div className="bg-white border rounded-2xl p-6 text-center text-sm text-gray-600">Please <a href="/" className="text-indigo-600 font-bold">log in as admin</a> first, then reopen this page.</div>}
      </div>
    </div>
  )
}
