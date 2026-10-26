'use client'
// ============================================================================
//  components/premium/PremiumPlansPage.jsx
//  UI-ONLY redesign of the Premium Plans page. ALL pricing, plan IDs, offers,
//  durations and payment flows come from props (owned by <PlansView/> in
//  page.js). This file renders presentation only — it never computes a price
//  from a hardcoded constant and never talks to Razorpay/QR directly; it calls
//  the handlers passed in (subscribe / openQr).
// ============================================================================
import { useState } from 'react'
import { getFinalPrice, resolvePlanOffer } from '@/lib/plan-pricing'

const WA_HELP = 'https://wa.me/918093414633'

const fmt = (n) => Number(n || 0).toLocaleString('en-IN')

// ---- tiny inline SVGs (no emoji; renders crisp everywhere) ----
const Ic = {
  back: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>,
  help: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" /></svg>,
  crownW: <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff"><path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5L3 8z" /><rect x="5" y="19" width="14" height="2" rx="1" /></svg>,
  boltW: <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>,
  star: <svg width="13" height="13" viewBox="0 0 24 24" fill="#FFE08A"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7L12 2z" /></svg>,
  qr: (s = '#0F766E') => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4h-1" /></svg>,
  chev: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B8285" strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>,
  wa: <svg width="28" height="28" viewBox="0 0 24 24" fill="#22C55E"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z" /></svg>,
  curCheck: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6EE7B7" strokeWidth="2.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>,
}
const tick = (sz = 15, color = '#0F766E', sw = 3) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"><path d="M5 12l5 5 9-10" /></svg>

