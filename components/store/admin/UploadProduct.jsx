'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload, FileText, Sheet, Code2, Archive, Package, Check } from 'lucide-react'
import { API, getToken, sget, spost, sput, sdel, money, classColor } from '@/components/store/api'

const IND = '#241a5e', CORAL = '#e8452c', LAV = '#faf9ff', LAVB = '#b3abe0'

const TYPES = [
  ['answer_key', 'Answer key'], ['assessment_paper', 'Question paper'], ['pdf', 'PDF'],
  ['excel', 'Excel'], ['html', 'HTML'], ['bundle', 'Bundle'],
]
const SEC = [
  [1, 'Basic', 'Original file, 10 downloads'],
  [2, 'Standard', 'Name + mobile watermark, 5 downloads'],
  [3, 'High', 'Watermark + encrypted + oath, 3 downloads'],
  [4, 'View only', 'No download, secure viewer'],
]
const PREVIEWS = [
  ['blurred', 'Auto blurred page 1', 'Made on the server, unreadable'],
  ['first_free', 'First page free', 'Page 1 clear, rest blurred'],
  ['sample', 'Upload sample pages', 'Your own preview images'],
]
const kindIcon = (k) => k === 'excel' ? Sheet : k === 'html' ? Code2 : k === 'zip' ? Archive : FileText
const fmtBytes = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

const BLANK = {
  type: 'answer_key', titleOdia: '', titleEnglish: '', classes: [], subject: '', paper: '', exam: '', language: 'odia',
  mrpInr: '', priceInr: '', launchPriceInr: '', launchStart: '', launchEnd: '', premiumPriceInr: '',
  previewMode: 'blurred', securityLevel: 2, visibility: 'public', status: 'draft', publishAt: '', featured: false,
  whatsInside: [], fullDesc: '', bundleItems: [], maxPerUser: 1,
}

