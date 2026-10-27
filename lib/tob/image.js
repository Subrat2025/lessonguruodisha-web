// === TOB === Teacher Observation — server-rendered PNG images (headless
// chromium): the OG link-preview card and the "share as image" STUDENT copy
// (no answers, no teacher notes). Reuses the same chromium the PDF pipeline
// uses. Builders take the detail payload from lib/tob/detail.js.
import { promises as fs } from 'fs'
import { TOB_PAPER_CSS } from '@/lib/tob/paper-css.js'

const OD = '୦୧୨୩୪୫୬୭୮୯'
export const odia = (n) => String(n == null ? '' : n).replace(/[0-9]/g, d => OD[+d])
const esc = (s) => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
// keep trusted admin markup but drop scripts / inline handlers
const sanitize = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/ on\w+="[^"]*"/gi, '').replace(/ on\w+='[^']*'/gi, '')

const C = { indigo: '#241a5e', saffron: '#f7b32b', coral: '#c93a22', sky: '#1577a8', green: '#1f7a46', ground: '#f5f3fb' }
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaina+2:wght@600;700;800&family=Noto+Sans+Oriya:wght@400;500;600;700&display=swap" rel="stylesheet">`

function scopeLabel(d) {
  const cls = `ଶ୍ରେଣୀ ${odia(d.class)}`
  const subj = d.subject_printed || d.subject_id
  const where = d.type === 'set' ? `ସେଟ୍ ${d.setCode} · ଟର୍ମ ${odia(d.term)}` : `ଅଧ୍ୟାୟ ${odia(d.chapterNo)} ${esc(d.chapterTitle || '')}`
  return `${cls} · ${subj} · ${where}`
}

async function resolveChromium() {
  const cands = ['/root/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome']
  for (const p of cands) { try { await fs.access(p); return p } catch (_) {} }
  return undefined
}

export async function htmlToPng(html, { width = 1080, height = null, deviceScaleFactor = 2 } = {}) {
  const puppeteer = (await import('puppeteer')).default
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (await resolveChromium())
  const browser = await puppeteer.launch({ headless: 'new', executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height: height || 800, deviceScaleFactor })
    page.setDefaultTimeout(60000)
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 })
    try { await Promise.race([page.evaluate(() => document.fonts && document.fonts.ready), new Promise(r => setTimeout(r, 5000))]) } catch (_) {}
    const clip = height ? { x: 0, y: 0, width, height } : undefined
    const png = await page.screenshot({ type: 'png', fullPage: !height, clip })
    return Buffer.from(png)
  } finally { try { await browser.close() } catch (_) {} }
}

