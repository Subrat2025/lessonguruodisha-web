'use client'
import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Link2, Share2, Pencil, X } from 'lucide-react'
import { sget, money, API } from '@/components/store/api'

const IND = '#241a5e', CORAL = '#e8452c'
const STATUS_COLORS = { published: '#2a9d5c', draft: '#f7b32b', scheduled: '#1fa2d9', archived: '#9ca3af' }

export default function ProductsList({ onNew, onEdit, bundlesOnly = false }) {
  const [list, setList] = useState([])
  const [status, setStatus] = useState('')
  const [share, setShare] = useState(null)
  const load = () => sget('/admin/store/products').then(r => {
    let rows = r.products || []
    if (bundlesOnly) rows = rows.filter(p => p.type === 'bundle')
    setList(rows)
  }).catch(e => toast.error(e.message))
  useEffect(() => { load() }, []) // eslint-disable-line
  const shown = status ? list.filter(p => p.status === status) : list
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-extrabold" style={{ color: IND }}>{bundlesOnly ? 'Bundles' : 'Products'}</h1>
        <button onClick={onNew} className="font-bold text-sm rounded-full px-5 py-2 text-white" style={{ background: CORAL }}>+ {bundlesOnly ? 'New bundle' : 'Upload new product'}</button>
      </div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {[['', 'All'], ['published', 'Published'], ['draft', 'Draft'], ['scheduled', 'Scheduled'], ['archived', 'Archived']].map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v)} className="text-[12px] font-bold rounded-full px-3 py-1.5" style={status === v ? { background: IND, color: '#fff' } : { background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb' }}>{l}</button>
        ))}
      </div>
      <div className="bg-white rounded-[18px] border border-gray-100 overflow-hidden">
        {shown.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? '1px solid #f1f1f4' : 'none' }}>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold truncate" style={{ color: IND }}>{p.titleEnglish}</div>
              <div className="text-[11px] text-gray-400">{p.type} · {money(p.pricing?.price)}{p.pricing?.mrp > p.pricing?.price ? ` (MRP ${money(p.pricing.mrp)})` : ''} · {p.salesCount || 0} sold · {p.visibility}</div>
            </div>
            <span className="text-[10px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: STATUS_COLORS[p.status] || '#9ca3af' }}>{p.status}</span>
            <button onClick={() => { navigator.clipboard?.writeText(`${origin}/store/p/${p.slug}`); toast.success('Link copied') }} title="Copy link" className="p-2 rounded-lg hover:bg-gray-50"><Link2 size={16} style={{ color: IND }} /></button>
            <button onClick={() => setShare(p)} title="Share link" className="p-2 rounded-lg hover:bg-gray-50"><Share2 size={16} style={{ color: '#1fa2d9' }} /></button>
            <button onClick={() => onEdit(p.id)} className="text-[12px] font-bold rounded-full px-3 py-1.5 text-white" style={{ background: IND }}><Pencil size={12} className="inline mr-1" />Edit</button>
          </div>
        ))}
        {shown.length === 0 && <div className="p-6 text-center text-sm text-gray-400">No products.</div>}
      </div>
      {share && <ShareModal product={share} origin={origin} onClose={() => setShare(null)} />}
    </div>
  )
}

function ShareModal({ product, origin, onClose }) {
  const [tag, setTag] = useState('whatsapp')
  const [links, setLinks] = useState([])
  const url = `${origin}/store/p/${product.slug}${tag ? `?src=${encodeURIComponent(tag)}` : ''}`
  useEffect(() => { sget(`/admin/store/share-links?productId=${product.id}`).then(r => setLinks(r.links || [])).catch(() => {}) }, [product.id])
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3"><div className="font-extrabold" style={{ color: IND }}>Share link</div><button onClick={onClose}><X size={18} /></button></div>
        <div className="text-[12px] text-gray-500 mb-1">Campaign tag (tracks clicks)</div>
        <input value={tag} onChange={e => setTag(e.target.value.replace(/[^a-z0-9_-]/gi, ''))} className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="whatsapp" />
        <div className="bg-gray-50 border rounded-lg px-3 py-2 text-[12px] break-all">{url}</div>
        <button onClick={() => { navigator.clipboard?.writeText(url); toast.success('Share link copied') }} className="mt-2 w-full font-bold text-white rounded-full py-2 text-sm" style={{ background: CORAL }}>Copy share link</button>
        {links.length > 0 && (
          <div className="mt-4">
            <div className="text-[12px] font-bold mb-1" style={{ color: IND }}>Link performance</div>
            {links.map(l => <div key={l.id} className="flex justify-between text-[12px] py-1 border-b last:border-0"><span className="font-mono">?src={l.tag}</span><span className="text-gray-500">{l.clicks} clicks</span></div>)}
          </div>
        )}
      </div>
    </div>
  )
}
