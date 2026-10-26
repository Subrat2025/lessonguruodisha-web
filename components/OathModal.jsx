'use client'
// ============================================================================
//  🔒 Confidentiality Oath modal (ଗୋପନୀୟତା ଶପଥ) — Assessment Store.
//  mode = 'full'  → six rule cards, 3 checkboxes, typed-name, 5s countdown.
//  mode = 'short' → compact reminder, 1 checkbox, 3s countdown.
//  Offline-safe (emoji only). Mobile = bottom sheet; desktop = centred card.
//  Parent supplies onSubmit({ typed_name, checkboxes }) → Promise; it records
//  the acceptance server-side and proceeds; throw with .code='NAME_MISMATCH'
//  to surface the name hint.
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { OATH_DEFAULTS } from '@/lib/assess-oath-defaults'

const ODIA = ['୦', '୧', '୨', '୩', '୪', '୫', '୬', '୭', '୮', '୯']
const odiaNum = (n) => String(n).split('').map(c => ODIA[+c] ?? c).join('')

export default function OathModal({ open, mode = 'full', action = 'download', packName = '', teacherName = '', schoolName = '', whatsapp = '918093414633', texts = {}, onSubmit, onCancel }) {
  const T = useMemo(() => ({ ...OATH_DEFAULTS, ...(texts || {}) }), [texts])
  const isFull = mode === 'full'
  const [cbs, setCbs] = useState(isFull ? [false, false, false] : [false])
  const [name, setName] = useState('')
  const [left, setLeft] = useState(isFull ? 5 : 3)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const cardRef = useRef(null)

  useEffect(() => { if (open) { setCbs(isFull ? [false, false, false] : [false]); setName(''); setLeft(isFull ? 5 : 3); setErr(''); setBusy(false) } }, [open, isFull])
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setLeft(v => (v > 0 ? v - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [open, mode])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onCancel])

  if (!open) return null

  const checkedCount = cbs.filter(Boolean).length
  const nameOK = !isFull || (teacherName.trim() ? name.trim().toLowerCase() === teacherName.trim().toLowerCase() : name.trim().length > 1)
  const allChecked = isFull ? cbs.every(Boolean) : cbs[0]
  const ready = allChecked && nameOK && left === 0 && !busy
  const stripe = ['#e8452c', '#f7b32b', '#2a9d5c', '#1fa2d9', '#d6336c']
  const ribbon = T.ribbon.replace('{teacher_name}', teacherName || 'ଶିକ୍ଷକ')
  const footer = T.footer.replace('{whatsapp}', '+91 ' + String(whatsapp).replace(/\D/g, '').slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2'))
  const primaryLabel = isFull ? (action === 'view' ? T.btn_view : T.btn_download) : (action === 'view' ? T.short_btn_view : T.short_btn)

  const submit = async () => {
    if (!ready) return
    setBusy(true); setErr('')
    try { await onSubmit?.({ typed_name: name.trim(), checkboxes: cbs }) }
    catch (e) { setErr(e?.code === 'NAME_MISMATCH' ? T.name_hint : (e?.message || 'ତ୍ରୁଟି — ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ')); setBusy(false) }
  }

  const Check = ({ i, label }) => (
    <button type="button" onClick={() => setCbs(a => a.map((v, k) => k === i ? !v : v))}
      className="w-full flex items-start gap-3 text-left rounded-xl border-2 p-3 transition-colors"
      style={{ borderColor: cbs[i] ? '#2a9d5c' : '#e2e8f0', background: cbs[i] ? '#f0fdf4' : '#fff' }}>
      <span className="flex-shrink-0 mt-0.5 grid place-items-center rounded-md text-white font-black" style={{ width: 26, height: 26, background: cbs[i] ? '#2a9d5c' : '#cbd5e1' }}>{cbs[i] ? '✓' : ''}</span>
      <span className="text-[14px] leading-relaxed text-slate-700">{label}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,10,40,.6)', backdropFilter: 'blur(4px)' }} onClick={() => onCancel?.()}>
      <style>{`@keyframes lgo-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.12);opacity:.85}}@keyframes lgo-up{from{transform:translateY(40px);opacity:.4}to{transform:translateY(0);opacity:1}}@keyframes lgo-glow{0%,100%{box-shadow:0 0 0 0 rgba(232,69,44,.25)}50%{box-shadow:0 0 0 6px rgba(232,69,44,.10)}}`}</style>
      <div ref={cardRef} onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-[560px] bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '94vh', animation: 'lgo-up .28s ease-out', fontFamily: "'Baloo Bhaina 2','Noto Sans Oriya',system-ui,sans-serif", lineHeight: 1.6 }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 text-white relative" style={{ background: 'linear-gradient(135deg,#241a5e,#b0264f,#e8452c)' }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl" style={{ animation: 'lgo-pulse 1.8s ease-in-out infinite' }}>🛡️</span>
            <div className="flex-1">
              <div className="font-black text-[17px] leading-tight">{isFull ? T.header_title : T.short_title}</div>
              {isFull && <div className="text-[12px] opacity-85">{T.header_subtitle}</div>}
            </div>
          </div>
        </div>
        <div className="flex h-[3px]">{stripe.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}</div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
          {isFull ? (
            <>
              <div className="rounded-xl p-3 text-[13px] text-[#5b4708]" style={{ background: '#fff7e0', border: '1px solid #f7b32b' }}>{ribbon}</div>
              {(T.rules || []).map((r, i) => (
                <div key={i} className="rounded-xl bg-white border p-3 flex gap-3" style={{ borderLeft: `4px solid ${r.color}` }}>
                  <span className="grid place-items-center rounded-full text-white text-[15px] flex-shrink-0" style={{ width: 32, height: 32, background: r.color }}>{r.icon}</span>
                  <div><div className="font-black text-[14px] text-slate-800">{r.title}</div><div className="text-[13px] text-slate-600">{r.body}</div></div>
                </div>
              ))}
              <div className="rounded-xl p-3" style={{ background: '#fff1f0', border: '2px solid #e8452c', animation: 'lgo-glow 2.4s ease-in-out infinite' }}>
                <div className="font-black text-[14px] text-[#c0281c] mb-1">{T.warn_title}</div>
                <ul className="text-[13px] text-[#8a1f16] space-y-0.5 list-disc pl-5">{(T.warn_items || []).map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
              <div className="rounded-xl p-3 text-[13px] text-[#14532d]" style={{ background: '#f0fdf4', border: '1px solid #86efac' }}>{T.appreciation}</div>

              <div className="pt-1 flex items-center justify-between">
                <span className="font-black text-[13px] text-slate-700">✍️ ଶପଥ</span>
                <span className="text-[12px] font-bold" style={{ color: checkedCount === 3 ? '#2a9d5c' : '#f76707' }}>{T.progress_tpl.replace('{n}', odiaNum(checkedCount))}</span>
              </div>
              <div className="space-y-2"><Check i={0} label={T.cb1} /><Check i={1} label={T.cb2} /><Check i={2} label={T.cb3} /></div>

              <div>
                <label className="text-[13px] font-bold text-slate-700">{T.name_label}</label>
                <input value={name} onChange={e => { setName(e.target.value); setErr('') }} placeholder={teacherName || 'Your name in English'}
                  className="mt-1 w-full rounded-xl border-2 px-3 py-2.5 text-[15px] outline-none"
                  style={{ borderColor: name && !nameOK ? '#e8452c' : (nameOK && name ? '#2a9d5c' : '#e2e8f0') }} />
                {name && !nameOK && <div className="text-[12px] text-[#e8452c] mt-1">{T.name_hint}</div>}
              </div>
            </>
          ) : (
            <>
              <div className="text-[14px] text-slate-700">{T.short_text}</div>
              <Check i={0} label={T.short_cb} />
            </>
          )}
          {err && <div className="text-[13px] text-[#e8452c] font-bold text-center">{err}</div>}
        </div>

        {/* Footer / actions */}
        <div className="p-4 border-t space-y-2" style={{ background: '#fafafa' }}>
          {isFull && <div className="text-[11px] text-slate-400 text-center leading-snug">{footer}</div>}
          <div className="text-center"><a href="/assessment/how-to-download" target="_blank" rel="noreferrer" className="text-[11px] font-bold text-indigo-600 underline">କିପରି ଡାଉନଲୋଡ୍ କରିବେ?</a></div>
          <div className="flex gap-2">
            <button onClick={() => onCancel?.()} className="px-4 py-3 rounded-xl font-bold text-slate-600 border" style={{ background: '#fff' }}>{T.btn_cancel}</button>
            <button onClick={submit} disabled={!ready}
              className="flex-1 py-3 rounded-xl font-black text-white transition-all"
              style={{ background: ready ? 'linear-gradient(135deg,#f7b32b,#f76707)' : '#cbd5e1', cursor: ready ? 'pointer' : 'not-allowed' }}>
              {busy ? '…' : (left > 0 ? `${primaryLabel}  (${odiaNum(left)})` : primaryLabel)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
