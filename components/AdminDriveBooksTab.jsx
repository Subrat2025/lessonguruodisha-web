'use client'

import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, RefreshCw, Plug, CheckCircle2, XCircle, AlertTriangle,
  ChevronLeft, ChevronRight, Eye, EyeOff, Download, ArrowUp, ArrowDown, FolderTree,
} from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// ☁️ Admin → Google Drive Books Library
//   Drive is the MASTER storage. This panel lets admins: configure the root
//   folder, test the connection, run a sync, and manage published/download
//   state per book & chapter. PDFs are proxied through the backend.
// =============================================================================
const AdminDriveBooksTab = ({ api, user }) => {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [rootId, setRootId] = useState('')
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)

  const [books, setBooks] = useState([])
  const [booksLoading, setBooksLoading] = useState(false)
  const [openBook, setOpenBook] = useState(null)      // book being managed
  const [chapters, setChapters] = useState([])
  const [chLoading, setChLoading] = useState(false)

  const loadStatus = async () => {
    setLoading(true)
    try {
      const r = await api('/admin/drive/status')
      setStatus(r)
      setRootId(r.rootFolderId || '')
    } catch (e) { toast.error(e.message) }
    finally { setLoading(false) }
  }

  const loadBooks = async () => {
    setBooksLoading(true)
    try {
      const r = await api('/admin/drive/books')
      setBooks(r.books || [])
    } catch (e) { toast.error(e.message) }
    finally { setBooksLoading(false) }
  }

  useEffect(() => { loadStatus(); loadBooks() }, [])

  const testConnection = async () => {
    setTesting(true); setTestResult(null)
    try {
      const r = await api('/admin/drive/test', { method: 'POST' })
      setTestResult(r)
      if (r.ok) toast.success(`Connected to "${r.rootName}" — ${r.childFolders} folders`)
      else toast.error(r.error || 'Connection failed')
    } catch (e) { toast.error(e.message) }
    finally { setTesting(false) }
  }

  const saveCfg = async (patch) => {
    setSavingCfg(true)
    try {
      await api('/admin/drive/settings', { method: 'PUT', body: patch })
      await loadStatus()
      toast.success('Settings saved')
    } catch (e) { toast.error(e.message) }
    finally { setSavingCfg(false) }
  }

  const runPreview = async () => {
    setPreviewing(true); setPreview(null)
    try {
      const r = await api('/admin/drive/sync/preview', { method: 'POST' })
      if (r.ok) { setPreview(r.report); toast.success('Preview ready — review changes below') }
      else toast.error(r.error || 'Preview failed')
    } catch (e) { toast.error(e.message) }
    finally { setPreviewing(false) }
  }

  const runSync = async () => {
    setSyncing(true)
    try {
      const r = await api('/admin/drive/sync', { method: 'POST' })
      if (r.ok) {
        const rep = r.report || {}
        setPreview(null)
        toast.success(r.message || 'Sync complete', {
          description: `Books +${rep.newBooks || 0} · Chapters +${rep.newChapters || 0} · Updated ${rep.updatedChapters || 0} · Missing ${rep.missing || 0}`,
          duration: 8000,
        })
        await loadStatus(); await loadBooks()
      } else {
        toast.error(r.error || 'Sync failed')
      }
    } catch (e) { toast.error(e.message) }
    finally { setSyncing(false) }
  }

  const patchBook = async (id, patch) => {
    try {
      const r = await api(`/admin/drive/books/${id}`, { method: 'PATCH', body: patch })
      setBooks(bs => bs.map(b => b.id === id ? { ...b, ...(r.book || patch) } : b))
    } catch (e) { toast.error(e.message) }
  }

  const moveBook = async (id, dir) => {
    try { await api(`/admin/drive/books/${id}/move`, { method: 'POST', body: { dir } }); await loadBooks() }
    catch (e) { toast.error(e.message) }
  }

  const openManage = async (b) => {
    setOpenBook(b); setChapters([]); setChLoading(true)
    try {
      const r = await api('/admin/drive/chapters?bookId=' + encodeURIComponent(b.id))
      setChapters(r.chapters || [])
    } catch (e) { toast.error(e.message) }
    finally { setChLoading(false) }
  }

  const patchChapter = async (id, patch) => {
    try {
      await api(`/admin/drive/chapters/${id}`, { method: 'PATCH', body: patch })
      setChapters(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
    } catch (e) { toast.error(e.message) }
  }

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>

  // ---- Manage single book (chapters) view ----
  if (openBook) {
    return (
      <div className="mt-3 space-y-3">
        <Button size="sm" variant="outline" onClick={() => setOpenBook(null)} className="rounded-full"><ChevronLeft className="w-4 h-4 mr-1" /> Back to books</Button>
        <Card className="p-4 rounded-2xl border-2">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${openBook.color || 'from-slate-500 to-slate-700'} text-white flex items-center justify-center text-2xl`}>{openBook.emoji || '📖'}</div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold truncate">{openBook.name}</p>
              <p className="text-xs text-muted-foreground">{openBook.className} · {openBook.subject} · {chapters.length} chapters</p>
            </div>
          </div>
        </Card>

        {chLoading ? <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : (
          <div className="space-y-2">
            {chapters.map((c, i) => (
              <Card key={c.id} className={`p-3 rounded-xl border-2 ${c.driveUnavailable ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-xs font-extrabold shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{c.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-0.5 items-center">
                      {c.pdfSize ? <span className="text-[10px] text-muted-foreground">{Math.round(c.pdfSize / 1024)} KB</span> : null}
                      {c.driveUnavailable && <Badge className="text-[9px] bg-red-600 text-white">⚠️ Drive file unavailable</Badge>}
                      {c.published === false && <Badge variant="outline" className="text-[9px]">Hidden</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-muted-foreground">Show</span>
                      <Switch checked={c.published !== false} onCheckedChange={(v) => patchChapter(c.id, { published: v })} />
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-muted-foreground">Download</span>
                      <Switch checked={c.allowDownload === true} onCheckedChange={(v) => patchChapter(c.id, { allowDownload: v })} />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {chapters.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground rounded-xl border-2 border-dashed">No chapters synced yet.</Card>}
          </div>
        )}
      </div>
    )
  }

  const st = status || {}
  const rep = st.lastSyncReport || {}

  return (
    <div className="mt-3 space-y-4">
      {/* Header */}
      <Card className="p-4 rounded-2xl border-2 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30">
        <div className="flex items-start gap-3">
          <div className="text-3xl">☁️</div>
          <div className="flex-1">
            <p className="font-extrabold text-base">Google Drive Books Library</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Drive is the master store. Sync indexes your <b>Class → Subject → Book → Chapter PDFs</b> folders. PDFs are streamed securely — no keys exposed.</p>
          </div>
        </div>
      </Card>

      {/* Connection status */}
      <Card className="p-4 rounded-2xl border-2 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm flex items-center gap-2"><Plug className="w-4 h-4" /> Connection</p>
          {st.configured
            ? <Badge className="bg-emerald-600 text-white text-[10px]">Configured</Badge>
            : <Badge className="bg-red-600 text-white text-[10px]">Not configured</Badge>}
        </div>
        <div className="text-[11px] text-muted-foreground break-all">
          <div><b>Service account:</b> {st.serviceAccount || '—'}</div>
          <div className="mt-1"><b>Share your Drive folder with this email as Viewer.</b></div>
        </div>
        <div>
          <Label className="text-[11px]">Root Folder ID</Label>
          <div className="flex gap-2 mt-1">
            <Input value={rootId} onChange={e => setRootId(e.target.value)} placeholder="Google Drive parent folder ID" className="h-9 rounded-lg text-xs" />
            <Button size="sm" variant="outline" disabled={savingCfg} onClick={() => saveCfg({ rootFolderId: rootId })} className="rounded-lg shrink-0">{savingCfg ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={testConnection} disabled={testing} className="rounded-full">
            {testing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Testing…</> : <><Plug className="w-4 h-4 mr-1" /> Test Connection</>}
          </Button>
          <Button size="sm" variant="outline" onClick={runPreview} disabled={previewing || syncing} className="rounded-full">
            {previewing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Checking…</> : <><Eye className="w-4 h-4 mr-1" /> Preview Changes</>}
          </Button>
          <Button size="sm" onClick={runSync} disabled={syncing || previewing} className="rounded-full bg-indigo-600 hover:bg-indigo-700">
            {syncing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Syncing…</> : <><RefreshCw className="w-4 h-4 mr-1" /> Sync Now</>}
          </Button>
        </div>

        {preview && (
          <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 space-y-2">
            <p className="font-bold text-xs flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Preview — nothing saved yet</p>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-lg bg-white dark:bg-slate-900 p-1.5"><p className="text-base font-extrabold text-emerald-600">{preview.newBooks}</p><p className="text-[9px] text-muted-foreground">New books</p></div>
              <div className="rounded-lg bg-white dark:bg-slate-900 p-1.5"><p className="text-base font-extrabold text-emerald-600">{preview.newChapters}</p><p className="text-[9px] text-muted-foreground">New PDFs</p></div>
              <div className="rounded-lg bg-white dark:bg-slate-900 p-1.5"><p className="text-base font-extrabold text-blue-600">{preview.updatedChapters}</p><p className="text-[9px] text-muted-foreground">Updated</p></div>
              <div className="rounded-lg bg-white dark:bg-slate-900 p-1.5"><p className="text-base font-extrabold text-slate-500">{preview.unchanged}</p><p className="text-[9px] text-muted-foreground">Unchanged</p></div>
              <div className="rounded-lg bg-white dark:bg-slate-900 p-1.5"><p className="text-base font-extrabold text-red-600">{preview.missing}</p><p className="text-[9px] text-muted-foreground">Missing</p></div>
              <div className="rounded-lg bg-white dark:bg-slate-900 p-1.5"><p className="text-base font-extrabold text-amber-600">{preview.skippedClass}</p><p className="text-[9px] text-muted-foreground">Skipped</p></div>
            </div>
            {preview.sampleNew?.length ? (
              <div className="text-[10px] text-muted-foreground">
                <b>New:</b> {preview.sampleNew.join(' · ')}{preview.newBooks > preview.sampleNew.length ? ' …' : ''}
              </div>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={runSync} disabled={syncing} className="rounded-full bg-emerald-600 hover:bg-emerald-700 flex-1">
                {syncing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Applying…</> : <><CheckCircle2 className="w-4 h-4 mr-1" /> Apply Sync</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPreview(null)} className="rounded-full">Discard</Button>
            </div>
          </div>
        )}

        {testResult && (
          <div className={`rounded-xl p-3 text-[11px] ${testResult.ok ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
            {testResult.ok ? (
              <div className="space-y-0.5">
                <p className="font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Connected to "{testResult.rootName}"</p>
                <p>📁 {testResult.childFolders} class folders · 📄 {testResult.childPdfs} direct PDFs</p>
                {testResult.sampleFolders?.length ? <p className="text-muted-foreground">{testResult.sampleFolders.join(', ')}</p> : null}
              </div>
            ) : (
              <p className="font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-600" /> {testResult.error}</p>
            )}
          </div>
        )}
      </Card>

      {/* Sync settings + last report */}
      <Card className="p-4 rounded-2xl border-2 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">Automatic Sync</p>
            <p className="text-[10px] text-muted-foreground">Check Drive periodically for new / changed books</p>
          </div>
          <Switch checked={st.autoSync === true} onCheckedChange={(v) => saveCfg({ autoSync: v })} />
        </div>
        {st.autoSync && (
          <div className="rounded-lg bg-muted/60 p-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="text-muted-foreground">Run every</span>
            <select
              value={st.autoSyncIntervalHours || 24}
              onChange={(e) => saveCfg({ autoSyncIntervalHours: Number(e.target.value) })}
              className="h-7 rounded-md border bg-background px-2 text-[11px] font-bold"
            >
              <option value={12}>12 hours</option>
              <option value={24}>24 hours (daily)</option>
              <option value={48}>2 days</option>
              <option value={168}>Weekly</option>
            </select>
            <span className="text-muted-foreground">· Last auto-sync: <b className="text-foreground">{st.lastAutoSyncAt ? new Date(st.lastAutoSyncAt).toLocaleString() : 'not yet'}</b></span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-muted p-2"><p className="text-lg font-extrabold">{st.counts?.books ?? 0}</p><p className="text-[10px] text-muted-foreground">Books</p></div>
          <div className="rounded-xl bg-muted p-2"><p className="text-lg font-extrabold">{st.counts?.chapters ?? 0}</p><p className="text-[10px] text-muted-foreground">Chapters (PDFs)</p></div>
        </div>
        <div className="text-[11px] text-muted-foreground">
          <div><b>Last sync:</b> {st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleString() : '— never —'}
            {st.lastSyncStatus === 'success' && <span className="text-emerald-600 font-bold"> ✓ success</span>}
            {st.lastSyncStatus === 'error' && <span className="text-red-600 font-bold"> ✗ error</span>}
          </div>
          {st.lastSyncStatus === 'error' && st.lastSyncError && <div className="text-red-600 mt-0.5">{st.lastSyncError}</div>}
          {st.lastSyncStatus === 'success' && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[9px]">New books {rep.newBooks || 0}</Badge>
              <Badge variant="outline" className="text-[9px]">New chapters {rep.newChapters || 0}</Badge>
              <Badge variant="outline" className="text-[9px]">Updated {rep.updatedChapters || 0}</Badge>
              <Badge variant="outline" className="text-[9px]">Unchanged {rep.unchanged || 0}</Badge>
              {rep.missing ? <Badge className="text-[9px] bg-red-600 text-white">Missing {rep.missing}</Badge> : null}
              {rep.skippedClass ? <Badge className="text-[9px] bg-amber-500 text-white">Skipped (class?) {rep.skippedClass}</Badge> : null}
            </div>
          )}
          {(st.counts?.unavailable ?? 0) > 0 && (
            <div className="mt-1 text-red-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {st.counts.unavailable} chapter file(s) missing on Drive</div>
          )}
        </div>
      </Card>

      {/* Book management */}
      <Card className="p-4 rounded-2xl border-2">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-sm flex items-center gap-2"><FolderTree className="w-4 h-4" /> Synced Books ({books.length})</p>
          <Button size="sm" variant="ghost" onClick={loadBooks} className="h-8"><RefreshCw className="w-3.5 h-3.5" /></Button>
        </div>
        {booksLoading ? <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div> : books.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground border-2 border-dashed rounded-xl">
            No Drive books yet. Configure the folder ID, test the connection, then click <b>Sync Now</b>.
          </div>
        ) : (
          <div className="space-y-2">
            {books.map((b, i) => (
              <Card key={b.id} className="p-3 rounded-xl border">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${b.color || 'from-slate-500 to-slate-700'} text-white flex items-center justify-center text-xl shrink-0`}>{b.emoji || '📖'}</div>
                  <div className="flex-1 min-w-0" onClick={() => openManage(b)} role="button">
                    <p className="text-sm font-bold truncate">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground">{b.className} · {b.subject} · {b.chaptersCount} ch{b.unavailableCount ? ` · ⚠️ ${b.unavailableCount} missing` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex flex-col">
                      <button onClick={() => moveBook(b.id, 'up')} className="text-muted-foreground hover:text-foreground"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => moveBook(b.id, 'down')} className="text-muted-foreground hover:text-foreground"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-muted-foreground">Publish</span>
                      <Switch checked={b.published !== false && b.hidden !== true} onCheckedChange={(v) => patchBook(b.id, { published: v, hidden: !v })} />
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] text-muted-foreground">Download</span>
                      <Switch checked={b.allowDownload === true} onCheckedChange={(v) => patchBook(b.id, { allowDownload: v })} />
                    </div>
                    <button onClick={() => openManage(b)} className="text-muted-foreground"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default AdminDriveBooksTab
