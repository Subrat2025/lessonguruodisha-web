// === STORE === Auto-generated product COVER images.
// Renders an HTML cover with the shared headless Chromium (correct Odia /
// Devanagari shaping — satori/next-og are NOT used), then uploads a PUBLIC
// WebP to Cloudinary. Covers contain NO paid content (only subject art + the
// existing heavily-blurred preview page), so public delivery is fine.
//
// Never throws to the caller: on any failure it returns null and logs, so the
// product page keeps the grey placeholder fallback.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { htmlToImageBuffer } from '@/lib/pdf.js'
import { uploadCoverImage } from '@/lib/cloudinary.js'
import { fetchPreviewBytes } from '@/lib/answer-key-preview.js'
import { STORE_COLL } from '@/lib/store/security.js'

// Bump this when the design changes so cached covers regenerate.
export const COVER_STYLE_VERSION = 'v2'

// ---------- fonts (base64-embedded so Chromium always has glyphs) ----------
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')
const _fontCache = {}
function fontB64(file) {
  if (_fontCache[file] !== undefined) return _fontCache[file]
  try { _fontCache[file] = fs.readFileSync(path.join(FONT_DIR, file)).toString('base64') }
  catch { _fontCache[file] = null }
  return _fontCache[file]
}
function fontFaceCss() {
  const faces = [
    ['Baloo', 'BalooBhaina2.ttf', 400],
    ['NotoOriya', 'NotoSansOriya-Regular.ttf', 400],
    ['NotoOriya', 'NotoSansOriya-Bold.ttf', 700],
    ['NotoDeva', 'NotoSansDevanagari-Regular.ttf', 400],
    ['NotoDeva', 'NotoSansDevanagari-Bold.ttf', 700],
  ]
  return faces.map(([fam, file, w]) => {
    const b = fontB64(file)
    if (!b) return ''
    return `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};src:url(data:font/ttf;base64,${b}) format('truetype');font-display:swap;}`
  }).join('\n')
}

// ---------- subject styles (bg / dark text) + motif family ----------
const STYLES = {
  math:       { bg: '#e7e3ff', dark: '#3a2d8c', motif: 'math',    odia: 'ଗଣିତ' },
  science:    { bg: '#dff3e7', dark: '#1f6b40', motif: 'science', odia: 'ଜିଜ୍ଞାସା' },
  evs:        { bg: '#dff3e7', dark: '#1f6b40', motif: 'evs',     odia: 'ଆମ ପୃଥିବୀ' },
  odia:       { bg: '#ffe3dc', dark: '#9c2a16', motif: 'odia',    odia: 'ଓଡ଼ିଆ' },
  english:    { bg: '#dcefff', dark: '#155f8c', motif: 'english', odia: 'ଇଂରାଜୀ' },
  hindi:      { bg: '#fde1ec', dark: '#9a1f4c', motif: 'hindi',   odia: 'ହିନ୍ଦୀ' },
  sanskrit:   { bg: '#fff0c9', dark: '#7a5200', motif: 'sanskrit',odia: 'ସଂସ୍କୃତ' },
  social:     { bg: '#fff0c9', dark: '#7a5200', motif: 'social',  odia: 'ସାମାଜିକ ବିଜ୍ଞାନ' },
  art:        { bg: '#fde1ec', dark: '#9a1f4c', motif: 'art',     odia: 'କଳାକୁଞ୍ଜ' },
  indradhanu: { bg: '#e7e3ff', dark: '#3a2d8c', motif: 'rainbow', odia: 'ଇନ୍ଦ୍ରଧନୁ' },
  nabarasa:   { bg: '#ffe3dc', dark: '#9c2a16', motif: 'art',     odia: 'ନବରସ' },
  sports:     { bg: '#dcefff', dark: '#155f8c', motif: 'sports',  odia: 'ଖେଳ ଶିକ୍ଷା' },
  kaushal:    { bg: '#dff3e7', dark: '#1f6b40', motif: 'kaushal', odia: 'କୌଶଳ ବୋଧ' },
  other:      { bg: '#efedf9', dark: '#241a5e', motif: 'book',    odia: 'ପାଠ୍ୟ ସାମଗ୍ରୀ' },
}

