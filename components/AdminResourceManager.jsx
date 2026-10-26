'use client'
// ------------------------------------------------------------
// Academic Resources — Admin Manager
// ------------------------------------------------------------
// A single self-contained page that lets an admin:
//   • upload a new HTML resource (with metadata)
//   • preview / edit / replace / hide / publish / delete
//   • toggle allowPdfDownload per resource
//
// All operations hit /api/admin/academic-resources… endpoints
// which require admin role.  The uploaded HTML is server-side
// sanitized before it lands in Mongo (see /app/lib/academic-
// resources.js).  The preview here uses the SAME sandboxed
// iframe the user viewer uses, so the admin sees the exact
// user-facing render.
// ------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft, Upload, Search, Loader2, Eye, EyeOff, Pencil, Trash2,
  RefreshCw, X, Plus, FileText, CheckCircle2, Circle, Download, DownloadCloud, FolderArchive,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

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

const EMPTY_FORM = {
  resourceType: 'teaching_notes',
  contentType: 'html',           // 'html' | 'pdf'
  title: '',
  description: '',
  classId: '',
  className: '',
  subject: '',
  bookId: '',
  bookName: '',
  chapterId: '',
  chapterName: '',
  language: '',
  academicSession: '',
  fileName: '',
  sortOrder: 0,
  isPublished: false,
  isVisible: true,
  allowPdfDownload: false,
  allowPrint: false,
  passwordProtected: false,
  watermarkBrand: true,
  watermarkUser: false,
  watermarkSchool: false,
  htmlContent: '',
  // PDF-only (only used when contentType='pdf')
  pdfFile: null,             // File object staged for upload
  pdfSize: 0,
  pageCount: 0,
  thumbnailUrl: '',
}

