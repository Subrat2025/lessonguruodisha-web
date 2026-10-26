'use client'
import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

// IST-local YYYY-MM-DD helpers (admin is in IST).
const ymd = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export default function RecoveryExportDialog({ filters = {} }) {
  const [open, setOpen] = useState(false)
  const [dateType, setDateType] = useState('expiry')     // expiry | renewed | contacted
  const [quick, setQuick] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [format, setFormat] = useState('xlsx')
  const [busy, setBusy] = useState(false)

  const applyQuick = (key) => {
    setQuick(key)
    const today = new Date()
    if (key === 'today') { setFrom(ymd(today)); setTo(ymd(today)) }
    else if (key === '7') { setFrom(ymd(addDays(today, -6))); setTo(ymd(today)) }
    else if (key === '30') { setFrom(ymd(addDays(today, -29))); setTo(ymd(today)) }
    else if (key === 'month') { setFrom(ymd(new Date(today.getFullYear(), today.getMonth(), 1))); setTo(ymd(today)) }
    else if (key === 'all') { setFrom(''); setTo('') }
    // 'custom' keeps whatever is typed
  }

  const doExport = async () => {
    setBusy(true)
    try {
      const token = localStorage.getItem('em_token') || localStorage.getItem('token')
      const qs = new URLSearchParams()
      qs.set('format', format); qs.set('dateType', dateType)
      if (from) qs.set('from', from)
      if (to) qs.set('to', to)
      if (filters.bucket) qs.set('bucket', filters.bucket)
      if (filters.plan) qs.set('plan', filters.plan)
      if (filters.contact) qs.set('contact', filters.contact)
      if (filters.search) qs.set('search', filters.search)
      const res = await fetch('/api/admin/recovery-export?' + qs.toString(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Export failed (' + res.status + ')')
      const cd = res.headers.get('content-disposition') || ''
      const m = cd.match(/filename="([^"]+)"/)
      const fname = m ? m[1] : `recovery.${format}`
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = fname; a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded: ' + fname)
      setOpen(false)
    } catch (e) {
      toast.error(e?.message || 'Export failed')
    } finally { setBusy(false) }
  }

  const activeFilters = [
    filters.bucket && `age:${filters.bucket}`,
    filters.plan && `plan`,
    filters.contact && `contact:${filters.contact}`,
    filters.search && `search:"${filters.search}"`,
  ].filter(Boolean)

  const Seg = ({ val, cur, set, children }) => (
    <button type="button" onClick={() => set(val)}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${cur === val ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:bg-muted'}`}>
      {children}
    </button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-full h-8">📥 Export</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Export recovery list</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <div className="font-semibold mb-1.5 text-muted-foreground text-xs uppercase">Date type</div>
            <div className="flex gap-2 flex-wrap">
              <Seg val="expiry" cur={dateType} set={setDateType}>Expiry date</Seg>
              <Seg val="renewed" cur={dateType} set={setDateType}>Renewed date</Seg>
              <Seg val="contacted" cur={dateType} set={setDateType}>Contacted date</Seg>
            </div>
          </div>
          <div>
            <div className="font-semibold mb-1.5 text-muted-foreground text-xs uppercase">Date range (IST)</div>
            <div className="flex gap-2 flex-wrap mb-2">
              <Seg val="all" cur={quick} set={applyQuick}>All</Seg>
              <Seg val="today" cur={quick} set={applyQuick}>Today</Seg>
              <Seg val="7" cur={quick} set={applyQuick}>Last 7 days</Seg>
              <Seg val="30" cur={quick} set={applyQuick}>Last 30 days</Seg>
              <Seg val="month" cur={quick} set={applyQuick}>This month</Seg>
              <Seg val="custom" cur={quick} set={applyQuick}>Custom</Seg>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setQuick('custom') }}
                className="flex-1 border border-border rounded-md px-2 py-1.5 bg-background" />
              <span className="text-muted-foreground">to</span>
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setQuick('custom') }}
                className="flex-1 border border-border rounded-md px-2 py-1.5 bg-background" />
            </div>
            {!from && !to && <div className="text-xs text-muted-foreground mt-1">No range = all matching records.</div>}
          </div>
          <div>
            <div className="font-semibold mb-1.5 text-muted-foreground text-xs uppercase">Format</div>
            <div className="flex gap-2">
              <Seg val="xlsx" cur={format} set={setFormat}>Excel (.xlsx)</Seg>
              <Seg val="csv" cur={format} set={setFormat}>CSV</Seg>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
            Applies current filters: {activeFilters.length ? activeFilters.join(' · ') : 'none (all expired users)'}.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={doExport} disabled={busy}>{busy ? 'Exporting…' : 'Download'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
