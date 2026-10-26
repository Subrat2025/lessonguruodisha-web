// ============================================================================
// 🚀 Admin editor for the Facebook Ads Landing Page (/lp)
// ----------------------------------------------------------------------------
// Fetches the current LP config from /admin/lp/config, lets the admin edit
// every user-facing string (urgency bar, hero, demo video URL, countdown
// timer), and PUTs the updated JSON back.  All fields fall back to sensible
// defaults if left blank.
// ============================================================================
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, RotateCw, ExternalLink, Play, AlertCircle } from 'lucide-react'

// Convert any YouTube URL to a usable embed src (for live preview)
const ytIdFrom = (u) => {
  if (!u) return null
  const s = String(u)
  let m
  if ((m = s.match(/youtu\.be\/([\w-]{6,})/))) return m[1]
  if ((m = s.match(/[?&]v=([\w-]{6,})/))) return m[1]
  if ((m = s.match(/\/embed\/([\w-]{6,})/))) return m[1]
  if ((m = s.match(/\/shorts\/([\w-]{6,})/))) return m[1]
  return null
}

const AdminLandingPageEditor = ({ api }) => {
  const [cfg, setCfg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api('/admin/lp/config')
      setCfg(r || {})
    } catch (e) { toast.error(e?.message || 'Failed to load') } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const save = async () => {
    setSaving(true)
    try {
      const r = await api('/admin/lp/config', { method: 'PUT', body: cfg })
      setCfg(r?.config || cfg)
      toast.success('✅ Landing page saved — deploy or refresh /lp to see changes live')
    } catch (e) { toast.error(e?.message || 'Save failed') } finally { setSaving(false) }
  }

  if (loading || !cfg) {
    return (
      <Card className="p-6 rounded-2xl border-2 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading landing page config…
      </Card>
    )
  }

  const set = (k) => (e) => setCfg({ ...cfg, [k]: e?.target ? e.target.value : e })
  const videoId = ytIdFrom(cfg.videoUrl)

  return (
    <div className="space-y-3">
      {/* Header + Preview link */}
      <Card className="p-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-900/60">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-[13px] font-black flex items-center gap-1.5">🚀 Landing Page Editor</p>
            <p className="text-[10.5px] text-muted-foreground">Edit the public /lp page — used for Facebook / Instagram ads.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-8 rounded-lg">
              <RotateCw className="w-3.5 h-3.5 mr-1" /> Reload
            </Button>
            <Button variant="outline" size="sm" asChild className="h-8 rounded-lg">
              <a href="/lp" target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Open /lp</a>
            </Button>
          </div>
        </div>
      </Card>

      {/* 🕒 Countdown Timer */}
      <Card className="p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-extrabold">🕒 Visitor Countdown Timer</p>
          <label className="flex items-center gap-1.5 text-[11px]">
            <input type="checkbox" checked={cfg.timerEnabled !== false} onChange={e => setCfg({ ...cfg, timerEnabled: e.target.checked })} />
            Show timer
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">Every new visitor gets their own 24-hour offer window (stored in their browser). Reloads keep the same timer, but a new device/browser starts fresh.</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px]">Duration (hours)</Label>
            <Input type="number" min={1} max={168} value={cfg.timerDurationHours || 24} onChange={(e) => setCfg({ ...cfg, timerDurationHours: Number(e.target.value) })} className="rounded-lg" />
          </div>
          <div className="col-span-2">
            <Label className="text-[11px]">Headline</Label>
            <Input value={cfg.timerHeadline || ''} onChange={set('timerHeadline')} placeholder="⚡ ଏହି Offer ଆପଣଙ୍କ ପାଇଁ ମାତ୍ର" className="rounded-lg" />
          </div>
          <div className="col-span-3">
            <Label className="text-[11px]">Sub-text (shown after timer on desktop)</Label>
            <Input value={cfg.timerSubText || ''} onChange={set('timerSubText')} placeholder="ଏଥିପରେ Price ପୁଣି ପୂର୍ବଵତ ହୋଇଯିବ" className="rounded-lg" />
          </div>
          <div className="col-span-3">
            <Label className="text-[11px]">Expired text</Label>
            <Input value={cfg.timerExpiredText || ''} onChange={set('timerExpiredText')} placeholder="⌛ Offer ସମାପ୍ତ ହୋଇଗଲା — Please contact support" className="rounded-lg" />
          </div>
        </div>
      </Card>

      {/* 🔥 Urgency Bar */}
      <Card className="p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-extrabold">🔥 Urgency Bar</p>
          <label className="flex items-center gap-1.5 text-[11px]">
            <input type="checkbox" checked={cfg.urgencyEnabled !== false} onChange={e => setCfg({ ...cfg, urgencyEnabled: e.target.checked })} />
            Show urgency bar
          </label>
        </div>
        <Textarea rows={2} value={cfg.urgencyText || ''} onChange={set('urgencyText')} placeholder="ଆଜି Premium ନେଇ Lesson Plan…" className="rounded-lg text-[11.5px]" />
      </Card>

      {/* 🎥 Demo Video */}
      <Card className="p-4 rounded-2xl space-y-3 border-2 border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/60">
        <p className="text-[13px] font-extrabold">🎥 Demo Video — ଏକ ନଜରରେ LessonGuru</p>
        <div>
          <Label className="text-[11px]">YouTube URL (any format — full, short, embed, shorts)</Label>
          <Input value={cfg.videoUrl || ''} onChange={set('videoUrl')} placeholder="https://youtu.be/uoXTFqa7ccs" className="rounded-lg font-mono text-[11px]" />
          {cfg.videoUrl && !videoId && (
            <p className="text-[10px] text-red-600 flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" /> Not a valid YouTube URL — the poster/embed won't render.</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Eyebrow</Label>
            <Input value={cfg.videoEyebrow || ''} onChange={set('videoEyebrow')} placeholder="30 Second Demo" className="rounded-lg" />
          </div>
          <div>
            <Label className="text-[11px]">Title</Label>
            <Input value={cfg.videoTitle || ''} onChange={set('videoTitle')} placeholder="ଏକ ନଜରରେ LessonGuru" className="rounded-lg" />
          </div>
          <div className="col-span-2">
            <Label className="text-[11px]">Subtitle</Label>
            <Input value={cfg.videoSubtitle || ''} onChange={set('videoSubtitle')} placeholder="ଦେଖନ୍ତୁ — ମାତ୍ର ୩୦ ସେକେଣ୍ଡରେ…" className="rounded-lg" />
          </div>
        </div>
        {videoId && (
          <div>
            <p className="text-[10px] font-bold text-muted-foreground mt-1">Live preview:</p>
            <div className="mt-1 aspect-video rounded-xl overflow-hidden border">
              <iframe
                className="w-full h-full"
                src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`}
                title="Preview" frameBorder="0"
                allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen
              />
            </div>
          </div>
        )}
      </Card>

      {/* 📞 WhatsApp CTA */}
      <Card className="p-4 rounded-2xl space-y-2">
        <p className="text-[13px] font-extrabold">📞 WhatsApp Number (for floating CTA)</p>
        <Input value={cfg.whatsappNumber || ''} onChange={set('whatsappNumber')} placeholder="9692604577" maxLength={10} className="rounded-lg font-mono" />
      </Card>

      {/* Save */}
      <div className="sticky bottom-2 z-10">
        <Button onClick={save} disabled={saving} className="w-full h-12 rounded-2xl font-black text-[13px] bg-gradient-to-r from-indigo-600 to-purple-600 hover:brightness-110 text-white shadow-lg">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (<><Save className="w-4 h-4 mr-1.5" /> Save Landing Page</>)}
        </Button>
        <p className="text-[10px] text-center text-muted-foreground mt-1.5">Saved changes appear on /lp immediately (client fetches config on page load).</p>
      </div>
    </div>
  )
}

export default AdminLandingPageEditor