const SUBJECT_MATCH = [
  [/math|ଗଣିତ|गणित/i, 'math'],
  [/social|ସାମାଜିକ/i, 'social'],
  [/evs|ପୃଥିବୀ|ବିଶ୍ୱ|ବିଚିତ୍ର/i, 'evs'],
  [/science|jig?yasa|ଜିଜ୍ଞାସା|ବିଜ୍ଞାନ/i, 'science'],
  [/sanskrit|ସଂସ୍କୃତ|संस्कृत/i, 'sanskrit'],
  [/hindi|ହିନ୍ଦୀ|हिन्दी/i, 'hindi'],
  [/english|pallavi|jasmine|ଇଂରାଜୀ/i, 'english'],
  [/indradhanu|ଇନ୍ଦ୍ରଧନୁ/i, 'indradhanu'],
  [/nabarasa|ନବରସ/i, 'nabarasa'],
  [/sports|ଖେଳ|yoga|ଯୋଗ/i, 'sports'],
  [/art|କଳା/i, 'art'],
  [/kaushal|କୌଶଳ/i, 'kaushal'],
  [/odia|ଓଡ଼ିଆ/i, 'odia'],
]

function subjectKeyFor(product) {
  const direct = product?.unitTest?.subjectKey || product?.packScope?.subjectKey || product?.subjectKey
  if (direct && STYLES[direct]) return direct
  const hay = `${product?.subject || ''} ${product?.titleEnglish || ''} ${product?.titleOdia || ''} ${(product?.tags || []).join(' ')}`
  for (const [rx, k] of SUBJECT_MATCH) if (rx.test(hay)) return k
  return 'other'
}

// ---------- type ribbon (Odia) ----------
const RIBBONS = {
  answer_key: 'ଉତ୍ତର ସୂଚୀ',
  unit_test: 'ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ',
  unit_test_set: 'ଅଧ୍ୟାୟଭିତ୍ତିକ ମୂଲ୍ୟାୟନ',
  question_paper: 'ପ୍ରଶ୍ନପତ୍ର',
  assessment: 'ପ୍ରଶ୍ନପତ୍ର',
  paper: 'ପ୍ରଶ୍ନପତ୍ର',
  worksheet: 'ୱାର୍କସିଟ୍',
  excel: 'Excel ରେଜିଷ୍ଟର',
  html: 'ପାଠ୍ୟ ସାମଗ୍ରୀ',
  pdf: 'ପାଠ୍ୟ ସାମଗ୍ରୀ',
  bundle: 'କମ୍ବୋ ପ୍ୟାକ୍',
  unit_test_pack: 'କମ୍ବୋ ପ୍ୟାକ୍',
}
function ribbonFor(product) {
  if (RIBBONS[product?.type]) return RIBBONS[product.type]
  const files = product?.files || []
  if (files.some(f => f.kind === 'excel')) return RIBBONS.excel
  return RIBBONS.pdf
}

const OD = ['୦', '୧', '୨', '୩', '୪', '୫', '୬', '୭', '୮', '୯']
const od = (n) => String(n ?? '').replace(/\d/g, d => OD[+d])
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// "Jingyasa" → "Jigyasa" display fix.
function fixLabel(s) { return String(s || '').replace(/jin+gyasa/ig, 'Jigyasa') }

function langLabel(language) {
  const l = String(language || '').toLowerCase()
  if (l === 'hindi') return 'हिन्दी'
  if (l === 'sanskrit') return 'संस्कृतम्'
  if (l === 'english') return 'English'
  return 'ଓଡ଼ିଆ'
}

