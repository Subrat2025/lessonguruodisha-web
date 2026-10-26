'use client'
// ============================================================================
//  Professional Assessment Builder — Frontend Component
//  ---------------------------------------------------------------------------
//  Hybrid mobile-first UI with collapsible sections:
//     1. Class · Subject · Chapter picker
//     2. Assessment Type (FA1/FA2/SA1/SA2/Practice/Unit/Revision)
//     3. Total Marks (25 / 50 / 80 / 100 / Custom)
//     4. Question Types — Written (multi-select) + Teacher-Conducted (multi-select)
//     5. Difficulty distribution (E/M/H percent sliders)
//     6. Extras (Answer Key, Blueprint, Observation, Rubrics)
//     7. Live Marks Distribution preview
//     8. Generate → progress → Preview + PDF actions
//
//  Posts to POST /api/assessments/build and polls GET /api/assessments/:id
//  until status === 'ready'.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronRight, Sparkles, ShieldCheck, Zap, Loader2, Check,
  X, Wand2, Download, FileText, ClipboardList, Target, ArrowLeft, ArrowRight,
  Eye, RefreshCw, BookOpen, GraduationCap, Languages,
  Users, Flag, Copy, TrendingUp, Star, Lock, Search, ClipboardCheck,
} from 'lucide-react'
import OfficialPapersList from '@/components/OfficialPapersList'
import FASAPaperGenerator from '@/components/FASAPaperGenerator'

// Local API helper (mirrors page.js api() so this component can stand alone)
const apiCall = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // 💎 Global AI Credit exhaustion — hand off to the Buy Credits modal.
    if (res.status === 402 && data?.code === 'INSUFFICIENT_AI_CREDITS' && typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('ai-credits:insufficient', {
          detail: {
            availableCredits: data.availableCredits ?? 0,
            requiredCredits: data.requiredCredits ?? 0,
            zone: data.zone || null,
            type: data.type || null,
          },
        }))
      } catch { /* non-blocking */ }
    }
    const err = new Error(data.error || 'Error'); err.status = res.status; err.data = data; throw err
  }
  return data
}

// -------------------------------------------------------------------
// Registries mirrored from /app/lib/prompts/question-types.js
// (kept small; label-only for the picker UI)
// -------------------------------------------------------------------
const WRITTEN_TYPES = [
  { key: 'mcq',        label: 'Multiple Choice (MCQ)',    labelOdia: 'ବହୁ ବିକଳ୍ପୀୟ',        defaultMarks: 1 },
  { key: 'fill',       label: 'Fill in the Blanks',       labelOdia: 'ଶୂନ୍ୟସ୍ଥାନ ପୂରଣ',    defaultMarks: 1 },
  { key: 'match',      label: 'Match the Following',      labelOdia: 'ମେଳ କର',              defaultMarks: 1 },
  { key: 'truefalse',  label: 'True / False',             labelOdia: 'ସତ୍ୟ ଓ ମିଥ୍ୟା',       defaultMarks: 1 },
  { key: 'oneword',    label: 'One-word Answer',          labelOdia: 'ଏକ ଶବ୍ଦରେ',          defaultMarks: 1 },
  { key: 'vsa',        label: 'Very Short Answer',        labelOdia: 'ଅତି ସଂକ୍ଷିପ୍ତ',       defaultMarks: 2 },
  { key: 'sa',         label: 'Short Answer',             labelOdia: 'ସଂକ୍ଷିପ୍ତ',           defaultMarks: 3 },
  { key: 'la',         label: 'Long Answer',              labelOdia: 'ଦୀର୍ଘ ଉତ୍ତର',        defaultMarks: 5 },
  { key: 'competency', label: 'Competency Based',         labelOdia: 'ଦକ୍ଷତା ଆଧାରିତ',      defaultMarks: 4 },
  { key: 'hots',       label: 'HOTS · Higher Order',      labelOdia: 'ଉଚ୍ଚତର ଚିନ୍ତନ',      defaultMarks: 5 },
  { key: 'casestudy',  label: 'Case Study',               labelOdia: 'ପ୍ରସଙ୍ଗ ଅଧ୍ୟୟନ',    defaultMarks: 5 },
  { key: 'picture',    label: 'Picture Based',            labelOdia: 'ଚିତ୍ର ଆଧାରିତ',       defaultMarks: 3 },
  { key: 'diagram',    label: 'Diagram Based',            labelOdia: 'ଚିତ୍ର ଅଙ୍କନ',         defaultMarks: 3 },
  { key: 'activity',   label: 'Activity Based',           labelOdia: 'କାର୍ଯ୍ୟକଳାପ',         defaultMarks: 5 },
  { key: 'project',    label: 'Project Based',            labelOdia: 'ପ୍ରକଳ୍ପ ଭିତ୍ତିକ',    defaultMarks: 5 },
]
const TEACHER_TYPES = [
  { key: 'oral',        label: 'Oral Assessment',       labelOdia: 'ମୌଖିକ ମୂଲ୍ୟାୟନ' },
  { key: 'practical',   label: 'Practical Assessment',  labelOdia: 'ପ୍ରାୟୋଗିକ' },
]
// Observation & Rubrics are toggled via the "Extras" section
const ASSESSMENT_TYPES = [
  { key: 'fa1', label: 'FA1' }, { key: 'fa2', label: 'FA2' },
  { key: 'fa3', label: 'FA3' }, { key: 'fa4', label: 'FA4' },
  { key: 'sa1', label: 'SA1' }, { key: 'sa2', label: 'SA2' },
  { key: 'practice', label: 'Practice' }, { key: 'unit', label: 'Unit' }, { key: 'revision', label: 'Revision' },
]
const MARKS_PRESETS = [25, 50, 80, 100]

// -------------------------------------------------------------------
// Deterministic marks distribution preview (mirror of backend algorithm)
// -------------------------------------------------------------------
function previewDistribution(totalMarks, selectedKeys) {
  const types = selectedKeys.map(k => WRITTEN_TYPES.find(t => t.key === k)).filter(Boolean)
  if (types.length === 0 || !Number.isFinite(totalMarks)) return []
  const sections = types.map(t => ({
    key: t.key, label: t.label, labelOdia: t.labelOdia,
    marksPerQ: t.defaultMarks, count: 1, marks: t.defaultMarks,
  }))
  const target = totalMarks / sections.length
  for (const s of sections) {
    const add = Math.max(0, Math.round((target - s.marks) / s.marksPerQ))
    s.count += add; s.marks = s.count * s.marksPerQ
  }
  let allocated = sections.reduce((a, b) => a + b.marks, 0)
  let remaining = totalMarks - allocated
  let guard = 0
  while (remaining !== 0 && guard++ < 200) {
    const asc = [...sections].sort((a, b) => a.marksPerQ - b.marksPerQ)
    if (remaining > 0) {
      const tgt = asc.find(s => s.marksPerQ <= remaining) || asc[0]
      tgt.count += 1; tgt.marks += tgt.marksPerQ; remaining -= tgt.marksPerQ
    } else {
      const shrinkable = asc.find(s => s.count > 1)
      if (!shrinkable) break
      shrinkable.count -= 1; shrinkable.marks -= shrinkable.marksPerQ; remaining += shrinkable.marksPerQ
    }
  }
  return sections
}

