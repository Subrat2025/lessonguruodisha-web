'use client'
// ============================================================================
//  🛒 Assessment Store (ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର) — public storefront.
//  Prompt 1: catalog/pricing. Prompt 3: full in-app Razorpay checkout
//  (login → coupon → server price → Razorpay UPI-first → verify → unlock),
//  with a WhatsApp fallback link. Additive: reads /api/assess/* only.
// ============================================================================
import React, { useEffect, useState, useCallback } from 'react'

const inr = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN')
const tokenGet = () => (typeof window !== 'undefined' ? (localStorage.getItem('em_token') || localStorage.getItem('token')) : null)
const api = async (p, opts = {}) => {
  const token = tokenGet()
  const r = await fetch(`/api${p}`, {
    method: opts.method || 'GET', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Failed')
  return j
}
const CLASS_COLORS = ['#241a5e', '#e8452c', '#f7b32b', '#2a9d5c', '#1fa2d9', '#d6336c']

const loadRazorpay = () => new Promise((resolve) => {
  if (typeof window === 'undefined') return resolve(false)
  if (window.Razorpay) return resolve(true)
  const s = document.createElement('script')
  s.src = 'https://checkout.razorpay.com/v1/checkout.js'
  s.onload = () => resolve(true); s.onerror = () => resolve(false)
  document.body.appendChild(s)
})

const PriceTag = ({ p }) => (
  <div className="flex items-baseline gap-1.5">
    {p.is_free ? (
      <span className="font-black text-lg" style={{ color: '#2a9d5c' }}>ମାଗଣା</span>
    ) : (
      <>
        {p.mrp_inr > p.effective_price_inr && <span className="text-slate-400 line-through text-sm">{inr(p.mrp_inr)}</span>}
        <span className="font-black text-xl" style={{ color: '#e8452c' }}>{inr(p.effective_price_inr)}</span>
        {p.discount_pct > 0 && <span className="text-[11px] font-bold text-white rounded-full px-1.5 py-0.5" style={{ background: '#2a9d5c' }}>{p.discount_pct}% ଛାଡ଼</span>}
      </>
    )}
  </div>
)

export default function AssessmentStore() {
  const [cfg, setCfg] = useState(null)
  const [classes, setClasses] = useState([])
  const assessRank = (name = '') => {
    const s = String(name).trim()
    if (/shishu|vatika|\bSV\b/i.test(s)) return 0
    if (/toolkit/i.test(s)) return 99
    const rn = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 }
    const m = s.match(/class\s*([IVX]+|\d+)/i)
    if (m) { const t = m[1].toUpperCase(); if (rn[t]) return rn[t]; const n = parseInt(t, 10); if (n >= 1 && n <= 8) return n }
    return 50
  }
  const [bundles, setBundles] = useState([])
  const [samples, setSamples] = useState([])
  const [tab, setTab] = useState('home')
  const [pricing, setPricing] = useState([])
  const [active, setActive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [owned, setOwned] = useState([])
  const [checkout, setCheckout] = useState(null) // pack being purchased

  // Store support/payment WhatsApp number — always read from assess_settings
  // (admin-editable). Fallback is the Mulyayan Bhandar support line.
  const wa = cfg?.settings?.whatsapp_number || '918093414633'
  const waFallback = cfg?.settings?.whatsapp_fallback_enabled !== false

  const refreshMe = useCallback(async () => {
    if (!tokenGet()) { setUser(null); setOwned([]); return }
    try {
      const my = await api('/assess/my')
      setOwned(my.owned_pack_codes || [])
      setUser(u => u || { name: '' })
    } catch (_e) { /* token may be invalid */ }
    try { const me = await api('/auth/me'); setUser(me.user || me) } catch (_e) {}
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const c = await api('/assess/config'); setCfg(c)
        if (!c.enabled) { setLoading(false); return }
        const [cl, bu, dc] = await Promise.all([
          api('/assess/classes'), api('/assess/packs?type=bundle'), api('/assess/documents'),
        ])
        setClasses(cl.classes || []); setBundles(bu.packs || [])
        setSamples((dc.documents || []).filter(x => x.is_free_sample).slice(0, 8))
      } catch (e) { /* silent */ } finally { setLoading(false) }
      refreshMe()
      loadRazorpay()
    })()
  }, [refreshMe])

  const openPack = useCallback(async (code) => {
    try { setActive(await api(`/assess/pack/${encodeURIComponent(code)}`)) } catch (_e) {}
  }, [])
  const loadPricing = useCallback(async () => {
    if (pricing.length) return
    try { setPricing((await api('/assess/pricing')).packs || []) } catch (_e) {}
  }, [pricing.length])

  if (loading) return <div className="min-h-screen grid place-items-center text-slate-500">ଲୋଡ୍ ହେଉଛି…</div>
  if (cfg && !cfg.enabled) return <div className="min-h-screen grid place-items-center text-slate-500">ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର ବର୍ତ୍ତମାନ ଉପଲବ୍ଧ ନାହିଁ।</div>

  return (
    <div className="assess-root min-h-screen bg-slate-50" style={{ fontFamily: "'Noto Sans Oriya', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="text-white" style={{ background: 'linear-gradient(135deg,#241a5e,#1fa2d9)' }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-2xl">📚</span>
          <div className="flex-1">
            <div className="font-black text-lg leading-tight">{cfg?.settings?.store_name || 'ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର'}</div>
            <div className="text-[11px] opacity-80">Lesson Guru Odisha · Assessment Store</div>
          </div>
          <a href="/store" className="text-[12px] rounded-full px-3 py-1.5 font-bold mr-1" style={{ background: '#f7b32b', color: '#241a5e' }}>🏪 LessonGuru ଷ୍ଟୋର →</a>
          <a href="/assessment/my" className="text-[12px] bg-white/20 rounded-full px-3 py-1.5 font-bold mr-1">🎒 ମୋ କିଣା</a>
          <a href="/" className="text-[12px] bg-white/20 rounded-full px-3 py-1.5 font-bold">← ମୁଖ୍ୟ ପୃଷ୍ଠା</a>
        </div>
      </div>

      {/* Launch banner */}
      {cfg?.settings?.launch_banner_active && (
        <div className="text-center text-[13px] font-bold text-white py-2 px-3" style={{ background: '#e8452c' }}>
          {cfg.settings.launch_banner_text}
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 pt-4 flex gap-2">
        {[['home', '🏠 ଭଣ୍ଡାର'], ['pricing', '💰 ମୂଲ୍ୟ ତାଲିକା']].map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); if (k === 'pricing') loadPricing() }}
            className={`text-sm font-bold rounded-full px-4 py-2 ${tab === k ? 'text-white' : 'bg-white text-slate-700 border'}`}
            style={tab === k ? { background: '#241a5e' } : {}}>{l}</button>
        ))}
      </div>

      {tab === 'home' && (
        <div className="max-w-5xl mx-auto px-4 py-4 space-y-6">
          <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg,#241a5e,#d6336c)' }}>
            <h1 className="text-2xl font-black leading-tight">ସାମର୍ଥ୍ୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର ୨୦୨୬–୨୭</h1>
            <p className="text-[13px] opacity-90 mt-1">FA · SA · HPC · Toolkit · Answer Key — SCERT ଓଡ଼ିଶା CCE ଢାଞ୍ଚା ଅନୁଯାୟୀ</p>
            <div className="flex gap-4 mt-3 text-center">
              <div><div className="text-xl font-black">{classes.reduce((s, c) => s + c.docs, 0)}+</div><div className="text-[11px] opacity-80">PDF</div></div>
              <div><div className="text-xl font-black">{classes.length}</div><div className="text-[11px] opacity-80">ଶ୍ରେଣୀ</div></div>
              <div><div className="text-xl font-black">₹29 ରୁ</div><div className="text-[11px] opacity-80">ଆରମ୍ଭ</div></div>
            </div>
          </div>

          <div>
            <h2 className="font-black text-lg mb-2" style={{ color: '#241a5e' }}>ଶ୍ରେଣୀ ଅନୁଯାୟୀ</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...classes].sort((a, b) => assessRank(a.class) - assessRank(b.class)).map((c, i) => (
                <button key={c.class} onClick={() => openClass(c.class, openPack)}
                  className="rounded-2xl p-3 text-left text-white shadow" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }}>
                  <div className="font-black text-[15px] leading-tight">{c.class}</div>
                  <div className="text-[11px] opacity-90 mt-0.5">{c.docs} PDF · {c.subjects} ବିଷୟ</div>
                  <div className="text-[13px] font-bold mt-1.5 bg-white/20 rounded-full inline-block px-2 py-0.5">{c.from_price_inr ? `${inr(c.from_price_inr)} ରୁ ଆରମ୍ଭ` : 'ଉପଲବ୍ଧ'}</div>
                </button>
              ))}
            </div>
          </div>

          {bundles.length > 0 && (
            <div>
              <h2 className="font-black text-lg mb-2" style={{ color: '#241a5e' }}>ଲୋକପ୍ରିୟ ବଣ୍ଡଲ୍</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {bundles.map(p => (
                  <div key={p.pack_code} className="rounded-2xl bg-white border p-3 shadow-sm">
                    <div className="font-black text-[15px]" style={{ color: '#241a5e' }}>{p.pack_name}</div>
                    <div className="text-[12px] text-slate-500 mt-0.5">{p.includes_text}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <PriceTag p={p} />
                      <button onClick={() => openPack(p.pack_code)} className="text-[13px] font-bold text-white rounded-full px-3 py-1.5" style={{ background: '#e8452c' }}>ଦେଖନ୍ତୁ</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {samples.length > 0 && (
            <div>
              <h2 className="font-black text-lg mb-2" style={{ color: '#2a9d5c' }}>ମାଗଣା ନମୁନା</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {samples.map(s => (
                  <div key={s.id} className="rounded-xl bg-white border p-2.5 text-[12px]">
                    {s.thumb_url && <img src={s.thumb_url} alt="" className="w-full h-24 object-cover rounded mb-1.5 border" loading="lazy" />}
                    <div className="font-bold leading-tight line-clamp-2">{s.title_or}</div>
                    <div className="text-slate-400 mt-1">{s.class} · {s.doc_type}</div>
                    <span className="inline-block mt-1 text-[10px] font-bold text-white rounded-full px-2 py-0.5" style={{ background: '#2a9d5c' }}>ମାଗଣା</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t text-center space-y-1">
            <p className="text-[11px] text-slate-400">{cfg?.settings?.footer_note}</p>
            <a href="/assessment/contact" className="inline-block text-[12px] font-bold underline" style={{ color: '#1fa2d9' }}>📞 ଯୋଗାଯୋଗ / ସାହାଯ୍ୟ</a>
            <a href="/assessment/how-to-download" className="inline-block text-[12px] font-bold underline ml-3" style={{ color: '#4338ca' }}>📥 କିପରି ଡାଉନଲୋଡ୍ କରିବେ?</a>
          </div>
        </div>
      )}

      {tab === 'pricing' && (
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="rounded-2xl bg-white border overflow-hidden">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left" style={{ background: '#241a5e', color: '#fff' }}>
                <th className="p-2">ପ୍ୟାକ୍</th><th className="p-2">MRP</th><th className="p-2">ମୂଲ୍ୟ</th><th className="p-2">ଛାଡ଼</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {pricing.map(p => (
                  <tr key={p.pack_code} className="border-t">
                    <td className="p-2 font-bold">{p.pack_name}<div className="text-[10px] text-slate-400 font-normal">{p.pack_code}</div></td>
                    <td className="p-2 text-slate-400 line-through">{inr(p.mrp_inr)}</td>
                    <td className="p-2 font-black" style={{ color: '#e8452c' }}>{p.is_free ? 'ମାଗଣା' : inr(p.effective_price_inr)}</td>
                    <td className="p-2">{p.discount_pct > 0 ? `${p.discount_pct}%` : '—'}</td>
                    <td className="p-2"><button onClick={() => openPack(p.pack_code)} className="text-[12px] font-bold text-white rounded-full px-3 py-1" style={{ background: '#241a5e' }}>ଦେଖନ୍ତୁ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pack detail modal */}
      {active && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-2" onClick={() => setActive(null)}>
          <div className="bg-white w-full sm:max-w-lg rounded-2xl shadow-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 text-white rounded-t-2xl" style={{ background: 'linear-gradient(135deg,#241a5e,#1fa2d9)' }}>
              <div className="flex justify-between items-start">
                <div><div className="font-black text-lg leading-tight">{active.pack.pack_name}</div><div className="text-[11px] opacity-80">{active.pack.pack_code} · {active.pack.pack_type}</div></div>
                <button onClick={() => setActive(null)} className="text-white/80 text-xl">✕</button>
              </div>
              <div className="mt-2 bg-white rounded-xl p-2 inline-block"><PriceTag p={active.pack} /></div>
            </div>
            <div className="p-4 overflow-y-auto">
              {active.pack.includes_text && <p className="text-[13px] text-slate-600 mb-2">{active.pack.includes_text}</p>}
              <div className="text-[11px] font-black uppercase text-slate-400 mb-1">ଅନ୍ତର୍ଭୁକ୍ତ ({active.documents.length})</div>
              <div className="space-y-1.5">
                {active.documents.map(dcm => (
                  <div key={dcm.id} className="flex items-center gap-2 text-[12.5px] border rounded-lg p-2">
                    {dcm.thumb_url ? <img src={dcm.thumb_url} alt="" className="w-9 h-11 object-cover rounded border" loading="lazy" /> : <span>📄</span>}
                    <div className="flex-1 min-w-0"><div className="font-bold leading-tight line-clamp-1">{dcm.title_or}</div><div className="text-slate-400 text-[10.5px]">{dcm.subject} · {dcm.doc_type} · {dcm.pages}p</div></div>
                    {dcm.is_free_sample && <span className="text-[10px] font-bold text-white rounded px-1.5 py-0.5" style={{ background: '#2a9d5c' }}>ମାଗଣା</span>}
                  </div>
                ))}
                {active.documents.length === 0 && <p className="text-[12px] text-slate-400">ଏହି ପ୍ୟାକ୍‌ରେ ଅନ୍ୟ ପ୍ୟାକ୍ ଅନ୍ତର୍ଭୁକ୍ତ ଅଛି।</p>}
              </div>
            </div>
            <div className="p-3 border-t space-y-2">
              {owned.includes(active.pack.pack_code) ? (
                <a href="/assessment/my" className="block text-center w-full py-3 rounded-xl font-black text-white" style={{ background: '#2a9d5c' }}>✅ ଆପଣ କିଣିଛନ୍ତି — ଡାଉନଲୋଡ୍ କରନ୍ତୁ</a>
              ) : (
                <button onClick={() => setCheckout(active.pack)} className="w-full py-3 rounded-xl font-black text-white" style={{ background: '#2a9d5c' }}>
                  🛒 କିଣନ୍ତୁ — {active.pack.is_free ? 'ମାଗଣା' : inr(active.pack.effective_price_inr)}
                </button>
              )}
              {waFallback && !owned.includes(active.pack.pack_code) && (
                <button onClick={() => waLink(wa, active.pack, user)} className="block w-full text-center text-[12px] text-slate-500 underline">
                  ପେମେଣ୍ଟରେ ସମସ୍ୟା? WhatsApp କରନ୍ତୁ
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Checkout flow */}
      {checkout && (
        <CheckoutModal
          pack={checkout} user={user} wa={wa} waFallback={waFallback}
          onClose={() => setCheckout(null)}
          onAuthed={refreshMe}
          onPaid={async () => { await refreshMe(); setCheckout(null); setActive(null) }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Checkout
function CheckoutModal({ pack, user: initialUser, wa, waFallback, onClose, onAuthed, onPaid }) {
  const [user, setUser] = useState(initialUser)
  const [stage, setStage] = useState(tokenGet() ? 'summary' : 'login') // login|summary|processing|success|failed
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // login
  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  // coupon
  const [coupon, setCoupon] = useState('')
  const [couponMsg, setCouponMsg] = useState('')
  const [price, setPrice] = useState({ base: pack.effective_price_inr, discount: 0, final: pack.effective_price_inr, code: null })

  useEffect(() => { if (tokenGet() && !user) api('/auth/me').then(m => setUser(m.user || m)).catch(() => {}) }, [user])

  const doLogin = async () => {
    setBusy(true); setErr('')
    try {
      const r = await api('/auth/login', { method: 'POST', body: { mobile, password } })
      if (r.token) localStorage.setItem('em_token', r.token)
      setUser(r.user); onAuthed && onAuthed(); setStage('summary')
    } catch (e) { setErr(e.message || 'Login failed') } finally { setBusy(false) }
  }

  const applyCoupon = async () => {
    if (!coupon.trim()) return
    setBusy(true); setCouponMsg('')
    try {
      const r = await api('/assess/coupon/validate', { method: 'POST', body: { pack_code: pack.pack_code, coupon_code: coupon } })
      setPrice({ base: r.base_inr, discount: r.discount_inr, final: r.final_inr, code: r.coupon_code })
      setCouponMsg(`✅ ${r.coupon_code}: ₹${r.discount_inr} ଛାଡ଼`)
    } catch (e) { setPrice({ base: pack.effective_price_inr, discount: 0, final: pack.effective_price_inr, code: null }); setCouponMsg('❌ ' + (e.message || 'Invalid coupon')) }
    finally { setBusy(false) }
  }

  const pay = async () => {
    setBusy(true); setErr('')
    try {
      const order = await api('/assess/checkout/create-order', { method: 'POST', body: { pack_code: pack.pack_code, coupon_code: price.code || undefined } })
      if (order.free) { setStage('success'); onPaid && onPaid(); return }
      const ok = await loadRazorpay()
      if (!ok) throw new Error('Payment library failed to load')
      const rzp = new window.Razorpay({
        key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.razorpay_order_id,
        name: 'ମୂଲ୍ୟାୟନ ଭଣ୍ଡାର', description: order.pack_name, prefill: order.prefill,
        theme: { color: '#241a5e' },
        config: { display: { sequence: ['block.upi'], preferences: { show_default_blocks: true } } },
        handler: async (resp) => {
          setStage('processing')
          try {
            await api('/assess/checkout/verify', { method: 'POST', body: { razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature } })
            setStage('success'); onPaid && onPaid()
          } catch (e) { setErr(e.message || 'Verification failed'); setStage('failed') }
        },
        modal: { ondismiss: () => { setBusy(false) } },
      })
      rzp.on('payment.failed', (r) => { setErr(r?.error?.description || 'Payment failed'); setStage('failed') })
      rzp.open()
    } catch (e) { setErr(e.message || 'Could not start payment'); setStage('failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} style={{ fontFamily: "'Noto Sans Oriya', system-ui, sans-serif" }}>
        <div className="p-4 text-white rounded-t-2xl flex justify-between items-center" style={{ background: 'linear-gradient(135deg,#241a5e,#1fa2d9)' }}>
          <div className="font-black">{pack.pack_name}</div>
          <button onClick={onClose} className="text-white/80 text-xl">✕</button>
        </div>
        <div className="p-4">
          {stage === 'login' && (
            <div className="space-y-3">
              <div className="text-sm font-bold text-slate-700">କିଣିବା ପାଇଁ ଲଗଇନ୍ କରନ୍ତୁ</div>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ମୋବାଇଲ୍ ନମ୍ବର" value={mobile} onChange={e => setMobile(e.target.value)} inputMode="numeric" />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ପାସୱାର୍ଡ" type="password" value={password} onChange={e => setPassword(e.target.value)} />
              {err && <div className="text-[12px] text-rose-600">{err}</div>}
              <button disabled={busy} onClick={doLogin} className="w-full py-2.5 rounded-lg font-black text-white" style={{ background: '#241a5e' }}>{busy ? '…' : 'ଲଗଇନ୍'}</button>
              <a href="/" className="block text-center text-[12px] text-slate-500 underline">ଆକାଉଣ୍ଟ ନାହିଁ? ମୁଖ୍ୟ ପୃଷ୍ଠାରେ ପଞ୍ଜୀକରଣ କରନ୍ତୁ</a>
            </div>
          )}
          {stage === 'summary' && (
            <div className="space-y-3">
              {!pack.is_free && (
                <div>
                  <div className="text-[12px] font-bold text-slate-500 mb-1">କୁପନ୍ କୋଡ୍</div>
                  <div className="flex gap-2">
                    <input className="flex-1 border rounded-lg px-3 py-2 text-sm uppercase" placeholder="COUPON" value={coupon} onChange={e => setCoupon(e.target.value.toUpperCase())} />
                    <button disabled={busy} onClick={applyCoupon} className="px-3 rounded-lg font-bold text-white text-sm" style={{ background: '#2a9d5c' }}>ଲଗାନ୍ତୁ</button>
                  </div>
                  {couponMsg && <div className="text-[12px] mt-1">{couponMsg}</div>}
                </div>
              )}
              <div className="border rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>ମୂଲ୍ୟ</span><span>{inr(price.base)}</span></div>
                {price.discount > 0 && <div className="flex justify-between text-emerald-600"><span>ଛାଡ଼</span><span>− {inr(price.discount)}</span></div>}
                <div className="flex justify-between font-black text-base border-t pt-1"><span>ମୋଟ</span><span style={{ color: '#e8452c' }}>{price.final <= 0 ? 'ମାଗଣା' : inr(price.final)}</span></div>
              </div>
              {err && <div className="text-[12px] text-rose-600">{err}</div>}
              <button disabled={busy} onClick={pay} className="w-full py-3 rounded-xl font-black text-white" style={{ background: '#2a9d5c' }}>{busy ? '…' : (price.final <= 0 ? '🎁 ମାଗଣା ପାଆନ୍ତୁ' : `💳 UPI/କାର୍ଡରେ ${inr(price.final)} ଦିଅନ୍ତୁ`)}</button>
              {waFallback && <button onClick={() => waLink(wa, pack, user)} className="block w-full text-center text-[12px] text-slate-500 underline">ପେମେଣ୍ଟରେ ସମସ୍ୟା? WhatsApp କରନ୍ତୁ</button>}
            </div>
          )}
          {stage === 'processing' && <div className="py-8 text-center text-slate-600">ଯାଞ୍ଚ କରାଯାଉଛି… ଦୟାକରି ଅପେକ୍ଷା କରନ୍ତୁ</div>}
          {stage === 'success' && (
            <div className="py-6 text-center space-y-3">
              <div className="text-5xl">🎉</div>
              <div className="font-black text-lg text-emerald-600">କିଣା ସଫଳ!</div>
              <div className="text-sm text-slate-600">ଆପଣଙ୍କ ପ୍ୟାକ୍ ଅନଲକ୍ ହୋଇଛି।</div>
              <a href="/assessment/my" className="inline-block px-5 py-2.5 rounded-xl font-black text-white" style={{ background: '#241a5e' }}>🎒 ମୋ କିଣା ଦେଖନ୍ତୁ</a>
            </div>
          )}
          {stage === 'failed' && (
            <div className="py-6 text-center space-y-3">
              <div className="text-5xl">😕</div>
              <div className="font-black text-lg text-rose-600">ପେମେଣ୍ଟ ସମ୍ପୂର୍ଣ୍ଣ ହୋଇନାହିଁ</div>
              {err && <div className="text-[12px] text-slate-500">{err}</div>}
              <button onClick={() => setStage('summary')} className="px-5 py-2.5 rounded-xl font-bold text-white" style={{ background: '#241a5e' }}>ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ</button>
              {waFallback && <button onClick={() => waLink(wa, pack, user)} className="block w-full text-center text-[13px] font-bold" style={{ color: '#2a9d5c' }}>WhatsApp ଦ୍ୱାରା କିଣନ୍ତୁ</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function waLink(wa, pack, user) {
  const email = user?.email ? ` ମୋ ଇମେଲ: ${user.email}` : ''
  const msg = encodeURIComponent(`Lesson Guru Odisha — ମୁଁ ${pack.pack_name} (${pack.pack_code}) କିଣିବାକୁ ଚାହେଁ ।${email}`)
  window.open(`https://wa.me/91${String(wa).replace(/\D/g, '').slice(-10)}?text=${msg}`, '_blank', 'noopener')
}

async function openClass(cls, openPack) {
  try {
    const r = await fetch(`/api/assess/packs?class=${encodeURIComponent(cls)}`, { cache: 'no-store' })
    const j = await r.json()
    const packs = j.packs || []
    const classPack = packs.find(p => p.pack_type === 'class') || packs[0]
    if (classPack) openPack(classPack.pack_code)
  } catch (_e) {}
}
