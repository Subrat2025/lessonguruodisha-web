'use client'
/**
 * My Downloads — user-facing page listing every Lesson Plan PDF/Word the
 * signed-in teacher has generated.  Shows Doc ID, title, date, format,
 * status and offers per-row actions:
 *   • Re-download    (if the doc is still ACTIVE and downloadable)
 *   • Regenerate     (if the innerHtml payload is still cached, up to 7 days)
 *   • Open in Lesson (deep-link to the source lesson page — best-effort)
 *
 * Purely additive.  Only reads /api/lesson-plans/my-documents +
 * regenerate endpoint.  Does not affect any other feature.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Download,
  FileText,
  FileType2,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Ban,
  RotateCcw,
  Copy,
  ChevronLeft,
} from 'lucide-react'

const api = async (url, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : ''
  const res = await fetch(`/api${url}`, {
    ...opts,
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
  return j
}

const statusBadge = (s) => {
  switch (s) {
    case 'active':
      return { label: 'Active', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' }
    case 'used':
      return { label: 'Used', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' }
    case 'revoked':
      return { label: 'Revoked', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
    default:
      return { label: s || '—', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300' }
  }
}

const formatDateShort = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch (_) { return String(d) }
}

// Downloads a Blob response into an actual file.  Detects the JSON
// "print fallback" envelope from the server and forwards it to the
// client-side html2pdf fallback we use elsewhere in the app.
const streamDownload = async (downloadUrl, filename, format, extras = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : ''
  const res = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    let msg = 'Download failed'
    try { const j = await res.json(); msg = j?.error || msg } catch (_) { /* ignore */ }
    throw new Error(msg)
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  if (ct.includes('application/json')) {
    const j = await res.json()
    if (j?.fallback === 'print' && typeof j.html === 'string') {
      const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '')
      if (isMobile) {
        const container = document.createElement('div')
        container.style.cssText = 'width:297mm;background:#fff;color:#000;font-family:Inter,\'Noto Sans Oriya\',sans-serif;position:fixed;left:-10000px;top:0;z-index:-1'
        const clean = j.html.replace(/<script[\s\S]*?<\/script>/gi, '')
        const bodyM = clean.match(/<body[^>]*>([\s\S]*)<\/body>/i)
        const styleM = clean.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        container.innerHTML = (styleM ? `<style>${styleM[1]}</style>` : '') + (bodyM ? bodyM[1] : clean)
        document.body.appendChild(container)
        try {
          // Wait for embedded Odia @font-face to load — prevents tofu on mobile
          try {
            await Promise.race([
              document.fonts && document.fonts.ready,
              new Promise(r => setTimeout(r, 4000)),
            ])
          } catch (_) { /* ignore */ }
          const { default: html2pdf } = await import('html2pdf.js')
          await html2pdf().set({
            margin: [8, 8, 8, 8],
            filename: `${j.filename || filename}.pdf`,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
            pagebreak: { mode: ['css', 'legacy'] },
          }).from(container).save()
        } finally {
          try { document.body.removeChild(container) } catch (_) { /* ignore */ }
        }
        return
      }
      // Desktop → blob URL + auto-print
      const blob = new Blob([j.html], { type: 'text/html; charset=utf-8' })
      const objUrl = URL.createObjectURL(blob)
      window.open(objUrl, '_blank', 'noopener,noreferrer,width=1024,height=768')
      setTimeout(() => { try { URL.revokeObjectURL(objUrl) } catch (_) { /* ignore */ } }, 60000)
      return
    }
    throw new Error(j?.error || 'Download failed')
  }
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = `${filename}.${format === 'pdf' ? 'pdf' : 'doc'}`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objUrl) }, 1500)
}

