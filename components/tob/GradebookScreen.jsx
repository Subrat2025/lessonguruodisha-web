'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { API, getToken } from '@/components/store/api'

const C = { indigo: '#241a5e', saffron: '#f7b32b', coral: '#c93a22', sky: '#1577a8', green: '#1f7a46', ground: '#f5f3fb' }
const fontFamily = "'Baloo Bhaina 2','Noto Sans Oriya',system-ui,sans-serif"
const OD = '୦୧୨୩୪୫୬୭୮୯'
const od = (n) => String(n == null ? '' : n).replace(/[0-9]/g, d => OD[+d])
const authHdr = () => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {} }
const num = (v) => (v === '' || v == null || isNaN(v)) ? 0 : Number(v)
const PART_D = [
  { key: 'self', label: 'ଆତ୍ମ-ସଚେତନତା' },
  { key: 'social', label: 'ସାମାଜିକ ଦକ୍ଷତା ଓ ସହଯୋଗ' },
  { key: 'emotion', label: 'ଭାବନା ନିୟନ୍ତ୍ରଣ' },
  { key: 'curiosity', label: 'କୌତୂହଳ ଓ ସୃଜନଶୀଳତା' },
]
const PD_LEVELS = ['ପ୍ରାରମ୍ଭ', 'ପ୍ରଗତି', 'ନିପୁଣ']

