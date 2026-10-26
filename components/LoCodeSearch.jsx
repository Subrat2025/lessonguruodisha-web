'use client'

import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search, RotateCcw, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// 🔎 Chapter-wise LO Code — cascading search
//   Class → Subject → Topic (Patha) → Period  ⇒  CG · Competency · LO · LLD
//   with the full detail/explanation of each code.
// Data comes from parsed Period Code Maps (collection loCodePeriods) via
// /api/lo-search/*. All options are populated from the UPLOADED files.
// =============================================================================

const CODE_STYLES = {
  cg: { label: 'Curricular Goal', odia: 'ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ', tag: 'CG', icon: '🎯', from: '#1D4ED8', to: '#4F8BFF', soft: '#EEF3FF', ink: '#12306E' },
  competency: { label: 'Competency', odia: 'ଦକ୍ଷତା', tag: 'C', icon: '⚡', from: '#059669', to: '#22C55E', soft: '#E7FBF1', ink: '#065F46' },
  lo: { label: 'Learning Outcome', odia: 'ଶିକ୍ଷଣ ଫଳାଫଳ', tag: 'LO', icon: '✅', from: '#EA580C', to: '#FBA529', soft: '#FFF5E8', ink: '#8A4600' },
  lld: { label: 'Range Outcome', odia: 'ପରିସର ଫଳାଫଳ', tag: 'LLD', icon: '📊', from: '#9333EA', to: '#D058EE', soft: '#FaEDFE', ink: '#6B0F7E' },
}

const Select = ({ value, onChange, disabled, placeholder, options, getKey, getVal, getLabel }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    className="w-full text-[13px] font-semibold border-2 rounded-xl px-3 h-11 bg-background disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
    style={{ fontSize: 16 }} // ≥16px avoids iOS zoom-on-focus
  >
    <option value="">{placeholder}</option>
    {options.map(o => <option key={getKey(o)} value={getVal(o)}>{getLabel(o)}</option>)}
  </select>
)

