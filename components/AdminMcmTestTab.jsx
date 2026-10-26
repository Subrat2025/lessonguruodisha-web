'use client'
import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Plus, Pencil, RefreshCw, BarChart3, CheckCircle2, Archive, Eye, EyeOff, Trash2, Copy, X, GripVertical, Code2, ListChecks } from 'lucide-react'

const emptyForm = () => ({
  monthLabel: '', monthEn: '', year: '', order: '', title: '', instructions: '',
  durationMinutes: 20, passingPercentage: 60, marksPerQuestion: 1, certificateTitle: 'MCM Knowledge Test',
  questionsJson: '[\n  { "q": "Question text?", "options": ["A","B","C","D"], "correctIndex": 0, "marks": 1, "explanation": "" }\n]',
})

// A fresh blank question for the friendly builder.
const emptyQuestion = () => ({ q: '', options: ['', '', '', ''], correctIndex: 0, marks: 1, explanation: '' })

const AdminMcmTestTab = ({ api }) => {
  const [tests, setTests] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState(null) // {test, data}
  // Friendly builder state — the source of truth in 'builder' mode.
  const [qMode, setQMode] = useState('builder') // 'builder' | 'json'
  const [questions, setQuestions] = useState([emptyQuestion()])

  const load = () => { setTests(null); api('/admin/mcm-tests').then(r => setTests(r.tests || [])).catch(e => { setTests([]); toast.error(e.message) }) }
  useEffect(() => { load() }, [])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const reset = () => { setForm(emptyForm()); setEditingId(null); setQuestions([emptyQuestion()]); setQMode('builder') }

  // ---- Friendly builder helpers ------------------------------------------
  const updateQ = (i, patch) => setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q))
  const addQuestion = () => setQuestions(qs => [...qs, emptyQuestion()])
  const removeQuestion = (i) => setQuestions(qs => qs.length <= 1 ? qs : qs.filter((_, idx) => idx !== i))
  const duplicateQuestion = (i) => setQuestions(qs => {
    const copy = { ...qs[i], options: [...qs[i].options] }
    const next = [...qs]; next.splice(i + 1, 0, copy); return next
  })
  const setOption = (qi, oi, val) => setQuestions(qs => qs.map((q, idx) => idx === qi ? { ...q, options: q.options.map((o, j) => j === oi ? val : o) } : q))
  const addOption = (qi) => setQuestions(qs => qs.map((q, idx) => idx === qi && q.options.length < 6 ? { ...q, options: [...q.options, ''] } : q))
  const removeOption = (qi, oi) => setQuestions(qs => qs.map((q, idx) => {
    if (idx !== qi || q.options.length <= 2) return q
    const options = q.options.filter((_, j) => j !== oi)
    let correctIndex = q.correctIndex
    if (oi === correctIndex) correctIndex = 0
    else if (oi < correctIndex) correctIndex -= 1
    return { ...q, options, correctIndex }
  }))

  // Convert builder array → clean/validated questions (throws on error).
  const buildFromBuilder = () => {
    if (!questions.length) throw new Error('Add at least one question')
    return questions.map((q, i) => {
      const text = String(q.q || '').trim()
      const options = (q.options || []).map(o => String(o || '').trim())
      if (!text) throw new Error(`Question ${i + 1}: question text is empty`)
      const filled = options.filter(Boolean)
      if (filled.length < 2) throw new Error(`Question ${i + 1}: needs at least 2 non-empty options`)
      if (options.some(o => !o)) throw new Error(`Question ${i + 1}: remove empty option boxes`)
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= options.length) throw new Error(`Question ${i + 1}: pick the correct answer`)
      return { q: text, options, correctIndex: q.correctIndex, marks: Number(q.marks) || 1, explanation: String(q.explanation || '').trim() }
    })
  }

  const parseQuestionsJson = () => {
    let arr
    try { arr = JSON.parse(form.questionsJson) } catch { throw new Error('Questions JSON is invalid') }
    if (!Array.isArray(arr) || !arr.length) throw new Error('Provide at least one question')
    return arr.map((q, i) => {
      if (!q.q || !Array.isArray(q.options) || q.options.length < 2) throw new Error(`Question ${i + 1}: needs text and ≥2 options`)
      if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex >= q.options.length) throw new Error(`Question ${i + 1}: correctIndex out of range`)
      return { q: q.q, options: q.options, correctIndex: q.correctIndex, marks: q.marks || 1, explanation: q.explanation || '' }
    })
  }

  const parseQuestions = () => qMode === 'json' ? parseQuestionsJson() : buildFromBuilder()

  // Toggle between friendly builder and raw JSON, keeping data in sync.
  const switchMode = (mode) => {
    if (mode === qMode) return
    try {
      if (mode === 'json') {
        // builder → json
        const arr = questions.map(q => ({ q: q.q, options: q.options, correctIndex: q.correctIndex, marks: Number(q.marks) || 1, explanation: q.explanation || '' }))
        set('questionsJson', JSON.stringify(arr, null, 2))
      } else {
        // json → builder
        const arr = JSON.parse(form.questionsJson)
        if (!Array.isArray(arr) || !arr.length) throw new Error('empty')
        setQuestions(arr.map(q => ({
          q: q.q || '', options: Array.isArray(q.options) && q.options.length ? q.options.map(String) : ['', ''],
          correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
          marks: q.marks || 1, explanation: q.explanation || '',
        })))
      }
      setQMode(mode)
    } catch {
      toast.error(mode === 'builder' ? 'JSON is invalid — fix it before switching to the builder' : 'Could not switch')
    }
  }

  const save = async () => {
    if (!form.title.trim()) return toast.error('Title is required')
    let questions
    try { questions = parseQuestions() } catch (e) { return toast.error(e.message) }
    setBusy(true)
    try {
      const payload = {
        monthLabel: form.monthLabel, monthEn: form.monthEn,
        monthShort: (form.monthEn || '').slice(0, 3).toUpperCase(),
        order: Number(form.order) || undefined, title: form.title, instructions: form.instructions,
        durationMinutes: Number(form.durationMinutes), passingPercentage: Number(form.passingPercentage),
        marksPerQuestion: Number(form.marksPerQuestion), certificateTitle: form.certificateTitle, questions,
      }
      if (editingId) { await api('/admin/mcm-tests/' + editingId, { method: 'PUT', body: payload }); toast.success('✅ Test updated') }
      else { await api('/admin/mcm-tests', { method: 'POST', body: payload }); toast.success('✅ Test created (unpublished)') }
      reset(); load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const startEdit = async (t) => {
    try {
      const r = await api('/admin/mcm-tests/' + t.id)
      const d = r.test
      const qs = (d.questions || []).map(({ id, ...q }) => q)
      setForm({
        monthLabel: d.monthLabel || '', monthEn: d.monthEn || '', year: '', order: d.order ?? '',
        title: d.title || '', instructions: d.instructions || '',
        durationMinutes: d.durationMinutes ?? 20, passingPercentage: d.passingPercentage ?? 60,
        marksPerQuestion: d.marksPerQuestion ?? 1, certificateTitle: d.certificateTitle || 'MCM Knowledge Test',
        questionsJson: JSON.stringify(qs, null, 2),
      })
      setQuestions(qs.length ? qs.map(q => ({
        q: q.q || '', options: Array.isArray(q.options) && q.options.length ? q.options.map(String) : ['', ''],
        correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : 0,
        marks: q.marks || 1, explanation: q.explanation || '',
      })) : [emptyQuestion()])
      setQMode('builder')
      setEditingId(d.id)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { toast.error(e.message) }
  }

  const act = async (t, action) => {
    if (action === 'archive' && !confirm(`Archive "${t.title}"? It will be hidden from users but kept for records.`)) return
    try { await api(`/admin/mcm-tests/${t.id}/${action}`, { method: 'POST' }); toast.success(`Done: ${action}`); load() }
    catch (e) { toast.error(e.message) }
  }

  const openStats = async (t) => {
    setStats({ test: t, data: null })
    try { const r = await api('/admin/mcm-tests/' + t.id + '/stats'); setStats({ test: t, data: r }) }
    catch (e) { toast.error(e.message); setStats(null) }
  }

  return (
    <div className="space-y-4">
      {stats && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={() => setStats(null)}>
          <Card className="rounded-2xl p-4 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="font-black text-sm mb-1">📊 {stats.test.title}</p>
            {!stats.data ? <div className="py-8 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div> : (
              <>
                <div className="grid grid-cols-3 gap-2 my-2 text-center">
                  <div className="bg-muted rounded-xl py-2"><p className="font-black">{stats.data.total}</p><p className="text-[9px] uppercase text-muted-foreground">Attempts</p></div>
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl py-2"><p className="font-black text-emerald-600">{stats.data.passed}</p><p className="text-[9px] uppercase text-muted-foreground">Passed</p></div>
                  <div className="bg-rose-50 dark:bg-rose-950/40 rounded-xl py-2"><p className="font-black text-rose-600">{stats.data.failed}</p><p className="text-[9px] uppercase text-muted-foreground">Failed</p></div>
                </div>
                <div className="space-y-1 mt-2">
                  {stats.data.attempts.slice(0, 100).map(a => (
                    <div key={a.id} className="flex items-center justify-between text-[11px] border-b py-1">
                      <span className="truncate flex-1">{a.userName} · {a.userMobile}</span>
                      <span className={`font-bold ${a.passed ? 'text-emerald-600' : 'text-rose-600'}`}>{a.percentage}%</span>
                      <span className="ml-2 font-mono text-[9px] text-muted-foreground">{a.certificateId || '—'}</span>
                    </div>
                  ))}
                  {stats.data.attempts.length === 0 && <p className="text-center text-[11px] text-muted-foreground py-3">No attempts yet</p>}
                </div>
              </>
            )}
            <Button variant="outline" className="w-full rounded-xl mt-3" onClick={() => setStats(null)}>Close</Button>
          </Card>
        </div>
      )}

      {/* Editor */}
      <Card className="p-4 rounded-2xl border-2">
        <div className="flex items-center justify-between mb-3">
          <p className="font-extrabold text-base">{editingId ? '✏️ Edit Test' : '➕ Create Monthly Test'}</p>
          {editingId && <Button size="sm" variant="ghost" className="text-xs" onClick={reset}>Cancel edit</Button>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label className="text-xs font-bold">Test Title *</Label><Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="MCM ଜ୍ଞାନ ପରୀକ୍ଷା — ..." className="mt-1 rounded-xl" /></div>
          <div><Label className="text-xs font-bold">Month (Odia)</Label><Input value={form.monthLabel} onChange={e => set('monthLabel', e.target.value)} placeholder="ଅକ୍ଟୋବର ୨୦୨୬" className="mt-1 rounded-xl" /></div>
          <div><Label className="text-xs font-bold">Month (English)</Label><Input value={form.monthEn} onChange={e => set('monthEn', e.target.value)} placeholder="October 2026" className="mt-1 rounded-xl" /></div>
          <div><Label className="text-xs font-bold">Sort order</Label><Input type="number" value={form.order} onChange={e => set('order', e.target.value)} placeholder="202610" className="mt-1 rounded-xl" /></div>
          <div><Label className="text-xs font-bold">Duration (min)</Label><Input type="number" value={form.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} className="mt-1 rounded-xl" /></div>
          <div><Label className="text-xs font-bold">Passing %</Label><Input type="number" value={form.passingPercentage} onChange={e => set('passingPercentage', e.target.value)} className="mt-1 rounded-xl" /></div>
          <div><Label className="text-xs font-bold">Certificate title</Label><Input value={form.certificateTitle} onChange={e => set('certificateTitle', e.target.value)} className="mt-1 rounded-xl" /></div>
          <div className="col-span-2"><Label className="text-xs font-bold">Instructions (Odia)</Label><Textarea value={form.instructions} onChange={e => set('instructions', e.target.value)} className="mt-1 rounded-xl h-16 text-xs" /></div>
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <Label className="text-xs font-bold">Questions ({questions.length})</Label>
              <div className="inline-flex rounded-full bg-muted p-0.5">
                <button type="button" onClick={() => switchMode('builder')} className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 ${qMode === 'builder' ? 'bg-background shadow' : 'text-muted-foreground'}`}>
                  <ListChecks className="w-3.5 h-3.5" /> Builder
                </button>
                <button type="button" onClick={() => switchMode('json')} className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 ${qMode === 'json' ? 'bg-background shadow' : 'text-muted-foreground'}`}>
                  <Code2 className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
            </div>

            {qMode === 'json' ? (
              <>
                <p className="text-[10px] text-muted-foreground mb-1">Array of {`{ q, options[], correctIndex (0-based), marks, explanation }`}</p>
                <Textarea value={form.questionsJson} onChange={e => set('questionsJson', e.target.value)} className="mt-1 rounded-xl h-48 font-mono text-[11px]" spellCheck={false} />
              </>
            ) : (
              <div className="space-y-3">
                {questions.map((q, qi) => (
                  <div key={qi} className="rounded-2xl border-2 border-muted p-3 bg-muted/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600">
                        <GripVertical className="w-3.5 h-3.5 opacity-50" /> Question {qi + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg" title="Duplicate" onClick={() => duplicateQuestion(qi)}><Copy className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg text-rose-600" title="Delete" onClick={() => removeQuestion(qi)} disabled={questions.length <= 1}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <Textarea value={q.q} onChange={e => updateQ(qi, { q: e.target.value })} placeholder="Type the question here…" className="rounded-xl h-16 text-xs" />
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Options — tap ⭘ to mark the correct answer</p>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <button type="button" onClick={() => updateQ(qi, { correctIndex: oi })} title="Mark correct"
                            className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${q.correctIndex === oi ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted-foreground/40 text-transparent'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[11px] font-bold w-4 text-muted-foreground">{String.fromCharCode(65 + oi)}</span>
                          <Input value={opt} onChange={e => setOption(qi, oi, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                            className={`rounded-xl h-9 text-xs flex-1 ${q.correctIndex === oi ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' : ''}`} />
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-lg text-rose-500" title="Remove option" onClick={() => removeOption(qi, oi)} disabled={q.options.length <= 2}><X className="w-3.5 h-3.5" /></Button>
                        </div>
                      ))}
                      {q.options.length < 6 && (
                        <Button size="sm" variant="outline" className="rounded-full text-[10px] h-7 mt-1" onClick={() => addOption(qi)}><Plus className="w-3 h-3 mr-1" />Add option</Button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div className="col-span-1"><Label className="text-[10px] font-bold">Marks</Label><Input type="number" min="1" value={q.marks} onChange={e => updateQ(qi, { marks: e.target.value })} className="mt-0.5 rounded-xl h-8 text-xs" /></div>
                      <div className="col-span-2"><Label className="text-[10px] font-bold">Explanation (optional)</Label><Input value={q.explanation} onChange={e => updateQ(qi, { explanation: e.target.value })} placeholder="Shown after submit" className="mt-0.5 rounded-xl h-8 text-xs" /></div>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="rounded-full font-bold w-full border-dashed border-2" onClick={addQuestion}><Plus className="w-4 h-4 mr-1" />Add Question</Button>
              </div>
            )}
          </div>
          <div className="col-span-2 flex justify-end">
            <Button disabled={busy} onClick={save} className="rounded-xl font-bold">{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}{editingId ? 'Update Test' : 'Create Test'}</Button>
          </div>
        </div>
      </Card>

      {/* List */}
      <Card className="p-4 rounded-2xl border-2">
        <div className="flex items-center justify-between mb-3">
          <p className="font-extrabold text-sm">🧠 All MCM Tests</p>
          <Button size="sm" variant="ghost" className="text-xs" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
        </div>
        {tests === null && <div className="py-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}
        {tests && tests.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">No tests yet.</p>}
        {tests && tests.map(t => (
          <div key={t.id} className={`rounded-xl border p-3 mb-2 ${t.archived ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-xs truncate">{t.title}</p>
                <p className="text-[10px] text-muted-foreground">{t.monthEn || t.monthLabel} · {t.questionCount} Q · {t.passingPercentage}% pass · {t.durationMinutes}m · 👥 {t.attempts} attempts ({t.passed} passed)</p>
                <div className="flex items-center gap-1 mt-1">
                  {t.archived ? <Badge className="text-[8px] h-4 px-1.5 border-0 bg-slate-500/15 text-slate-600">Archived</Badge>
                    : t.published ? <Badge className="text-[8px] h-4 px-1.5 border-0 bg-emerald-500/15 text-emerald-700"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Active</Badge>
                      : <Badge className="text-[8px] h-4 px-1.5 border-0 bg-amber-500/15 text-amber-700">Draft</Badge>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              <Button size="sm" variant="outline" className="text-[10px] h-7 rounded-lg" onClick={() => openStats(t)}><BarChart3 className="w-3 h-3 mr-1" />Stats</Button>
              <Button size="sm" variant="outline" className="text-[10px] h-7 rounded-lg" onClick={() => startEdit(t)}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
              {!t.archived && (t.published
                ? <Button size="sm" variant="outline" className="text-[10px] h-7 rounded-lg" onClick={() => act(t, 'unpublish')}><EyeOff className="w-3 h-3 mr-1" />Unpublish</Button>
                : <Button size="sm" className="text-[10px] h-7 rounded-lg bg-emerald-600" onClick={() => act(t, 'publish')}><Eye className="w-3 h-3 mr-1" />Publish (make active)</Button>)}
              {!t.archived && <Button size="sm" variant="outline" className="text-[10px] h-7 rounded-lg text-rose-600" onClick={() => act(t, 'archive')}><Archive className="w-3 h-3 mr-1" />Archive</Button>}
            </div>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground mt-1">ℹ️ Publishing a test automatically makes it the only active one. Old months are archived, never deleted — results & certificates are always kept.</p>
      </Card>
    </div>
  )
}

export default AdminMcmTestTab
