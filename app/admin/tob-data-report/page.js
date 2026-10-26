'use client'
// === TOB === Admin-only, READ-ONLY "Teacher Observation data report".
// Lists every TOB/store item by class, subject, set (A–J), term, title
// language (Odia/English), file, price, status and flags duplicates
// (same file vs different file). No edits. No deletes. View only.
import { useEffect, useState, useCallback } from 'react'

const OR = { fontFamily: '"Noto Sans Oriya",system-ui,sans-serif' }
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : '')
const aapi = async (p) => {
  const r = await fetch('/api' + p, { headers: { Authorization: 'Bearer ' + tok() } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status))
  return j
}

const DUP = {
  unique: { label: 'ଏକକ (unique)', bg: '#f1f5f9', fg: '#475569' },
  duplicate_same_file: { label: 'DUPLICATE · ସମାନ ଫାଇଲ', bg: '#fee2e2', fg: '#b91c1c' },
  different_files: { label: 'ଅଲଗା ଫାଇଲ (variant)', bg: '#fef3c7', fg: '#92400e' },
  multiple_no_file: { label: 'ଏକାଧିକ · ଫାଇଲ ନାହିଁ', bg: '#ede9fe', fg: '#6d28d9' },
}
const CONTENT = {
  same_content: { label: 'SAME CONTENT (re-import copy)', bg: '#fee2e2', fg: '#b91c1c' },
  really_different: { label: 'REALLY DIFFERENT content', bg: '#dcfce7', fg: '#166534' },
  single: { label: 'single file', bg: '#f1f5f9', fg: '#64748b' },
  not_hashed: { label: 'not hashed', bg: '#f1f5f9', fg: '#94a3b8' },
}
const LANG = { odia: 'ଓଡ଼ିଆ', english: 'English', mixed: 'ଓଡ଼ିଆ+Eng', unknown: '—' }
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toISOString().slice(0, 10) } catch { return '—' } }

