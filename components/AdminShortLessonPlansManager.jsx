'use client'
// ============================================================================
//  AdminShortLessonPlansManager
//  ---------------------------------------------------------------------------
//  Admin-panel entry under "Content Management → Short Lesson Plans".
//  Responsibilities:
//    • Download the official HTML template (with all <meta name="em-*"> tags).
//    • Upload a ZIP archive containing 190 P001.html … P190.html files.
//    • Upload a single .html file (manual override of metadata allowed).
//    • Show a filterable list of every uploaded lesson.
//    • Publish / draft / delete rows.
//    • Show quick analytics (total lessons, views, per-class breakdown).
//
//  Design mirrors AdminOfficialPapersManager for visual consistency.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Upload, Loader2, FileText, Trash2, EyeOff, Eye, X, RefreshCw,
  Sparkles, Download, BarChart3, Search, Archive,
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

const humanBytes = (n) => {
  if (!n) return '0 B'
  const u = ['B','KB','MB','GB']
  let i = 0, v = Number(n) || 0
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

export default function AdminShortLessonPlansManager() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [analytics, setAnalytics] = useState(null)

  // filters
  const [flt, setFlt] = useState({ className: '', subject: '', chapter: '', status: '', q: '' })

  // upload modals
  const [showBulk, setShowBulk] = useState(false)
  const [showSingle, setShowSingle] = useState(false)
  // bulk-delete modal (opens on "Delete Subject" click regardless of filter state)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  // PERF: the admin list can hold up to 1500 periods. Rendering them all at once
  // froze the page — so we render a capped window and let the admin reveal more.
  const PAGE = 150
  const [showCount, setShowCount] = useState(PAGE)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(flt).forEach(([k, v]) => { if (v && k !== 'q') params.set(k, v) })
      const r = await jsonApi('/admin/short-lesson-plans?' + params.toString())
      setItems(r.items || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [flt])

  const loadAnalytics = useCallback(async () => {
    try { setAnalytics(await jsonApi('/admin/short-lesson-plans/analytics')) } catch (_) {}
  }, [])

  useEffect(() => { load(); loadAnalytics() }, [load, loadAnalytics])

  // Filter dropdown options come from the DB-level facets endpoint (distinct
  // values across ALL rows) — NOT from the capped `items` list, otherwise any
  // class/subject beyond the first 1500 loaded rows would be missing from the
  // dropdowns (e.g. only Class 1 & 2 showing when 3355 lessons span 4 classes).
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [chapters, setChapters] = useState([])

  const fetchFacets = useCallback((params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString()
    return jsonApi('/admin/short-lesson-plans/facets' + (qs ? '?' + qs : ''))
  }, [])

  useEffect(() => {
    fetchFacets().then(d => setClasses(d.classes || [])).catch(() => {})
  }, [fetchFacets])

  useEffect(() => {
    fetchFacets({ className: flt.className }).then(d => setSubjects(d.subjects || [])).catch(() => setSubjects([]))
  }, [flt.className, fetchFacets])

  useEffect(() => {
    fetchFacets({ className: flt.className, subject: flt.subject })
      .then(d => setChapters((d.chapters || []).map(c => (typeof c === 'string' ? c : c.chapter)).filter(Boolean)))
      .catch(() => setChapters([]))
  }, [flt.className, flt.subject, fetchFacets])

  const filtered = useMemo(() => {
    const qx = flt.q.trim().toLowerCase()
    if (!qx) return items
    return items.filter(i =>
      String(i.title || '').toLowerCase().includes(qx) ||
      String(i.chapter || '').toLowerCase().includes(qx) ||
      String(i.loCode || '').toLowerCase().includes(qx) ||
      String(i.dakhyataCode || '').toLowerCase().includes(qx) ||
      String(i.day || '').includes(qx),
    )
  }, [items, flt.q])

  // Reset the visible window whenever the result set changes (filter/search/reload).
  useEffect(() => { setShowCount(PAGE) }, [flt.className, flt.subject, flt.chapter, flt.status, flt.q, items])
  const visible = useMemo(() => filtered.slice(0, showCount), [filtered, showCount])

  const togglePublish = async (row) => {
    try {
      await jsonApi(`/admin/short-lesson-plans/${row.id}`, { method: 'PATCH', body: { status: row.status === 'published' ? 'draft' : 'published' } })
      toast.success(row.status === 'published' ? 'Moved to draft.' : 'Published.')
      load(); loadAnalytics()
    } catch (e) { toast.error(e.message) }
  }
  const removeOne = async (row) => {
    if (!confirm(`Delete "${row.title}"? This cannot be undone.`)) return
    try {
      await jsonApi(`/admin/short-lesson-plans/${row.id}`, { method: 'DELETE' })
      toast.success('Deleted.')
      load(); loadAnalytics()
    } catch (e) { toast.error(e.message) }
  }

  // Bulk-delete lives in a modal (see <BulkDeleteModal/>) so the admin can
  // choose class/subject/chapter fresh — the button is ALWAYS clickable and
  // the modal handles validation, preview count, and confirmation.

  // Download the HTML template.  We deliberately do NOT rely on
  // <a download href="/api/…"> because that approach fails silently in
  // several situations:
  //   • Some ad-blockers cancel /api/* downloads without notice — the click
  //     succeeds but the browser shows "site wasn't available" in the
  //     downloads panel.
  //   • If the response has any cross-origin redirect (Kubernetes ingress
  //     rewriting), the `download` attribute is ignored and the browser
  //     just navigates to the URL.
  //   • The success toast fires synchronously with a.click() so the user
  //     sees "downloaded" even when the actual save failed.
  // Instead we fetch the bytes ourselves, wrap them in a Blob, and hand a
  // same-origin object-URL to the anchor — this guarantees the file lands
  // in the user's downloads folder before we show the toast.
  const downloadTemplate = async () => {
    const t = toast.loading('Preparing template…')
    try {
      const res = await fetch('/api/short-lesson-plans/template', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const blob = await res.blob()
      if (!blob || blob.size < 500) throw new Error('Template file is empty or corrupt')
      // Force HTML MIME regardless of what the server sent (some proxies
      // strip Content-Type on download endpoints and Chrome then refuses).
      const htmlBlob = new Blob([blob], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(htmlBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'LessonPlan_Template_LessonGuru_Odisha.html'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      // Detach + revoke on the next tick so Safari finishes reading the blob.
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 500)
      toast.success('Template downloaded.', { id: t })
    } catch (e) {
      toast.error(`Download failed: ${e?.message || 'unknown error'}`, { id: t })
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-800 text-white p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <div>
            <div className="text-[10px] uppercase tracking-widest font-black opacity-90">Content Management</div>
            <div className="text-lg font-black">Short Lesson Plans</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={downloadTemplate} className="text-xs font-black bg-white/15 hover:bg-white/25 rounded-full px-3 py-1.5 flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Template
            </button>
            <button onClick={() => setShowSingle(true)} className="text-xs font-black bg-white text-indigo-700 hover:bg-white/90 rounded-full px-3 py-1.5 flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" /> Upload HTML
            </button>
            <button onClick={() => setShowBulk(true)} className="text-xs font-black bg-amber-300 text-slate-900 hover:bg-amber-200 rounded-full px-3 py-1.5 flex items-center gap-1">
              <Archive className="w-3.5 h-3.5" /> Upload ZIP
            </button>
            <button onClick={() => { load(); loadAnalytics() }} disabled={loading} className="text-xs font-black bg-white/15 rounded-full p-1.5 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Analytics tiles */}
      {analytics?.overview && (
        <div className="rounded-2xl bg-white border border-slate-200 p-3">
          <div className="text-[10px] uppercase tracking-widest font-black text-slate-500 mb-2 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> Overview
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { l: 'Total Lessons', v: analytics.overview.totalLessons || 0, g: 'from-indigo-600 to-blue-700' },
              { l: 'Published',     v: analytics.overview.published    || 0, g: 'from-emerald-500 to-teal-700' },
              { l: 'Drafts',        v: analytics.overview.drafts       || 0, g: 'from-slate-500 to-slate-700' },
              { l: 'Total Views',   v: (analytics.overview.totalViews  || 0).toLocaleString(), g: 'from-purple-500 to-fuchsia-700' },
              { l: 'Storage',       v: humanBytes(analytics.overview.totalBytes || 0), g: 'from-amber-500 to-orange-700' },
            ].map((t, i) => (
              <div key={i} className={`rounded-xl p-2 bg-gradient-to-br ${t.g} text-white`}>
                <div className="text-[9px] uppercase font-black opacity-90">{t.l}</div>
                <div className="text-lg font-black leading-tight">{t.v}</div>
              </div>
            ))}
          </div>
          {analytics.byClass?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {analytics.byClass.map(c => (
                <span key={c.className} className="text-[10px] font-bold bg-slate-100 rounded-full px-2 py-0.5">
                  {c.className}: <span className="text-indigo-700 font-black">{c.count}</span>
                  {c.views > 0 && <span className="text-slate-500"> · 👁 {c.views}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl bg-white border border-slate-200 p-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Class</label>
            <select value={flt.className} onChange={(e) => setFlt(f => ({ ...f, className: e.target.value, subject: '', chapter: '' }))}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white">
              <option value="">All classes</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Subject</label>
            <select value={flt.subject} onChange={(e) => setFlt(f => ({ ...f, subject: e.target.value, chapter: '' }))}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white">
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Chapter</label>
            <select value={flt.chapter} onChange={(e) => setFlt(f => ({ ...f, chapter: e.target.value }))}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white">
              <option value="">All chapters</option>
              {chapters.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Status</label>
            <select value={flt.status} onChange={(e) => setFlt(f => ({ ...f, status: e.target.value }))}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white">
              <option value="">All</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Search</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-slate-400" />
              <input value={flt.q} onChange={(e) => setFlt(f => ({ ...f, q: e.target.value }))}
                placeholder="title, LO, chapter, day…"
                className="w-full text-xs font-bold border border-slate-300 rounded-lg pl-7 pr-2 py-1.5 mt-1 bg-white" />
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest font-black text-slate-500">
            Lessons · <span className="text-indigo-700">{filtered.length}</span>
            {flt.className && flt.subject && (
              <span className="ml-2 normal-case text-[10px] text-slate-500 font-bold">
                in {flt.className} · {flt.subject}{flt.chapter ? ` · ${flt.chapter}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            <button
              onClick={() => setShowBulkDelete(true)}
              title="Delete lessons by Class + Subject — whole subject or a single chapter"
              className="text-[11px] font-black bg-red-600 hover:bg-red-700 text-white rounded-full px-3 py-1.5 flex items-center gap-1 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Lessons
            </button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No lessons found. Use <b>Upload ZIP</b> to bulk-import a 190-period pack.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {visible.map(row => (
              <div key={row.id} className="p-2.5 flex items-start gap-2 text-[11.5px] hover:bg-slate-50">
                <div className="w-10 flex-shrink-0 text-center">
                  <div className="text-[8.5px] font-black text-slate-500 uppercase">Day</div>
                  <div className="text-sm font-black text-indigo-700">{row.day}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-slate-900 truncate">{row.title || `Period ${row.period}`}</div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">
                    {row.className} · {row.subject} · {row.chapter}
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className="text-[9px] font-black bg-slate-100 text-slate-700 rounded px-1.5 py-0.5">P{row.period}</span>
                    {row.loCode && <span className="text-[9px] font-black bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">{row.loCode}</span>}
                    {row.dakhyataCode && <span className="text-[9px] font-black bg-purple-50 text-purple-700 rounded px-1.5 py-0.5">{row.dakhyataCode}</span>}
                    {row.cgCode && <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5">{row.cgCode}</span>}
                    <span className="text-[9px] font-black text-slate-400 ml-auto">{humanBytes(row.htmlBytes)}</span>
                    <span className={`text-[9px] font-black rounded px-1.5 py-0.5 ${row.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{row.status}</span>
                    {row.viewCount > 0 && <span className="text-[9px] text-slate-500">👁 {row.viewCount}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => togglePublish(row)} title={row.status === 'published' ? 'Unpublish' : 'Publish'}
                    className="p-1.5 rounded-md hover:bg-slate-100">
                    {row.status === 'published' ? <EyeOff className="w-3.5 h-3.5 text-amber-600" /> : <Eye className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  <button onClick={() => removeOne(row)} title="Delete" className="p-1.5 rounded-md hover:bg-slate-100">
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length > visible.length && (
              <div className="p-3 flex flex-col items-center gap-2 bg-slate-50">
                <div className="text-[11px] text-slate-500">
                  Showing <b>{visible.length}</b> of <b>{filtered.length}</b> — narrow with the filters above to find faster.
                </div>
                <button
                  onClick={() => setShowCount(c => c + PAGE * 2)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-black hover:bg-indigo-700"
                >
                  Show more ({filtered.length - visible.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showSingle && <SingleUploadModal onClose={() => { setShowSingle(false); load(); loadAnalytics() }} />}
      {showBulk   && <BulkUploadModal   onClose={() => { setShowBulk(false);   load(); loadAnalytics() }} />}
      {showBulkDelete && <BulkDeleteModal onClose={() => { setShowBulkDelete(false); load(); loadAnalytics() }} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  BulkUploadModal — accepts a .zip, streams it to /bulk-upload, shows summary.
// ---------------------------------------------------------------------------
function BulkUploadModal({ onClose }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('published')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  const submit = async () => {
    if (!file) return toast.error('Choose a .zip file first')
    setUploading(true); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('status', status)
      const token = localStorage.getItem('em_token')
      const res = await fetch('/api/admin/short-lesson-plans/bulk-upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setResult(data)
      toast.success(`Imported ${data.ok || 0} lessons (${data.inserted || 0} new, ${data.replaced || 0} replaced)`)
    } catch (e) { toast.error(e.message) } finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="p-3 flex items-center gap-2 border-b border-slate-100">
          <Archive className="w-4 h-4 text-indigo-600" />
          <div className="text-sm font-black">Bulk Upload — .zip Archive</div>
          <button onClick={onClose} className="ml-auto p-1 rounded-full hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 space-y-3">
          <div className="text-[11px] text-slate-600">
            Upload a ZIP archive containing lesson HTML files (e.g. <code>P001.html</code> … <code>P190.html</code>).
            Metadata is auto-extracted from each file's <code>&lt;meta name="em-*"&gt;</code> tags — no manual data entry needed.
          </div>
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">ZIP file (max 200 MB)</label>
            <input ref={inputRef} type="file" accept=".zip" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs mt-1 border border-slate-300 rounded-lg px-2 py-1.5" />
            {file && <div className="text-[10px] text-slate-500 mt-1">{file.name} · {humanBytes(file.size)}</div>}
          </div>
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Status on upload</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white">
              <option value="published">Published (visible to teachers)</option>
              <option value="draft">Draft (admin-only)</option>
            </select>
          </div>
          {result && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-[11px]">
              <div className="font-black text-emerald-900">Ingest complete</div>
              <div>Imported: <b>{result.ok}</b> · New: <b>{result.inserted}</b> · Replaced: <b>{result.replaced}</b> · Skipped: <b>{result.skipped}</b></div>
              {(result.errors?.length || 0) > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer font-bold">{result.errors.length} errors</summary>
                  <div className="max-h-32 overflow-y-auto mt-1 text-[10px] text-red-700">
                    {result.errors.slice(0, 20).map((e, i) => <div key={i}>{e.file}: {e.error}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="p-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs font-black text-slate-700 bg-white border border-slate-300 rounded-full px-3 py-1.5">Close</button>
          <button onClick={submit} disabled={!file || uploading}
            className="text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-full px-3 py-1.5 disabled:opacity-50 flex items-center gap-1">
            {uploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</> : <><Upload className="w-3 h-3" /> Upload</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  SingleUploadModal — accepts one .html, sends it to /upload.
// ---------------------------------------------------------------------------
function SingleUploadModal({ onClose }) {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('published')
  const [uploading, setUploading] = useState(false)

  const submit = async () => {
    if (!file) return toast.error('Choose a .html file')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('status', status)
      const token = localStorage.getItem('em_token')
      const res = await fetch('/api/admin/short-lesson-plans/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      toast.success(`Uploaded: ${data.className} · ${data.subject} · Day ${data.day}`)
      onClose()
    } catch (e) { toast.error(e.message) } finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="p-3 flex items-center gap-2 border-b border-slate-100">
          <FileText className="w-4 h-4 text-indigo-600" />
          <div className="text-sm font-black">Upload Single HTML Lesson</div>
          <button onClick={onClose} className="ml-auto p-1 rounded-full hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 space-y-3">
          <div className="text-[11px] text-slate-600">
            Upload one .html lesson. Metadata is auto-extracted from <code>&lt;meta name="em-*"&gt;</code> tags — download the template first if you're unsure of the format.
          </div>
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">HTML file (max 20 MB)</label>
            <input type="file" accept=".html,.htm" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs mt-1 border border-slate-300 rounded-lg px-2 py-1.5" />
            {file && <div className="text-[10px] text-slate-500 mt-1">{file.name} · {humanBytes(file.size)}</div>}
          </div>
          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white">
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>
        <div className="p-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs font-black text-slate-700 bg-white border border-slate-300 rounded-full px-3 py-1.5">Close</button>
          <button onClick={submit} disabled={!file || uploading}
            className="text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-full px-3 py-1.5 disabled:opacity-50 flex items-center gap-1">
            {uploading ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</> : <><Upload className="w-3 h-3" /> Upload</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  BulkDeleteModal — always-clickable "Delete Subject" flow.
//  Loads facets, lets admin pick Class → Subject → optional Chapter,
//  previews the count that will be deleted, then calls the bulk-delete
//  endpoint with two confirmations (typing the class name + confirm button).
// ---------------------------------------------------------------------------
function BulkDeleteModal({ onClose }) {
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [chapters, setChapters] = useState([])
  const [className, setClassName] = useState('')
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [mode, setMode] = useState('subject') // 'subject' = delete all chapters · 'chapter' = one chapter
  const [previewCount, setPreviewCount] = useState(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Admin-only facets fetcher — uses the /admin/... endpoint which counts BOTH
  // published and draft rows (the public facets filters to `status:published`
  // only, causing the "Delete" button to stay disabled whenever admins tried
  // to remove a freshly-uploaded draft batch).
  const adminFacets = async (params = {}) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`/api/admin/short-lesson-plans/facets${qs ? '?' + qs : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }

  // Load available classes on mount.
  useEffect(() => {
    adminFacets()
      .then(d => setClasses(d.classes || []))
      .catch(() => toast.error('Failed to load class list'))
  }, [])

  // When class changes, reload subjects for that class.
  useEffect(() => {
    setSubject(''); setChapter(''); setChapters([]); setPreviewCount(null); setSubjects([])
    if (!className) return
    adminFacets({ className })
      .then(d => setSubjects(d.subjects || []))
      .catch(() => toast.error('Failed to load subject list'))
  }, [className])

  // When subject changes, reload chapters + preview count.
  useEffect(() => {
    setChapter(''); setMode('subject'); setChapters([]); setPreviewCount(null)
    if (!className || !subject) return
    adminFacets({ className, subject })
      .then(d => { setChapters(d.chapters || []); setPreviewCount(d.total || 0) })
      .catch(() => toast.error('Failed to load chapter list'))
  }, [className, subject])

  // When chapter / mode changes, re-fetch scoped count.
  useEffect(() => {
    if (!className || !subject) return
    const useChapter = mode === 'chapter' && chapter
    const params = useChapter ? { className, subject, chapter } : { className, subject }
    adminFacets(params).then(d => setPreviewCount(d.total || 0)).catch(() => {})
  }, [className, subject, chapter, mode])

  const submit = async () => {
    if (!className || !subject) return toast.error('Choose a Class AND Subject.')
    if (mode === 'chapter' && !chapter) return toast.error('Choose the chapter to delete.')
    if (confirmText.trim().toLowerCase() !== className.toLowerCase()) return toast.error(`Type "${className}" to confirm.`)
    setDeleting(true)
    const t = toast.loading(`Deleting ${previewCount} lessons…`)
    try {
      const token = localStorage.getItem('em_token')
      const res = await fetch('/api/admin/short-lesson-plans/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ className, subject, chapter: (mode === 'chapter' && chapter) ? chapter : undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      toast.success(`Deleted ${data.deleted} lesson${data.deleted === 1 ? '' : 's'}.`, { id: t })
      onClose()
    } catch (e) { toast.error(`Delete failed: ${e.message}`, { id: t }) }
    finally { setDeleting(false) }
  }

  const canSubmit = className && subject && previewCount > 0
    && (mode === 'subject' || (mode === 'chapter' && chapter))
    && confirmText.trim().toLowerCase() === className.toLowerCase() && !deleting

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        <div className="p-3 flex items-center gap-2 border-b border-slate-100">
          <Trash2 className="w-4 h-4 text-red-600" />
          <div className="text-sm font-black text-red-700">Delete Short Lessons</div>
          <button onClick={onClose} className="ml-auto p-1 rounded-full hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3 space-y-3">
          <div className="text-[11px] text-slate-600">
            Removes every Short Lesson row matching the scope below. This action is <b className="text-red-700">permanent</b>.
          </div>

          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Class *</label>
            <select value={className} onChange={(e) => setClassName(e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white">
              <option value="">— Select class —</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">Subject *</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!className}
              className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white disabled:bg-slate-50 disabled:text-slate-400">
              <option value="">— Select subject —</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[9px] uppercase font-black text-slate-500">What to delete</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => { setMode('subject'); setChapter('') }} disabled={!subject}
                className={`text-[11px] font-black rounded-lg px-2 py-2 border transition-colors disabled:opacity-40 ${mode === 'subject' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                Whole subject
                <div className="text-[8.5px] font-bold opacity-80 normal-case">all chapters</div>
              </button>
              <button type="button" onClick={() => setMode('chapter')} disabled={!subject || chapters.length === 0}
                className={`text-[11px] font-black rounded-lg px-2 py-2 border transition-colors disabled:opacity-40 ${mode === 'chapter' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
                One chapter
                <div className="text-[8.5px] font-bold opacity-80 normal-case">pick below</div>
              </button>
            </div>
          </div>

          {mode === 'chapter' && (
            <div>
              <label className="text-[9px] uppercase font-black text-slate-500">Chapter *</label>
              <select value={chapter} onChange={(e) => setChapter(e.target.value)} disabled={!subject}
                className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2 py-1.5 mt-1 bg-white disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">— Select chapter —</option>
                {chapters.map(c => <option key={c.chapter} value={c.chapter}>{c.chapter}</option>)}
              </select>
            </div>
          )}

          {previewCount !== null && className && subject && (
            <div className={`rounded-lg p-2.5 text-[11px] ${previewCount > 0 ? 'bg-red-50 border border-red-200 text-red-900' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>
              {previewCount > 0
                ? <><b>{previewCount}</b> lesson{previewCount === 1 ? '' : 's'} will be deleted from <b>{className} · {subject}{chapter ? ' · ' + chapter : ''}</b>.</>
                : <>No lessons found for this scope.</>}
            </div>
          )}

          {previewCount > 0 && (
            <div>
              <label className="text-[9px] uppercase font-black text-slate-500">
                Type <span className="text-red-700 normal-case">{className}</span> to confirm
                <span className="ml-1 normal-case text-slate-400 font-bold">(not case-sensitive)</span>
              </label>
              <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder={className}
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
