'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, Upload, Copy, Database, FileSearch, RefreshCw, StopCircle, Download, CheckCircle2, AlertTriangle, Play, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

// Small auth fetch helper (mirrors other admin tabs)
const call = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
const downloadUrl = (path, filename) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  fetch('/api' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
    .then(r => r.blob()).then(b => {
      const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; a.click(); URL.revokeObjectURL(u)
    }).catch(e => toast.error('Download failed: ' + e.message))
}

const STATUS_COLORS = { running: 'bg-blue-500', done: 'bg-emerald-600', stopped: 'bg-amber-500', error: 'bg-rose-600' }

function FlagPill({ k, v, good }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border bg-muted/50">
      <span className="font-semibold">{k}</span>
      <span className={`font-mono ${good ? 'text-emerald-600' : 'text-muted-foreground'}`}>{String(v)}</span>
    </div>
  )
}

function JobCard({ job, onStop, onRefresh, onDownloadMissing }) {
  if (!job) return null
  const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : null
  const c = job.counts || {}
  return (
    <Card className="p-4 rounded-2xl border-2 mt-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className={`${STATUS_COLORS[job.status] || 'bg-gray-500'} text-white`}>{job.status}</Badge>
          <span className="font-bold text-sm">{job.kind}</span>
          <Badge variant="outline" className="text-[10px]">{job.mode}</Badge>
          <span className="text-[11px] text-muted-foreground">by {job.adminName}</span>
        </div>
        <div className="flex items-center gap-2">
          {job.status === 'running' && <Button size="sm" variant="destructive" className="rounded-full h-7" onClick={() => onStop(job.id)}><StopCircle className="w-3.5 h-3.5 mr-1" />Stop</Button>}
          <Button size="sm" variant="outline" className="rounded-full h-7" onClick={onRefresh}><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        done={job.done}{job.total ? `/${job.total}` : ''} {pct != null ? `(${pct}%)` : ''}
        {Object.keys(c).length > 0 && (
          <span className="ml-2 font-mono">{Object.entries(c).map(([k, v]) => `${k}=${v}`).join(' ')}</span>
        )}
      </div>
      {pct != null && (
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: pct + '%' }} /></div>
      )}
      {job.error && <p className="mt-2 text-xs text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{job.error}</p>}

      {/* Result summaries */}
      {job.result?.headCheck && (
        <p className="mt-2 text-xs flex items-center gap-1 text-emerald-700"><ShieldCheck className="w-3.5 h-3.5" />R2 HEAD-check: present {job.result.headCheck.present}/{job.result.headCheck.checked}{job.result.headCheck.missing ? ` · missing ${job.result.headCheck.missing}` : ''}</p>
      )}
      {typeof job.result?.coveragePct === 'number' && (
        <div className="mt-2 text-xs">
          <span className="font-bold">Coverage: {job.result.coveragePct}%</span> · covered {job.result.totCovered} · missing {job.result.totMissing}
          {job.result.missingCount > 0 && (
            <Button size="sm" variant="outline" className="rounded-full h-6 ml-2 text-[10px]" onClick={() => onDownloadMissing(job.id)}><Download className="w-3 h-3 mr-1" />Missing list ({job.result.missingCount})</Button>
          )}
        </div>
      )}
      {Array.isArray(job.result?.perCollection) && job.result.perCollection.length > 0 && (
        <div className="mt-2 max-h-40 overflow-auto text-[11px] font-mono border rounded-lg p-2 bg-muted/30">
          {job.result.perCollection.map((r, i) => <div key={i}>{r.collection}: updated={r.recsUpdated} matched={r.urlsMatched} notFound={r.urlsNotFound}</div>)}
        </div>
      )}
      {job.result?.byFolder && (
        <div className="mt-2 max-h-40 overflow-auto text-[11px] font-mono border rounded-lg p-2 bg-muted/30">
          {Object.entries(job.result.byFolder).map(([f, v]) => <div key={f}>{f}: {Object.entries(v).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(' ')}</div>)}
        </div>
      )}
      {typeof job.result?.added === 'number' && (
        <p className="mt-2 text-xs">Import: added {job.result.added ?? c.added} · already {job.result.already ?? c.already} · invalid {job.result.invalid ?? c.invalid}</p>
      )}
      {/* Logs */}
      {Array.isArray(job.logs) && job.logs.length > 0 && (
        <details className="mt-2">
          <summary className="text-[11px] cursor-pointer text-muted-foreground">Job log ({job.logs.length})</summary>
          <div className="mt-1 max-h-40 overflow-auto text-[10px] font-mono border rounded-lg p-2 bg-muted/30">
            {job.logs.map((l, i) => <div key={i}>{new Date(l.t).toLocaleTimeString()} · {l.msg}</div>)}
          </div>
        </details>
      )}
    </Card>
  )
}