export default function GradebookScreen() {
  const [params, setParams] = useState(null)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [vals, setVals] = useState({})     // sid -> term -> {written,project,diary,fa,sa,level}
  const [saving, setSaving] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    setParams({ class: sp.get('class') || '', subject: (sp.get('subject') || '').toUpperCase(), roster: sp.get('roster') || '' })
  }, [])
  useEffect(() => {
    if (!params?.roster || !params?.subject) return
    fetch(`${API}/tob/gradebook?rosterId=${params.roster}&subject=${params.subject}`, { headers: authHdr() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Error'); return j })
      .then(j => {
        setData(j)
        const v = {}
        for (const s of j.roster.students || []) {
          v[s.id] = {}
          for (const t of [1, 2]) {
            const sv = j.saved[`${s.id}|${t}`] || {}; const sg = j.suggest[s.id]?.[t] || {}
            v[s.id][t] = { written: sv.written ?? sg.written ?? '', project: sv.project ?? sg.project ?? '', diary: sv.diary ?? '', fa: sv.fa ?? '', sa: sv.sa ?? '', level: sv.level || '' }
          }
          const svD = j.saved[`${s.id}|D`]?.partD
          v[s.id].D = PART_D.map(p => { const f = (svD || []).find(x => x.key === p.key); return { key: p.key, label: p.label, level: f?.level || '', remark: f?.remark || '' } })
        }
        setVals(v)
      }).catch(e => setErr(e.message))
  }, [params])

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2000) }
  const fw = data?.fw
  const set = (sid, t, k, val) => setVals(p => ({ ...p, [sid]: { ...p[sid], [t]: { ...p[sid][t], [k]: val } } }))
  const compute = (row) => {
    if (!fw?.marks) return { tobs: null, total: null }
    const written = Math.min(num(row.written), fw.written), project = Math.min(num(row.project), fw.project), diary = Math.min(num(row.diary), fw.diary)
    const tobs = Math.min(written + project + diary, fw.total)
    const total = Math.min(tobs + Math.min(num(row.fa), 25) + Math.min(num(row.sa), 50), 100)
    return { tobs: Math.round(tobs * 10) / 10, total: Math.round(total * 10) / 10 }
  }
  const saveStudent = async (sid) => {
    setSaving(sid)
    try {
      for (const t of [1, 2]) {
        const r = vals[sid][t]
        await fetch(`${API}/tob/gradebook`, { method: 'POST', headers: { ...authHdr(), 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterId: params.roster, subject_id: params.subject, term: t, studentId: sid, class: params.class, ...r }) })
      }
      await fetch(`${API}/tob/gradebook`, { method: 'POST', headers: { ...authHdr(), 'Content-Type': 'application/json' }, body: JSON.stringify({ rosterId: params.roster, subject_id: params.subject, term: 'D', studentId: sid, class: params.class, partD: vals[sid].D || [] }) })
      flash('ସେଭ୍ ହେଲା ✓')
    } catch { flash('ସେଭ୍ ହେଲା ନାହିଁ') } finally { setSaving('') }
  }
  const setPD = (sid, key, field, val) => setVals(p => ({ ...p, [sid]: { ...p[sid], D: (p[sid].D || []).map(x => x.key === key ? { ...x, [field]: val } : x) } }))
  const downloadCard = async (sid) => {
    setBusy('card-' + sid)
    try {
      const res = await fetch(`${API}/tob/gradebook/card?rosterId=${params.roster}&subject=${params.subject}&studentId=${sid}`, { headers: authHdr() })
      if (!res.ok) throw new Error()
      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `HPC-card.pdf`; a.click()
    } catch { flash('କାର୍ଡ ପ୍ରସ୍ତୁତ ହେଲା ନାହିଁ') } finally { setBusy('') }
  }
  const exportFile = async (format) => {
    setBusy(format)
    try {
      const res = await fetch(`${API}/tob/gradebook/export?rosterId=${params.roster}&subject=${params.subject}&format=${format}`, { headers: authHdr() })
      if (!res.ok) throw new Error()
      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `HPC-Class${params.class}-${params.subject}.${format === 'xlsx' ? 'xlsx' : 'pdf'}`; a.click()
    } catch { flash('ଏକ୍ସପୋର୍ଟ ହେଲା ନାହିଁ') } finally { setBusy('') }
  }

  const LEVELS = fw?.levels || ['ପ୍ରାରମ୍ଭ', 'ପ୍ରଗତି', 'ନିପୁଣ']

  return (
    <div className="min-h-screen pb-10" style={{ background: C.ground, fontFamily }}>
      <div className="sticky top-0 z-20 text-white shadow-md" style={{ background: `linear-gradient(135deg,${C.indigo},#3b2a8c)` }}>
        <div className="max-w-3xl mx-auto px-3 py-3 flex items-center gap-2">
          <button onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = '/teacher-observation'))} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center text-lg">←</button>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold truncate">HPC ଶ୍ରେଣୀ ସାରାଂଶ · Gradebook</div>
            {data && <div className="text-[11px] opacity-90 truncate">{data.roster.title} · {fw?.stage}</div>}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 pt-3">
        {err && <div className="text-center text-sm text-rose-500 py-10">{err}</div>}
        {!data && !err && <div className="text-center text-gray-400 py-10">…</div>}
        {data && (
          <>
            <div className="flex gap-2 mb-3">
              <button onClick={() => exportFile('pdf')} disabled={busy === 'pdf'} className="flex-1 rounded-xl py-2.5 text-white font-bold text-[13px] disabled:opacity-50" style={{ background: C.coral }}>{busy === 'pdf' ? '…' : '⬇️ PDF (R1–R7)'}</button>
              <button onClick={() => exportFile('xlsx')} disabled={busy === 'xlsx'} className="flex-1 rounded-xl py-2.5 text-white font-bold text-[13px] disabled:opacity-50" style={{ background: C.green }}>{busy === 'xlsx' ? '…' : '⬇️ Excel'}</button>
            </div>
            {fw?.marks && <div className="text-[11px] text-gray-500 mb-2 px-1">ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ /{od(fw.total)} = ଲିଖିତ /{od(fw.written)} + ପ୍ରକଳ୍ପ /{od(fw.project)}{fw.diary ? ` + ଡାଏରୀ /${od(fw.diary)}` : ''} · ଟର୍ମ ମୋଟ /୧୦୦ = ପର୍ଯ୍ୟବେକ୍ଷଣ /୨୫ + FA /୨୫ + SA /୫୦</div>}

            {(data.roster.students || []).length === 0 && <div className="text-center text-gray-400 py-8 text-sm">ରୋଷ୍ଟରରେ କୌଣସି ଛାତ୍ର ନାହାନ୍ତି।</div>}

            {(data.roster.students || []).map(s => (
              <div key={s.id} className="bg-white border rounded-[18px] p-3 mb-3" style={{ borderColor: '#eee' }}>
                <div className="font-extrabold text-[14px] mb-2" style={{ color: C.indigo }}>{s.roll ? `${s.roll}. ` : ''}{s.name}</div>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2].map(t => {
                    const row = vals[s.id]?.[t] || {}
                    const c = compute(row)
                    return (
                      <div key={t} className="rounded-xl p-2" style={{ background: t === 1 ? '#eef5ff' : '#f0fdf4' }}>
                        <div className="text-[11px] font-bold mb-1" style={{ color: t === 1 ? C.sky : C.green }}>ଟର୍ମ {od(t)}</div>
                        {!fw.marks ? (
                          <select value={row.level || ''} onChange={e => set(s.id, t, 'level', e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-[13px]" style={{ borderColor: '#e5e0f0', fontFamily }}>
                            <option value="">— ସ୍ତର —</option>
                            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        ) : (
                          <div className="space-y-1">
                            <Field label={`ଲିଖିତ /${od(fw.written)}`} v={row.written} on={v => set(s.id, t, 'written', v)} />
                            <Field label={`ପ୍ରକଳ୍ପ /${od(fw.project)}`} v={row.project} on={v => set(s.id, t, 'project', v)} />
                            {fw.diary > 0 && <Field label={`ଡାଏରୀ /${od(fw.diary)}`} v={row.diary} on={v => set(s.id, t, 'diary', v)} />}
                            <Field label="FA /୨୫" v={row.fa} on={v => set(s.id, t, 'fa', v)} />
                            <Field label="SA /୫୦" v={row.sa} on={v => set(s.id, t, 'sa', v)} />
                            <div className="flex justify-between text-[11px] pt-1 border-t mt-1" style={{ borderColor: '#dbeafe' }}>
                              <span className="text-gray-500">ପର୍ଯ୍ୟବେକ୍ଷଣ <b style={{ color: C.indigo }}>{od(c.tobs)}</b>/୨୫</span>
                              <span className="text-gray-500">ମୋଟ <b style={{ color: C.coral }}>{od(c.total)}</b>/୧୦୦</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="mt-2 rounded-xl p-2" style={{ background: '#faf8ff', border: '1px solid #ece7fb' }}>
                  <div className="text-[11px] font-bold mb-1" style={{ color: C.indigo }}>ଭାଗ D · ସାମାଜିକ-ଭାବପ୍ରବଣ (ସ୍ତର)</div>
                  {(vals[s.id]?.D || []).map(pd => (
                    <div key={pd.key} className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] text-gray-600 flex-1 min-w-0 truncate">{pd.label}</span>
                      <select value={pd.level} onChange={e => setPD(s.id, pd.key, 'level', e.target.value)} className="border rounded-lg px-1 py-1 text-[11px]" style={{ borderColor: '#e5e0f0', fontFamily }}>
                        <option value="">—</option>{PD_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <input value={pd.remark} onChange={e => setPD(s.id, pd.key, 'remark', e.target.value)} placeholder="ମନ୍ତବ୍ୟ" className="border rounded-lg px-1.5 py-1 text-[11px] w-24" style={{ borderColor: '#e5e0f0' }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => saveStudent(s.id)} disabled={saving === s.id} className="flex-1 rounded-xl py-1.5 text-white font-bold text-[12px] disabled:opacity-50" style={{ background: C.indigo }}>{saving === s.id ? 'ସେଭ୍…' : 'ସେଭ୍ କରନ୍ତୁ'}</button>
                  <button onClick={() => downloadCard(s.id)} disabled={busy === 'card-' + s.id} className="flex-1 rounded-xl py-1.5 font-bold text-[12px] border disabled:opacity-50" style={{ borderColor: C.coral, color: C.coral }}>{busy === 'card-' + s.id ? '…' : '🧾 HPC କାର୍ଡ'}</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      {toast && <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center"><div className="bg-black/80 text-white text-[12px] rounded-full px-4 py-2">{toast}</div></div>}
    </div>
  )
}

function Field({ label, v, on }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-600 flex-1">{label}</span>
      <input value={v ?? ''} onChange={e => on(e.target.value)} inputMode="decimal" className="w-14 border rounded-lg px-1.5 py-1 text-[12px] text-center" style={{ borderColor: '#e5e0f0' }} placeholder="__" />
    </div>
  )
}