// ---------- motif SVGs (flat, 2-3 colours) ----------
function motifSvg(kind, dark) {
  const mid = dark + '33'
  const soft = dark + '22'
  switch (kind) {
    case 'math':
      return `<g fill="${dark}" font-family="Baloo" font-weight="700">
        <rect x="40" y="40" width="300" height="300" rx="36" fill="${soft}"/>
        <text x="190" y="150" font-size="86" text-anchor="middle">1 2 3</text>
        <text x="190" y="250" font-size="92" text-anchor="middle">+ − ×</text>
        <text x="190" y="330" font-size="70" text-anchor="middle">÷  =</text></g>`
    case 'science':
      return `<g>
        <circle cx="120" cy="110" r="70" fill="${soft}"/>
        <path d="M150 120 l40 120 a60 60 0 1 1 -120 0 l40 -120 z" fill="none" stroke="${dark}" stroke-width="12" stroke-linejoin="round"/>
        <circle cx="150" cy="300" r="10" fill="${dark}"/><circle cx="175" cy="330" r="7" fill="${dark}"/>
        <path d="M250 90 q70 20 70 110 q-70 -10 -70 -110z" fill="${mid}"/>
        <path d="M250 90 q-10 70 0 150" stroke="${dark}" stroke-width="8" fill="none"/></g>`
    case 'evs':
      return `<g>
        <circle cx="300" cy="90" r="46" fill="${mid}"/>
        <rect x="70" y="250" width="260" height="90" rx="16" fill="${soft}"/>
        <path d="M150 250 v-70 a60 60 0 0 1 120 0 v70" fill="${mid}"/>
        <rect x="150" y="120" width="12" height="120" fill="${dark}"/>
        <circle cx="156" cy="110" r="46" fill="${dark}"/></g>`
    case 'odia':
      return letterMotif('ଅ ଆ ଇ', dark)
    case 'english':
      return letterMotif('A B C', dark)
    case 'hindi':
      return `<g font-family="NotoDeva">${letterMotifRaw('अ आ इ', dark)}</g>`
    case 'sanskrit':
      return `<g font-family="NotoDeva">${letterMotifRaw('ॐ', dark, 180)}</g>`
    case 'social':
      return `<g>
        <circle cx="190" cy="190" r="140" fill="${soft}"/>
        <circle cx="190" cy="190" r="140" fill="none" stroke="${dark}" stroke-width="10"/>
        <path d="M70 190 h240 M190 60 q70 130 0 260 M190 60 q-70 130 0 260" stroke="${dark}" stroke-width="7" fill="none"/>
        <path d="M250 120 l40 20 -16 40 -40 -14z" fill="${dark}"/></g>`
    case 'art':
      return `<g>
        <path d="M190 60 a130 130 0 1 0 10 260 c40 0 20 -40 60 -40 a50 50 0 0 0 0 -100 c-40 0 -30 -40 -70 -40z" fill="${soft}" stroke="${dark}" stroke-width="8"/>
        <circle cx="140" cy="140" r="16" fill="${dark}"/><circle cx="200" cy="120" r="16" fill="${mid}"/>
        <circle cx="250" cy="170" r="16" fill="${dark}"/><circle cx="150" cy="210" r="16" fill="${mid}"/></g>`
    case 'rainbow':
      return `<g fill="none" stroke-width="22" stroke-linecap="round">
        <path d="M60 300 a130 130 0 0 1 260 0" stroke="${dark}"/>
        <path d="M95 300 a95 95 0 0 1 190 0" stroke="${mid}"/>
        <path d="M130 300 a60 60 0 0 1 120 0" stroke="${dark}"/>
        <circle cx="70" cy="110" r="26" fill="${mid}" stroke="none"/><circle cx="310" cy="110" r="22" fill="${mid}" stroke="none"/></g>`
    case 'sports':
      return `<g>
        <circle cx="190" cy="190" r="120" fill="${soft}" stroke="${dark}" stroke-width="10"/>
        <path d="M190 90 l34 26 -14 40 h-40 l-14 -40z" fill="${dark}"/>
        <path d="M190 190 l80 24 M190 190 l-80 24 M190 190 v90" stroke="${dark}" stroke-width="8"/></g>`
    case 'kaushal':
      return `<g>
        <circle cx="190" cy="180" r="70" fill="none" stroke="${dark}" stroke-width="22" stroke-dasharray="22 20"/>
        <circle cx="190" cy="180" r="26" fill="${mid}"/>
        <rect x="70" y="300" width="240" height="20" rx="8" fill="${dark}"/>
        <path d="M110 300 q80 -40 160 0" stroke="${mid}" stroke-width="10" fill="none"/></g>`
    default:
      return `<g>
        <rect x="70" y="90" width="240" height="200" rx="14" fill="${soft}"/>
        <path d="M190 100 v190 M80 110 q50 -20 110 -10 M300 110 q-50 -20 -110 -10" stroke="${dark}" stroke-width="8" fill="none"/>
        <rect x="250" y="250" width="110" height="18" rx="9" fill="${dark}" transform="rotate(35 300 260)"/></g>`
  }
}
function letterMotif(txt, dark) { return `<g font-family="Baloo">${letterMotifRaw(txt, dark)}</g>` }
function letterMotifRaw(txt, dark, size = 120) {
  return `<rect x="50" y="70" width="280" height="240" rx="30" fill="${dark}18"/>
    <text x="190" y="235" font-size="${size}" font-weight="700" fill="${dark}" text-anchor="middle">${esc(txt)}</text>`
}