export default function AdminResourceManager({ onBack, api = defaultApi }) {
  const [types, setTypes] = useState([])
  const [classes, setClasses] = useState([])
  const [items, setItems] = useState(null)
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState({ type: '', classId: '', subject: '', status: '', search: '' })

  const [editing, setEditing] = useState(null) // null | 'new' | resource object
  const [previewId, setPreviewId] = useState(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api('/academic-resources/types').then(r => setTypes(r.types || [])).catch(() => {})
    api('/classes').then(r => setClasses(r.classes || [])).catch(() => {})
  }, [api])

  const load = () => {
    const params = new URLSearchParams({ limit: '200' })
    if (filter.type) params.set('type', filter.type)
    if (filter.classId) params.set('classId', filter.classId)
    if (filter.subject) params.set('subject', filter.subject)
    if (filter.status) params.set('status', filter.status)
    if (filter.search) params.set('search', filter.search)
    setItems(null)
    api('/admin/academic-resources?' + params.toString())
      .then(r => { setItems(r.resources || []); setTotal(r.total || 0) })
      .catch(e => { setItems([]); toast.error(e.message) })
  }
  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
     
  }, [filter.type, filter.classId, filter.subject, filter.status, filter.search])

  const togglePublish = async (r) => {
    try {
      await api(`/admin/academic-resources/${r.id}/publish`, { method: 'PUT', body: { isPublished: !r.isPublished } })
      toast.success(!r.isPublished ? '✅ Published' : '⏸ Un-published')
      load()
    } catch (e) { toast.error(e.message) }
  }
  const toggleVisibility = async (r) => {
    try {
      await api(`/admin/academic-resources/${r.id}/visibility`, { method: 'PUT', body: { isVisible: !r.isVisible } })
      toast.success(!r.isVisible ? '👁 Visible' : '🙈 Hidden')
      load()
    } catch (e) { toast.error(e.message) }
  }
  const togglePdf = async (r) => {
    try {
      await api(`/admin/academic-resources/${r.id}/pdf-download`, { method: 'PUT', body: { allowPdfDownload: !r.allowPdfDownload } })
      toast.success(!r.allowPdfDownload ? '📄 PDF download enabled' : '🚫 PDF download disabled')
      load()
    } catch (e) { toast.error(e.message) }
  }
  const del = async (r) => {
    if (!window.confirm(`Delete "${r.title}"?  This soft-deletes the resource — it can be recovered from the audit log.`)) return
    try {
      await api(`/admin/academic-resources/${r.id}`, { method: 'DELETE' })
      toast.success('🗑 Deleted')
      load()
    } catch (e) { toast.error(e.message) }
  }

  // Read-only export: Chapterwise LO → ZIP (one HTML file per class).
  const exportLoZip = async () => {
    setExporting(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
      const res = await fetch('/api/admin/academic-resources/lo-export', {
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        toast.error(e?.error || `Export failed (${res.status})`)
        return
      }
      const classes = res.headers.get('X-LO-Classes')
      const chapters = res.headers.get('X-LO-Chapters')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') || ''
      const m = cd.match(/filename="?([^"]+)"?/)
      a.download = m ? m[1] : 'chapterwise-lo.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast.success(`Exported ${classes || '?'} class file(s) · ${chapters || '?'} chapter(s)`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="pb-24">
      <div className="sticky top-0 z-20 bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-4 py-3 flex items-center gap-2 shadow">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Admin</div>
          <div className="text-lg font-black leading-tight">📚 Academic Resources</div>
        </div>
        <Button size="sm" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/admin/chapterwise-lo' }} title="Period-wise Chapterwise LO import (dry-run, import, publish per class)" className="bg-indigo-500 text-white hover:bg-indigo-600 font-bold rounded-full h-8 px-3 text-xs mr-1"><FolderArchive className="w-3.5 h-3.5 mr-1" /> LO Import (period-wise)</Button>
        <Button size="sm" onClick={exportLoZip} disabled={exporting} title="Export Chapterwise LO as a ZIP of HTML files (one per class)" className="bg-emerald-500 text-white hover:bg-emerald-600 font-bold rounded-full h-8 px-3 text-xs mr-1">
          {exporting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FolderArchive className="w-3.5 h-3.5 mr-1" />} Export LO ZIP
        </Button>
        <Button size="sm" onClick={() => setEditing('new')} className="bg-white text-blue-700 hover:bg-white/90 font-bold rounded-full h-8 px-3 text-xs"><Plus className="w-3.5 h-3.5 mr-1" /> Add Resource</Button>
      </div>

      <div className="px-3 pt-3 space-y-2">
        <Card className="p-2 rounded-2xl">
          <div className="flex items-center gap-1.5 mb-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={filter.search} onChange={e => setFilter(s => ({ ...s, search: e.target.value }))} placeholder="Search title / description…" className="pl-7 h-8 text-xs rounded-lg" />
            </div>
            <Button size="sm" variant="outline" onClick={load} className="h-8 rounded-lg" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            <select value={filter.type} onChange={e => setFilter(s => ({ ...s, type: e.target.value }))} className="text-xs border rounded-lg px-2 h-8 bg-background">
              <option value="">All Types</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
            </select>
            <select value={filter.classId} onChange={e => setFilter(s => ({ ...s, classId: e.target.value }))} className="text-xs border rounded-lg px-2 h-8 bg-background">
              <option value="">All Classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Input value={filter.subject} onChange={e => setFilter(s => ({ ...s, subject: e.target.value }))} placeholder="Subject" className="h-8 text-xs rounded-lg" />
            <select value={filter.status} onChange={e => setFilter(s => ({ ...s, status: e.target.value }))} className="text-xs border rounded-lg px-2 h-8 bg-background">
              <option value="">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </Card>

        {items === null && <div className="py-8 text-center text-xs text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />Loading…</div>}
        {items && items.length === 0 && (
          <Card className="p-6 rounded-2xl border-2 border-dashed text-center">
            <div className="text-4xl">📚</div>
            <p className="font-bold mt-2 text-sm">No resources yet</p>
            <p className="text-[11px] text-muted-foreground mt-1">Click &ldquo;Add Resource&rdquo; above to upload your first HTML file.</p>
          </Card>
        )}
        {items && items.length > 0 && (
          <>
            <p className="text-[10px] text-muted-foreground px-1">Showing {items.length} of {total}</p>
            <div className="space-y-1.5">
              {items.map(r => {
                const t = types.find(x => x.id === r.resourceType)
                return (
                  <Card key={r.id} className="p-2.5 rounded-2xl border">
                    <div className="flex items-start gap-2">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-sm shadow shrink-0">{t?.emoji || '📄'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{r.title}</p>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {t && <Badge className="bg-slate-500/15 text-slate-700 border border-slate-300 text-[9px] h-4 px-1.5">{t.label}</Badge>}
                          {r.contentType === 'pdf' && <Badge className="bg-rose-500/15 text-rose-700 border border-rose-300 text-[9px] h-4 px-1.5">📄 PDF{r.pageCount ? ` · ${r.pageCount}p` : ''}</Badge>}
                          {(!r.contentType || r.contentType === 'html') && <Badge className="bg-indigo-500/15 text-indigo-700 border border-indigo-300 text-[9px] h-4 px-1.5">📝 HTML</Badge>}
                          {r.className && <Badge className="bg-blue-500/15 text-blue-700 border border-blue-300 text-[9px] h-4 px-1.5">{r.className}</Badge>}
                          {r.subject && <Badge className="bg-purple-500/15 text-purple-700 border border-purple-300 text-[9px] h-4 px-1.5">{r.subject}</Badge>}
                          {r.chapterName && <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-300 text-[9px] h-4 px-1.5 max-w-[140px] truncate">{r.chapterName}</Badge>}
                          {r.isPublished ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-300 text-[9px] h-4 px-1.5">✅ Published</Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-700 border border-amber-300 text-[9px] h-4 px-1.5">📝 Draft</Badge>
                          )}
                          {!r.isVisible && <Badge className="bg-red-500/15 text-red-700 border border-red-300 text-[9px] h-4 px-1.5">🙈 Hidden</Badge>}
                          {r.allowPdfDownload && <Badge className="bg-cyan-500/15 text-cyan-700 border border-cyan-300 text-[9px] h-4 px-1.5">⬇ PDF ON</Badge>}
                          <span className="text-[9px] text-muted-foreground">👁 {r.viewCount || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Button size="sm" variant="outline" onClick={() => setPreviewId(r.id)} className="h-7 rounded-lg text-[10px] px-2"><Eye className="w-3 h-3 mr-1" /> Preview</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)} className="h-7 rounded-lg text-[10px] px-2"><Pencil className="w-3 h-3 mr-1" /> Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => togglePublish(r)} className="h-7 rounded-lg text-[10px] px-2">{r.isPublished ? <><Circle className="w-3 h-3 mr-1" /> Unpublish</> : <><CheckCircle2 className="w-3 h-3 mr-1" /> Publish</>}</Button>
                      <Button size="sm" variant="outline" onClick={() => toggleVisibility(r)} className="h-7 rounded-lg text-[10px] px-2">{r.isVisible ? <><EyeOff className="w-3 h-3 mr-1" /> Hide</> : <><Eye className="w-3 h-3 mr-1" /> Show</>}</Button>
                      <Button size="sm" variant="outline" onClick={() => togglePdf(r)} className={`h-7 rounded-lg text-[10px] px-2 ${r.allowPdfDownload ? 'text-cyan-600 border-cyan-300' : ''}`}>{r.allowPdfDownload ? <><DownloadCloud className="w-3 h-3 mr-1" /> PDF ON</> : <><Download className="w-3 h-3 mr-1" /> PDF OFF</>}</Button>
                      <Button size="sm" variant="outline" onClick={() => del(r)} className="h-7 rounded-lg text-[10px] px-2 text-red-500 border-red-200"><Trash2 className="w-3 h-3 mr-1" /> Delete</Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          </>
        )}
      </div>

      {editing && (
        <ResourceEditor
          value={editing === 'new' ? EMPTY_FORM : editing}
          isNew={editing === 'new'}
          types={types}
          classes={classes}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
          api={api}
        />
      )}
      {previewId && <PreviewModal id={previewId} onClose={() => setPreviewId(null)} api={api} />}
    </div>
  )
}

// ------------------------------------------------------------
// New / Edit form modal
// ------------------------------------------------------------
function ResourceEditor({ value, isNew, types, classes, onClose, onSaved, api }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...value })
  const [busy, setBusy] = useState(false)
  const [chapters, setChapters] = useState([])
  const [books, setBooks] = useState([])
  const [selBookId, setSelBookId] = useState('')
  const [replaceMode, setReplaceMode] = useState(isNew) // in NEW mode the html field is required; in EDIT mode it's optional (only replace if user provides)
  const fileRef = useRef(null)

  // When admin picks a class → load books.  Books → load chapters.
  useEffect(() => {
    if (!form.classId) { setBooks([]); return }
    api('/books?classId=' + form.classId).then(r => setBooks(r.books || [])).catch(() => {})
  }, [form.classId, api])
  useEffect(() => {
    if (!selBookId) { setChapters([]); return }
    api('/chapters?bookId=' + selBookId).then(r => setChapters(r.chapters || [])).catch(() => {})
  }, [selBookId, api])

  // Autofill className when classId changes
  useEffect(() => {
    if (form.classId && classes.length) {
      const c = classes.find(cc => cc.id === form.classId)
      if (c) setForm(f => ({ ...f, className: c.name }))
    }
  }, [form.classId, classes])
  // Autofill chapterName when chapterId changes
  useEffect(() => {
    if (form.chapterId && chapters.length) {
      const c = chapters.find(cc => cc.id === form.chapterId)
      if (c) setForm(f => ({ ...f, chapterName: c.name }))
    }
  }, [form.chapterId, chapters])

  const readFile = (file) => new Promise((resolve, reject) => {
    const rd = new FileReader()
    rd.onload = () => resolve(String(rd.result || ''))
    rd.onerror = reject
    rd.readAsText(file, 'utf-8')
  })

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // ------ PDF branch ------
    if (form.contentType === 'pdf' || /\.pdf$/i.test(file.name)) {
      if (file.size > 25 * 1024 * 1024) { toast.error('PDF too large (>25 MB).'); return }
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { toast.error('Please upload a .pdf file.'); return }
      setForm(f => ({
        ...f,
        contentType: 'pdf',
        pdfFile: file,
        pdfSize: file.size,
        fileName: file.name,
        htmlContent: '', // ensure not mixed
      }))
      toast.success(`📄 ${file.name} ready to upload (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
      return
    }
    // ------ HTML branch (existing behaviour) ------
    if (file.size > 15 * 1024 * 1024) { toast.error('File too large (>15 MB).'); return }
    if (!/\.html?$/i.test(file.name)) { toast.error('Please upload an .html, .htm, or .pdf file.'); return }
    try {
      const text = await readFile(file)
      // ---- Client-side pre-detection for INSTANT feedback ----
      // The server is still the source of truth (its parser runs on the
      // SANITIZED HTML, which is what actually ships to users).  This
      // block just reports the count immediately so the admin doesn't
      // have to click Save before knowing whether their template is
      // shaped correctly.
      let sectionsDetected, sectionsWarnings
      if (form.resourceType === 'chapter_assessments') {
        const found = new Set()
        const RE_NEW  = /<(?:section|div|article)\b[^>]*data-assessment-number=["']?(\d)["']?/gi
        const RE_OLD1 = /<(?:section|div|article)\b[^>]*data-assessment=["']?(\d)["']?/gi
        const RE_OLD2 = /<(?:section|div|article)\b[^>]*class=["'][^"']*\bassessment[-_](\d)\b/gi
        for (const re of [RE_NEW, RE_OLD1, RE_OLD2]) {
          let m
          while ((m = re.exec(text)) !== null) {
            const n = parseInt(m[1], 10)
            if (n >= 1 && n <= 5) found.add(n)
          }
        }
        sectionsDetected = found.size
        const missing = [1, 2, 3, 4, 5].filter(n => !found.has(n))
        sectionsWarnings = []
        if (missing.length) sectionsWarnings.push(`Missing: Assessment ${missing.join(', ')}. Please verify each <section data-assessment-number="N"> marker is present.`)
        if (!/data-resource-type=["']chapter-assessments["']/i.test(text)) {
          sectionsWarnings.push('Missing outer wrapper: <div data-resource-type="chapter-assessments">. Detection will still work, but using the official template is recommended.')
        }
      }
      setForm(f => ({
        ...f,
        htmlContent: text,
        fileName: file.name,
        ...(sectionsDetected !== undefined ? { sectionsDetected, sectionsWarnings } : {}),
      }))
      toast.success(`📄 Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB)` + (sectionsDetected !== undefined ? ` · ${sectionsDetected}/5 detected` : ''))
    } catch (err) { toast.error('Failed to read file: ' + err.message) }
  }

  const save = async ({ alsoPublish = false } = {}) => {
    if (!form.title || form.title.trim().length < 2) return toast.error('Title is required.')
    // ------ PDF create/replace branch ------
    if (form.contentType === 'pdf') {
      if (isNew) {
        if (!form.pdfFile) return toast.error('Please choose a PDF file.')
        setBusy(true)
        try {
          const fd = new FormData()
          fd.append('pdf', form.pdfFile)
          fd.append('resourceType', form.resourceType)
          fd.append('title', form.title.trim())
          fd.append('description', form.description || '')
          fd.append('classId', form.classId || '')
          fd.append('className', form.className || '')
          fd.append('subject', form.subject || '')
          fd.append('bookId', form.bookId || '')
          fd.append('bookName', form.bookName || '')
          fd.append('chapterId', form.chapterId || '')
          fd.append('chapterName', form.chapterName || '')
          fd.append('language', form.language || '')
          fd.append('academicSession', form.academicSession || '')
          fd.append('sortOrder', String(Number(form.sortOrder) || 0))
          fd.append('isPublished', String(alsoPublish || !!form.isPublished))
          fd.append('isVisible', String(form.isVisible !== false))
          fd.append('allowPdfDownload', String(!!form.allowPdfDownload))
          fd.append('watermarkBrand', String(!!form.watermarkBrand))
          if (form._replaceDuplicate) fd.append('replaceIfDuplicate', 'true')
          const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
          const res = await fetch('/api/admin/academic-resources/upload-pdf', {
            method: 'POST',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: fd,
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            if (res.status === 409 && data?.code === 'DUPLICATE_RESOURCE') {
              const yes = window.confirm(`A similar PDF already exists: "${data.existingTitle}".\n\nOK = Replace the existing PDF · Cancel = keep both (change title first).`)
              if (yes) {
                setForm(f => ({ ...f, _replaceDuplicate: true }))
                // Re-invoke immediately with replace flag on next tick.
                setBusy(false)
                // We can't easily recurse due to state timing, so call again with a synchronous flag:
                const fd2 = new FormData()
                for (const [k, v] of fd.entries()) fd2.append(k, v)
                fd2.set('replaceIfDuplicate', 'true')
                setBusy(true)
                const res2 = await fetch('/api/admin/academic-resources/upload-pdf', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: fd2 })
                const data2 = await res2.json().catch(() => ({}))
                if (!res2.ok) throw new Error(data2?.error || `Upload failed (${res2.status})`)
                toast.success('🔄 Existing PDF replaced.')
              } else {
                throw new Error('Upload cancelled — please change the title to create a new resource.')
              }
            } else {
              throw new Error(data?.error || `Upload failed (${res.status})`)
            }
          } else {
            toast.success(alsoPublish ? '✅ PDF uploaded & Published' : '💾 PDF uploaded (Draft)')
          }
          onSaved?.()
        } catch (e) { toast.error(e.message) }
        finally { setBusy(false) }
        return
      }
      // EDIT existing PDF resource — update metadata + optional replace.
      setBusy(true)
      try {
        await api(`/admin/academic-resources/${form.id}`, { method: 'PUT', body: {
          title: form.title.trim(),
          description: form.description || '',
          classId: form.classId || null,
          className: form.className || '',
          subject: form.subject || '',
          bookId: form.bookId || null,
          bookName: form.bookName || '',
          chapterId: form.chapterId || null,
          chapterName: form.chapterName || '',
          language: form.language || '',
          academicSession: form.academicSession || '',
          fileName: form.fileName || '',
          sortOrder: Number(form.sortOrder) || 0,
        } })
        // If a new PDF file was staged, replace it.
        if (form.pdfFile) {
          const fd = new FormData()
          fd.append('pdf', form.pdfFile)
          const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
          const res = await fetch(`/api/admin/academic-resources/${form.id}/replace-pdf`, {
            method: 'POST',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: fd,
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data?.error || `Replace failed (${res.status})`)
        }
        if (typeof form.isVisible === 'boolean' && form.isVisible !== value.isVisible) {
          await api(`/admin/academic-resources/${form.id}/visibility`, { method: 'PUT', body: { isVisible: form.isVisible } })
        }
        if (typeof form.allowPdfDownload === 'boolean' && form.allowPdfDownload !== value.allowPdfDownload) {
          await api(`/admin/academic-resources/${form.id}/pdf-download`, { method: 'PUT', body: { allowPdfDownload: form.allowPdfDownload } })
        }
        if (alsoPublish && !value.isPublished) {
          await api(`/admin/academic-resources/${form.id}/publish`, { method: 'PUT', body: { isPublished: true } })
        }
        toast.success('💾 Saved')
        onSaved?.()
      } catch (e) { toast.error(e.message) }
      finally { setBusy(false) }
      return
    }
    // ------ HTML branch (existing behaviour, unchanged below) ------
    // Chapter-Assessments · slots mode: allow empty htmlContent when
    // the admin opted to upload individual PDFs afterwards.
    const slotsModeEmpty = (form.resourceType === 'chapter_assessments' && form.slotsMode && isNew)
    if (isNew && !slotsModeEmpty && !form.htmlContent) return toast.error('Please upload an HTML file.')
    setBusy(true)
    try {
      if (isNew) {
        const payload = {
          resourceType: form.resourceType,
          title: form.title.trim(),
          description: form.description || '',
          classId: form.classId || null,
          className: form.className || '',
          subject: form.subject || '',
          chapterId: form.chapterId || null,
          chapterName: form.chapterName || '',
          fileName: form.fileName || '',
          sortOrder: Number(form.sortOrder) || 0,
          isPublished: !!alsoPublish || !!form.isPublished,
          isVisible: form.isVisible !== false,
          allowPdfDownload: !!form.allowPdfDownload,
          allowPrint: !!form.allowPrint,
          passwordProtected: !!form.passwordProtected,
          watermarkBrand: form.watermarkBrand !== false,
          watermarkUser: !!form.watermarkUser,
          watermarkSchool: !!form.watermarkSchool,
          htmlContent: slotsModeEmpty ? '' : form.htmlContent,
          slotsMode: !!slotsModeEmpty,
        }
        const res = await api('/admin/academic-resources', { method: 'POST', body: payload })
        // Surface detection warnings for chapter_assessments so admin sees them BEFORE closing.
        if (payload.resourceType === 'chapter_assessments' && res?.resource) {
          const n = res.resource.sectionsDetected
          if (slotsModeEmpty) toast.success('📝 Draft created — now upload individual PDFs for each assessment slot in Edit mode.')
          else if (n === 5) toast.success('✅ 5 assessments detected — resource created.')
          else toast.error(`⚠️ Detected ${n || 0}/5 assessments. Please review and re-upload if needed.`)
        } else {
          toast.success(alsoPublish ? '✅ Created & Published' : '💾 Draft saved')
        }
      } else {
        // Edit — update metadata, then optionally replace HTML, then optionally re-publish.
        await api(`/admin/academic-resources/${form.id}`, { method: 'PUT', body: {
          resourceType: form.resourceType,
          title: form.title.trim(),
          description: form.description || '',
          classId: form.classId || null,
          className: form.className || '',
          subject: form.subject || '',
          chapterId: form.chapterId || null,
          chapterName: form.chapterName || '',
          fileName: form.fileName || '',
          sortOrder: Number(form.sortOrder) || 0,
        } })
        if (replaceMode && form.htmlContent && form.htmlContent.length > 10) {
          await api(`/admin/academic-resources/${form.id}/html`, { method: 'PUT', body: { htmlContent: form.htmlContent, fileName: form.fileName } })
        }
        if (typeof form.isVisible === 'boolean' && form.isVisible !== value.isVisible) {
          await api(`/admin/academic-resources/${form.id}/visibility`, { method: 'PUT', body: { isVisible: form.isVisible } })
        }
        if (typeof form.allowPdfDownload === 'boolean' && form.allowPdfDownload !== value.allowPdfDownload) {
          await api(`/admin/academic-resources/${form.id}/pdf-download`, { method: 'PUT', body: { allowPdfDownload: form.allowPdfDownload } })
        }
        // Chapter Assessment permission flags — only fire when at least one changed.
        const assessDiff = {}
        for (const k of ['allowPrint', 'passwordProtected', 'watermarkBrand', 'watermarkUser', 'watermarkSchool']) {
          const cur = typeof form[k] === 'boolean' ? form[k] : (k === 'watermarkBrand')
          const prev = typeof value[k] === 'boolean' ? value[k] : (k === 'watermarkBrand')
          if (cur !== prev) assessDiff[k] = cur
        }
        if (Object.keys(assessDiff).length > 0) {
          await api(`/admin/academic-resources/${form.id}/assessment-settings`, { method: 'PUT', body: assessDiff })
        }
        if (alsoPublish && !value.isPublished) {
          await api(`/admin/academic-resources/${form.id}/publish`, { method: 'PUT', body: { isPublished: true } })
        }
        toast.success('💾 Saved')
      }
      onSaved?.()
    } catch (e) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
      <Card className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-card">
        <div className="sticky top-0 z-10 bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-4 py-3 flex items-center gap-2">
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Admin</div>
            <div className="text-base font-black">{isNew ? '➕ New Resource' : '✏️ Edit Resource'}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Resource Type *</span>
              <select value={form.resourceType} onChange={e => setForm(f => ({ ...f, resourceType: e.target.value }))} className="w-full text-xs border rounded-lg px-2 h-9 bg-background mt-0.5">
                {types.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Sort Order</span>
              <Input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))} className="h-9 text-xs rounded-lg" />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Title *</span>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Class 5 Mathematics — Fractions Teaching Notes" className="h-9 text-xs rounded-lg" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Description</span>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional short summary shown on the tile." className="text-xs rounded-lg" />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Class</span>
              <select value={form.classId || ''} onChange={e => setForm(f => ({ ...f, classId: e.target.value, chapterId: '', chapterName: '' }))} className="w-full text-xs border rounded-lg px-2 h-9 bg-background">
                <option value="">Not applicable</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Subject</span>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Mathematics" className="h-9 text-xs rounded-lg" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Book (for chapter picker)</span>
              <select value={selBookId} onChange={e => setSelBookId(e.target.value)} disabled={!form.classId} className="w-full text-xs border rounded-lg px-2 h-9 bg-background disabled:opacity-50">
                <option value="">Choose book…</option>
                {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Chapter (optional)</span>
              <select value={form.chapterId || ''} onChange={e => setForm(f => ({ ...f, chapterId: e.target.value }))} disabled={!selBookId} className="w-full text-xs border rounded-lg px-2 h-9 bg-background disabled:opacity-50">
                <option value="">Not applicable</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Chapter Name override</span>
              <Input value={form.chapterName} onChange={e => setForm(f => ({ ...f, chapterName: e.target.value }))} placeholder="Used if no chapter linked" className="h-9 text-xs rounded-lg" />
            </label>
          </div>
          {form.contentType === 'pdf' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Language</span>
                <select value={form.language || ''} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} className="w-full text-xs border rounded-lg px-2 h-9 bg-background">
                  <option value="">Not specified</option>
                  <option value="Odia">Odia</option>
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Sanskrit">Sanskrit</option>
                  <option value="Bilingual">Bilingual</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Academic Session</span>
                <Input value={form.academicSession || ''} onChange={e => setForm(f => ({ ...f, academicSession: e.target.value }))} placeholder="e.g. 2026-27" className="h-9 text-xs rounded-lg" />
              </label>
            </div>
          )}

          {form.resourceType === 'chapter_assessments' && isNew && form.contentType !== 'pdf' && (
            <Card className="p-3 rounded-xl border-2 border-amber-200 bg-amber-50/50 dark:bg-amber-900/10">
              <p className="text-[11px] font-black text-amber-800 dark:text-amber-300 tracking-widest uppercase mb-2">📝 Choose Upload Mode</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, slotsMode: false }))}
                  className={`text-left rounded-lg border-2 p-2.5 ${!form.slotsMode ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-slate-200 bg-white dark:bg-slate-900/40'}`}>
                  <div className="font-black text-[11px]">📝 HTML (all 5 in one file)</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">Upload one .html file — server auto-splits 5 assessments.</div>
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, slotsMode: true }))}
                  className={`text-left rounded-lg border-2 p-2.5 ${form.slotsMode ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-slate-200 bg-white dark:bg-slate-900/40'}`}>
                  <div className="font-black text-[11px]">📄 5 individual PDFs</div>
                  <div className="text-[9px] text-muted-foreground mt-0.5">Save draft first, then upload one PDF per assessment slot.</div>
                </button>
              </div>
            </Card>
          )}
          {form.resourceType === 'chapter_assessments' && form.contentType !== 'pdf' && !form.slotsMode && (
            <Card className="p-3 rounded-xl border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-900/10">
              <p className="text-[11px] font-black text-blue-700 dark:text-blue-300 tracking-widest uppercase mb-2">📚 5-Step Upload Workflow</p>
              <ol className="text-[10px] text-slate-700 dark:text-slate-300 space-y-1 mb-2 list-decimal pl-4">
                <li><b>Download</b> the official Lesson Guru Odisha HTML template.</li>
                <li><b>Edit</b> Class · Subject · Chapter and paste your 5 assessments inside their sections.</li>
                <li><b>Upload</b> the edited file below.</li>
                <li><b>Validate</b> — the system detects all 5 assessments automatically.</li>
                <li><b>Publish</b> — Save &amp; Publish button below.</li>
              </ol>
              <div className="flex gap-2">
                <a href="/chapter-assessments-template.html" download="chapter-assessments-template.html" className="flex-1">
                  <Button type="button" size="sm" variant="outline" className="w-full h-9 rounded-lg text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                    📥 Download HTML Template
                  </Button>
                </a>
                <a href="/chapter-assessments-template.html" target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button type="button" size="sm" variant="outline" className="w-full h-9 rounded-lg text-xs">
                    👁 Preview Template
                  </Button>
                </a>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1.5">Do not rename or remove the <code className="text-blue-700">data-assessment-number</code> or <code className="text-blue-700">data-resource-type</code> attributes — they are how the parser locates each assessment.</p>
            </Card>
          )}

          {!(form.resourceType === 'chapter_assessments' && form.slotsMode && isNew) && (
          <Card className="p-3 rounded-xl border-2 border-dashed bg-slate-50/60 dark:bg-slate-900/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">
                {form.contentType === 'pdf' ? 'PDF File' : 'HTML File'}
              </span>
              {isNew && (
                <div className="flex items-center gap-1 text-[10px]">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contentType: 'html', pdfFile: null, pdfSize: 0, fileName: '', htmlContent: '' }))}
                    className={`px-2 h-6 rounded-md font-bold ${form.contentType === 'html' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                    📝 HTML
                  </button>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, contentType: 'pdf', htmlContent: '', fileName: '' }))}
                    className={`px-2 h-6 rounded-md font-bold ${form.contentType === 'pdf' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                    📄 PDF
                  </button>
                </div>
              )}
              {!isNew && (
                <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                  <Switch checked={replaceMode} onCheckedChange={setReplaceMode} />
                  {form.contentType === 'pdf' ? 'Replace PDF on save' : 'Replace HTML on save'}
                </label>
              )}
            </div>
            {(isNew || replaceMode) ? (
              <>
                <input ref={fileRef} type="file"
                  accept={form.contentType === 'pdf' ? '.pdf,application/pdf' : '.html,.htm'}
                  onChange={onFile} className="hidden" />
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="w-full h-9 rounded-lg text-xs">
                  <Upload className="w-3.5 h-3.5 mr-2" />
                  {form.fileName
                    ? `Loaded: ${form.fileName}${form.pdfSize ? ` · ${(form.pdfSize / 1024 / 1024).toFixed(2)} MB` : ''}`
                    : (form.contentType === 'pdf' ? 'Choose .pdf file' : 'Choose .html file')}
                </Button>
                <p className="text-[9px] text-muted-foreground mt-1">
                  {form.contentType === 'pdf'
                    ? 'PDF is uploaded to secure Cloudinary storage. Max 25 MB. Rejected if the file is not a real PDF.'
                    : 'Uploaded HTML is server-side sanitized (scripts, iframes, forms, and event handlers stripped) before it becomes the user-facing resource. Max 15 MB.'}
                </p>
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                {form.contentType === 'pdf' ? 'PDF file is preserved.' : 'HTML file is preserved.'} Toggle &ldquo;Replace {form.contentType === 'pdf' ? 'PDF' : 'HTML'} on save&rdquo; to upload a new version.
              </p>
            )}
          </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <label className="flex items-center justify-between rounded-xl border p-2.5 bg-card">
              <div>
                <div className="text-[11px] font-bold">Visible</div>
                <div className="text-[9px] text-muted-foreground">Show to users</div>
              </div>
              <Switch checked={form.isVisible !== false} onCheckedChange={v => setForm(f => ({ ...f, isVisible: v }))} />
            </label>
            <label className="flex items-center justify-between rounded-xl border p-2.5 bg-card">
              <div>
                <div className="text-[11px] font-bold">Allow PDF Download</div>
                <div className="text-[9px] text-muted-foreground">User can download PDF</div>
              </div>
              <Switch checked={!!form.allowPdfDownload} onCheckedChange={v => setForm(f => ({ ...f, allowPdfDownload: v }))} />
            </label>
            <label className="flex items-center justify-between rounded-xl border p-2.5 bg-card">
              <div>
                <div className="text-[11px] font-bold">Published</div>
                <div className="text-[9px] text-muted-foreground">Live for users</div>
              </div>
              <Switch checked={!!form.isPublished} onCheckedChange={v => setForm(f => ({ ...f, isPublished: v }))} />
            </label>
          </div>

          {form.resourceType === 'chapter_assessments' && (
            <Card className="p-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-900/10 space-y-2">
              <div>
                <p className="text-[11px] font-black text-emerald-700 dark:text-emerald-300 tracking-widest uppercase">Chapter Assessment · Security Settings</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">These controls apply to <b>every</b> assessment PDF this resource serves — whether generated from HTML or uploaded as an individual slot PDF.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="flex items-center justify-between rounded-lg border p-2 bg-card">
                  <div>
                    <div className="text-[11px] font-bold">Allow Direct Print</div>
                    <div className="text-[9px] text-muted-foreground">Enables 🖨 Print button</div>
                  </div>
                  <Switch checked={!!form.allowPrint} onCheckedChange={v => setForm(f => ({ ...f, allowPrint: v }))} />
                </label>
                <label className="flex items-center justify-between rounded-lg border p-2 bg-card">
                  <div>
                    <div className="text-[11px] font-bold">Password Protection</div>
                    <div className="text-[9px] text-muted-foreground">User creates a real PDF password</div>
                  </div>
                  <Switch checked={!!form.passwordProtected} onCheckedChange={v => setForm(f => ({ ...f, passwordProtected: v }))} />
                </label>
                <label className="flex items-center justify-between rounded-lg border p-2 bg-card">
                  <div>
                    <div className="text-[11px] font-bold">Brand Watermark</div>
                    <div className="text-[9px] text-muted-foreground">LESSON GURU ODISHA on every page</div>
                  </div>
                  <Switch checked={!!form.watermarkBrand} onCheckedChange={v => setForm(f => ({ ...f, watermarkBrand: v }))} />
                </label>
                <label className="flex items-center justify-between rounded-lg border p-2 bg-card">
                  <div>
                    <div className="text-[11px] font-bold">Teacher Watermark</div>
                    <div className="text-[9px] text-muted-foreground">Adds authenticated teacher name</div>
                  </div>
                  <Switch checked={!!form.watermarkUser} onCheckedChange={v => setForm(f => ({ ...f, watermarkUser: v }))} />
                </label>
                <label className="flex items-center justify-between rounded-lg border p-2 bg-card">
                  <div>
                    <div className="text-[11px] font-bold">School Watermark</div>
                    <div className="text-[9px] text-muted-foreground">Adds school name (entered at download)</div>
                  </div>
                  <Switch checked={!!form.watermarkSchool} onCheckedChange={v => setForm(f => ({ ...f, watermarkSchool: v }))} />
                </label>
              </div>
              {typeof form.sectionsDetected === 'number' && (
                <div className="mt-1 rounded-lg border-2 p-2.5 bg-white dark:bg-slate-950/40 ${form.sectionsDetected === 5 ? 'border-emerald-400' : 'border-amber-400'}">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-black uppercase tracking-widest">
                      {form.sectionsDetected === 5
                        ? <span className="text-emerald-700">✅ Assessment Structure Detected</span>
                        : <span className="text-amber-700">⚠️ Structure Warning</span>}
                    </span>
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{form.sectionsDetected} / 5 Assessments Found</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 mt-1.5">
                    {[1, 2, 3, 4, 5].map(n => {
                      const found = form.htmlContent && (
                        new RegExp(`<(?:section|div|article)\\b[^>]*(?:data-assessment-number|data-assessment)=["']?${n}["']?`, 'i').test(form.htmlContent)
                        || new RegExp(`<(?:section|div|article)\\b[^>]*class=["'][^"']*\\bassessment[-_]${n}\\b`, 'i').test(form.htmlContent)
                      )
                      return (
                        <div key={n} className={`text-center rounded-md py-1 text-[10px] font-bold ${found ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-red-100 text-red-700 dark:bg-red-900/30'}`}>
                          {found ? '✓' : '✗'} #{n}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {Array.isArray(form.sectionsWarnings) && form.sectionsWarnings.length > 0 && (
                <ul className="text-[9.5px] text-amber-700 list-disc pl-4 space-y-0.5 mt-1">
                  {form.sectionsWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
            </Card>
          )}

          {form.resourceType === 'chapter_assessments' && !isNew && (
            <AssessmentSlotUploader
              resourceId={form.id}
              api={api}
            />
          )}

          <div className="flex gap-2 pt-2 sticky bottom-0 bg-card pb-1">
            <Button variant="outline" onClick={onClose} className="flex-1 h-10 rounded-lg" disabled={busy}>Cancel</Button>
            <Button variant="outline" onClick={() => save({ alsoPublish: false })} disabled={busy} className="flex-1 h-10 rounded-lg">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾 Save Draft'}
            </Button>
            <Button onClick={() => save({ alsoPublish: true })} disabled={busy} className="flex-1 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : '✅ Save & Publish'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------
// Preview modal (uses the same sandboxed iframe as the user viewer)
// ------------------------------------------------------------
function PreviewModal({ id, onClose, api }) {
  const [resource, setResource] = useState(null)
  const [err, setErr] = useState(null)
  const iframeRef = useRef(null)

  useEffect(() => {
    api(`/admin/academic-resources/${id}`).then(r => setResource(r.resource)).catch(e => setErr(e.message))
  }, [id, api])

  const srcdoc = useMemo(() => {
    if (!resource?.htmlContent) return ''
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Noto+Sans+Oriya:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; }
  body { font-family: 'Inter','Noto Sans Oriya','Segoe UI',system-ui,sans-serif; font-size: 15px; line-height: 1.65; padding: 14px 14px 32px; }
  h1,h2,h3,h4 { margin: 1em 0 0.4em; line-height: 1.25; }
  h2 { border-bottom: 2px solid #e2e8f0; padding-bottom: 0.25em; }
  table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; }
  img { max-width: 100%; height: auto; }
  * { max-width: 100%; box-sizing: border-box; }
</style></head><body>${resource.htmlContent}</body></html>`
  }, [resource])

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
      <Card className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl bg-card flex flex-col">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-4 py-3 flex items-center gap-2 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-90">Preview</div>
            <div className="text-base font-black truncate">{resource?.title || 'Loading…'}</div>
            {resource && (
              <div className="text-[10px] opacity-90 truncate">
                {[resource.className, resource.subject, resource.chapterName].filter(Boolean).join(' · ')} · {resource.isPublished ? 'Published' : 'Draft'} · PDF {resource.allowPdfDownload ? 'ON' : 'OFF'}
              </div>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 bg-slate-100 dark:bg-slate-900/40">
          {err && <div className="p-6 text-center text-red-600 text-xs">{err}</div>}
          {!resource && !err && <div className="py-10 text-center text-xs text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading…</div>}
          {resource && (
            <iframe
              ref={iframeRef}
              srcDoc={srcdoc}
              sandbox="allow-same-origin"
              title={resource.title}
              className="w-full block bg-white rounded-xl"
              style={{ height: '75vh', border: 'none' }}
            />
          )}
        </div>
      </Card>
    </div>
  )
}

// ------------------------------------------------------------
// Chapter Assessments — 5-slot Individual PDF Uploader (Mode A)
// ------------------------------------------------------------
// Fetches the resource's `assessmentPdfs` array and lets the admin
// upload/replace/delete one PDF per assessment slot (1..5).  Uses:
//   POST   /admin/academic-resources/:id/assessment-pdfs/:n
//   DELETE /admin/academic-resources/:id/assessment-pdfs/:n
function AssessmentSlotUploader({ resourceId, api }) {
  const [slots, setSlots] = useState(null) // null=loading, [] once loaded
  const [busyN, setBusyN] = useState(null)
  const inputRefs = useRef({})

  const load = () => {
    api(`/admin/academic-resources/${resourceId}`)
      .then(r => setSlots(Array.isArray(r.resource?.assessmentPdfs) ? r.resource.assessmentPdfs : []))
      .catch(e => { setSlots([]); toast.error(e.message) })
  }
  useEffect(() => { load() }, [resourceId])

  const upload = async (n, file) => {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) { toast.error('PDF too large (>25 MB).'); return }
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { toast.error('Please pick a PDF file.'); return }
    setBusyN(n)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
      const res = await fetch(`/api/admin/academic-resources/${resourceId}/assessment-pdfs/${n}`, {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`)
      toast.success(`✅ Assessment ${n} PDF uploaded`)
      load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyN(null) }
  }

  const del = async (n) => {
    if (!window.confirm(`Delete the uploaded PDF for Assessment ${n}? This cannot be undone.`)) return
    setBusyN(n)
    try {
      await api(`/admin/academic-resources/${resourceId}/assessment-pdfs/${n}`, { method: 'DELETE' })
      toast.success(`🗑 Assessment ${n} removed`)
      load()
    } catch (e) { toast.error(e.message) }
    finally { setBusyN(null) }
  }

  return (
    <Card className="p-3 rounded-xl border-2 border-purple-200 bg-purple-50/40 dark:bg-purple-900/10 space-y-2">
      <div>
        <p className="text-[11px] font-black text-purple-700 dark:text-purple-300 tracking-widest uppercase">📄 Individual Assessment PDFs</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Upload one PDF per slot (1–5). If a slot has a PDF, it takes priority over any HTML-detected assessment for that slot.</p>
      </div>
      {slots === null && <div className="py-3 text-center text-xs text-muted-foreground"><Loader2 className="w-4 h-4 mx-auto animate-spin" /></div>}
      {slots !== null && [1, 2, 3, 4, 5].map(n => {
        const entry = slots.find(s => s.assessmentNumber === n)
        const busy = busyN === n
        return (
          <div key={n} className="rounded-lg border bg-white dark:bg-slate-950/40 p-2 flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white flex items-center justify-center font-black text-xs shrink-0">{n}</div>
            <div className="flex-1 min-w-0">
              {entry ? (
                <>
                  <p className="text-[11px] font-bold truncate text-emerald-700">✅ {entry.fileName || `Assessment_${n}.pdf`}</p>
                  <p className="text-[9px] text-muted-foreground">{entry.pageCount ? `${entry.pageCount} page${entry.pageCount === 1 ? '' : 's'} · ` : ''}{entry.fileSize ? `${(entry.fileSize / 1024 / 1024).toFixed(2)} MB` : ''}</p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">❌ Not uploaded</p>
              )}
            </div>
            <input
              ref={el => { inputRefs.current[n] = el }}
              type="file"
              accept=".pdf,application/pdf"
              onChange={e => upload(n, e.target.files?.[0])}
              className="hidden"
            />
            {entry && entry.cloudinaryUrl && (
              <a href={entry.cloudinaryUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 h-7 rounded-md border inline-flex items-center bg-white dark:bg-slate-900 hover:bg-slate-100">👁 Preview</a>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRefs.current[n]?.click()} className="h-7 rounded-md text-[10px] px-2">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : (entry ? '🔄 Replace' : '📤 Upload PDF')}
            </Button>
            {entry && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => del(n)} className="h-7 rounded-md text-[10px] px-2 text-red-500 border-red-200">
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        )
      })}
    </Card>
  )
}

