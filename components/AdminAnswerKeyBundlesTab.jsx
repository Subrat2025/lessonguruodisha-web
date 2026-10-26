'use client'
// === ANSWER KEY BUNDLES === Admin: seed, papers, products (prices), exams, analytics.
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { RefreshCw, Loader2 } from 'lucide-react'

const token = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : null)
const H = () => { const t = token(); return t ? { Authorization: `Bearer ${t}` } : {} }
const jget = async (p) => { const r = await fetch(`/api${p}`, { headers: H(), cache: 'no-store' }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d }
const jsend = async (p, m, b) => { const r = await fetch(`/api${p}`, { method: m, headers: { 'Content-Type': 'application/json', ...H() }, body: JSON.stringify(b || {}) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Error'); return d }

export default function AdminAnswerKeyBundlesTab() {
  const [tab, setTab] = useState('products')
  const [products, setProducts] = useState([])
  const [exams, setExams] = useState([])
  const [papers, setPapers] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [priceLog, setPriceLog] = useState([])
  const [newExam, setNewExam] = useState({ name: '', endDate: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      if (tab === 'products') setProducts((await jget('/admin/answer-key/products')).products || [])
      if (tab === 'exams') setExams((await jget('/admin/answer-key/exams')).exams || [])
      if (tab === 'papers') setPapers((await jget('/admin/answer-key/papers')).papers || [])
      if (tab === 'analytics') setAnalytics(await jget('/admin/answer-key/bundle-analytics'))
      if (tab === 'pricelog') setPriceLog((await jget('/admin/answer-key/price-log')).log || [])
    } catch (e) { toast.error(e.message) }
  }, [tab])
  useEffect(() => { load() }, [load])

  const seed = async () => { setBusy(true); try { await jsend('/admin/answer-key/bundles/seed', 'POST'); toast.success('Seeded papers + products'); load() } catch (e) { toast.error(e.message) } finally { setBusy(false) } }
  const savePrice = async (p, priceInr) => { try { await jsend('/admin/answer-key/products', 'PUT', { id: p.id, priceInr: Number(priceInr) }); toast.success('Price saved'); load() } catch (e) { toast.error(e.message) } }
  const toggleProduct = async (p) => { try { await jsend('/admin/answer-key/products', 'PUT', { id: p.id, active: !p.active }); load() } catch (e) { toast.error(e.message) } }
  const togglePaper = async (p) => { try { await jsend('/admin/answer-key/papers', 'PUT', { id: p.id, active: !p.active }); load() } catch (e) { toast.error(e.message) } }
  const addExam = async () => { if (!newExam.name || !newExam.endDate) return toast.error('Name + end date required'); try { await jsend('/admin/answer-key/exams', 'POST', newExam); toast.success('Exam added'); setNewExam({ name: '', endDate: '' }); load() } catch (e) { toast.error(e.message) } }

  return (
    <div className="space-y-3 mt-3">
      <div className="flex gap-2 flex-wrap items-center">
        {['products', 'exams', 'papers', 'analytics', 'pricelog'].map(t => <Button key={t} size="sm" variant={tab === t ? 'default' : 'outline'} onClick={() => setTab(t)} className="rounded-full capitalize text-[11px] h-7">{t}</Button>)}
        <Button size="sm" variant="outline" onClick={seed} disabled={busy} className="rounded-full ml-auto text-[11px] h-7">{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Seed data'}</Button>
        <Button size="sm" variant="outline" onClick={load} className="rounded-full text-[11px] h-7"><RefreshCw className="w-3 h-3" /></Button>
      </div>

      {tab === 'products' && <div className="space-y-1.5">{products.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No products. Click “Seed data”.</p>}{products.map(p => (
        <Card key={p.id} className="p-2 rounded-xl border flex items-center gap-2">
          <div className="flex-1 min-w-0"><p className="text-sm font-bold truncate">{p.nameEnglish}</p><p className="text-[10px] text-muted-foreground">Classes {p.classes.join(', ')}</p></div>
          <Input type="number" defaultValue={p.priceInr} className="w-20 h-8" onBlur={e => { if (Number(e.target.value) !== p.priceInr) savePrice(p, e.target.value) }} />
          <Switch checked={!!p.active} onCheckedChange={() => toggleProduct(p)} />
        </Card>))}</div>}

      {tab === 'exams' && <div className="space-y-2">
        <Card className="p-3 rounded-xl border flex gap-2 items-end flex-wrap">
          <div className="flex-1"><p className="text-[11px] font-bold">Exam name</p><Input value={newExam.name} onChange={e => setNewExam(s => ({ ...s, name: e.target.value }))} placeholder="SA-1 2026" /></div>
          <div><p className="text-[11px] font-bold">End date</p><Input type="date" value={newExam.endDate} onChange={e => setNewExam(s => ({ ...s, endDate: e.target.value }))} /></div>
          <Button size="sm" className="rounded-full" onClick={addExam}>Add</Button>
        </Card>
        {exams.map(e => <Card key={e.id} className="p-2 rounded-xl border flex items-center gap-2"><span className="flex-1 text-sm font-bold">{e.name}</span><span className="text-[10px] text-muted-foreground">ends {new Date(e.endDate).toLocaleDateString('en-IN')}</span><Switch checked={!!e.active} onCheckedChange={() => jsend('/admin/answer-key/exams', 'PUT', { id: e.id, active: !e.active }).then(load)} /></Card>)}
      </div>}

      {tab === 'papers' && <div className="space-y-1">{papers.map(p => (
        <div key={p.id} className="flex items-center gap-2 text-[11px] border-b py-1"><span className="w-8 font-bold">C{p.class}</span><span className="flex-1 truncate">{p.nameOdia}</span><span className={`px-1.5 rounded ${p.paperType === 'long' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100'}`}>{p.paperType}</span><Switch checked={!!p.active} onCheckedChange={() => togglePaper(p)} /></div>))}</div>}

      {tab === 'analytics' && analytics && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{[['Bundles sold', analytics.bundlesSold], ['Bundle revenue ₹', analytics.bundleRevenue], ['Avg papers used', analytics.avgPapersUsed], ['Unused slots', analytics.unusedSlots], ['Combined revenue ₹', analytics.combinedRevenue]].map(([l, v]) => <Card key={l} className="p-3 rounded-2xl border-2"><p className="text-[10px] text-muted-foreground font-bold">{l}</p><p className="text-2xl font-extrabold">{v}</p></Card>)}</div>}

      {tab === 'pricelog' && <div className="space-y-1">{priceLog.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No price changes yet.</p>}{priceLog.map(l => <div key={l.id} className="text-[11px] border-b py-1">{l.refId}: {l.field} {l.oldValue} → {l.newValue} · {new Date(l.at).toLocaleString('en-IN')}</div>)}</div>}
    </div>
  )
}