const CodeBlock = ({ kind, data, framework }) => {
  if (!data || !data.code) return null
  const s = CODE_STYLES[kind]
  return (
    <div className="rounded-2xl overflow-hidden shadow-md" style={{ border: `1.5px solid ${s.to}55` }}>
      {/* Vibrant gradient header */}
      <div className="px-3 py-2.5 flex items-center gap-2.5" style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }}>
        <span className="grid place-items-center w-9 h-9 rounded-xl text-[18px] shrink-0" style={{ background: 'rgba(255,255,255,.22)' }}>{s.icon}</span>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="text-white font-extrabold text-[13px] truncate">{s.label}</div>
          <div className="text-white/85 text-[10.5px] font-semibold truncate">{s.odia}</div>
        </div>
        <span className="font-mono font-black text-[14px] px-2.5 py-1 rounded-lg text-white shrink-0" style={{ background: 'rgba(255,255,255,.25)', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.45)' }}>{data.code}</span>
      </div>
      {/* Soft-tinted body with the explanation */}
      <div className="px-3.5 py-3" style={{ background: s.soft }}>
        {data.text && <p className="text-[13.5px] leading-relaxed font-medium" style={{ color: s.ink }}>{data.text}</p>}
        {framework && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fff', color: s.ink, border: `1px solid ${s.to}66` }}>
              framework · {framework}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const LoCodeSearch = ({ api }) => {
  const [open, setOpen] = useState(true)
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [topics, setTopics] = useState([])
  const [periods, setPeriods] = useState([])
  const [sel, setSel] = useState({ className: '', subject: '', topic: '', period: '' })
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState({ classes: true, detail: false })
  const [isAdmin, setIsAdmin] = useState(false)
  const [indexing, setIndexing] = useState(false)

  const call = async (path, opts) => {
    try { return await api(path, opts) } catch { return {} }
  }

  const loadClasses = async () => {
    const r = await call('/lo-search/classes')
    setClasses(r.classes || [])
    setLoading(l => ({ ...l, classes: false }))
  }

  useEffect(() => {
    loadClasses()
    // Know whether to offer the admin "Build index" action when empty.
    call('/auth/me').then(r => setIsAdmin((r?.user?.role || r?.role) === 'admin')).catch(() => {})
  }, [])

  const buildIndex = async () => {
    setIndexing(true)
    try {
      const r = await api('/lo-search/reindex', { method: 'POST', body: {} })
      if (r?.ok) {
        toast.success(`Search ready — indexed ${r.totalPeriods || 0} periods from ${r.indexed || 0} file(s).`)
        setLoading(l => ({ ...l, classes: true }))
        await loadClasses()
      } else {
        toast.error('Could not build the index.')
      }
    } catch (e) { toast.error(e?.message || 'Index build failed') }
    finally { setIndexing(false) }
  }

  // Cascade resets
  const pickClass = async (className) => {
    setSel({ className, subject: '', topic: '', period: '' }); setSubjects([]); setTopics([]); setPeriods([]); setDetail(null)
    if (!className) return
    const r = await call(`/lo-search/subjects?className=${encodeURIComponent(className)}`)
    setSubjects(r.subjects || [])
  }
  const pickSubject = async (subject) => {
    setSel(s => ({ ...s, subject, topic: '', period: '' })); setTopics([]); setPeriods([]); setDetail(null)
    if (!subject) return
    const r = await call(`/lo-search/topics?className=${encodeURIComponent(sel.className)}&subject=${encodeURIComponent(subject)}`)
    setTopics(r.topics || [])
  }
  const pickTopic = async (topic) => {
    setSel(s => ({ ...s, topic, period: '' })); setPeriods([]); setDetail(null)
    if (!topic) return
    const r = await call(`/lo-search/periods?className=${encodeURIComponent(sel.className)}&subject=${encodeURIComponent(sel.subject)}&topic=${encodeURIComponent(topic)}`)
    setPeriods(r.periods || [])
  }
  const pickPeriod = async (periodId) => {
    setSel(s => ({ ...s, period: periodId })); setDetail(null)
    if (!periodId) return
    setLoading(l => ({ ...l, detail: true }))
    const r = await call(`/lo-search/detail?id=${encodeURIComponent(periodId)}`)
    setDetail(r.detail || null)
    setLoading(l => ({ ...l, detail: false }))
  }

  const reset = () => { setSel({ className: '', subject: '', topic: '', period: '' }); setSubjects([]); setTopics([]); setPeriods([]); setDetail(null) }

  if (!loading.classes && classes.length === 0) {
    // No parsed maps yet. Admins can build the index in one tap (needed after a
    // fresh deploy where loCodePeriods is empty but the map file is uploaded).
    if (!isAdmin) return null
    return (
      <Card className="rounded-2xl border-2 border-dashed border-indigo-300 p-4 text-center">
        <div className="text-2xl">🔎</div>
        <p className="font-bold text-sm mt-1">Enable Code Search</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Build the period search index from the uploaded Chapter-wise LO map(s) so teachers can search
          Class → Subject → Topic → Period.
        </p>
        <button onClick={buildIndex} disabled={indexing}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 text-white text-[12px] font-black disabled:opacity-60">
          {indexing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {indexing ? 'Building…' : 'Build search index'}
        </button>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl border-2 border-indigo-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
        <Search className="w-4 h-4" />
        <span className="font-black text-sm flex-1 text-left">Find Codes by Period</span>
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="p-3 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] text-muted-foreground flex-1">
              Select <b>Class → Subject → Topic → Period</b> to see that period's CG, Competency, LO & Range codes with full details.
            </p>
            {isAdmin && (
              <button onClick={buildIndex} disabled={indexing} title="Re-parse the uploaded maps into the search index"
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 border border-indigo-200 rounded-full px-2 py-1 hover:bg-indigo-50 disabled:opacity-50">
                {indexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                Rebuild
              </button>
            )}
          </div>

          {loading.classes ? (
            <div className="py-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              <Select value={sel.className} onChange={pickClass} placeholder="Select Class"
                options={classes} getKey={c => c} getVal={c => c} getLabel={c => c} />
              <Select value={sel.subject} onChange={pickSubject} disabled={!sel.className} placeholder="Select Subject"
                options={subjects} getKey={s => s} getVal={s => s} getLabel={s => s} />
              <Select value={sel.topic} onChange={pickTopic} disabled={!sel.subject} placeholder="Select Topic"
                options={topics} getKey={t => t.topic} getVal={t => t.topic} getLabel={t => `${t.topic} (${t.periods})`} />
              <Select value={sel.period} onChange={pickPeriod} disabled={!sel.topic} placeholder="Select Period"
                options={periods} getKey={p => p.id} getVal={p => p.id} getLabel={p => `Period ${p.periodLabel}${p.bishaya ? ' — ' + p.bishaya : ''}`} />
            </div>
          )}

          {(sel.className || sel.subject || sel.topic) && (
            <button onClick={reset} className="text-[11px] text-indigo-600 font-bold flex items-center gap-1 hover:underline">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}

          {loading.detail && (
            <div className="py-6 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          )}

          {detail && !loading.detail && (
            <div className="rounded-2xl overflow-hidden border-2 border-indigo-100 mt-1 animate-in fade-in duration-300">
              {/* Bold period header */}
              <div className="px-4 py-3 text-white" style={{ background: 'linear-gradient(135deg,#4338CA 0%,#7C3AED 55%,#DB2777 100%)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 font-black text-[13px] px-2.5 py-1 rounded-full bg-white/25" style={{ boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.5)' }}>
                    📅 Period {detail.periodLabel}
                  </span>
                  {detail.prasang && <span className="text-[11px] font-bold bg-white/20 px-2.5 py-1 rounded-full">{detail.prasang}</span>}
                </div>
                {detail.bishaya && <p className="text-[15px] font-extrabold mt-2 leading-snug">{detail.bishaya}</p>}
                {detail.topic && <p className="text-[11.5px] text-white/85 font-medium mt-0.5">{detail.topic}</p>}
              </div>
              {/* Colourful code cards */}
              <div className="p-3 space-y-2.5 bg-gradient-to-b from-slate-50 to-white">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <span className="h-px flex-1 bg-slate-200" /> Codes for this period <span className="h-px flex-1 bg-slate-200" />
                </div>
                <CodeBlock kind="cg" data={detail.cg} />
                <CodeBlock kind="competency" data={detail.competency} framework={detail.competencyFramework} />
                <CodeBlock kind="lo" data={detail.lo} />
                <CodeBlock kind="lld" data={detail.lld} />
                {!detail.cg && !detail.competency && !detail.lo && !detail.lld && (
                  <p className="text-[12px] text-center text-muted-foreground py-3">No codes recorded for this period.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default LoCodeSearch
