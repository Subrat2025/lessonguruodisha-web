'use client'
import React from 'react'

// Raw SVGs copied verbatim from the approved design (kept as HTML strings so the
// markup is byte-identical — no JSX attribute conversion needed).
const SVG = {
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  star: `<svg width="13" height="13" viewBox="0 0 24 24" fill="#FDE047"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7L12 2z"/></svg>`,
  gift: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" fill="rgba(255,255,255,.25)"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>`,
  phone: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/><path d="M13 6l-2.5 4h3L11 14" stroke-width="2.2"/></svg>`,
  giftbox: `<svg width="72" height="72" viewBox="0 0 64 64"><ellipse cx="32" cy="58" rx="22" ry="3.5" fill="#E9D5FF"/><rect x="10" y="28" width="44" height="28" rx="4" fill="#EC4899"/><rect x="10" y="28" width="44" height="28" rx="4" fill="url(#gb)"/><rect x="7" y="20" width="50" height="11" rx="3.5" fill="#F472B6"/><rect x="28" y="20" width="8" height="36" fill="#FDE047"/><path d="M32 20c-4-9-15-10-15-3 0 5 9 4 15 3zM32 20c4-9 15-10 15-3 0 5-9 4-15 3z" fill="#FACC15" stroke="#EAB308" stroke-width="1.2"/><circle cx="32" cy="20" r="3" fill="#EAB308"/><text x="32" y="47" text-anchor="middle" font-family="DejaVu Sans" font-weight="700" font-size="13" fill="#fff">?</text><path d="M52 8l1.5 3.5L57 13l-3.5 1.5L52 18l-1.5-3.5L47 13l3.5-1.5z" fill="#FDE047"/><path d="M9 10l1 2.2 2.2 1-2.2 1L9 16.4l-1-2.2-2.2-1 2.2-1z" fill="#A78BFA"/><defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F472B6" stop-opacity="0"/><stop offset="1" stop-color="#BE185D" stop-opacity=".5"/></linearGradient></defs></svg>`,
  crown: `<svg width="72" height="72" viewBox="0 0 64 64"><ellipse cx="32" cy="59" rx="20" ry="3.5" fill="#BFDBFE"/><path d="M14 58c0-11 8-18 18-18s18 7 18 18z" fill="#2563EB"/><path d="M26 41l6 9 6-9" fill="#fff"/><path d="M30.5 44h3l-.8 12h-1.4z" fill="#F59E0B"/><circle cx="32" cy="29" r="10.5" fill="#F5C9A0"/><path d="M21.5 27c0-7 4.5-10.5 10.5-10.5S42.5 20 42.5 27c-2-3-5.5-4.5-10.5-4.5S23.5 24 21.5 27z" fill="#3F2A1E"/><circle cx="28.2" cy="29.5" r="1.2" fill="#3F2A1E"/><circle cx="35.8" cy="29.5" r="1.2" fill="#3F2A1E"/><path d="M28.5 33.5c2 1.8 5 1.8 7 0" stroke="#B45309" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M22 13l4 4 6-8 6 8 4-4-2 8H24z" fill="#FACC15" stroke="#EAB308" stroke-width="1"/><circle cx="32" cy="9" r="1.6" fill="#F43F5E"/><circle cx="45" cy="50" r="7" fill="#FACC15" stroke="#fff" stroke-width="2"/><path d="M45 46.5l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#fff"/></svg>`,
  heart: `<svg width="18" height="18" viewBox="0 0 24 24" fill="#EC4899"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.4 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5 18.8 5 21 8.4 19.5 11.8 17.5 16.4 12 21 12 21z"/></svg>`,
  b1: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  b2: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>`,
  b3: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
  b4: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"><path d="M3 11l9-7 9 7v9H3z"/><path d="M12 20v-5"/></svg>`,
  b5: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 20a4 4 0 0 1 7 0"/></svg>`,
  b6: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C026D3" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  wa: `<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z"/></svg>`,
  share: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2.2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`,
  back: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2E1065" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>`,
}
const H = (html) => <span dangerouslySetInnerHTML={{ __html: html }} />

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700;800&display=swap');
.rpv2-dim{position:fixed;inset:0;background:rgba(15,8,35,.60);z-index:9998;display:flex;align-items:flex-end;justify-content:center}
.rpv2,.rpv2 *{font-family:"Noto Sans Oriya","NotoOriya",Inter,"DejaVu Sans",sans-serif}
.rpv2{position:relative;z-index:9999;width:100%;max-width:420px;max-height:94vh;overflow-y:auto;border-radius:28px 28px 0 0;background:#FFFDF8;box-shadow:0 -10px 40px rgba(0,0,0,.35);color:#1F1235}
@media(min-width:421px){.rpv2{border-radius:28px;margin-bottom:12px}}
.rpv2 .hd{position:relative;overflow:hidden;padding:22px 18px 70px;color:#fff;background:radial-gradient(90% 80% at 100% 0%,#FFB020 0%,rgba(255,176,32,0) 55%),linear-gradient(150deg,#5B21B6 0%,#C026D3 48%,#F43F5E 80%,#FB923C 100%)}
.rpv2 .x{position:absolute;right:14px;top:14px;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.22);display:grid;place-items:center;border:1px solid rgba(255,255,255,.35);cursor:pointer}
.rpv2 .conf i{position:absolute;width:7px;height:12px;border-radius:2px;opacity:.85}
.rpv2 .tag{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);padding:5px 11px;border-radius:99px;font-size:12px;font-weight:700}
.rpv2 .hd h1{margin-top:12px;font-size:25px;line-height:1.3;font-weight:800}
.rpv2 .hd h1 em{font-style:normal;color:#FFE27A}
.rpv2 .hd p{margin-top:8px;font-size:13.5px;line-height:1.55;color:#FCE7F3;max-width:225px}
.rpv2 .giftt{position:absolute;right:16px;bottom:58px;width:78px;height:78px;border-radius:22px;display:grid;place-items:center;transform:rotate(8deg);background:linear-gradient(145deg,#FFE27A,#FF9F1C);box-shadow:0 12px 26px rgba(120,20,80,.45),inset 0 2px 0 rgba(255,255,255,.6)}
.rpv2 .ms{position:relative;margin:-56px 14px 0;border-radius:22px;padding:2.5px;background:linear-gradient(120deg,#FDE047,#F59E0B,#EC4899,#8B5CF6);box-shadow:0 14px 30px rgba(91,33,182,.28)}
.rpv2 .ms .in{border-radius:20px;background:linear-gradient(170deg,#FFFBEB,#FFF);padding:14px 14px 13px}
.rpv2 .badge{position:absolute;top:-11px;left:16px;background:#111827;color:#FDE047;font-size:10.5px;font-weight:800;letter-spacing:.8px;padding:5px 10px;border-radius:99px}
.rpv2 .mhead{font-size:15.5px;font-weight:800;color:#1F1235;line-height:1.35;margin:4px 0 10px}
.rpv2 .mhead span{background:linear-gradient(90deg,#DB2777,#7C3AED);-webkit-background-clip:text;background-clip:text;color:transparent}
.rpv2 .rw{border-radius:16px}
.rpv2 .r1{display:flex;gap:12px;align-items:center;padding:11px;background:linear-gradient(120deg,#ECFEFF,#F0FDF4);border:1px solid #A5F3FC}
.rpv2 .phone{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(145deg,#22C55E,#0EA5E9);box-shadow:0 8px 16px rgba(14,165,233,.35)}
.rpv2 .rt b{display:block;font-size:16px;font-weight:800;color:#0F172A}
.rpv2 .free2{display:inline-block;margin-top:4px;color:#fff;background:#E11D48;font-size:12px;font-weight:800;padding:3px 9px;border-radius:7px}
.rpv2 .ops{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}
.rpv2 .ops span{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:#334155;background:#fff;border:1px solid #CBD5E1;padding:3px 7px;border-radius:7px}
.rpv2 .ops i{width:8px;height:10px;border-radius:2px 4px 2px 2px;display:block}
.rpv2 .ops .all{background:#0F172A;color:#fff;border-color:#0F172A}
.rpv2 .two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.rpv2 .r2,.rpv2 .r3{text-align:center;padding:10px 6px 11px}
.rpv2 .r2{background:linear-gradient(170deg,#FDF2F8,#FAE8FF);border:1px solid #F5D0FE}
.rpv2 .r3{background:linear-gradient(170deg,#EFF6FF,#FEF9C3);border:1px solid #BFDBFE}
.rpv2 .r2 b,.rpv2 .r3 b{display:block;font-size:14px;font-weight:800;line-height:1.25;margin-top:2px;color:#1F1235}
.rpv2 .r2 small,.rpv2 .r3 small{display:block;font-size:11px;color:#6B5A86;margin-top:2px}
.rpv2 .prog{margin-top:12px}
.rpv2 .pl{display:flex;justify-content:space-between;font-size:12px;color:#4B3B66;font-weight:700;margin-bottom:6px}
.rpv2 .bar{height:12px;border-radius:99px;background:#EDE9FE;overflow:hidden;position:relative}
.rpv2 .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:99px;background:linear-gradient(90deg,#F59E0B,#EC4899,#8B5CF6);transition:width .6s ease}
.rpv2 .steps{display:flex;justify-content:space-between;margin-top:5px;font-size:10.5px;color:#8C7BA8}
.rpv2 .sec{padding:16px 14px 0}
.rpv2 .sh{font-size:15px;font-weight:800;display:flex;align-items:center;gap:7px;color:#2E1065}
.rpv2 .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.rpv2 .b{border-radius:16px;padding:11px 10px;display:flex;gap:9px;align-items:flex-start}
.rpv2 .b .ic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;flex-shrink:0}
.rpv2 .b b{display:block;font-size:13px;font-weight:800;line-height:1.3}
.rpv2 .b small{display:block;font-size:11px;line-height:1.35;margin-top:2px;opacity:.8}
.rpv2 .c1{background:#ECFDF5;color:#065F46}.rpv2 .c1 .ic{background:#10B981}
.rpv2 .c2{background:#EFF6FF;color:#1E3A8A}.rpv2 .c2 .ic{background:#3B82F6}
.rpv2 .c3{background:#F5F3FF;color:#4C1D95}.rpv2 .c3 .ic{background:#8B5CF6}
.rpv2 .c4{background:#FFF1F2;color:#9F1239}.rpv2 .c4 .ic{background:#F43F5E}
.rpv2 .c5{background:#FFFBEB;color:#92400E}.rpv2 .c5 .ic{background:#F59E0B}
.rpv2 .c6{background:#ECFEFF;color:#155E75}.rpv2 .c6 .ic{background:#06B6D4}
.rpv2 .you{margin:12px 14px 0;border-radius:16px;padding:11px 12px;background:linear-gradient(90deg,#FDF4FF,#FFF7ED);border:1px dashed #F0ABFC}
.rpv2 .you b{font-size:13px;color:#86198F;display:block;margin-bottom:6px}
.rpv2 .you div{font-size:12.5px;color:#4A3560;display:flex;gap:7px;align-items:center;margin-top:4px}
.rpv2 .link{margin:12px 14px 0;display:flex;align-items:center;gap:8px;border-radius:14px;padding:6px 6px 6px 12px;background:#fff;border:1.5px solid #E9D5FF}
.rpv2 .link .u{flex:1;min-width:0}
.rpv2 .link small{display:block;font-size:10.5px;font-weight:800;color:#7C3AED;letter-spacing:.4px}
.rpv2 .link code{font-family:"DejaVu Sans Mono",monospace;font-size:12.5px;color:#1F1235;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.rpv2 .cp{border:0;border-radius:11px;background:#7C3AED;color:#fff;font:inherit;font-weight:800;font-size:12.5px;padding:10px 12px;display:flex;align-items:center;gap:5px;cursor:pointer}
.rpv2 .waBtn{margin:12px 14px 0;position:relative;overflow:hidden;border:0;width:calc(100% - 28px);border-radius:18px;padding:16px;font:inherit;font-size:16.5px;font-weight:800;color:#fff;display:flex;align-items:center;justify-content:center;gap:9px;background:linear-gradient(90deg,#16A34A,#22C55E);box-shadow:0 10px 22px rgba(22,163,74,.40),inset 0 1px 0 rgba(255,255,255,.35);cursor:pointer}
.rpv2 .row2{display:flex;gap:8px;margin:9px 14px 0}
.rpv2 .row2 button{flex:1;border-radius:14px;border:1.5px solid #E5E7EB;background:#fff;font:inherit;font-weight:700;font-size:13.5px;padding:11px;color:#374151;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}
.rpv2 .tc{margin:12px 18px 0;font-size:10.5px;color:#8C7BA8;text-align:center;line-height:1.45;cursor:pointer;text-decoration:underline}
.rpv2 .later{margin:8px 0 16px;text-align:center;font-size:12.5px;color:#6B7280;cursor:pointer}
.rpv2 .terms{padding:18px}
.rpv2 .terms h2{font-size:18px;font-weight:800;color:#2E1065;display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer}
.rpv2 .terms li{font-size:13px;color:#3A2B52;line-height:1.6;margin:0 0 10px 18px}
.rpv2 .terms h3{font-size:14px;font-weight:800;color:#5B21B6;margin:14px 0 6px}
`

export default function ReferralPopupV2({ data, config, onClose, onMaybeLater }) {
  const [showTerms, setShowTerms] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const code = data?.code || ''
  // Referral link ALWAYS uses the configured production host (never preview/other).
  const base = String(config?.referralBaseUrl || 'https://lessonguruodisha.in').replace(/\/+$/, '')
  const link = code ? `${base}/?ref=${code}` : base
  const shortLink = link.replace(/^https?:\/\//, '')
  const target = config?.target || 500
  const count = Math.max(0, Number(data?.stats?.milestoneCount ?? data?.stats?.qualified ?? 0))
  const pct = Math.min(100, Math.round((count / Math.max(1, target)) * 100))
  const remaining = Math.max(0, target - count)
  const rw = config?.rewards || {}

  const shareMsg = data?.shareMessage || `ନମସ୍କାର ଶିକ୍ଷକ ବନ୍ଧୁ! 🙏\nLessonGuru Odisha ରେ Panchapadi lesson plan, worksheet ଓ ଶିକ୍ଷା ସାମଗ୍ରୀ ମିନିଟରେ ତିଆରି ହୁଏ।\nଆଜି ଜ୏ଇନ୍ କରନ୍ତୁ:\n${link}`

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch (_) {}
  }
  const waShare = () => { window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareMsg)}`, '_blank') }
  const nativeShare = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'LessonGuru Odisha', text: shareMsg })
      else waShare()
    } catch (_) {}
  }

  return (
    <div className="rpv2-dim" onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="rpv2" onClick={(e) => e.stopPropagation()}>
        {showTerms ? (
          <div className="terms">
            <h2 onClick={() => setShowTerms(false)}>{H(SVG.back)} ସର୍ତ୍ତାବଳୀ (Terms)</h2>
            <h3>ସଫଳ Referral କ'ଣ?</h3>
            <ul>
              <li>ସଫଳ Referral = ଆପଣଙ୍କ Link ରେ ଯୋଗଦେଇ Premium ନେଇଥିବା ଶିକ୍ଷକ।</li>
              <li>ଗୋଟିଏ ଥର ସଫଳ ପେମେଣ୍ଟ ହେଲେ ହୀଂ ଗଣା ହୁଏ — ପରେ plan expire ହେଲେ ବି count କମେ ନାହିଁ।</li>
            </ul>
            <h3>କ'ଣ ଗଣା ହୁଏ ନାହିଁ (Fraud rules)</h3>
            <ul>
              <li>ନିଜକୁ ନିଜେ refer କରିପାରିବେ ନାହିଁ (self-referral)।</li>
              <li>ଏକେ ଫୋନ ନମ୍ବର କିମ୍ବା ଏକେ email ରେ ଏକାଧିକ account ହେଲେ ଗୋଟିଏ ଭାବେ ଗଣା ହେବ।</li>
              <li>ଭୁଲ କିମ୍ବା ବାର୍ଡା referral ଧରା ପଡିଲେ reward ବାତିଲ ହେବ।</li>
            </ul>
            <h3>ପୁରସ୍କାର ନିୟମ</h3>
            <ul>
              <li>5 Refer → 1 ମାସ ମାଗଣା Premium</li>
              <li>15 Refer → 3 ମାସ ମାଗଣା Premium</li>
              <li>30 Refer → 6 ମାସ ମାଗଣା Premium</li>
              <li>50 Refer → 1 ବର୍ଷ ମାଗଣା Premium</li>
              <li>100 Refer → 1 ବର୍ଷ ମାଗଣା Premium (ଶେଷ ମାଗଣା Premium)</li>
              <li>500 Refer → Ambassador: 1 ବର୍ଷ ମାଗଣା Mobile Recharge, Gift Hamper, District Head ପଦବୀ ଓ ବର୍ଷକୁ ମାତ୍ର ₹99 ରେ Premium</li>
              <li>ପ୍ରତ୍ୟେକ ପୁରସ୍କାର ଥରେ ମାତ୍ର ମିଳିବ। ଆଗରୁ ମିଳିଥିବା ପୁରସ୍କାର ଅପରିବର୍ତ୍ତିତ ରହିବ।</li>
              <li>ମାଗଣା Premium ଦିନ ଆପେଆପେ ମିଳିବ। 500 Refer ପୁରସ୍କାର (Mobile Recharge, Gift Hamper, District Head) Admin ଯାଞ୍ଚ ପରେ ଦିଆଯିବ।</li>
              <li>ପ୍ରତି ଜିଲ୍ଲାରେ ଏକ District Head = ସେଇ ଜିଲ୍ଲାରୁ {target} ସଫଳ referral ପହଞ୍ଚିବା ପ୍ରଥମ approved ଶିକ୍ଷକ।</li>
            </ul>
            <p style={{ fontSize: 11, color: '#8C7BA8', marginTop: 14 }}>LessonGuru Odisha ଏଇ ଶର୍ତାବଳୀ ଯେକୌଣସି ସମୟରେ ପରିବର୍ତନ କରିପାରିବ।</p>
          </div>
        ) : (
          <>
            <div className="hd">
              <div className="conf">
                <i style={{ left: '40%', top: 16, background: '#FDE047', transform: 'rotate(25deg)' }} />
                <i style={{ left: '58%', top: 40, background: '#67E8F9', transform: 'rotate(-30deg)' }} />
                <i style={{ left: '76%', top: 20, background: '#fff', transform: 'rotate(60deg)' }} />
                <i style={{ left: '10%', top: 120, background: '#FDE047', transform: 'rotate(-15deg)' }} />
                <i style={{ left: '52%', top: 150, background: '#A7F3D0', transform: 'rotate(40deg)' }} />
              </div>
              <div className="x" onClick={onClose}>{H(SVG.x)}</div>
              <span className="tag">{H(SVG.star)}ଆପଣଙ୍କ ପାଇଁ ବିଶେଷ</span>
              <h1>Share କରନ୍ତୁ,<br /><em>ପୁରସ୍କାର ଜିତନ୍ତୁ!</em></h1>
              <p>ଆପଣଙ୍କ ଗୋଟିଏ Share ରେ ଜଣେ ଶିକ୍ଷକଙ୍କ ଜୀବନ ସହଜ ହେବ।</p>
              <div className="giftt">{H(SVG.gift)}</div>
            </div>

            <div className="ms">
              <span className="badge">MILESTONE OFFER · {target} REFER</span>
              <div className="in">
                <div className="mhead">{target} ଜଣଙ୍କୁ Refer କରନ୍ତୁ, <span>3ଟି ପୁରସ୍କାର</span> ଜିତନ୍ତୁ!</div>

              {rw.recharge?.enabled !== false && (
                <div className="rw r1">
                  <div className="phone">{H(SVG.phone)}</div>
                  <div className="rt">
                    <b>{rw.recharge?.title || '1 ବର୍ଷ Mobile Recharge'}</b>
                    <span className="free2">{rw.recharge?.subtitle || 'ସମ୍ପୂର୍ଣ୍ଣ FREE'}</span>
                    <div className="ops">
                      <span><i style={{ background: '#64748B' }} />Prepaid</span>
                      <span className="all">ଯେକୌଣସି Operator</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="two">
                {rw.gift?.enabled !== false && (
                  <div className="rw r2">
                    {H(SVG.giftbox)}
                    <b>{(rw.gift?.title || 'Gift Hamper')}</b>
                    <small>{rw.gift?.subtitle || 'ଆପଣଙ୍କ ପାଇଁ ବିଶେଷ ଉପହାର'}</small>
                  </div>
                )}
                {rw.districtHead?.enabled !== false && (
                  <div className="rw r3">
                    {H(SVG.crown)}
                    <b>{rw.districtHead?.title || 'District Head'}</b>
                    <small>{rw.districtHead?.subtitle || 'LessonGuru Platform'}</small>
                  </div>
                )}
              </div>

              <div className="prog">
                <div className="pl"><span>ଆପଣଙ୍କ ସଫଳ Referral</span><span>{count} / {target}</span></div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                <div className="steps"><span>ଆରମ୍ଭ</span><span>ଆଉ {remaining} ବାକି</span><span>{target}</span></div>
              </div>
              </div>
            </div>

            <div className="sec">
              <div className="sh">{H(SVG.heart)}Share କଲେ ଶିକ୍ଷକ ବନ୍ଧୁ ପାଇବେ</div>
              <div className="grid">
                <div className="b c1"><div className="ic">{H(SVG.b1)}</div><div><b>ସମୟ ସଞ୍ଚୟ</b><small>Lesson Plan ମିନିଟରେ ତିଆରି</small></div></div>
                <div className="b c2"><div className="ic">{H(SVG.b2)}</div><div><b>ଗୁଣାତ୍ମକ ଶିକ୍ଷା ସାମଗ୍ରୀ</b><small>Balvatika ରୁ Class 10</small></div></div>
                <div className="b c3"><div className="ic">{H(SVG.b3)}</div><div><b>Tension ମୁକ୍ତ</b><small>ରାତି ଜାଗି ଲେଖିବା ଆଉ ନାହିଁ</small></div></div>
                <div className="b c4"><div className="ic">{H(SVG.b4)}</div><div><b>ପରିବାର ପାଇଁ ସମୟ</b><small>ଘରେ ଖୁସି ସମୟ ବିତାନ୍ତୁ</small></div></div>
                <div className="b c5"><div className="ic">{H(SVG.b5)}</div><div><b>ଛାତ୍ରଛାତ୍ରୀଙ୍କ ପାଇଁ ଅଧିକ ଧ୍ଯାନ</b><small>ଭଲ ଶିକ୍ଷାଦାନ, ଭଲ ଫଳ</small></div></div>
                <div className="b c6"><div className="ic">{H(SVG.b6)}</div><div><b>Career ରେ ଆଗକୁ</b><small>ନିଜ ଉନ୍ନତିରେ ଧ୍ଯାନ</small></div></div>
              </div>
            </div>

            <div className="you">
              <b>ଆପଣ ମଧ୍ଯ ପାଇବେ</b>
              <div>{H(SVG.check)}Premium features ସର୍ବପ୍ରଥମେ</div>
              <div>{H(SVG.check)}Nominal ମୂଲ୍ଯରେ ସମସ୍ତ New Updates</div>
            </div>

            <div className="link">
              <div className="u"><small>ଆପଣଙ୍କ ନିଜର LINK</small><code>{shortLink}</code></div>
              <button className="cp" onClick={copy}>{H(SVG.copy)}{copied ? 'Copied' : 'Copy'}</button>
            </div>

            <button className="waBtn" onClick={waShare}>{H(SVG.wa)}Teacher Group ରେ Share କରନ୍ତୁ</button>
            <div className="row2">
              <button onClick={nativeShare}>{H(SVG.share)}ଅନ୍ଯ App</button>
            </div>
            <div className="tc" onClick={() => setShowTerms(true)}>* ସଫଳ Referral = ଆପଣଙ୍କ Link ରେ ଯୋଗଦେଇ Premium ନେଇଥିବା ଶିକ୍ଷକ। ସର୍ତ୍ତାବଳୀ ପ୍ରଯୁଜ୍ଯ।</div>
            <div className="later" onClick={onMaybeLater}>Maybe Later · 24 ଘଣ୍ଟା ପରେ ପୁଣି ଦେଖାଯିବ</div>
          </>
        )}
      </div>
    </div>
  )
}
