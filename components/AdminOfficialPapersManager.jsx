'use client'
// ============================================================================
//  AdminOfficialPapersManager — Upload + list + hide/delete official papers.
//  Mounted inside the Admin Dashboard as a dedicated section.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Upload, Loader2, FileText, Trash2, EyeOff, Eye,
  Plus, X, RefreshCw, ClipboardCheck,
  BarChart3, TrendingUp, Users, Printer, HardDrive,
  ChevronDown, ChevronUp, Award, Calendar,
} from 'lucide-react'

const apiCall = async (path, options = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const r = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body,
  })
  const isJson = (r.headers.get('content-type') || '').includes('json')
  const d = isJson ? await r.json().catch(() => ({})) : {}
  if (!r.ok) { const err = new Error(d.error || 'Error'); err.status = r.status; throw err }
  return d
}
const jsonApi = (path, opts = {}) => apiCall(path, {
  ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  body: opts.body ? JSON.stringify(opts.body) : undefined,
})

const EXAM_TYPES = [
  { value: 'fa1', label: 'FA1 (Formative 1)' },
  { value: 'fa2', label: 'FA2 (Formative 2)' },
  { value: 'sa1', label: 'SA1 (Summative 1)' },
  { value: 'sa2', label: 'SA2 (Summative 2)' },
  { value: 'practice', label: 'Practice Test' },
  { value: 'model', label: 'Model Paper' },
  { value: 'board', label: 'Board Paper' },
]

const currentYear = () => {
  const now = new Date()
  const y = now.getFullYear()
  // Academic year like 2025-26
  return now.getMonth() >= 3 ? `${y}-${String((y + 1) % 100).padStart(2, '0')}` : `${y - 1}-${String(y % 100).padStart(2, '0')}`
}

