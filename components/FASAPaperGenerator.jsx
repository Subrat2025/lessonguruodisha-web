'use client'
// ============================================================
// LessonGuru Odisha — FA/SA Paper Generator UI
// A form + Gemini-powered generator + iframe preview + PDF download.
// Grade I–II auto-switches to Observation Checklist mode.
// Answer Key stays hidden until the teacher explicitly reveals it.
// ============================================================
import React, { useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, FileText, Download, Sparkles, RefreshCw, EyeOff, Eye } from 'lucide-react'
import { toast } from 'sonner'

const GRADES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']
const SUBJECTS_MIDDLE = ['Odia', 'English', 'Hindi', 'Sanskrit', 'Mathematics', 'Science', 'Social Science', 'Art Education', 'Physical Education and Well-being', 'Vocational Education']
const SUBJECTS_PREP   = ['Odia', 'English', 'Hindi', 'Mathematics', 'EVS / The World Around Us', 'Art Education', 'Physical Education and Well-being']
const LANGUAGES = ['Odia', 'English', 'Hindi', 'Sanskrit']
const ASSESSMENTS = [
  { v: 'FA1', label: 'FA1 (25 marks · start → mid Term 1)' },
  { v: 'FA2', label: 'FA2 (25 marks · start → mid Term 2)' },
  { v: 'SA1', label: 'SA1 (50 marks · full Term 1)' },
  { v: 'SA2', label: 'SA2 (50 marks · 30% Term 1 + full Term 2)' },
]

