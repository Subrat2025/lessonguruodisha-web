'use client'
// === TOB === Phase-2 store page /store/teacher-observation.
// Class chips -> subject chips -> gold subject pack -> class pack -> Term switch
// -> one card per Set A-J (+ chapters) -> sample -> trust strip -> sticky Buy bar.
// Paywall default OFF (everything free/open); when ON, shows prices + Razorpay.
import { useState, useEffect, useCallback } from 'react'

const OR = { fontFamily: '"Noto Sans Oriya",system-ui,sans-serif' }
const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('em_token') : '')
const api = async (p, opts = {}) => {
  const r = await fetch('/api' + p, { cache: 'no-store', ...opts, headers: { 'Content-Type': 'application/json', ...(tok() ? { Authorization: 'Bearer ' + tok() } : {}), ...(opts.headers || {}) } })
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j
}
const od = (n) => String(n ?? '').replace(/\d/g, d => '୦୧୨୩୪୫୬୭୮୯'[d])
const TERMS = [['1', 'ଟର୍ମ ୧'], ['2', 'ଟର୍ମ ୨'], ['full', 'ପୂରା ବର୍ଷ']]
// Marks breakdown line — subject-aware (AE/PE show component split; others written+project).
const marksText = (m) => {
  if (!m || m.none) return ''
  if (m.components) return `${od(m.total ?? 25)} ମାର୍କ (${(m.parts || []).map(p => `${p.label} ${od(p.marks)}`).join(' + ')})${m.performance ? ` · ପ୍ରଦର୍ଶନ ${od(m.performance)}` : ''}`
  if (m.frameworkUnset) return `${od(m.total ?? 25)} ମାର୍କ`
  if (m.total != null) return `${od(m.total)} ମାର୍କ (ଲିଖିତ ${od(m.written)} + ପ୍ରକଳ୍ପ ${od(m.project)}${m.diary ? ` + ଡାଏରୀ ${od(m.diary)}` : ''})`
  return ''
}

function Tick() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> }
function loadRzp() { return new Promise(res => { if (window.Razorpay) return res(true); const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = () => res(true); s.onerror = () => res(false); document.body.appendChild(s) }) }