// Subject-style overrides (admin-editable colours/motif), merged over defaults.
let _overrides = {}
export function setStyleOverrides(o) { _overrides = o || {} }

// ---------- spec from a product ----------
function specFor(product, extra = {}) {
  const key = subjectKeyFor(product)
  const st = { ...(STYLES[key] || STYLES.other), ...(_overrides[key] || {}) }
  const cls = String(product?.unitTest?.class || product?.packScope?.class || (product?.classes || [])[0] || '').replace(/\D/g, '')
  const subjectOdia = extra.subjectOdia || st.odia
  const subjectEnglish = fixLabel(extra.subjectEnglish || product?.subject || '')
  const chapter = product?.unitTest?.chapterTitle || ''
  const isPack = product?.type === 'unit_test_pack' || product?.type === 'bundle'
  const facts = []
  if (product?.type === 'unit_test') {
    const ut = product.unitTest || {}
    if (ut.assessmentsCount) facts.push(`${od(ut.assessmentsCount)}ଟି ପରୀକ୍ଷା`)
    if (ut.fullMarks) facts.push(`${od(ut.fullMarks)} ନମ୍ବର`)
    if (ut.pageCount) facts.push(`${od(ut.pageCount)} ପୃଷ୍ଠା`)
    facts.push('PDF'); facts.push(langLabel(product.language))
  } else if (product?.type === 'unit_test_set') {
    const ut = product.unitTest || {}
    facts.push('୧ଟି ପରୀକ୍ଷା')
    facts.push(`${od(ut.fullMarks || 25)} ନମ୍ବର`)
    facts.push('A4 PDF')
    facts.push(langLabel(product.language))
  } else if (!isPack) {
    const f0 = (product?.files || [])[0]
    if (f0?.pages) facts.push(`${od(f0.pages)} ପୃଷ୍ଠା`)
    facts.push((product?.files || []).some(f => f.kind === 'excel') ? 'Excel' : 'PDF')
    facts.push(langLabel(product.language))
  }
  return {
    key, bg: st.bg, dark: st.dark, motif: st.motif,
    cls, subjectOdia, subjectEnglish, chapter,
    ribbon: ribbonFor(product), facts, isPack,
    setNo: product?.type === 'unit_test_set' ? (product?.setNo || null) : null,
    isAnswerKey: product?.type === 'answer_key',
    fan: product?.type === 'unit_test',  // chapter bundle = fan of 5 sheets
    packCount: product?.packMeta?.chapters || product?.packScope?.count || 0,
    packKind: product?.packScope?.kind || (product?.type === 'bundle' ? 'bundle' : ''),
  }
}

function chapterFont(chapter) {
  const n = (chapter || '').length
  if (n > 60) return 22
  if (n > 40) return 26
  if (n > 26) return 30
  return 34
}

