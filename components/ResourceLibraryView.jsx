'use client'
// ------------------------------------------------------------
// Academic Resources — User-facing library
// ------------------------------------------------------------
// Shows the 8 resource-type tiles → list of resources for a
// chosen type → a sandboxed HTML viewer.  Every network call
// hits /api/academic-resources… (independent of the AI Credit
// /resources endpoints).
//
// The HTML viewer renders inside an <iframe srcdoc="…">
// sandboxed to "allow-same-origin" only — even leftover JS
// (if any survives the server sanitizer) cannot touch tokens
// or localStorage.  Height is auto-sized from the iframe's
// scrollHeight so the outer scrollbar wraps the whole page.
// ------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Search, Loader2, ChevronRight, FileText, X, Filter, Eye, Download, Sparkles, Zap } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import LoCodeSearch from '@/components/LoCodeSearch'
// The api() helper lives on the global app root — expose it to this file via a prop.
// Fallback: use fetch directly if not provided.
const defaultApi = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export default function ResourceLibraryView({ onBack, api = defaultApi, go }) {
  const [types, setTypes] = useState([])
  const [counts, setCounts] = useState({})
  // When the user taps one of the 8 dashboard tiles (Teaching Notes,
  // MCM Guide, etc.), the tile writes `academicResourceInitialType`
  // to localStorage BEFORE navigating.  We read it once on mount and
  // jump straight to that type's list — the middle "8-tile grid" step
  // is skipped so users see resources in a single tap.
  const initialFromLS = (() => {
    if (typeof window === 'undefined') return null
    try {
      const t = localStorage.getItem('academicResourceInitialType')
      if (t) { localStorage.removeItem('academicResourceInitialType'); return t }
    } catch (_) { /* ignore */ }
    return null
  })()
  const [selectedType, setSelectedType] = useState(initialFromLS)
  // Direct-landing users should return to the DASHBOARD when they tap
  // Back — not to the (skipped) 8-tile grid.
  const cameFromDashboardDirect = !!initialFromLS
  const [openResourceId, setOpenResourceId] = useState(null)

  // Load the 8 types + counts on mount.
  useEffect(() => {
    api('/academic-resources/types').then(r => setTypes(r.types || [])).catch(e => toast.error(e.message))
    api('/academic-resources/counts').then(r => setCounts(r.counts || {})).catch(() => {})
  }, [api])

  // ---- Tile grid (default view) ----
  if (!selectedType && !openResourceId) {
    return (
      <div className="pb-24">
        <div className="sticky top-0 z-20 bg-gradient-to-br from-cyan-500 to-blue-700 text-white px-4 py-3 flex items-center gap-2 shadow">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Resource Library</div>
            <div className="text-lg font-black leading-tight">📚 Academic Resources</div>
          </div>
        </div>

        <div className="px-4 pt-4">
          <p className="text-xs text-muted-foreground mb-3">
            Ready-to-use HTML resources uploaded by admin — teaching notes, assessments, worksheets, LO references, vocabularies, and more. No AI Credits required.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {types.map(t => (
              <Card
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className="p-4 rounded-2xl cursor-pointer border-2 hover:border-primary transition active:scale-[0.98] flex flex-col justify-between h-32 bg-gradient-to-br from-white to-slate-50 dark:from-card dark:to-slate-900/40"
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{t.emoji}</span>
                  {counts[t.id] > 0 && (
                    <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-300 text-[10px] h-5 px-2">{counts[t.id]}</Badge>
                  )}
                </div>
                <div>
                  <p className="font-black text-sm text-slate-900 dark:text-slate-100 leading-tight">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{t.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ---- Resource viewer ----
  if (openResourceId) {
    return <ResourceViewer id={openResourceId} onBack={() => setOpenResourceId(null)} api={api} />
  }

  // ---- Resource list for a type ----
  const activeType = types.find(t => t.id === selectedType)
  // types are loaded async — while we wait, show a light spinner
  // instead of crashing on `activeType.id` when the initial type came
  // from localStorage before /academic-resources/types responded.
  if (!activeType) {
    return (
      <div className="pb-24">
        <div className="sticky top-0 z-20 bg-gradient-to-br from-cyan-500 to-blue-700 text-white px-4 py-3 flex items-center gap-2 shadow">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Resource Library</div>
            <div className="text-lg font-black leading-tight">📚 Loading…</div>
          </div>
        </div>
        <div className="py-10 text-center text-xs text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading…</div>
      </div>
    )
  }
  return (
    <ResourceList
      type={activeType}
      onBack={cameFromDashboardDirect ? onBack : () => setSelectedType(null)}
      onOpen={setOpenResourceId}
      api={api}
      go={go}
    />
  )
}

// ------------------------------------------------------------
// Resource list for a single type
// ------------------------------------------------------------
function ResourceList({ type, onBack, onOpen, api, go }) {
  const [classes, setClasses] = useState([])
  const [items, setItems] = useState(null)
  const [f, setF] = useState({ classId: '', subject: '', search: '' })

  useEffect(() => {
    api('/classes').then(r => setClasses(r.classes || [])).catch(() => {})
  }, [api])

  useEffect(() => {
    const params = new URLSearchParams({ type: type.id, limit: '200' })
    if (f.classId) params.set('classId', f.classId)
    if (f.subject) params.set('subject', f.subject)
    if (f.search) params.set('search', f.search)
    setItems(null)
    const t = setTimeout(() => {
      api('/academic-resources?' + params.toString())
        .then(r => setItems(r.resources || []))
        .catch(e => { setItems([]); toast.error(e.message) })
    }, 220) // debounce search input
    return () => clearTimeout(t)
  }, [type.id, f.classId, f.subject, f.search, api])

  // Distinct subjects for the current items (used to build the subject dropdown).
  const subjects = useMemo(() => {
    const s = new Set()
    ;(items || []).forEach(it => { if (it.subject) s.add(it.subject) })
    return Array.from(s).sort()
  }, [items])

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-20 bg-gradient-to-br from-cyan-500 to-blue-700 text-white px-4 py-3 flex items-center gap-2 shadow">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Resources</div>
          <div className="text-lg font-black leading-tight truncate">{type.emoji} {type.label}</div>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-2">
        <Card className="p-2 rounded-2xl">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={f.search} onChange={e => setF(s => ({ ...s, search: e.target.value }))} placeholder="Search…" className="pl-7 h-8 text-xs rounded-lg" />
            </div>
          </div>
          <div className="flex gap-1.5">
            <select value={f.classId} onChange={e => setF(s => ({ ...s, classId: e.target.value }))} className="flex-1 text-xs border rounded-lg px-2 h-8 bg-background">
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={f.subject} onChange={e => setF(s => ({ ...s, subject: e.target.value }))} className="flex-1 text-xs border rounded-lg px-2 h-8 bg-background">
              <option value="">All Subjects</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(f.search || f.classId || f.subject) && (
              <button onClick={() => setF({ classId: '', subject: '', search: '' })} title="Clear filters" className="w-8 h-8 rounded-lg border flex items-center justify-center text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
        </Card>

        {/* 🚀 FEATURED · Curated class-wise LO Code booklets — only shown
            inside the LO Code PDF Book tile, ABOVE the admin-uploaded items. */}
        {type.id === 'lo_code_pdf_book' && <FeaturedLoCodeBooks api={api} />}

        {/* 📘 FEATURED · Monthly Cluster-level Meeting (MCM) notes — only shown
            inside the MCM Guide tile, ABOVE the admin-uploaded items. */}
        {type.id === 'mcm_guide' && <FeaturedMcmNotes api={api} go={go} />}

        {/* 🔎 Chapter-wise LO CODE cascading search (Class → Subject → Topic →
            Period → CG/Competency/LO/LLD details). Only in the Chapter-wise LO tile. */}
        {type.id === 'chapter_wise_lo' && <LoCodeSearch api={api} />}

        {items === null && <div className="py-8 text-center text-xs text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />Loading resources…</div>}
        {items && items.length === 0 && (
          <Card className="p-6 rounded-2xl border-2 border-dashed text-center">
            <div className="text-4xl">{type.emoji}</div>
            <p className="font-bold mt-2 text-sm">No resources yet</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {(f.search || f.classId || f.subject) ? 'Try clearing filters or a different search.' : 'Admin has not uploaded any resources for this type yet.'}
            </p>
          </Card>
        )}
        {items && items.length > 0 && (
          <div className="space-y-2">
            {items.map(r => (
              <Card
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="p-3 rounded-2xl border cursor-pointer active:scale-[0.99] transition flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{r.title}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {r.className && <Badge className="bg-blue-500/15 text-blue-700 border border-blue-300 text-[9px] h-4 px-1.5">{r.className}</Badge>}
                    {r.contentType === 'pdf' && <Badge className="bg-rose-500/15 text-rose-700 border border-rose-300 text-[9px] h-4 px-1.5">📄 PDF{r.pageCount ? ` · ${r.pageCount}p` : ''}</Badge>}
                    {r.subject && <Badge className="bg-purple-500/15 text-purple-700 border border-purple-300 text-[9px] h-4 px-1.5">{r.subject}</Badge>}
                    {r.chapterName && <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-300 text-[9px] h-4 px-1.5 max-w-[140px] truncate">{r.chapterName}</Badge>}
                  </div>
                  {r.description && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{r.description}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Sandboxed HTML resource viewer
// ------------------------------------------------------------
function ResourceViewer({ id, onBack, api }) {
  const [resource, setResource] = useState(null)
  const [err, setErr] = useState(null)
  const iframeRef = useRef(null)

  useEffect(() => {
    setResource(null); setErr(null)
    api('/academic-resources/' + encodeURIComponent(id))
      .then(r => setResource(r.resource))
      .catch(e => setErr(e.message))
  }, [id, api])

  // Auto-size the iframe to its content once it loads.
  // Track the PARENT app's viewport width. srcdoc iframes frequently ignore
  // `width=device-width` on mobile browsers (they default to a ~980px layout
  // width), which stops the iframe's own @media queries from ever firing. So we
  // decide "mobile" from the real app viewport and push it into the iframe as a
  // class — guaranteeing the responsive layout applies on phones.
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setIsNarrow(mq.matches)
    apply()
    try { mq.addEventListener('change', apply) } catch { mq.addListener(apply) }
    return () => { try { mq.removeEventListener('change', apply) } catch { mq.removeListener(apply) } }
  }, [])

  const handleFrameLoad = () => {
    try {
      const f = iframeRef.current
      if (!f) return
      // Small deferral because Chrome sometimes reports scrollHeight before layout settles.
      setTimeout(() => {
        try {
          const h = f.contentDocument?.documentElement?.scrollHeight || 800
          f.style.height = Math.max(400, Math.min(h + 40, 40000)) + 'px'
        } catch (_) { /* ignore cross-doc access errors */ }
      }, 60)
    } catch (_) { /* ignore */ }
  }

  // Wrap the sanitized HTML with a clean reading stylesheet so ALL resources
  // render with the same educational-book look-and-feel.
  const srcdoc = useMemo(() => {
    if (!resource?.htmlContent) return ''
    return `<!DOCTYPE html><html class="${isNarrow ? 'is-narrow' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+Oriya:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; }
  body { font-family: 'Inter', 'Noto Sans Oriya', 'Segoe UI', system-ui, sans-serif; font-size: 15px; line-height: 1.65; padding: 14px 14px 32px; }
  h1, h2, h3, h4 { color: #0f172a; margin: 1em 0 0.4em; line-height: 1.25; }
  h1 { font-size: 1.65em; font-weight: 800; }
  h2 { font-size: 1.35em; font-weight: 700; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25em; }
  h3 { font-size: 1.15em; font-weight: 700; color: #334155; }
  p { margin: 0.6em 0; }
  a { color: #2563eb; text-decoration: underline; }
  img { max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0.6em auto; }
  table { border-collapse: collapse; width: 100%; max-width: 100%; margin: 0.8em 0; font-size: 0.94em; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; }
  ul, ol { padding-left: 1.4em; }
  li { margin: 0.2em 0; }
  blockquote { border-left: 4px solid #94a3b8; margin: 0.8em 0; padding: 0.4em 0.8em; color: #475569; background: #f8fafc; border-radius: 4px; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-family: 'Fira Code', ui-monospace, monospace; font-size: 0.92em; }
  pre { background: #0f172a; color: #e2e8f0; padding: 10px 12px; border-radius: 8px; overflow-x: auto; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 1.4em 0; }
  /* Responsive table wrapper for wide tables */
  .table-wrap, .table-responsive { overflow-x: auto; }
  /* Prevent uploaded content from breaking layout beyond viewport */
  * { max-width: 100%; box-sizing: border-box; }

  /* ============================================================
   * Chapter-wise LO "Period Code Map" template — scoped to .pcm-root
   * Restores the file's unique CODE COLOURS (CG=blue, C=green,
   * LO=orange, LLD=purple), makes every code TAP-TO-REVEAL its
   * explanation (works on mobile — native <details>, no JS), and
   * makes the whole sheet fit small screens.
   * ============================================================ */
  .pcm-root { --ink:#12203A;--soft:#5C688A;--line:#DCE2EE;--hair:#F0F3F8;--cg:#1A3EA8;--cgb:#E9EEFD;--cgl:#C3D1F7;--c:#07775A;--cb:#E1F5EF;--cl:#B2E0D1;--lo:#B85C00;--lob:#FDF0DD;--lol:#F2D5A6;--ll:#8A1F9E;--llb:#F8E9FB;--lll:#E6C2ED; color:var(--ink); }
  .pcm-root .sheet { max-width:1240px; margin:0 auto; background:#fff; }
  .pcm-root header { background:linear-gradient(115deg,#1A3EA8 0%,#5B2BC4 45%,#07775A 100%); color:#fff; padding:24px 22px; border-radius:12px; }
  .pcm-root header * { color:#fff; }
  .pcm-root .kick { font-size:10.5px; letter-spacing:.2em; text-transform:uppercase; color:#C8D5FF; font-weight:600; }
  .pcm-root h1 { font-size:23px; margin:6px 0 0; font-weight:800; line-height:1.25; border:none; }
  .pcm-root h1 small { display:block; font-size:13px; font-weight:500; color:#CBD7F5; margin-top:6px; }
  .pcm-root .chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:14px; }
  .pcm-root .chip { background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.3); border-radius:20px; padding:4px 13px; font-size:12px; font-weight:600; }
  .pcm-root .chip.hi { background:#FFD24A; border-color:#FFD24A; color:#3A2A00; }
  .pcm-root .wrap { padding:0 20px; }
  .pcm-root h2 { font-size:17px; margin:26px 0 10px; padding-bottom:6px; border-bottom:2px solid var(--ink); color:var(--ink); }
  .pcm-root .note { background:#F6F8FC; border-left:4px solid var(--cg); padding:12px 16px; font-size:13px; color:#33405E; margin:14px 0; border-radius:0 4px 4px 0; }
  .pcm-root .key { display:flex; gap:10px; flex-wrap:wrap; margin:16px 0 6px; }
  .pcm-root .kb { flex:1 1 210px; border:1px solid; border-radius:6px; overflow:hidden; }
  .pcm-root .kb .t { padding:7px 12px; color:#fff; font-size:12px; font-weight:700; }
  .pcm-root .kb .d { padding:8px 12px; font-size:12.3px; }
  .pcm-root .kb.cg { border-color:var(--cgl); background:var(--cgb); } .pcm-root .kb.cg .t { background:var(--cg); }
  .pcm-root .kb.c  { border-color:var(--cl);  background:var(--cb);  } .pcm-root .kb.c  .t { background:var(--c);  }
  .pcm-root .kb.lo { border-color:var(--lol); background:var(--lob); } .pcm-root .kb.lo .t { background:var(--lo); }
  .pcm-root .kb.ll { border-color:var(--lll); background:var(--llb); } .pcm-root .kb.ll .t { background:var(--ll); }
  .pcm-root .tw { border:1px solid var(--line); border-radius:8px; overflow-x:auto; margin-top:8px; }
  .pcm-root table { width:100%; border-collapse:collapse; margin:0; }
  .pcm-root thead th { background:var(--ink); color:#fff; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; font-weight:700; padding:9px 12px; text-align:left; }
  .pcm-root td { padding:7px 12px; border-bottom:1px solid var(--hair); vertical-align:top; text-align:left; }
  .pcm-root tr.th td { color:#fff; font-size:15px; font-weight:700; padding:10px 14px; border:none; background:#2A3A63; }
  .pcm-root td.pn { font-size:14px; font-weight:700; color:var(--soft); text-align:center; white-space:nowrap; }
  .pcm-root .lname { font-size:14px; font-weight:700; margin-right:10px; }
  .pcm-root .lm { font-size:11.6px; color:var(--soft); margin-right:10px; }
  .pcm-root .lm.np { float:right; font-size:11px; font-weight:600; }
  /* Code chips (non-clickable fallback) */
  .pcm-root span.ch { display:inline-block; font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:11.5px; font-weight:700; padding:3px 9px; border-radius:5px; border:1px solid; white-space:nowrap; margin:2px 4px 2px 0; }
  .pcm-root span.ch.cg { background:var(--cgb); color:var(--cg); border-color:var(--cgl); }
  .pcm-root span.ch.c  { background:var(--cb);  color:var(--c);  border-color:var(--cl); }
  .pcm-root span.ch.lo { background:var(--lob); color:var(--lo); border-color:var(--lol); }
  .pcm-root span.ch.ll { background:var(--llb); color:var(--ll); border-color:var(--lll); }
  /* Code chips — TAP TO REVEAL explanation */
  .pcm-root details.ch { display:inline-block; vertical-align:top; margin:2px 4px 2px 0; }
  .pcm-root details.ch > summary { list-style:none; cursor:pointer; font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:11.5px; font-weight:700; padding:3px 9px; border-radius:5px; border:1px solid; white-space:nowrap; display:inline-block; }
  .pcm-root details.ch > summary::-webkit-details-marker { display:none; }
  .pcm-root details.ch > summary::after { content:" ⓘ"; font-size:10px; opacity:.55; }
  .pcm-root details.ch[open] > summary::after { content:" ×"; opacity:.8; }
  .pcm-root details.ch.cg > summary { background:var(--cgb); color:var(--cg); border-color:var(--cgl); }
  .pcm-root details.ch.c  > summary { background:var(--cb);  color:var(--c);  border-color:var(--cl); }
  .pcm-root details.ch.lo > summary { background:var(--lob); color:var(--lo); border-color:var(--lol); }
  .pcm-root details.ch.ll > summary { background:var(--llb); color:var(--ll); border-color:var(--lll); }
  .pcm-root .ch-exp { display:block; margin-top:5px; padding:8px 11px; background:#fff; border:1px solid var(--line); border-left:3px solid var(--soft); border-radius:6px; font-size:12.5px; line-height:1.55; color:#1f2b47; max-width:340px; box-shadow:0 6px 18px rgba(18,32,58,.14); }
  .pcm-root details.ch.cg .ch-exp { border-left-color:var(--cg); }
  .pcm-root details.ch.c  .ch-exp { border-left-color:var(--c); }
  .pcm-root details.ch.lo .ch-exp { border-left-color:var(--lo); }
  .pcm-root details.ch.ll .ch-exp { border-left-color:var(--ll); }
  .pcm-root footer { margin-top:26px; padding:14px 20px 0; border-top:2px solid var(--ink); font-size:12px; color:var(--soft); }
  @media (max-width:640px) {
    .pcm-root .wrap { padding:0 12px; }
    .pcm-root header { padding:16px 14px; }
    .pcm-root h1 { font-size:19px; }
    .pcm-root .key { gap:8px; }
    .pcm-root .kb { flex:1 1 100%; }
    .pcm-root table { font-size:12px; }
    .pcm-root td, .pcm-root thead th { padding:6px 8px; }
    .pcm-root .ch-exp { max-width:none; }
    .pcm-root details.ch { display:block; margin:3px 0; }
    .pcm-root details.ch > summary { display:inline-block; }
  }
  /* Parent-app-driven mobile fallback (srcdoc iframes often ignore the
     viewport meta on phones, so the @media above may never fire). These
     mirror the mobile rules and are toggled by the app via html.is-narrow. */
  html.is-narrow .pcm-root .wrap { padding:0 12px; }
  html.is-narrow .pcm-root header { padding:16px 14px; }
  html.is-narrow .pcm-root h1 { font-size:19px; }
  html.is-narrow .pcm-root .key { gap:8px; }
  html.is-narrow .pcm-root .kb { flex:1 1 100%; }
  html.is-narrow .pcm-root table { font-size:12px; }
  html.is-narrow .pcm-root td, html.is-narrow .pcm-root thead th { padding:6px 8px; }
  html.is-narrow .pcm-root .ch-exp { max-width:none; }
  html.is-narrow .pcm-root details.ch { display:block; margin:3px 0; }
  html.is-narrow .pcm-root details.ch > summary { display:inline-block; }
  html.is-narrow .pcm-root .sheet { max-width:100%; }
  html.is-narrow .pcm-root .tw { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  html.is-narrow body { font-size:14px; }
  /* Force any <a target="_blank"> to still open outside the iframe */
</style></head><body>${resource.htmlContent}</body></html>`
  }, [resource, isNarrow])

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-20 bg-gradient-to-br from-cyan-500 to-blue-700 text-white px-4 py-3 flex items-center gap-2 shadow">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Resource</div>
          <div className="text-base font-black leading-tight truncate">{resource?.title || 'Loading…'}</div>
          {resource && (
            <div className="text-[10px] opacity-90 truncate">
              {[resource.className, resource.subject, resource.chapterName].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pt-2">
        {err && (
          <Card className="p-6 rounded-2xl border-2 border-red-300 bg-red-50/50 text-center">
            <p className="font-bold text-sm text-red-700">Unable to load resource</p>
            <p className="text-[11px] text-red-600 mt-1">{err}</p>
            <Button size="sm" onClick={onBack} className="mt-3">Back</Button>
          </Card>
        )}
        {!resource && !err && (
          <div className="py-10 text-center text-xs text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading…</div>
        )}
        {resource && resource.resourceType === 'chapter_assessments' ? (
          // Chapter Assessments — try the 5-slot panel first.  BUT if the admin
          // uploaded a single "bulk" PDF (contentType='pdf', no per-slot PDFs
          // and no detected HTML sections), fall back to the plain PDF viewer
          // so the file is still usable.
          (resource.contentType === 'pdf'
            && (!Array.isArray(resource.sections) || resource.sections.length === 0)
            && (!Array.isArray(resource.assessmentPdfs) || resource.assessmentPdfs.length === 0)
            && resource.cloudinaryPublicId)
            ? <PdfResourceViewer resource={resource} api={api} />
            : <ChapterAssessmentPanel resource={resource} api={api} />
        ) : resource && resource.contentType === 'pdf' ? (
          <PdfResourceViewer resource={resource} api={api} />
        ) : resource && (
          <Card className="rounded-2xl overflow-hidden border-2 bg-white">
            <iframe
              ref={iframeRef}
              srcDoc={srcdoc}
              onLoad={handleFrameLoad}
              /*
                sandbox — CRITICAL SECURITY BOUNDARY
                We allow "allow-same-origin" ONLY so images/relative URLs can
                render.  We deliberately DO NOT include "allow-scripts",
                "allow-forms", "allow-top-navigation", or "allow-popups" —
                which means:
                  • any leftover <script> tags cannot execute
                  • any <form> can't submit
                  • no cookie/localStorage access to the parent origin
                  • no redirect out of the iframe
              */
              sandbox="allow-same-origin"
              title={resource.title}
              className="w-full block"
              style={{ height: 800, border: 'none', background: '#fff' }}
              loading="eager"
            />
          </Card>
        )}
        {resource && resource.resourceType !== 'chapter_assessments' && resource.contentType !== 'pdf' && resource.allowPdfDownload && (
          <div className="mt-3">
            <Button disabled className="w-full h-11 rounded-xl bg-slate-300 text-slate-600 text-xs">
              📄 PDF Download (coming soon in Phase 2)
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Chapter Assessments — 5 individual assessment cards + secure download
// ============================================================
function ChapterAssessmentPanel({ resource, api }) {
  const [modal, setModal] = useState(null) // { number, mode: 'pdf'|'print' }
  const sections = Array.isArray(resource.sections) ? resource.sections : []
  const assessmentPdfs = Array.isArray(resource.assessmentPdfs) ? resource.assessmentPdfs : []
  const detectedFromHtml = new Set(sections.map(s => s.index))
  const detectedFromPdfs = new Set(assessmentPdfs.map(p => p.assessmentNumber))
  const availableNumbers = new Set([...detectedFromHtml, ...detectedFromPdfs])
  const canDownload = !!resource.allowPdfDownload
  const canPrint    = !!resource.allowPrint

  const openPrint = async (n, schoolName) => {
    try {
      const res = await fetch('/api/academic-resources/' + encodeURIComponent(resource.id) + '/assessment-print', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (localStorage.getItem('em_token') || localStorage.getItem('token') || ''),
        },
        body: JSON.stringify({ assessmentNumber: n, schoolName }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Print failed')
      }
      const html = await res.text()
      // Open the authorized print-ready HTML in a fresh tab and auto-invoke
      // print. Blob URL keeps it single-use / no navigation trail.
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (!win) { toast.error('Pop-up blocked — please allow pop-ups to print.'); return }
      // Give the tab ~800 ms to render before hitting print.
      setTimeout(() => { try { win.focus(); win.print() } catch (_) { /* user closed already */ } }, 900)
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { toast.error(e.message) }
  }

  const downloadPdf = async ({ n, schoolName, password }) => {
    const res = await fetch('/api/academic-resources/' + encodeURIComponent(resource.id) + '/assessment-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (localStorage.getItem('em_token') || localStorage.getItem('token') || ''),
      },
      body: JSON.stringify({ assessmentNumber: n, schoolName, password }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || 'PDF generation failed')
    }
    const blob = await res.blob()
    if (blob.size < 800) throw new Error('PDF is empty — please retry.')
    // Content-Disposition can carry TWO filenames:
    //   filename="<ASCII fallback>"; filename*=UTF-8''<pct-encoded>
    // Prefer the UTF-8 one when present so the downloaded file keeps
    // its original Odia / Hindi / Sanskrit name on modern browsers.
    const cd = res.headers.get('content-disposition') || ''
    let filename = `Assessment_${n}.pdf`
    const utfMatch = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd)
    if (utfMatch) {
      try { filename = decodeURIComponent(utfMatch[1]) } catch (_) { /* fall through */ }
    } else {
      const fnMatch = /filename="?([^";]+)"?/i.exec(cd)
      if (fnMatch) filename = fnMatch[1]
    }
    const url = URL.createObjectURL(blob)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')
    // Mobile browsers don't reliably respect <a download> on blob URLs, so
    // try Web Share API first (surfaces a native Save-to-Files sheet).
    if (isMobile) {
      try {
        const file = new File([blob], filename, { type: 'application/pdf' })
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename })
          setTimeout(() => URL.revokeObjectURL(url), 15000)
          return
        }
      } catch (shareErr) {
        if (shareErr && shareErr.name === 'AbortError') { setTimeout(() => URL.revokeObjectURL(url), 15000); return }
      }
      // Fallback: open the PDF viewer so the OS share sheet is one tap away.
      const w = window.open(url, '_blank')
      if (w) toast.success('📄 PDF opened — tap ⤓ / Share → Save to Files.', { duration: 6000 })
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      return
    }
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 15000)
  }

  return (
    <div className="space-y-2">
      <Card className="p-3 rounded-2xl border">
        <p className="text-xs text-muted-foreground">Select an assessment to download or print. Each PDF is generated on the server and password-protected on the fly — nothing is stored on your device.</p>
      </Card>
      {sections.length === 0 && assessmentPdfs.length === 0 && (
        <Card className="p-6 rounded-2xl border-2 border-dashed text-center">
          <div className="text-4xl">📝</div>
          <p className="font-bold mt-2 text-sm">No assessments uploaded yet</p>
          <p className="text-[11px] text-muted-foreground mt-1">Admin has not uploaded any assessment PDFs or HTML for this chapter yet. Please check back later.</p>
        </Card>
      )}
      {[1, 2, 3, 4, 5].map(n => {
        const has = availableNumbers.has(n)
        const sec = sections.find(s => s.index === n)
        const slot = assessmentPdfs.find(p => p.assessmentNumber === n)
        const source = slot ? 'PDF' : (sec ? 'HTML' : null)
        return (
          <Card key={n} className={`p-3 rounded-2xl border ${!has ? 'opacity-60' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow shrink-0 font-black">{n}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{sec?.title || slot?.fileName?.replace(/\.pdf$/i, '') || `Assessment ${n}`}</p>
                {has ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] font-bold text-emerald-700">🟢 Available</span>
                    {source === 'PDF' && <Badge className="bg-rose-500/15 text-rose-700 border border-rose-300 text-[9px] h-4 px-1.5">📄 PDF{slot?.pageCount ? ` · ${slot.pageCount}p` : ''}</Badge>}
                    {source === 'HTML' && <Badge className="bg-indigo-500/15 text-indigo-700 border border-indigo-300 text-[9px] h-4 px-1.5">📝 HTML</Badge>}
                  </div>
                ) : (
                  <p className="text-[10px] text-red-500">⚪ Not uploaded yet</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!has || !canDownload}
                onClick={() => setModal({ number: n, mode: 'pdf' })}
                className="flex-1 h-9 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-700 text-white text-xs font-bold disabled:opacity-40"
              >
                📥 Download PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!has || !canPrint}
                onClick={() => setModal({ number: n, mode: 'print' })}
                className="flex-1 h-9 rounded-lg text-xs disabled:opacity-40"
              >
                🖨 Print
              </Button>
            </div>
            {!canDownload && has && <p className="text-[9px] text-muted-foreground mt-1">PDF download disabled by admin.</p>}
            {!canPrint && has && <p className="text-[9px] text-muted-foreground mt-1">Print disabled by admin.</p>}
          </Card>
        )
      })}
      {modal && (
        <AssessmentActionModal
          key={`${modal.number}-${modal.mode}`}
          mode={modal.mode}
          assessmentNumber={modal.number}
          resource={resource}
          onCancel={() => setModal(null)}
          onSubmit={async ({ schoolName, password }) => {
            const n = modal.number
            try {
              if (modal.mode === 'pdf') {
                await downloadPdf({ n, schoolName, password })
                toast.success(`✅ Assessment ${n} downloaded${resource.passwordProtected ? ' (password-protected)' : ''}`)
              } else {
                await openPrint(n, schoolName)
              }
              setModal(null)
            } catch (e) { toast.error(e.message || 'Failed') }
          }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Password / school-name modal used for both PDF download and Print
// ------------------------------------------------------------
function AssessmentActionModal({ mode, assessmentNumber, resource, onCancel, onSubmit }) {
  const [schoolName, setSchoolName] = useState(() => {
    try { return localStorage.getItem('lastSchoolName') || '' } catch (_) { return '' }
  })
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [ack, setAck] = useState(false)
  const requiresPassword = mode === 'pdf' && !!resource.passwordProtected

  const submit = async () => {
    if (busy) return
    if (!schoolName || schoolName.trim().length < 2) { toast.error('Please enter your school name.'); return }
    if (requiresPassword) {
      if (!password || password.length < 6) { toast.error('Password must be at least 6 characters.'); return }
      if (password !== confirmPw) { toast.error('Passwords do not match.'); return }
      if (!ack) { toast.error('Please acknowledge the password reminder.'); return }
    }
    setBusy(true)
    try {
      try { localStorage.setItem('lastSchoolName', schoolName.trim()) } catch (_) { /* ignore */ }
      await onSubmit({ schoolName: schoolName.trim(), password: requiresPassword ? password : undefined })
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3">
      <Card className="w-full max-w-md rounded-2xl bg-card overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 text-white px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">{mode === 'pdf' ? '🔐 Secure Assessment PDF' : '🖨 Print Assessment'}</div>
          <div className="text-base font-black">Assessment {assessmentNumber} · {resource.chapterName || resource.className}</div>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">School Name</span>
            <Input value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="Enter your school name" className="h-10 text-sm rounded-lg mt-1" />
          </label>
          {requiresPassword && (
            <>
              <label className="block">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Create PDF Password (min 6 chars)</span>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" className="h-10 text-sm rounded-lg mt-1" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Confirm Password</span>
                <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="••••••" className="h-10 text-sm rounded-lg mt-1" />
              </label>
              <label className="flex items-start gap-2 text-[11px] cursor-pointer">
                <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 shrink-0" />
                <span>I understand this password will be required to open the downloaded PDF, and Lesson Guru Odisha cannot recover it if forgotten.</span>
              </label>
            </>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onCancel} className="flex-1 h-10 rounded-lg" disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy} className="flex-1 h-10 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === 'pdf' ? '🔒 Create & Download PDF' : '🖨 Open Print View')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}


// ============================================================
// PDF Resource Viewer + Download
// ============================================================
// Shows the admin-uploaded PDF (contentType='pdf') in an inline
// iframe fed by a signed, time-limited Cloudinary URL.  A
// separate "Download PDF" button (only shown when the admin has
// allowPdfDownload=true) triggers a friendly-filename download
// via a fresh signed URL from the server.
function PdfResourceViewer({ resource, api }) {
  const [viewUrl, setViewUrl] = useState(null)   // blob: object URL (no server URL ever exposed)
  const [err, setErr] = useState(null)
  const [downloading, setDownloading] = useState(false)

  // Stable per-browser device id (binds the short-lived view token to this device).
  const deviceId = () => {
    try {
      let id = localStorage.getItem('lgo_device_id')
      if (!id) { id = (window.crypto?.randomUUID?.() || (String(Date.now()) + Math.random())); localStorage.setItem('lgo_device_id', id) }
      return id
    } catch { return '' }
  }
  const authToken = () => { try { return localStorage.getItem('em_token') || localStorage.getItem('token') || '' } catch { return '' } }

  // Load (and periodically refresh) the PDF through ONE authenticated request.
  // The whole file is streamed into a blob — there is no shareable URL, the
  // request requires the logged-in session (Bearer) + device header, and the
  // 5-minute token is re-minted automatically while the viewer stays open.
  useEffect(() => {
    let cancelled = false
    let lastUrl = null
    let timer = null
    const load = async () => {
      try {
        const t = authToken()
        const dev = deviceId()
        const headers = { ...(t ? { Authorization: 'Bearer ' + t } : {}), 'x-lgo-device': dev }
        // 1) Mint a fresh short-lived view token (bound to user+resource+device).
        const mintRes = await fetch('/api/academic-resources/' + encodeURIComponent(resource.id) + '/pdf-view', { headers, cache: 'no-store' })
        const meta = await mintRes.json().catch(() => ({}))
        if (!mintRes.ok || !meta.streamUrl) throw new Error(meta.error || 'Unable to prepare the viewer.')
        // 2) Fetch the bytes via the authenticated proxy stream → blob.
        const streamRes = await fetch(meta.streamUrl, { headers, cache: 'no-store' })
        if (streamRes.status === 401) throw new Error('Your session expired. Please log in again.')
        if (!streamRes.ok) throw new Error('Unable to load PDF.')
        const blob = await streamRes.blob()
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        setViewUrl(prev => { if (prev) { try { URL.revokeObjectURL(prev) } catch {} } return url })
        lastUrl = url
        setErr(null)
      } catch (e) {
        if (!cancelled) setErr(e.message || 'Unable to load PDF')
      }
    }
    setViewUrl(null); setErr(null)
    load()
    // Auto-refresh the session-bound stream every 4.5 min (token TTL is 5 min).
    timer = setInterval(() => { if (!cancelled) load() }, 270000)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      if (lastUrl) { try { URL.revokeObjectURL(lastUrl) } catch {} }
    }
  }, [resource.id])

  const download = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const t = authToken()
      const headers = t ? { Authorization: 'Bearer ' + t } : {}
      const res = await fetch('/api/academic-resources/' + encodeURIComponent(resource.id) + '/pdf-download', { headers, cache: 'no-store' })
      if (res.status === 429) throw new Error('Daily download limit reached. Please try again tomorrow.')
      if (res.status === 401) throw new Error('Your session expired. Please log in again.')
      if (!res.ok) throw new Error('Download failed. Please try again.')
      // Friendly filename from the Content-Disposition header (server-set).
      let filename = (resource.title || 'resource') + '.pdf'
      const cd = res.headers.get('content-disposition') || ''
      const m = cd.match(/filename="?([^"]+)"?/i)
      if (m && m[1]) filename = m[1]
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { a.remove(); try { URL.revokeObjectURL(url) } catch {} }, 1000)
      toast.success('⬇ Download started')
    } catch (e) {
      toast.error(e.message || 'Download failed. Please try again.')
    } finally { setDownloading(false) }
  }

  return (
    <div className="space-y-3">
      <Card className="rounded-2xl overflow-hidden border-2 bg-white relative">
        {!viewUrl && !err && (
          <div className="py-16 text-center text-xs text-muted-foreground">
            <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
            Preparing secure PDF viewer…
          </div>
        )}
        {err && (
          <div className="p-6 text-center">
            <div className="text-3xl">⚠️</div>
            <p className="font-bold text-sm text-red-700 mt-2">Unable to load PDF</p>
            <p className="text-[11px] text-muted-foreground mt-1">{err}</p>
          </div>
        )}
        {viewUrl && (
          <>
            <iframe
              title={resource.title}
              src={viewUrl}
              className="w-full block"
              style={{ height: '78vh', border: 'none', background: '#525659' }}
              loading="eager"
            />
            <div className="px-3 py-2 flex items-center justify-between text-[10px] text-muted-foreground bg-slate-50 dark:bg-slate-900/40 border-t">
              <span>📄 {resource.pageCount ? `${resource.pageCount} page${resource.pageCount === 1 ? '' : 's'}` : 'PDF'}</span>
              <a href={viewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open in new tab</a>
            </div>
          </>
        )}
      </Card>
      {resource.allowPdfDownload ? (
        <Button onClick={download} disabled={downloading || !viewUrl} className="w-full h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-700 text-white font-bold">
          {downloading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparing…</> : <>⬇ Download PDF</>}
        </Button>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 dark:bg-slate-900/40 p-3 text-center text-[11px] text-muted-foreground">
          🔒 PDF download is currently disabled by the administrator.
        </div>
      )}
    </div>
  )
}


// ============================================================
//  FEATURED · Class-wise LO Code Books  (ultra clickbait strip)
// ------------------------------------------------------------
//  Renders the 5 curated Class 1-5 Learning-Outcomes PDFs at the
//  top of the LO Code PDF Book resource tile.  Each card has:
//    • ⚡ One-click "Instant View" (opens public CDN preview in a
//         new tab)
//    • 📥 One-click "Instant Download" (auth-gated proxy that
//         streams the PDF with a friendly filename)
//
//  Design: bold neon gradients, animated ribbon badge, hover
//  shine, playful subject chips.  Fully mobile-first.
// ============================================================
function FeaturedLoCodeBooks({ api }) {
  const [books, setBooks] = useState(null)
  const [busy, setBusy] = useState({}) // { [key]: 'view' | 'download' }

  useEffect(() => {
    let cancelled = false
    api('/lo-code-books')
      .then(r => { if (!cancelled) setBooks(r.books || []) })
      .catch(() => { if (!cancelled) setBooks([]) })
    return () => { cancelled = true }
  }, [api])

  const bumpView = (key) => {
    api('/lo-code-books/' + key + '/view', { method: 'POST' }).catch(() => {})
  }

  const openView = (b) => {
    setBusy(s => ({ ...s, [b.key]: 'view' }))
    bumpView(b.key)
    try {
      window.open(b.viewUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setTimeout(() => setBusy(s => { const n = { ...s }; delete n[b.key]; return n }), 400)
    }
  }

  const download = async (b) => {
    if (busy[b.key]) return
    setBusy(s => ({ ...s, [b.key]: 'download' }))
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token') || '') : ''
      const res = await fetch('/api/lo-code-books/' + encodeURIComponent(b.key) + '/download', {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Download failed')
      }
      const blob = await res.blob()
      if (blob.size < 800) throw new Error('Empty file received. Please retry.')
      const url = URL.createObjectURL(blob)
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '')
      if (isMobile) {
        try {
          const file = new File([blob], b.filename, { type: 'application/pdf' })
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: b.filename })
            toast.success('✅ Ready — tap Save to Files')
            setTimeout(() => URL.revokeObjectURL(url), 15000)
            return
          }
        } catch (shareErr) {
          if (shareErr && shareErr.name === 'AbortError') { setTimeout(() => URL.revokeObjectURL(url), 15000); return }
        }
        const w = window.open(url, '_blank')
        if (w) toast.success('📄 PDF opened — tap ⤓ / Share → Save to Files')
        setTimeout(() => URL.revokeObjectURL(url), 60000)
        return
      }
      const a = document.createElement('a')
      a.href = url
      a.download = b.filename
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 15000)
      toast.success('⬇ ' + b.className + ' downloaded!')
    } catch (e) {
      toast.error(e.message || 'Download failed')
    } finally {
      setBusy(s => { const n = { ...s }; delete n[b.key]; return n })
    }
  }

  if (books === null) {
    return (
      <Card className="p-4 rounded-2xl border-2 border-dashed">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading featured LO Code books…</div>
      </Card>
    )
  }
  if (!books.length) return null

  return (
    <>
      {/* Section header with animated sparkle */}
      <div className="pt-1 pb-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
          </div>
          <div className="text-[11px] font-black uppercase tracking-widest bg-gradient-to-r from-fuchsia-600 via-rose-500 to-amber-500 bg-clip-text text-transparent">
            🔥 Featured · Class-wise LO Code Books
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 pl-6">
          Official Lesson-Guru Odisha LO reference booklets. One-tap view or instant download 👇
        </p>
      </div>

      {/* Book cards */}
      <div className="space-y-2.5">
        {books.map(b => {
          const downloading = busy[b.key] === 'download'
          const viewing = busy[b.key] === 'view'
          return (
            <div
              key={b.key}
              className={`group relative overflow-hidden rounded-2xl p-[2px] bg-gradient-to-br ${b.gradient} shadow-lg shadow-black/10 hover:shadow-xl hover:shadow-black/20 transition-shadow`}
            >
              {/* Animated shine on hover */}
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute -inset-y-6 -left-1/3 w-1/3 rotate-12 bg-white/25 blur-xl animate-[shine_1.6s_ease-in-out]" />
              </div>

              <Card className="relative rounded-[14px] bg-white/95 dark:bg-slate-950/90 backdrop-blur border-0 overflow-hidden">
                {/* Neon ribbon badge */}
                <div className="absolute top-0 right-0 z-10">
                  <div className={`text-[8px] font-black tracking-widest text-white px-2.5 py-1 rounded-bl-xl shadow-md bg-gradient-to-r ${b.gradient}`}>
                    {b.badge}
                  </div>
                </div>

                <div className="flex gap-3 p-3">
                  {/* Left: class-numbered gradient tile */}
                  <div className="shrink-0">
                    <div className={`w-16 h-20 rounded-xl bg-gradient-to-br ${b.gradient} text-white flex flex-col items-center justify-center shadow-lg relative overflow-hidden`}>
                      <span className="text-[7px] font-bold uppercase tracking-widest opacity-90 leading-tight text-center px-1">{b.tierLabel || 'Class'}</span>
                      <span className={`font-black leading-none drop-shadow ${(b.classLabel || '').length >= 3 ? 'text-xl' : 'text-3xl'}`}>{b.classLabel || b.classNumber}</span>
                      <span className="text-lg absolute -bottom-1 -right-1 opacity-30">{b.emoji}</span>
                    </div>
                    <div className="mt-1 text-center">
                      <Badge className="bg-slate-900/90 text-white border-0 text-[8px] px-1.5 py-0 h-4 font-bold">📄 PDF{b.pages ? ` · ${b.pages}p` : ''}</Badge>
                    </div>
                  </div>

                  {/* Right: title, tagline, subjects, CTAs */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="pr-14">
                      <p className="font-black text-[13px] leading-tight text-slate-900 dark:text-slate-100 line-clamp-2">
                        {b.title}
                      </p>
                      <p className="text-[10px] font-semibold mt-0.5" style={{ color: b.accent }}>
                        {b.tagline}
                      </p>
                    </div>

                    {/* Subject chips */}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(b.subjects || []).map(s => (
                        <span key={s} className={`text-[8px] font-bold px-1.5 py-[1px] rounded-md text-white/95 bg-gradient-to-r ${b.gradient} opacity-90`}>
                          {s}
                        </span>
                      ))}
                    </div>

                    {/* CTAs */}
                    <div className="flex gap-1.5 mt-2">
                      <Button
                        size="sm"
                        disabled={viewing}
                        onClick={() => openView(b)}
                        className="flex-1 h-9 rounded-lg text-[11px] font-black bg-white text-slate-900 border-2 hover:bg-slate-50 active:scale-[0.97] transition"
                        style={{ borderColor: b.accent, color: b.accent }}
                      >
                        {viewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (<><Eye className="w-3.5 h-3.5 mr-1" /> View</>)}
                      </Button>
                      <Button
                        size="sm"
                        disabled={downloading}
                        onClick={() => download(b)}
                        className={`flex-1 h-9 rounded-lg text-[11px] font-black text-white shadow-md active:scale-[0.97] transition bg-gradient-to-r ${b.gradient}`}
                      >
                        {downloading ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Downloading…</>
                        ) : (
                          <><Zap className="w-3.5 h-3.5 mr-1 -ml-0.5 fill-white" /> Instant Download</>
                        )}
                      </Button>
                    </div>

                    {/* Stats row */}
                    {(b.downloadCount > 0 || b.viewCount > 0) && (
                      <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                        {b.downloadCount > 0 && <span>🔥 {b.downloadCount.toLocaleString()} downloads</span>}
                        {b.viewCount > 0 && <span>👁 {b.viewCount.toLocaleString()} views</span>}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 pt-3 pb-1">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">More LO Books ↓</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>
    </>
  )
}

// ============================================================
//  FeaturedMcmNotes — eye-catching monthly MCM notes strip
// ------------------------------------------------------------
//  Curated, self-contained HTML note pages served from
//  /api/mcm-notes.  Cards show the MONTH + MCM title in a bold
//  gradient design.  Tapping "Read Notes" opens the full HTML
//  document inside a sandboxed <iframe srcDoc> reader overlay.
// ============================================================
function FeaturedMcmNotes({ api, go }) {
  const [notes, setNotes] = useState(null)
  const [open, setOpen] = useState(null)      // active note meta
  const [html, setHtml] = useState('')        // active note HTML
  const [loadingHtml, setLoadingHtml] = useState(false)
  const iframeRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api('/mcm-notes')
      .then(r => { if (!cancelled) setNotes(r.notes || []) })
      .catch(() => { if (!cancelled) setNotes([]) })
    return () => { cancelled = true }
  }, [api])

  const read = async (n) => {
    setOpen(n); setHtml(''); setLoadingHtml(true)
    api('/mcm-notes/' + encodeURIComponent(n.key) + '/view', { method: 'POST' }).catch(() => {})
    try {
      const r = await api('/mcm-notes/' + encodeURIComponent(n.key))
      setHtml(r.html || '')
    } catch (e) {
      toast.error(e.message || 'Could not load notes')
      setOpen(null)
    } finally {
      setLoadingHtml(false)
    }
  }

  // Scroll the reader container to an in-document anchor (e.g. "#s3").
  // The iframe is expanded to full content height (no inner scrollbar), so
  // native hash jumps can't scroll it — we translate the target element's
  // position into the outer scroll container and scroll there instead.
  const scrollToAnchor = (rawId) => {
    try {
      const f = iframeRef.current, c = scrollRef.current
      if (!f || !c) return
      const doc = f.contentDocument
      if (!doc) return
      const id = decodeURIComponent(String(rawId || ''))
      if (!id) return
      const el = doc.getElementById(id) || doc.getElementsByName(id)[0]
      if (!el) return
      const cRect = c.getBoundingClientRect()
      const iRect = f.getBoundingClientRect()
      const iframeTopWithinContainer = (iRect.top - cRect.top) + c.scrollTop
      const elTop = el.getBoundingClientRect().top // relative to iframe viewport (not internally scrolled)
      const HEADER_PAD = 10
      c.scrollTo({ top: Math.max(0, iframeTopWithinContainer + elTop - HEADER_PAD), behavior: 'smooth' })
    } catch (_) { /* ignore */ }
  }

  const handleFrameLoad = () => {
    try {
      const f = iframeRef.current
      if (!f) return
      const doc = f.contentDocument
      // Make in-page TOC (ବିଷୟସୂଚୀ) links clickable: intercept anchor clicks and
      // scroll the outer container to the matching section.
      if (doc && !doc.__mcmAnchorBound) {
        doc.__mcmAnchorBound = true
        doc.addEventListener('click', (e) => {
          const t = e.target
          const a = t && t.closest ? t.closest('a[href^="#"]') : null
          if (!a) return
          const href = a.getAttribute('href') || ''
          if (href.length < 2) return
          e.preventDefault()
          scrollToAnchor(href.slice(1))
        }, true)
        // Nice affordance: make anchor links look clickable.
        try {
          const style = doc.createElement('style')
          style.textContent = 'a[href^="#"]{cursor:pointer}'
          doc.head && doc.head.appendChild(style)
        } catch (_) { /* ignore */ }
      }
      // Auto-size to content (single outer scroll).
      setTimeout(() => {
        try {
          const h = f.contentDocument?.documentElement?.scrollHeight || 900
          f.style.height = Math.max(500, Math.min(h + 40, 60000)) + 'px'
        } catch (_) { /* ignore */ }
      }, 80)
    } catch (_) { /* ignore */ }
  }

  // ---- Full-document reader overlay ----
  if (open) {
    return (
      <div className="fixed inset-0 z-[70] bg-background flex flex-col">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-700 text-white px-4 py-3 flex items-center gap-3 shadow-lg">
          <button onClick={() => { setOpen(null); setHtml('') }} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0"><ArrowLeft className="w-4 h-4" /></button>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">{open.monthEn} · MCM Notes</div>
            <div className="text-sm font-black leading-tight truncate">{open.emoji} {open.title}</div>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {loadingHtml || !html ? (
            <div className="py-16 text-center text-xs text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading {open.monthEn} notes…</div>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={html}
              onLoad={handleFrameLoad}
              sandbox="allow-same-origin"
              title={open.title}
              className="w-full block bg-white"
              style={{ height: 900, border: 'none' }}
              loading="eager"
            />
          )}
        </div>
      </div>
    )
  }

  // 🧠 Test Your MCM Knowledge — CTA shown at the top of the MCM Guide,
  // always visible (even while notes load / if there are none).
  const testCta = go ? (
    <button
      onClick={() => go('mcm-test')}
      className="w-full mb-3 relative overflow-hidden rounded-2xl p-4 text-left bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-lg active:scale-[0.99] transition">
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-yellow-300/25 rounded-full blur-2xl" />
      <div className="flex items-center gap-3 relative">
        <div className="text-4xl leading-none drop-shadow">🧠</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[8px] font-black bg-white/25 px-1.5 py-0.5 rounded-full">NEW</span>
            <span className="text-[8px] font-black bg-white/20 px-1.5 py-0.5 rounded-full">🏆 CERTIFICATE</span>
          </div>
          <p className="font-black text-base leading-tight">Test Your MCM Knowledge</p>
          <p className="text-[11px] opacity-95">ପରୀକ୍ଷା ଦେଇସାରିଛନ୍ତି? ନିଜ ଜ୍ଞାନକୁ ଥରେ ପରୀକ୍ଷା କରନ୍ତୁ! · Pass & get a certificate</p>
        </div>
        <ChevronRight className="w-5 h-5 opacity-90 shrink-0" />
      </div>
    </button>
  ) : null

  if (notes === null) {
    return (
      <>
        {testCta}
        <Card className="p-4 rounded-2xl border-2 border-dashed">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading featured MCM notes…</div>
        </Card>
      </>
    )
  }
  if (!notes.length) return testCta

  return (
    <>
      {testCta}
      {/* Section header */}
      <div className="pt-1 pb-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
          </div>
          <div className="text-[11px] font-black uppercase tracking-widest bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
            📘 Featured · Monthly MCM Notes
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 pl-6">
          Month-wise Cluster-level Meeting notes — simple, section-wise & ready to revise. Tap to read 👇
        </p>
      </div>

      {/* Month cards */}
      <div className="space-y-2.5">
        {notes.map(n => (
          <div
            key={n.key}
            className={`group relative overflow-hidden rounded-2xl p-[2px] bg-gradient-to-br ${n.gradient} shadow-lg shadow-black/10 hover:shadow-xl transition-shadow`}
          >
            <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute -inset-y-6 -left-1/3 w-1/3 rotate-12 bg-white/25 blur-xl animate-[shine_1.6s_ease-in-out]" />
            </div>

            <Card className="relative rounded-[14px] bg-white/95 dark:bg-slate-950/90 backdrop-blur border-0 overflow-hidden">
              {/* Ribbon badge */}
              <div className="absolute top-0 right-0 z-10">
                <div className={`text-[8px] font-black tracking-widest text-white px-2.5 py-1 rounded-bl-xl shadow-md bg-gradient-to-r ${n.gradient}`}>
                  {n.badge}
                </div>
              </div>

              <div className="flex gap-3 p-3">
                {/* Left: bold MONTH calendar tile */}
                <div className="shrink-0">
                  <div className={`w-16 h-20 rounded-xl bg-gradient-to-br ${n.gradient} text-white flex flex-col items-center justify-center shadow-lg relative overflow-hidden`}>
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-95 leading-none">{n.monthShort}</span>
                    <span className="text-2xl font-black leading-none drop-shadow mt-1">{n.year}</span>
                    <span className="text-lg absolute -bottom-1 -right-1 opacity-30">{n.emoji}</span>
                  </div>
                </div>

                {/* Right: month + MCM title + CTA */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="pr-14">
                    <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: n.accent }}>
                      {n.monthLabel}
                    </p>
                    <p className="font-black text-[13px] leading-tight text-slate-900 dark:text-slate-100 line-clamp-2">
                      {n.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{n.subtitle}</p>
                  </div>

                  {n.tagline && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {String(n.tagline).split(' · ').map((s, i) => (
                        <span key={i} className={`text-[8px] font-bold px-1.5 py-[1px] rounded-md text-white/95 bg-gradient-to-r ${n.gradient} opacity-90`}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1.5 mt-2">
                    <Button
                      size="sm"
                      onClick={() => read(n)}
                      className={`flex-1 h-9 rounded-lg text-[11px] font-black text-white shadow-md active:scale-[0.97] transition bg-gradient-to-r ${n.gradient}`}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" /> Read Notes
                    </Button>
                  </div>

                  {n.viewCount > 0 && (
                    <div className="flex items-center gap-2 mt-1.5 text-[9px] text-muted-foreground">
                      <span>👁 {Number(n.viewCount).toLocaleString()} reads</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 pt-3 pb-1">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">More MCM Guides ↓</span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
      </div>
    </>
  )
}
