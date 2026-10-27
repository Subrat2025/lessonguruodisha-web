'use client'
// ============================================================================
//  OfficialPapersList — Browse SCERT/OSEPA official assessment papers.
//  Free tier can preview; paid subscribers can download the PDF.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Printer, Eye, Lock, Loader2, RefreshCw,
  ClipboardCheck, Filter, X, Search, Download,
} from 'lucide-react'

const apiCall = async (path, options = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const r = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body && typeof options.body === 'object' && !(options.body instanceof FormData) ? JSON.stringify(options.body) : options.body,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) { const err = new Error(d.error || 'Error'); err.status = r.status; err.code = d.code; throw err }
  return d
}

const EXAM_TYPES = [
  { key: 'fa1', label: 'FA1', color: 'from-blue-500 to-indigo-600' },
  { key: 'fa2', label: 'FA2', color: 'from-purple-500 to-fuchsia-600' },
  { key: 'sa1', label: 'SA1', color: 'from-emerald-500 to-teal-600' },
  { key: 'sa2', label: 'SA2', color: 'from-amber-500 to-orange-600' },
  { key: 'practice', label: 'Practice', color: 'from-sky-500 to-cyan-600' },
  { key: 'model', label: 'Model', color: 'from-pink-500 to-rose-600' },
  { key: 'board', label: 'Board', color: 'from-red-500 to-rose-600' },
]

const findExamMeta = (k) => EXAM_TYPES.find(e => e.key === k) || { label: (k || '').toUpperCase(), color: 'from-slate-500 to-slate-700' }

