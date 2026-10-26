'use client'
// ============================================================================
//  🔐 Secure Viewer — in-browser page-image viewer for owned Assessment docs.
//  No raw file link; each page is a signed, watermarked JPG. (Prompt 4)
// ============================================================================
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import OathModal from '@/components/OathModal'

const tokenGet = () => (typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null)
const deviceId = () => {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('lgo_device_id')
  if (!id) { id = (crypto?.randomUUID?.() || String(Date.now())); localStorage.setItem('lgo_device_id', id) }
  return id
}
const api = async (p, opts = {}) => {
  const token = tokenGet()
  const r = await fetch(`/api${p}`, { method: opts.method || 'GET', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-LGO-Device': deviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(j.error || 'Failed'); e.code = j.code; e.data = j; throw e }
  return j
}

// Secure page image. For same-origin /api/ page URLs it fetches the bytes with
// the bearer + device headers (the endpoint requires them), shows a blob, and
// on a 403 (expired 5-min token) asks the parent to re-mint tokens once and
// retries. For the Cloudinary fallback (absolute signed URL) it uses a plain
// <img> (those are cross-origin and need no auth).
function SecurePageImage({ url, index, onRefresh, alt }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [failed, setFailed] = useState(false)
  const isApi = typeof url === 'string' && url.startsWith('/api/')
  useEffect(() => {
    if (!isApi) return
    let dead = false; let obj = null
    const load = async (u, didRefresh) => {
      try {
        const token = tokenGet()
        const r = await fetch(u, { cache: 'no-store', headers: { 'X-LGO-Device': deviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
        if (r.status === 403 && !didRefresh && onRefresh) {
          const fresh = await onRefresh()
          if (fresh && fresh[index]) return load(fresh[index], true)
        }
        if (!r.ok) { if (!dead) setFailed(true); return }
        const b = await r.blob(); obj = URL.createObjectURL(b); if (!dead) setBlobUrl(obj)
      } catch { if (!dead) setFailed(true) }
    }
    load(url, false)
    return () => { dead = true; if (obj) URL.revokeObjectURL(obj) }
  }, [url, index, isApi, onRefresh])
  if (!isApi) return <img src={url} alt={alt} className="w-full block pointer-events-none" draggable={false} loading="lazy" />
  if (failed) return <div className="py-10 text-center text-[12px] text-slate-400">ପୃଷ୍ଠା ଲୋଡ୍ ହେଲା ନାହିଁ — ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ</div>
  if (!blobUrl) return <div className="py-10 text-center text-[12px] text-slate-400">ଲୋଡ୍ ହେଉଛି…</div>
  return <img src={blobUrl} alt={alt} className="w-full block pointer-events-none" draggable={false} />
}

export default function SecureViewer() {
  const params = useParams()
  const id = params?.id
  const [state, setState] = useState('loading') // loading|error|ready
  const [doc, setDoc] = useState({ title: '', pages: [], trace_code: '' })
  const [msg, setMsg] = useState('')
  const [oath, setOath] = useState(null)
  const [teacher, setTeacher] = useState(null)
  const [settings, setSettings] = useState({})

  const openDoc = useCallback(async (acc) => {
    setState('loading')
    try { setDoc(await api(`/assess/view/${id}${acc ? `?acc=${encodeURIComponent(acc)}` : ''}`)); setState('ready') }
    catch (e) {
      if (e.code === 'OATH_REQUIRED') {
        setOath({ open: true, mode: e.data.required || 'full', packId: e.data.pack_id, packName: e.data.pack_name })
        setState('gate')
        return
      }
      setState('error'); setMsg(e.code === 'VERIFY_REQUIRED' ? 'ଏହା ଦେଖିବା ପାଇଁ ଶିକ୍ଷକ ଯାଞ୍ଚ ଆବଶ୍ୟକ।' : (e.message || 'Failed'))
    }
  }, [id])

  // Single-flight re-mint of expired 5-min page tokens (R2 viewer only).
  const refreshingRef = useRef(null)
  const refreshPages = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current
    const p = (async () => {
      try {
        const r = await api(`/assess/view/${id}?refresh=1&trace=${encodeURIComponent(doc.trace_code || '')}`)
        setDoc((prev) => ({ ...prev, pages: r.pages || prev.pages }))
        return r.pages
      } catch { return null }
      finally { setTimeout(() => { refreshingRef.current = null }, 150) }
    })()
    refreshingRef.current = p
    return p
  }, [id, doc.trace_code])

  useEffect(() => {
    if (!id) return
    if (!tokenGet()) { setState('error'); setMsg('ଦୟାକରି ଲଗଇନ୍ କରନ୍ତୁ'); return }
    api('/assess/teacher/me').then(setTeacher).catch(() => {})
    api('/assess/config').then(c => setSettings(c.settings || {})).catch(() => {})
    openDoc(null)
  }, [id, openDoc])

  const submitOath = async ({ typed_name, checkboxes }) => {
    const r = await api('/assess/oath/accept', { method: 'POST', body: { pack_id: oath.packId, type: oath.mode, typed_name, checkboxes, document_id: id, context: 'view' } })
    setOath(null)
    await openDoc(r.acceptance_id)
  }

  return (
    <div className="min-h-screen bg-slate-800" style={{ fontFamily: "'Noto Sans Oriya', system-ui, sans-serif" }}
      onContextMenu={(e) => e.preventDefault()}>
      <div className="sticky top-0 z-10 text-white flex items-center gap-2 px-4 py-2.5" style={{ background: '#241a5e' }}>
        <a href="/assessment/my" className="text-[12px] bg-white/20 rounded-full px-3 py-1.5 font-bold">← ମୋ କିଣା</a>
        <div className="flex-1 font-bold text-sm truncate">{doc.title || 'ସୁରକ୍ଷିତ ଦର୍ଶକ'}</div>
        {doc.trace_code && <span className="text-[10px] opacity-70">#{doc.trace_code}</span>}
      </div>

      {state === 'loading' && <div className="text-center text-slate-300 py-16">ଲୋଡ୍ ହେଉଛି…</div>}
      {state === 'gate' && (
        <div className="text-center py-16 space-y-3">
          <div className="text-4xl">🔒</div>
          <div className="text-slate-200 font-bold">ଅନଲାଇନ୍ ଦେଖିବା ପାଇଁ ଗୋପନୀୟତା ଶପଥ ଆବଶ୍ୟକ</div>
        </div>
      )}
      {state === 'error' && (
        <div className="text-center py-16 space-y-3">
          <div className="text-4xl">🔒</div>
          <div className="text-slate-200 font-bold">{msg}</div>
          <a href="/assessment/my" className="inline-block px-5 py-2.5 rounded-xl font-black text-white" style={{ background: '#2a9d5c' }}>ମୋ କିଣାକୁ ଫେରନ୍ତୁ</a>
        </div>
      )}
      {state === 'ready' && (
        <div className="max-w-3xl mx-auto py-4 px-2 space-y-3 select-none">
          {doc.pages.map((src, i) => (
            <div key={i} className="relative bg-white rounded shadow overflow-hidden">
              <SecurePageImage url={src} index={i} onRefresh={refreshPages} alt={`Page ${i + 1}`} />
              {/* Faint tiled copy-id overlay → any screenshot stays traceable */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true"
                style={{ backgroundImage: `repeating-linear-gradient(-30deg, transparent 0 60px, rgba(0,0,0,0.015) 60px 120px)` }}>
                <div className="absolute inset-0 flex flex-wrap content-center justify-center gap-x-10 gap-y-14 -rotate-[30deg] scale-125">
                  {Array.from({ length: 12 }).map((_, k) => (
                    <span key={k} className="text-[11px] font-bold whitespace-nowrap" style={{ color: 'rgba(30,40,90,0.10)' }}>
                      LessonGuruOdisha.in · {doc.trace_code} · {teacher?.profile?.user_mobile || ''}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-center text-[11px] text-slate-400 py-1">ପୃଷ୍ଠା {i + 1} / {doc.count} · କପି #{doc.trace_code}</div>
            </div>
          ))}
          <p className="text-center text-[11px] text-slate-400 pt-2">ଏହି ସାମଗ୍ରୀ ଆପଣଙ୍କ ନାମରେ ୱାଟରମାର୍କ ହୋଇଛି। ପୁନଃବଣ୍ଟନ ନିଷେଧ।</p>
        </div>
      )}
      {oath?.open && (
        <OathModal open mode={oath.mode} action="view" packName={oath.packName}
          teacherName={teacher?.profile?.name_en || ''} schoolName={teacher?.profile?.school_en || ''}
          whatsapp={settings.whatsapp_number || '918093414633'} texts={settings.oath_texts || {}}
          onSubmit={submitOath} onCancel={() => { setOath(null); window.location.href = '/assessment/my' }} />
      )}
    </div>
  )
}