function uploadWithProgress(productId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData(); fd.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/admin/store/products/${productId}/files`)
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => { let d = {}; try { d = JSON.parse(xhr.responseText) } catch {}; xhr.status < 300 ? resolve(d) : reject(new Error(d.error || 'Upload failed')) }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(fd)
  })
}

export default function UploadProduct({ productId, onBack, onSaved }) {
  const [p, setP] = useState(BLANK)
  const [pid, setPid] = useState(productId || null)
  const [slug, setSlug] = useState('')
  const [files, setFiles] = useState([])        // saved files [{id,name,kind,pages,bytes}]
  const [uploads, setUploads] = useState([])     // in-flight [{name,pct,kind,bytes,done,error}]
  const [papers, setPapers] = useState([])
  const [cats, setCats] = useState([])
  const [allProds, setAllProds] = useState([])
  const [launchOn, setLaunchOn] = useState(false)
  const [premiumOn, setPremiumOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const dropRef = useRef(null)
  const isNew = !pid
  const up = (k, v) => setP(s => ({ ...s, [k]: v }))

  useEffect(() => { sget('/admin/store/categories').then(r => setCats(r.categories || [])).catch(() => {}) }, [])
  useEffect(() => { sget('/admin/store/products').then(r => setAllProds((r.products || []).filter(x => x.type !== 'bundle'))).catch(() => {}) }, [])
  // load existing product for edit
  useEffect(() => {
    if (!productId) return
    sget(`/admin/store/products/${productId}`).then(r => {
      const x = r.product; if (!x) return
      setP({
        type: x.type, titleOdia: x.titleOdia || '', titleEnglish: x.titleEnglish || '', classes: x.classes || [],
        subject: x.subject || '', paper: x.paper || '', exam: x.exam || '', language: x.language || 'odia',
        mrpInr: x.mrpInr ?? '', priceInr: x.priceInr ?? '', launchPriceInr: x.launchPriceInr ?? '',
        launchStart: (x.launchStart || '').slice(0, 10), launchEnd: (x.launchEnd || '').slice(0, 10),
        premiumPriceInr: x.premiumPriceInr ?? '', previewMode: x.previewMode || 'blurred', securityLevel: x.securityLevel || 2,
        visibility: x.visibility || 'public', status: x.status || 'draft', publishAt: (x.publishAt || '').slice(0, 16),
        featured: !!x.featured, whatsInside: x.whatsInside || [], fullDesc: x.fullDesc || '', bundleItems: x.bundleItems || [], maxPerUser: x.maxPerUser || 1,
      })
      setSlug(x.slug || ''); setLaunchOn(x.launchPriceInr != null && x.launchPriceInr !== ''); setPremiumOn(x.premiumPriceInr != null && x.premiumPriceInr !== '')
    }).catch(() => {})
  }, [productId])
  // files for edit
  useEffect(() => { if (slug) sget(`/store/product/${slug}`).then(r => setFiles(r.product?.files || [])).catch(() => {}) }, [slug])
  // papers by class
  useEffect(() => {
    const cls = p.classes[0]
    if (!cls) { setPapers([]); return }
    sget(`/admin/store/papers?class=${cls}`).then(r => setPapers(r.papers || [])).catch(() => setPapers([]))
  }, [p.classes])

  const buildBody = (status) => {
    const body = { ...p, status: status || p.status }
    if (!launchOn) { body.launchPriceInr = ''; body.launchStart = null; body.launchEnd = null }
    else { body.launchStart = p.launchStart ? new Date(p.launchStart).toISOString() : null; body.launchEnd = p.launchEnd ? new Date(p.launchEnd).toISOString() : null }
    if (!premiumOn) body.premiumPriceInr = ''
    if (status === 'scheduled' || (body.status === 'scheduled')) body.publishAt = p.publishAt ? new Date(p.publishAt).toISOString() : null
    return body
  }
  const persist = async (status) => {
    const body = buildBody(status)
    if (pid) { const r = await sput(`/admin/store/products/${pid}`, body); return r.product }
    const r = await spost('/admin/store/products', body); setPid(r.product.id); setSlug(r.product.slug); return r.product
  }
  const save = async (status) => {
    if (!p.titleEnglish && !p.titleOdia) { toast.error('Add a title first'); return null }
    setSaving(true)
    try { const prod = await persist(status); toast.success(status === 'published' ? 'Published' : status === 'scheduled' ? 'Scheduled' : 'Saved draft'); if (onSaved) onSaved(prod); return prod }
    catch (e) { toast.error(e.message); return null } finally { setSaving(false) }
  }
  const ensureSavedForUpload = async () => {
    if (pid) return pid
    const prod = await persist('draft'); return prod?.id
  }
  const handleFiles = async (list) => {
    const arr = Array.from(list || []); if (!arr.length) return
    let useId = pid
    try { useId = await ensureSavedForUpload() } catch (e) { toast.error('Save failed: ' + e.message); return }
    if (!useId) { toast.error('Add a title then try again'); return }
    for (const f of arr) {
      if (f.size > 25 * 1048576) { toast.error(`${f.name} too large (max 25MB)`); continue }
      const key = `${f.name}-${Date.now()}`
      setUploads(u => [...u, { key, name: f.name, pct: 0, bytes: f.size, done: false }])
      try {
        const r = await uploadWithProgress(useId, f, (pct) => setUploads(u => u.map(x => x.key === key ? { ...x, pct } : x)))
        setUploads(u => u.filter(x => x.key !== key))
        setFiles(fs => [...fs, r.file])
      } catch (e) { setUploads(u => u.map(x => x.key === key ? { ...x, error: e.message } : x)); toast.error(e.message) }
    }
  }
  const delFile = async (fid) => { if (!pid) return; try { await sdel(`/admin/store/products/${pid}/files/${fid}`); setFiles(fs => fs.filter(x => x.id !== fid)) } catch (e) { toast.error(e.message) } }
  const genPreview = async () => { if (!pid) { toast.error('Upload a PDF first'); return } try { await spost(`/admin/store/products/${pid}/preview`, {}); toast.success('Blurred preview generated') } catch (e) { toast.error(e.message) } }

  // drag events
  useEffect(() => {
    const el = dropRef.current; if (!el) return
    const over = e => { e.preventDefault(); el.style.background = '#efeafc' }
    const leave = e => { e.preventDefault(); el.style.background = LAV }
    const drop = e => { e.preventDefault(); el.style.background = LAV; handleFiles(e.dataTransfer.files) }
    el.addEventListener('dragover', over); el.addEventListener('dragleave', leave); el.addEventListener('drop', drop)
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('dragleave', leave); el.removeEventListener('drop', drop) }
  }) // eslint-disable-line

  // live preview pricing
  const prev = useMemo(() => {
    const mrp = Number(p.mrpInr) || 0
    const price = launchOn && p.launchPriceInr !== '' ? Number(p.launchPriceInr) : (Number(p.priceInr) || 0)
    const pct = mrp > price && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0
    return { mrp, price, pct }
  }, [p.mrpInr, p.priceInr, p.launchPriceInr, launchOn])
  const cls = p.classes[0] || '6'
  const cardColor = classColor(cls)

  const Card = ({ n, title, children }) => (
    <div className="bg-white rounded-[18px] border border-gray-100 p-4 md:p-5 shadow-sm">
      <div className="font-extrabold text-[15px] mb-3" style={{ color: IND }}>{n}. {title}</div>
      {children}
    </div>
  )
  const Field = ({ label, children }) => (<div><div className="text-[12px] text-gray-500 mb-1">{label}</div>{children}</div>)
  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2'

  return (
    <div>
      {/* header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[12px] text-gray-400"><button onClick={onBack} className="hover:underline">Products</button> › {isNew ? 'New product' : 'Edit'}</div>
          <h1 className="text-2xl font-extrabold" style={{ color: IND }}>{isNew ? 'Upload new product' : (p.titleEnglish || 'Edit product')}</h1>
        </div>
        <div className="flex gap-2">
          <button disabled={saving} onClick={() => save('draft')} className="font-bold text-sm rounded-full px-5 py-2 border" style={{ borderColor: IND, color: IND }}>Save draft</button>
          <button disabled={saving} onClick={() => save(p.status === 'scheduled' ? 'scheduled' : 'published')} className="font-bold text-sm rounded-full px-6 py-2 text-white" style={{ background: CORAL }}>{p.status === 'scheduled' ? 'Schedule' : 'Publish'}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        {/* LEFT */}
        <div className="space-y-4">
          <Card n={1} title="Product type">
            <div className="flex flex-wrap gap-2 mb-4">
              {TYPES.map(([v, l]) => (
                <button key={v} onClick={() => up('type', v)} className="text-[13px] font-bold rounded-full px-4 py-2 border" style={p.type === v ? { background: IND, color: '#fff', borderColor: IND } : { background: '#fff', color: IND, borderColor: '#e5e7eb' }}>{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Title (Odia)"><input value={p.titleOdia} onChange={e => up('titleOdia', e.target.value)} className={inp} /></Field>
              <Field label="Title (English)"><input value={p.titleEnglish} onChange={e => up('titleEnglish', e.target.value)} className={inp} /></Field>
              <Field label="Class"><input value={p.classes.join(',')} onChange={e => up('classes', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} placeholder="6" className={inp} /></Field>
              <Field label="Paper (from OSEPA paper list)">
                <select value={p.paper} onChange={e => { const pid2 = e.target.value; up('paper', pid2); const pap = papers.find(x => x.id === pid2); if (pap) up('subject', pap.nameEnglish) }} className={inp}>
                  <option value="">— {papers.length ? 'select paper' : 'enter class first'} —</option>
                  {papers.map(x => <option key={x.id} value={x.id}>{x.nameEnglish} ({x.paperType})</option>)}
                </select>
              </Field>
              <Field label="Exam"><input value={p.exam} onChange={e => up('exam', e.target.value)} placeholder="SA-1 2026" className={inp} /></Field>
              <Field label="Language"><select value={p.language} onChange={e => up('language', e.target.value)} className={inp}><option value="odia">ଓଡ଼ିଆ</option><option value="english">English</option><option value="bilingual">Bilingual</option></select></Field>
            </div>
            {p.type === 'bundle' && (
              <div className="mt-3 border rounded-lg p-2">
                <div className="text-[12px] font-bold mb-1" style={{ color: IND }}>Bundle items</div>
                <div className="max-h-40 overflow-auto space-y-1 text-[12px]">
                  {allProds.map(x => (<label key={x.id} className="flex items-center gap-2"><input type="checkbox" checked={(p.bundleItems || []).includes(x.id)} onChange={e => up('bundleItems', e.target.checked ? [...(p.bundleItems || []), x.id] : p.bundleItems.filter(i => i !== x.id))} /><span className="flex-1 truncate">{x.titleEnglish}</span><span className="text-gray-400">{money(x.pricing?.price)}</span></label>))}
                  {allProds.length === 0 && <div className="text-gray-400">Create some products first.</div>}
                </div>
              </div>
            )}
          </Card>

          <Card n={2} title="Files">
            <div ref={dropRef} className="rounded-xl p-6 text-center" style={{ border: `2px dashed ${LAVB}`, background: LAV }}>
              <Upload className="mx-auto mb-2" size={22} style={{ color: IND }} />
              <div className="text-[13px]"><b style={{ color: IND }}>Drag files here</b> or <label className="underline cursor-pointer" style={{ color: CORAL }}>browse<input type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} /></label></div>
              <div className="text-[11px] text-gray-400 mt-1">PDF, Excel, HTML, ZIP · max 25 MB each</div>
            </div>
            <div className="mt-3 space-y-2">
              {files.map(f => { const Ic = kindIcon(f.kind); return (
                <div key={f.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#fdecea' }}><Ic size={18} style={{ color: CORAL }} /></div>
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{f.name}</div><div className="h-1.5 bg-gray-100 rounded-full mt-1"><div className="h-full rounded-full" style={{ width: '100%', background: '#2a9d5c' }} /></div></div>
                  <div className="text-[12px] whitespace-nowrap" style={{ color: '#2a9d5c' }}>Uploaded · private</div>
                  <button onClick={() => delFile(f.id)} className="text-[11px] text-rose-500">remove</button>
                </div>
              )})}
              {uploads.map(u => { const Ic = kindIcon('pdf'); return (
                <div key={u.key} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#e7f1fb' }}><Ic size={18} style={{ color: '#1fa2d9' }} /></div>
                  <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{u.name} · {fmtBytes(u.bytes)}</div><div className="h-1.5 bg-gray-100 rounded-full mt-1"><div className="h-full rounded-full" style={{ width: `${u.pct}%`, background: '#1fa2d9' }} /></div></div>
                  <div className="text-[12px] whitespace-nowrap" style={{ color: u.error ? '#e8452c' : '#1fa2d9' }}>{u.error ? 'Failed' : `Uploading ${u.pct}%`}</div>
                </div>
              )})}
            </div>
          </Card>

          <Card n={3} title="Preview shown before purchase">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PREVIEWS.map(([v, t, d]) => (
                <button key={v} onClick={() => up('previewMode', v)} className="text-left rounded-xl p-3" style={{ border: p.previewMode === v ? `2px solid ${IND}` : '1px solid #e5e7eb' }}>
                  <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full inline-flex items-center justify-center border" style={{ borderColor: p.previewMode === v ? IND : '#cbd5e1' }}>{p.previewMode === v && <span className="w-2 h-2 rounded-full" style={{ background: IND }} />}</span><span className="font-bold text-[13px]">{t}</span></div>
                  <div className="text-[11px] text-gray-500 mt-1">{d}</div>
                </button>
              ))}
            </div>
            {p.previewMode === 'blurred' && <button onClick={genPreview} className="mt-3 text-[12px] rounded-full px-3 py-1.5" style={{ background: '#e7f1fb', color: '#1fa2d9' }}>Generate blurred preview now</button>}
          </Card>

          <Card n={4} title="Security level">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {SEC.map(([lv, t, d]) => (
                <button key={lv} onClick={() => up('securityLevel', lv)} className="text-left rounded-xl p-3" style={{ border: p.securityLevel === lv ? `2px solid ${IND}` : '1px solid #e5e7eb' }}>
                  <div className="flex items-center gap-2"><span className="w-4 h-4 rounded-full inline-flex items-center justify-center border" style={{ borderColor: p.securityLevel === lv ? IND : '#cbd5e1' }}>{p.securityLevel === lv && <span className="w-2 h-2 rounded-full" style={{ background: IND }} />}</span><span className="font-bold text-[13px]">Level {lv} · {t}</span></div>
                  <div className="text-[11px] text-gray-500 mt-1">{d}</div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <Card n={5} title="Price">
            <div className="grid grid-cols-2 gap-3">
              <Field label="MRP (crossed out)"><input type="number" value={p.mrpInr} onChange={e => up('mrpInr', e.target.value)} className={inp} /></Field>
              <Field label="Selling price"><input type="number" value={p.priceInr} onChange={e => up('priceInr', e.target.value)} className={inp} style={{ borderColor: IND, borderWidth: 2 }} /></Field>
            </div>
            <label className="flex items-center justify-between mt-3 text-[13px]"><span>Launch offer price</span><Toggle on={launchOn} set={setLaunchOn} /></label>
            {launchOn && (<div className="grid grid-cols-1 gap-2 mt-2"><Field label="Launch price ₹"><input type="number" value={p.launchPriceInr} onChange={e => up('launchPriceInr', e.target.value)} className={inp} /></Field><div className="grid grid-cols-2 gap-2"><Field label="Start"><input type="date" value={p.launchStart} onChange={e => up('launchStart', e.target.value)} className={inp} /></Field><Field label="End"><input type="date" value={p.launchEnd} onChange={e => up('launchEnd', e.target.value)} className={inp} /></Field></div></div>)}
            <label className="flex items-center justify-between mt-3 text-[13px]"><span>Premium subscriber price</span><Toggle on={premiumOn} set={setPremiumOn} /></label>
            {premiumOn && <Field label="Premium price ₹"><input type="number" value={p.premiumPriceInr} onChange={e => up('premiumPriceInr', e.target.value)} className={inp} /></Field>}
          </Card>

          <Card n={6} title="Visibility & publishing">
            <div className="flex gap-2 mb-3">
              {[['public', 'Public'], ['link_only', 'Link-only']].map(([v, l]) => (<button key={v} onClick={() => up('visibility', v)} className="flex-1 text-[13px] font-bold rounded-full px-3 py-2" style={p.visibility === v ? { background: IND, color: '#fff' } : { background: '#f1f0f7', color: IND }}>{l}</button>))}
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[['draft', 'Draft'], ['published', 'Publish now'], ['scheduled', 'Schedule']].map(([v, l]) => (<button key={v} onClick={() => up('status', v)} className="text-[12px] font-bold rounded-full px-2 py-2" style={p.status === v ? { background: IND, color: '#fff' } : { background: '#f1f0f7', color: IND }}>{l}</button>))}
            </div>
            {p.status === 'scheduled' && <Field label="Publish at"><input type="datetime-local" value={p.publishAt} onChange={e => up('publishAt', e.target.value)} className={inp} /></Field>}
            <label className="flex items-center gap-2 mt-3 text-[13px]"><input type="checkbox" checked={p.featured} onChange={e => up('featured', e.target.checked)} />Feature on store home</label>
          </Card>

          <div className="bg-white rounded-[18px] border border-gray-100 p-4">
            <div className="font-extrabold text-[13px] mb-2" style={{ color: IND }}>Live preview</div>
            <div className="rounded-2xl overflow-hidden border border-gray-100 max-w-[220px]">
              <div className="relative h-28 flex items-center justify-center" style={{ background: `${cardColor}14` }}>
                {prev.pct > 0 && <span className="absolute top-2 left-2 text-[10px] font-bold text-white rounded-full px-2 py-0.5" style={{ background: CORAL }}>{prev.pct}% ଛାଡ଼</span>}
                <div className="text-center"><div className="text-[11px] font-bold" style={{ color: cardColor }}>ଶ୍ରେଣୀ {cls}</div><div className="text-xl font-extrabold" style={{ color: cardColor }}>{p.subject || p.titleEnglish?.slice(0, 10) || '—'}</div></div>
              </div>
              <div className="p-2.5">
                <div className="text-[12px] font-semibold line-clamp-2 min-h-[32px]">{p.titleOdia || p.titleEnglish || 'ଉତ୍ପାଦ ନାମ'}</div>
                <div className="mt-1"><span className="font-extrabold" style={{ color: CORAL }}>{money(prev.price)}</span> {prev.mrp > prev.price && <span className="text-[11px] text-gray-400 line-through ml-1">{money(prev.mrp)}</span>}</div>
              </div>
            </div>
            <div className="text-[10px] text-gray-400 mt-2">Cover auto-made from class + subject</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Toggle({ on, set }) {
  return <button onClick={() => set(!on)} className="w-10 h-6 rounded-full relative transition" style={{ background: on ? '#241a5e' : '#d9d6ec' }}><span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition" style={{ left: on ? 18 : 2 }} /></button>
}