export default function OfficialPapersList({ user }) {
  const [items, setItems] = useState([])
  const [facets, setFacets] = useState({ classes: [], books: [], years: [], examTypes: [] })
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ className: '', bookName: '', year: '', examType: '' })
  const [downloading, setDownloading] = useState(null)
  const [previewing, setPreviewing] = useState(null)
  // Modal state for the "Print / Download with School Name" flow.  BOTH the
  // Print and Download buttons now open the same school-name modal so the
  // PDF is watermarked with the school name on every page, whether the
  // teacher chooses to view+print in a new tab OR save to device.
  //   { paper, intent: 'print' | 'download' }
  const [nameFor, setNameFor] = useState(null)
  const [schoolName, setSchoolName] = useState(() => {
    try { return typeof window !== 'undefined' ? (localStorage.getItem('em_downloadSchoolName') || '') : '' }
    catch (_) { return '' }
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Cache-bust so a stale browser/CDN copy can never hide freshly-uploaded papers.
      const r = await apiCall(`/official-papers?_t=${Date.now()}`, { cache: 'no-store' })
      setItems(r.items || [])
      setFacets(r.facets || { classes: [], books: [], years: [], examTypes: [] })
    } catch (e) { toast.error(e.message || 'Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Filter client-side by display name. Prod has duplicate book records that
  // share the SAME subject name (e.g. two "ଜିଜ୍ଞାସା (ବିଜ୍ଞାନ)" bookIds) — matching
  // by NAME intentionally merges them so users see ALL sets under one subject.
  const filtered = useMemo(() => {
    return items.filter(p => (
      (!filters.className || p.className === filters.className) &&
      (!filters.bookName  || p.bookName  === filters.bookName) &&
      (!filters.year      || p.year      === filters.year) &&
      (!filters.examType  || p.examType  === filters.examType)
    ))
  }, [items, filters])

  // Subject dropdown: distinct book NAMES for the selected class (deduped, so a
  // subject that exists under multiple bookIds still appears once).
  const availableSubjects = useMemo(() => {
    const src = filters.className ? items.filter(p => p.className === filters.className) : items
    return Array.from(new Set(src.map(p => p.bookName).filter(Boolean))).sort()
  }, [items, filters.className])

  // Group filtered items by exam type → class → book
  const grouped = useMemo(() => {
    const g = {}
    for (const p of filtered) {
      const bucket = g[p.examType] ||= {}
      const cbucket = bucket[p.className] ||= {}
      const bkey = p.bookName
      cbucket[bkey] ||= []
      cbucket[bkey].push(p)
    }
    // Sort sets alphabetically within each bucket
    for (const et of Object.values(g))
      for (const cb of Object.values(et))
        for (const arr of Object.values(cb))
          arr.sort((a, b) => (a.setLetter || '').localeCompare(b.setLetter || ''))
    return g
  }, [filtered])

  // Unified "print or download with watermark" flow.  Both entry points call
  //   POST /api/official-papers/:id/download   with { schoolName }
  // which fetches the source PDF, stamps a diagonal watermark on every
  // page via pdf-lib, and returns the modified PDF as a blob.
  //   intent === 'print'    → opens the blob in a new tab so the browser's
  //                           built-in PDF viewer can print it.
  //   intent === 'download' → triggers a Save-As download.
  const runWatermarkedPaper = async (paper, name, intent) => {
    if (!name || !name.trim()) return toast.error('Please enter your school name.')
    const cleanName = name.trim()
    try {
      setDownloading(paper.id)
      try { localStorage.setItem('em_downloadSchoolName', cleanName) } catch (_) { /* non-blocking */ }
      const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
      const res = await fetch(`/api/official-papers/${paper.id}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ schoolName: cleanName }),
      })
      if (!res.ok) {
        if (res.status === 402) { toast.error(`🔒 Premium subscription required to ${intent === 'print' ? 'print' : 'download'}.`); return }
        const err = await res.json().catch(() => ({}))
        toast.error(err?.error || `${intent === 'print' ? 'Print' : 'Download'} failed (${res.status})`); return
      }
      const blob = await res.blob()
      // Safety guard — a mostly-empty blob usually means the server errored
      // out silently, or the network dropped mid-stream. Show a real message
      // instead of "downloading" 0 bytes that never surface on the phone.
      if (!blob || blob.size < 1000) {
        toast.error('PDF looks empty — please retry. If it keeps happening, contact support.')
        return
      }
      const url = URL.createObjectURL(blob)
      const filename = (paper.title || 'paper').replace(/[^\w.\- ]+/g, '_') + '.pdf'
      const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')

      if (intent === 'print') {
        // Open the watermarked PDF in a new tab so the browser's built-in
        // PDF viewer takes over — the teacher can hit its Print button.
        const w = window.open(url, '_blank', 'noopener,noreferrer')
        if (!w) toast.error('Pop-up blocked — please allow pop-ups to print.')
        else toast.success('🖨️ Watermarked print view opened — press Ctrl/Cmd + P to print.')
      } else if (isMobile) {
        // ---- MOBILE DOWNLOAD (Android Chrome / iOS Safari) ----
        // <a download> is unreliable on mobile:
        //  • iOS Safari mostly ignores the `download` attribute on blob URLs
        //    and does NOT route them through the Files app.
        //  • Android Chrome sometimes drops the user-gesture chain after a
        //    long-running fetch, so the download silently fails and never
        //    shows up in the notification tray / Files.
        // Strategy:
        //  1. Try Web Share API with files — iOS 15+ / modern Android both
        //     surface a native share sheet with "Save to Files" / "Save to
        //     Downloads" options that DO show a system notification.
        //  2. Fall back to window.open(blobUrl) so the OS PDF viewer opens
        //     the file — the viewer's own share/save action lands the PDF
        //     in the Files/Downloads app.
        //  3. Only if both are unavailable do we fall through to the classic
        //     anchor click (kept as last-resort, mostly for old Android WebViews).
        let handled = false
        try {
          const file = new File([blob], filename, { type: 'application/pdf' })
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: filename, text: filename })
            toast.success('✅ Choose "Save to Files" (iPhone) or "Downloads" (Android) from the menu.')
            handled = true
          }
        } catch (shareErr) {
          // AbortError = user cancelled → don't fall through, treat as done.
          if (shareErr && shareErr.name === 'AbortError') { handled = true }
          else { console.warn('[download] Web Share fallback:', shareErr && shareErr.message) }
        }
        if (!handled) {
          const w = window.open(url, '_blank', 'noopener,noreferrer')
          if (w) {
            toast.success('📄 PDF opened in viewer — tap the ⤓ / Share icon → "Save to Files" or "Downloads".', { duration: 6500 })
            handled = true
          }
        }
        if (!handled) {
          // Last-resort classic anchor click.
          const a = document.createElement('a')
          a.href = url; a.download = filename; a.rel = 'noopener'
          document.body.appendChild(a); a.click(); a.remove()
          toast.success(`✅ Downloaded "${filename}". Check your Downloads folder.`)
        }
      } else {
        // ---- DESKTOP DOWNLOAD ---- <a download> works reliably here.
        const a = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click(); a.remove()
        toast.success(`✅ Downloaded "${filename}" with your school watermark.`)
      }
      // Keep blob alive for print viewer / download completion, then release.
      setTimeout(() => URL.revokeObjectURL(url), 90000)
      setNameFor(null)
    } catch (e) { toast.error(e.message || 'Request failed') }
    finally { setDownloading(null) }
  }

  const anyFilterActive = !!(filters.className || filters.bookName || filters.year || filters.examType)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 border border-blue-200 p-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">📋 Instant Assessment Papers</div>
            <div className="text-sm font-black text-slate-900 leading-tight">
              {items.length > 0 ? `${items.length} Instant Assessment paper${items.length !== 1 ? 's' : ''} available` : 'Instant Assessment Papers'}
            </div>
          </div>
          <button onClick={load} disabled={loading} className="text-xs font-bold text-blue-700 bg-white rounded-full border border-blue-200 px-3 py-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 inline -mt-0.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <div className="mt-2 text-[10.5px] text-slate-600 leading-snug">
          Ready-made assessment papers curated by admins. Preview free · Download requires Premium.
        </div>
      </div>

      {/* Filters — Class + Subject dropdowns are the primary filters */}
      <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1"><Filter className="w-3 h-3" /> Class</label>
            <select value={filters.className} onChange={e => setFilters(f => ({ ...f, className: e.target.value, bookName: '' }))}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-2 text-sm font-bold bg-white">
              <option value="">All Classes</option>
              {facets.classes.slice().sort().map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1"><FileText className="w-3 h-3" /> Subject</label>
            <select value={filters.bookName} onChange={e => setFilters(f => ({ ...f, bookName: e.target.value }))}
              disabled={availableSubjects.length === 0}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-2 text-sm font-bold bg-white disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">{filters.className ? `All Subjects for ${filters.className}` : 'All Subjects'}</option>
              {availableSubjects.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <div className="text-[10px] uppercase font-black text-slate-500 flex-shrink-0">Exam</div>
          {EXAM_TYPES.filter(e => facets.examTypes.includes(e.key)).map(e => (
            <button key={e.key}
              onClick={() => setFilters(f => ({ ...f, examType: f.examType === e.key ? '' : e.key }))}
              className={`px-2.5 py-1 rounded-full text-[11px] font-black whitespace-nowrap uppercase transition-transform active:scale-95 ${filters.examType === e.key ? `bg-gradient-to-r ${e.color} text-white shadow` : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              {e.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <div className="text-[10px] uppercase font-black text-slate-500 flex-shrink-0">Year</div>
          {facets.years.slice().sort().reverse().map(y => (
            <button key={y}
              onClick={() => setFilters(f => ({ ...f, year: f.year === y ? '' : y }))}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${filters.year === y ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
              {y}
            </button>
          ))}
        </div>
        {anyFilterActive && (
          <button onClick={() => setFilters({ className: '', bookName: '', year: '', examType: '' })}
            className="text-[10.5px] font-bold text-red-600 hover:text-red-700 flex items-center gap-0.5">
            <X className="w-3 h-3" /> Clear all filters
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
          <div className="text-xs text-slate-500 mt-2">Loading official papers…</div>
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
            <FileText className="w-5 h-5 text-slate-400" />
          </div>
          <div className="text-sm font-bold text-slate-700">
            {anyFilterActive ? 'No papers match your filters' : 'No official papers uploaded yet'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {anyFilterActive ? 'Try clearing filters' : 'Check back soon — new papers are added regularly.'}
          </div>
        </div>
      )}

      {/* Grouped grid */}
      {!loading && Object.keys(grouped).map(examType => {
        const meta = findExamMeta(examType)
        return (
          <div key={examType} className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className={`px-3 py-2 bg-gradient-to-r ${meta.color} text-white flex items-center gap-2`}>
              <ClipboardCheck className="w-4 h-4" />
              <div className="text-sm font-black uppercase tracking-wider">{meta.label}</div>
              <div className="text-[10px] font-bold opacity-80 ml-auto">
                {Object.values(grouped[examType]).reduce((s, cb) => s + Object.values(cb).reduce((n, arr) => n + arr.length, 0), 0)} paper(s)
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {Object.entries(grouped[examType]).map(([className, byBook]) => (
                <div key={className} className="p-2.5">
                  <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-2 flex items-center gap-1">
                    <span className="bg-slate-100 rounded-full px-2 py-0.5">{className}</span>
                  </div>
                  {Object.entries(byBook).map(([bookName, papers]) => (
                    <div key={bookName} className="mb-2 last:mb-0">
                      <div className="text-[11px] font-bold text-slate-700 mb-1.5">📖 {bookName}</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {papers.map(p => (
                          <PaperCard key={p.id} paper={p} user={user}
                            downloading={downloading === p.id}
                            onPreview={() => setPreviewing(p)}
                            onPrint={() => setNameFor({ paper: p, intent: 'print' })}
                            onDownload={() => setNameFor({ paper: p, intent: 'download' })}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Preview modal */}
      <AnimatePresence>
        {previewing && (
          <PreviewModal paper={previewing} user={user}
            onClose={() => setPreviewing(null)}
            onPrint={() => { const p = previewing; setPreviewing(null); setNameFor({ paper: p, intent: 'print' }) }}
          />
        )}
      </AnimatePresence>

      {/* School-Name modal — shared by BOTH Print and Download.  The teacher's
          school name becomes a diagonal watermark on every page of the
          resulting PDF (backend stamps via pdf-lib). */}
      <AnimatePresence>
        {nameFor && (
          <DownloadModal
            paper={nameFor.paper}
            intent={nameFor.intent}
            initialName={schoolName}
            downloading={downloading === nameFor.paper.id}
            onClose={() => setNameFor(null)}
            onSubmit={(name) => { setSchoolName(name); runWatermarkedPaper(nameFor.paper, name, nameFor.intent) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Individual paper card
// ---------------------------------------------------------------------------
const PaperCard = ({ paper, user, downloading, onPreview, onPrint, onDownload }) => {
  const isActive = user?.subscription?.status === 'active' && user?.subscription?.expiryDate && new Date(user.subscription.expiryDate).getTime() > Date.now()
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden hover:shadow-md transition-shadow relative">
      {/* Thumbnail */}
      <button onClick={onPreview} className="block w-full aspect-[3/4] bg-white overflow-hidden relative group">
        {paper.thumbnailUrl
          ? <img src={paper.thumbnailUrl} alt="" className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
          : <div className="w-full h-full flex items-center justify-center"><FileText className="w-10 h-10 text-slate-300" /></div>}
        <div className="absolute top-1 right-1 text-[9px] font-black bg-white/95 text-slate-800 rounded-full px-1.5 py-0.5 shadow">
          Set {paper.setLetter}
        </div>
        <div className="absolute bottom-1 left-1 text-[9px] font-bold bg-slate-900/80 text-white rounded-full px-1.5 py-0.5">
          {paper.pages}p
        </div>
      </button>
      {/* Info */}
      <div className="p-2">
        <div className="text-[10.5px] text-slate-500 uppercase font-bold">Year {paper.year}</div>
        <div className="text-[11px] font-black text-slate-900 leading-tight line-clamp-2 min-h-[26px]">
          {paper.title.split('·').pop().trim()}
        </div>
        <div className="mt-1.5 flex gap-1">
          <button onClick={onPreview} className="flex-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10.5px] font-bold px-1.5 py-1 flex items-center justify-center gap-1 hover:border-blue-400 hover:text-blue-700 transition-colors">
            <Eye className="w-3 h-3" /> View
          </button>
          <button onClick={onPrint} disabled={downloading}
            className={`flex-1 rounded-lg text-[10.5px] font-bold px-1.5 py-1 flex items-center justify-center gap-1 transition-transform active:scale-95 ${isActive ? 'bg-emerald-600 text-white hover:brightness-110' : 'bg-amber-500 text-white hover:brightness-110'}`}>
            {isActive ? <><Printer className="w-3 h-3" /> Print</> : <><Lock className="w-3 h-3" /> Print</>}
          </button>
        </div>
        {/* Full-width Download button on its own row so it's always visible,
            even on the narrowest 3-column card layouts. */}
        <button onClick={onDownload} disabled={downloading}
          title={isActive ? 'Download watermarked PDF' : 'Premium required to download'}
          className={`mt-1 w-full rounded-lg text-[10.5px] font-bold px-2 py-1 flex items-center justify-center gap-1 transition-transform active:scale-95 ${isActive ? 'bg-blue-600 text-white hover:brightness-110' : 'bg-amber-500 text-white hover:brightness-110'}`}>
          {downloading ? <><Loader2 className="w-3 h-3 animate-spin" /> Downloading…</> : isActive ? <><Download className="w-3 h-3" /> Download PDF</> : <><Lock className="w-3 h-3" /> Download</>}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview modal — shows page-1 thumbnail large + description
// ---------------------------------------------------------------------------
const PreviewModal = ({ paper, user, onClose, onPrint }) => {
  const isActive = user?.subscription?.status === 'active' && user?.subscription?.expiryDate && new Date(user.subscription.expiryDate).getTime() > Date.now()
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center gap-2 p-3 border-b border-slate-200 sticky top-0 bg-white">
          <div className="text-xs uppercase font-black tracking-widest text-blue-700">📋 Preview</div>
          <button onClick={onClose} className="ml-auto w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        {paper.thumbnailUrl && (
          <img src={paper.thumbnailUrl} alt="" className="w-full max-h-[60vh] object-contain bg-slate-50 border-b border-slate-200" />
        )}
        <div className="p-3">
          <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 flex items-center gap-1">
            {paper.examType.toUpperCase()} · Set {paper.setLetter} · Year {paper.year} · {paper.pages} pages
          </div>
          <div className="text-base font-black text-slate-900 leading-tight mt-1">{paper.title}</div>
          <div className="text-[11px] text-slate-500 mt-1">📖 {paper.className} · {paper.bookName}</div>
          {paper.description && <div className="mt-2 text-[12px] text-slate-700 leading-snug">{paper.description}</div>}
          <div className="mt-3">
            <button onClick={onPrint}
              className={`w-full h-11 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 ${isActive ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-amber-500 to-orange-600'} hover:brightness-110 active:scale-95 transition`}>
              {isActive ? <><Printer className="w-4 h-4" /> Print Paper</> : <><Lock className="w-4 h-4" /> Unlock with Premium</>}
            </button>
            <div className="text-[10px] text-slate-500 mt-1.5 text-center">
              {isActive
                ? 'Print includes LessonGuruOdisha.com branding. Downloads are disabled to protect originality.'
                : 'Premium subscribers can print unlimited official papers.'}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}


// ---------------------------------------------------------------------------
// Download modal — asks the teacher for their school name.  The name becomes
// a diagonal semi-transparent watermark on every page of the downloaded PDF
// (backend stamps this via pdf-lib in POST /official-papers/:id/download).
// ---------------------------------------------------------------------------
const DownloadModal = ({ paper, intent = 'download', initialName, downloading, onClose, onSubmit }) => {
  const [name, setName] = useState(initialName || '')
  const canSubmit = !!name.trim() && !downloading
  const isPrint = intent === 'print'
  const title = isPrint ? 'Print Paper' : 'Download PDF'
  const HeaderIcon = isPrint ? Printer : Download
  const submitLabel = isPrint ? 'Open Print View' : 'Download PDF'
  const submitBusyLabel = isPrint ? 'Preparing print view…' : 'Preparing…'
  const actionColor = isPrint ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
  const accentColor = isPrint ? 'text-emerald-700' : 'text-blue-700'
  const gradient = isPrint ? 'from-emerald-50 to-teal-50' : 'from-blue-50 to-indigo-50'
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-3"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 8 }}
        transition={{ type: 'spring', damping: 24, stiffness: 320 }}
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`p-3 flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r ${gradient}`}>
          <HeaderIcon className={`w-4 h-4 ${accentColor}`} />
          <div className="text-sm font-black text-slate-900">{title}</div>
          <button onClick={onClose} className="ml-auto p-1 rounded-full hover:bg-white/70"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-3 space-y-3">
          <div className="text-[11.5px] text-slate-600 leading-snug">
            Enter your <b>School Name</b>.  It will be stamped as a diagonal
            <span className={`font-bold ${accentColor}`}> watermark</span> on every page
            of the {isPrint ? 'printed' : 'downloaded'} PDF — so shared / photocopied copies stay traceable to your school.
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
            <div className="text-[9.5px] uppercase font-black tracking-widest text-slate-500">Paper</div>
            <div className="text-[11.5px] font-bold text-slate-800 leading-tight">{paper.title}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Year {paper.year} · Set {paper.setLetter} · {paper.pages} pages</div>
          </div>

          <div>
            <label className="text-[9.5px] uppercase font-black tracking-widest text-slate-500">School Name <span className="text-red-600">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 120))}
              placeholder="e.g. Government UP School, Cuttack"
              autoFocus
              maxLength={120}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onSubmit(name.trim()) }}
              className="w-full text-sm font-bold border border-slate-300 rounded-lg px-3 py-2 mt-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
            <div className="text-[10px] text-slate-500 mt-1">{120 - name.length} characters left · will appear on every page.</div>
          </div>
        </div>

        <div className="p-3 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50">
          <button onClick={onClose} disabled={downloading}
            className="text-xs font-black text-slate-700 bg-white border border-slate-300 rounded-full px-3 py-1.5 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={() => onSubmit(name.trim())} disabled={!canSubmit}
            className={`text-xs font-black text-white ${actionColor} rounded-full px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1`}>
            {downloading
              ? <><Loader2 className="w-3 h-3 animate-spin" /> {submitBusyLabel}</>
              : <><HeaderIcon className="w-3.5 h-3.5" /> {submitLabel}</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