// 1200x630 WhatsApp / OG link-preview card.
export function ogImageHtml(d) {
  const isProject = d.part === 'B'
  const accent = isProject ? C.green : C.sky
  const badge = isProject ? `ପ୍ରକଳ୍ପ ${odia(d.pos)}` : `କାର୍ଯ୍ୟ ${odia(d.pos)}`
  const marks = d.marks?.none ? '' : `${odia(isProject ? d.marks.project : d.marks.task)} ମାର୍କ`
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
    *{margin:0;box-sizing:border-box}
    body{width:1200px;height:630px;font-family:'Noto Sans Oriya','Baloo Bhaina 2',sans-serif;
      background:linear-gradient(135deg,${C.indigo},#3b2a8c);color:#fff;padding:60px 70px;display:flex;flex-direction:column;justify-content:space-between}
    .top{display:flex;align-items:center;gap:26px}
    .num{width:150px;height:150px;border-radius:34px;background:${accent};display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.25)}
    .num .l{font-size:22px;opacity:.9}.num .n{font-family:'Baloo Bhaina 2';font-size:84px;font-weight:800;line-height:1}
    .scope{font-size:30px;opacity:.9;font-weight:600}
    .title{font-family:'Baloo Bhaina 2';font-size:66px;font-weight:800;line-height:1.1;margin-top:18px;max-height:230px;overflow:hidden}
    .chips{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
    .chip{background:rgba(255,255,255,.16);border-radius:999px;padding:10px 24px;font-size:26px;font-weight:700}
    .chip.m{background:${C.saffron};color:${C.indigo}}
    .foot{display:flex;justify-content:space-between;align-items:center;font-size:26px;opacity:.95}
    .brand{font-family:'Baloo Bhaina 2';font-weight:800}
  </style></head><body>
    <div class="top"><div class="num"><div class="l">${isProject ? 'ପ୍ରକଳ୍ପ' : 'କାର୍ଯ୍ୟ'}</div><div class="n">${odia(d.pos)}</div></div>
      <div><div class="scope">${esc(scopeLabel(d))}</div><div class="title">${esc(d.title)}</div></div></div>
    <div>
      <div class="chips">${d.kind ? `<span class="chip">${esc(d.kind.split('—')[0].trim())}</span>` : ''}${d.cognitive?.text ? `<span class="chip">${esc(d.cognitive.text)}</span>` : ''}${marks ? `<span class="chip m">${marks}</span>` : ''}</div>
      <div class="foot" style="margin-top:30px"><span class="brand">LessonGuru Odisha</span><span>ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ୨୫ ମାର୍କ · SCERT 2026-27</span></div>
    </div>
  </body></html>`
}

// STUDENT share image — the task/project prompt only, NO answers, NO teacher notes.
export function studentShareHtml(d, { teacherName = '', school = '' } = {}) {
  const isProject = d.part === 'B'
  const accent = isProject ? C.green : C.sky
  const badge = isProject ? `ପ୍ରକଳ୍ପ ${odia(d.pos)}` : `କାର୍ଯ୍ୟ ${odia(d.pos)}`
  const b = d.blocks || {}
  // student-safe blocks only
  const sections = []
  if (!isProject) {
    if (b.task) sections.push({ h: b.task.heading || 'ଲିଖିତ କାର୍ଯ୍ୟ', html: b.task.html })
  } else {
    if (b.objective) sections.push({ h: 'ଉଦ୍ଦେଶ୍ୟ', html: b.objective.html })
    if (b.materials) sections.push({ h: 'ସାମଗ୍ରୀ', html: b.materials.html })
    if (b.process) sections.push({ h: 'ପ୍ରଣାଳୀ', html: b.process.html })
    if (b.oral) sections.push({ h: 'ମୌଖିକ ପ୍ରଶ୍ନ', html: b.oral.html })
  }
  const los = (d.los || []).map(l => `<span class="locode">${esc(l.lo_code)}</span>`).join('')
  const body = sections.map(s => `<div class="sec"><div class="sh" style="color:${accent}">${esc(s.h)}</div><div class="tp">${sanitize(s.html)}</div></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
    *{margin:0;box-sizing:border-box}
    body{width:1080px;font-family:'Noto Sans Oriya','Baloo Bhaina 2',sans-serif;background:${C.ground};padding:40px}
    .card{background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 12px 40px rgba(36,26,94,.14)}
    .hero{background:linear-gradient(135deg,${accent},${C.indigo});color:#fff;padding:34px 40px;display:flex;gap:26px;align-items:center}
    .num{width:108px;height:108px;border-radius:26px;background:rgba(255,255,255,.2);border:3px solid rgba(255,255,255,.5);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none}
    .num .l{font-size:17px;opacity:.9}.num .n{font-family:'Baloo Bhaina 2';font-size:52px;font-weight:800;line-height:1}
    .scope{font-size:22px;opacity:.92}
    .title{font-family:'Baloo Bhaina 2';font-size:40px;font-weight:800;line-height:1.15;margin-top:4px}
    .kind{font-size:22px;opacity:.9;margin-top:6px}
    .locos{padding:18px 40px 0;display:flex;gap:10px;flex-wrap:wrap}
    .locode{background:#eceafc;color:${C.indigo};border-radius:8px;padding:5px 14px;font-weight:700;font-size:20px}
    .body{padding:22px 40px 30px}
    .sec{margin-top:18px}
    .sh{font-family:'Baloo Bhaina 2';font-size:28px;font-weight:800;margin-bottom:8px}
    .tp{font-size:22px;line-height:1.5}
    ${TOB_PAPER_CSS}
    .tp h4{display:none}
    .foot{display:flex;justify-content:space-between;align-items:center;padding:22px 40px;border-top:2px dashed #e5e0f0;color:${C.indigo};font-weight:700;font-size:22px;gap:14px}
    .brand{font-family:'Baloo Bhaina 2';font-weight:800;font-size:24px;flex:none}
    .school{font-family:'Baloo Bhaina 2';font-weight:800;font-size:30px;color:${C.coral};text-align:center;flex:1}
    .tn{color:#8a93a8;font-weight:600;font-size:18px;flex:none}
  </style></head><body>
    <div class="card">
      <div class="hero"><div class="num"><div class="l">${isProject ? 'ପ୍ରକଳ୍ପ' : 'କାର୍ଯ୍ୟ'}</div><div class="n">${odia(d.pos)}</div></div>
        <div><div class="scope">${esc(scopeLabel(d))}</div><div class="title">${esc(d.title)}</div>${d.kind ? `<div class="kind">${esc(d.kind)}</div>` : ''}</div></div>
      ${los ? `<div class="locos">${los}</div>` : ''}
      <div class="body">${body || '<div class="tp">—</div>'}</div>
      <div class="foot"><span class="brand">LessonGuruOdisha.com</span>${school ? `<span class="school">${esc(school)}</span>` : ''}<span class="tn">${teacherName ? esc(teacherName) : ''}</span></div>
    </div>
  </body></html>`
}

// Single-task / single-project printable PDF HTML (student or teacher copy).
export function taskPdfHtml(d, { answers = false, teacherName = '' } = {}) {
  const isProject = d.part === 'B'
  const accent = isProject ? C.green : C.sky
  const b = d.blocks || {}
  const order = isProject
    ? ['objective', 'materials', 'process', 'roles', 'oral']
    : ['instructions', 'task']
  const sections = []
  for (const k of order) { if (b[k] && (k !== 'instructions' || answers)) sections.push({ h: b[k].heading, html: b[k].html }) }
  if (answers && !isProject && b.answer) sections.push({ h: b.answer.heading || 'ଉତ୍ତର', html: b.answer.html, ans: true })
  if (answers && b.checklist) sections.push({ h: b.checklist.heading, html: b.checklist.html })
  const los = (d.los || []).map(l => `<span class="locode">${esc(l.lo_code)}</span>`).join('')
  const marks = d.marks?.none ? '' : `${odia(isProject ? d.marks.project : d.marks.task)} ମାର୍କ`
  const body = sections.map(s => `<div class="sec"><div class="sh" style="color:${s.ans ? C.green : accent}">${esc(s.h)}</div><div class="tp">${sanitize(s.html)}</div></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
    @page{size:A4;margin:12mm}
    *{box-sizing:border-box}
    body{font-family:'Noto Sans Oriya','Baloo Bhaina 2',sans-serif;color:#1f2937;font-size:13px;margin:0}
    .hero{background:linear-gradient(135deg,${accent},${C.indigo});color:#fff;padding:14px 18px;border-radius:14px;display:flex;gap:14px;align-items:center}
    .num{width:52px;height:52px;border-radius:12px;background:rgba(255,255,255,.2);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;font-family:'Baloo Bhaina 2';font-weight:800}
    .num .n{font-size:26px;line-height:1}.num .l{font-size:10px;opacity:.9}
    .title{font-family:'Baloo Bhaina 2';font-size:22px;font-weight:800;line-height:1.15}
    .scope{font-size:12px;opacity:.9}
    .chips{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap}
    .chip{background:#eceafc;color:${C.indigo};border-radius:999px;padding:3px 12px;font-weight:700;font-size:12px}
    .chip.m{background:${C.saffron}}
    .locode{background:#eceafc;color:${C.indigo};border-radius:6px;padding:2px 9px;font-weight:700;font-size:12px}
    .locos{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
    .sec{margin-top:14px}.sh{font-family:'Baloo Bhaina 2';font-size:16px;font-weight:800;margin-bottom:5px}
    .tp{font-size:13px;line-height:1.5}
    ${TOB_PAPER_CSS}
    .foot{margin-top:20px;border-top:1.5px dashed #e5e0f0;padding-top:8px;color:${C.indigo};font-weight:700;font-size:12px;display:flex;justify-content:space-between}
  </style></head><body>
    <div class="hero"><div class="num"><div class="l">${isProject ? 'ପ୍ରକଳ୍ପ' : 'କାର୍ଯ୍ୟ'}</div><div class="n">${odia(d.pos)}</div></div>
      <div><div class="scope">${esc(scopeLabel(d))}</div><div class="title">${esc(d.title)}</div>
        <div class="chips">${d.kind ? `<span class="chip">${esc(d.kind)}</span>` : ''}${d.cognitive?.text ? `<span class="chip">${esc(d.cognitive.text)}</span>` : ''}${marks ? `<span class="chip m">${marks}</span>` : ''}</div></div></div>
    ${los ? `<div class="locos">${los}</div>` : ''}
    ${body}
    ${!isProject ? `<div class="sec"><div class="sh" style="color:${accent}">ପ୍ରାପ୍ତ ମାର୍କ</div><div class="tp">______ / ${odia(d.marks?.task || 10)}</div></div>` : `<div class="sec"><div class="sh" style="color:${accent}">ପ୍ରାପ୍ତ ମାର୍କ</div><div class="tp">______ / ${odia(d.marks?.project || 15)}</div></div>`}
    <div class="foot"><span>LessonGuruOdisha.com · ${answers ? 'ଶିକ୍ଷକ କପି' : 'ଶିକ୍ଷାର୍ଥୀ କପି'}</span><span>${teacherName ? esc(teacherName) : ''}</span></div>
  </body></html>`
}