// ---------- HTML builders ----------
function baseCss(spec) {
  return `*{margin:0;padding:0;box-sizing:border-box;}
  html,body{font-family:'Baloo','NotoOriya','NotoDeva',sans-serif;}
  .chip{display:inline-block;background:#ffffff;border:1px solid ${spec.dark}22;color:${spec.dark};
    font-family:'NotoOriya','NotoDeva';font-weight:700;border-radius:999px;padding:6px 14px;font-size:20px;margin:4px 6px 0 0;white-space:nowrap;}
  .clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .setcircle{position:absolute;right:-8px;bottom:-4px;width:120px;height:120px;border-radius:50%;background:#f7a01f;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 10px 26px rgba(0,0,0,.22);z-index:30;border:6px solid #fff;}
  .setcircle .l{font-family:'NotoOriya';font-size:22px;font-weight:700;line-height:1;}
  .setcircle .n{font-family:'Baloo';font-size:54px;font-weight:700;line-height:.95;}
  .tickbadge{position:absolute;right:-8px;bottom:-4px;width:112px;height:112px;border-radius:50%;background:#2a9d5c;color:#fff;display:flex;align-items:center;justify-content:center;font-size:64px;line-height:1;box-shadow:0 10px 26px rgba(0,0,0,.22);z-index:30;border:6px solid #fff;}`
}
function badgeHtml(spec) {
  if (spec.setNo) return `<div class="setcircle"><div class="l">ସେଟ୍</div><div class="n">${od(spec.setNo)}</div></div>`
  if (spec.isAnswerKey) return `<div class="tickbadge">&#10003;</div>`
  return ''
}
function sheets(spec, blurDataUri) {
  if (spec.fan) {
    const rots = [-16, -8, 0, 8, 16]
    const fan = rots.map((r, i) => {
      const mid = i === 2
      const img = mid && blurDataUri ? `<img src="${blurDataUri}" style="width:100%;height:100%;object-fit:cover;filter:blur(2px);opacity:.92"/>` : ''
      return `<div class="sheet" style="transform:rotate(${r}deg);left:${50 + (i - 2) * 20}px;top:${34 + Math.abs(i - 2) * 7}px;z-index:${6 - Math.abs(i - 2)};">${img}</div>`
    }).join('')
    return `<div class="sheets">${fan}
      <svg class="motif" viewBox="0 0 380 380" width="230" height="230">${motifSvg(spec.motif, spec.dark)}</svg>
      ${badgeHtml(spec)}</div>`
  }
  const front = blurDataUri
    ? `<div class="sheet front"><img src="${blurDataUri}" style="width:100%;height:100%;object-fit:cover;filter:blur(2px);opacity:.92"/></div>`
    : `<div class="sheet front"></div>`
  return `<div class="sheets">
    <div class="sheet back"></div>
    ${front}
    <svg class="motif" viewBox="0 0 380 380" width="300" height="300">${motifSvg(spec.motif, spec.dark)}</svg>
    ${badgeHtml(spec)}
  </div>`
}

