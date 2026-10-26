'use client'
/**
 * Admin → LO Code Correction (Step E)
 *
 * Two-step correction flow:
 *   1) Canonical Subject — if missing/sentinel, admin confirms subject (Balvatika: pick one of six domains)
 *   2) LO Codes — admin picks correct code(s) from the OFFICIAL eligible pool
 *
 * Every save is logged to /api/admin/lo-corrections with actor + old/new + reason.
 * No fuzzy inference. No Gemini. No auto-selection.  Codes are ONLY resolved
 * against the official loCodes collection.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Search, CheckCircle2, AlertTriangle, ChevronRight, History, Save, X, BookOpen, FileText, Info, ShieldCheck } from 'lucide-react'

const call = async (url, opts = {}) => {
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
  if (!res.ok) {
    const err = new Error(j?.error || `HTTP ${res.status}`)
    err.data = j
    err.status = res.status
    throw err
  }
  return j
}

const STATUS_STYLES = {
  KEEP:   { label: '✓ KEEP',   className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  REMAP:  { label: '⚠ REMAP',  className: 'bg-amber-100  text-amber-800  border-amber-300' },
  REVIEW: { label: '? REVIEW', className: 'bg-rose-100   text-rose-800   border-rose-300' },
}

const OFFICIAL_SUBJECTS = ['Mathematics','Odia','English','Social Science','Science','EVS','CD','LLD','PD','SED','ACD','PLH','Arts','General']
const BALVATIKA_TABS   = ['CD','LLD','PD','SED','ACD','PLH','Arts']

export default function AdminLoCorrection() {
  const [classes, setClasses] = useState([])
  const [books, setBooks] = useState([])
  const [filters, setFilters] = useState({ classId: '', bookId: '', subject: '', q: '', status: 'ALL' })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [history, setHistory] = useState([])

  // Step-1 state (canonical subject selection)
  const [pickedSubject, setPickedSubject] = useState('')
  const [subjectReason, setSubjectReason] = useState('')
  const [savingSubject, setSavingSubject] = useState(false)

  // Step-2 state (LO Codes)
  const [selectedCodes, setSelectedCodes] = useState([])
  const [activeDomain, setActiveDomain] = useState('') // Balvatika tab
  const [codeSearch, setCodeSearch] = useState('')
  const [saveReason, setSaveReason] = useState('')
  const [savingCodes, setSavingCodes] = useState(false)
  const [overrideCanonicalCheck, setOverrideCanonicalCheck] = useState(false)

  const loadBootstrap = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([
        call('/classes'),
        call('/books'),
      ])
      setClasses(c.classes || c || [])
      setBooks(b.books || b || [])
    } catch (e) { toast.error('Failed to load classes/books: ' + e.message) }
  }, [])

  const loadLessons = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'ALL') qs.set(k, v) })
      const r = await call('/admin/lo-correction/lessons?' + qs.toString())
      setRows(r.rows || [])
    } catch (e) { toast.error('Failed to load lessons: ' + e.message); setRows([]) }
    setLoading(false)
  }, [filters])

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return }
    setDetailLoading(true)
    setDetail(null)
    setPickedSubject('')
    setSubjectReason('')
    setSelectedCodes([])
    setSaveReason('')
    setActiveDomain('')
    setCodeSearch('')
    setOverrideCanonicalCheck(false)
    try {
      const r = await call('/admin/lo-correction/lesson/' + id)
      setDetail(r)
      // seed selected codes from current lesson (so admin sees & can adjust)
      setSelectedCodes(r.lesson.loCodes || [])
      // Prefill picked subject with canonical if it's real, otherwise blank
      if (r.canonicalSubject && r.canonicalSubject !== 'REVIEW REQUIRED') setPickedSubject(r.canonicalSubject)
      // default active domain for balvatika
      if (r.lesson.classInt === 0) {
        const firstDom = r.poolSubjects.find(s => BALVATIKA_TABS.includes(s)) || 'CD'
        setActiveDomain(firstDom)
      } else {
        setActiveDomain(r.poolSubjects[0] || '')
      }
      // Load history
      try {
        const h = await call('/admin/lo-corrections?lessonId=' + id + '&limit=50')
        setHistory(h.rows || [])
      } catch { setHistory([]) }
    } catch (e) { toast.error('Failed to load lesson: ' + e.message) }
    setDetailLoading(false)
  }, [])

  useEffect(() => { loadBootstrap() }, [loadBootstrap])
  useEffect(() => { loadLessons() }, [loadLessons])
  useEffect(() => { if (selectedId) loadDetail(selectedId) }, [selectedId, loadDetail])

  const toggleCode = (code) => {
    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const saveSubject = async () => {
    if (!pickedSubject) { toast.error('Please pick a subject first'); return }
    if (subjectReason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setSavingSubject(true)
    try {
      await call('/admin/lo-correction/lesson/' + selectedId + '/subject', {
        method: 'POST',
        body: { subject: pickedSubject, reason: subjectReason.trim() },
      })
      toast.success('Canonical subject saved: ' + pickedSubject)
      setSubjectReason('')
      await loadDetail(selectedId)
      await loadLessons()
    } catch (e) { toast.error('Save failed: ' + e.message) }
    setSavingSubject(false)
  }

  const saveCodes = async () => {
    if (saveReason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    setSavingCodes(true)
    try {
      await call('/admin/lo-correction/lesson/' + selectedId + '/codes', {
        method: 'POST',
        body: {
          loCodes: selectedCodes,
          reason: saveReason.trim(),
          expectedCurrentCodes: detail.lesson.loCodes,
          overrideCanonicalCheck,
        },
      })
      toast.success('LO Codes saved (' + selectedCodes.length + ')')
      setSaveReason('')
      await loadDetail(selectedId)
      await loadLessons()
    } catch (e) {
      if (e.status === 409) toast.error('Someone else modified this lesson. Reload and try again.')
      else toast.error('Save failed: ' + e.message)
    }
    setSavingCodes(false)
  }

  const activePool = detail?.eligiblePool?.[activeDomain] || []
  const filteredPool = useMemo(() => {
    if (!codeSearch.trim()) return activePool
    const s = codeSearch.toLowerCase()
    return activePool.filter(c => (c.code || '').toLowerCase().includes(s) || (c.description || '').toLowerCase().includes(s))
  }, [activePool, codeSearch])

  const bookOptionsForClass = useMemo(() => {
    if (!filters.classId) return books
    return (books || []).filter(b => b.classId === filters.classId)
  }, [books, filters.classId])

  return (
    <div className="space-y-3">
      <Card className="p-3 rounded-2xl border-2">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <div className="text-sm font-bold">LO Code Correction — Step E</div>
          <Badge variant="secondary" className="text-[10px]">No fuzzy inference</Badge>
          <Badge variant="secondary" className="text-[10px]">Gemini disabled</Badge>
          <Badge variant="secondary" className="text-[10px]">Official LO dataset only</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <div>
            <Label className="text-[10px]">Class</Label>
            <select value={filters.classId} onChange={e => setFilters(f => ({ ...f, classId: e.target.value, bookId: '' }))} className="w-full h-8 text-xs border rounded px-2">
              <option value="">All classes</option>
              {(classes || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px]">Book</Label>
            <select value={filters.bookId} onChange={e => setFilters(f => ({ ...f, bookId: e.target.value }))} className="w-full h-8 text-xs border rounded px-2">
              <option value="">All books</option>
              {(bookOptionsForClass || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px]">Canonical Subject</Label>
            <select value={filters.subject} onChange={e => setFilters(f => ({ ...f, subject: e.target.value }))} className="w-full h-8 text-xs border rounded px-2">
              <option value="">Any</option>
              {OFFICIAL_SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-[10px]">Status</Label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="w-full h-8 text-xs border rounded px-2">
              <option value="ALL">All</option>
              <option value="KEEP">✓ KEEP</option>
              <option value="REMAP">⚠ REMAP</option>
              <option value="REVIEW">? REVIEW</option>
            </select>
          </div>
          <div className="col-span-2 md:col-span-1">
            <Label className="text-[10px]">Search title</Label>
            <Input value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} className="h-8 text-xs" placeholder="e.g. Numbers" />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={loadLessons} className="h-8 text-xs">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3 mr-1" />} Search
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setFilters({ classId: '', bookId: '', subject: '', q: '', status: 'ALL' }) }} className="h-8 text-xs">
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* LEFT — lesson list */}
        <Card className="p-2 rounded-2xl border-2 lg:col-span-2 max-h-[80vh] overflow-auto">
          <div className="text-xs font-bold mb-2 flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5" /> Lessons ({rows.length})
          </div>
          {loading ? (
            <div className="text-xs text-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin" /> Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-xs text-center py-6 text-muted-foreground">No lessons match.</div>
          ) : (
            <div className="space-y-1.5">
              {rows.map(row => {
                const isActive = row.lessonId === selectedId
                const s = STATUS_STYLES[row.status] || STATUS_STYLES.REVIEW
                return (
                  <button key={row.lessonId} onClick={() => setSelectedId(row.lessonId)}
                    className={`w-full text-left rounded-lg border p-2 text-xs hover:bg-muted transition ${isActive ? 'bg-primary/10 border-primary' : 'border-border'}`}>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[9px] px-1.5 py-0 ${s.className}`}>{s.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">{row.className}</span>
                      <span className="text-[10px] text-muted-foreground">•</span>
                      <span className="text-[10px] text-muted-foreground truncate">{row.bookName}</span>
                    </div>
                    <div className="mt-1 font-semibold line-clamp-2">{row.title}</div>
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <span className="text-[10px]">Canonical:</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{row.canonicalSubject}</Badge>
                      {row.subjectStored && row.subjectStored !== row.canonicalSubject && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-50">stored: {row.subjectStored}</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <span className="text-[10px]">Codes:</span>
                      {row.currentLoCodes.length === 0
                        ? <Badge variant="outline" className="text-[9px] px-1 py-0 bg-rose-50">none</Badge>
                        : row.currentLoCodes.slice(0, 4).map(c => <Badge key={c} variant="outline" className="text-[9px] px-1 py-0">{c}</Badge>)}
                      {row.currentLoCodes.length > 4 && <span className="text-[9px] text-muted-foreground">+{row.currentLoCodes.length - 4}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* RIGHT — lesson detail */}
        <Card className="p-3 rounded-2xl border-2 lg:col-span-3 max-h-[80vh] overflow-auto">
          {detailLoading ? (
            <div className="text-xs text-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin" /> Loading lesson…</div>
          ) : !detail ? (
            <div className="text-xs text-center py-10 text-muted-foreground">Select a lesson from the left to review.</div>
          ) : (
            <div className="space-y-3">
              {/* Header */}
              <div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                  <Badge variant="secondary">{detail.lesson.className}</Badge>
                  <ChevronRight className="w-3 h-3" />
                  <Badge variant="secondary">{detail.lesson.bookName}</Badge>
                  {detail.lesson.chapterName && <><ChevronRight className="w-3 h-3" /><Badge variant="secondary">{detail.lesson.chapterName}</Badge></>}
                  {detail.lesson.period != null && <><ChevronRight className="w-3 h-3" /><Badge variant="secondary">Period {detail.lesson.period}</Badge></>}
                </div>
                <div className="mt-1 font-bold text-sm">{detail.lesson.title}</div>
                <div className="mt-1 flex items-center gap-2 text-[10px] flex-wrap">
                  <span>Canonical Subject:</span>
                  <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-300">{detail.canonicalSubject}</Badge>
                  <span className="text-muted-foreground">(source: {detail.canonicalSubjectSource})</span>
                </div>
              </div>

              {/* Lesson content preview */}
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold flex items-center gap-1"><FileText className="w-3 h-3" /> Lesson content, learning outcomes & Panchapadi</summary>
                <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
                  {detail.lesson.learningOutcomes?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Learning Outcomes</div>
                      <ul className="mt-1 list-disc pl-4 space-y-0.5">
                        {detail.lesson.learningOutcomes.map((lo, i) => <li key={i}>{lo}</li>)}
                      </ul>
                    </div>
                  )}
                  {detail.lesson.tlm?.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">TLM</div>
                      <div className="mt-1">{detail.lesson.tlm.join(', ')}</div>
                    </div>
                  )}
                  {detail.lesson.teacherNotes && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Teacher Notes</div>
                      <div className="mt-1 whitespace-pre-wrap">{detail.lesson.teacherNotes}</div>
                    </div>
                  )}
                  {detail.lesson.content && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Content</div>
                      <div className="mt-1 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: detail.lesson.content }} />
                    </div>
                  )}
                </div>
              </details>

              {/* STEP 1 — Canonical subject */}
              {detail.requiresCanonicalSelection && (
                <Card className="p-3 rounded-xl border-2 border-amber-300 bg-amber-50/50">
                  <div className="text-xs font-bold flex items-center gap-1 text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5" /> STEP 1 — Confirm Canonical Subject
                  </div>
                  <div className="text-[11px] mt-1 text-amber-800">
                    Book evidence is insufficient / Balvatika mixed workbook.  Based on THIS lesson&apos;s content, pick the correct subject/domain.
                  </div>
                  <div className="mt-2 grid grid-cols-3 md:grid-cols-4 gap-1.5">
                    {(detail.lesson.classInt === 0 ? BALVATIKA_TABS : OFFICIAL_SUBJECTS).map(s => (
                      <Button key={s} size="sm" variant={pickedSubject === s ? 'default' : 'outline'} onClick={() => setPickedSubject(s)} className="h-7 text-[10px]">
                        {s}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-2">
                    <Label className="text-[10px]">Reason (min 5 chars) *</Label>
                    <Input value={subjectReason} onChange={e => setSubjectReason(e.target.value)} className="h-8 text-xs" placeholder="e.g. Lesson learning outcome ‘recognizes numbers up to 3’ matches CD domain 7.x" />
                  </div>
                  <Button size="sm" className="mt-2 h-7 text-xs" disabled={savingSubject || !pickedSubject || subjectReason.trim().length < 5} onClick={saveSubject}>
                    {savingSubject ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />} Save canonical subject
                  </Button>
                </Card>
              )}

              {/* Current LO Codes */}
              <div>
                <div className="text-xs font-bold flex items-center gap-1"><Info className="w-3 h-3" /> Currently saved LO Codes</div>
                {detail.currentLoCodeDetail.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground mt-1">No LO Codes assigned.</div>
                ) : (
                  <div className="mt-1 space-y-1">
                    {detail.currentLoCodeDetail.map(c => (
                      <div key={c.ref} className={`text-[11px] rounded border p-1.5 flex items-start gap-2 ${c.valid ? 'border-border' : 'border-rose-300 bg-rose-50'}`}>
                        <Badge className={`text-[9px] ${c.valid ? 'bg-slate-100' : 'bg-rose-100 text-rose-800'}`}>{c.code}</Badge>
                        {c.valid ? (
                          <>
                            <Badge variant="outline" className="text-[9px]">{c.subject}</Badge>
                            <Badge variant="outline" className="text-[9px]">Class {c.class}</Badge>
                            <span className="flex-1 text-[10px]">{c.description}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-rose-800">Not found in official dataset (legacy/invalid)</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* STEP 2 — Pick LO Codes */}
              <Card className="p-3 rounded-xl border-2 border-blue-300 bg-blue-50/40">
                <div className="text-xs font-bold flex items-center gap-1 text-blue-900">
                  <CheckCircle2 className="w-3.5 h-3.5" /> STEP 2 — Select correct LO Code(s)
                </div>
                <div className="text-[11px] mt-1 text-blue-800">
                  Read each LO description carefully.  Do NOT select a code just because it matches the subject/class.
                </div>

                {/* Domain tabs (only if multiple subjects in pool) */}
                {detail.poolSubjects.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {detail.poolSubjects.map(s => (
                      <Button key={s} size="sm" variant={activeDomain === s ? 'default' : 'outline'} onClick={() => setActiveDomain(s)} className="h-6 px-2 text-[10px]">
                        {s} ({(detail.eligiblePool[s] || []).length})
                      </Button>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <Input value={codeSearch} onChange={e => setCodeSearch(e.target.value)} className="h-7 text-xs" placeholder="Filter by code or description…" />
                  <span className="text-[10px] text-muted-foreground">{filteredPool.length} / {activePool.length}</span>
                </div>

                <div className="mt-2 max-h-64 overflow-auto space-y-1 pr-1">
                  {filteredPool.length === 0 ? (
                    <div className="text-[11px] text-center text-muted-foreground py-4">No LO Codes in this domain.</div>
                  ) : filteredPool.map(c => {
                    const selected = selectedCodes.includes(c.code)
                    return (
                      <label key={c.id} className={`flex items-start gap-2 text-[11px] rounded border p-1.5 cursor-pointer hover:bg-muted transition ${selected ? 'bg-primary/10 border-primary' : 'border-border'}`}>
                        <input type="checkbox" checked={selected} onChange={() => toggleCode(c.code)} className="mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-1">
                            <Badge className="text-[9px] bg-slate-100">{c.code}</Badge>
                            <Badge variant="outline" className="text-[9px]">{c.subject}</Badge>
                            <Badge variant="outline" className="text-[9px]">Class {c.class}</Badge>
                          </div>
                          <div className="mt-0.5">{c.description}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>

                {/* Selected codes preview */}
                <div className="mt-2 border-t pt-2">
                  <div className="text-[11px] font-semibold">Selected ({selectedCodes.length})</div>
                  {selectedCodes.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground mt-0.5">None selected. (Saving with 0 codes will remove all LO Codes from this lesson.)</div>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedCodes.map(c => (
                        <Badge key={c} variant="outline" className="text-[10px] cursor-pointer hover:bg-rose-50" onClick={() => toggleCode(c)}>
                          {c} <X className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-2">
                  <Label className="text-[10px]">Reason for this correction (min 5 chars) *</Label>
                  <Textarea value={saveReason} onChange={e => setSaveReason(e.target.value)} className="text-xs min-h-[52px]" placeholder="e.g. Old codes (LLD 9.1.1) belonged to Language domain; this lesson is a numeracy lesson, so replaced with CD 7.1.1 which matches ‘recognizes numbers 1-3’ outcome." />
                </div>

                {/* Override checkbox (rare) */}
                <div className="mt-2 flex items-center gap-2 text-[10px]">
                  <input type="checkbox" id="override" checked={overrideCanonicalCheck} onChange={e => setOverrideCanonicalCheck(e.target.checked)} />
                  <label htmlFor="override" className="cursor-pointer">Override canonical subject check (use only for Class 0 cross-domain codes)</label>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" onClick={saveCodes} disabled={savingCodes || saveReason.trim().length < 5} className="h-8 text-xs">
                    {savingCodes ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />} Save LO Codes
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => loadDetail(selectedId)} className="h-8 text-xs">
                    <RefreshCw className="w-3 h-3 mr-1" /> Reload
                  </Button>
                </div>
              </Card>

              {/* History */}
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold flex items-center gap-1"><History className="w-3 h-3" /> Correction history ({history.length})</summary>
                <div className="mt-2 space-y-1.5">
                  {history.length === 0
                    ? <div className="text-[11px] text-muted-foreground">No corrections yet.</div>
                    : history.map(h => (
                      <div key={h.id} className="rounded border border-border p-1.5 text-[10px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="text-[9px] bg-slate-100">{h.action}</Badge>
                          <span className="text-muted-foreground">{new Date(h.timestamp).toLocaleString()}</span>
                          <span className="ml-auto text-muted-foreground">{h.actor?.name} ({h.actor?.mobile || '—'})</span>
                        </div>
                        {h.oldSubject !== h.newSubject && (
                          <div className="mt-1">Subject: <Badge variant="outline" className="text-[9px]">{h.oldSubject ?? '(missing)'}</Badge> → <Badge variant="outline" className="text-[9px]">{h.newSubject ?? '—'}</Badge></div>
                        )}
                        {(h.oldLoCodes || h.newLoCodes) && (
                          <div className="mt-1">Codes: <span className="text-rose-700">[{(h.oldLoCodes || []).join(', ') || '—'}]</span> → <span className="text-emerald-700">[{(h.newLoCodes || []).join(', ') || '—'}]</span></div>
                        )}
                        {h.reason && <div className="mt-1 italic">&ldquo;{h.reason}&rdquo;</div>}
                      </div>
                    ))}
                </div>
              </details>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