export default function AdminOfficialPapersManager() {
  const [showUpload, setShowUpload] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  // Class + Subject filter (server-side) + multi-select for the main list
  const [filters, setFilters] = useState({ classId: '', bookId: '' })
  const [facetClasses, setFacetClasses] = useState([])
  const [facetBooks, setFacetBooks] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [deleting, setDeleting] = useState(false)
  // Analytics
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsOpen, setAnalyticsOpen] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ limit: '200' })
      if (filters.classId) qs.set('classId', filters.classId)
      if (filters.bookId) qs.set('bookId', filters.bookId)
      const r = await jsonApi(`/admin/official-papers?${qs.toString()}`)
      setItems(r.items || [])
      setSelectedIds([])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [filters])
  const loadFacets = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      if (filters.classId) qs.set('classId', filters.classId)
      const r = await jsonApi(`/admin/official-papers/facets?${qs.toString()}`)
      setFacetClasses(r.classes || [])
      setFacetBooks(r.books || [])
    } catch (_e) { /* non-critical */ }
  }, [filters.classId])
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true)
    try {
      const r = await jsonApi('/admin/official-papers/analytics')
      setAnalytics(r)
    } catch (e) { /* silent — analytics is non-critical */ }
    finally { setAnalyticsLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { loadFacets() }, [loadFacets])
  useEffect(() => { loadAnalytics() }, [loadAnalytics])

  const toggleSelect = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const allSelected = items.length > 0 && selectedIds.length === items.length
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : items.map(p => p.id))
  const deleteSelected = async () => {
    if (!selectedIds.length) return
    if (typeof window !== 'undefined' && !window.confirm(`⚠️ Permanently delete ${selectedIds.length} selected Instant Assessment Paper(s)?\n\nThis also removes their PDF files from storage. This cannot be undone.`)) return
    setDeleting(true)
    try {
      const r = await jsonApi('/admin/official-papers/bulk-delete', { method: 'POST', body: { ids: selectedIds } })
      toast.success(`Deleted ${r.deleted} paper(s).`)
      setSelectedIds([]); load(); loadAnalytics()
    } catch (e) { toast.error(e.message) } finally { setDeleting(false) }
  }

  const removeOne = async (paper) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete "${paper.title}"? This removes the PDF from storage.`)) return
    try {
      await jsonApi(`/admin/official-papers/${paper.id}`, { method: 'DELETE' })
      toast.success('Paper deleted.')
      load(); loadAnalytics()
    } catch (e) { toast.error(e.message) }
  }
  const toggleHide = async (paper) => {
    try {
      await jsonApi(`/admin/official-papers/${paper.id}`, { method: 'PATCH', body: { hiddenByAdmin: !paper.hiddenByAdmin } })
      toast.success(paper.hiddenByAdmin ? 'Paper published.' : 'Paper hidden.')
      load(); loadAnalytics()
    } catch (e) { toast.error(e.message) }
  }
  // 👁 Test User Visibility — runs the exact user-facing query and reports why
  // a paper is / isn't visible to normal (subscribed) users.
  const testVisibility = async (paper) => {
    try {
      const r = await jsonApi(`/admin/official-papers/${paper.id}/visibility`)
      if (r.visible) {
        toast.success(`✅ VISIBLE to users · ${r.resolvedClass || r.stored.className} · ${r.resolvedBook || r.stored.bookName} · ${(r.stored.examType || '').toUpperCase()} Set ${r.stored.setLetter}`, { duration: 6000 })
      } else {
        toast.error(`❌ NOT VISIBLE — ${r.reasons.join(', ') || 'unknown'}. Class=${r.resolvedClass || '?'} Book=${r.resolvedBook || '?'} Published=${!r.stored.hiddenByAdmin} File=${r.stored.hasFile}`, { duration: 9000 })
      }
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 border border-blue-200 p-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">Admin · SCERT/OSEPA Papers</div>
            <div className="text-sm font-black text-slate-900 leading-tight">
              {items.length} paper{items.length !== 1 ? 's' : ''} uploaded
            </div>
          </div>
          <button onClick={() => setShowUpload(true)} className="text-xs font-black text-white bg-blue-600 rounded-full px-3 py-1.5 flex items-center gap-1 hover:brightness-110 active:scale-95">
            <Plus className="w-3.5 h-3.5" /> Upload PDF
          </button>
          <button onClick={() => setShowBulk(true)} className="text-xs font-black text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-full px-3 py-1.5 flex items-center gap-1 hover:brightness-110 active:scale-95">
            <Upload className="w-3.5 h-3.5" /> Bulk
          </button>
          <button onClick={() => setShowBulkDelete(true)} title="Delete every paper in a chosen Class + Subject (with optional exam-type / year filters)" className="text-xs font-black text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1.5 flex items-center gap-1 hover:bg-red-100 active:scale-95">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={() => { load(); loadAnalytics() }} disabled={loading} className="text-xs font-bold text-blue-700 bg-white rounded-full border border-blue-200 px-2 py-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Class + Subject filter + bulk selection bar ─────────────── */}
      <div className="rounded-2xl bg-white border border-slate-200 p-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Class</label>
            <select value={filters.classId} onChange={e => setFilters({ classId: e.target.value, bookId: '' })}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-2 text-sm font-bold bg-white">
              <option value="">All Classes</option>
              {facetClasses.map(c => <option key={c.classId} value={c.classId}>{c.className} ({c.count})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Subject</label>
            <select value={filters.bookId} onChange={e => setFilters(f => ({ ...f, bookId: e.target.value }))}
              disabled={!filters.classId}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-2 text-sm font-bold bg-white disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">{filters.classId ? 'All Subjects for this class' : 'Select a class first'}</option>
              {facetBooks.map(b => <option key={b.bookId} value={b.bookId}>{b.bookName} ({b.count})</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={items.length === 0} className="w-4 h-4" />
            Select All
          </label>
          <span className="text-xs text-slate-500">{items.length} paper{items.length !== 1 ? 's' : ''} · {selectedIds.length} selected</span>
          <div className="flex-1" />
          <button onClick={deleteSelected} disabled={!selectedIds.length || deleting}
            className="text-xs font-black text-white bg-red-600 rounded-full px-3 py-1.5 flex items-center gap-1 disabled:opacity-40 hover:brightness-110 active:scale-95">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete Selected
          </button>
          {(filters.classId) && (
            <button onClick={() => setShowBulkDelete(true)}
              className="text-xs font-black text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1.5 flex items-center gap-1 hover:bg-red-100 active:scale-95">
              <Trash2 className="w-3.5 h-3.5" /> Delete All for this Class+Subject
            </button>
          )}
        </div>
      </div>

      {/* ── Analytics Panel ─────────────────────────────────────────── */}
      <AnalyticsPanel
        analytics={analytics}
        loading={analyticsLoading}
        open={analyticsOpen}
        onToggle={() => setAnalyticsOpen(o => !o)}
        onRefresh={loadAnalytics}
      />

      {/* List */}
      {loading && (
        <div className="rounded-xl bg-white border border-slate-200 p-6 text-center text-xs text-slate-500">
          <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> Loading…
        </div>
      )}
      {!loading && items.length === 0 && (
        <div className="rounded-xl bg-white border border-slate-200 p-6 text-center text-xs text-slate-500">
          {(filters.classId || filters.bookId)
            ? <>📭 No Instant Assessment Papers found for the selected Class{filters.bookId ? ' + Subject' : ''}.</>
            : <>No papers yet — click <b>Upload PDF</b> to add your first one.</>}
        </div>
      )}
      {!loading && items.map(p => (
        <div key={p.id} className={`rounded-xl bg-white border overflow-hidden ${selectedIds.includes(p.id) ? 'border-red-400 ring-1 ring-red-300' : 'border-slate-200'}`}>
          <div className="flex items-start gap-2 p-2.5">
            <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 mt-1 flex-shrink-0" title="Select for deletion" />
            <div className="w-14 h-16 flex-shrink-0 bg-slate-100 rounded overflow-hidden">
              {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center"><FileText className="w-6 h-6 text-slate-400" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-black tracking-widest text-blue-700">
                {p.examType?.toUpperCase()} · Set {p.setLetter} · {p.year}
                {p.hiddenByAdmin && <span className="ml-1 text-red-600">· HIDDEN</span>}
              </div>
              <div className="text-[12.5px] font-black text-slate-900 leading-tight line-clamp-2">{p.title}</div>
              <div className="text-[10.5px] text-slate-500 mt-0.5">{p.className} · {p.bookName} · {p.pages}p · {(p.bytes / 1024).toFixed(0)}KB · ↓{p.downloadCount || 0}</div>
            </div>
            <div className="flex flex-col gap-1">
              <a href={p.pdfUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 p-1.5" title="Open PDF">
                <Eye className="w-3.5 h-3.5" />
              </a>
              <button onClick={() => toggleHide(p)} className={`rounded-lg p-1.5 ${p.hiddenByAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`} title={p.hiddenByAdmin ? 'Publish' : 'Hide'}>
                {p.hiddenByAdmin ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => testVisibility(p)} className="rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 p-1.5" title="Test User Visibility — runs the real user query">
                <ClipboardCheck className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => removeOne(p)} className="rounded-lg bg-red-100 hover:bg-red-200 text-red-700 p-1.5" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={() => { setShowUpload(false); load() }} />}
      {showBulk && <BulkUploadModal onClose={() => setShowBulk(false)} onDone={() => { setShowBulk(false); load() }} />}
      {showBulkDelete && <BulkDeletePapersModal onClose={() => { setShowBulkDelete(false); load(); loadAnalytics() }} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AnalyticsPanel — Overview + breakdowns for the Instant Assessment Papers.
// Shows: KPI tiles, exam-type distribution, class/subject leaderboard,
// top papers by print count, recent uploads, and monthly upload trend.
// ---------------------------------------------------------------------------
const humanBytes = (n) => {
  if (!n) return '0 B'
  const u = ['B','KB','MB','GB']
  let i = 0, v = Number(n) || 0
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}
const humanDate = (s) => {
  if (!s) return ''
  try {
    const d = new Date(s)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return String(s) }
}
const EXAM_COLORS = {
  fa1: 'from-blue-500 to-indigo-600',
  fa2: 'from-purple-500 to-fuchsia-600',
  sa1: 'from-emerald-500 to-teal-600',
  sa2: 'from-amber-500 to-orange-600',
  practice: 'from-sky-500 to-cyan-600',
  model: 'from-pink-500 to-rose-600',
  board: 'from-red-500 to-rose-600',
}
const barColor = (k) => EXAM_COLORS[k] || 'from-slate-500 to-slate-700'

const KpiTile = ({ icon: Icon, label, value, sub, gradient = 'from-slate-500 to-slate-700' }) => (
  <div className={`rounded-xl bg-gradient-to-br ${gradient} p-3 text-white shadow`}>
    <div className="flex items-center gap-1.5 opacity-90 text-[10px] uppercase tracking-widest font-black">
      <Icon className="w-3.5 h-3.5" /> {label}
    </div>
    <div className="text-2xl font-black mt-1 leading-none">{value}</div>
    {sub && <div className="text-[10.5px] opacity-90 mt-0.5 font-bold">{sub}</div>}
  </div>
)

const HBar = ({ label, count, prints, previews, max, gradient = 'from-blue-500 to-indigo-600' }) => {
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 0
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
        <div className="truncate mr-2">{label}</div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-shrink-0">
          <span>{count} paper{count !== 1 ? 's' : ''}</span>
          <span className="text-blue-700">🖨️ {prints}</span>
          <span className="text-emerald-700">👁 {previews}</span>
        </div>
      </div>
      <div className="mt-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${gradient} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const AnalyticsPanel = ({ analytics, loading, open, onToggle, onRefresh }) => {
  const ov = analytics?.overview
  const byExamType = analytics?.byExamType || []
  const byClass = analytics?.byClass || []
  const bySubject = analytics?.bySubject || []
  const byYear = analytics?.byYear || []
  const topPapers = analytics?.topPapers || []
  const recentUploads = analytics?.recentUploads || []
  const uploadsByMonth = analytics?.uploadsByMonth || []
  // User activity block (may be absent on very old cached responses).
  const act = analytics?.activity || { overview: { totalEvents: 0, prints: 0, previews: 0, uniqueUsers: 0, uniquePapers: 0 }, topUsers: [], recentActivity: [], activityByDay: [] }

  const maxExamCount = Math.max(1, ...byExamType.map(x => x.count))
  const maxClassCount = Math.max(1, ...byClass.map(x => x.count))
  const maxSubjectCount = Math.max(1, ...bySubject.map(x => x.count))
  const maxMonth = Math.max(1, ...uploadsByMonth.map(x => x.count))
  const engagementRate = ov && ov.totalPreviews > 0
    ? Math.round((ov.totalPrints / ov.totalPreviews) * 100)
    : 0

  return (
    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-slate-50 to-blue-50 hover:from-slate-100 hover:to-blue-100 transition text-left"
      >
        <BarChart3 className="w-4 h-4 text-blue-600" />
        <div className="text-sm font-black text-slate-900 flex-1">📊 Analytics</div>
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
        <button
          onClick={(e) => { e.stopPropagation(); onRefresh() }}
          className="text-[10px] font-black text-blue-700 bg-white border border-blue-200 rounded-full px-2 py-1 hover:bg-blue-50"
        >
          <RefreshCw className={`w-3 h-3 inline -mt-0.5 mr-0.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="p-3 space-y-4">
          {!analytics && loading && (
            <div className="text-center text-xs text-slate-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Loading analytics…
            </div>
          )}
          {!analytics && !loading && (
            <div className="text-center text-xs text-slate-500 py-4">
              No analytics data available yet.
            </div>
          )}

          {analytics && (
            <>
              {/* ── KPI Tiles ─────────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <KpiTile
                  icon={FileText} label="Total Papers"
                  value={ov.totalPapers.toLocaleString()}
                  sub={`${ov.published} live · ${ov.hidden} hidden`}
                  gradient="from-blue-600 to-indigo-700"
                />
                <KpiTile
                  icon={Printer} label="Total Prints"
                  value={ov.totalPrints.toLocaleString()}
                  sub={ov.totalPapers > 0 ? `avg ${(ov.totalPrints / ov.totalPapers).toFixed(1)} / paper` : '—'}
                  gradient="from-emerald-600 to-teal-700"
                />
                <KpiTile
                  icon={Eye} label="Previews"
                  value={ov.totalPreviews.toLocaleString()}
                  sub={`${engagementRate}% convert to print`}
                  gradient="from-purple-600 to-fuchsia-700"
                />
                <KpiTile
                  icon={HardDrive} label="Storage"
                  value={humanBytes(ov.totalBytes)}
                  sub={`${ov.totalPages.toLocaleString()} total pages`}
                  gradient="from-amber-600 to-orange-700"
                />
              </div>

              {/* ── Coverage chip strip ───────────────────────────── */}
              <div className="flex items-center gap-1.5 text-[10.5px] font-bold flex-wrap">
                <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                  <Users className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                  {ov.uniqueClasses} class{ov.uniqueClasses !== 1 ? 'es' : ''} covered
                </span>
                <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                  📖 {ov.uniqueBooks} subject{ov.uniqueBooks !== 1 ? 's' : ''}
                </span>
                <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                  <Calendar className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                  {ov.uniqueYears} year{ov.uniqueYears !== 1 ? 's' : ''}
                </span>
              </div>

              {/* ── By Exam Type & By Year ────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">By Exam Type</div>
                  {byExamType.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No data</div>
                  ) : byExamType.map(e => (
                    <HBar
                      key={e.examType}
                      label={<span className={`inline-block px-1.5 py-0.5 rounded text-white text-[10px] font-black bg-gradient-to-r ${barColor(e.examType)}`}>{(e.examType || '').toUpperCase()}</span>}
                      count={e.count} prints={e.prints} previews={e.previews}
                      max={maxExamCount}
                      gradient={barColor(e.examType)}
                    />
                  ))}
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">By Academic Year</div>
                  {byYear.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No data</div>
                  ) : byYear.map(y => (
                    <HBar
                      key={y.year}
                      label={<span className="font-bold">{y.year}</span>}
                      count={y.count} prints={y.prints} previews={y.previews}
                      max={Math.max(1, ...byYear.map(z => z.count))}
                      gradient="from-slate-600 to-slate-800"
                    />
                  ))}
                </div>
              </div>

              {/* ── By Class & By Subject ─────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">By Class</div>
                  {byClass.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No data</div>
                  ) : byClass.map(c => (
                    <HBar
                      key={c.classId || c.className}
                      label={<span className="font-bold">{c.className || '—'}</span>}
                      count={c.count} prints={c.prints} previews={c.previews}
                      max={maxClassCount}
                      gradient="from-cyan-500 to-blue-600"
                    />
                  ))}
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2">Top Subjects</div>
                  {bySubject.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No data</div>
                  ) : bySubject.slice(0, 8).map((s, i) => (
                    <HBar
                      key={`${s.className}-${s.bookName}-${i}`}
                      label={<span className="font-bold truncate inline-block max-w-[220px]" title={`${s.bookName} — ${s.className}`}>{s.bookName} <span className="text-slate-400">· {s.className}</span></span>}
                      count={s.count} prints={s.prints} previews={s.previews}
                      max={maxSubjectCount}
                      gradient="from-violet-500 to-purple-700"
                    />
                  ))}
                </div>
              </div>

              {/* ── Top papers by prints ──────────────────────────── */}
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-600" /> Top 10 Most-Printed Papers
                </div>
                {topPapers.length === 0 ? (
                  <div className="text-[11px] text-slate-400">No prints recorded yet.</div>
                ) : (
                  <div className="space-y-1">
                    {topPapers.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2 text-[11.5px] p-1.5 rounded-lg hover:bg-slate-50">
                        <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300 text-slate-700'}`}>
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-slate-900 truncate">{p.title}</div>
                          <div className="text-[10px] text-slate-500 truncate">{p.className} · {p.bookName} · Set {p.setLetter} · {p.year}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-black text-blue-700">🖨 {p.prints}</div>
                          <div className="text-[9.5px] text-slate-400">👁 {p.previews}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Recent Uploads & Trend ────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" /> Recent Uploads
                  </div>
                  {recentUploads.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No uploads yet.</div>
                  ) : (
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {recentUploads.map(p => (
                        <div key={p.id} className="text-[11px] py-1 border-b border-slate-100 last:border-0">
                          <div className="font-bold text-slate-900 truncate">{p.title}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                            <span className="text-blue-700 font-black uppercase">{p.examType}</span>
                            <span>· {p.className}</span>
                            <span>· Set {p.setLetter}</span>
                            {p.hiddenByAdmin && <span className="text-red-600 font-black">· HIDDEN</span>}
                            <span className="ml-auto text-slate-400">{humanDate(p.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Uploads (Last 12 Months)
                  </div>
                  {uploadsByMonth.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No uploads in the last 12 months.</div>
                  ) : (
                    <div className="flex items-end gap-1 h-32 pt-2">
                      {uploadsByMonth.map(m => {
                        const h = Math.max(4, (m.count / maxMonth) * 100)
                        return (
                          <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${m.month}: ${m.count} upload(s)`}>
                            <div className="text-[9px] font-black text-slate-600">{m.count}</div>
                            <div className="w-full bg-gradient-to-t from-emerald-500 to-teal-400 rounded-t" style={{ height: `${h}%` }} />
                            <div className="text-[8.5px] text-slate-400 truncate w-full text-center">{m.month.slice(5)}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              {/* ── User Activity Section ──────────────────────────── */}
              <div className="rounded-xl border border-slate-200 p-3 bg-gradient-to-br from-indigo-50/40 to-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] font-black uppercase tracking-widest text-indigo-700 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> User Activity
                  </div>
                  <div className="text-[10px] font-black text-slate-500">
                    {act.overview.uniqueUsers} unique user{act.overview.uniqueUsers !== 1 ? 's' : ''} · {act.overview.totalEvents} event{act.overview.totalEvents !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Activity KPI mini-tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <KpiTile icon={Users} label="Unique Users" value={act.overview.uniqueUsers.toLocaleString()} gradient="from-indigo-500 to-blue-700" />
                  <KpiTile icon={Printer} label="Print Events" value={act.overview.prints.toLocaleString()} gradient="from-blue-500 to-cyan-600" />
                  <KpiTile icon={Eye} label="Preview Events" value={act.overview.previews.toLocaleString()} gradient="from-violet-500 to-fuchsia-700" />
                  <KpiTile icon={FileText} label="Papers Touched" value={act.overview.uniquePapers.toLocaleString()} sub={`of ${ov.published}`} gradient="from-emerald-500 to-teal-700" />
                </div>

                {/* Daily trend sparkline */}
                {act.activityByDay.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10.5px] font-black uppercase tracking-widest text-slate-500 mb-1">Activity — Last 30 Days</div>
                    <div className="flex items-end gap-0.5 h-16 border-b border-slate-200 pt-1">
                      {act.activityByDay.map(day => {
                        const mx = Math.max(1, ...act.activityByDay.map(d => d.total))
                        const h = Math.max(3, (day.total / mx) * 100)
                        return (
                          <div key={day.date} className="flex-1 min-w-0 flex flex-col items-center" title={`${day.date}: ${day.prints} prints, ${day.previews} previews`}>
                            <div className="w-full bg-gradient-to-t from-indigo-500 to-blue-400 rounded-t" style={{ height: `${h}%` }} />
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 mt-1">
                      <span>{act.activityByDay[0]?.date?.slice(5) || ''}</span>
                      <span>{act.activityByDay[act.activityByDay.length - 1]?.date?.slice(5) || ''}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Top users leaderboard */}
                  <div>
                    <div className="text-[10.5px] font-black uppercase tracking-widest text-slate-500 mb-1.5 flex items-center gap-1">
                      <Award className="w-3 h-3 text-amber-600" /> Top Users
                    </div>
                    {act.topUsers.length === 0 ? (
                      <div className="text-[11px] text-slate-400">No user activity yet.</div>
                    ) : (
                      <div className="space-y-1">
                        {act.topUsers.slice(0, 8).map((u, i) => (
                          <div key={u.userId} className="flex items-center gap-2 text-[11px] p-1.5 rounded-lg hover:bg-slate-50">
                            <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300 text-slate-700'}`}>{i + 1}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-black text-slate-900 truncate">
                                {u.userName || '(no name)'}
                                {u.userRole === 'admin' && <span className="ml-1 text-[9px] font-black text-red-600 bg-red-50 px-1 py-0.5 rounded">ADMIN</span>}
                              </div>
                              <div className="text-[9.5px] text-slate-500">
                                {u.userMobile || '—'} · {u.papersCount} paper{u.papersCount !== 1 ? 's' : ''} · Last: {humanDate(u.lastActive)}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-black text-indigo-700">{u.events} events</div>
                              <div className="text-[9px] text-slate-400">🖨 {u.prints} · 👁 {u.previews}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Live audit feed */}
                  <div>
                    <div className="text-[10.5px] font-black uppercase tracking-widest text-slate-500 mb-1.5 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-600" /> Recent Activity
                    </div>
                    {act.recentActivity.length === 0 ? (
                      <div className="text-[11px] text-slate-400">No activity recorded yet.</div>
                    ) : (
                      <div className="space-y-0.5 max-h-64 overflow-y-auto pr-1">
                        {act.recentActivity.map(e => (
                          <div key={e.id} className="text-[11px] py-1 border-b border-slate-100 last:border-0 flex items-start gap-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9.5px] font-black flex-shrink-0 ${e.action === 'print' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                              {e.action === 'print' ? '🖨 PRINT' : '👁 VIEW'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {e.userName || '(anon)'}
                                <span className="text-slate-400 font-normal"> · {e.userMobile || ''}</span>
                              </div>
                              <div className="text-[9.5px] text-slate-500 truncate">
                                {(e.examType || '').toUpperCase()} · {e.className} · {e.bookName} · Set {e.setLetter}
                              </div>
                            </div>
                            <div className="text-[9px] text-slate-400 flex-shrink-0 text-right">
                              {humanDate(e.createdAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upload modal — Class/Book/ExamType/Set/Year metadata + PDF file
// ---------------------------------------------------------------------------
const UploadModal = ({ onClose, onDone }) => {
  const [classes, setClasses] = useState([])
  const [books, setBooks] = useState([])
  const [existingPapers, setExistingPapers] = useState([])
  const [form, setForm] = useState({ classId: '', bookId: '', examType: 'fa1', setLetter: 'A', year: currentYear(), title: '', description: '' })
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    fetch('/api/classes').then(r => r.json()).then(d => setClasses(d.classes || [])).catch(() => {})
  }, [])
  useEffect(() => {
    if (!form.classId) { setBooks([]); return }
    fetch(`/api/books?classId=${form.classId}`).then(r => r.json()).then(d => setBooks(d.books || [])).catch(() => {})
  }, [form.classId])
  useEffect(() => {
    if (!form.classId || !form.bookId || !form.examType || !form.year) { setExistingPapers([]); return }
    const qs = new URLSearchParams({ classId: form.classId, bookId: form.bookId, examType: form.examType, year: form.year })
    jsonApi(`/admin/official-papers?${qs}`).then(r => setExistingPapers(r.items || [])).catch(() => {})
  }, [form.classId, form.bookId, form.examType, form.year])

  const usedSets = useMemo(() => new Set(existingPapers.map(p => p.setLetter)), [existingPapers])
  const nextSet = useMemo(() => {
    for (const L of ['A','B','C','D','E','F','G','H']) if (!usedSets.has(L)) return L
    return 'A'
  }, [usedSets])
  useEffect(() => { setForm(f => ({ ...f, setLetter: nextSet })) }, [nextSet])

  // Auto-suggest title
  useEffect(() => {
    const cls = classes.find(c => c.id === form.classId)
    const bk  = books.find(b => b.id === form.bookId)
    if (cls && bk && form.examType && form.setLetter) {
      const label = EXAM_TYPES.find(e => e.value === form.examType)?.label.split(' ')[0] || form.examType.toUpperCase()
      const suggested = `${label} · ${cls.name} · ${bk.name} · Set ${form.setLetter}`
      setForm(f => ({ ...f, title: f.title && f.title !== suggested ? f.title : suggested }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.classId, form.bookId, form.examType, form.setLetter])

  const submit = async () => {
    if (!file) { toast.error('Please select a PDF file'); return }
    if (file.size > 25 * 1024 * 1024) { toast.error('PDF too large — max 25 MB'); return }
    if (!form.classId || !form.bookId || !form.examType || !form.setLetter || !form.year) {
      toast.error('Please fill in all required fields'); return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      Object.entries(form).forEach(([k, v]) => v && fd.append(k, v))
      await apiCall('/admin/official-papers/upload', { method: 'POST', body: fd })
      toast.success('📄 PDF uploaded successfully!')
      onDone()
    } catch (e) {
      toast.error(e.message || 'Upload failed')
    } finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center gap-2 p-3 border-b border-slate-200">
          <Upload className="w-4 h-4 text-blue-600" />
          <div className="text-sm font-black">Upload Instant Assessment Paper</div>
          <button onClick={onClose} className="ml-auto w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
          {/* Class */}
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Class *</label>
            <select value={form.classId} onChange={e => setForm(f => ({ ...f, classId: e.target.value, bookId: '' }))}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">— Select class —</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {/* Book */}
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Subject / Book *</label>
            <select value={form.bookId} onChange={e => setForm(f => ({ ...f, bookId: e.target.value }))}
              disabled={!form.classId}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50">
              <option value="">{form.classId ? '— Select subject —' : 'Select class first'}</option>
              {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Exam Type */}
            <div>
              <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Exam Type *</label>
              <select value={form.examType} onChange={e => setForm(f => ({ ...f, examType: e.target.value }))}
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {EXAM_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            {/* Year */}
            <div>
              <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Year *</label>
              <input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                placeholder="2025-26"
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          </div>
          {/* Set letter */}
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">
              Set Letter * {usedSets.size > 0 && <span className="text-red-600 normal-case font-bold">· Already used: {Array.from(usedSets).join(', ')}</span>}
            </label>
            <div className="grid grid-cols-8 gap-1 mt-1">
              {['A','B','C','D','E','F','G','H'].map(L => (
                <button key={L}
                  onClick={() => setForm(f => ({ ...f, setLetter: L }))}
                  disabled={usedSets.has(L)}
                  className={`h-9 rounded-lg text-sm font-black transition ${form.setLetter === L ? 'bg-blue-600 text-white' : usedSets.has(L) ? 'bg-red-50 text-red-400 line-through cursor-not-allowed' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  {L}
                </button>
              ))}
            </div>
          </div>
          {/* Title */}
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Title (auto-suggested)</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          {/* Description */}
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Description (optional)</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm resize-none" />
          </div>
          {/* File picker */}
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">PDF File * (max 25 MB)</label>
            <input ref={fileRef} type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="w-full mt-1 rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50 py-4 px-3 text-center transition">
              {file ? (
                <div>
                  <FileText className="w-6 h-6 mx-auto text-emerald-600" />
                  <div className="text-xs font-black text-slate-900 mt-1 truncate">{file.name}</div>
                  <div className="text-[10px] text-slate-500">{(file.size / 1024).toFixed(0)} KB</div>
                </div>
              ) : (
                <div>
                  <Upload className="w-6 h-6 mx-auto text-slate-400" />
                  <div className="text-[11px] text-slate-600 mt-1 font-bold">Click to select PDF</div>
                </div>
              )}
            </button>
          </div>
        </div>
        <div className="p-3 border-t border-slate-200 flex gap-2">
          <button onClick={onClose} disabled={uploading} className="flex-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold h-10">Cancel</button>
          <button onClick={submit} disabled={uploading || !file}
            className="flex-1 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-sm font-black h-10 hover:brightness-110 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1">
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bulk Upload Modal — drag-drop many PDFs, share common metadata, auto-assign
// Set Letters (A, B, C, D…) in file-selection order. Uploads sequentially so
// server-side uniqueness checks + Cloudinary rate limits are respected.
// ---------------------------------------------------------------------------
const BulkUploadModal = ({ onClose, onDone }) => {
  const [classes, setClasses] = useState([])
  const [books, setBooks] = useState([])
  const [existingPapers, setExistingPapers] = useState([])
  const [form, setForm] = useState({ classId: '', bookId: '', examType: 'fa1', year: currentYear(), description: '' })
  const [queue, setQueue] = useState([]) // [{ id, file, status:'pending'|'uploading'|'done'|'error'|'skip', setLetter, error? }]
  const [uploading, setUploading] = useState(false)
  const [autoParse, setAutoParse] = useState(true)
  const fileRef = useRef(null)

  useEffect(() => {
    fetch('/api/classes').then(r => r.json()).then(d => setClasses(d.classes || [])).catch(() => {})
  }, [])
  useEffect(() => {
    if (!form.classId) { setBooks([]); return }
    fetch(`/api/books?classId=${form.classId}`).then(r => r.json()).then(d => setBooks(d.books || [])).catch(() => {})
  }, [form.classId])
  useEffect(() => {
    if (!form.classId || !form.bookId || !form.examType || !form.year) { setExistingPapers([]); return }
    const qs = new URLSearchParams({ classId: form.classId, bookId: form.bookId, examType: form.examType, year: form.year })
    jsonApi(`/admin/official-papers?${qs}`).then(r => setExistingPapers(r.items || [])).catch(() => {})
  }, [form.classId, form.bookId, form.examType, form.year])

  const usedSets = useMemo(() => new Set(existingPapers.map(p => p.setLetter)), [existingPapers])

  // Assign auto Set Letters skipping already-used ones
  const assignLetters = useCallback((files) => {
    const availableLetters = 'ABCDEFGHIJKLMNOP'.split('').filter(L => !usedSets.has(L))
    return files.map((f, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      status: 'pending',
      setLetter: availableLetters[i] || '',
      error: null,
      title: '',
    }))
  }, [usedSets])

  // Try to auto-parse metadata from filename like:
  //   FA1_Class1_Bhasha_O_Paribesh_Set_A.pdf
  //   fa2-class3-english-setB.pdf
  //   sa1_kg_ganita_seta.pdf
  const parseFilename = useCallback((filename) => {
    const stem = filename.replace(/\.pdf$/i, '')
    const parts = stem.split(/[_\-\s]+/).map(p => p.toLowerCase())
    const meta = {}
    // examType
    for (const p of parts) {
      if (['fa1', 'fa2', 'sa1', 'sa2', 'practice', 'model', 'board'].includes(p)) { meta.examType = p; break }
    }
    // class
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith('class')) {
        const n = parts[i].replace('class', '')
        if (n) meta.classHint = 'Class ' + n
        else if (parts[i + 1] && /^\d+$/.test(parts[i + 1])) meta.classHint = 'Class ' + parts[i + 1]
        break
      }
    }
    // set letter
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === 'set' && parts[i + 1]) { meta.setLetter = parts[i + 1][0].toUpperCase(); break }
      const m = parts[i].match(/^set([a-h])$/)
      if (m) { meta.setLetter = m[1].toUpperCase(); break }
    }
    return meta
  }, [])

  const addFiles = (files) => {
    const arr = Array.from(files || []).filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    if (arr.length === 0) { toast.error('No PDF files detected'); return }
    const oversized = arr.filter(f => f.size > 25 * 1024 * 1024)
    if (oversized.length > 0) {
      toast.error(`${oversized.length} file(s) exceed 25 MB — skipped`)
    }
    const valid = arr.filter(f => f.size <= 25 * 1024 * 1024)
    if (valid.length === 0) return

    // Auto-parse first file's class/examType to help admin
    if (autoParse && valid[0]) {
      const meta = parseFilename(valid[0].name)
      const upd = {}
      if (meta.examType && !form.examType) upd.examType = meta.examType
      if (meta.classHint && !form.classId) {
        const c = classes.find(c => (c.name || '').toLowerCase() === meta.classHint.toLowerCase())
        if (c) upd.classId = c.id
      }
      if (Object.keys(upd).length > 0) setForm(f => ({ ...f, ...upd }))
    }

    const newRows = assignLetters(valid).map(row => {
      if (autoParse) {
        const meta = parseFilename(row.file.name)
        if (meta.setLetter) row.setLetter = meta.setLetter
      }
      return row
    })
    setQueue(q => [...q, ...newRows])
  }

  const removeRow = (id) => setQueue(q => q.filter(r => r.id !== id))
  const updateRow = (id, patch) => setQueue(q => q.map(r => r.id === id ? { ...r, ...patch } : r))

  const startUpload = async () => {
    if (!form.classId || !form.bookId || !form.examType || !form.year) {
      toast.error('Please fill Class, Book, Exam Type, and Year first'); return
    }
    if (queue.length === 0) { toast.error('Add at least one PDF'); return }
    // Validate all rows have unique set letters and none clash with used sets
    const seen = new Set()
    for (const r of queue) {
      if (!r.setLetter) { toast.error(`Missing set letter for "${r.file.name}"`); return }
      if (seen.has(r.setLetter)) { toast.error(`Duplicate set letter ${r.setLetter} within your queue`); return }
      if (usedSets.has(r.setLetter)) { toast.error(`Set ${r.setLetter} already exists on server for this class/book/year`); return }
      seen.add(r.setLetter)
    }
    setUploading(true)
    let done = 0, failed = 0
    for (const row of queue) {
      if (row.status === 'done') { done++; continue }
      updateRow(row.id, { status: 'uploading', error: null })
      try {
        const fd = new FormData()
        fd.append('pdf', row.file)
        fd.append('classId', form.classId)
        fd.append('bookId', form.bookId)
        fd.append('examType', form.examType)
        fd.append('year', form.year)
        fd.append('setLetter', row.setLetter)
        if (form.description) fd.append('description', form.description)
        if (row.title) fd.append('title', row.title)
        await apiCall('/admin/official-papers/upload', { method: 'POST', body: fd })
        updateRow(row.id, { status: 'done', error: null })
        done++
      } catch (e) {
        updateRow(row.id, { status: 'error', error: e.message || 'Upload failed' })
        failed++
      }
    }
    setUploading(false)
    if (failed === 0) {
      toast.success(`✅ Uploaded ${done} paper${done !== 1 ? 's' : ''}`)
      setTimeout(onDone, 800)
    } else {
      toast.error(`Uploaded ${done}, ${failed} failed — see rows for details`)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center gap-2 p-3 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-fuchsia-50">
          <Upload className="w-4 h-4 text-purple-600" />
          <div className="text-sm font-black">Bulk Upload Papers</div>
          <button onClick={onClose} disabled={uploading} className="ml-auto w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
          {/* Common metadata */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Class *</label>
              <select value={form.classId} onChange={e => setForm(f => ({ ...f, classId: e.target.value, bookId: '' }))}
                disabled={uploading}
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">— Select —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Subject *</label>
              <select value={form.bookId} onChange={e => setForm(f => ({ ...f, bookId: e.target.value }))}
                disabled={!form.classId || uploading}
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50">
                <option value="">— Select —</option>
                {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Exam Type *</label>
              <select value={form.examType} onChange={e => setForm(f => ({ ...f, examType: e.target.value }))}
                disabled={uploading}
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {EXAM_TYPES.map(e => <option key={e.value} value={e.value}>{e.label.split(' ')[0]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Year *</label>
              <input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                disabled={uploading}
                placeholder="2025-26"
                className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-500">Description (optional, shared)</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              disabled={uploading}
              className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 select-none">
            <input type="checkbox" checked={autoParse} onChange={e => setAutoParse(e.target.checked)} className="w-3.5 h-3.5" disabled={uploading} />
            Auto-detect Set Letter + Class from filename (e.g. FA1_Class1_..._SetA.pdf)
          </label>

          {/* Drop zone */}
          <input ref={fileRef} type="file" accept="application/pdf" multiple onChange={e => { addFiles(e.target.files); e.target.value = '' }} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); addFiles(e.dataTransfer.files) }}
            className="w-full rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 py-5 px-3 text-center transition disabled:opacity-50">
            <Upload className="w-7 h-7 mx-auto text-purple-500" />
            <div className="text-[12px] font-black text-slate-900 mt-1">Click or drop multiple PDFs here</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Max 25 MB per file. Sets auto-assigned A, B, C, D…</div>
          </button>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {queue.map((row, idx) => (
                <div key={row.id} className="p-2.5 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11.5px] font-bold text-slate-900 truncate">{row.file.name}</div>
                    <div className="text-[10px] text-slate-500">{(row.file.size / 1024).toFixed(0)} KB</div>
                    {row.error && <div className="text-[10px] text-red-600 font-bold mt-0.5">⚠ {row.error}</div>}
                  </div>
                  <select value={row.setLetter} onChange={e => updateRow(row.id, { setLetter: e.target.value })}
                    disabled={uploading || row.status === 'done'}
                    className="w-14 border border-slate-300 rounded px-1 py-1 text-xs font-black text-center">
                    {['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'].map(L => (
                      <option key={L} value={L} disabled={usedSets.has(L)}>Set {L}{usedSets.has(L) ? ' (used)' : ''}</option>
                    ))}
                  </select>
                  <div className="w-8 flex-shrink-0 text-center">
                    {row.status === 'pending' && <div className="w-5 h-5 rounded-full bg-slate-100 mx-auto" title="Pending" />}
                    {row.status === 'uploading' && <Loader2 className="w-4 h-4 text-purple-600 animate-spin mx-auto" />}
                    {row.status === 'done' && <div className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center mx-auto">✓</div>}
                    {row.status === 'error' && <div className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center mx-auto">!</div>}
                  </div>
                  <button onClick={() => removeRow(row.id)} disabled={uploading} className="text-slate-400 hover:text-red-600 disabled:opacity-30">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-slate-200 flex gap-2">
          <button onClick={onClose} disabled={uploading} className="flex-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold h-10">
            {uploading ? 'Uploading…' : 'Cancel'}
          </button>
          <button onClick={startUpload} disabled={uploading || queue.length === 0}
            className="flex-[2] rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-sm font-black h-10 hover:brightness-110 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1">
            {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading ({queue.filter(r => r.status === 'done').length}/{queue.length})…</> : <><Upload className="w-4 h-4" /> Upload {queue.length || ''}{queue.length ? ` PDF${queue.length !== 1 ? 's' : ''}` : ''}</>}
          </button>
        </div>
      </div>
    </div>
  )
}



// ---------------------------------------------------------------------------
//  BulkDeletePapersModal — always-clickable "Delete Papers" flow.
//  Loads facets (class list) → after class chosen, loads books/subjects for
//  that class → optional exam-type / year filters → previews count →
//  type "delete" confirm → POST /admin/official-papers/bulk-delete.
// ---------------------------------------------------------------------------
const BulkDeletePapersModal = ({ onClose }) => {
  const [classes, setClasses] = useState([])         // [{classId, className, count}]
  const [books, setBooks] = useState([])             // [{bookId, bookName, count}]
  const [examTypes, setExamTypes] = useState([])     // [{examType, count}]
  const [years, setYears] = useState([])             // [{year, count}]
  const [classId, setClassId] = useState('')
  const [bookId, setBookId] = useState('')
  const [examType, setExamType] = useState('')
  const [year, setYear] = useState('')
  const [previewCount, setPreviewCount] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Cache the picked class name for the confirmation summary.
  const className = useMemo(() => classes.find(c => c.classId === classId)?.className || '', [classes, classId])
  const bookName  = useMemo(() => books.find(b => b.bookId === bookId)?.bookName || '', [books, bookId])

  const facets = useCallback(async (params = {}) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => !!v)).toString()
    const res = await fetch(`/api/admin/official-papers/facets${qs ? '?' + qs : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }, [])

  // Initial load — classes.
  useEffect(() => {
    facets()
      .then(d => setClasses(d.classes || []))
      .catch(() => toast.error('Failed to load classes'))
  }, [facets])

  // When class changes → reload subject/exam/year facets scoped to that class.
  useEffect(() => {
    setBookId(''); setExamType(''); setYear(''); setBooks([]); setExamTypes([]); setYears([]); setPreviewCount(null)
    if (!classId) return
    facets({ classId })
      .then(d => {
        setBooks(d.books || [])
        setExamTypes(d.examTypes || [])
        setYears(d.years || [])
        setPreviewCount(d.total || 0)
      })
      .catch(() => toast.error('Failed to load subjects'))
  }, [classId, facets])

  // When any additional filter changes → refresh preview count only.
  useEffect(() => {
    if (!classId) return
    facets({ classId, bookId, examType, year })
      .then(d => setPreviewCount(d.total || 0))
      .catch(() => {})
  }, [classId, bookId, examType, year, facets])

  const submit = async () => {
    if (!classId) return toast.error('Choose a Class first.')
    if (confirmText.trim().toLowerCase() !== 'delete') return toast.error('Type "delete" to confirm.')
    setDeleting(true)
    const t = toast.loading(`Deleting ${previewCount} paper${previewCount === 1 ? '' : 's'}…`)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
      const body = { classId }
      if (bookId)   body.bookId   = bookId
      if (examType) body.examType = examType
      if (year)     body.year     = year
      const res = await fetch('/api/admin/official-papers/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      toast.success(`Deleted ${data.deleted} paper${data.deleted === 1 ? '' : 's'}.`, { id: t })
      onClose()
    } catch (e) { toast.error(`Delete failed: ${e.message}`, { id: t }) }
    finally { setDeleting(false) }
  }

  const canSubmit = !!classId && (previewCount ?? 0) > 0 && confirmText.trim().toLowerCase() === 'delete' && !deleting

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-3 flex items-center gap-2 border-b border-slate-100">
          <Trash2 className="w-4 h-4 text-red-600" />
          <div className="text-sm font-black text-red-700">Delete Instant Papers</div>
          <button onClick={onClose} className="ml-auto p-1 rounded-full hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-3 space-y-3 overflow-y-auto">
          <div className="text-[11px] text-slate-600">
            Removes every paper matching the scope below <b>and</b> deletes the associated PDFs from Cloudinary. This action is <b className="text-red-700">permanent</b>.
          </div>

          {/* Class */}
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Class <span className="text-red-600">*</span></label>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white">
              <option value="">— Select class —</option>
              {classes.map(c => <option key={c.classId} value={c.classId}>{c.className} ({c.count})</option>)}
            </select>
            {!classes.length && <div className="text-[10px] text-slate-500 mt-1">No papers uploaded yet.</div>}
          </div>

          {/* Subject / Book */}
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Subject (optional — leave blank = all subjects in this class)</label>
            <select value={bookId} onChange={(e) => setBookId(e.target.value)} disabled={!classId}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">— All subjects in this class —</option>
              {books.map(b => <option key={b.bookId} value={b.bookId}>{b.bookName} ({b.count})</option>)}
            </select>
          </div>

          {/* Exam type + Year — grid */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase font-black text-slate-500">Exam type (optional)</label>
              <select value={examType} onChange={(e) => setExamType(e.target.value)} disabled={!classId}
                className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">All types</option>
                {examTypes.map(t => <option key={t.examType} value={t.examType}>{(t.examType || '').toUpperCase()} ({t.count})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase font-black text-slate-500">Year (optional)</label>
              <select value={year} onChange={(e) => setYear(e.target.value)} disabled={!classId}
                className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">All years</option>
                {years.map(y => <option key={y.year} value={y.year}>{y.year} ({y.count})</option>)}
              </select>
            </div>
          </div>

          {/* Preview */}
          {previewCount !== null && classId && (
            <div className={`rounded-lg p-2.5 text-[11px] ${previewCount > 0 ? 'bg-red-50 border border-red-200 text-red-900' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>
              {previewCount > 0
                ? <><b>{previewCount}</b> paper{previewCount === 1 ? '' : 's'} will be deleted from <b>{className}{bookName ? ' · ' + bookName : ''}{examType ? ' · ' + examType.toUpperCase() : ''}{year ? ' · ' + year : ''}</b>.</>
                : <>No papers found for this scope.</>}
            </div>
          )}

          {/* Confirm text (case-insensitive) */}
          {previewCount > 0 && (
            <div>
              <label className="text-[9px] uppercase font-black text-slate-500">
                Type <span className="text-red-700 normal-case font-black">delete</span> to confirm
                <span className="ml-1 normal-case text-slate-400 font-bold">(not case-sensitive)</span>
              </label>
              <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder="delete"
                autoCapitalize="off" autoCorrect="off" spellCheck={false}
                className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1" />
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={deleting}
            className="text-xs font-black text-slate-700 bg-white border border-slate-300 rounded-full px-3 py-1.5 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={!canSubmit}
            className="text-xs font-black text-white bg-red-600 hover:bg-red-700 rounded-full px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
            {deleting ? <><Loader2 className="w-3 h-3 animate-spin" /> Deleting…</> : <><Trash2 className="w-3 h-3" /> Delete {previewCount || 0}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