// plan icon tile by duration
const planIcon = (p) => {
  const d = p.days || 0
  if (d >= 365 * 99) return { grad: 'linear-gradient(145deg,#FFE08A,#F59E0B)', svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5L3 8z" /></svg> }
  if (d >= 1000) return { grad: 'linear-gradient(145deg,#C4B5FD,#8B5CF6)', svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg> }
  if (d >= 150) return { grad: 'linear-gradient(145deg,#FDE68A,#F59E0B)', svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 3v9h9" /></svg> }
  if (d >= 80) return { grad: 'linear-gradient(145deg,#7DD3FC,#0EA5E9)', svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 21c-4-3-7-6-7-10a7 7 0 0 1 14 0c0 4-3 7-7 10z" /><path d="M12 8v5" /></svg> }
  return { grad: 'linear-gradient(145deg,#86EFAC,#10B981)', svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M12 20V10M12 10c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2-5-6-5 0 3 2 5 6 5z" /></svg> }
}

const FAQ = [
  { q: 'When does my plan start?', a: 'Immediately. Your premium access turns on the moment your payment succeeds — no waiting.' },
  { q: 'Can I use it on more than one phone?', a: 'Your plan is linked to your account (mobile number). You can log in on another phone, but heavy simultaneous use on many devices may be limited.' },
  { q: 'Paid but premium not active?', a: 'Open the app and tap "I\'ve already paid / refresh". If it\'s still not active after a few minutes, message us on WhatsApp with your payment screenshot and we\'ll fix it fast.' },
]

export default function PremiumPlansPage({
  plans = [], user, go,
  subscribe, openQr, loadingId, rzpReady,
  activeOffer, currentPlanId, subActive,
}) {
  const [openFaq, setOpenFaq] = useState(-1)
  const [compareOpen, setCompareOpen] = useState(false)

  // ── Pricing: ONE source of truth so DISPLAY === CHARGED amount. ──────────────
  // priceOf() mirrors the checkout exactly (getFinalPrice + resolvePlanOffer, the
  // same functions the Razorpay/QR quote uses). wasOf() is the struck-through
  // "was" price (base price when an offer is live, else any MRP/originalPrice).
  const _now = Date.now()
  const offerOf = (p) => resolvePlanOffer(p, activeOffer, _now)
  const priceOf = (p) => getFinalPrice(p, offerOf(p))
  const wasOf = (p) => {
    const fp = priceOf(p)
    const base = Math.max(0, Number(p?.price || 0))
    if (base > fp) return base
    const orig = Math.max(0, Number(p?.originalPrice || 0))
    return orig > fp ? orig : 0
  }
  const savingsOf = (p) => Math.max(0, wasOf(p) - priceOf(p))
  const perMonth = (p) => Math.round(priceOf(p) / (Math.max(1, p.days) / 30))
  const perDay = (p) => (priceOf(p) / Math.max(1, p.days)).toFixed(2)

  const paid = plans.filter(p => p.id !== 'free' && p.price > 0)
  const lifetime = paid.find(p => p.days >= 365 * 99 || /life/i.test(p.id))
  const nonLife = paid.filter(p => p !== lifetime)
  const featured = nonLife.find(p => p.id === 'yearly')
    || nonLife.find(p => p.popular)
    || nonLife.find(p => p.days >= 360 && p.days <= 400)
    || nonLife.slice().sort((a, b) => b.days - a.days)[0]
  const more = nonLife.filter(p => p !== featured).sort((a, b) => b.days - a.days)
  const freePlan = plans.find(p => p.id === 'free' || p.price <= 0)
  const isFreeUser = !currentPlanId || currentPlanId === 'free' || !subActive
  const isCurrent = (p) => p && currentPlanId === p.id && subActive

  // Lowest per-month plan among the "more" plans gets the BIGGEST SAVING badge.
  const lowestPMPlan = more.length ? more.slice().sort((a, b) => perMonth(a) - perMonth(b))[0] : null

  // Master "included" list = the richest feature list across paid plans.
  const included = (paid.concat(lifetime ? [lifetime] : [])
    .map(p => Array.isArray(p.features) ? p.features : [])
    .sort((a, b) => b.length - a.length)[0] || [])
    .map(f => String(f).replace(/^✅\s*/, '').replace(/^[^\w₹]+/, '').trim())
    .filter(Boolean)
    .slice(0, 12)

  // Admin offer strip — only when active and not past its end date.
  const offerLive = !!activeOffer && (!activeOffer.endsAt || new Date(activeOffer.endsAt).getTime() > Date.now())
  const offerEnds = activeOffer?.endsAt ? new Date(activeOffer.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

  // Derived badges for "more" plans. V2 intentionally HIDES admin/data badges
  // (e.g. "Best Value", "Special Offer") — only computed badges are shown.
  const minDays = Math.min(...more.map(p => p.days || 0))
  const badgeFor = (p) => {
    if (p === lowestPMPlan) return 'BIGGEST SAVING'                                  // lowest per-month only
    if ((p.days || 0) === minDays) return 'TRY IT'
    if (p.popular) return 'POPULAR'
    return ''
  }
  const badgeTone = (b) => b === 'BIGGEST SAVING' ? 'pp-t3' : b === 'POPULAR' ? 'pp-t2' : 'pp-t1'

  // Lifetime owners don't need any shorter plan → show "Not needed" instead of buy buttons.
  const userHasLifetime = subActive && lifetime && currentPlanId === lifetime.id

  // Sticky bar: hide for users who already own a long plan (yearly/3yr/lifetime).
  const ownsLong = subActive && (() => { const c = plans.find(p => p.id === currentPlanId); return c && (c.days >= 365) })()
  const showSticky = featured && !ownsLong && !isCurrent(featured)

  // ---- compare sheet data ----
  const durLabel = (p) => {
    const d = p.days || 0
    if (d >= 365 * 20) return 'Forever'
    if (d >= 360) { const y = Math.round(d / 365); return `${y} year${y > 1 ? 's' : ''}` }
    if (d >= 28) { const m = Math.round(d / 30); return `${m} month${m > 1 ? 's' : ''}` }
    return `${d} days`
  }
  const comparePlans = paid.slice().sort((a, b) => (a.days || 0) - (b.days || 0))

  const busy = (p) => loadingId === p.id || !rzpReady

  return (
    <div className="pp-root">
      <style>{CSS}</style>

      {/* 1 · top bar */}
      <div className="pp-top">
        <button className="pp-iconbtn" onClick={() => go(user ? 'dashboard' : 'home')} aria-label="Back">{Ic.back}</button>
        Premium Plans
        <span className="pp-sp" />
        <a className="pp-help" href={WA_HELP} target="_blank" rel="noopener">{Ic.help}Help</a>
      </div>

      {/* 2 · hero */}
      <section className="pp-hero">
        <div className="pp-crown">{Ic.crownW}</div>
        <h1>Teach smarter.<br /><em>Unlock everything.</em></h1>
        <p>Every lesson plan, book and chapter you need for your class, ready in one tap.</p>
        <div className="pp-stats">
          <div className="pp-stat"><b>10,000+</b><span>Lesson Plans</span></div>
          <div className="pp-stat"><b>85+</b><span>Books</span></div>
          <div className="pp-stat"><b>1000+</b><span>Chapters</span></div>
        </div>
        <div className="pp-social"><span className="pp-avs"><i /><i /><i /></span>Trusted by teachers across Odisha</div>
      </section>

      <div className="pp-wrap">
        {/* 3 · offer strip */}
        {offerLive && featured && (
          <div className="pp-offer">
            <div className="pp-offic">{Ic.boltW}</div>
            <div>
              <b>{activeOffer.name || 'Special Offer'}</b>
              <small>{featured.name} plan at ₹{fmt(priceOf(featured))}{offerEnds ? ` · Ends ${offerEnds}` : ''}</small>
            </div>
            {savingsOf(featured) > 0 && <span className="pp-tag">₹{fmt(savingsOf(featured))} OFF</span>}
          </div>
        )}

        {/* 4 · featured yearly */}
        {featured && (
          <div className="pp-feat">
            <div className="pp-ribbon">{Ic.star}{offerLive && activeOffer?.name ? `MOST CHOSEN · ${String(activeOffer.name).toUpperCase()}` : 'MOST CHOSEN'}</div>
            <div className="pp-featin">
              <div className="pp-fh">
                <div>
                  <h2>{featured.name}</h2>
                  <div className="pp-fsub">{featured.days} days full access</div>
                  {savingsOf(featured) > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span className="pp-chip pp-chipg">{tick(12, '#047857', 3)}You save ₹{fmt(savingsOf(featured))}</span>
                    </div>
                  )}
                </div>
                <div className="pp-price">
                  {wasOf(featured) > priceOf(featured) && <s>₹{fmt(wasOf(featured))}</s>}
                  <div className="pp-big">₹{fmt(priceOf(featured))}</div>
                  <div className="pp-per">per year</div>
                </div>
              </div>
              <div className="pp-daybox">
                <div className="pp-dayn">₹{perDay(featured)}</div>
                <span>a day. <b>Less than a cup of tea</b> for a full year of ready lesson plans.</span>
              </div>
              {included.length > 0 && (
                <ul className="pp-flist">
                  {included.slice(0, 4).map((f, i) => <li key={i}>{tick(15)}{f}</li>)}
                </ul>
              )}
              {isCurrent(featured) ? (
                <div className="pp-cur" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857' }}>{Ic.curCheck}Your Current Plan</div>
              ) : userHasLifetime ? (
                <div className="pp-cur" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#64748B' }}>Not needed — you have Lifetime</div>
              ) : (
                <>
                  <button className="pp-btn pp-btnp" disabled={busy(featured)} onClick={() => subscribe(featured)}>
                    {Ic.boltW}{loadingId === featured.id ? 'Starting…' : !rzpReady ? 'Loading payment…' : <>Get {featured.name} for ₹{fmt(priceOf(featured))}</>}
                  </button>
                  <button className="pp-btn pp-btnq" onClick={() => openQr(featured)}>{Ic.qr()}Pay by QR Code</button>
                  <div className="pp-upi">UPI · Google Pay · PhonePe · Paytm · BHIM</div>
                  <div className="pp-guar">
                    <span>{tick(13, '#059669', 2.5)}Instant activation</span>
                    <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>100% secure</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 5 · more plans */}
        {more.length > 0 && <div className="pp-st"><h3>More plans</h3><button className="pp-cmpbtn" onClick={() => setCompareOpen(true)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>Compare plans</button></div>}
        {more.map((p, idx) => {
          const b = badgeFor(p)
          const ic = planIcon(p)
          return (
            <div className={`pp-plan ${idx === 0 ? 'pp-hl' : ''}`} key={p.id}>
              <div className="pp-pr">
                <div className="pp-pi" style={{ background: ic.grad }}>{ic.svg}</div>
                <div className="pp-pn">
                  <b>{p.name}{b && <span className={`pp-tiny ${badgeTone(b)}`}>{b}</span>}</b>
                  <small>{p.days} days · {p.days <= 31 ? 'start small' : <>₹{perMonth(p)}/month</>}</small>
                </div>
                <div className="pp-pp">
                  {wasOf(p) > priceOf(p) && <s>₹{fmt(wasOf(p))}</s>}
                  <div className="pp-v">₹{fmt(priceOf(p))}</div>
                </div>
              </div>
              {isCurrent(p) ? (
                <div className="pp-pa"><div className="pp-save" style={{ flex: 1, justifyContent: 'center' }}>{Ic.curCheck && tick(13, '#059669', 3)}Your Current Plan</div></div>
              ) : userHasLifetime ? (
                <div className="pp-pa"><div className="pp-save" style={{ flex: 1, justifyContent: 'center', background: '#F1F5F9', color: '#64748B' }}>Not needed</div></div>
              ) : (
                <div className="pp-pa">
                  {savingsOf(p) > 0 && <div className="pp-save">{tick(13, '#059669', 3)}You save ₹{fmt(savingsOf(p))}</div>}
                  <button className="pp-mini pp-miniq" onClick={() => openQr(p)} aria-label="Pay by QR">{Ic.qr()}QR</button>
                  <button className="pp-mini pp-minip" disabled={busy(p)} onClick={() => subscribe(p)}>{loadingId === p.id ? '…' : 'Upgrade'}</button>
                </div>
              )}
            </div>
          )
        })}

        {/* 6 · lifetime */}
        {lifetime && (
          <div className="pp-life">
            <div className="pp-pr" style={{ position: 'relative', zIndex: 1 }}>
              <div className="pp-pi" style={{ background: 'linear-gradient(145deg,#FFE08A,#F59E0B)' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 10H5L3 8z" /></svg></div>
              <div className="pp-pn"><b style={{ color: '#fff' }}>{lifetime.name} <span className="pp-tiny" style={{ background: '#FCD34D', color: '#78350F' }}>PAY ONCE</span></b><small style={{ color: '#C7D2FE' }}>Forever access · no renewal ever</small></div>
              <div className="pp-pp">{wasOf(lifetime) > priceOf(lifetime) && <s style={{ color: '#A5B4FC' }}>₹{fmt(wasOf(lifetime))}</s>}<div className="pp-v" style={{ color: '#FFE08A' }}>₹{fmt(priceOf(lifetime))}</div></div>
            </div>
            {isCurrent(lifetime) ? (
              <div className="pp-cur" style={{ position: 'relative', zIndex: 1 }}>{Ic.curCheck}Your Current Plan</div>
            ) : (
              <div className="pp-pa" style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ flex: 1 }} />
                <button className="pp-mini pp-miniq" onClick={() => openQr(lifetime)}>{Ic.qr()}QR</button>
                <button className="pp-mini pp-minip" disabled={busy(lifetime)} onClick={() => subscribe(lifetime)}>{loadingId === lifetime.id ? '…' : 'Upgrade'}</button>
              </div>
            )}
          </div>
        )}

        {/* 7 · included checklist */}
        {included.length > 0 && (
          <>
            <div className="pp-st"><h3>Included in every Premium plan</h3></div>
            <div className="pp-inc">
              <ul>{included.map((f, i) => <li key={i}><span className="pp-ck">{tick(11, '#0F766E', 3.5)}</span>{f}</li>)}</ul>
            </div>
          </>
        )}

        {/* 8 · free card (free users only) */}
        {isFreeUser && freePlan && (
          <div className="pp-free">
            <div className="pp-pi" style={{ width: 36, height: 36, background: '#EEF4F3' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B8285" strokeWidth="2.2" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg></div>
            <div><b>Free</b><small>Browse curriculum &amp; sample lessons</small></div>
            <span className="pp-ok">₹0 · Active</span>
          </div>
        )}

        {/* 9 · trust + faq + whatsapp */}
        <div className="pp-trust">
          <div className="pp-tr"><div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg></div><b>Secure</b>Razorpay, bank-grade</div>
          <div className="pp-tr"><div>{Ic.boltW && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>}</div><b>Instant</b>Access right after payment</div>
          <div className="pp-tr"><div><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg></div><b>All methods</b>UPI, cards, wallets</div>
        </div>

        <div className="pp-faq">
          {FAQ.map((f, i) => (
            <div key={i} className="pp-faqitem">
              <button className="pp-faqq" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                <span>{f.q}</span>
                <span style={{ transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>{Ic.chev}</span>
              </button>
              {openFaq === i && <div className="pp-faqa">{f.a}</div>}
            </div>
          ))}
        </div>

        <a className="pp-wa" href={WA_HELP} target="_blank" rel="noopener">
          {Ic.wa}
          <div><b>Need help choosing?</b><small>Chat with us on WhatsApp</small></div>
        </a>
      </div>

      {/* Compare sheet */}
      {compareOpen && (
        <div className="pp-sheetbg" onClick={() => setCompareOpen(false)}>
          <div className="pp-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pp-sheeth">
              <b>Compare plans</b>
              <button className="pp-x" onClick={() => setCompareOpen(false)} aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3F5B5E" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <p className="pp-sheetnote">Every premium plan unlocks the <b>same content</b> — the only difference is how long you get it and the price. Tap a plan to continue.</p>
            <div className="pp-ctbl">
              <div className="pp-ctr pp-cthead">
                <span>Plan</span><span>Length</span><span>Price</span><span>/mo</span>
              </div>
              {comparePlans.map((p) => {
                const cur = isCurrent(p)
                const life = p.days >= 365 * 20
                return (
                  <button key={p.id} className={`pp-ctr pp-ctrow ${p === featured ? 'pp-ctfeat' : ''}`} disabled={cur} onClick={() => { if (!cur) { setCompareOpen(false); subscribe(p) } }}>
                    <span className="pp-ctn">{p.name}{cur && <em className="pp-ctcur">Current</em>}{p === featured && !cur && <em className="pp-ctbest">Most chosen</em>}</span>
                    <span>{durLabel(p)}</span>
                    <span className="pp-ctp">₹{fmt(priceOf(p))}</span>
                    <span>{life ? 'once' : `₹${perMonth(p)}`}</span>
                  </button>
                )
              })}
            </div>
            {included.length > 0 && (
              <div className="pp-sheetfeat">
                <b>In every plan</b>
                <ul>{included.slice(0, 8).map((f, i) => <li key={i}>{tick(11, '#0F766E', 3.5)}{f}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 10 · sticky bar (sits above the app bottom nav) */}
      {showSticky && (
        <div className="pp-sticky">
          <div className="pp-sl"><small>Most chosen · {featured.name}</small><b>₹{fmt(priceOf(featured))}{wasOf(featured) > priceOf(featured) && <s>₹{fmt(wasOf(featured))}</s>}</b></div>
          <button className="pp-mini pp-minip" style={{ padding: '13px 20px', fontSize: 15 }} disabled={busy(featured)} onClick={() => subscribe(featured)}>{Ic.boltW}{loadingId === featured.id ? 'Starting…' : 'Upgrade Now'}</button>
        </div>
      )}
    </div>
  )
}

// Scoped styles (pp- prefix) ported from the approved design.
const CSS = `
.pp-root{--ink:#0B2A2E;--ink2:#3F5B5E;--muted:#6B8285;--teal700:#0F766E;--teal50:#F0FDFA;--bg:#F4FAF8;--card:#fff;--line:#E2EFEC;--saf1:#FF7A1A;--saf2:#FFB020;--rose:#E11D48;--green:#059669;
  background:var(--bg);color:var(--ink);min-height:100vh;max-width:480px;margin:0 auto;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:40px;position:relative}
.pp-root *{box-sizing:border-box}
.pp-root svg{display:inline-block;vertical-align:middle;flex-shrink:0}
.pp-iconbtn{background:transparent;border:0;padding:0;cursor:pointer;display:flex;align-items:center}
.pp-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:14px 16px;background:#083B3C;color:#fff;font-weight:700;font-size:16px}
.pp-top .pp-sp{flex:1}
.pp-help{font-size:12px;font-weight:600;background:rgba(255,255,255,.12);padding:6px 10px;border-radius:99px;display:flex;gap:6px;align-items:center;color:#fff;text-decoration:none}
.pp-hero{position:relative;overflow:hidden;padding:26px 18px 64px;color:#fff;text-align:center;background:radial-gradient(120% 90% at 85% 0%,#1FB5A3 0%,rgba(31,181,163,0) 55%),linear-gradient(165deg,#083B3C 0%,#0E5E5A 55%,#0F766E 100%)}
.pp-hero:before,.pp-hero:after{content:"";position:absolute;border-radius:50%;border:1px solid rgba(255,255,255,.10)}
.pp-hero:before{width:260px;height:260px;left:-90px;top:-80px}
.pp-hero:after{width:200px;height:200px;right:-70px;bottom:-60px}
.pp-crown{width:58px;height:58px;margin:0 auto 12px;border-radius:18px;display:grid;place-items:center;background:linear-gradient(145deg,#FFD66B,#FF9F1C);box-shadow:0 10px 24px rgba(255,159,28,.45),inset 0 1px 0 rgba(255,255,255,.6)}
.pp-hero h1{font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-.4px}
.pp-hero h1 em{font-style:normal;background:linear-gradient(90deg,#FFE08A,#FFB020);-webkit-background-clip:text;background-clip:text;color:transparent}
.pp-hero p{margin:8px auto 0;max-width:300px;font-size:13.5px;line-height:1.5;color:#CDEDE8}
.pp-stats{display:flex;gap:8px;margin-top:18px}
.pp-stat{flex:1;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:10px 4px}
.pp-stat b{display:block;font-size:18px;font-weight:800}
.pp-stat span{font-size:11px;color:#BFE6E0}
.pp-social{margin-top:14px;display:inline-flex;align-items:center;gap:8px;font-size:12px;color:#E6F7F4;background:rgba(0,0,0,.18);padding:7px 12px;border-radius:99px}
.pp-avs{display:flex}.pp-avs i{width:20px;height:20px;border-radius:50%;border:2px solid #0E5E5A;margin-left:-6px;display:block}
.pp-avs i:first-child{margin-left:0;background:#FDBA74}.pp-avs i:nth-child(2){background:#86EFAC}.pp-avs i:nth-child(3){background:#93C5FD}
.pp-wrap{padding:0 14px}
.pp-offer{margin-top:-44px;position:relative;z-index:2;display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:16px;background:linear-gradient(90deg,#FFF1E6,#FFF8E1);border:1px solid #FFD8A8;box-shadow:0 8px 20px rgba(8,59,60,.10)}
.pp-offic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#FF7A1A,#E11D48);color:#fff}
.pp-offer b{font-size:13.5px;display:block}
.pp-offer small{font-size:11.5px;color:#9A4A12}
.pp-tag{margin-left:auto;font-size:11px;font-weight:800;color:#fff;background:var(--rose);padding:5px 8px;border-radius:8px;white-space:nowrap}
.pp-feat{margin-top:16px;position:relative;border-radius:24px;padding:3px;background:linear-gradient(140deg,#FFD66B,#FF8A1F 45%,#14B8A6);box-shadow:0 18px 40px rgba(15,118,110,.25)}
.pp-featin{border-radius:21px;padding:20px 18px 18px;background:linear-gradient(170deg,#fff 0%,#FFFBF2 100%)}
.pp-ribbon{position:absolute;top:-12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;background:linear-gradient(90deg,#083B3C,#0F766E);color:#FFE08A;font-size:11.5px;font-weight:800;letter-spacing:.6px;padding:6px 14px;border-radius:99px;box-shadow:0 6px 14px rgba(8,59,60,.3)}
.pp-fh{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.pp-fh h2{font-size:22px;font-weight:800}
.pp-fsub{font-size:12.5px;color:var(--ink2);margin-top:2px}
.pp-chip{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:99px}
.pp-chipg{background:#DCFCE7;color:#047857}
.pp-chipt{background:#CCFBF1;color:#0F766E}
.pp-price{text-align:right}
.pp-price s{font-size:13px;color:#94A3A8}
.pp-big{font-size:42px;line-height:1;font-weight:800;letter-spacing:-1px;color:var(--ink)}
.pp-per{font-size:12px;color:var(--muted)}
.pp-daybox{margin:14px 0 4px;display:flex;align-items:center;gap:10px;background:var(--teal50);border:1px dashed #99E2D6;border-radius:14px;padding:10px 12px}
.pp-dayn{font-size:20px;font-weight:800;color:var(--teal700);white-space:nowrap}
.pp-daybox span{font-size:12.5px;color:var(--ink2);line-height:1.35}
.pp-flist{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:8px 10px;margin:12px 0 16px;padding:0}
.pp-flist li{font-size:12.5px;display:flex;gap:6px;align-items:flex-start;color:var(--ink2)}
.pp-btn{width:100%;border:0;border-radius:16px;font:inherit;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px;padding:15px;cursor:pointer}
.pp-btn:disabled{opacity:.65;cursor:default}
.pp-btnp{color:#fff;background:linear-gradient(90deg,var(--saf1),var(--saf2));box-shadow:0 10px 22px rgba(255,122,26,.40),inset 0 1px 0 rgba(255,255,255,.35)}
.pp-btnq{margin-top:10px;background:#fff;color:var(--teal700);border:1.5px solid #9FDCD2;font-size:14.5px;padding:12px}
.pp-upi{margin-top:9px;text-align:center;font-size:11px;color:var(--muted)}
.pp-guar{margin-top:10px;display:flex;justify-content:center;gap:14px;font-size:11.5px;color:var(--ink2)}
.pp-guar span{display:flex;gap:4px;align-items:center}
.pp-st{margin:26px 2px 10px;display:flex;align-items:baseline;justify-content:space-between}
.pp-st h3{font-size:16px;font-weight:800}
.pp-st span{font-size:12px;color:var(--muted)}
.pp-cmpbtn{display:flex;align-items:center;gap:5px;font:inherit;font-size:12px;font-weight:800;color:var(--teal700);background:#E6FBF6;border:1px solid #B6EADF;border-radius:99px;padding:6px 12px;cursor:pointer}
.pp-sheetbg{position:fixed;inset:0;z-index:50;background:rgba(8,42,46,.55);display:flex;align-items:flex-end;justify-content:center}
.pp-sheet{width:100%;max-width:480px;background:#fff;border-radius:22px 22px 0 0;padding:16px 16px 26px;max-height:88vh;overflow:auto;animation:ppup .22s ease-out}
@keyframes ppup{from{transform:translateY(100%)}to{transform:translateY(0)}}
.pp-sheeth{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.pp-sheeth b{font-size:17px;font-weight:800}
.pp-x{background:#F1F5F4;border:0;border-radius:10px;width:34px;height:34px;display:grid;place-items:center;cursor:pointer}
.pp-sheetnote{font-size:12px;color:var(--ink2);line-height:1.45;margin:0 0 12px}
.pp-ctbl{border:1px solid var(--line);border-radius:14px;overflow:hidden}
.pp-ctr{display:grid;grid-template-columns:1.6fr 1fr .8fr .7fr;align-items:center;gap:4px;padding:11px 10px;font-size:12px;text-align:left;width:100%}
.pp-cthead{background:#F4FAF8;font-weight:800;font-size:10.5px;color:var(--muted);letter-spacing:.3px;text-transform:uppercase}
.pp-ctrow{border:0;border-top:1px solid var(--line);background:#fff;font:inherit;font-size:12px;cursor:pointer}
.pp-ctrow:disabled{cursor:default;background:#F8FBFA}
.pp-ctfeat{background:#F2FFFC}
.pp-ctn{font-weight:800;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.pp-ctcur{font-style:normal;font-size:9px;font-weight:800;background:#DCFCE7;color:#047857;padding:2px 6px;border-radius:99px}
.pp-ctbest{font-style:normal;font-size:9px;font-weight:800;background:#FEF3C7;color:#B45309;padding:2px 6px;border-radius:99px}
.pp-ctp{font-weight:800;color:var(--ink)}
.pp-cts{font-weight:800;color:var(--green)}
.pp-sheetfeat{margin-top:14px;background:#F6FBFA;border:1px solid var(--line);border-radius:14px;padding:12px}
.pp-sheetfeat b{font-size:12.5px}
.pp-sheetfeat ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:7px 10px;margin:8px 0 0;padding:0}
.pp-sheetfeat li{display:flex;gap:6px;align-items:flex-start;font-size:11.5px;color:var(--ink2);line-height:1.3}
.pp-plan{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;margin-bottom:10px;box-shadow:0 4px 12px rgba(8,59,60,.05)}
.pp-plan.pp-hl{border-color:#9FDCD2;background:linear-gradient(180deg,#F5FFFC,#fff)}
.pp-pr{display:flex;align-items:center;gap:12px}
.pp-pi{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex-shrink:0}
.pp-pn{flex:1;min-width:0}
.pp-pn b{font-size:15.5px;font-weight:800;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pp-pn small{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.pp-vsm{display:inline-block;margin-top:5px;font-size:10px;font-weight:800;color:#0F766E;background:#CCFBF1;border-radius:99px;padding:3px 8px;letter-spacing:.2px}
.pp-pp{text-align:right}
.pp-v{font-size:23px;font-weight:800;letter-spacing:-.4px}
.pp-pp s{font-size:11.5px;color:#94A3A8;display:block}
.pp-tiny{font-size:10.5px;font-weight:800;padding:3px 7px;border-radius:99px;letter-spacing:.2px}
.pp-t1{background:#E0F2FE;color:#0369A1}.pp-t2{background:#FEF3C7;color:#B45309}.pp-t3{background:#EDE9FE;color:#6D28D9}
.pp-pa{display:flex;gap:8px;margin-top:12px;align-items:center}
.pp-save{font-size:11.5px;font-weight:700;color:var(--green);background:#ECFDF5;border-radius:10px;padding:8px 10px;flex:1;display:flex;align-items:center;gap:5px}
.pp-mini{border:0;border-radius:12px;font:inherit;font-weight:800;font-size:13.5px;padding:10px 14px;display:flex;align-items:center;gap:6px;cursor:pointer}
.pp-mini:disabled{opacity:.65;cursor:default}
.pp-minip{color:#fff;background:linear-gradient(90deg,var(--saf1),var(--saf2));box-shadow:0 6px 14px rgba(255,122,26,.30)}
.pp-miniq{background:#fff;border:1.5px solid #9FDCD2;color:var(--teal700);padding:9px 10px}
.pp-life{border-radius:20px;padding:16px;color:#fff;background:linear-gradient(150deg,#1E1B4B,#312E81 55%,#4338CA);position:relative;overflow:hidden;margin-bottom:10px}
.pp-life:after{content:"";position:absolute;right:-40px;top:-40px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(252,211,77,.35),rgba(252,211,77,0) 70%)}
.pp-cur{margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;padding:11px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);font-weight:800;font-size:14px;color:#D1FAE5}
.pp-inc{background:#fff;border:1px solid var(--line);border-radius:20px;padding:16px}
.pp-inc ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0;padding:0}
.pp-inc li{display:flex;gap:7px;align-items:flex-start;font-size:12.5px;color:var(--ink2);line-height:1.3}
.pp-ck{width:18px;height:18px;border-radius:6px;background:#CCFBF1;display:grid;place-items:center;flex-shrink:0}
.pp-free{margin-top:10px;display:flex;align-items:center;gap:12px;background:#fff;border:1px dashed #C9DEDA;border-radius:16px;padding:12px 14px}
.pp-free b{font-size:14px}.pp-free small{display:block;font-size:11.5px;color:var(--muted)}
.pp-ok{margin-left:auto;white-space:nowrap;font-size:11.5px;font-weight:700;color:var(--muted);background:#F1F5F4;padding:6px 10px;border-radius:99px}
.pp-trust{margin:18px 0 0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.pp-tr{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 6px;text-align:center;font-size:11px;color:var(--ink2);line-height:1.3}
.pp-tr>div{width:32px;height:32px;margin:0 auto 6px;border-radius:10px;display:grid;place-items:center;background:var(--teal50)}
.pp-tr b{display:block;color:var(--ink);font-size:12px}
.pp-faq{margin-top:10px;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}
.pp-faqitem{border-bottom:1px solid var(--line)}
.pp-faqitem:last-child{border:0}
.pp-faqq{width:100%;background:transparent;border:0;cursor:pointer;padding:13px 14px;font:inherit;font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;color:var(--ink)}
.pp-faqa{padding:0 14px 13px;font-size:12.5px;line-height:1.5;color:var(--ink2);font-weight:500}
.pp-wa{margin:14px 0 0;display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;background:#E8FBEF;border:1px solid #B7EBCB;font-size:13px;text-decoration:none;color:var(--ink)}
.pp-wa b{display:block}.pp-wa small{color:#2F6B47;font-size:11.5px}
.pp-sticky{position:sticky;bottom:calc(72px + env(safe-area-inset-bottom));z-index:55;margin:18px -14px 0;padding:10px 14px;background:#fff;border-top:1px solid var(--line);border-radius:16px 16px 0 0;display:flex;align-items:center;gap:10px;box-shadow:0 -8px 20px rgba(8,59,60,.14)}
.pp-sl{flex:1}
.pp-sl small{font-size:11px;color:var(--muted);display:block}
.pp-sl b{font-size:18px;font-weight:800}
.pp-sl s{font-size:12px;color:#94A3A8;margin-left:4px;font-weight:500}
`
