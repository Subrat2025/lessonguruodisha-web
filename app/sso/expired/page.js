'use client'
import React from 'react'

// Shown whenever auto-login cannot proceed (expired/invalid link, disabled,
// rate-limited, admin/blocked account). Never auto-logs anyone in.
export default function SsoExpired() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center bg-background text-foreground">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h1 className="text-lg font-bold mb-2">Link expired</h1>
        <p className="text-sm text-muted-foreground mb-6">Please tap again in Teacher Utility to sign in.</p>
        <a href="/login" className="inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold">Login with OTP</a>
      </div>
    </div>
  )
}