const MyDownloads = ({ onBack }) => {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [formatFilter, setFormatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (formatFilter) qs.set('format', formatFilter)
      if (statusFilter) qs.set('status', statusFilter)
      qs.set('limit', '60')
      const r = await api(`/lesson-plans/my-documents?${qs.toString()}`)
      setItems(r.items || [])
      setTotal(r.total || 0)
    } catch (e) {
      toast.error(e?.message || 'Failed to load downloads')
    } finally { setLoading(false) }
  }, [formatFilter, statusFilter])

  useEffect(() => { load() }, [load])

  const stats = useMemo(() => {
    const active = items.filter(x => x.downloadStatus === 'active').length
    const used   = items.filter(x => x.downloadStatus === 'used').length
    const revoked = items.filter(x => x.downloadStatus === 'revoked').length
    const totalDownloads = items.reduce((s, x) => s + (x.downloadCount || 0), 0)
    return { active, used, revoked, totalDownloads }
  }, [items])

  const filenameFor = (it) => {
    const base = (it.lesson?.title || 'lesson-plan').replace(/[^\w\u0900-\u0D7F\- ]+/g, '').slice(0, 60).trim() || 'lesson-plan'
    return `${base}-${it.id}.${it.format === 'pdf' ? 'pdf' : 'doc'}`
  }

  const reDownload = async (it) => {
    if (!it.canRedownload) return
    setBusyId(it.id)
    const filename = filenameFor(it)
    const tid = toast.loading(`Preparing "${filename}"…`)
    try {
      const downloadUrl = `/api/lesson-plans/documents/${it.id}/download?format=${it.format}`
      await streamDownload(downloadUrl, filename.replace(/\.(pdf|doc)$/i, ''), it.format)
      toast.success(`✓ Downloaded: ${filename}`, { id: tid, duration: 4500 })
      load()
    } catch (e) {
      toast.error(e?.message || 'Download failed', { id: tid })
    } finally { setBusyId(null) }
  }

  const regenerate = async (it) => {
    if (!it.canRegenerate) {
      toast.error('The original content is no longer cached. Open the lesson and generate a fresh copy.')
      return
    }
    setBusyId(it.id)
    const tid = toast.loading(`Regenerating a fresh copy…`)
    try {
      const prep = await api(`/lesson-plans/documents/${it.id}/regenerate`, { method: 'POST' })
      if (!prep?.downloadUrl) throw new Error('Regenerate failed')
      const base = (it.lesson?.title || 'lesson-plan').replace(/[^\w\u0900-\u0D7F\- ]+/g, '').slice(0, 60).trim() || 'lesson-plan'
      const newFilename = `${base}-${prep.documentId}`
      toast.loading(`✨ Rendering "${newFilename}.${it.format === 'pdf' ? 'pdf' : 'doc'}"…`, { id: tid })
      await streamDownload(prep.downloadUrl, newFilename, it.format)
      toast.success(`✓ Fresh copy downloaded: ${newFilename}.${it.format === 'pdf' ? 'pdf' : 'doc'}\nNew Doc ID: ${prep.documentId}`, { id: tid, duration: 5500 })
      load()
    } catch (e) {
      toast.error(e?.message || 'Regenerate failed', { id: tid })
    } finally { setBusyId(null) }
  }

  const copyDocId = (id) => {
    try {
      navigator.clipboard.writeText(id)
      toast.success(`Doc ID copied: ${id}`)
    } catch (_) {
      toast.error('Copy failed — long-press the ID text instead.')
    }
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 text-white px-4 pt-4 pb-6">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center hover:bg-white/25 transition">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-90">Secure Documents</div>
            <div className="text-lg font-black leading-tight">My Downloads</div>
            <div className="text-[11px] opacity-90 mt-0.5">Every Lesson Plan PDF & Word you generated. Re-download or regenerate a fresh copy anytime (within 7 days).</div>
          </div>
        </div>
        {/* Mini stats */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <div className="bg-white/15 backdrop-blur rounded-xl p-2 text-center">
            <div className="text-[9px] font-bold opacity-90 uppercase tracking-wider">Active</div>
            <div className="text-lg font-black leading-none mt-1">{stats.active}</div>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-xl p-2 text-center">
            <div className="text-[9px] font-bold opacity-90 uppercase tracking-wider">Used</div>
            <div className="text-lg font-black leading-none mt-1">{stats.used}</div>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-xl p-2 text-center">
            <div className="text-[9px] font-bold opacity-90 uppercase tracking-wider">Revoked</div>
            <div className="text-lg font-black leading-none mt-1">{stats.revoked}</div>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-xl p-2 text-center">
            <div className="text-[9px] font-bold opacity-90 uppercase tracking-wider">Downloads</div>
            <div className="text-lg font-black leading-none mt-1">{stats.totalDownloads}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 mt-3 flex items-center gap-2 flex-wrap">
        <select value={formatFilter} onChange={e => setFormatFilter(e.target.value)} className="h-8 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-background text-[11px] px-2 font-semibold">
          <option value="">All formats</option>
          <option value="pdf">PDF only</option>
          <option value="docx">Word only</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-background text-[11px] px-2 font-semibold">
          <option value="">All status</option>
          <option value="active">Active only</option>
          <option value="used">Used only</option>
          <option value="revoked">Revoked only</option>
        </select>
        <Button size="sm" variant="ghost" onClick={load} className="h-8 rounded-full ml-auto">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* List */}
      <div className="px-4 mt-3 space-y-2">
        {loading && (
          <Card className="p-6 rounded-2xl text-center text-muted-foreground">
            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin" />
            Loading your downloads…
          </Card>
        )}
        {!loading && items.length === 0 && (
          <Card className="p-6 rounded-2xl text-center">
            <div className="text-4xl mb-2">📥</div>
            <div className="font-black text-slate-900 dark:text-slate-100">No downloads yet</div>
            <div className="text-[11px] text-muted-foreground mt-1">Every PDF or Word you download from a Lesson Plan will appear here with a re-download shortcut.</div>
          </Card>
        )}
        {!loading && items.map(it => {
          const sb = statusBadge(it.downloadStatus)
          const isBusy = busyId === it.id
          const expDate = it.expiresAt ? new Date(it.expiresAt) : null
          const isExpired = expDate && expDate.getTime() < Date.now()
          const filename = filenameFor(it)
          return (
            <Card key={it.id} className="p-3 rounded-2xl border-2 border-slate-100 dark:border-slate-800">
              <div className="flex items-start gap-2">
                <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-white shadow ${it.format === 'pdf' ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                  {it.format === 'pdf' ? <FileText className="w-5 h-5" /> : <FileType2 className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-black text-[13px] text-slate-900 dark:text-slate-100 line-clamp-2 flex-1 min-w-0">
                      {it.lesson?.title || 'Lesson Plan'}
                    </div>
                    <Badge className={`text-[9px] font-black uppercase tracking-widest ${sb.className} border-0`}>{sb.label}</Badge>
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">
                    {[it.lesson?.className, it.lesson?.bookName, it.lesson?.period ? `Period ${it.lesson.period}` : null].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {/* Meta row */}
                  <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                    <div className="flex items-center gap-1 text-slate-500">
                      <Clock className="w-3 h-3" /> {formatDateShort(it.createdAt)}
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                      <Download className="w-3 h-3" /> {it.downloadCount || 0} download{(it.downloadCount || 0) === 1 ? '' : 's'}
                    </div>
                    {expDate && (
                      <div className={`flex items-center gap-1 col-span-2 ${isExpired ? 'text-red-600' : 'text-slate-500'}`}>
                        <AlertTriangle className="w-3 h-3" />
                        {isExpired ? 'Expired' : 'Expires'}: {formatDateShort(expDate)}
                      </div>
                    )}
                  </div>
                  {/* Doc ID row */}
                  <button
                    onClick={() => copyDocId(it.id)}
                    className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[9.5px] font-mono font-bold text-slate-700 dark:text-slate-300 transition"
                    title="Tap to copy Document ID"
                  >
                    <Copy className="w-2.5 h-2.5" />
                    {it.id}
                  </button>
                  {/* Filename preview */}
                  <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 truncate" title={filename}>
                    <span className="font-semibold">File:</span>{' '}
                    <span className="font-mono">{filename}</span>
                  </div>
                  {/* Actions */}
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    {it.canRedownload ? (
                      <Button
                        size="sm"
                        onClick={() => reDownload(it)}
                        disabled={isBusy}
                        className="h-7 rounded-full text-[10.5px] font-black bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        {isBusy ? 'Working…' : 'Re-download'}
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[9.5px] text-slate-400 px-2 py-1 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                        {it.downloadStatus === 'revoked' ? <Ban className="w-3 h-3" /> : it.downloadStatus === 'used' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {it.downloadStatus === 'revoked' ? 'Revoked by admin' : it.downloadStatus === 'used' ? 'Already downloaded' : 'No longer active'}
                      </span>
                    )}
                    {it.canRegenerate && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => regenerate(it)}
                        disabled={isBusy}
                        className="h-7 rounded-full text-[10.5px] font-black border-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        {isBusy ? '…' : 'New copy'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
        {items.length > 0 && (
          <div className="text-[10px] text-slate-400 text-center pt-2">
            Showing {items.length} of {total} · Downloads are kept for 7 days
          </div>
        )}
      </div>
    </div>
  )
}

export default MyDownloads
