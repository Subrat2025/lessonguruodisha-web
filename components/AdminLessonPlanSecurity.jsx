'use client'
/**
 * Admin → Document Security → Lesson Plan
 * ---------------------------------------------------------------
 * Manages the Lesson Plan PDF/DOCX security layer.  Scope is
 * strictly lesson_plan — assessments, worksheets, question papers
 * are NOT affected by this module.
 */
import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Shield, Save, FileText, Lock, Clock, RefreshCw, Search, Trash2, Ban, Download, AlertTriangle, Check, X } from 'lucide-react'

const api = async (url, opts = {}) => {
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
  if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
  return j
}

const ToggleRow = ({ label, help, val, onChange, icon }) => (
  <label className="flex items-start gap-3 p-3 rounded-xl border-2 border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 cursor-pointer transition">
    {icon && <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white">{icon}</div>}
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-black text-slate-900">{label}</div>
      {help && <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{help}</div>}
    </div>
    <Switch checked={!!val} onCheckedChange={onChange} />
  </label>
)

const EXPIRY_OPTIONS = [
  { v: 'off',  label: 'No expiry' },
  { v: '1h',   label: '1 hour' },
  { v: '6h',   label: '6 hours' },
  { v: '24h',  label: '24 hours' },
  { v: '7d',   label: '7 days' },
  { v: '30d',  label: '30 days' },
]

const AdminLessonPlanSecurity = () => {
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)
  const [logs, setLogs] = useState([])
  const [docs, setDocs] = useState([])
  const [docTotal, setDocTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formatFilter, setFormatFilter] = useState('')

  const loadCfg = useCallback(async () => {
    try { const r = await api('/admin/document-security/lesson-plan/config'); setCfg(r.config) }
    catch (e) { toast.error(e.message) }
  }, [])

  const loadDocs = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      if (search) qs.set('documentId', search.trim())
      if (statusFilter) qs.set('status', statusFilter)
      if (formatFilter) qs.set('format', formatFilter)
      qs.set('limit', '50')
      const r = await api(`/admin/lesson-plan-documents?${qs.toString()}`)
      setDocs(r.items || []); setDocTotal(r.total || 0)
    } catch (e) { toast.error(e.message) }
  }, [search, statusFilter, formatFilter])

  const loadLogs = useCallback(async () => {
    try {
      const r = await api('/admin/lesson-plan-documents/logs?limit=100')
      setLogs(r.items || [])
    } catch (e) { toast.error(e.message) }
  }, [])

  useEffect(() => { loadCfg(); loadDocs(); loadLogs() }, [loadCfg, loadDocs, loadLogs])

  const save = async () => {
    setSaving(true)
    try {
      const r = await api('/admin/document-security/lesson-plan/config', { method: 'PUT', body: { settings: cfg } })
      setCfg(r.config)
      toast.success('✓ Lesson Plan security settings saved')
    } catch (e) { toast.error(e.message) }
    finally { setSaving(false) }
  }

  const revoke = async (id) => {
    if (!confirm(`Revoke document ${id}?\nThe teacher will not be able to re-download.`)) return
    try {
      await api(`/admin/lesson-plan-documents/${id}/revoke`, { method: 'POST', body: { reason: 'Admin revoke' } })
      toast.success(`✓ Revoked ${id}`)
      loadDocs(); loadLogs()
    } catch (e) { toast.error(e.message) }
  }

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  if (!cfg) return <div className="p-6 text-center text-muted-foreground">Loading Lesson Plan security…</div>

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <Card className="p-4 rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 text-white border-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg">
            <Shield className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-90">Admin · Document Security</div>
            <div className="text-lg font-black leading-tight">Lesson Plan PDF / Word Security</div>
            <div className="text-[11px] opacity-90 mt-0.5">Controls the watermark, download tokens, and access rules for Lesson Plan downloads. Other document types are unaffected.</div>
          </div>
        </div>
      </Card>

      {/* Config */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-black text-slate-900">Download & Watermark Controls</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={loadCfg} className="rounded-full h-8"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Reset</Button>
            <Button size="sm" onClick={save} disabled={saving} className="rounded-full h-8 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <ToggleRow label="Allow PDF Download" help="Hide the PDF button when off (frontend + backend)." val={cfg.allowPdf} onChange={v => set('allowPdf', v)} icon={<Download className="w-4 h-4" />} />
          <ToggleRow label="Allow Word Download" help="Hide the Word/DOCX button when off." val={cfg.allowWord} onChange={v => set('allowWord', v)} icon={<FileText className="w-4 h-4" />} />
          <ToggleRow label="Allow Print" help="Print button visibility on lesson-plan views." val={cfg.allowPrint} onChange={v => set('allowPrint', v)} icon={<FileText className="w-4 h-4" />} />
          <ToggleRow label="LessonGuru Watermark" help="Full-page diagonal &quot;LESSONGURU ODISHA&quot; watermark." val={cfg.brandWatermark} onChange={v => set('brandWatermark', v)} icon={<Shield className="w-4 h-4" />} />
          <ToggleRow label="User Watermark" help="Adds teacher name, User ID, Document ID to the watermark." val={cfg.userWatermark} onChange={v => set('userWatermark', v)} icon={<Shield className="w-4 h-4" />} />
          <ToggleRow label="PDF Password Protection" help="256-bit AES owner-password (blocks print/edit/extract, users can still view)." val={cfg.pdfPassword} onChange={v => set('pdfPassword', v)} icon={<Lock className="w-4 h-4" />} />
          <ToggleRow label="Word Protection" help="Adds read-only DocumentProtection to Word file." val={cfg.wordProtect} onChange={v => set('wordProtect', v)} icon={<Lock className="w-4 h-4" />} />
          <ToggleRow label="One-Time Download" help="Each generated document can be downloaded only once." val={cfg.oneTimeDownload} onChange={v => set('oneTimeDownload', v)} icon={<AlertTriangle className="w-4 h-4" />} />
        </div>
        {/* Expiry */}
        <div className="mt-3 p-3 rounded-xl border-2 border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <Label className="text-[13px] font-black">Document Expiry</Label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXPIRY_OPTIONS.map(o => (
              <button
                key={o.v}
                onClick={() => set('expiry', o.v)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition ${cfg.expiry === o.v ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300'}`}
              >{o.label}</button>
            ))}
          </div>
          <p className="text-[10.5px] text-slate-500 mt-1.5">After expiry, download links return HTTP 410 with a friendly message. Teachers can generate a new copy anytime.</p>
        </div>
      </Card>

      {/* Documents list */}
      <Card className="p-4 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="text-sm font-black text-slate-900">Documents Generated <span className="text-slate-400 font-medium">({docTotal})</span></div>
          <div className="flex-1" />
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Document ID…" className="h-8 pl-7 text-[11px] w-40" />
            </div>
            <select value={formatFilter} onChange={e => setFormatFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 text-[11px] px-2">
              <option value="">All formats</option>
              <option value="pdf">PDF</option>
              <option value="docx">Word</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 text-[11px] px-2">
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="used">Used</option>
              <option value="revoked">Revoked</option>
            </select>
            <Button size="sm" variant="ghost" onClick={loadDocs} className="h-8 rounded-full"><RefreshCw className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-[11px] min-w-[720px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-2 py-2 font-black">Document ID</th>
                <th className="text-left px-2 py-2 font-black">Teacher</th>
                <th className="text-left px-2 py-2 font-black">Lesson</th>
                <th className="text-center px-2 py-2 font-black">Format</th>
                <th className="text-center px-2 py-2 font-black">Status</th>
                <th className="text-center px-2 py-2 font-black">Downloads</th>
                <th className="text-left px-2 py-2 font-black">Created</th>
                <th className="text-right px-2 py-2 font-black">Action</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-slate-400">No documents match.</td></tr>}
              {docs.map(d => {
                const statusColor = d.downloadStatus === 'used' ? 'bg-amber-100 text-amber-700' : d.downloadStatus === 'revoked' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                return (
                  <tr key={d.id} className="border-t border-slate-100 hover:bg-blue-50/40">
                    <td className="px-2 py-1.5 font-mono text-[10px] text-slate-800">{d.id}</td>
                    <td className="px-2 py-1.5">
                      <div className="font-bold">{d.userName || 'Teacher'}</div>
                      <div className="text-[9.5px] text-slate-400">{d.userMobileMasked || ''}</div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium text-slate-800 line-clamp-1 max-w-[220px]">{d.lesson?.title || '—'}</div>
                      <div className="text-[9.5px] text-slate-400">{d.lesson?.className || ''} {d.lesson?.bookName ? '· ' + d.lesson.bookName : ''} {d.lesson?.period ? '· P' + d.lesson.period : ''}</div>
                    </td>
                    <td className="px-2 py-1.5 text-center"><Badge variant="outline" className="text-[9px] uppercase font-black">{d.format}</Badge></td>
                    <td className="px-2 py-1.5 text-center"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusColor}`}>{d.downloadStatus}</span></td>
                    <td className="px-2 py-1.5 text-center font-black">{d.downloadCount || 0}</td>
                    <td className="px-2 py-1.5 text-[10px] text-slate-500 whitespace-nowrap">{new Date(d.createdAt).toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">
                      {d.downloadStatus !== 'revoked' && (
                        <button onClick={() => revoke(d.id)} className="text-red-600 hover:bg-red-50 rounded-full p-1" title="Revoke access">
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Audit log */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-black text-slate-900">Recent Audit Log <span className="text-slate-400 font-medium">({logs.length})</span></div>
          <Button size="sm" variant="ghost" onClick={loadLogs} className="h-8 rounded-full"><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
        <div className="max-h-72 overflow-y-auto -mx-2">
          <table className="w-full text-[10.5px] min-w-[520px]">
            <thead className="bg-slate-50 text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-2 py-1.5 font-black">Time</th>
                <th className="text-left px-2 py-1.5 font-black">Action</th>
                <th className="text-left px-2 py-1.5 font-black">Document</th>
                <th className="text-left px-2 py-1.5 font-black">Format</th>
                <th className="text-left px-2 py-1.5 font-black">User</th>
                <th className="text-left px-2 py-1.5 font-black">Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-slate-400">No logs yet.</td></tr>}
              {logs.map(l => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-2 py-1 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-2 py-1">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                      l.action === 'DOWNLOAD_SUCCESS' ? 'bg-emerald-100 text-emerald-700' :
                      l.action === 'GENERATED' ? 'bg-blue-100 text-blue-700' :
                      l.action === 'ADMIN_REVOKED' ? 'bg-red-100 text-red-700' :
                      l.action === 'EXPIRED' || l.action === 'ALREADY_USED' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>{l.action === 'DOWNLOAD_SUCCESS' ? <Check className="w-2.5 h-2.5" /> : l.action === 'ADMIN_REVOKED' ? <X className="w-2.5 h-2.5" /> : null} {l.action}</span>
                  </td>
                  <td className="px-2 py-1 font-mono text-[10px]">{l.documentId || '—'}</td>
                  <td className="px-2 py-1 uppercase">{l.format || '—'}</td>
                  <td className="px-2 py-1 font-mono text-[10px]">{l.userId?.slice(0, 12) || '—'}</td>
                  <td className="px-2 py-1 text-slate-500">{l.meta?.reason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export default AdminLessonPlanSecurity
