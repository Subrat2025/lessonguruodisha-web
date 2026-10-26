'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { MessageCircle, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

// Teacher self-service opt-in/out for WhatsApp marketing updates.
// Default ON for existing users who gave their number at sign-up.
export default function WaUpdatesToggle({ user }) {
  const [optIn, setOptIn] = useState(user?.waOptIn !== false)
  const [busy, setBusy] = useState(false)

  const toggle = async (v) => {
    setOptIn(v); setBusy(true)
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
      const res = await fetch('/api/profile/wa-optin', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ optIn: v }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed')
      setOptIn(data.waOptIn !== false)
      toast.success(v ? '🔔 WhatsApp updates ON' : '🔕 WhatsApp updates OFF')
    } catch (e) { toast.error(e.message); setOptIn(!v) } finally { setBusy(false) }
  }

  return (
    <Card className="p-4 rounded-2xl border-2 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white shadow">
        <MessageCircle className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <div className="font-semibold flex items-center gap-2">WhatsApp updates {busy && <Loader2 className="w-3 h-3 animate-spin" />}</div>
        <div className="text-[10px] text-muted-foreground">Offers, reminders &amp; tips on WhatsApp. (Verification/OTP is always sent.)</div>
      </div>
      <Switch checked={optIn} disabled={busy} onCheckedChange={toggle} />
    </Card>
  )
}
