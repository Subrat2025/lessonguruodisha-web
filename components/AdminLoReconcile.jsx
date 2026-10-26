'use client'
import React, { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

const api = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const STATUS_COLOR = {
  CORRECT: 'bg-emerald-500', INCORRECT: 'bg-red-500', UNRESOLVED: 'bg-amber-500',
  UNRESOLVED_EMPTY: 'bg-fuchsia-600', FRAMEWORK: 'bg-slate-400',
}

export default function AdminLoReconcile({ onBack }) {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)
  const [fClass, setFClass] = useState('')
  const [fSubject, setFSubject] = useState('')
  const [fStatus, setFStatus] = useState('')

  const doReimport = async () => {
    if (!confirm('Re-import the authoritative LO catalog? A backup of the current loCodes will be created first.')) return
    setImporting(true)
    try { const r = await api('/admin/lo-codes/reimport', { method: 'POST' }); setImportResult(r); toast.success(`Catalog refreshed · ${r.totalInDb} codes`) }
    catch (e) { toast.error(e.message) }
    setImporting(false)
  }

  const doPreview = async () => {
    setLoading(true); setApplyResult(null)
    try {
      const qs = new URLSearchParams()
      if (fClass) qs.set('class', fClass)
      if (fSubject) qs.set('subject', fSubject)
      if (fStatus) qs.set('status', fStatus)
      const r = await api('/admin/lo-reconcile/preview' + (qs.toString() ? '?' + qs : ''))
      setPreview(r); toast.success(`Preview ready · ${r.count} lessons`)
    } catch (e) { toast.error(e.message) }
    setLoading(false)
  }

  const doApply = async () => {
    const t = preview?.totals
    if (!t) { toast.error('Run Preview first'); return }
    if (!confirm(`Apply repair? This will REMOVE ${t.incorrect} wrong-subject/class LO code(s) from ${t.lessonsWithIssues} lesson(s). A per-lesson backup + audit log are written. Lesson content is NOT changed.`)) return
    setApplying(true)
    try {
      const r = await api('/admin/lo-reconcile/apply', { method: 'POST' })
      setApplyResult(r.report); toast.success(`Repaired ${r.report.updated} lessons`)
      await doPreview()
    } catch (e) { toast.error(e.message) }
    setApplying(false)
  }

  const t = preview?.totals
  return (
    <div className="max-w-3xl mx-auto px-3 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onBack} className="rounded-full h-8">← Back</Button>
        <h1 className="font-black text-lg flex-1">🔧 Reconcile LO Codes</h1>
      </div>

      <Card className="p-3 rounded-2xl border-2 space-y-2">
        <p className="font-bold text-sm">1 · Refresh authoritative catalog</p>
        <p className="text-[11px] text-muted-foreground">Re-imports the bundled <code>lo-codes-flat.json</code> into <code>loCodes</code> (backup first, idempotent).</p>
        <Button size="sm" onClick={doReimport} disabled={importing} className="rounded-full h-8">{importing ? 'Importing…' : 'Re-import Catalog'}</Button>
        {importResult && (
          <div className="text-[11px] bg-slate-50 dark:bg-slate-900/40 rounded-lg p-2">
            Backup: <b>{importResult.backup || '—'}</b> · JSON: {importResult.jsonRecords} · Added: {importResult.added} · Updated: {importResult.updated} · Unchanged: {importResult.unchanged} · Skipped: {importResult.skipped} · Total now: <b>{importResult.totalInDb}</b>
          </div>
        )}
      </Card>

      <Card className="p-3 rounded-2xl border-2 space-y-2">
        <p className="font-bold text-sm">2 · Preview reconciliation (read-only)</p>
        <div className="flex flex-wrap gap-1.5">
          <Input value={fClass} onChange={e => setFClass(e.target.value)} placeholder="Class (e.g. 6)" className="h-8 w-28 text-xs" />
          <Input value={fSubject} onChange={e => setFSubject(e.target.value)} placeholder="Subject" className="h-8 w-32 text-xs" />
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="h-8 rounded-md border px-2 text-xs">
            <option value="">All statuses</option>
            <option value="INCORRECT">Incorrect</option>
            <option value="UNRESOLVED">Unresolved</option>
            <option value="UNRESOLVED_EMPTY">Unresolved (empty after)</option>
            <option value="CORRECT">Correct</option>
          </select>
          <Button size="sm" onClick={doPreview} disabled={loading} className="rounded-full h-8">{loading ? 'Loading…' : 'Preview'}</Button>
        </div>
        {t && (
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <Badge className="bg-emerald-500 text-white">Correct {t.correct}</Badge>
            <Badge className="bg-red-500 text-white">Incorrect {t.incorrect}</Badge>
            <Badge className="bg-amber-500 text-white">Unresolved {t.unresolved}</Badge>
            <Badge className="bg-slate-400 text-white">Framework {t.framework}</Badge>
            <Badge variant="outline">Lessons w/ issues {t.lessonsWithIssues}</Badge>
            <Badge variant="outline">Empty after {t.lessonsEmptyAfter}</Badge>
          </div>
        )}
      </Card>

      {preview && (
        <Card className="p-3 rounded-2xl border-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-bold text-sm">3 · Apply repair ({preview.count} shown)</p>
            <Button size="sm" onClick={doApply} disabled={applying || !t?.incorrect} className="rounded-full h-8 bg-red-600 text-white">{applying ? 'Applying…' : '⚠️ Apply Repair'}</Button>
          </div>
          {applyResult && (
            <div className="text-[11px] bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-2">
              Updated: <b>{applyResult.updated}</b> · Removed codes: {applyResult.removedCodes} · Unchanged: {applyResult.unchanged} · Unresolved-empty: {applyResult.unresolvedLessons} · Errors: {applyResult.errors}
            </div>
          )}
          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
            {preview.rows.map(row => (
              <div key={row.lessonId} className="rounded-xl border px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-bold truncate flex-1">{row.className} · {row.subject} · P{row.period} — {row.title}</p>
                  <Badge className={`${STATUS_COLOR[row.lessonStatus] || 'bg-slate-500'} text-white text-[9px]`}>{row.lessonStatus}</Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {row.codes.map((c, i) => (
                    <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded-full text-white ${STATUS_COLOR[c.status] || 'bg-slate-500'}`} title={c.reason || ''}>
                      {c.code}{c.status === 'INCORRECT' ? ' ✗' : c.status === 'CORRECT' ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {preview.rows.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-4">No lessons match this filter.</p>}
          </div>
        </Card>
      )}
    </div>
  )
}