export function buildCardHtml(spec, blurDataUri) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss()}
  ${baseCss(spec)}
  body{width:800px;height:1000px;background:${spec.bg};position:relative;overflow:hidden;}
  .deco{position:absolute;border-radius:50%;background:${spec.dark}14;}
  .d1{width:420px;height:420px;top:-140px;right:-120px;}
  .d2{width:300px;height:300px;bottom:260px;left:-120px;background:${spec.dark}10;}
  .d3{width:160px;height:160px;top:220px;right:60px;background:${spec.dark}0f;}
  .badge{position:absolute;top:40px;left:40px;background:#fff;border-radius:28px;padding:16px 22px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.08);}
  .badge .num{font-family:'Baloo';font-size:70px;font-weight:700;line-height:.9;color:${spec.dark};}
  .badge .lbl{font-family:'NotoOriya';font-size:22px;font-weight:700;color:${spec.dark};}
  .ribbon{position:absolute;top:54px;right:40px;background:#f7b32b;color:#241a5e;font-family:'NotoOriya','NotoDeva';
    font-weight:700;font-size:24px;padding:12px 22px;border-radius:999px;box-shadow:0 8px 20px rgba(0,0,0,.12);max-width:360px;text-align:center;}
  .stage{position:absolute;top:210px;left:0;right:0;height:430px;display:flex;align-items:center;justify-content:center;}
  .sheets{position:relative;width:360px;height:420px;}
  .sheet{position:absolute;width:260px;height:340px;background:#fff;border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,.14);left:50px;top:40px;overflow:hidden;}
  .sheet.back{transform:rotate(-8deg);left:30px;top:50px;background:#ffffffcc;}
  .sheet.front{transform:rotate(5deg);left:70px;top:30px;}
  .motif{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);}
  .panel{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:40px 40px 0 0;padding:40px 44px 30px;box-shadow:0 -10px 30px rgba(0,0,0,.06);}
  .subj{font-family:'Baloo','NotoOriya','NotoDeva';font-size:52px;font-weight:700;color:${spec.dark};line-height:1.05;}
  .subjen{font-family:'NotoOriya';font-size:24px;color:#6b7280;margin-top:2px;}
  .chap{font-family:'NotoOriya','NotoDeva';font-weight:700;color:#111827;margin-top:12px;line-height:1.25;}
  .chips{margin-top:14px;}
  .wm{position:absolute;bottom:16px;right:24px;font-family:'Baloo';font-size:20px;color:${spec.dark};opacity:.65;}
  </style></head><body>
    <div class="deco d1"></div><div class="deco d2"></div><div class="deco d3"></div>
    <div class="badge"><div class="num">${od(spec.cls || '')}</div><div class="lbl">ଶ୍ରେଣୀ</div></div>
    <div class="ribbon">${esc(spec.ribbon)}</div>
    <div class="stage">${sheets(spec, blurDataUri)}</div>
    <div class="panel">
      <div class="subj">${esc(spec.subjectOdia)}</div>
      ${spec.subjectEnglish ? `<div class="subjen">${esc(spec.subjectEnglish)}</div>` : ''}
      ${spec.chapter ? `<div class="chap clamp2" style="font-size:${chapterFont(spec.chapter)}px">${esc(spec.chapter)}</div>` : ''}
      <div class="chips">${spec.facts.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>
      <div class="wm">LessonGuru Odisha</div>
    </div>
  </body></html>`
}

export function buildPackCardHtml(spec) {
  const dark = '#241a5e'
  const miniKeys = ['math', 'science', 'odia', 'english', 'social']
  const minis = miniKeys.map((k, i) => {
    const s = STYLES[k]
    const rot = [-14, -7, 0, 7, 14][i]
    return `<div class="mini" style="background:${s.bg};transform:rotate(${rot}deg) translateX(${(i - 2) * 70}px);z-index:${10 - Math.abs(i - 2)}">
      <svg viewBox="0 0 380 380" width="120" height="120">${motifSvg(s.motif, s.dark)}</svg></div>`
  }).join('')
  const label = spec.packKind === 'class'
    ? `ସମ୍ପୂର୍ଣ୍ଣ ଶ୍ରେଣୀ ${od(spec.cls)}`
    : (spec.packCount ? `${od(spec.packCount)} ଟି ଅଧ୍ୟାୟ` : 'କମ୍ବୋ ପ୍ୟାକ୍')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss()}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{width:800px;height:1000px;background:${dark};position:relative;overflow:hidden;font-family:'Baloo','NotoOriya';}
  .deco{position:absolute;border-radius:50%;background:#ffffff12;}
  .d1{width:460px;height:460px;top:-160px;right:-140px;}.d2{width:320px;height:320px;bottom:200px;left:-140px;}
  .ribbon{position:absolute;top:54px;left:50%;transform:translateX(-50%);background:#f7b32b;color:#241a5e;
    font-family:'NotoOriya';font-weight:700;font-size:30px;padding:14px 34px;border-radius:999px;}
  .badge{position:absolute;top:46px;left:40px;background:#fff;border-radius:24px;padding:12px 20px;text-align:center;}
  .badge .num{font-family:'Baloo';font-size:56px;font-weight:700;color:${dark};line-height:.9;}
  .badge .lbl{font-family:'NotoOriya';font-size:18px;font-weight:700;color:${dark};}
  .fan{position:absolute;top:320px;left:0;right:0;display:flex;align-items:center;justify-content:center;height:220px;}
  .mini{width:150px;height:190px;border-radius:16px;box-shadow:0 16px 36px rgba(0,0,0,.4);position:absolute;
    display:flex;align-items:center;justify-content:center;}
  .panel{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:40px 40px 0 0;padding:40px 44px 30px;text-align:center;}
  .subj{font-family:'Baloo','NotoOriya';font-size:50px;font-weight:700;color:${dark};}
  .cnt{font-family:'NotoOriya';font-size:30px;font-weight:700;color:#e8452c;margin-top:6px;}
  .wm{font-family:'Baloo';font-size:20px;color:${dark};opacity:.6;margin-top:10px;}
  </style></head><body>
    <div class="deco d1"></div><div class="deco d2"></div>
    ${spec.cls ? `<div class="badge"><div class="num">${od(spec.cls)}</div><div class="lbl">ଶ୍ରେଣୀ</div></div>` : ''}
    <div class="ribbon">କମ୍ବୋ ପ୍ୟାକ୍</div>
    <div class="fan">${minis}</div>
    <div class="panel"><div class="subj">${esc(spec.subjectOdia)}</div><div class="cnt">${esc(label)}</div>
      <div class="wm">LessonGuru Odisha</div></div>
  </body></html>`
}

export function buildOgHtml(spec, blurDataUri, priceLabel) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaceCss()}
  ${baseCss(spec)}
  body{width:1200px;height:630px;background:${spec.bg};position:relative;overflow:hidden;display:flex;}
  .deco{position:absolute;border-radius:50%;background:${spec.dark}14;}
  .d1{width:360px;height:360px;top:-120px;right:260px;}.d2{width:280px;height:280px;bottom:-120px;right:-60px;background:${spec.dark}10;}
  .left{width:680px;padding:60px;display:flex;flex-direction:column;justify-content:center;z-index:2;}
  .top{display:flex;gap:14px;align-items:center;margin-bottom:18px;}
  .badge{background:#fff;border-radius:20px;padding:10px 18px;text-align:center;font-family:'Baloo';color:${spec.dark};}
  .badge b{font-size:40px;}.badge span{font-family:'NotoOriya';font-size:16px;font-weight:700;display:block;}
  .ribbon{background:#f7b32b;color:#241a5e;font-family:'NotoOriya','NotoDeva';font-weight:700;font-size:22px;padding:10px 18px;border-radius:999px;}
  .subj{font-family:'Baloo','NotoOriya','NotoDeva';font-size:62px;font-weight:700;color:${spec.dark};line-height:1.02;}
  .subjen{font-family:'NotoOriya';font-size:24px;color:#6b7280;margin-top:4px;}
  .chap{font-family:'NotoOriya','NotoDeva';font-weight:700;color:#111827;margin-top:14px;font-size:28px;line-height:1.25;}
  .chips{margin-top:16px;}
  .price{margin-top:20px;font-family:'Baloo';font-size:40px;font-weight:700;color:#e8452c;}
  .right{position:absolute;right:60px;top:0;bottom:0;width:440px;display:flex;align-items:center;justify-content:center;}
  .sheets{position:relative;width:360px;height:420px;}
  .sheet{position:absolute;width:250px;height:330px;background:#fff;border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,.18);left:50px;top:40px;overflow:hidden;}
  .sheet.back{transform:rotate(-8deg);left:30px;top:50px;}.sheet.front{transform:rotate(6deg);left:70px;top:30px;}
  .motif{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
  .wm{position:absolute;bottom:26px;left:60px;font-family:'Baloo';font-size:24px;color:${spec.dark};opacity:.7;}
  </style></head><body>
    <div class="deco d1"></div><div class="deco d2"></div>
    <div class="left">
      <div class="top"><div class="badge"><b>${od(spec.cls || '')}</b><span>ଶ୍ରେଣୀ</span></div><div class="ribbon">${esc(spec.ribbon)}</div></div>
      <div class="subj">${esc(spec.subjectOdia)}</div>
      ${spec.subjectEnglish ? `<div class="subjen">${esc(spec.subjectEnglish)}</div>` : ''}
      ${spec.chapter ? `<div class="chap clamp2">${esc(spec.chapter)}</div>` : ''}
      <div class="chips">${spec.facts.slice(0, 4).map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>
      ${priceLabel ? `<div class="price">${esc(priceLabel)}</div>` : ''}
    </div>
    <div class="right">${sheets(spec, blurDataUri)}</div>
    <div class="wm">LessonGuru Odisha</div>
  </body></html>`
}

// ---------- blurred preview → data URI (best effort; existing blurred only) ----------
async function blurDataUriFor(product) {
  try {
    const ref = (product?.previewRefs || [])[0]
    if (!ref) return null
    const bytes = await fetchPreviewBytes(ref)
    if (!bytes) return null
    return `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`
  } catch { return null }
}

function coverHash(product, spec) {
  const h = crypto.createHash('sha1')
  h.update(JSON.stringify({
    v: COVER_STYLE_VERSION, id: product.id, type: product.type,
    to: product.titleOdia, te: product.titleEnglish,
    cls: spec.cls, key: spec.key, chap: spec.chapter, set: spec.setNo || null, fan: !!spec.fan,
    prev: (product.previewRefs || [])[0]?.publicId || null,
    custom: !!product.coverCustomUrl,
  }))
  return h.digest('hex').slice(0, 16)
}

/**
 * Generate + store a product cover. Never throws.
 * @returns cover object { url, thumbUrl, ogUrl, publicId, ogPublicId, hash, source, generatedAt } or null.
 */
export async function generateProductCover(db, product, opts = {}) {
  try {
    if (!product) return null
    const spec = specFor(product, opts)
    const hash = coverHash(product, spec)
    if (!opts.force && product.cover?.hash === hash && product.cover?.source === 'auto' && product.cover?.url) {
      return product.cover // cached, unchanged
    }
    const blur = spec.isPack ? null : await blurDataUriFor(product)
    const priceLabel = opts.priceLabel || null

    const ogHtml = buildOgHtml(spec, blur, priceLabel)
    // OG image MUST be a JPG for reliable WhatsApp/Facebook previews (WebP OG
    // is unreliable). Render the branded 1200x630 card as PNG, then store a
    // 1200x630 JPG (q85) in the PUBLIC R2 bucket. Fall back to the legacy
    // Cloudinary webp only if the R2 write fails.
    const ogBuf = await htmlToImageBuffer(ogHtml, { width: 1200, height: 630, type: 'png' })
    let ogUrl = null, ogPublicId = null, ogFormat = null
    try {
      const { uploadOgImageR2 } = await import('@/lib/media.js')
      const ogR2 = await uploadOgImageR2({ buffer: ogBuf, publicId: `store-cover-og-${product.id}` })
      ogUrl = ogR2.url; ogPublicId = ogR2.publicId; ogFormat = 'jpg'
    } catch (ogErr) {
      console.warn('[cover] OG JPG→R2 failed, using Cloudinary webp fallback:', ogErr?.message)
      const ogUp = await uploadCoverImage({ buffer: ogBuf, publicId: `store-cover-og-${product.id}`, tags: [spec.key, 'og'], og: true })
      ogUrl = ogUp.url; ogPublicId = ogUp.publicId; ogFormat = 'webp'
    }

    // OG-only backfill: keep the existing card cover, just refresh OG fields.
    if (opts.ogOnly && product.cover?.url) {
      const patch = { 'cover.ogUrl': ogUrl, 'cover.ogPublicId': ogPublicId, 'cover.ogFormat': ogFormat, 'cover.ogAt': new Date(), updatedAt: new Date() }
      if (db) await db.collection(STORE_COLL.products).updateOne({ id: product.id }, { $set: patch })
      return { ...(product.cover || {}), ogUrl, ogPublicId, ogFormat }
    }

    const cardHtml = spec.isPack ? buildPackCardHtml(spec) : buildCardHtml(spec, blur)
    const cardBuf = await htmlToImageBuffer(cardHtml, { width: 800, height: 1000, type: 'webp', quality: 80 })
    const up = await uploadCoverImage({ buffer: cardBuf, publicId: `store-cover-${product.id}`, tags: [spec.key, product.type] })

    const cover = {
      url: up.url, thumbUrl: up.thumbUrl, publicId: up.publicId,
      ogUrl, ogPublicId, ogFormat,
      hash, source: 'auto', styleVersion: COVER_STYLE_VERSION,
      subjectKey: spec.key, generatedAt: new Date(),
    }
    if (db) await db.collection(STORE_COLL.products).updateOne({ id: product.id }, { $set: { cover, updatedAt: new Date() } })
    return cover
  } catch (e) {
    console.error('[cover] generate failed for', product?.id, e?.message)
    try { if (db) await db.collection(STORE_COLL.products).updateOne({ id: product.id }, { $set: { 'cover.lastError': String(e?.message || e), 'cover.lastErrorAt': new Date() } }) } catch (_) {}
    return null
  }
}

// Expose helpers for admin "subject style" settings + previews.
export const COVER_SUBJECT_KEYS = Object.keys(STYLES)
export function subjectStyle(key) { return STYLES[key] || STYLES.other }
export { specFor as _specFor, subjectKeyFor as _subjectKeyFor }
