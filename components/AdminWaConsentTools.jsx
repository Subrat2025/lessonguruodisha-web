'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MessageCircle, Phone, Loader2, ShieldCheck, Users } from 'lucide-react'

const authFetch = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

// Admin tools for WhatsApp consent:
//  1) Editable SUPPORT_WHATSAPP_NUMBER (used by the Login support button).
//  2) Safe one-time "Backfill WhatsApp consent" with a dry-run first.
export default function AdminWaConsentTools() {
  const [number, setNumber] = useState('')
  const [loadingNum, setLoadingNum] = useState(true)
  const [savingNum, setSavingNum] = useState(false)

  const [counts, setCounts] = useState(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(null)

  useEffect(() => {
    authFetch('/admin/support-whatsapp')
      .then((d) => setNumber(d.number || ''))
      .catch(() => {})
      .finally(() => setLoadingNum(false))
  }, [])

  const saveNumber = async () => {
    const digits = String(number || '').replace(/\D/g, '')
    if (digits.length < 11 || digits.length > 15) return toast.error('Enter a valid number with country code (e.g. 918093414633)')
    setSavingNum(true)
    try {
      const d = await authFetch('/admin/support-whatsapp', { method: 'PUT', body: JSON.stringify({ number: digits }) })
      setNumber(d.number)
      toast.success('✅ Support WhatsApp number saved')
    } catch (e) { toast.error(e.message) } finally { setSavingNum(false) }
  }

  const checkCounts = async () => {
    setChecking(true); setApplied(null)
    try {
      const d = await authFetch('/admin/wa-consent-backfill')
      setCounts(d)
    } catch (e) { toast.error(e.message) } finally { setChecking(false) }
  }

  const applyBackfill = async () => {
    if (!counts) return
    if (!window.confirm(`Apply backfill?\n\nWill set TRUE: ${counts.willSetTrue}\nWill set FALSE: ${counts.willSetFalse}\nAlready set (skipped): ${counts.alreadySet}\n\nThis cannot be undone automatically.`)) return
    setApplying(true)
    try {
      const d = await authFetch('/admin/wa-consent-backfill', { method: 'POST', body: JSON.stringify({}) })
      setApplied(d)
      toast.success(`✅ Backfill done — set TRUE: ${d.setTrue}, set FALSE: ${d.setFalse}`)
      checkCounts()
    } catch (e) { toast.error(e.message) } finally { setApplying(false) }
  }

  return (
    <div className="space-y-4">
      {/* Support WhatsApp number */}
      <Card className="p-4 rounded-2xl border-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white shadow">
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-sm">Support WhatsApp Number</p>
            <p className="text-[11px] text-muted-foreground">Used by the Login page “WhatsApp Support” button. Digits only, with country code (e.g. 918093414633).</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
            placeholder="918093414633"
            inputMode="numeric"
            disabled={loadingNum}
            className="h-11 rounded-xl text-base"
          />
          <Button onClick={saveNumber} disabled={savingNum || loadingNum} className="h-11 rounded-xl font-bold px-5">
            {savingNum ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </Card>

      {/* Backfill consent */}
      <Card className="p-4 rounded-2xl border-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-sm">Backfill WhatsApp consent</p>
            <p className="text-[11px] text-muted-foreground">One-time. Only touches users with no consent set yet. Users who turned the toggle OFF or sent STOP stay OFF.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={checkCounts} disabled={checking} variant="outline" className="h-10 rounded-xl font-bold">
            {checking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
            Check counts (dry-run)
          </Button>
          <Button onClick={applyBackfill} disabled={applying || !counts || counts.candidates === 0} className="h-10 rounded-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600">
            {applying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <MessageCircle className="w-4 h-4 mr-2" />}
            Apply backfill
          </Button>
        </div>

        {counts && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-xl bg-muted p-2.5">
              <div className="text-lg font-extrabold">{counts.candidates}</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Candidates (no field)</div>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
              <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">{counts.willSetTrue}</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Will set TRUE</div>
            </div>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-2.5">
              <div className="text-lg font-extrabold text-rose-700 dark:text-rose-300">{counts.willSetFalse}</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Will set FALSE</div>
            </div>
            <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2.5">
              <div className="text-lg font-extrabold">{counts.alreadySet}</div>
              <div className="text-[10px] text-muted-foreground font-semibold">Already set (skipped)</div>
            </div>
          </div>
        )}

        {applied && (
          <div className="mt-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">
            ✅ Applied — set TRUE: {applied.setTrue}, set FALSE: {applied.setFalse}
          </div>
        )}
      </Card>
    </div>
  )
}