export default function AdminR2Migration() {
  const [status, setStatus] = useState(null)
  const [activeJobId, setActiveJobId] = useState(null)
  const [activeJob, setActiveJob] = useState(null)
  const [busy, setBusy] = useState('')
  const [deltaSince, setDeltaSince] = useState('')
  const [deltaLimit, setDeltaLimit] = useState('')
  const [importMode, setImportMode] = useState('dryrun')
  const [importProgress, setImportProgress] = useState(null)
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await call('/admin/r2mig/status')
      setStatus(s)
      if (s.running) { setActiveJobId(s.running.id) }
    } catch (e) { toast.error('Status: ' + e.message) }
  }, [])

  const loadJob = useCallback(async (id) => {
    if (!id) return
    try { const r = await call(`/admin/r2mig/jobs/${id}/full`); setActiveJob(r.job); return r.job } catch (e) { /* silent */ }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Poll active job + status while a job is running
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (!activeJobId) return
    pollRef.current = setInterval(async () => {
      const j = await loadJob(activeJobId)
      if (j && j.status !== 'running') { clearInterval(pollRef.current); loadStatus() }
    }, 3000)
    loadJob(activeJobId)
    return () => clearInterval(pollRef.current)
  }, [activeJobId, loadJob, loadStatus])

  const startJob = async (label, path, body) => {
    try {
      setBusy(label)
      const r = await call(path, { method: 'POST', body })
      setActiveJobId(r.jobId); setActiveJob(null)
      toast.success(`${label} started (${r.mode || 'dryrun'})`)
      loadStatus()
    } catch (e) {
      toast.error(`${label}: ${e.message}`)
    } finally { setBusy('') }
  }

  const stopJob = async (id) => { try { await call(`/admin/r2mig/jobs/${id}/stop`, { method: 'POST' }); toast('Stop requested'); loadJob(id) } catch (e) { toast.error(e.message) } }

  // Confirm wrapper for "Run for real"
  const confirmReal = (what, extra = '') => window.confirm(`Run "${what}" FOR REAL?\n\nThis will write changes.\n${extra}\n\nCloudinary is never modified. The job is additive & resumable. Continue?`)

  // ---- Manifest import (chunked, client reads the JSON file) ----
  const runManifestImport = async (mode) => {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Choose a manifest JSON file first'); return }
    if (mode === 'real' && !confirmReal('Manifest import (REAL)', 'New rows will be ADDED to r2_migration (existing rows never overwritten).')) return
    let parsed
    try { parsed = JSON.parse(await file.text()) } catch (e) { toast.error('Invalid JSON: ' + e.message); return }
    const rows = Array.isArray(parsed) ? parsed : (parsed.rows || [])
    if (!rows.length) { toast.error('No rows found in manifest'); return }
    try {
      setBusy('manifest')
      setImportProgress({ sent: 0, total: rows.length })
      const start = await call('/admin/r2mig/manifest/import/start', { method: 'POST', body: { mode, expectedTotal: rows.length } })
      const jobId = start.jobId
      setActiveJobId(jobId)
      const CHUNK = 1000
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK)
        await call('/admin/r2mig/manifest/import/chunk', { method: 'POST', body: { jobId, rows: batch } })
        setImportProgress({ sent: Math.min(i + CHUNK, rows.length), total: rows.length })
        loadJob(jobId)
      }
      await call('/admin/r2mig/manifest/import/finish', { method: 'POST', body: { jobId } })
      toast.success('Manifest import finished')
      setImportProgress(null)
      loadJob(jobId); loadStatus()
    } catch (e) {
      toast.error('Import: ' + e.message); setImportProgress(null)
    } finally { setBusy('') }
  }

  const f = status?.flags || {}
  const flagsOff = f.STORAGE_WRITE !== 'r2' && f.R2_READ_FLIP !== '1'

  return (
    <div className="space-y-4 mt-3">
      {/* Header: flags + mapping counts */}
      <Card className="p-4 rounded-2xl border-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="font-extrabold text-base flex items-center gap-2"><Database className="w-5 h-5 text-indigo-500" /> R2 Migration Tools</p>
          <Button size="sm" variant="outline" className="rounded-full" onClick={loadStatus}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Admin-only. Each tool defaults to a safe dry-run, is additive (never deletes), and resumable. Cloudinary is never modified. Only one job runs at a time.</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <FlagPill k="STORAGE_WRITE" v={f.STORAGE_WRITE} good={f.STORAGE_WRITE === 'r2'} />
          <FlagPill k="R2_READ_FLIP" v={f.R2_READ_FLIP} good={f.R2_READ_FLIP === '1'} />
          <FlagPill k="ASSESS_VIEW_R2" v={f.ASSESS_VIEW_R2} good={f.ASSESS_VIEW_R2 === '1'} />
          <FlagPill k="storageMode" v={f.storageMode || 'none'} good={!!f.storageMode} />
          <FlagPill k="cloudinary" v={f.cloudinary ? 'ok' : 'off'} good={f.cloudinary} />
        </div>
        {status?.mapping && (
          <p className="text-xs mt-2">Mapping (r2_migration): <b>{status.mapping.total}</b> rows · public <b>{status.mapping.byBucket?.public || 0}</b> · private <b>{status.mapping.byBucket?.private || 0}</b></p>
        )}
      </Card>

      {/* Running / active job */}
      {status?.running && !activeJobId && (
        <Card className="p-3 rounded-2xl border-2 border-blue-300 bg-blue-50 dark:bg-blue-950/30">
          <p className="text-xs font-semibold flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />A job is currently running: {status.running.kind}</p>
          <Button size="sm" variant="outline" className="rounded-full mt-2 h-7" onClick={() => setActiveJobId(status.running.id)}>View</Button>
        </Card>
      )}
      {activeJob && <JobCard job={activeJob} onStop={stopJob} onRefresh={() => loadJob(activeJobId)} onDownloadMissing={(id) => downloadUrl(`/admin/r2mig/coverage/${id}/missing`, `r2_coverage_missing_${id}.csv`)} />}

      {/* 1) Manifest import */}
      <Card className="p-4 rounded-2xl border-2">
        <p className="font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4 text-indigo-500" /> 1 · Manifest Import</p>
        <p className="text-xs text-muted-foreground mt-1">Upload the PREVIEW <code>r2_migration</code> manifest (download it on Preview below). Rows are validated and ADDED to this DB (existing rows never overwritten; private stays private). A real import HEAD-checks a random R2 sample.</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => downloadUrl('/admin/r2mig/manifest/export', `r2_manifest_${Date.now()}.json`)}><Download className="w-3.5 h-3.5 mr-1" />Export this DB's manifest</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input ref={fileRef} type="file" accept="application/json,.json" className="max-w-xs text-xs" />
          <Button size="sm" variant="outline" className="rounded-full" disabled={busy === 'manifest'} onClick={() => runManifestImport('dryrun')}>{busy === 'manifest' ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileSearch className="w-3.5 h-3.5 mr-1" />}Dry-run</Button>
          <Button size="sm" className="rounded-full bg-indigo-600 hover:bg-indigo-700" disabled={busy === 'manifest'} onClick={() => runManifestImport('real')}><Play className="w-3.5 h-3.5 mr-1" />Run for real</Button>
          {importProgress && <span className="text-xs text-muted-foreground">sent {importProgress.sent}/{importProgress.total}</span>}
        </div>
      </Card>

      {/* 2) Delta copy */}
      <Card className="p-4 rounded-2xl border-2">
        <p className="font-bold text-sm flex items-center gap-2"><Copy className="w-4 h-4 text-indigo-500" /> 2 · Delta Copy (Cloudinary → R2)</p>
        <p className="text-xs text-muted-foreground mt-1">Copies only assets uploaded after the cutoff (or not yet in the mapping) via the Cloudinary Search API. Originals only · public images q82 (edu-library q88) · private→private · SHA-256/MD5 verified · throttled · resumable.</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md">
          <div><Label className="text-[11px]">Since (optional, default = last copy − 1 day)</Label><Input type="datetime-local" value={deltaSince} onChange={e => setDeltaSince(e.target.value)} className="text-xs" /></div>
          <div><Label className="text-[11px]">Limit (optional, for testing)</Label><Input type="number" min="0" placeholder="0 = all" value={deltaLimit} onChange={e => setDeltaLimit(e.target.value)} className="text-xs" /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button size="sm" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => startJob('Delta copy (dry-run)', '/admin/r2mig/delta-copy', { mode: 'dryrun', since: deltaSince ? new Date(deltaSince).toISOString() : undefined, limit: deltaLimit || undefined })}><FileSearch className="w-3.5 h-3.5 mr-1" />Dry-run</Button>
          <Button size="sm" className="rounded-full bg-indigo-600 hover:bg-indigo-700" disabled={!!busy} onClick={() => { if (confirmReal('Delta copy (REAL)', 'New/changed assets will be copied to R2.')) startJob('Delta copy', '/admin/r2mig/delta-copy', { mode: 'real', since: deltaSince ? new Date(deltaSince).toISOString() : undefined, limit: deltaLimit || undefined }) }}><Play className="w-3.5 h-3.5 mr-1" />Run for real</Button>
        </div>
      </Card>

      {/* 3) Backfill */}
      <Card className="p-4 rounded-2xl border-2">
        <p className="font-bold text-sm flex items-center gap-2"><Database className="w-4 h-4 text-indigo-500" /> 3 · R2-Assets Backfill</p>
        <p className="text-xs text-muted-foreground mt-1">Adds an <code>r2_assets</code> sidecar map to LIVE records FROM the mapping so reads can prefer R2. Never changes/removes Cloudinary fields. HTML-embedded collections are rewritten at serve time (not here).</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button size="sm" variant="outline" className="rounded-full" disabled={!!busy} onClick={() => startJob('Backfill (dry-run)', '/admin/r2mig/backfill', { mode: 'dryrun' })}><FileSearch className="w-3.5 h-3.5 mr-1" />Dry-run</Button>
          <Button size="sm" className="rounded-full bg-indigo-600 hover:bg-indigo-700" disabled={!!busy} onClick={() => { if (confirmReal('R2-assets backfill (REAL)', 'r2_assets sidecar fields will be added to matched records.')) startJob('Backfill', '/admin/r2mig/backfill', { mode: 'real' }) }}><Play className="w-3.5 h-3.5 mr-1" />Run for real</Button>
        </div>
      </Card>

      {/* 4) Coverage */}
      <Card className="p-4 rounded-2xl border-2">
        <p className="font-bold text-sm flex items-center gap-2"><FileSearch className="w-4 h-4 text-indigo-500" /> 4 · Coverage Report</p>
        <p className="text-xs text-muted-foreground mt-1">Read-only. Scans every collection for Cloudinary references and reports what resolves to R2 vs missing (with %, a downloadable missing list, and a HEAD-check proof sample).</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700" disabled={!!busy} onClick={() => startJob('Coverage report', '/admin/r2mig/coverage', {})}><Play className="w-3.5 h-3.5 mr-1" />Run coverage</Button>
        </div>
      </Card>

      {/* Recent jobs */}
      {status?.recent?.length > 0 && (
        <Card className="p-4 rounded-2xl border-2">
          <p className="font-bold text-sm">Recent jobs</p>
          <div className="mt-2 space-y-1">
            {status.recent.map((j) => (
              <button key={j.id} onClick={() => setActiveJobId(j.id)} className="w-full flex items-center justify-between text-xs p-2 rounded-lg hover:bg-muted/50 border">
                <span className="flex items-center gap-2"><Badge className={`${STATUS_COLORS[j.status] || 'bg-gray-500'} text-white text-[10px]`}>{j.status}</Badge><b>{j.kind}</b><span className="text-muted-foreground">{j.mode}</span></span>
                <span className="text-muted-foreground">{new Date(j.startedAt).toLocaleString()} · {j.adminName}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