const api = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (token) headers.Authorization = 'Bearer ' + token
  const res = await fetch('/api' + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export default function FASAPaperGenerator() {
  const [form, setForm] = useState({
    school_name: '',
    session: '2026-27',
    grade: 'V',
    subject: 'Odia',
    language: 'Odia',
    assessment_type: 'FA1',
    term: 'Term 1 (April–September)',
    duration: '',
    exam_date: '',
    chapters_or_topics: '',
    learning_outcomes: '',
    special_instructions: '',
    book_title: '',
    book_edition: '2026-27',
    include_observation: false,
  })
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('') // rotating progress message
  const [warnings, setWarnings] = useState([])
  const [showAnswerKey, setShowAnswerKey] = useState(false)
  const [variationSeed, setVariationSeed] = useState('')
  const iframeRef = useRef(null)

  const isFoundational = ['I', 'II'].includes(form.grade)
  const stage = isFoundational ? 'Foundational (Grades I–II)' : (['III', 'IV', 'V'].includes(form.grade) ? 'Preparatory (III–V)' : 'Middle (VI–VIII)')
  const subjectsForStage = ['III', 'IV', 'V'].includes(form.grade) ? SUBJECTS_PREP : SUBJECTS_MIDDLE

  // For FA papers, chapters are optional (mid-Term coverage inferred).  For SA
  // papers we require chapters.
  const chaptersRequired = form.assessment_type.startsWith('SA')

  // The displayed HTML — with the entire Answer Key + Marking Scheme +
  // Blueprint block ripped out when showAnswerKey is false. The renderer
  // wraps those three parts inside a stable HTML-comment marker so this
  // split is deterministic regardless of language.
  const displayedHtml = useMemo(() => {
    if (!html) return ''
    const START = '<!--LG_ANSWER_KEY_START-->'
    const idx = html.indexOf(START)
    if (idx < 0) return html   // marker missing → show as-is (fallback)
    if (showAnswerKey) return html
    const before = html.slice(0, idx)
    const lockedPage = `
<div style="page-break-before:always;padding:24mm 14mm;text-align:center;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#334155;background:#f8fafc;min-height:180mm">
  <div style="font-size:44pt;margin:20mm 0 8mm">🔒</div>
  <div style="font-size:16pt;font-weight:800;color:#0f172a;margin-bottom:6mm">Answer Key hidden</div>
  <div style="font-size:11pt;max-width:120mm;margin:0 auto 10mm;line-height:1.6">
    The Answer Key, Marking Scheme and Blueprint are hidden by default so that students do not see them by accident.
    <br /><br />
    <b>Only the teacher should tap “Show Answer Key” above.</b>
  </div>
  <div style="display:inline-block;padding:6px 14px;border:1.5px dashed #94a3b8;border-radius:10px;font-size:10pt;color:#475569">
    Prints: The unlocked (Show Answer Key = ON) view prints all four parts. The locked view prints only the Question Paper.
  </div>
</div>
</body></html>`
    // Close the wrapping <body>/<html> that we cut out.
    return before + lockedPage
  }, [html, showAnswerKey])

  // Teacher gate — a small confirmation before revealing the answer key.
  const [confirmingReveal, setConfirmingReveal] = useState(false)
  const toggleAnswerKey = () => {
    if (showAnswerKey) { setShowAnswerKey(false); return }
    setConfirmingReveal(true)
  }
  const confirmReveal = () => { setShowAnswerKey(true); setConfirmingReveal(false); toast.success('🔓 Answer Key revealed — teacher use only') }
  const cancelReveal = () => setConfirmingReveal(false)

  const generate = async ({ regenerate = false } = {}) => {
    if (isFoundational) {
      toast.error('Formal papers are not permitted for Grades I–II per the SCERT Framework. Use the observation-checklist mode instead.')
      return
    }
    if (chaptersRequired && form.chapters_or_topics.trim().length < 5) {
      toast.error('Please supply the chapters for Summative Assessment papers.')
      return
    }
    setBusy(true); setWarnings([]); setStatus('Generating your assessment…')
    // Client-side rotating progress messages while the sync API runs.
    const progressMsgs = [
      { at: 0,     msg: 'Generating your assessment…' },
      { at: 8000,  msg: 'Validating questions, answers, LO Codes and marks…' },
      { at: 25000, msg: 'Regenerating assessment… Attempt 2 of 3' },
      { at: 50000, msg: 'Regenerating assessment… Attempt 3 of 3' },
      { at: 75000, msg: 'Finalizing Question Paper, Answer Key, Blueprint and Marking Scheme…' },
    ]
    const startedAt = Date.now()
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt
      let latest = progressMsgs[0].msg
      for (const p of progressMsgs) { if (elapsed >= p.at) latest = p.msg }
      setStatus(latest)
    }, 1200)
    try {
      const seed = regenerate ? String(Date.now()) : ''
      setVariationSeed(seed)
      const r = await api('/paper-generator/generate', { method: 'POST', body: { ...form, variation_seed: seed } })
      setHtml(r.html)
      setShowAnswerKey(false)
      setWarnings(r.warnings || [])
      const banner = r.fromCache ? '💾 Loaded from cache'
        : (r.attempts > 1 ? `✅ Ready · after ${r.attempts} attempt${r.attempts > 1 ? 's' : ''}` : '✅ Assessment ready!')
      toast.success(banner)
    } catch (e) {
      // Show a friendly message; server may include a validation summary.
      const msg = e?.message || 'Generation failed'
      toast.error(msg.length > 160 ? msg.slice(0, 157) + '…' : msg)
    } finally {
      clearInterval(progressTimer)
      setStatus('')
      setBusy(false)
    }
  }

  const downloadPdf = () => {
    // Uses the iframe's own print() so the browser handles A4 print CSS.
    // On mobile the browser's "Save to PDF" option turns it into a file.
    const f = iframeRef.current
    if (!f) return
    try { f.contentWindow?.focus(); f.contentWindow?.print() } catch (e) { toast.error('Print unavailable.') }
  }

  // ObservationChecklistMode — placeholder card for Grade I–II.
  if (isFoundational) {
    return (
      <div className="space-y-3">
        <Card className="p-3 rounded-xl bg-amber-50 border-2 border-amber-200 dark:bg-amber-900/20">
          <p className="text-[11px] font-black text-amber-800 dark:text-amber-300 uppercase tracking-wider">📋 Observation Checklist Mode</p>
          <p className="text-xs mt-1 text-slate-800 dark:text-slate-200">Formal question papers are NOT permitted for Grades I–II per the SCERT Odisha Assessment Framework 2026-27. For these grades, use the observation checklist, anecdotal record and artefact analysis format instead.</p>
        </Card>
        <FormFields form={form} setForm={setForm} stage={stage} subjectsForStage={subjectsForStage} chaptersRequired={false} lockedGrade={false} />
        <Card className="p-3 rounded-xl bg-emerald-50 border-2 border-emerald-200 dark:bg-emerald-900/20">
          <p className="text-[11px] font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Coming next</p>
          <p className="text-xs mt-1">The Grade I–II observation checklist generator ships in Phase 2. For now, please select Grade III or above to use the paper generator.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border-2 border-indigo-200 dark:from-indigo-900/20 dark:to-violet-900/20">
        <p className="text-[11px] font-black text-indigo-800 dark:text-indigo-300 uppercase tracking-wider">📋 FA / SA Paper Generator</p>
        <p className="text-[10px] mt-1 text-slate-700 dark:text-slate-300">Auto-produces the Question Paper, Answer Key and Teacher Observation Record — aligned to the SCERT Odisha Assessment Framework 2026-27. Marks, blueprint, cognitive split and observation criteria are all built in.</p>
        <p className="text-[10px] mt-1 text-indigo-700 font-bold">Stage: {stage}</p>
      </Card>

      <FormFields form={form} setForm={setForm} stage={stage} subjectsForStage={subjectsForStage} chaptersRequired={chaptersRequired} lockedGrade={false} />

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={() => generate({ regenerate: false })} className="h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-700 text-white font-bold">
          {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Paper</>}
        </Button>
        <Button disabled={busy || !html} variant="outline" onClick={() => generate({ regenerate: true })} className="h-11 rounded-xl border-2 font-bold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate (new set)</>}
        </Button>
      </div>

      {busy && status && (
        <Card className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
          <p className="text-[11px] font-medium text-indigo-900">{status}</p>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card className="p-2 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-[10px] font-bold text-amber-800 mb-1">⚠️ Generator notes:</p>
          <ul className="text-[10px] text-amber-700 list-disc pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Card>
      )}

      {html && (
        <Card className="rounded-xl overflow-hidden border-2 bg-white">
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
              <FileText className="w-3.5 h-3.5 text-indigo-600" /> Preview
              {showAnswerKey ? (
                <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">🔓 Answer Key visible</span>
              ) : (
                <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">🔒 Answer Key locked</span>
              )}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant={showAnswerKey ? 'destructive' : 'outline'} onClick={toggleAnswerKey} className="h-7 text-[10px] rounded-md">
                {showAnswerKey ? <><EyeOff className="w-3 h-3 mr-1" /> Hide Answer Key</> : <><Eye className="w-3 h-3 mr-1" /> Show Answer Key</>}
              </Button>
              <Button size="sm" onClick={downloadPdf} className="h-7 text-[10px] rounded-md bg-indigo-600 text-white">
                <Download className="w-3 h-3 mr-1" /> Print / Save PDF
              </Button>
            </div>
          </div>
          {!showAnswerKey && (
            <div className="px-3 py-1.5 text-[10px] text-slate-600 bg-emerald-50/60 border-b flex items-center gap-1.5">
              <span>🔒</span>
              <span>Answer Key, Marking Scheme and Blueprint are hidden. The print/PDF will only include the Question Paper.</span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            srcDoc={displayedHtml}
            sandbox="allow-same-origin allow-modals allow-forms"
            title="FA/SA Paper Preview"
            className="w-full block"
            style={{ height: '78vh', border: 'none', background: '#fff' }}
            loading="eager"
          />
        </Card>
      )}

      {confirmingReveal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={cancelReveal}>
          <Card className="max-w-sm w-full p-4 rounded-2xl border-2 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="text-4xl mb-2">🔓</div>
              <p className="text-sm font-black text-slate-900 mb-1">Reveal Answer Key?</p>
              <p className="text-[11px] text-slate-600 mb-4">
                This will show Parts B (Answer Key), C (Marking Scheme) and D (Blueprint) in the preview and in the printed PDF.
                <br /><br />
                <b>Please only reveal this if you are the teacher and no student can see the screen.</b>
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 h-9 text-xs" onClick={cancelReveal}>Cancel</Button>
                <Button size="sm" className="flex-1 h-9 text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={confirmReveal}>
                  🔓 I&apos;m the teacher — Reveal
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Form fields — extracted so foundational-mode + normal-mode
// can both reuse them.
// ------------------------------------------------------------
function FormFields({ form, setForm, stage, subjectsForStage, chaptersRequired, lockedGrade }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <Card className="p-3 rounded-xl border-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Field label="School name">
          <Input value={form.school_name} onChange={e => set('school_name', e.target.value)} placeholder="Government Elementary School" className="h-9 text-xs" />
        </Field>
        <Field label="Session">
          <Input value={form.session} onChange={e => set('session', e.target.value)} placeholder="2026-27" className="h-9 text-xs" />
        </Field>
        <Field label="Grade / Class">
          <select value={form.grade} disabled={lockedGrade} onChange={e => set('grade', e.target.value)} className="w-full text-xs border rounded-lg px-2 h-9 bg-background">
            {GRADES.map(g => <option key={g} value={g}>Class {g}</option>)}
          </select>
        </Field>
        <Field label="Subject">
          <select value={form.subject} onChange={e => set('subject', e.target.value)} className="w-full text-xs border rounded-lg px-2 h-9 bg-background">
            {subjectsForStage.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Language of paper">
          <select value={form.language} onChange={e => set('language', e.target.value)} className="w-full text-xs border rounded-lg px-2 h-9 bg-background">
            {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Assessment type">
          <select value={form.assessment_type} onChange={e => set('assessment_type', e.target.value)} className="w-full text-xs border rounded-lg px-2 h-9 bg-background">
            {ASSESSMENTS.map(a => <option key={a.v} value={a.v}>{a.label}</option>)}
          </select>
        </Field>
        <Field label="Term">
          <select value={form.term} onChange={e => set('term', e.target.value)} className="w-full text-xs border rounded-lg px-2 h-9 bg-background">
            <option>Term 1 (April–September)</option>
            <option>Term 2 (October–March)</option>
          </select>
        </Field>
        <Field label="Duration">
          <Input value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="45 minutes / 2 hours" className="h-9 text-xs" />
        </Field>
        <Field label="Exam date (optional)">
          <Input type="date" value={form.exam_date} onChange={e => set('exam_date', e.target.value)} className="h-9 text-xs" />
        </Field>
      </div>
      <Field label={`Chapters / topics${chaptersRequired ? ' *' : ''}`}>
        <Textarea value={form.chapters_or_topics} onChange={e => set('chapters_or_topics', e.target.value)} placeholder={"Ch 1 — ...\nCh 2 — ...\nCh 3 — ..."} className="text-xs" rows={3} />
      </Field>
      <Field label="Learning outcomes (optional)">
        <Textarea value={form.learning_outcomes} onChange={e => set('learning_outcomes', e.target.value)} placeholder="OD 405, OD 409 …" className="text-xs" rows={2} />
      </Field>
      <Field label="Special instructions (optional)">
        <Textarea value={form.special_instructions} onChange={e => set('special_instructions', e.target.value)} placeholder="Any teacher-specific notes for the setter" className="text-xs" rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Book title (optional)">
          <Input value={form.book_title} onChange={e => set('book_title', e.target.value)} placeholder="e.g. ସାହିତ୍ୟ ସୁରଭି" className="h-9 text-xs" />
        </Field>
        <Field label="Edition">
          <Input value={form.book_edition} onChange={e => set('book_edition', e.target.value)} placeholder="2026-27" className="h-9 text-xs" />
        </Field>
      </div>
      <label className="flex items-start gap-2 p-2.5 rounded-lg border-2 border-dashed border-indigo-200 bg-indigo-50/50 cursor-pointer hover:border-indigo-400 transition-all">
        <input
          type="checkbox"
          checked={form.include_observation}
          onChange={e => set('include_observation', e.target.checked)}
          className="mt-0.5 accent-indigo-600"
        />
        <div className="flex-1">
          <div className="text-xs font-black text-indigo-900">Include Teacher Observation Format (Part C · 25 marks)</div>
          <div className="text-[10px] text-indigo-700 leading-tight mt-0.5">
            Adds the SCERT-mandated Written Work + Project Work {form.grade === 'V' || form.grade === 'IV' || form.grade === 'III' ? '(15 m)' : '(10 m) + Learner\'s Diary (5 m)'} tables, a Beginner/Progressive/Proficient rubric auto-filled from the chapter LO codes, socio-emotional indicators and signature lines.
          </div>
        </div>
      </label>
    </Card>
  )
}

const Field = ({ label, children }) => (
  <label className="block">
    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">{label}</span>
    {children}
  </label>
)
