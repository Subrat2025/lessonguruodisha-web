'use client'

import React, { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, RefreshCw, CheckCircle2, Languages, Copy } from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// 🈳 Admin → Worksheet Language Resolver: Unresolved Subjects
//   Subjects the language resolver could NOT classify fell through to the
//   app-default (Odia). They are logged here so admins can add them to
//   lib/questionEngine/subjectRegistry.js and stop future guesses.
// =============================================================================
const AdminUnresolvedSubjectsTab = ({ api }) => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [includeResolved, setIncludeResolved] = useState(false)
  const [busyKey, setBusyKey] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await api(`/admin/unresolved-subjects?includeResolved=${includeResolved ? '1' : '0'}&limit=300`)
      setRows(Array.isArray(r?.subjects) ? r.subjects : [])
    } catch (e) {
      toast.error('Failed to load unresolved subjects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [includeResolved])

  const resolve = async (key) => {
    setBusyKey(key)
    try {
      await api('/admin/unresolved-subjects/resolve', { method: 'POST', body: { key } })
      toast.success('Marked as handled')
      await load()
    } catch (e) {
      toast.error('Could not mark resolved')
    } finally {
      setBusyKey('')
    }
  }

  const copySnippet = (row) => {
    const key = String(row.subject || row.key || '').trim().toLowerCase()
    const snippet = `  '${key}': { language: 'Odia', script: 'Odia', numerals: 'odia' },`
    try {
      navigator.clipboard.writeText(snippet)
      toast.success('Registry snippet copied')
    } catch { toast.error('Copy failed') }
  }

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-4 rounded-2xl border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🈳</div>
          <div className="flex-1 min-w-0">
            <h2 className="font-extrabold text-base flex items-center gap-2">
              <Languages className="w-4 h-4" /> Worksheet Language — Unresolved Subjects
            </h2>
            <p className="text-[12px] text-muted-foreground mt-1">
              These subjects were not found in the registry and defaulted to <b>Odia</b>.
              Add them to <code className="text-[11px]">lib/questionEngine/subjectRegistry.js</code> with the
              correct language, then mark them handled here.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Switch id="incl" checked={includeResolved} onCheckedChange={setIncludeResolved} />
            <Label htmlFor="incl" className="text-[12px]">Show handled too</Label>
          </div>
          <Button size="sm" variant="outline" className="rounded-full" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-8 rounded-2xl text-center">
          <div className="text-4xl">✅</div>
          <p className="font-bold mt-2">No unresolved subjects</p>
          <p className="text-[12px] text-muted-foreground mt-1">
            The resolver has classified every subject it has seen. Great!
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Card key={row.key} className={`p-3 rounded-2xl border ${row.resolved ? 'opacity-60 border-emerald-200' : 'border-amber-200 dark:border-amber-900'}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-[15px] break-words">{row.subject || row.key}</span>
                    <Badge variant="secondary" className="rounded-full text-[10px]">seen {row.count || 1}×</Badge>
                    {row.resolved && <Badge className="rounded-full text-[10px] bg-emerald-600">handled</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {row.lastBook && <span>book: <b className="text-foreground">{row.lastBook}</b></span>}
                    {row.lastMedium && <span>medium: <b className="text-foreground">{row.lastMedium}</b></span>}
                    {Array.isArray(row.classes) && row.classes.length > 0 && (
                      <span>classes: <b className="text-foreground">{row.classes.join(', ')}</b></span>
                    )}
                    {row.lastSeenAt && <span>last: {new Date(row.lastSeenAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => copySnippet(row)} title="Copy registry snippet">
                    <Copy className="w-4 h-4" />
                  </Button>
                  {!row.resolved && (
                    <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700" onClick={() => resolve(row.key)} disabled={busyKey === row.key}>
                      {busyKey === row.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span className="ml-1.5">Handled</span>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminUnresolvedSubjectsTab
