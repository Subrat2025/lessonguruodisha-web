'use client'
// ============================================================================
//  ShortLessonPlansView — subscriber wizard: Class → Subject → Chapter → Period
//  ---------------------------------------------------------------------------
//  Reads /api/short-lesson-plans (metadata) then embeds the full lesson HTML
//  from /api/short-lesson-plans/:id inside a sandboxed iframe.  The iframe is
//  same-origin so Ctrl+P prints, but `sandbox` disables scripts inside the
//  uploaded page (defence-in-depth — the ingestion pipeline already blocks
//  .js/.php/etc. inside ZIP archives, this is the runtime guard).
//
//  UX mirrors the classic "Lesson Plans → Class → Book → Chapter → Period"
//  flow that teachers already know.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronRight, ArrowLeft, Loader2, Sparkles, BookOpen, Calendar,
  Lock, Maximize2, X,
} from 'lucide-react'

const jsonApi = async (url, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const res = await fetch(`/api${url}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

export default function ShortLessonPlansView({ user, onBack }) {
  const isActive = !!user?.subscription?.status && user?.subscription?.status === 'active'
    && user?.subscription?.expiryDate && new Date(user.subscription.expiryDate) > new Date()
  const isAdmin = user?.role === 'admin'
  const hasAccess = isAdmin || isActive

  const [step, setStep] = useState('class') // 'class' | 'subject' | 'chapter' | 'periods' | 'view'
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [chapters, setChapters] = useState([])
  const [selectedChapter, setSelectedChapter] = useState(null)
  const [periods, setPeriods] = useState([])
  const [selectedPeriod, setSelectedPeriod] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lessonHtml, setLessonHtml] = useState('')
  const [fullScreen, setFullScreen] = useState(false)
  const iframeRef = useRef(null)

  // ── Load class list on mount.
  useEffect(() => {
    setLoading(true)
    fetch('/api/short-lesson-plans/facets').then(r => r.json()).then(d => {
      setClasses(d.classes || [])
    }).catch(() => toast.error('Failed to load classes'))
    .finally(() => setLoading(false))
  }, [])

  const pickClass = useCallback(async (className) => {
    setSelectedClass(className); setLoading(true)
    try {
      const d = await fetch(`/api/short-lesson-plans/facets?className=${encodeURIComponent(className)}`).then(r => r.json())
      setSubjects(d.subjects || [])
      setStep('subject')
    } catch (e) { toast.error('Failed to load subjects') } finally { setLoading(false) }
  }, [])

  const pickSubject = useCallback(async (subject) => {
    setSelectedSubject(subject); setLoading(true)
    try {
      const d = await fetch(`/api/short-lesson-plans/facets?className=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(subject)}`).then(r => r.json())
      setChapters(d.chapters || [])
      setStep('chapter')
    } catch (e) { toast.error('Failed to load chapters') } finally { setLoading(false) }
  }, [selectedClass])

  const pickChapter = useCallback(async (chapter) => {
    setSelectedChapter(chapter); setLoading(true)
    try {
      const d = await fetch(`/api/short-lesson-plans?className=${encodeURIComponent(selectedClass)}&subject=${encodeURIComponent(selectedSubject)}&chapter=${encodeURIComponent(chapter)}`).then(r => r.json())
      setPeriods(d.items || [])
      setStep('periods')
    } catch (e) { toast.error('Failed to load lessons') } finally { setLoading(false) }
  }, [selectedClass, selectedSubject])

  const openLesson = useCallback(async (lesson) => {
    if (!hasAccess) {
      toast.error('Premium subscription required to view Short Lesson Plans.')
      return
    }
    setSelectedPeriod(lesson); setLoading(true)
    try {
      const token = localStorage.getItem('em_token')
      const res = await fetch(`/api/short-lesson-plans/${lesson.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        if (res.status === 402) throw new Error('Premium subscription required.')
        if (res.status === 401) throw new Error('Please log in first.')
        throw new Error(`Server returned ${res.status}`)
      }
      const html = await res.text()
      setLessonHtml(html)
      setStep('view')
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [hasAccess])

  // ── Anti-copy protections while a lesson is open.
  useEffect(() => {
    if (step !== 'view') return
    const stop = (e) => { e.preventDefault(); return false }
    const stopKeys = (e) => {
      // Block Ctrl+U (view source), Ctrl+S (save), F12 (devtools), Ctrl+Shift+I/J.
      if (
        (e.ctrlKey && (e.key === 'u' || e.key === 'U' || e.key === 's' || e.key === 'S')) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'J' || e.key === 'j'))
      ) { e.preventDefault(); return false }
    }
    document.addEventListener('contextmenu', stop)
    document.addEventListener('keydown', stopKeys)
    return () => {
      document.removeEventListener('contextmenu', stop)
      document.removeEventListener('keydown', stopKeys)
    }
  }, [step])

  const backOne = () => {
    if (step === 'view') { setLessonHtml(''); setSelectedPeriod(null); setStep('periods'); return }
    if (step === 'periods') { setPeriods([]); setSelectedChapter(null); setStep('chapter'); return }
    if (step === 'chapter') { setChapters([]); setSelectedSubject(null); setStep('subject'); return }
    if (step === 'subject') { setSubjects([]); setSelectedClass(null); setStep('class'); return }
    if (onBack) onBack()
  }

  // ── Header ────────────────────────────────────────────────────────────
  const Header = () => (
    <div className="sticky top-0 z-20 bg-gradient-to-r from-indigo-600 to-blue-700 text-white px-4 py-3 flex items-center gap-3 shadow">
      <button onClick={backOne} className="p-1.5 -m-1.5 rounded-full hover:bg-white/10" aria-label="Back">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-black opacity-90">
          <Sparkles className="w-3 h-3" /> Short Lesson Plans
          <span className="ml-1 bg-white/25 text-white rounded-full px-1.5 py-0.5 text-[9px]">NEW</span>
          <span className="ml-1 bg-amber-300 text-slate-900 rounded-full px-1.5 py-0.5 text-[9px] font-black">PRO</span>
        </div>
        <div className="text-sm font-bold truncate">
          {step === 'class' && 'Choose your class'}
          {step === 'subject' && selectedClass}
          {step === 'chapter' && `${selectedClass} · ${selectedSubject}`}
          {step === 'periods' && selectedChapter}
          {step === 'view' && selectedPeriod?.title}
        </div>
      </div>
      {step === 'view' && (
        <>
          <button onClick={() => setFullScreen(f => !f)} className="p-1.5 rounded-full hover:bg-white/10" title="Fullscreen">
            {fullScreen ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </>
      )}
    </div>
  )

  // ── Screens ─────────────────────────────────────────────────────────────
  if (fullScreen && step === 'view') {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <Header />
        <div className="flex-1 relative">
          <iframe
            ref={iframeRef}
            title="lesson"
            sandbox="allow-same-origin allow-modals allow-forms"
            className="w-full h-full border-0"
            srcDoc={lessonHtml}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8" onCopy={step === 'view' ? (e) => e.preventDefault() : undefined}>
      <Header />

      {loading && (
        <div className="flex items-center justify-center py-8 text-slate-500 text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {/* Paywall banner if not subscribed */}
      {!hasAccess && step !== 'view' && (
        <div className="mx-4 mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <Lock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-amber-900">
            <div className="font-black">Premium content</div>
            <div>Subscribe to open the ready-made daily lesson plans. Browsing the list is free — opening a lesson requires an active plan.</div>
          </div>
        </div>
      )}

      {/* Step 1 — Class picker */}
      {step === 'class' && !loading && (
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Select Class</div>
          {classes.length === 0 && <p className="text-sm text-slate-500">No lessons published yet. Please check back soon.</p>}
          <div className="grid grid-cols-2 gap-3">
            {classes.map(c => (
              <button key={c} onClick={() => pickClass(c)} className="h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white p-4 text-left shadow relative overflow-hidden active:scale-95 transition">
                <div className="text-3xl">🎓</div>
                <div className="font-bold text-sm absolute bottom-3 left-4 pr-8">{c}</div>
                <ChevronRight className="w-4 h-4 absolute right-3 bottom-3 opacity-70" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Subject picker */}
      {step === 'subject' && !loading && (
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Select Subject</div>
          {subjects.length === 0 && <p className="text-sm text-slate-500">No subjects for {selectedClass}.</p>}
          <div className="grid grid-cols-1 gap-2">
            {subjects.map(s => (
              <button key={s} onClick={() => pickSubject(s)} className="rounded-xl bg-white border border-slate-200 p-3 flex items-center gap-3 active:bg-slate-50 text-left">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center text-lg">📖</div>
                <div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{s}</div></div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Chapter picker */}
      {step === 'chapter' && !loading && (
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Select Chapter</div>
          {chapters.length === 0 && <p className="text-sm text-slate-500">No chapters found.</p>}
          <div className="grid grid-cols-1 gap-2">
            {chapters.map(c => (
              <button key={c.chapter} onClick={() => pickChapter(c.chapter)} className="rounded-xl bg-white border border-slate-200 p-3 flex items-center gap-3 active:bg-slate-50 text-left">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center text-[10px] font-black">
                  {String(c.order + 1).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{c.chapter}</div></div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 4 — Period picker */}
      {step === 'periods' && !loading && (
        <div className="p-4">
          <div className="text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2">Periods · {periods.length}</div>
          {periods.length === 0 && <p className="text-sm text-slate-500">No periods for this chapter.</p>}
          <div className="grid grid-cols-1 gap-2">
            {periods.map(p => (
              <button key={p.id} onClick={() => openLesson(p)} className="rounded-xl bg-white border border-slate-200 p-3 flex items-start gap-3 active:bg-slate-50 text-left">
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-700 text-white flex flex-col items-center justify-center flex-shrink-0">
                  <div className="text-[8px] font-bold opacity-80">DAY</div>
                  <div className="text-sm font-black leading-none">{p.day}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[13px] leading-tight line-clamp-2">{p.title || `Period ${p.period}`}</div>
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>P{p.period}</span>
                    {p.loCode && <span className="bg-blue-50 text-blue-700 rounded px-1 py-0.5 font-black">{p.loCode}</span>}
                    {p.dakhyataCode && <span className="bg-purple-50 text-purple-700 rounded px-1 py-0.5 font-black">{p.dakhyataCode}</span>}
                    {p.cgCode && <span className="bg-emerald-50 text-emerald-700 rounded px-1 py-0.5 font-black">{p.cgCode}</span>}
                  </div>
                </div>
                {hasAccess ? (
                  <ChevronRight className="w-4 h-4 text-slate-400 mt-2" />
                ) : (
                  <Lock className="w-4 h-4 text-amber-600 mt-2" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 5 — View lesson (inline iframe) */}
      {step === 'view' && !loading && (
        <div className="p-2 sm:p-4">
          <div className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm relative">
            <iframe
              ref={iframeRef}
              title="lesson"
              sandbox="allow-same-origin allow-modals allow-forms"
              className="w-full border-0"
              style={{ height: 'calc(100vh - 160px)', minHeight: 520 }}
              srcDoc={lessonHtml}
            />
          </div>
        </div>
      )}
    </div>
  )
}