// -------------------------------------------------------------------
// Collapsible section shell
// -------------------------------------------------------------------
const Panel = ({ title, subtitle, icon: Icon, done, open, onToggle, children, defaultOpen = false }) => {
  const isOpen = open ?? defaultOpen
  return (
    <div className={`rounded-2xl border ${done ? 'border-green-300 bg-green-50/40' : 'border-slate-200 bg-white'} overflow-hidden`}>
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${done ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
          {done ? <Check className="w-4 h-4" /> : Icon ? <Icon className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-900 text-sm sm:text-[15px]">{title}</div>
          {subtitle && <div className="text-[11.5px] text-slate-500 truncate">{subtitle}</div>}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  )
}

const Chip = ({ selected, onClick, children, small = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 ${small ? 'py-1 text-[11.5px]' : 'py-1.5 text-xs sm:text-[13px]'} font-semibold transition-all ${
      selected ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
    }`}
  >
    {selected && <Check className="w-3.5 h-3.5" />} {children}
  </button>
)

const Toggle = ({ value, onChange, label, description }) => (
  <label className="flex items-start gap-3 py-2 cursor-pointer">
    <span className={`mt-0.5 relative inline-flex w-10 h-5 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      <input type="checkbox" className="sr-only" checked={!!value} onChange={e => onChange(e.target.checked)} />
    </span>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold text-slate-900">{label}</div>
      {description && <div className="text-[11.5px] text-slate-500 leading-snug">{description}</div>}
    </div>
  </label>
)

// -------------------------------------------------------------------
// Main component
// -------------------------------------------------------------------
export default function AssessmentBuilder({ go, user }) {
  // Panel expand/collapse map
  const [openPanel, setOpenPanel] = useState('lesson')

  // Selection state
  const [classes, setClasses] = useState([])
  const [books, setBooks] = useState([])
  const [chapters, setChapters] = useState([])
  const [selClass, setSelClass] = useState(null)
  const [selBook, setSelBook] = useState(null)
  const [selChapters, setSelChapters] = useState([])

  // Config state
  const [assessmentType, setAssessmentType] = useState('fa1')
  const [totalMarks, setTotalMarks] = useState(25)
  const [customMarks, setCustomMarks] = useState('')
  const [selectedWritten, setSelectedWritten] = useState(['mcq', 'fill', 'vsa', 'la'])
  const [selectedTeacher, setSelectedTeacher] = useState([])
  const [difficulty, setDifficulty] = useState({ easy: 40, medium: 40, hard: 20 })
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true)
  const [includeBlueprint, setIncludeBlueprint] = useState(true)
  const [includeObservation, setIncludeObservation] = useState(false)
  const [includeRubrics, setIncludeRubrics] = useState(false)
  // 🌐 OUTPUT LANGUAGE — highest priority.  User picks explicitly; when
  //    set to 'auto', the backend detects language from the selected
  //    subject (English subject → English paper, Hindi → Hindi, etc.).
  //    Explicit picks bypass all context inference and set
  //    strictLanguageLock:true in the payload.
  const [outputLanguage, setOutputLanguage] = useState('auto')

  // Generation state
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [current, setCurrent] = useState(null)
  const [library, setLibrary] = useState([])
  const [community, setCommunity] = useState({ items: [], total: 0, loading: false, error: null })
  const [communityFilters, setCommunityFilters] = useState({ classId: '', bookId: '', type: '', sort: 'recent' })
  // 💎 AI Credit cost lookup — pulled from centralized /api/ai-credits/costs.
  const [aiCosts, setAiCosts] = useState([])
  useEffect(() => {
    apiCall('/ai-credits/costs').then(r => setAiCosts(r.costs || [])).catch(() => {})
  }, [])
  const aiCreditsRequired = useMemo(() => {
    const t = String(assessmentType || '').toLowerCase()
    let costType
    if (/^fa\d?$/.test(t))       costType = 'fa_assessment'
    else if (/^sa\d?$/.test(t))  costType = 'sa_assessment'
    else                         costType = 'assessment_paper'
    const row = (aiCosts || []).find(c => c.zone === 'assessment' && c.type === costType && c.active)
    return row ? Math.max(1, Number(row.credits) || 0) : null
  }, [aiCosts, assessmentType])
  // Read tab hint set by dashboard tile (e.g. "official" or "community") — one-shot.
  const initialTab = typeof window !== 'undefined' ? (localStorage.getItem('assessBuilderTab') || 'new') : 'new'
  if (typeof window !== 'undefined') { try { localStorage.removeItem('assessBuilderTab') } catch (_e) { /* ignore */ } }
  const [tab, setTab] = useState(initialTab)
  const pollRef = useRef(null)

  const effectiveMarks = useMemo(() => {
    if (totalMarks === 'custom') return Math.max(5, Math.min(200, Number(customMarks) || 25))
    return Number(totalMarks) || 25
  }, [totalMarks, customMarks])

  const distribution = useMemo(() => previewDistribution(effectiveMarks, selectedWritten), [effectiveMarks, selectedWritten])
  const distributionTotal = useMemo(() => distribution.reduce((s, x) => s + x.marks, 0), [distribution])

  // ---------- Data loading ----------
  useEffect(() => {
    apiCall('/classes').then(r => setClasses(r.classes || [])).catch(() => {})
  }, [])
  useEffect(() => {
    if (!selClass) { setBooks([]); setSelBook(null); return }
    apiCall(`/books?classId=${encodeURIComponent(selClass.id)}`).then(r => setBooks(r.books || [])).catch(() => setBooks([]))
  }, [selClass])
  useEffect(() => {
    if (!selClass || !selBook) { setChapters([]); setSelChapters([]); return }
    apiCall(`/chapters?classId=${encodeURIComponent(selClass.id)}&bookId=${encodeURIComponent(selBook.id)}`)
      .then(r => setChapters(r.chapters || []))
      .catch(() => setChapters([]))
  }, [selClass, selBook])

  // ---------- Library ----------
  const loadLibrary = useCallback(async () => {
    try { const r = await apiCall('/assessments'); setLibrary(r.items || []) } catch { /* ignore */ }
  }, [])
  useEffect(() => { if (tab === 'library') loadLibrary() }, [tab, loadLibrary])

  // ---------- Community Library ----------
  const loadCommunity = useCallback(async () => {
    setCommunity(c => ({ ...c, loading: true, error: null }))
    try {
      const qs = new URLSearchParams()
      if (communityFilters.classId) qs.set('classId', communityFilters.classId)
      if (communityFilters.bookId) qs.set('bookId', communityFilters.bookId)
      if (communityFilters.type) qs.set('type', communityFilters.type)
      if (communityFilters.sort) qs.set('sort', communityFilters.sort)
      qs.set('limit', '30')
      const r = await apiCall('/assessments/community?' + qs.toString())
      setCommunity({ items: r.items || [], total: r.total || 0, loading: false, error: null })
    } catch (e) {
      const msg = String(e?.message || 'Failed to load community assessments')
      const needsSub = /subscription|premium/i.test(msg)
      setCommunity({ items: [], total: 0, loading: false, error: needsSub ? 'subscription' : msg })
    }
  }, [communityFilters])
  useEffect(() => { if (tab === 'community') loadCommunity() }, [tab, loadCommunity])

  // ---------- Community actions ----------
  const dupeToMine = async (id) => {
    try {
      const r = await apiCall(`/assessments/${id}/duplicate`, { method: 'POST' })
      toast.success('🌟 Copied to your Library. You can edit it now.')
      setTab('library')
      loadLibrary()
    } catch (e) { toast.error(e.message || 'Failed to duplicate') }
  }
  const reportAssessment = async (id, title) => {
    const reason = typeof window !== 'undefined' ? window.prompt(`Why are you reporting "${title || 'this assessment'}"?\n(e.g. Inappropriate content, wrong answers, spam)`) : null
    if (reason === null) return
    if (!reason.trim()) { toast.error('Please share a short reason so we can review.'); return }
    try {
      await apiCall(`/assessments/${id}/report`, { method: 'POST', body: { reason: reason.trim() } })
      toast.success('🚩 Reported. Our team will review shortly.')
    } catch (e) { toast.error(e.message || 'Failed to report') }
  }

  // ---------- Toggle helpers ----------
  const toggleChapter = (c) => {
    setSelChapters(prev => prev.find(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c])
  }
  const toggleWritten = (k) => setSelectedWritten(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
  const toggleTeacher = (k) => setSelectedTeacher(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])

  const validationError = useMemo(() => {
    if (!selClass) return 'Please select a class'
    if (!selBook) return 'Please select a subject / book'
    if (selChapters.length === 0) return 'Please pick at least one chapter'
    if (selectedWritten.length === 0) return 'Please pick at least one question type'
    if (effectiveMarks < 5) return 'Total marks must be at least 5'
    const diffSum = difficulty.easy + difficulty.medium + difficulty.hard
    if (Math.abs(diffSum - 100) > 1) return 'Difficulty percentages must add up to 100'
    return null
  }, [selClass, selBook, selChapters, selectedWritten, effectiveMarks, difficulty])

  // ---------- Generate ----------
  const generate = async () => {
    if (busy) return                             // prevent double-click
    if (validationError) { toast.error(validationError); return }
    setBusy(true); setProgress('preparing'); setCurrent(null)

    // Client-side rotating progress messages while the sync API runs.
    const progressMsgs = [
      { at: 0,     msg: 'Generating your assessment…' },
      { at: 8000,  msg: 'Validating questions, answers, LO Codes and marks…' },
      { at: 25000, msg: 'Regenerating assessment… Attempt 2 of 3' },
      { at: 50000, msg: 'Regenerating assessment… Attempt 3 of 3' },
      { at: 80000, msg: 'Finalizing Question Paper, Answer Key, Blueprint and Marking Scheme…' },
    ]
    const startedAt = Date.now()
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt
      let latest = progressMsgs[0].msg
      for (const p of progressMsgs) { if (elapsed >= p.at) latest = p.msg }
      setProgress(latest)
    }, 1200)
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null }

    try {
      // Map UI language pick → backend payload.  'auto' lets the backend
      // detect from subject; explicit picks add strictLanguageLock so the
      // model MUST use that language (per SCERT/OSEPA mandatory policy).
      const langMap = { odia: 'odia', english: 'english', hindi: 'hindi', sanskrit: 'sanskrit' }
      const isAutoLang = outputLanguage === 'auto'
      const payload = {
        classId: selClass.id, bookId: selBook.id,
        chapterIds: selChapters.map(c => c.id),
        assessmentType,
        totalMarks: effectiveMarks,
        writtenTypes: selectedWritten,
        teacherConducted: selectedTeacher,
        difficulty,
        includeAnswerKey, includeBlueprint, includeObservation, includeRubrics,
        ...(isAutoLang ? {} : { language: langMap[outputLanguage], strictLanguageLock: true }),
      }
      const r = await apiCall('/assessments/build', { method: 'POST', body: payload })
      // v2 pipeline is fully synchronous — the response contains the final
      // assessment. No polling required.
      setCurrent(r.assessment)
      setProgress('')
      setBusy(false)
      if (r.assessment?.status === 'ready') {
        toast.success('✅ Assessment ready!')
      } else {
        toast.error(r.error || '⚠️ Generation Taking Longer Than Expected — please try again. Your AI Credits have not been charged twice.')
      }
    } catch (e) {
      setBusy(false); setProgress('')
      if (e.status === 402) { /* modal already opened via event */ return }
      // v2 pipeline returns 422 with { error, assessment } on validation failure.
      const msg = e?.data?.error || e?.message || '⚠️ Generation failed — please try again.'
      toast.error(msg.length > 200 ? msg.slice(0, 197) + '…' : msg)
    } finally {
      clearInterval(progressTimer)
    }
  }
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  // ---------- PDF ----------
  const openPDF = async (id, mode = 'full') => {
    if (!id) return
    const tok = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
    const url = `/api/assessments/${id}/pdf?mode=${mode}`
    const tId = toast.loading('Preparing PDF…')
    try {
      const r = await fetch(url, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      const ct = r.headers.get('content-type') || ''
      if (!r.ok || !ct.includes('application/pdf')) {
        // Server returned an error (JSON) — surface the real message to the user
        // instead of opening it as a corrupt "PDF" in a new tab.
        let msg = `PDF failed (${r.status})`
        try {
          const j = ct.includes('json') ? await r.json() : await r.text()
          msg = (j && typeof j === 'object') ? (j.error || j.message || msg) : String(j).slice(0, 240)
        } catch (_) { /* keep default msg */ }
        toast.dismiss(tId)
        toast.error(msg)
        return
      }
      const blob = await r.blob()
      const objectUrl = URL.createObjectURL(blob)
      // Build a friendly filename — mobile notification/downloads panel shows this.
      const modeLabel = mode === 'full' ? 'Full' : mode === 'paper' ? 'QuestionPaper' : mode === 'answers-only' ? 'AnswerKey' : mode === 'blueprint-only' ? 'Blueprint' : mode
      const safeTitle = (current?.title || 'Assessment').replace(/[^\w\s.\-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80)
      const filename = `LessonGuruOdisha_${safeTitle}_${modeLabel}.pdf`

      // Try a real download first (fires the OS/Chrome download notification).
      // Fall back to opening the blob in a new tab if the download attribute
      // is ignored (older mobile browsers) or if the tap was intercepted.
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        a.remove()
        // Revoke later so mobile has time to move the blob to the downloads folder.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
      }, 250)
      toast.dismiss(tId)
      toast.success('⬇ PDF downloaded — check your notifications')
    } catch (e) {
      toast.dismiss(tId)
      toast.error(e?.message || 'Download failed. Please try again.')
    }
  }

  const reset = () => {
    setCurrent(null); setProgress(''); setBusy(false)
    if (pollRef.current) clearTimeout(pollRef.current)
  }

  const done = {
    lesson:   !!(selClass && selBook && selChapters.length > 0),
    type:     !!assessmentType,
    marks:    effectiveMarks >= 5,
    types:    selectedWritten.length > 0,
    difficulty: Math.abs(difficulty.easy + difficulty.medium + difficulty.hard - 100) <= 1,
    extras:   true,
  }

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-3xl mx-auto px-3 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => go?.('dashboard')} className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center">
            <ArrowLeft className="w-4 h-4 text-slate-700" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-blue-600 uppercase tracking-widest">Professional Builder</div>
            <div className="text-lg font-black text-slate-900 leading-tight">Assessment Builder · ମୂଲ୍ୟାୟନ ପ୍ରସ୍ତୁତି</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          <button onClick={() => setTab('new')} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${tab === 'new' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
            <Wand2 className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Build New
          </button>
          <button onClick={() => setTab('library')} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${tab === 'library' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
            <ClipboardList className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> My Library
          </button>
          <button onClick={() => setTab('community')} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${tab === 'community' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow' : 'bg-white text-slate-700 border border-slate-200'}`}>
            <Users className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> 🌟 Community
          </button>
          <button onClick={() => setTab('official')} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${tab === 'official' ? 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow' : 'bg-white text-slate-700 border border-slate-200'}`}>
            <ClipboardCheck className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> 📋 Instant Papers
          </button>
          <button onClick={() => setTab('fasa')} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${tab === 'fasa' ? 'bg-gradient-to-r from-indigo-600 to-violet-700 text-white shadow' : 'bg-white text-slate-700 border border-slate-200'}`}>
            <FileText className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> 📋 FA/SA Paper
          </button>
        </div>

        {tab === 'fasa' ? (
          <FASAPaperGenerator />
        ) : tab === 'official' ? (
          <OfficialPapersList user={user} />
        ) : tab === 'community' ? (
          <CommunityList
            community={community}
            filters={communityFilters}
            setFilters={setCommunityFilters}
            onRefresh={loadCommunity}
            onView={(id) => openPDF(id, 'full')}
            onDupe={dupeToMine}
            onReport={reportAssessment}
          />
        ) : tab === 'library' ? (
          <LibraryList items={library} onView={(id) => openPDF(id, 'full')} onLoad={loadLibrary} />
        ) : current && current.status === 'ready' ? (
          <ResultView packet={current} onNew={reset} onPDF={(mode) => openPDF(current.id, mode)} />
        ) : busy ? (
          <ProgressView progress={progress} packet={current} />
        ) : (
          // ================ BUILDER FORM ================
          <div className="space-y-3">
            {/* 1. Lesson picker */}
            <Panel
              title="1️⃣ Class · Subject · Chapter"
              subtitle={done.lesson ? `${selClass.name} · ${selBook.name} · ${selChapters.length} chapter(s)` : 'Pick the source lesson'}
              icon={BookOpen} done={done.lesson}
              open={openPanel === 'lesson'} onToggle={() => setOpenPanel(openPanel === 'lesson' ? '' : 'lesson')}
            >
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">Class</div>
                  <div className="flex flex-wrap gap-2">
                    {classes.map(c => (
                      <Chip key={c.id} selected={selClass?.id === c.id} onClick={() => setSelClass(c)} small>
                        {c.nameOdia || c.name}
                      </Chip>
                    ))}
                  </div>
                </div>
                {selClass && (
                  <div>
                    <div className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">Subject / Book</div>
                    <div className="flex flex-wrap gap-2">
                      {books.map(b => (
                        <Chip key={b.id} selected={selBook?.id === b.id} onClick={() => setSelBook(b)} small>{b.name}</Chip>
                      ))}
                    </div>
                  </div>
                )}
                {selBook && (
                  <div>
                    <div className="text-[11px] uppercase tracking-widest font-bold text-slate-500 mb-1.5">
                      Chapters <span className="text-slate-400 font-normal">· pick one or more</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {chapters.map(c => (
                        <Chip key={c.id} selected={!!selChapters.find(x => x.id === c.id)} onClick={() => toggleChapter(c)} small>
                          {c.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            {/* NEW: Existing Community Assessments for this Chapter (auto-loads)
                Shows peer teachers' ready assessments so users can Preview /
                Print / "Use as Template" BEFORE generating a new one. */}
            <ExistingAssessmentsForChapter
              selClass={selClass}
              selBook={selBook}
              selChapters={selChapters}
              currentUserId={user?.id}
              onView={(id) => openPDF(id, 'full')}
              onUseAsTemplate={dupeToMine}
              onReport={reportAssessment}
              onSwitchToCommunity={() => {
                setCommunityFilters(f => ({
                  ...f,
                  classId: selClass?.id || '',
                  bookId: selBook?.id || '',
                }))
                setTab('community')
              }}
            />

            {/* 2. Assessment Type */}
            <Panel
              title="2️⃣ Assessment Type"
              subtitle={assessmentType.toUpperCase()}
              icon={GraduationCap} done={done.type}
              open={openPanel === 'type'} onToggle={() => setOpenPanel(openPanel === 'type' ? '' : 'type')}
            >
              <div className="flex flex-wrap gap-2">
                {ASSESSMENT_TYPES.map(t => (
                  <Chip key={t.key} selected={assessmentType === t.key} onClick={() => setAssessmentType(t.key)}>{t.label}</Chip>
                ))}
              </div>
            </Panel>

            {/* 3. Marks */}
            <Panel
              title="3️⃣ Total Marks"
              subtitle={`${effectiveMarks} marks`}
              icon={Target} done={done.marks}
              open={openPanel === 'marks'} onToggle={() => setOpenPanel(openPanel === 'marks' ? '' : 'marks')}
            >
              <div className="flex flex-wrap gap-2">
                {MARKS_PRESETS.map(m => (
                  <Chip key={m} selected={totalMarks === m} onClick={() => setTotalMarks(m)}>{m} Marks</Chip>
                ))}
                <Chip selected={totalMarks === 'custom'} onClick={() => setTotalMarks('custom')}>Custom</Chip>
              </div>
              {totalMarks === 'custom' && (
                <input
                  type="number" min="5" max="200"
                  value={customMarks}
                  onChange={e => setCustomMarks(e.target.value)}
                  placeholder="e.g. 40, 70, 120"
                  className="mt-3 w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              )}
            </Panel>

            {/* 4. Question Types */}
            <Panel
              title="4️⃣ Question Types"
              subtitle={`${selectedWritten.length} written · ${selectedTeacher.length + (includeObservation?1:0) + (includeRubrics?1:0)} teacher-conducted`}
              icon={ClipboardList} done={done.types}
              open={openPanel === 'types'} onToggle={() => setOpenPanel(openPanel === 'types' ? '' : 'types')}
            >
              <div className="text-[11px] uppercase tracking-widest font-bold text-blue-600 mb-2">Written Question Types (appear in the paper)</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {WRITTEN_TYPES.map(t => (
                  <Chip key={t.key} selected={selectedWritten.includes(t.key)} onClick={() => toggleWritten(t.key)} small>
                    {t.label} <span className="text-[10px] opacity-70">({t.defaultMarks} mark{t.defaultMarks > 1 ? 's' : ''})</span>
                  </Chip>
                ))}
              </div>
              <div className="text-[11px] uppercase tracking-widest font-bold text-orange-600 mb-2">Teacher-Conducted Evaluation (separate blocks)</div>
              <div className="flex flex-wrap gap-2">
                {TEACHER_TYPES.map(t => (
                  <Chip key={t.key} selected={selectedTeacher.includes(t.key)} onClick={() => toggleTeacher(t.key)} small>
                    {t.label}
                  </Chip>
                ))}
              </div>
            </Panel>

            {/* 5. Difficulty */}
            <Panel
              title="5️⃣ Difficulty Distribution"
              subtitle={`Easy ${difficulty.easy}% · Med ${difficulty.medium}% · Hard ${difficulty.hard}%`}
              icon={Sparkles} done={done.difficulty}
              open={openPanel === 'diff'} onToggle={() => setOpenPanel(openPanel === 'diff' ? '' : 'diff')}
            >
              <div className="space-y-3">
                {['easy', 'medium', 'hard'].map(k => (
                  <div key={k}>
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span className="capitalize">{k}</span>
                      <span className="text-blue-600">{difficulty[k]}%</span>
                    </div>
                    <input
                      type="range" min="0" max="100" step="5"
                      value={difficulty[k]}
                      onChange={e => setDifficulty(d => ({ ...d, [k]: Number(e.target.value) }))}
                      className="w-full accent-blue-600"
                    />
                  </div>
                ))}
                <div className={`text-[11.5px] font-semibold text-center rounded-lg py-1.5 ${
                  Math.abs(difficulty.easy + difficulty.medium + difficulty.hard - 100) <= 1
                    ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                }`}>
                  Total: {difficulty.easy + difficulty.medium + difficulty.hard}% (must equal 100%)
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip small selected={JSON.stringify(difficulty) === JSON.stringify({easy:40,medium:40,hard:20})} onClick={() => setDifficulty({easy:40,medium:40,hard:20})}>
                    Balanced 40/40/20
                  </Chip>
                  <Chip small onClick={() => setDifficulty({easy:60,medium:30,hard:10})}>Easy-heavy</Chip>
                  <Chip small onClick={() => setDifficulty({easy:20,medium:40,hard:40})}>Advanced</Chip>
                </div>
              </div>
            </Panel>

            {/* 6. Output Language — HIGHEST PRIORITY (subject-language enforcement) */}
            <Panel
              title="6️⃣ Output Language"
              subtitle={
                outputLanguage === 'auto'
                  ? 'Auto — detected from subject'
                  : { odia: 'Odia (ଓଡ଼ିଆ) · Strict lock', english: 'English · Strict lock', hindi: 'Hindi (हिंदी) · Strict lock', sanskrit: 'Sanskrit (संस्कृतम्) · Strict lock' }[outputLanguage]
              }
              icon={Languages} done={true}
              open={openPanel === 'lang'} onToggle={() => setOpenPanel(openPanel === 'lang' ? '' : 'lang')}
            >
              <div className="text-[11.5px] text-slate-600 mb-2">
                Pick the exact output language. When set to <b>Auto</b>, we detect from the selected subject (e.g. an English book → English paper). Explicit picks override every other signal — the paper is generated <b>only</b> in your selected language.
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'auto',     label: '🎯 Auto', sub: 'from subject' },
                  { key: 'odia',     label: 'ଓଡ଼ିଆ · Odia', sub: 'or' },
                  { key: 'english',  label: 'English', sub: 'en' },
                  { key: 'hindi',    label: 'हिंदी · Hindi', sub: 'hi' },
                  { key: 'sanskrit', label: 'संस्कृतम् · Sanskrit', sub: 'sa' },
                ].map(o => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => setOutputLanguage(o.key)}
                    className={`text-left rounded-xl border-2 px-3 py-2 transition ${outputLanguage === o.key ? 'bg-blue-50 border-blue-500 shadow' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                  >
                    <div className="text-sm font-black text-slate-800">{o.label}</div>
                    <div className="text-[10.5px] text-slate-500 font-semibold">{o.sub}</div>
                  </button>
                ))}
              </div>
              {outputLanguage !== 'auto' && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-900">
                  🔒 <b>Strict Language Lock: ON</b> — the AI must generate every question, option, instruction, answer key, blueprint, observation and rubric in <b>{ { odia: 'Odia', english: 'English', hindi: 'Hindi', sanskrit: 'Sanskrit' }[outputLanguage] }</b>. Book PDF language will not influence the output.
                </div>
              )}
            </Panel>

            {/* 7. Extras */}
            <Panel
              title="7️⃣ Include in Output"
              subtitle={[includeAnswerKey && 'Answer Key', includeBlueprint && 'Blueprint', includeObservation && 'Observation', includeRubrics && 'Rubrics'].filter(Boolean).join(' · ') || 'None'}
              icon={ShieldCheck} done={done.extras}
              open={openPanel === 'extras'} onToggle={() => setOpenPanel(openPanel === 'extras' ? '' : 'extras')}
            >
              <Toggle value={includeAnswerKey}  onChange={setIncludeAnswerKey}  label="Answer Key"          description="Separate page with model answers for every question." />
              <Toggle value={includeBlueprint}  onChange={setIncludeBlueprint}  label="Blueprint (Q ↔ LO ↔ Bloom)" description="Auto-mapped table showing which LO code each question tests." />
              <Toggle value={includeObservation} onChange={setIncludeObservation} label="Teacher Observation Checklist" description="7 indicators: Participation, Communication, Creativity, etc." />
              <Toggle value={includeRubrics}    onChange={setIncludeRubrics}    label="Rubrics Grid"        description="4-level rubric for Knowledge / Skill / Attitude / Application." />
            </Panel>

            {/* 7. Preview + Generate */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4">
              <div className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Marks Distribution Preview</div>
              {distribution.length > 0 ? (
                <div className="mt-2">
                  <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1.5 text-sm">
                    {distribution.map((s, i) => (
                      <div key={i} className="contents">
                        <div className="font-bold text-blue-600">Section {String.fromCharCode(65 + i)}</div>
                        <div className="text-slate-800">{s.labelOdia} <span className="text-slate-400">({s.label})</span></div>
                        <div className="font-semibold text-slate-900">{s.count} × {s.marksPerQ} = {s.marks}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-sm text-slate-500">Total</span>
                    <span className={`text-lg font-black ${distributionTotal === effectiveMarks ? 'text-green-600' : 'text-orange-600'}`}>
                      {distributionTotal} / {effectiveMarks}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500">Select at least one question type to see distribution.</div>
              )}
              {validationError && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  ⚠️ {validationError}
                </div>
              )}
              {/* 💎 AI Credit Use — pulled from centralized /api/ai-credits/costs */}
              {aiCreditsRequired != null && !busy && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🤖</span>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-widest text-indigo-700">AI Credit Use</div>
                      <div className="text-[11.5px] text-slate-700">This generation uses <b className="text-indigo-700">{aiCreditsRequired} AI Credits</b></div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold px-2.5 py-1">
                    ⚡ {aiCreditsRequired}
                  </span>
                </div>
              )}
              <button
                onClick={generate}
                disabled={!!validationError || busy}
                className={`mt-4 w-full rounded-full py-3.5 text-base font-black text-white flex items-center justify-center gap-2 transition-all ${
                  (validationError || busy) ? 'bg-slate-300 cursor-not-allowed' :
                  'bg-gradient-to-r from-blue-600 to-orange-500 shadow-lg hover:brightness-110 active:scale-[0.98]'
                }`}
              >
                {busy ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> ✨ Generating with Gemini…</>
                ) : (
                  <><Zap className="w-5 h-5" /> Generate Professional Assessment</>
                )}
              </button>
              <div className="mt-2 text-center text-[11px] text-slate-500">
                ⚡ Grounded in your DB lesson content · Powered by Gemini
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------
// Progress view
// -------------------------------------------------------------------
const ProgressView = ({ progress, packet }) => {
  // v2 pipeline sends free-form rotating messages via the `progress` prop
  // (Generating → Validating → Regenerating Attempt 2/3 → Finalizing).
  // We show them directly + retain the planned distribution card below.
  return (
    <div className="rounded-3xl bg-white border border-slate-200 p-5 sm:p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        <div className="text-lg font-black text-slate-900">Building your assessment…</div>
      </div>
      <div className="mt-1 text-xs text-slate-500">This may take 30–90 seconds — the AI is validating every question, answer, LO code and mark before the paper is ready.</div>
      <div className="mt-5 rounded-xl bg-blue-50 border border-blue-200 p-3 flex items-center gap-2">
        <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
        <div className="text-[12px] font-semibold text-blue-900">
          {progress || 'Generating your assessment…'}
        </div>
      </div>
      {packet?.distributionPreview?.length > 0 && (
        <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-[11px] uppercase font-bold text-slate-500 tracking-widest">Planned</div>
          <div className="mt-2 text-xs text-slate-700 grid grid-cols-2 gap-y-1">
            {packet.distributionPreview.map((s, i) => (
              <div key={i}>Sec {String.fromCharCode(65 + i)}: {s.count} × {s.marksPerQ} = {s.marks}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------
// Result view — preview + PDF actions
// -------------------------------------------------------------------
const ResultView = ({ packet, onNew, onPDF }) => {
  const [showAnswerKey, setShowAnswerKey] = useState(false)
  const [confirmingReveal, setConfirmingReveal] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewSrcDoc, setPreviewSrcDoc] = useState('')

  const isV2 = !!(packet?.v2 && Array.isArray(packet?.questions) && packet.questions.length > 0)

  useEffect(() => {
    let alive = true
    async function loadPreview() {
      if (!packet?.id) return
      const tok = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
      const mode = showAnswerKey ? 'full' : 'paper'
      try {
        const r = await fetch(`/api/assessments/${packet.id}/html?mode=${mode}`, {
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        })
        if (!r.ok) return
        const html = await r.text()
        if (alive) setPreviewSrcDoc(html)
        setPreviewUrl(`/api/assessments/${packet.id}/html?mode=${mode}`)
      } catch (_) { /* silent */ }
    }
    loadPreview()
    return () => { alive = false }
  }, [packet?.id, showAnswerKey])

  const toggleAnswerKey = () => {
    if (showAnswerKey) { setShowAnswerKey(false); return }
    setConfirmingReveal(true)
  }
  const confirmReveal = () => { setShowAnswerKey(true); setConfirmingReveal(false); toast.success('🔓 Answer Key revealed — teacher use only') }

  const questionCount = Array.isArray(packet?.questions) ? packet.questions.length : 0
  const sectionCounts = (packet?.sections || []).map(s => ({
    label: s.labelOdia || s.title || s.key || '',
    letter: s.sectionLetter || s.title?.split(' ')[1] || '',
    count: s.count,
    marksPerQ: s.marksPerQ,
    marks: s.marks,
  }))

  return (
  <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 sm:p-6 border-b border-slate-200 bg-gradient-to-br from-blue-50 to-orange-50">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-green-500 text-white flex items-center justify-center shadow-md">
          <Check className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[11px] font-bold text-green-700 uppercase tracking-widest">Ready</div>
            {isV2 && (
              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                {questionCount} questions · Validated
              </span>
            )}
          </div>
          <div className="text-lg font-black text-slate-900 leading-tight">{packet.title}</div>
          <div className="text-xs text-slate-600 mt-0.5">{packet.className} · {packet.bookName} · {packet.totalMarks} marks · {packet.durationMin || 45} min</div>
        </div>
      </div>
    </div>
    <div className="p-4 sm:p-6 space-y-3">
      {/* Question Paper Preview */}
      {isV2 && previewSrcDoc && (
        <div className="rounded-xl overflow-hidden border-2 border-slate-200 bg-white">
          <div className="px-3 py-2 bg-slate-50 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
              <FileText className="w-3.5 h-3.5 text-blue-600" /> Question Paper Preview
              {showAnswerKey ? (
                <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">🔓 Answer Key visible</span>
              ) : (
                <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">🔒 Answer Key locked</span>
              )}
            </div>
            <button
              onClick={toggleAnswerKey}
              className={`h-7 px-3 text-[10px] font-bold rounded-md border ${showAnswerKey ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400'}`}
            >
              {showAnswerKey ? '🔒 Hide Answer Key' : '🔓 Show Answer Key'}
            </button>
          </div>
          {!showAnswerKey && (
            <div className="px-3 py-1.5 text-[10px] text-slate-600 bg-emerald-50/60 border-b">
              🔒 Answer Key, Marking Scheme and Blueprint are hidden. Only the Question Paper is shown below.
            </div>
          )}
          <iframe
            srcDoc={previewSrcDoc}
            title="Assessment preview"
            className="w-full block"
            style={{ height: '62vh', border: 'none', background: '#fff' }}
            loading="eager"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => onPDF('full')} className="rounded-xl bg-blue-600 text-white font-bold py-3 flex items-center justify-center gap-2 shadow hover:brightness-110 active:scale-95">
          <FileText className="w-4 h-4" /> Full PDF
        </button>
        <button onClick={() => onPDF('paper')} className="rounded-xl bg-orange-500 text-white font-bold py-3 flex items-center justify-center gap-2 shadow hover:brightness-110 active:scale-95">
          <Download className="w-4 h-4" /> Question Paper Only
        </button>
        {packet.includeAnswerKey && (
          <button onClick={() => onPDF('answers-only')} className="rounded-xl bg-green-600 text-white font-bold py-3 flex items-center justify-center gap-2 shadow hover:brightness-110 active:scale-95">
            <Check className="w-4 h-4" /> Answer Key
          </button>
        )}
        {packet.includeBlueprint && (
          <button onClick={() => onPDF('blueprint-only')} className="rounded-xl bg-purple-600 text-white font-bold py-3 flex items-center justify-center gap-2 shadow hover:brightness-110 active:scale-95">
            <Target className="w-4 h-4" /> Blueprint
          </button>
        )}
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
        <div className="font-bold text-slate-900 mb-1">Structure {isV2 && <span className="text-[10px] font-medium text-emerald-700">· {questionCount} questions generated</span>}</div>
        <div className="space-y-0.5 text-slate-700">
          {sectionCounts.length ? sectionCounts.map((s, i) => (
            <div key={i}>
              <span className="font-semibold text-blue-600">Section {s.letter || String.fromCharCode(65 + i)}</span> · {s.label}
              <span className="text-slate-500"> ({s.count} × {s.marksPerQ} = {s.marks} marks)</span>
            </div>
          )) : <div className="text-slate-500">No section data.</div>}
        </div>
      </div>

      <button onClick={onNew} className="w-full rounded-full py-2.5 border-2 border-slate-200 text-slate-700 font-bold hover:border-blue-400 hover:text-blue-600 transition-all">
        <RefreshCw className="w-4 h-4 inline -mt-0.5 mr-1" /> Build another assessment
      </button>
    </div>

    {confirmingReveal && (
      <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmingReveal(false)}>
        <div className="max-w-sm w-full p-4 rounded-2xl border-2 shadow-2xl bg-white" onClick={e => e.stopPropagation()}>
          <div className="text-center">
            <div className="text-4xl mb-2">🔓</div>
            <p className="text-sm font-black text-slate-900 mb-1">Reveal Answer Key?</p>
            <p className="text-[11px] text-slate-600 mb-4">
              This will show the Answer Key, Marking Scheme and Blueprint in the preview and any Full PDF you download.
              <br /><br />
              <b>Please only reveal this if you are the teacher and no student can see the screen.</b>
            </p>
            <div className="flex gap-2">
              <button className="flex-1 h-9 text-xs font-bold rounded-md border border-slate-300 hover:bg-slate-50" onClick={() => setConfirmingReveal(false)}>Cancel</button>
              <button className="flex-1 h-9 text-xs font-bold rounded-md bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmReveal}>
                🔓 I&apos;m the teacher — Reveal
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
  )
}

// -------------------------------------------------------------------
// Library list
// -------------------------------------------------------------------
const LibraryList = ({ items, onView, onLoad }) => (
  <div className="space-y-2">
    <button onClick={onLoad} className="w-full text-xs text-blue-600 font-semibold py-2">
      <RefreshCw className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Refresh
    </button>
    {items.length === 0 && <div className="text-center text-sm text-slate-500 py-8">No assessments yet. Build your first one!</div>}
    {items.map(a => (
      <div key={a.id} className="rounded-xl bg-white border border-slate-200 p-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">{a.title}</div>
            <div className="text-[11px] text-slate-500 truncate">{a.className} · {a.bookName} · {a.totalMarks || '—'} marks</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {a.status === 'ready' ? '✅ Ready' : a.status === 'generating' ? '⏳ Generating…' : a.status === 'failed' ? '❌ Failed' : '—'}
            </div>
          </div>
          {a.status === 'ready' && (
            <button onClick={() => onView(a.id)} className="rounded-lg bg-blue-600 text-white text-xs font-bold px-3 py-1.5 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> View
            </button>
          )}
        </div>
      </div>
    ))}
  </div>
)

// -------------------------------------------------------------------
// Community Library — see other teachers' shared assessments
// -------------------------------------------------------------------
// -------------------------------------------------------------------
// ExistingAssessmentsForChapter — auto-shown at the top of "Build New"
// once Class + Subject + at least one Chapter is picked.  Previews
// community assessments so teachers can Preview / Print / "Use as
// Template" BEFORE generating a duplicate.
// -------------------------------------------------------------------
const ExistingAssessmentsForChapter = ({ selClass, selBook, selChapters, currentUserId, onView, onUseAsTemplate, onReport, onSwitchToCommunity }) => {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const chapterId = selChapters?.[0]?.id || null

  useEffect(() => {
    if (!selClass?.id || !selBook?.id || !chapterId) return
    let cancelled = false
    setLoading(true); setError(null)
    const qs = new URLSearchParams({
      classId: selClass.id,
      bookId: selBook.id,
      chapterId,
      limit: '12',
    })
    if (typeFilter) qs.set('type', typeFilter)
    if (mineOnly) qs.set('mine', '1')
    apiCall(`/assessments/community?${qs.toString()}`)
      .then(r => { if (cancelled) return; setItems(r.items || []); setTotal(r.total || 0) })
      .catch(e => { if (!cancelled) setError(e?.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selClass?.id, selBook?.id, chapterId, typeFilter, mineOnly])

  // Guard: only render when a chapter is picked
  if (!selClass || !selBook || !chapterId) return null

  const chapterName = selChapters?.[0]?.name || 'this chapter'

  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-3 sm:p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shrink-0">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-widest text-orange-700 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Existing Assessments · Community
          </div>
          <div className="text-[14px] font-black text-slate-900 leading-tight mt-0.5">
            {loading
              ? 'Loading assessments…'
              : total > 0
                ? `${total} ready assessment${total !== 1 ? 's' : ''} for "${chapterName}"`
                : `No assessments yet for "${chapterName}"`}
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            {total > 0
              ? 'Preview, Print, or "Use as Template" — save 2 minutes of Generate.'
              : 'Be the first to publish one — Generate below and it will help other teachers.'}
          </div>
        </div>
        <button
          onClick={onSwitchToCommunity}
          className="hidden sm:inline-flex items-center gap-1 text-[10.5px] font-bold text-orange-700 bg-white rounded-full border border-orange-200 px-2.5 py-1 hover:bg-orange-50"
        >
          Browse all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Filter chips */}
      {total > 0 && (
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            onClick={() => { setTypeFilter(''); }}
            className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold whitespace-nowrap transition ${typeFilter === '' ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-700 border border-slate-200'}`}
          >All types</button>
          {['fa1', 'fa2', 'sa1', 'sa2', 'practice', 'unit', 'revision'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t === typeFilter ? '' : t)}
              className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase whitespace-nowrap transition ${typeFilter === t ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-700 border border-slate-200'}`}
            >{t}</button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setMineOnly(m => !m)}
              className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold whitespace-nowrap transition ${mineOnly ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-700 border border-slate-200'}`}
            >{mineOnly ? '✓ Only Mine' : 'All Teachers'}</button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-white/70 border border-amber-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="mt-3 rounded-xl bg-white/80 border border-red-200 px-3 py-2 text-[12px] text-red-700">
          Couldn&apos;t load: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && total === 0 && (
        <div className="mt-3 rounded-xl bg-white/80 border border-amber-200 px-3 py-3 text-center">
          <div className="text-[12px] font-semibold text-slate-700">
            🌱 No shared assessments here yet.
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Continue below to generate one — yours will appear here for others.
          </div>
        </div>
      )}

      {/* Cards grid */}
      {!loading && items.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map(it => {
            const isMine = it.isMine || it.userId === currentUserId
            const badgeColor = isMine ? 'bg-blue-100 text-blue-700 ring-blue-200' : 'bg-white text-slate-700 ring-slate-200'
            return (
              <div key={it.id} className="rounded-xl bg-white ring-1 ring-amber-100 shadow-sm p-2.5 flex flex-col gap-2 hover:shadow-md transition">
                {/* Title row */}
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-black text-slate-900 line-clamp-2 leading-tight">{it.title || 'Untitled Assessment'}</div>
                    <div className="mt-1 flex items-center flex-wrap gap-1">
                      {it.type && <span className="text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 rounded-full px-1.5 py-0.5 ring-1 ring-slate-200">{it.type}</span>}
                      {it.totalMarks && <span className="text-[9px] font-bold text-slate-600 bg-white rounded-full px-1.5 py-0.5 ring-1 ring-slate-200"><Target className="w-2.5 h-2.5 inline -mt-0.5" /> {it.totalMarks} marks</span>}
                      {it.durationMin && <span className="text-[9px] font-bold text-slate-600 bg-white rounded-full px-1.5 py-0.5 ring-1 ring-slate-200">⏱ {it.durationMin}m</span>}
                    </div>
                  </div>
                  {isMine && (
                    <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider rounded-full px-1.5 py-0.5 ring-1 ${badgeColor}`}>You</span>
                  )}
                </div>
                {/* Creator + counts */}
                <div className="flex items-center gap-2 text-[10px] text-slate-500 border-t border-slate-100 pt-1.5">
                  <span className="inline-flex items-center gap-1">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-[8px] font-black">
                      {(it.ownerLabel || 'T')[0].toUpperCase()}
                    </div>
                    By {it.ownerLabel || 'Teacher'}
                  </span>
                  {(it.downloadCount > 0 || it.duplicateCount > 0) && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[9.5px]">
                      {it.downloadCount > 0 && <span title="Downloads">📥 {it.downloadCount}</span>}
                      {it.duplicateCount > 0 && <span title="Times used as template">📋 {it.duplicateCount}</span>}
                    </span>
                  )}
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 pt-0.5">
                  <button
                    onClick={() => onView?.(it.id)}
                    className="flex-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10.5px] font-bold px-2 py-1.5 flex items-center justify-center gap-1"
                    title="Preview & Print (opens HTML preview + PDF)"
                  >
                    <Eye className="w-3 h-3" /> Preview / Print
                  </button>
                  <button
                    onClick={() => onUseAsTemplate?.(it.id)}
                    className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white text-[10.5px] font-bold px-2 py-1.5 flex items-center gap-1"
                    title="Copy to your library to edit"
                  >
                    <Copy className="w-3 h-3" /> Use
                  </button>
                  {!isMine && (
                    <button
                      onClick={() => onReport?.(it.id, it.title)}
                      className="rounded-lg bg-white text-slate-500 hover:text-red-600 hover:bg-red-50 text-[10.5px] font-bold px-1.5 py-1.5 ring-1 ring-slate-200"
                      title="Report inappropriate"
                    >
                      <Flag className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer helper */}
      {!loading && (total > 0 || items.length > 0) && (
        <div className="mt-3 pt-2 border-t border-amber-200/60 flex items-center justify-between gap-2">
          <div className="text-[10.5px] text-slate-600">
            Continue below to <b>Generate a fresh assessment</b> ↓
          </div>
          <button
            onClick={onSwitchToCommunity}
            className="sm:hidden text-[10.5px] font-bold text-orange-700 bg-white rounded-full border border-orange-200 px-2.5 py-1 flex items-center gap-1"
          >
            All community <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

const CommunityList = ({ community, filters, setFilters, onRefresh, onView, onDupe, onReport }) => {
  return (
    <div className="space-y-3">
      {/* Header + refresh */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 border border-orange-200 p-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-orange-700">Community Library</div>
            <div className="text-sm font-black text-slate-900 leading-tight">
              {community.total > 0 ? `${community.total} shared assessment${community.total !== 1 ? 's' : ''}` : 'Explore what teachers are building'}
            </div>
          </div>
          <button onClick={onRefresh} disabled={community.loading} className="text-xs font-bold text-orange-700 bg-white rounded-full border border-orange-200 px-3 py-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 inline -mt-0.5 mr-1 ${community.loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <div className="mt-2 text-[10.5px] text-slate-600 leading-snug">
          Preview or download any assessment, copy it to your own library to edit, or report if it&apos;s inappropriate.
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[
          { k: 'recent', label: '🕒 Most Recent' },
          { k: 'popular', label: '⭐ Most Popular' },
          { k: 'downloads', label: '📥 Most Downloaded' },
        ].map(o => (
          <button
            key={o.k}
            onClick={() => setFilters(f => ({ ...f, sort: o.k }))}
            className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${filters.sort === o.k ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            {o.label}
          </button>
        ))}
        {['fa1', 'fa2', 'sa1', 'sa2', 'practice', 'unit', 'revision'].map(t => (
          <button
            key={t}
            onClick={() => setFilters(f => ({ ...f, type: f.type === t ? '' : t }))}
            className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap uppercase ${filters.type === t ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* States */}
      {community.loading && (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
          <div className="text-xs text-slate-500 mt-2">Loading community assessments…</div>
        </div>
      )}
      {!community.loading && community.error && community.error !== 'subscription' && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-center text-sm text-red-700 font-bold">
          {community.error}
        </div>
      )}
      {!community.loading && !community.error && community.items.length === 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
            <Users className="w-5 h-5 text-slate-400" />
          </div>
          <div className="text-sm font-bold text-slate-700">No assessments match your filters</div>
          <div className="text-[11px] text-slate-500 mt-1">Try clearing filters or checking back later.</div>
        </div>
      )}

      {/* Grid */}
      {!community.loading && community.items.map(a => (
        <div key={a.id} className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
          <div className="flex">
            {/* Thumbnail */}
            <div className="w-20 h-20 flex-shrink-0 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center border-r border-slate-200">
              {a.thumbnail
                ? <img src={a.thumbnail} alt="" className="w-full h-full object-contain p-1" />
                : <FileText className="w-6 h-6 text-slate-400" />}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-slate-900 leading-tight line-clamp-2">{a.title}</div>
                  <div className="text-[11px] text-slate-600 mt-0.5 truncate">
                    <span className="font-bold">{a.className}</span> · {a.bookName} · {a.totalMarks || '—'}m
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className={`font-bold ${a.isMine ? 'text-blue-600' : 'text-emerald-700'}`}>
                      {a.isMine ? '👤 You' : `👤 ${a.ownerLabel}`}
                    </span>
                    <span>·</span>
                    <span className="uppercase font-bold">{a.assessmentType}</span>
                    {a.visualMode && <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full text-[9px] font-black">🎨 Visual</span>}
                    {(a.downloadCount || 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Download className="w-2.5 h-2.5" /> {a.downloadCount}
                      </span>
                    )}
                    {(a.duplicateCount || 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <Copy className="w-2.5 h-2.5" /> {a.duplicateCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Actions */}
              <div className="mt-2 flex gap-1.5">
                <button onClick={() => onView(a.id)} className="flex-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold px-2 py-1.5 flex items-center justify-center gap-1 hover:brightness-110 active:scale-95">
                  <Eye className="w-3 h-3" /> View / PDF
                </button>
                {!a.isMine && (
                  <button onClick={() => onDupe(a.id)} className="flex-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold px-2 py-1.5 flex items-center justify-center gap-1 hover:brightness-110 active:scale-95">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
                {!a.isMine && (
                  <button onClick={() => onReport(a.id, a.title)} className="rounded-lg bg-white border border-slate-200 text-slate-500 text-[11px] font-bold px-2 py-1.5 hover:text-red-600 hover:border-red-300" title="Report">
                    <Flag className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
