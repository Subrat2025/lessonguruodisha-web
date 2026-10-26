'use client'
import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

// Public certificate verification page (no auth). Reads ?id=<certId>.
const McmVerifyView = () => {
  const [state, setState] = useState({ loading: true, data: null })
  useEffect(() => {
    let id = ''
    try { id = new URLSearchParams(window.location.search).get('id') || '' } catch {}
    if (!id) { setState({ loading: false, data: { valid: false } }); return }
    fetch(`/api/mcm-test/verify/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(r => r.json()).then(d => setState({ loading: false, data: d }))
      .catch(() => setState({ loading: false, data: { valid: false } }))
  }, [])

  const { loading, data } = state
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-100 dark:from-slate-950 dark:to-indigo-950 flex items-center justify-center p-4">
      <Card className="rounded-3xl border-2 p-6 max-w-md w-full text-center shadow-xl">
        <p className="text-[11px] font-black uppercase tracking-widest text-violet-600">🎓 Lesson Guru Odisha</p>
        <p className="font-black text-lg mt-1">Certificate Verification</p>
        {loading ? (
          <div className="py-10"><Loader2 className="w-7 h-7 mx-auto animate-spin text-violet-600" /></div>
        ) : data?.valid ? (
          <div className="mt-4">
            <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
            <p className="font-black text-emerald-600 mt-2">✅ Verified & Authentic</p>
            <div className="mt-4 space-y-2 text-left bg-muted rounded-2xl p-4 text-sm">
              <p><span className="text-muted-foreground">Name:</span> <b>{data.name}</b></p>
              <p><span className="text-muted-foreground">Test:</span> <b>{data.title}</b></p>
              <p><span className="text-muted-foreground">Month:</span> <b>{data.monthEn || data.monthLabel}</b></p>
              <p><span className="text-muted-foreground">Score:</span> <b className="text-violet-600">{data.percentage}%</b> · PASS</p>
              <p><span className="text-muted-foreground">Date:</span> <b>{data.date ? new Date(data.date).toLocaleDateString() : ''}</b></p>
              <p><span className="text-muted-foreground">Certificate ID:</span> <b className="font-mono text-[12px]">{data.certificateId}</b></p>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <XCircle className="w-14 h-14 mx-auto text-rose-500" />
            <p className="font-black text-rose-600 mt-2">Certificate not found</p>
            <p className="text-[12px] text-muted-foreground mt-1">This certificate ID could not be verified. Please check the link.</p>
          </div>
        )}
        <a href="/" className="inline-block mt-5 text-sm font-bold text-violet-600 underline">Go to Lesson Guru Odisha →</a>
      </Card>
    </div>
  )
}

export default McmVerifyView
