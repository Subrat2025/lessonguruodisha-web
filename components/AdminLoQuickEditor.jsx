'use client'
/**
 * AdminLoQuickEditor — compact modal for editing LO Codes from inside any
 * Lesson Period detail view.
 *
 * REUSES the existing canonical Admin LO Code Correction backend:
 *   GET  /api/admin/lo-correction/lesson/:id
 *   POST /api/admin/lo-correction/lesson/:id/subject   { subject, reason }
 *   POST /api/admin/lo-correction/lesson/:id/codes     { loCodes, reason, expectedCurrentCodes, overrideCanonicalCheck? }
 *
 * No new endpoints.  No new data source.  No fuzzy inference.  Every write
 * is validated against the official loCodes collection and logged into the
 * loCodeCorrections audit collection.  CAS-protected via expectedCurrentCodes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2, Save, X, Search, AlertTriangle, CheckCircle2, ShieldCheck, Info, RefreshCw, Trash2 } from 'lucide-react'

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
    err.data = j; err.status = res.status
    throw err
  }
  return j
}

const OFFICIAL_SUBJECTS = ['Mathematics','Odia','English','Social Science','Science','EVS','CD','LLD','PD','SED','ACD','PLH','Arts','General']
const BALVATIKA_TABS   = ['CD','LLD','PD','SED','ACD','PLH','Arts']

export default function AdminLoQuickEditor({ open, onOpenChange, lessonId, onSaved }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  // Step 1 — subject (picker only; save happens atomically in saveCodes)
  const [pickedSubject, setPickedSubject] = useState('')

  // Step 2 — codes
  const [selectedCodes, setSelectedCodes] = useState([])
  const [activeDomain, setActiveDomain] = useState('')
  const [codeSearch, setCodeSearch] = useState('')
  const [saveReason, setSaveReason] = useState('')
  const [savingCodes, setSavingCodes] = useState(false)
  const [overrideCanonicalCheck, setOverrideCanonicalCheck] = useState(false)

  const load = useCallback(async () => {
    if (!lessonId) return
    setLoading(true)
    try {
      const r = await call('/admin/lo-correction/lesson/' + lessonId)
      setDetail(r)
      setSelectedCodes(r.lesson.loCodes || [])
      if (r.canonicalSubject && r.canonicalSubject !== 'REVIEW REQUIRED') setPickedSubject(r.canonicalSubject)
      if (r.lesson.classInt === 0) {
        const firstDom = r.poolSubjects.find(s => BALVATIKA_TABS.includes(s)) || 'CD'
        setActiveDomain(firstDom)
      } else {
        setActiveDomain(r.poolSubjects[0] || '')
      }
      setCodeSearch('')
      setSaveReason('')
      setOverrideCanonicalCheck(false)
    } catch (e) { toast.error('Failed to load: ' + e.message) }
    setLoading(false)
  }, [lessonId])

  useEffect(() => { if (open && lessonId) load() }, [open, lessonId, load])

  const toggleCode = (code) => {
    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])
  }

  const saveCodes = async () => {
    if (saveReason.trim().length < 5) { toast.error('Reason must be at least 5 characters'); return }
    // If canonical subject is missing, admin must have picked one from the subject selector.
    if (detail.requiresCanonicalSelection && !pickedSubject) {
      toast.error('Please select a canonical subject/domain first')
      return
    }
    setSavingCodes(true)
    try {
      const payload = {
        loCodes: selectedCodes,
        reason: saveReason.trim(),
        expectedCurrentCodes: detail.lesson.loCodes,
        overrideCanonicalCheck,
      }
      // Send `subject` only when the lesson has no canonical yet.  This keeps
      // existing lesson.subject untouched when it is already correct.
      if (detail.requiresCanonicalSelection && pickedSubject) {
        payload.subject = pickedSubject
      }
      const res = await call('/admin/lo-correction/lesson/' + lessonId + '/codes', {
        method: 'POST',
        body: payload,
      })
      const msg = res.subjectChanged
        ? `✅ Canonical subject set to ${res.subject}; ${res.newLoCodes.length} LO Code(s) saved.`
        : `✅ LO Codes updated successfully (${res.newLoCodes.length})`
      toast.success(msg)
      onSaved?.(res.newLoCodes)
      onOpenChange(false)
    } catch (e) {
      if (e.status === 409) {
        toast.error('⚠️ This lesson was updated by another administrator. Please refresh and review the latest LO Codes before saving.')
        await load()
      } else if (e.data?.code === 'CANONICAL_SUBJECT_REQUIRED') {
        toast.error('⚠️ This lesson does not have a canonical subject yet. Please select the correct subject/domain first.')
        // Reload so the amber Step-1 selector becomes visible
        await load()
      } else {
        toast.error('Save failed: ' + e.message)
      }
    }
    setSavingCodes(false)
  }

  const activePool = detail?.eligiblePool?.[activeDomain] || []
  const filteredPool = useMemo(() => {
    if (!codeSearch.trim()) return activePool
    const s = codeSearch.toLowerCase()
    return activePool.filter(c => (c.code || '').toLowerCase().includes(s) || (c.description || '').toLowerCase().includes(s))
  }, [activePool, codeSearch])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            🎯 Edit Learning Outcome Codes
            <Badge variant="secondary" className="text-[10px] font-normal">Official dataset only</Badge>
            <Badge variant="secondary" className="text-[10px] font-normal">Audited</Badge>
          </DialogTitle>
        </DialogHeader>

        {loading || !detail ? (
          <div className="text-xs text-center py-10 text-muted-foreground flex-1">
            <Loader2 className="w-5 h-5 inline animate-spin" /> Loading lesson…
          </div>
        ) : (
          <div className="space-y-3 flex-1 overflow-auto pr-1">
            {/* Header context */}
            <div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                <Badge variant="secondary" className="text-[10px]">{detail.lesson.className}</Badge>
                <span>›</span>
                <Badge variant="secondary" className="text-[10px]">{detail.lesson.bookName || '(no book)'}</Badge>
                {detail.lesson.chapterName && <>
                  <span>›</span>
                  <Badge variant="secondary" className="text-[10px]">{detail.lesson.chapterName}</Badge>
                </>}
                {detail.lesson.period != null && <>
                  <span>›</span>
                  <Badge variant="secondary" className="text-[10px]">Period {detail.lesson.period}</Badge>
                </>}
              </div>
              <div className="mt-1 font-bold text-sm">{detail.lesson.title}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] flex-wrap">
                <span>Canonical Subject:</span>
                <Badge className="text-[10px] bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100">{detail.canonicalSubject}</Badge>
                <span className="text-muted-foreground text-[10px]">(source: {detail.canonicalSubjectSource})</span>
              </div>
            </div>

            {/* Lesson context — collapsible */}
            <details className="text-xs rounded-lg border bg-muted/30">
              <summary className="cursor-pointer font-semibold p-2 flex items-center gap-1">
                <Info className="w-3 h-3" /> Lesson Context — learning outcomes, panchapadi, content
              </summary>
              <div className="p-2 border-t space-y-2 border-l-2 border-primary/30">
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
                {detail.lesson.panchapadi && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Panchapadi steps present</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {['sikhana','anweshana','alochana','prayoga','mulyayana'].filter(k => detail.lesson.panchapadi?.[k]).join(' · ') || '(none)'}
                    </div>
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
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Content preview</div>
                    <div className="mt-1 prose prose-sm max-w-none max-h-40 overflow-auto" dangerouslySetInnerHTML={{ __html: detail.lesson.content }} />
                  </div>
                )}
              </div>
            </details>

            {/* STEP 1 — Canonical subject (only when truly missing) */}
            {detail.requiresCanonicalSelection && (
              <div className="p-3 rounded-xl border-2 border-amber-300 bg-amber-50/60">
                <div className="text-xs font-bold flex items-center gap-1 text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5" /> Canonical subject not assigned
                </div>
                <div className="text-[11px] mt-1 text-amber-800">
                  This lesson has no canonical subject yet.  Pick the correct subject/domain based on THIS lesson&apos;s actual learning outcome.  It will be saved together with the LO Codes below in ONE action.
                </div>
                <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                  {(detail.lesson.classInt === 0 ? BALVATIKA_TABS : OFFICIAL_SUBJECTS).map(s => (
                    <Button key={s} size="sm" variant={pickedSubject === s ? 'default' : 'outline'} onClick={() => { setPickedSubject(s); setActiveDomain(s) }} className="h-7 text-[10px] px-2">
                      {s}
                    </Button>
                  ))}
                </div>
                {pickedSubject && (
                  <div className="mt-2 text-[10px] text-amber-800">
                    Selected: <Badge className="text-[10px] bg-amber-200 text-amber-900 hover:bg-amber-200">{pickedSubject}</Badge>
                    <span className="ml-1">→ Now pick LO Code(s) below and click Save.</span>
                  </div>
                )}
              </div>
            )}

            {/* Current LO Codes */}
            <div>
              <div className="text-xs font-bold flex items-center gap-1 mb-1"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> Current LO Codes</div>
              {detail.currentLoCodeDetail.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">No LO Codes assigned yet.</div>
              ) : (
                <div className="space-y-1">
                  {detail.currentLoCodeDetail.map(c => {
                    const stillSelected = selectedCodes.includes(c.code)
                    return (
                      <div key={c.ref} className={`text-[11px] rounded border p-1.5 flex items-start gap-2 ${!c.valid ? 'border-rose-300 bg-rose-50' : stillSelected ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 bg-slate-50/40 opacity-60'}`}>
                        <Badge className={`text-[9px] ${c.valid ? 'bg-slate-100 hover:bg-slate-100 text-slate-900' : 'bg-rose-100 text-rose-800 hover:bg-rose-100'}`}>{c.code}</Badge>
                        {c.valid ? (
                          <>
                            <Badge variant="outline" className="text-[9px]">{c.subject}</Badge>
                            <Badge variant="outline" className="text-[9px]">Class {c.class}</Badge>
                            <span className="flex-1 text-[10px]">{c.description}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-rose-800 flex-1">Not found in official dataset (legacy/invalid)</span>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => toggleCode(c.code)} className="h-6 px-1.5 text-[10px]">
                          {stillSelected ? <><Trash2 className="w-3 h-3 mr-0.5" />Remove</> : '+ Add back'}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* STEP 2 — Add / pick LO Codes */}
            <div className="p-3 rounded-xl border-2 border-blue-300 bg-blue-50/40">
              <div className="text-xs font-bold flex items-center gap-1 text-blue-900">
                <Search className="w-3.5 h-3.5" /> {detail.requiresCanonicalSelection ? 'STEP 2 — ' : ''}Add LO Code
              </div>
              <div className="text-[11px] mt-1 text-blue-800">
                Read each official LO description carefully. Do NOT pick a code just because it matches the class/subject.
              </div>

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
                <Input value={codeSearch} onChange={e => setCodeSearch(e.target.value)} className="h-7 text-xs" placeholder="Search by code or description…" />
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{filteredPool.length} / {activePool.length}</span>
              </div>

              <div className="mt-2 max-h-56 overflow-auto space-y-1 pr-1">
                {filteredPool.length === 0 ? (
                  <div className="text-[11px] text-center text-muted-foreground py-3">No LO Codes in this domain.</div>
                ) : filteredPool.map(c => {
                  const selected = selectedCodes.includes(c.code)
                  return (
                    <label key={c.id} className={`flex items-start gap-2 text-[11px] rounded border p-1.5 cursor-pointer hover:bg-muted transition ${selected ? 'bg-primary/10 border-primary' : 'border-border'}`}>
                      <input type="checkbox" checked={selected} onChange={() => toggleCode(c.code)} className="mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge className="text-[9px] bg-slate-100 hover:bg-slate-100 text-slate-900">{c.code}</Badge>
                          <Badge variant="outline" className="text-[9px]">{c.subject}</Badge>
                          <Badge variant="outline" className="text-[9px]">Class {c.class}</Badge>
                        </div>
                        <div className="mt-0.5 leading-snug">{c.description}</div>
                      </div>
                    </label>
                  )
                })}
              </div>

              {/* Selected preview */}
              <div className="mt-2 border-t pt-2">
                <div className="text-[11px] font-semibold">Selected ({selectedCodes.length})</div>
                {selectedCodes.length === 0 ? (
                  <div className="text-[10px] text-muted-foreground mt-0.5">None selected. Saving with 0 codes will remove all LO Codes from this lesson.</div>
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
                <Textarea value={saveReason} onChange={e => setSaveReason(e.target.value)} className="text-xs min-h-[50px]" placeholder="e.g. Replaced with CD 7.1.1 which matches 'recognizes numbers 1-3' outcome of the lesson." />
              </div>

              <div className="mt-2 flex items-center gap-2 text-[10px]">
                <input type="checkbox" id="qov" checked={overrideCanonicalCheck} onChange={e => setOverrideCanonicalCheck(e.target.checked)} />
                <label htmlFor="qov" className="cursor-pointer">Override canonical subject check (use only for Balvatika cross-domain codes)</label>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 mt-2 border-t flex items-center gap-2 shrink-0">
          <div className="text-[10px] text-muted-foreground flex-1 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Validated against the official LO Code dataset · Audited · CAS-protected
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-8 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Reload
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveCodes} disabled={loading || savingCodes || !detail || saveReason.trim().length < 5} className="h-8 text-xs">
            {savingCodes ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
            Save LO Codes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
