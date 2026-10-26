'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageSquareShare, RefreshCw, Loader2, RotateCcw } from 'lucide-react'

const getToken = () => (typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null)
const authFetch = async (path, opts = {}) => {
  const token = getToken()
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

// Admin: edit the referral share message (used on WhatsApp/Telegram/FB/Email/Copy/popup/referral page).
export default function AdminReferralShare() {
  const [template, setTemplate] = useState('')
  const [def, setDef] = useState('')
  const [preview, setPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const d = await authFetch('/admin/referral-share')
      setTemplate(d.template || '')
      setDef(d.default || '')
      setPreview(d.preview || '')
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      const d = await authFetch('/admin/referral-share', { method: 'PUT', body: JSON.stringify({ text: template }) })
      setPreview(d.preview || '')
      toast.success('Referral share message saved')
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  const resetDefault = () => { if (def) { setTemplate(def); toast.info('Loaded default — remember to Save') } }

  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><MessageSquareShare className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <h3 className="font-bold leading-tight">Referral share message</h3>
            <p className="text-[11px] text-muted-foreground">Used on WhatsApp / Telegram / Facebook / Email / Copy / popup / referral page</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={load} className="rounded-full"><RefreshCw className="w-4 h-4" /></Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <>
          <div className="text-[12px] text-muted-foreground mb-2">
            Placeholder: <code className="px-1 rounded bg-muted font-mono">{'{link}'}</code> = teacher&apos;s referral link. Keep the <b>*stars*</b> (WhatsApp bold), line breaks and emojis. Only Odia, English, ₹ and emojis are allowed (non-Odia letters are rejected on save).
          </div>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={16}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm font-mono leading-relaxed"
            spellCheck={false}
          />
          <div className="flex items-center gap-2 mt-3">
            <Button onClick={save} disabled={saving} className="rounded-xl">{saving ? 'Saving…' : 'Save message'}</Button>
            <Button onClick={resetDefault} variant="outline" className="rounded-xl"><RotateCcw className="w-4 h-4 mr-1" /> Load default</Button>
          </div>

          {preview && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold mb-1">Preview (with sample link)</h4>
              <pre className="text-[12px] whitespace-pre-wrap font-sans bg-muted/40 rounded-xl p-3 leading-relaxed">{preview}</pre>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