export default function TobStore() {
  const [cat, setCat] = useState(null)
  const [cls, setCls] = useState('')
  const [subject, setSubject] = useState('')
  const [term, setTerm] = useState('full')
  const [sample, setSample] = useState(null)
  const [sampleErr, setSampleErr] = useState(false)
  const [cart, setCart] = useState([]) // [{sku,label,price}]
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback((c, s) => {
    const qs = []; if (c) qs.push('class=' + c); if (s) qs.push('subject=' + s)
    api('/tob/store/catalog' + (qs.length ? '?' + qs.join('&') : '')).then(j => {
      setCat(j)
      if (!c && j.classes?.length) { setCls(j.classes[0]); load(j.classes[0], '') ; return }
      if (c && !s && j.subjects?.length) { setSubject(j.subjects[0].id); load(c, j.subjects[0].id); return }
    }).catch(e => setMsg(e.message))
  }, [])
  useEffect(() => { load('', '') }, [load])

  const paid = !!cat?.paywallOn
  const inCart = (sku) => cart.some(x => x.sku === sku)
  const toggleCart = (sku, label, price) => setCart(c => c.some(x => x.sku === sku) ? c.filter(x => x.sku !== sku) : [...c, { sku, label, price }])
  const cartTotal = cart.reduce((s, x) => s + (x.price || 0), 0)
  const openRzp = async (r, onDone) => {
    const ok = await loadRzp(); if (!ok) { setMsg('Payment unavailable'); return }
    const rzp = new window.Razorpay({
      key: r.keyId, amount: r.amount, currency: r.currency, order_id: r.razorpayOrderId,
      name: 'ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ', description: r.title || '',
      handler: async (resp) => { try { await api('/tob/store/verify', { method: 'POST', body: JSON.stringify(resp) }); setMsg('କିଣାଗଲା — ଧନ୍ୟବାଦ!'); onDone && onDone(); load(cls, subject) } catch (e) { setMsg('Verify failed: ' + e.message) } },
      theme: { color: '#c93a22' },
    })
    rzp.open()
  }
  // Single-item buy (used by pack cards)
  const buy = async (sku, label, price) => {
    setBusy(true); setMsg('')
    try {
      const r = await api('/tob/store/checkout', { method: 'POST', body: JSON.stringify({ sku }) })
      if (r.error) { setMsg(r.code === 'LOGIN_REQUIRED' ? 'ଦୟାକରି ଲଗ୍‌ଇନ୍ କରନ୍ତୁ' : r.error); setBusy(false); return }
      if (r.owned) { setMsg('ଆପଣ ଏହା ପୂର୍ବରୁ କିଣିଛନ୍ତି'); setBusy(false); load(cls, subject); return }
      if (r.free) { setMsg('ଖୋଲିଗଲା — ' + (label || '')); setBusy(false); load(cls, subject); return }
      await openRzp(r); setBusy(false)
    } catch (e) { setMsg(e.message); setBusy(false) }
  }
  // Multi-item cart checkout
  const buyCart = async () => {
    if (!cart.length) return
    setBusy(true); setMsg('')
    try {
      const r = await api('/tob/store/checkout-cart', { method: 'POST', body: JSON.stringify({ skus: cart.map(x => x.sku) }) })
      if (r.error) { setMsg(r.code === 'LOGIN_REQUIRED' ? 'ଦୟାକରି ଲଗ୍‌ଇନ୍ କରନ୍ତୁ' : r.error); setBusy(false); return }
      if (r.owned) { setMsg('ସବୁ ଆଇଟମ୍ ପୂର୍ବରୁ କିଣାଯାଇଛି'); setCart([]); setBusy(false); load(cls, subject); return }
      if (r.free) { setMsg('ଖୋଲିଗଲା — ' + cart.length + 'ଟି'); setCart([]); setBusy(false); load(cls, subject); return }
      await openRzp(r, () => setCart([])); setBusy(false)
    } catch (e) { setMsg(e.message); setBusy(false) }
  }
  // Upsell: swap the whole cart for the subject pack
  const swapToPack = () => { const p = cat?.packs?.subjectPack; if (p) setCart([{ sku: p.sku, label: 'Subject pack', price: p.price }]) }

  const setsForTerm = (cat?.sets || []).map(s => ({ setCode: s.setCode, ...(s.terms?.[term] || {}) }))

  return (
    <div style={{ ...OR, minHeight: '100vh', background: '#faf7f2', paddingBottom: 88 }}>
      {/* header */}
      <div style={{ background: 'linear-gradient(135deg,#c93a22,#241a5e)', color: '#fff', padding: '16px 14px 20px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ୨୫ ମାର୍କ</div>
            <a href="/teacher-observation" style={{ background: '#f7b32b', color: '#241a5e', fontSize: 12, fontWeight: 800, padding: '7px 12px', borderRadius: 10, textDecoration: 'none', whiteSpace: 'nowrap' }}>ମୋ ରେଜିଷ୍ଟର / ମାର୍କ ଦିଅନ୍ତୁ</a>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: '12px 0 8px', lineHeight: 1.35 }}>୨୫ ମାର୍କର ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ — ପ୍ରସ୍ତୁତ, ସିଧା ଛାପନ୍ତୁ</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 12.5 }}>
            {['Task ଓ Project ସହ ସମ୍ପୂର୍ଣ୍ଣ', 'ମାର୍କ ବିଭାଜନ ସହ', '୧୦ଟି ଅଲଗା ସେଟ୍ (A–J)', 'A4 PDF · ତୁରନ୍ତ Download'].map((t, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Tick />{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '14px 12px' }}>
        {msg && <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 10, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>{msg}</div>}
        {cat?.isAdmin && paid && <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', color: '#3730a3', borderRadius: 10, padding: '8px 12px', fontSize: 12.5, marginBottom: 10, fontWeight: 700 }}>Admin: ସବୁ ଖୋଲା — ଆପଣ ଦାମ୍ ଓ ବଟନ୍ ଦେଖୁଛନ୍ତି ଠିକ୍ ଶିକ୍ଷକଙ୍କ ପରି; କିଣିବା ଦରକାର ନାହିଁ.</div>}

        {/* class chips */}
        <Row label="ଶ୍ରେଣୀ">
          {(cat?.classes || []).map(c => <Chip key={c} on={c === cls} onClick={() => { setCls(c); setSubject(''); load(c, '') }}>ଶ୍ରେଣୀ {od(c)}</Chip>)}
        </Row>
        {/* subject chips */}
        {cat?.subjects?.length ? (
          <Row label="ବିଷୟ">
            {cat.subjects.map(s => <Chip key={s.id} on={s.id === subject} onClick={() => { setSubject(s.id); load(cls, s.id) }}>{s.name}</Chip>)}
          </Row>
        ) : null}

        {/* packs */}
        {cat?.packs && (
          <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
            {!cat.packs.subjectPack.hidden && <PackCard gold title="ସବୁଠୁ ଲାଭଜନକ · Subject pack" sub={packSub(cat.packs.subjectPack)} paid={paid} price={cat.packs.subjectPack.price} mrp={cat.packs.subjectPack.mrp} pctOff={cat.packs.subjectPack.pctOff} owned={cat.packs.subjectPack.owned} per={(() => { const c = cat.packs.subjectPack.contents || {}; const n = (c.chapters || 0) + (c.sets || 0); return n ? Math.round(cat.packs.subjectPack.price / n) : null })()} onBuy={() => buy(cat.packs.subjectPack.sku, 'Subject pack', cat.packs.subjectPack.price)} />}
            {cat?.isAdmin && cat.packs.subjectPack.hidden && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>Admin: Subject pack hidden — {cat.packs.subjectPack.warning}</div>}
            {cat.packs.classPack && <PackCard title="Class pack · ଏହି ଶ୍ରେଣୀର ସବୁ ବିଷୟ" sub={`${od(cat.packs.classPack.subjects)} ବିଷୟ`} paid={paid} price={cat.packs.classPack.price} mrp={cat.packs.classPack.mrp} owned={cat.packs.classPack.owned} onBuy={() => buy(cat.packs.classPack.sku, 'Class pack', cat.packs.classPack.price)} />}
          </div>
        )}

        {/* term switch */}
        {cat?.sets?.length ? (
          <>
            <div style={{ fontWeight: 800, fontSize: 15, margin: '16px 0 8px', color: '#241a5e' }}>ଗୋଟିଏ ସେଟ୍ ବାଛନ୍ତୁ</div>
            <div style={{ display: 'flex', gap: 6, background: '#efe7db', padding: 4, borderRadius: 12, marginBottom: 12 }}>
              {TERMS.map(([v, l]) => <button key={v} onClick={() => setTerm(v)} style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer', background: term === v ? '#c93a22' : 'transparent', color: term === v ? '#fff' : '#6b5b47', fontFamily: 'inherit' }}>{l}</button>)}
            </div>
            {/* set cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {setsForTerm.map(s => (
                <div key={s.setCode} style={{ background: '#fff', border: '1px solid #ecdfce', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontWeight: 900, fontSize: 15, color: '#241a5e' }}>ସେଟ୍ {s.setCode}</div>
                  <div style={{ fontSize: 11, color: '#8a7a66' }}>{s.coverage && s.coverage.total > 0 ? `LO ${od(s.coverage.covered)}/${od(s.coverage.total)}` : '25 ମାର୍କ'}</div>
                  {marksText(s.marks) && <div style={{ fontSize: 10.5, color: '#6b5b47', lineHeight: 1.35 }}>{marksText(s.marks)}</div>}
                  {paid ? (
                    s.owned ? <div style={{ fontSize: 12, fontWeight: 800, color: '#166534' }}>ଆପଣ ଆଗରୁ କିଣିଛନ୍ତି</div>
                      : <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ fontWeight: 900, fontSize: 17, color: '#c93a22' }}>₹{s.price}</span><span style={{ fontSize: 12, color: '#b0a08c', textDecoration: 'line-through' }}>₹{s.mrp}</span></div>
                  ) : <div style={{ fontSize: 12, fontWeight: 800, color: '#166534' }}>ମାଗଣା</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                    <button onPointerEnter={() => { if (s.itemId) fetch(`/api/tob/store/sample?itemId=${encodeURIComponent(s.itemId)}${s.v ? `&v=${s.v}` : ''}`).catch(() => {}) }} onClick={() => { setSampleErr(false); setSample({ setCode: s.setCode, title: s.title, itemId: s.itemId, v: s.v }) }} style={{ flex: 1, padding: '7px 0', border: '1px solid #d8c7b0', background: '#fff', borderRadius: 9, fontSize: 11.5, fontWeight: 700, color: '#6b5b47', cursor: 'pointer', fontFamily: 'inherit' }}>ନମୁନା</button>
                    {paid && !s.owned
                      ? (() => { const sku = `set:${cls}:${subject}:${s.setCode}:${term}`; const on = inCart(sku); return <button onClick={() => toggleCart(sku, `ସେଟ୍ ${s.setCode}`, s.price)} style={{ flex: 1, padding: '7px 0', border: 'none', background: on ? '#166534' : '#c93a22', color: '#fff', borderRadius: 9, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{on ? '✓ ଯୋଡ଼ାଗଲା' : '+ ଯୋଡ଼ନ୍ତୁ'}</button> })()
                      : <a href="/teacher-observation" style={{ flex: 1, padding: '7px 0', textAlign: 'center', border: 'none', background: '#241a5e', color: '#fff', borderRadius: 9, fontSize: 11.5, fontWeight: 800, textDecoration: 'none' }}>ଖୋଲନ୍ତୁ</a>}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (cls && subject ? <div style={{ ...cardBox, marginTop: 14 }}>ଏହି ଶ୍ରେଣୀ+ବିଷୟ ପାଇଁ ଏବେ କିଛି ସେଟ୍ ନାହିଁ.</div> : null)}

        {/* chapters */}
        {cat?.chapters?.length ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: '#241a5e' }}>ଅଧ୍ୟାୟ ଅନୁଯାୟୀ</div>
            <div style={cardBox}>
              {cat.chapters.map((c, i) => (
                <div key={c.itemId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: i < cat.chapters.length - 1 ? '1px solid #f0e8dc' : 'none', fontSize: 13 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>ଅଧ୍ୟାୟ {od(c.chapterNo)} · {c.title}<span style={{ fontSize: 11, color: '#8a7a66' }}>  · ଟର୍ମ {c.term === 'full' ? '—' : od(c.term)}</span>{marksText(c.marks) && <span style={{ display: 'block', fontSize: 10.5, color: '#8a7a66' }}>{marksText(c.marks)}</span>}</span>
                  {paid ? (
                    c.owned
                      ? <a href="/teacher-observation" style={{ fontSize: 11.5, fontWeight: 800, color: '#166534', textDecoration: 'none', whiteSpace: 'nowrap' }}>✓ ଖୋଲନ୍ତୁ</a>
                      : <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 900, color: '#c93a22' }}>₹{c.price}</span>
                          <span style={{ fontSize: 11, color: '#b0a08c', textDecoration: 'line-through' }}>₹{c.mrp}</span>
                          <button onClick={() => toggleCart(c.sku, `ଅଧ୍ୟାୟ ${od(c.chapterNo)}`, c.price)} style={{ padding: '5px 12px', border: 'none', background: inCart(c.sku) ? '#166534' : '#c93a22', color: '#fff', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{inCart(c.sku) ? '✓ ଯୋଡ଼ାଗଲା' : '+ ଯୋଡ଼ନ୍ତୁ'}</button>
                        </span>
                  ) : <a href="/teacher-observation" style={{ fontSize: 11.5, fontWeight: 800, color: '#166534', textDecoration: 'none', whiteSpace: 'nowrap' }}>ମାଗଣା · ଖୋଲନ୍ତୁ</a>}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* trust strip */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 20, fontSize: 12, color: '#6b5b47' }}>
          <span>✓ ପ୍ରସ୍ତୁତ A4 PDF</span><span>✓ ତୁରନ୍ତ Download</span><span>✓ ମାର୍କ ବିଭାଜନ ସହ</span><span>✓ ସୁରକ୍ଷିତ Payment</span>
        </div>
      </div>

      {/* sticky buy bar + upsell */}
      {paid && cart.length > 0 && (() => {
        const pack = cat?.packs?.subjectPack
        const packInCart = pack && inCart(pack.sku)
        const showUpsell = pack && !pack.hidden && !pack.owned && !packInCart && cartTotal >= pack.price * 0.45 && cartTotal < pack.price
        const remaining = pack ? Math.max(0, pack.price - cartTotal) : 0
        return (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, boxShadow: '0 -4px 16px rgba(0,0,0,.1)' }}>
            {showUpsell && (
              <div style={{ background: 'linear-gradient(135deg,#fff8e7,#fdeec2)', borderTop: '1px solid #e7c66b', padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#8a5a12' }}>ଆଉ ₹{remaining} ଦେଇ ପୂରା ପ୍ୟାକ୍ ନିଅନ୍ତୁ ({od(pack.contents?.chapters)} ଅଧ୍ୟାୟ + {od(pack.contents?.sets)} ସେଟ୍)</div>
                <button onClick={swapToPack} style={{ padding: '8px 14px', background: '#c93a22', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>ପ୍ୟାକ୍ ନିଅନ୍ତୁ</button>
              </div>
            )}
            <div style={{ background: '#fff', borderTop: '1px solid #ecdfce', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div><div style={{ fontSize: 12, color: '#6b5b47' }}>{od(cart.length)}ଟି · ₹{cartTotal}</div><div style={{ fontWeight: 900, fontSize: 18, color: '#c93a22' }}>₹{cartTotal}</div></div>
              <button onClick={buyCart} disabled={busy} style={{ padding: '12px 28px', background: '#c93a22', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 900, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>କିଣନ୍ତୁ ({od(cart.length)}ଟି)</button>
            </div>
          </div>
        )
      })()}

      {/* sample modal — page-1 PNG (SAMPLE + Lesson Guru Odisha watermark baked in) */}
      {sample && (
        <div onClick={() => setSample(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 360, padding: 16, position: 'relative' }}>
            <div style={{ fontWeight: 900, color: '#241a5e', fontSize: 15, marginBottom: 8 }}>ନମୁନା — ସେଟ୍ {sample.setCode}</div>
            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #ecdfce', background: '#faf7f2', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SamplePane itemId={sample.itemId} v={sample.v} />
            </div>
            <div style={{ fontSize: 11.5, color: '#8a7a66', margin: '8px 0 10px' }}>ପ୍ରଥମ ପୃଷ୍ଠା ନମୁନା · ସମ୍ପୂର୍ଣ୍ଣ PDF କିଣିଲା ପରେ.</div>
            <button onClick={() => setSample(null)} style={{ width: '100%', padding: 10, background: '#241a5e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontFamily: 'inherit' }}>ବନ୍ଦ କରନ୍ତୁ</button>
          </div>
        </div>
      )}
    </div>
  )
}

const cardBox = { background: '#fff', border: '1px solid #ecdfce', borderRadius: 14, padding: '10px 14px', fontSize: 13, color: '#4b3f30' }

// Sample image with a spinner + polling. The API returns 202 while the page-1
// image is still rendering in the background, 200 (image) once ready. Never a
// blank box; shows "ନମୁନା ଶୀଘ୍ର ଆସୁଛି" only if it ultimately fails.
function SamplePane({ itemId, v }) {
  const [state, setState] = useState('loading')
  // Versioned URL: 7-day-immutable cache keyed by item version. A replaced item
  // bumps v, so the browser (and any CDN) fetches the fresh sample at once.
  const srcUrl = itemId ? `/api/tob/store/sample?itemId=${encodeURIComponent(itemId)}${v ? `&v=${v}` : ''}` : ''
  useEffect(() => {
    if (!itemId) { setState('failed'); return }
    let alive = true, tries = 0, timer = null
    setState('loading')
    const poll = async () => {
      tries++
      try {
        // Poll with no-store so we reliably catch the 202→200 transition; the
        // <img> below then loads from the browser's HTTP cache (immutable).
        const r = await fetch(srcUrl, { cache: 'no-store' })
        if (!alive) return
        const ct = r.headers.get('content-type') || ''
        if (r.ok && ct.startsWith('image')) { setState('ready'); return }
        if (r.status === 202) { if (tries >= 16) { setState('failed'); return } timer = setTimeout(poll, 1500); return }
        setState('failed')
      } catch (_) { if (tries >= 16) setState('failed'); else timer = setTimeout(poll, 2000) }
    }
    poll()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [itemId, v, srcUrl])
  if (state === 'ready') return <img src={srcUrl} alt="ନମୁନା" style={{ width: '100%', display: 'block' }} onError={() => setState('failed')} />
  if (state === 'failed') return <div style={{ padding: '56px 20px', textAlign: 'center', color: '#8a7a66', fontSize: 14, fontWeight: 800 }}>ନମୁନା ଶୀଘ୍ର ଆସୁଛି</div>
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: '#8a7a66' }}>
      <div style={{ width: 34, height: 34, border: '3px solid #e7dcc9', borderTopColor: '#c93a22', borderRadius: '50%', margin: '0 auto 12px', animation: 'lgspin 0.8s linear infinite' }} />
      <div style={{ fontSize: 14, fontWeight: 800 }}>ନମୁନା ପ୍ରସ୍ତୁତ ହେଉଛି…</div>
      <style>{`@keyframes lgspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
function Row({ label, children }) { return <div style={{ marginBottom: 10 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#8a7a66', marginBottom: 6 }}>{label}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{children}</div></div> }
function Chip({ on, onClick, children }) { return <button onClick={onClick} style={{ padding: '7px 14px', borderRadius: 999, border: '1px solid ' + (on ? '#c93a22' : '#e0d3bf'), background: on ? '#c93a22' : '#fff', color: on ? '#fff' : '#6b5b47', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button> }
function PackCard({ gold, title, sub, paid, price, mrp, pctOff, owned, per, onBuy }) {
  return (
    <div style={{ borderRadius: 14, padding: 14, border: '1px solid ' + (gold ? '#e7c66b' : '#ecdfce'), background: gold ? 'linear-gradient(135deg,#fff8e7,#fdeec2)' : '#fff', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, color: '#241a5e', fontSize: 14 }}>{title}</div>
          <div style={{ fontSize: 12, color: '#8a7a66' }}>{sub}</div>
          {paid && !owned && per ? <div style={{ fontSize: 12, color: '#166534', fontWeight: 800, marginTop: 2 }}>ପ୍ରତି ଆଇଟମ୍ ମାତ୍ର ₹{per}</div> : null}
        </div>
        {owned ? <span style={{ fontSize: 12, fontWeight: 800, color: '#166534', flexShrink: 0 }}>କିଣିଛନ୍ତି</span>
          : paid ? <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {pctOff > 0 && <div style={{ display: 'inline-block', background: '#c93a22', color: '#fff', fontWeight: 900, fontSize: 10, padding: '2px 8px', borderRadius: 999, marginBottom: 4 }}>{pctOff}% OFF</div>}
              <div style={{ fontWeight: 900, fontSize: 20, color: '#c93a22', lineHeight: 1 }}>₹{price}</div>
              <div style={{ fontSize: 14, color: '#6b5b47', fontWeight: 800, textDecoration: 'line-through' }}>₹{mrp}</div>
            </div>
          : <span style={{ fontSize: 12, fontWeight: 800, color: '#166534', flexShrink: 0 }}>ମାଗଣା</span>}
      </div>
      {paid && !owned && <button onClick={onBuy} style={{ width: '100%', marginTop: 10, padding: 10, background: gold ? '#c93a22' : '#241a5e', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>କିଣନ୍ତୁ</button>}
    </div>
  )
}
// Pack sub-line: "୧୩ ଅଧ୍ୟାୟ + ୧୦ ସେଟ୍ + ରେକର୍ଡ ପୁସ୍ତିକା · ₹116 ସଞ୍ଚୟ"
function packSub(p) {
  const c = p?.contents || {}
  const parts = []
  if (c.chapters) parts.push(`${od(c.chapters)} ଅଧ୍ୟାୟ`)
  if (c.sets) parts.push(`${od(c.sets)} ସେଟ୍`)
  if (c.register) parts.push('ରେକର୍ଡ ପୁସ୍ତିକା')
  const head = parts.join(' + ') || 'ସବୁ ସେଟ୍ · ପୂରା ବର୍ଷ'
  return p?.savings > 0 ? `${head} · ₹${p.savings} ସଞ୍ଚୟ` : head
}
