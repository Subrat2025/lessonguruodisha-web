'use client'
// ============================================================================
//  🎒 My Purchases (ମୋ କିଣା) — owned packs, secure viewer & watermarked
//  downloads. Renders buttons ONLY from server per-document status (Prompt 4
//  bugfix). Teacher verification + terms + one-time download token flow.
// ============================================================================
import React, { useEffect, useState, useCallback } from 'react'
import OathModal from '@/components/OathModal'
import PromoAd from '@/components/PromoAd'

const tokenGet = () => (typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null)
// Stable per-browser device id (localStorage) — bound to download tokens + the
// "max 2 devices" rule. Generated on first use; never sent to third parties.
const deviceId = () => {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('lgo_device_id')
  if (!id) { id = (crypto?.randomUUID?.() || String(Date.now()) + Math.random().toString(16).slice(2)); localStorage.setItem('lgo_device_id', id) }
  return id
}
const api = async (p, opts = {}) => {
  const token = tokenGet()
  const r = await fetch(`/api${p}`, {
    method: opts.method || 'GET', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-LGO-Device': deviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(j.error || 'Failed'); e.code = j.code; e.data = j; throw e }
  return j
}
const inr = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN')
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '' } }

export default function MyPurchases() {
  const [state, setState] = useState('loading')
  const [data, setData] = useState({ orders: [], packs: [], documents: [], teacher_status: null, terms_accepted: false })
  const [teacher, setTeacher] = useState({ profile: null, required: true })
  const [busy, setBusy] = useState(null)
  const [showVerify, setShowVerify] = useState(false)
  const [openCls, setOpenCls] = useState({})
  const [terms, setTerms] = useState(null) // {docId} or {packCode} pending after accept
  const [pk, setPk] = useState({}) // packCode -> {status, done, total, error}
  const [history, setHistory] = useState([])
  const [settings, setSettings] = useState({})
  const [oath, setOath] = useState(null)   // { open, mode, action, packId, packName, documentId, proceed }
  const [flash, setFlash] = useState('')
  const [now, setNow] = useState(Date.now())
  const showFlash = (m) => { setFlash(m); setTimeout(() => setFlash(''), 3800) }

  const loadHistory = useCallback(async () => {
    try { const r = await api('/assess/my/downloads'); setHistory(r.downloads || []) } catch (_e) {}
  }, [])
  const load = useCallback(async () => {
    if (!tokenGet()) { setState('noauth'); return }
    try { setData(await api('/assess/my')); setState('ready') }
    catch (e) { if (String(e.message).toLowerCase().includes('login')) setState('noauth'); else setState('ready') }
    try { setTeacher(await api('/assess/teacher/me')) } catch (_e) {}
    try { const c = await api('/assess/config'); setSettings(c.settings || {}) } catch (_e) {}
    loadHistory()
  }, [loadHistory])
  useEffect(() => { load() }, [load])
  // Live clock for release countdowns + auto-unlock: tick every 1s; when any
  // not-yet-released owned doc reaches its time, refresh so it becomes available.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(prev => {
        const n = Date.now()
        const due = (data.documents || []).some(dc => dc.status === 'not_released' && dc.release_at && new Date(dc.release_at).getTime() <= n && new Date(dc.release_at).getTime() > prev)
        if (due) load()
        return n
      })
    }, 1000)
    return () => clearInterval(t)
  }, [data.documents, load])

  // Record the confidentiality oath, then run the pending action.
  const submitOath = async ({ typed_name, checkboxes }) => {
    if (!oath) return
    const r = await api('/assess/oath/accept', { method: 'POST', body: { pack_id: oath.packId, type: oath.mode, typed_name, checkboxes, document_id: oath.documentId || null, context: oath.action } })
    setOath(null)
    await oath.proceed(r.acceptance_id)
  }

  // Download flow (Prompt 4-B + oath): request token → stream personal copy.
  const streamDownload = async (docId, fallbackName, acceptance_id) => {
    const t = await api('/assess/download-request', { method: 'POST', body: { document_id: docId, acceptance_id } })
    const token = tokenGet()
    const resp = await fetch(`/api/assess/download/${encodeURIComponent(t.token)}`, {
      cache: 'no-store', headers: { 'X-LGO-Device': deviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    if (!resp.ok) { const j = await resp.json().catch(() => ({})); const e = new Error(j.error || 'Download failed'); e.code = j.code; throw e }
    const blob = await resp.blob()
    const cd = resp.headers.get('Content-Disposition') || ''
    const m = cd.match(/filename="?([^"]+)"?/)
    const name = (m && m[1]) || fallbackName || 'document.pdf'
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    loadHistory(); load()
    showFlash(settings.oath_texts?.success_toast || '✅ ଆପଣଙ୍କ ବ୍ୟକ୍ତିଗତ କପି ପ୍ରସ୍ତୁତ — ଦୟାକରି ଗୋପନ ରଖନ୍ତୁ ।')
  }
  const startDownload = async (docId, fallbackName) => {
    setBusy('dl:' + docId)
    try { await streamDownload(docId, fallbackName, null) }
    catch (e) {
      if (e.code === 'OATH_REQUIRED') {
        setBusy(null)
        setOath({ open: true, mode: e.data.required || 'full', action: 'download', packId: e.data.pack_id, packName: e.data.pack_name, documentId: docId,
          proceed: async (acc) => { setBusy('dl:' + docId); try { await streamDownload(docId, fallbackName, acc) } catch (e2) { alert(e2.message || 'Download failed') } finally { setBusy(null) } } })
        return
      }
      if (e.code === 'VERIFY_REQUIRED') setShowVerify(true)
      else if (e.code === 'STORE_LOCKED') alert(e.message)
      else if (e.code === 'LIMIT_REACHED' || e.code === 'DAILY_LIMIT_REACHED' || e.code === 'TOTAL_LIMIT_REACHED') { alert(e.message); load() }
      else if (e.code === 'BUILD_FAILED') alert(e.message || 'ଡାଉନଲୋଡ୍ ପ୍ରସ୍ତୁତ ହେଲା ନାହିଁ — ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ')
      else alert(e.message || 'Download failed')
    } finally { setBusy(null) }
  }
  const acceptTermsThen = async () => {
    const pending = terms
    setTerms(null)
    try { await api('/assess/terms/accept', { method: 'POST' }); await load() } catch (_e) {}
    if (pending?.docId) startDownload(pending.docId)
    else if (pending?.packCode) downloadPack(pending.packCode)
  }
  const view = (docId) => { window.location.href = `/assessment/view/${docId}` }

  // Whole-pack ZIP: prepare → poll → fetch blob (with auth) → save.
  const runPack = async (packCode, acceptance_id) => {
    setPk(s => ({ ...s, [packCode]: { status: 'preparing', done: 0, total: 0 } }))
    const r = await api(`/assess/pack-download/${packCode}/prepare`, { method: 'POST', body: { acceptance_id } })
    const jobId = r.job_id
    for (let n = 0; n < 600; n++) {
      await new Promise(res => setTimeout(res, 2000))
      const jr = await api(`/assess/pack-download/job/${jobId}`)
      const j = jr.job
      if (j.status === 'building' || j.status === 'queued') setPk(s => ({ ...s, [packCode]: { status: 'building', done: j.done || 0, total: j.total || 0 } }))
      else if (j.status === 'done') {
        setPk(s => ({ ...s, [packCode]: { status: 'downloading', done: j.done, total: j.total } }))
        const token = tokenGet()
        const resp = await fetch(`/api/assess/pack-download/${jobId}/file?token=${encodeURIComponent(j.token)}`, { headers: { 'X-LGO-Device': deviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
        if (!resp.ok) throw new Error('Download failed')
        const blob = await resp.blob()
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${packCode}_2026-27.zip`; document.body.appendChild(a); a.click(); a.remove()
        setPk(s => ({ ...s, [packCode]: { status: 'done', done: j.done, total: j.total, skipped: j.skipped } }))
        loadHistory(); load()
        showFlash(settings.oath_texts?.success_toast || '✅ ଆପଣଙ୍କ ବ୍ୟକ୍ତିଗତ କପି ପ୍ରସ୍ତୁତ — ଦୟାକରି ଗୋପନ ରଖନ୍ତୁ ।')
        return
      } else if (j.status === 'error') { throw new Error(j.error || 'Build failed') }
    }
  }
  const downloadPack = async (packCode) => {
    try { await runPack(packCode, null) }
    catch (e) {
      if (e.code === 'OATH_REQUIRED') {
        setPk(s => ({ ...s, [packCode]: null }))
        setOath({ open: true, mode: e.data.required || 'full', action: 'download', packId: e.data.pack_id, packName: e.data.pack_name,
          proceed: async (acc) => { try { await runPack(packCode, acc) } catch (e2) { if (e2.code === 'VERIFY_REQUIRED') setShowVerify(true); else setPk(s => ({ ...s, [packCode]: { status: 'error', error: e2.message } })) } } })
        return
      }
      if (e.code === 'VERIFY_REQUIRED') { setShowVerify(true); setPk(s => ({ ...s, [packCode]: null })) }
      else { setPk(s => ({ ...s, [packCode]: { status: 'error', error: e.message } })); if (e.code === 'LIMIT_REACHED' || e.code === 'DAILY_LIMIT_REACHED' || e.code === 'STORE_LOCKED') { alert(e.message); load() } }
    }
  }

  const wrap = (children) => (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Noto Sans Oriya', system-ui, sans-serif" }}>
      <div className="text-white" style={{ background: 'linear-gradient(135deg,#241a5e,#1fa2d9)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-2xl">🎒</span>
          <div className="flex-1"><div className="font-black text-lg">ମୋ କିଣାକିଣି</div><div className="text-[11px] opacity-80">My Purchases · Assessment Store</div></div>
          <a href="/assessment" className="text-[12px] bg-white/20 rounded-full px-3 py-1.5 font-bold">← ଭଣ୍ଡାର</a>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-5">{children}</div>
      {showVerify && <VerifyModal profile={teacher.profile} onClose={() => setShowVerify(false)} onDone={(p) => { setTeacher(t => ({ ...t, profile: p })); setShowVerify(false); load() }} />}
      {terms && <TermsModal onClose={() => setTerms(null)} onAccept={acceptTermsThen} />}
      {oath?.open && (
        <OathModal open mode={oath.mode} action={oath.action} packName={oath.packName}
          teacherName={teacher?.profile?.name_en || ''} schoolName={teacher?.profile?.school_en || ''}
          whatsapp={settings.whatsapp_number || '918093414633'} texts={settings.oath_texts || {}}
          onSubmit={submitOath} onCancel={() => setOath(null)} />
      )}
      {flash && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] max-w-[92vw] px-4 py-3 rounded-2xl shadow-2xl text-white text-[13px] font-bold text-center"
          style={{ background: 'linear-gradient(135deg,#2a9d5c,#0c8f8f)', fontFamily: "'Noto Sans Oriya', system-ui, sans-serif" }}>{flash}</div>
      )}
    </div>
  )

  if (state === 'loading') return wrap(<div className="text-center text-slate-500 py-10">ଲୋଡ୍ ହେଉଛି…</div>)
  if (state === 'noauth') return wrap(
    <div className="text-center py-10 space-y-3">
      <div className="text-4xl">🔒</div>
      <div className="font-bold text-slate-700">ଦୟାକରି ଲଗଇନ୍ କରନ୍ତୁ</div>
      <a href="/" className="inline-block px-5 py-2.5 rounded-xl font-black text-white" style={{ background: '#241a5e' }}>ମୁଖ୍ୟ ପୃଷ୍ଠାକୁ ଯାଆନ୍ତୁ</a>
    </div>
  )

  const docs = data.documents || []
  const teacherPending = docs.some(dc => dc.status === 'verification_pending')
  const _OD = ['୦','୧','୨','୩','୪','୫','୬','୭','୮','୯']
  const toOdia = (n) => String(n ?? '').replace(/[0-9]/g, d => _OD[+d])
  const perDocLimit = data.per_document_daily_limit || 2
  const packZipLimit = data.pack_zip_daily_limit || 2
  const fmtCountdown = (iso) => {
    const ms = new Date(iso).getTime() - now
    if (ms <= 0) return null
    const dY = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000)
    if (dY > 0) return `${toOdia(dY)} ଦିନ ${toOdia(h)} ଘଣ୍ଟା ବାକି`
    if (h > 0) return `${toOdia(h)} ଘଣ୍ଟା ${toOdia(m)} ମିନିଟ୍ ବାକି`
    return `${toOdia(m)} ମିନିଟ୍ ${toOdia(s)} ସେକେଣ୍ଡ ବାକି`
  }

  const DocButtons = ({ dc }) => {
    if (dc.status === 'available') {
      const lim = perDocLimit
      const rem = dc.dl_daily_remaining ?? lim
      const lockedToday = !!dc.dl_locked_today
      const lockedTotal = !!dc.dl_locked_total
      const blocked = lockedToday || lockedTotal
      return (
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1.5">
            {dc.can_view && <button onClick={() => view(dc.id)} className="text-[12px] font-bold rounded-full px-3 py-1.5 border" style={{ borderColor: '#241a5e', color: '#241a5e' }}>👁 ଅନଲାଇନ୍ ଦେଖନ୍ତୁ</button>}
            {blocked ? (
              <span className="text-[11px] font-bold rounded-full px-3 py-1.5" style={{ background: '#fee2e2', color: '#b91c1c' }}>⛔ ଆଜିର ସୀମା ସମାପ୍ତ</span>
            ) : (
              <button disabled={busy === 'dl:' + dc.id} onClick={() => startDownload(dc.id, (dc.title_or || 'document') + '.pdf')} className="text-[12px] font-bold text-white rounded-full px-3 py-1.5" style={{ background: '#2a9d5c' }}>{busy === 'dl:' + dc.id ? '…' : '⬇ ଡାଉନଲୋଡ୍'}</button>
            )}
          </div>
          {!blocked && <span className="text-[10px] text-slate-500">ଆଜି ଆଉ {toOdia(rem)}/{toOdia(lim)} ଡାଉନଲୋଡ୍ ବାକି</span>}
          {lockedToday && !lockedTotal && <span className="text-[10px] text-rose-600 text-right max-w-[230px] leading-snug">ଆଜିର ସୀମା ସମାପ୍ତ — ଆସନ୍ତାକାଲି ୧୨:୦୦ AM ପରେ ପୁଣି ଡାଉନଲୋଡ୍ କରିପାରିବେ । ଅନଲାଇନ୍ ଦେଖିବା ଚାଲୁ ରହିବ ।</span>}
          {lockedTotal && <span className="text-[10px] text-rose-600 text-right max-w-[230px] leading-snug">ସର୍ବମୋଟ ଡାଉନଲୋଡ୍ ସୀମା ସମାପ୍ତ — WhatsApp କରନ୍ତୁ: +91 80934 14633</span>}
        </div>
      )
    }
    if (dc.status === 'verification_pending') return (
      <button onClick={() => setShowVerify(true)} className="text-[11px] font-bold rounded-full px-3 py-1.5" style={{ background: '#fef3c7', color: '#b45309' }}>🪪 ଯାଞ୍ଚ ଅପେକ୍ଷାରେ</button>
    )
    if (dc.status === 'not_released') return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-[11px] font-bold rounded-full px-3 py-1.5" style={{ background: '#eef2ff', color: '#4338ca' }}>🔒 ଉପଲବ୍ଧ ହେବ: {fmtDate(dc.release_at)}</span>
        {fmtCountdown(dc.release_at) && <span className="text-[10px] font-bold text-indigo-600">⏳ {fmtCountdown(dc.release_at)}</span>}
      </div>
    )
    if (dc.status === 'file_missing') return (
      <span className="text-[11px] text-slate-400">ଫାଇଲ୍ ପ୍ରସ୍ତୁତ ହେଉଛି</span>
    )
    return <span className="text-[11px] text-slate-400">—</span>
  }

  return wrap(
    <div className="space-y-5">
      {/* 📢 Promotion slot (My Library) — admin-controlled, dismissible */}
      <PromoAd placement="library" />
      {/* Progress stepper — real teacher status */}
      {(() => {
        const stepVerify = teacher.required === false || ['approved', 'verified'].includes(teacher.profile?.status)
        const stepBuy = (data.packs || []).length > 0
        const stepOath = !!data.terms_accepted
        const steps = [
          { t: 'ଲଗଇନ୍', done: true },
          { t: 'ଯାଞ୍ଚ', done: stepVerify, cta: !stepVerify && teacher.profile?.status !== 'pending' ? { label: 'ଯାଞ୍ଚ ଫର୍ମ ପୂରଣ କରନ୍ତୁ', on: () => setShowVerify(true) } : null },
          { t: 'କିଣନ୍ତୁ', done: stepBuy, cta: !stepBuy ? { label: 'ପ୍ୟାକ୍ କିଣନ୍ତୁ', on: () => { window.location.href = '/assessment' } } : null },
          { t: 'ଶପଥ', done: stepOath },
          { t: 'ଡାଉନଲୋଡ୍', done: !!data.has_downloaded },
        ]
        const cur = steps.findIndex(s => !s.done)
        const nextCta = cur >= 0 ? steps[cur].cta : null
        return (
          <div className="rounded-2xl border bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-black text-indigo-900">ଆପଣଙ୍କ ଅଗ୍ରଗତି</p>
              <a href="/assessment/how-to-download" className="text-[11px] font-bold text-indigo-600 underline">କିପରି ଡାଉନଲୋଡ୍ କରିବେ?</a>
            </div>
            <div className="flex items-center">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${s.done ? 'bg-emerald-500 text-white' : i === cur ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' : 'bg-slate-200 text-slate-500'}`}>{s.done ? '✓' : (i + 1)}</div>
                    <span className="text-[9px] mt-0.5 text-center leading-tight max-w-[52px]">{s.t}</span>
                  </div>
                  {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-0.5 ${steps[i + 1].done || s.done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                </div>
              ))}
            </div>
            {nextCta && <button onClick={nextCta.on} className="mt-2.5 w-full text-[12px] font-bold text-white rounded-full py-2" style={{ background: '#4338ca' }}>{nextCta.label} →</button>}
          </div>
        )
      })()}

      {/* Newly-released notice */}
      {(() => {
        const newly = (data.documents || []).filter(dc => dc.released && dc.release_at && Date.now() - new Date(dc.release_at).getTime() >= 0 && Date.now() - new Date(dc.release_at).getTime() < 24 * 3600000)
        if (newly.length === 0) return null
        return (
          <div className="rounded-xl border p-3 flex items-start gap-2" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
            <span className="text-xl">🎉</span>
            <div className="text-[12px] text-emerald-800">
              {newly.slice(0, 3).map((dc, i) => <div key={i} className="font-bold">ଆପଣଙ୍କ “{dc.title_or}” ଏବେ ଉପଲବ୍ଧ</div>)}
              {newly.length > 3 && <div className="text-[11px]">+ ଆଉ {toOdia(newly.length - 3)}ଟି ଉପଲବ୍ଧ</div>}
            </div>
          </div>
        )
      })()}

      {/* Teacher verification banner */}
      {teacher.required !== false && teacher.profile?.status !== 'approved' && teacher.profile?.status !== 'verified' && teacherPending && (
        <div className="rounded-xl border p-3 flex items-center gap-3" style={{ background: '#fff7ed', borderColor: '#fed7aa' }}>
          <span className="text-2xl">🪪</span>
          <div className="flex-1 text-[13px]">
            <div className="font-bold text-amber-800">{teacher.profile?.status === 'pending' ? 'ଯାଞ୍ଚ ଅପେକ୍ଷାରେ ଅଛି' : teacher.profile?.status === 'rejected' ? 'ଯାଞ୍ଚ ପ୍ରତ୍ୟାଖ୍ୟାନ ହୋଇଛି' : 'FA/SA/Answer Key ପାଇଁ ଶିକ୍ଷକ ଯାଞ୍ଚ ଆବଶ୍ୟକ'}</div>
            <div className="text-amber-700 text-[12px]">{teacher.profile?.status === 'pending' ? 'ଆଡମିନ୍ ଅନୁମୋଦନ ପରେ ଏହି ଡକ୍ୟୁମେଣ୍ଟ ଖୋଲିବ।' : 'ନାମ, ବିଦ୍ୟାଳୟ ଓ ଜିଲ୍ଲା ଦେଇ ଥରେ ଯାଞ୍ଚ କରନ୍ତୁ।'}</div>
          </div>
          {teacher.profile?.status !== 'pending' && <button onClick={() => setShowVerify(true)} className="text-[12px] font-bold text-white rounded-full px-3 py-1.5" style={{ background: '#e8452c' }}>ଯାଞ୍ଚ କରନ୍ତୁ</button>}
        </div>
      )}

      {(data.packs || []).length === 0 ? (
        <div className="text-center py-10 space-y-3">
          <div className="text-4xl">🛒</div>
          <div className="font-bold text-slate-700">ଆପଣ ଏପର୍ଯ୍ୟନ୍ତ କିଛି କିଣିନାହାନ୍ତି</div>
          <a href="/assessment" className="inline-block px-5 py-2.5 rounded-xl font-black text-white" style={{ background: '#2a9d5c' }}>ଭଣ୍ଡାର ଦେଖନ୍ତୁ</a>
        </div>
      ) : (
        <>
          <div className="text-sm text-slate-500">{(data.packs || []).length} ପ୍ୟାକ୍ · {docs.length} ଡକ୍ୟୁମେଣ୍ଟ</div>

          {/* Per-class / per-pack ZIP downloads (bundles → one ZIP per class, never one giant ZIP) */}
          {(() => {
            const targets = data.zip_targets || []
            if (targets.length === 0) return null
            const isBundle = (data.packs || []).some(p => ['bundle', 'school'].includes(p.pack_type))
            return (
              <div className="bg-white border rounded-2xl p-3">
                <div className="font-black text-[13px] text-indigo-900 mb-2">📦 {isBundle ? 'ପ୍ରତି ଶ୍ରେଣୀ ZIP ଡାଉନଲୋଡ୍' : 'ସମ୍ପୂର୍ଣ୍ଣ ପ୍ୟାକ୍ ZIP'}</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {targets.map(t => {
                    const st = pk[t.pack_code]
                    const busy = st && ['preparing', 'building', 'downloading'].includes(st.status)
                    const zblocked = t.zip_remaining <= 0
                    return (
                      <div key={t.pack_code} className="border rounded-xl p-2.5 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[12.5px] leading-tight line-clamp-1">{t.class || t.pack_name}</div>
                          <div className="text-[10px] text-slate-400">{toOdia(t.doc_count)} ଡକ୍ୟୁମେଣ୍ଟ</div>
                          {st?.status === 'building' && <div className="text-[11px] text-indigo-600">ପ୍ରସ୍ତୁତ ହେଉଛି… {st.done}/{st.total || '…'}</div>}
                          {st?.status === 'preparing' && <div className="text-[11px] text-indigo-600">ଆରମ୍ଭ ହେଉଛି…</div>}
                          {st?.status === 'downloading' && <div className="text-[11px] text-indigo-600">ଡାଉନଲୋଡ୍ ହେଉଛି…</div>}
                          {st?.status === 'done' && <div className="text-[11px] text-emerald-600">✓ ହୋଇଗଲା{st.skipped ? ` · ${st.skipped} ବାଦ୍` : ''}</div>}
                          {st?.status === 'error' && <div className="text-[11px] text-rose-600">{st.error}</div>}
                          {zblocked
                            ? <div className="text-[10px] text-rose-600 leading-snug">ଆଜିର ପ୍ୟାକ୍ ସୀମା ସମାପ୍ତ — ଆସନ୍ତାକାଲି ୧୨:୦୦ AM ପରେ</div>
                            : <div className="text-[10px] text-slate-500">ଆଜି ଆଉ {toOdia(t.zip_remaining)}/{toOdia(packZipLimit)} ZIP ବାକି</div>}
                        </div>
                        <button disabled={busy || zblocked} onClick={() => downloadPack(t.pack_code)} className="text-[12px] font-bold text-white rounded-full px-3 py-1.5 disabled:opacity-60 whitespace-nowrap" style={{ background: '#241a5e' }}>
                          {busy ? '…' : zblocked ? '⛔' : '⬇ ZIP'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Documents grouped by Class → Subject (collapsible) */}
          <div className="bg-white border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 font-black text-white" style={{ background: '#241a5e' }}>ଆପଣଙ୍କ ଡକ୍ୟୁମେଣ୍ଟ</div>
            {docs.length === 0 ? (
              <div className="p-4 text-[13px] text-slate-400">ଏହି ପ୍ୟାକ୍‌ରେ ଡକ୍ୟୁମେଣ୍ଟ ଶୀଘ୍ର ଯୋଡ଼ାଯିବ।</div>
            ) : (() => {
              const byClass = {}
              for (const dc of docs) { const k = dc.class || '—'; (byClass[k] = byClass[k] || []).push(dc) }
              const classKeys = Object.keys(byClass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
              return (
                <div className="divide-y">
                  {classKeys.map(ck => {
                    const clsDocs = byClass[ck]
                    const open = openCls[ck] ?? (classKeys.length === 1)
                    const bySub = {}
                    for (const dc of clsDocs) { const s = dc.subject || '—'; (bySub[s] = bySub[s] || []).push(dc) }
                    return (
                      <div key={ck}>
                        <button onClick={() => setOpenCls(s => ({ ...s, [ck]: !(s[ck] ?? (classKeys.length === 1)) }))} className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-50/60 hover:bg-indigo-50">
                          <span className="font-black text-[13px] text-indigo-900">{ck} <span className="text-[11px] font-bold text-slate-500">· {toOdia(clsDocs.length)} ଡକ୍ୟୁମେଣ୍ଟ</span></span>
                          <span className="text-indigo-500">{open ? '▲' : '▼'}</span>
                        </button>
                        {open && Object.keys(bySub).sort().map(sub => (
                          <div key={sub}>
                            <div className="px-4 py-1.5 text-[11px] font-bold text-slate-500 bg-slate-50">{sub}</div>
                            <div className="divide-y">
                              {bySub[sub].map(dc => (
                                <div key={dc.id} className="flex items-center gap-3 p-3">
                                  {dc.thumb_url ? <img src={dc.thumb_url} alt="" className="w-10 h-12 object-cover rounded border" loading="lazy" /> : <span className="text-xl">📄</span>}
                                  <div className="flex-1 min-w-0"><div className="font-bold text-[13.5px] leading-tight line-clamp-1">{dc.title_or}</div><div className="text-[11px] text-slate-400">{dc.doc_type} · {dc.pages}p</div></div>
                                  <DocButtons dc={dc} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
          {history.length > 0 && (
            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 font-black text-white flex items-center justify-between" style={{ background: '#1fa2d9' }}>
                <span>🕘 ଡାଉନଲୋଡ୍ ଇତିହାସ</span>
                <span className="text-[11px] font-bold opacity-90">{history.length}</span>
              </div>
              <div className="px-4 pt-2 pb-1 text-[11px] text-slate-500">ପ୍ରତ୍ୟେକ ଡାଉନଲୋଡ୍‌ର ଏକ ନିଆରା <b>Copy ID</b> ଥାଏ — ସମସ୍ୟା ହେଲେ ଏହା WhatsApp‌ରେ ଜଣାନ୍ତୁ।</div>
              <div className="divide-y max-h-[320px] overflow-y-auto">
                {history.map((h, i) => (
                  <div key={h.copy_id + i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-lg">{h.via === 'pack_zip' ? '📦' : '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[13px] leading-tight line-clamp-1">{h.document_title || h.pack_code || 'Document'}</div>
                      <div className="text-[11px] text-slate-400">{fmtDate(h.at)} · {h.via === 'pack_zip' ? 'ପ୍ୟାକ୍ ZIP' : 'ଏକକ PDF'}</div>
                    </div>
                    <code className="text-[11px] font-mono font-bold px-2 py-1 rounded" style={{ background: '#eef2ff', color: '#4338ca' }}>{h.copy_id}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-[11px] text-slate-400 pt-2 border-t flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>ଅର୍ଡର: {(data.orders || []).map(o => `${o.pack_code} (${o.payment_provider}${o.amount_inr ? ' · ' + inr(o.amount_inr) : ''})`).join(', ')}</span>
            <a href="/assessment/contact" className="underline text-slate-500">ସାହାଯ୍ୟ / ଯୋଗାଯୋଗ</a>
          </div>
        </>
      )}
    </div>
  )
}

function TermsModal({ onClose, onAccept }) {
  const [t, setT] = useState({ text: '', version: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { api('/assess/terms').then(setT).catch(() => {}) }, [])
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} style={{ fontFamily: "'Noto Sans Oriya', system-ui, sans-serif" }}>
        <div className="p-4 text-white rounded-t-2xl flex justify-between items-center" style={{ background: 'linear-gradient(135deg,#241a5e,#1fa2d9)' }}>
          <div className="font-black">📜 ବ୍ୟବହାର ସର୍ତ୍ତ</div><button onClick={onClose} className="text-white/80 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[13px] text-slate-600 leading-relaxed max-h-[45vh] overflow-y-auto">{t.text}</p>
          <button disabled={busy} onClick={async () => { setBusy(true); await onAccept() }} className="w-full py-2.5 rounded-lg font-black text-white" style={{ background: '#2a9d5c' }}>{busy ? '…' : 'ମୁଁ ସହମତ — ଡାଉନଲୋଡ୍ କରନ୍ତୁ'}</button>
        </div>
      </div>
    </div>
  )
}

const ODISHA_DISTRICTS = ['Angul','Balangir','Balasore','Bargarh','Bhadrak','Boudh','Cuttack','Deogarh','Dhenkanal','Gajapati','Ganjam','Jagatsinghpur','Jajpur','Jharsuguda','Kalahandi','Kandhamal','Kendrapara','Keonjhar','Khordha','Koraput','Malkangiri','Mayurbhanj','Nabarangpur','Nayagarh','Nuapada','Puri','Rayagada','Sambalpur','Subarnapur','Sundargarh']
const NAME_RE = /^[A-Za-z .]+$/
const SCHOOL_RE = /^[A-Za-z0-9 .,()\-]+$/

function VerifyModal({ profile, onClose, onDone }) {
  const [f, setF] = useState({
    name_en: profile?.name_en || '', school_en: profile?.school_en || '',
    district: profile?.district || '', block: profile?.block || '',
    cluster: profile?.cluster || '', udise: profile?.udise || '',
    employee_id: profile?.employee_id || '', mobile: profile?.mobile || profile?.user_mobile || '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [touched, setTouched] = useState({})
  const [codeInfo, setCodeInfo] = useState(null)
  const errorFor = (key) => {
    const v = (f[key] || '').trim()
    switch (key) {
      case 'name_en':   return !v ? 'Please enter your full name in English letters' : (!NAME_RE.test(v) ? 'Please type in English letters' : '')
      case 'school_en': return !v ? 'Please enter your school name in English letters' : (!SCHOOL_RE.test(v) ? 'Please type in English letters' : '')
      case 'district':  return !v ? 'Please select your district' : ''
      case 'block':     return !v ? 'Please enter your block' : ''
      case 'udise':     return !/^\d{11}$/.test(v) ? 'UDISE code must be exactly 11 digits' : ''
      case 'mobile':    return !/^[6-9]\d{9}$/.test(v) ? 'Enter a valid 10-digit mobile number' : ''
      default:          return ''
    }
  }
  const REQ = ['name_en', 'school_en', 'district', 'block', 'udise', 'mobile']
  const isValid = REQ.every(k => !errorFor(k))
  const markAll = () => setTouched({ name_en: 1, school_en: 1, district: 1, block: 1, udise: 1, mobile: 1 })
  const payload = () => ({
    name_en: f.name_en.trim(), school_en: f.school_en.trim(), district: f.district,
    block: f.block.trim(), cluster: f.cluster.trim(), udise: f.udise.trim(),
    employee_id: f.employee_id.trim(), mobile: f.mobile.trim(),
  })
  const submit = async () => {
    if (!isValid) { markAll(); setErr('Please fill Name, School, District, Block, UDISE and Mobile first'); return }
    setBusy(true); setErr('')
    try { const r = await api('/assess/teacher/apply', { method: 'POST', body: payload() }); onDone(r.profile) }
    catch (e) { setErr(e.message || 'Failed') } finally { setBusy(false) }
  }
  const whatsappVerify = async () => {
    if (!isValid) { markAll(); setErr('Please fill Name, School, District, Block, UDISE and Mobile first'); return }
    setBusy(true); setErr('')
    try {
      await api('/assess/teacher/apply', { method: 'POST', body: payload() })
      const r = await api('/assess/teacher/verify-code', { method: 'POST', body: {} })
      if (r.already) { setErr('You are already verified'); return }
      setCodeInfo(r)
      if (r.wa_url) window.open(r.wa_url, '_blank')
    } catch (e) { setErr(e.message || 'Failed') } finally { setBusy(false) }
  }
  const setV = (k, v) => setF(s => ({ ...s, [k]: v }))
  const blur = (k) => setTouched(t => ({ ...t, [k]: 1 }))
  const fld = (label, k, ph, opts = {}) => {
    const msg = touched[k] ? errorFor(k) : ''
    return (
      <div>
        <div className="text-[12px] font-bold text-slate-600 mb-0.5">{label}</div>
        <input className={`w-full border rounded-lg px-3 py-2 text-sm ${msg ? 'border-rose-400' : 'border-slate-300'}`}
          value={f[k]} inputMode={opts.digits ? 'numeric' : 'text'} maxLength={opts.max}
          onChange={e => setV(k, opts.digits ? e.target.value.replace(/\D/g, '') : e.target.value)}
          onBlur={() => blur(k)} placeholder={ph} />
        {opts.help && !msg && <div className="text-[10.5px] text-slate-400 mt-0.5">{opts.help}</div>}
        {msg && <div className="text-[11px] text-rose-600 mt-0.5">{msg}</div>}
      </div>
    )
  }
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 text-white rounded-t-2xl flex justify-between items-center sticky top-0" style={{ background: 'linear-gradient(135deg,#241a5e,#1fa2d9)' }}>
          <div className="font-black">🪪 Teacher Verification</div><button onClick={onClose} className="text-white/80 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-2.5">
          {fld('Full Name *', 'name_en', 'e.g. Sukant Kumar Sahoo', { help: 'English letters, spaces and dots only' })}
          {fld('School Name *', 'school_en', 'e.g. Govt UP School, Kaipadar', { help: 'English letters, numbers, spaces, . , - ( ) only' })}
          <div>
            <div className="text-[12px] font-bold text-slate-600 mb-0.5">District *</div>
            <select className={`w-full border rounded-lg px-3 py-2 text-sm bg-white ${touched.district && errorFor('district') ? 'border-rose-400' : 'border-slate-300'}`}
              value={f.district} onChange={e => setV('district', e.target.value)} onBlur={() => blur('district')}>
              <option value="">Select district…</option>
              {ODISHA_DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            {touched.district && errorFor('district') && <div className="text-[11px] text-rose-600 mt-0.5">{errorFor('district')}</div>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {fld('Block *', 'block', 'e.g. Balianta')}
            {fld('Cluster (CRC)', 'cluster', 'e.g. Kaipadar Cluster', { help: 'Optional' })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {fld('UDISE Code *', 'udise', '11-digit UDISE code', { digits: true, max: 11 })}
            {fld('Employee ID / Teacher Code', 'employee_id', 'e.g. EMP12345 or Teacher Code', { help: 'Optional' })}
          </div>
          {fld('Mobile Number (WhatsApp) *', 'mobile', '10-digit mobile number', { digits: true, max: 10, help: 'Needed to match the WhatsApp verification message' })}
          {err && <div className="text-[12px] text-rose-600 font-semibold">{err}</div>}
          {codeInfo && (
            <div className="rounded-lg border p-2.5 text-center" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
              <div className="text-[11px] text-emerald-700">Your verification code (send on WhatsApp):</div>
              <div className="text-2xl font-black tracking-widest text-emerald-800">{codeInfo.code}</div>
              <div className="text-[10px] text-slate-500">If WhatsApp did not open, send this code to +91 80934 14633. Valid for 24 hours.</div>
            </div>
          )}
          <button disabled={busy} onClick={submit} className="w-full py-2.5 rounded-lg font-black text-white" style={{ background: '#2a9d5c' }}>{busy ? '…' : 'Submit'}</button>
          <button disabled={busy} onClick={whatsappVerify} className="w-full py-2.5 rounded-lg font-black text-white" style={{ background: '#25D366' }}>💬 Verify on WhatsApp</button>
          <p className="text-[11px] text-slate-400 text-center">FA/SA question papers and answer keys unlock after admin approval.</p>
        </div>
      </div>
    </div>
  )
}