function Icon({ d, stroke = '#475569', size = 16, fill = 'none' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
}

export default function TobDataReport() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cls, setCls] = useState('')
  const [subject, setSubject] = useState('')
  const [onlyDup, setOnlyDup] = useState(false)

  const load = useCallback((withContent = false) => {
    setBusy(true); setErr('')
    const qs = []
    if (cls) qs.push('class=' + encodeURIComponent(cls))
    if (subject) qs.push('subject=' + encodeURIComponent(subject))
    if (withContent) qs.push('content=1')
    aapi('/tob/admin/data-report' + (qs.length ? '?' + qs.join('&') : ''))
      .then(setData).catch(e => setErr(e.message)).finally(() => setBusy(false))
  }, [cls, subject])

  useEffect(() => { load(false) }, []) // eslint-disable-line

  const s = data?.summary
  const groups = (data?.groups || []).filter(g => !onlyDup || g.dupFlag === 'duplicate_same_file' || g.dupFlag === 'different_files')

  return (
    <div style={{ ...OR, minHeight: '100vh', background: '#f8fafc', padding: '14px 12px 60px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Icon size={22} stroke="#4F46E5" d={<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>} />
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1e1b4b', margin: 0 }}>ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ — Data Report</h1>
        </div>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
          Read-only audit · no edits, no deletes. ପ୍ରତ୍ୟେକ item: class · subject · set · term · title language · file · price · duplicate flag.
        </p>

        {/* filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input placeholder="Class (e.g. 4)" value={cls} onChange={e => setCls(e.target.value)} style={inp} />
          <input placeholder="Subject id (e.g. OD / MATH)" value={subject} onChange={e => setSubject(e.target.value)} style={{ ...inp, width: 170 }} />
          <button onClick={() => load(false)} style={btn}>Refresh</button>
          <button onClick={() => load(true)} style={{ ...btn, background: '#07775A' }} title="Download each file, strip ids/whitespace, hash the text">Compare file contents</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155' }}>
            <input type="checkbox" checked={onlyDup} onChange={e => setOnlyDup(e.target.checked)} /> Only duplicates
          </label>
        </div>
        {data?.summary?.content && (
          <div style={{ ...card, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46' }}>
            Content check: hashed {data.summary.content.hashed} file(s), skipped {data.summary.content.skipped}. {data.summary.content.note}
          </div>
        )}

        {busy && <div style={card}>Loading…</div>}
        {err && <div style={{ ...card, background: '#fee2e2', color: '#b91c1c' }}>{err}</div>}

        {/* summary */}
        {s && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8, marginBottom: 14 }}>
            <Stat n={s.totalRows} label="Total items" />
            <Stat n={s.groups} label="Groups" />
            <Stat n={s.duplicateSameFile} label="Dup · same file" danger={s.duplicateSameFile > 0} />
            <Stat n={s.differentFiles} label="Diff files" warn={s.differentFiles > 0} />
            <Stat n={s.bySource?.tob || 0} label="TOB (free)" />
            <Stat n={s.bySource?.store || 0} label="Store (paid)" />
          </div>
        )}

        {s && (s.classes?.length || s.subjects?.length) ? (
          <div style={{ ...card, fontSize: 12, color: '#475569' }}>
            <b>Classes:</b> {s.classes.join(', ') || '—'} · <b>Subjects:</b> {s.subjects.join(', ') || '—'}
          </div>
        ) : null}

        {/* groups */}
        {groups.map(g => {
          const dinfo = DUP[g.dupFlag] || DUP.unique
          return (
            <div key={g.key} style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  Class {g.class || '—'} · {g.subject || '—'} · {g.kind} · Set {g.set || '—'} · Term {g.term || '—'}
                  {g.bothTerms && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e' }}>appears in BOTH terms — check term</span>}
                </div>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {g.contentFlag && CONTENT[g.contentFlag] && (
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: CONTENT[g.contentFlag].bg, color: CONTENT[g.contentFlag].fg, whiteSpace: 'nowrap' }}>{CONTENT[g.contentFlag].label}</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: dinfo.bg, color: dinfo.fg, whiteSpace: 'nowrap' }}>{dinfo.label}</span>
                </span>
              </div>
              <div style={{ padding: '4px 0' }}>
                {g.items.map((it, i) => (
                  <div key={it.itemId + i} style={{ display: 'flex', gap: 8, padding: '7px 12px', borderBottom: i < g.items.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: 12.5 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: it.source === 'store' ? '#dcfce7' : it.source === 'tob' ? '#e0e7ff' : '#fae8ff', color: '#334155', height: 'fit-content', whiteSpace: 'nowrap' }}>{it.source}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#0f172a', wordBreak: 'break-word' }}>
                        {it.title || it.titleEnglish || '(no title)'}
                        {it.rowLabel === 'copy' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: '#fee2e2', color: '#b91c1c' }}>copy of {it.copyOf}</span>}
                        {it.rowLabel === 'original' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, background: '#dbeafe', color: '#1e40af' }}>original</span>}
                        {it.rowLabel === 'unique' && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#dcfce7', color: '#166534' }}>unique</span>}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                        lang: {LANG[it.titleLang] || it.titleLang} · file: {it.fileKey ? <code style={{ fontSize: 10 }}>{String(it.fileKey).split('/').pop()}</code> : <span style={{ color: '#ef4444' }}>none</span>}
                        {it.contentHash ? <> · <code style={{ fontSize: 10, color: '#0f766e' }}>#{it.contentHash}</code></> : (it.contentErr ? <span style={{ color: '#ef4444' }}> · {it.contentErr}</span> : '')}
                        {it.price != null ? ` · ₹${it.price}/${it.mrp}` : ' · free'} · {it.status} · imported {fmtDate(it.importedAt)}
                        {it.termRaw ? ` · termRaw:${it.termRaw}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Cross-language SET comparison (Odia title vs English title) */}
        {data?.crossLang?.length ? (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', background: '#eef2ff', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 800, color: '#3730a3' }}>
              Odia-title set vs English-title set — same PDF or not?
            </div>
            {data.crossLang.map((x, i) => {
              const v = CONTENT[x.verdict] || CONTENT.not_hashed
              return (
                <div key={i} style={{ padding: '8px 12px', borderBottom: i < data.crossLang.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: 12.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <b style={{ color: '#0f172a' }}>Class {x.class} · Set {x.set}</b>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: v.bg, color: v.fg, whiteSpace: 'nowrap' }}>{v.label}</span>
                  </div>
                  <div style={{ color: '#475569', marginTop: 3 }}>ଓଡ଼ିଆ: {x.odiaTitle} <span style={{ color: '#94a3b8' }}>({x.odiaHash ? '#' + x.odiaHash : 'n/a'}, imp {fmtDate(x.odiaImportedAt)})</span></div>
                  <div style={{ color: '#475569' }}>English: {x.engTitle} <span style={{ color: '#94a3b8' }}>({x.engHash ? '#' + x.engHash : 'n/a'}, imp {fmtDate(x.engImportedAt)})</span></div>
                </div>
              )
            })}
          </div>
        ) : null}

        {data && !groups.length && !busy && <div style={card}>କିଛି item ମିଳିଲା ନାହିଁ (no matching items).</div>}
      </div>
    </div>
  )
}

const inp = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, width: 120, background: '#fff' }
const btn = { padding: '8px 16px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 10, fontSize: 13, color: '#334155' }

function Stat({ n, label, danger, warn }) {
  return (
    <div style={{ background: danger ? '#fef2f2' : warn ? '#fffbeb' : '#fff', border: `1px solid ${danger ? '#fecaca' : warn ? '#fde68a' : '#e2e8f0'}`, borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: danger ? '#b91c1c' : warn ? '#92400e' : '#1e1b4b' }}>{n}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>{label}</div>
    </div>
  )
}
