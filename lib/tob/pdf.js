// === TOB === Records Register (R1–R7) PDF — printable per-student copy.
// Renders the stored register HTML via Chromium, optionally stamps a student
// name header, then applies the per-teacher watermark + encryption.
import { fetchAnyBytes } from '@/lib/store/storage.js'
import { configureCloudinary } from '@/lib/cloudinary.js'
import { renderHtmlToPdf } from '@/lib/lesson-plan-security.js'
import { stampForUser } from '@/lib/abp/pdf.js'

function prep(html, { student = '' } = {}) {
  let out = html.replace(/<\/head>/i, `<style>.toolbar{display:none!important}
    .tob-stub{background:#241a5e;color:#fff;padding:6px 14px;border-radius:10px;margin:0 0 10px;font-weight:700;font-size:13px;display:flex;justify-content:space-between;gap:12px}
  </style></head>`)
  if (student) {
    const banner = `<div class="tob-stub"><span>ଛାତ୍ର/ଛାତ୍ରୀ (Student): ${escapeHtml(student)}</span><span>Records Register · R1–R7</span></div>`
    out = out.replace(/(<body[^>]*>)/i, `$1${banner}`)
  }
  return out
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }

export async function buildRegisterPdf(register, user, { student = '' } = {}) {
  if (!register?.htmlRef) throw new Error('No source file stored for this register')
  configureCloudinary()
  const bytes = await fetchAnyBytes(register.htmlRef)
  const html = prep(Buffer.from(bytes).toString('utf-8'), { student })
  const base = await renderHtmlToPdf(html, { orientation: 'landscape', margin: '6mm' })
  return stampForUser(base, user, { title: 'Records Register' })
}

// One combined PDF with a full register per student (each on its own pages).
// Renders ONCE (register body repeated with page-breaks) so it stays fast.
export async function buildBulkRegisterPdf(register, user, { students = [] } = {}) {
  if (!register?.htmlRef) throw new Error('No source file stored for this register')
  const names = students.map(s => String(s || '').trim()).filter(Boolean).slice(0, 60)
  if (!names.length) throw new Error('No student names provided')
  configureCloudinary()
  const raw = Buffer.from(await fetchAnyBytes(register.htmlRef)).toString('utf-8')
  const head = (raw.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [, ''])[1]
  const bodyInner = (raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, raw])[1]
  const sections = names.map((n, i) => `<section style="${i ? 'page-break-before:always;' : ''}">
      <div class="tob-stub"><span>ଛାତ୍ର/ଛାତ୍ରୀ (Student): ${escapeHtml(n)}</span><span>Records Register · R1–R7</span></div>
      ${bodyInner}</section>`).join('\n')
  const html = `<!doctype html><html><head>${head}<style>.toolbar{display:none!important}
    .tob-stub{background:#241a5e;color:#fff;padding:6px 14px;border-radius:10px;margin:0 0 10px;font-weight:700;font-size:13px;display:flex;justify-content:space-between;gap:12px}</style></head><body>${sections}</body></html>`
  const base = await renderHtmlToPdf(html, { orientation: 'landscape', margin: '6mm' })
  return stampForUser(base, user, { title: 'Records Register (bulk)' })
}

// Printable term coverage report — the 20 LOs with task/project counts.
export async function buildCoveragePdf(user, { cls, subjectPrinted, subject, term, los = [], counts = {} }) {
  const OD = '୦୧୨୩୪୫୬୭୮୯'
  const od = (n) => String(n == null ? '' : n).replace(/[0-9]/g, d => OD[+d])
  const norm = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim()
  const covered = los.filter(l => (counts[norm(l.lo_code)]?.total || 0) > 0).length
  const rows = los.map(l => {
    const c = counts[norm(l.lo_code)] || { task: 0, project: 0, total: 0 }
    const dot = c.total ? (c.task && c.project ? '#241a5e' : c.project ? '#1f7a46' : '#1fa2d9') : '#e5e0f0'
    return `<tr>
      <td style="white-space:nowrap"><b>${escapeHtml(l.lo_code)}</b></td>
      <td>${escapeHtml(l.lo_text || '')}</td>
      <td style="text-align:center">${escapeHtml(l.cg || '')}</td>
      <td style="text-align:center">${c.task ? od(c.task) : '–'}</td>
      <td style="text-align:center">${c.project ? od(c.project) : '–'}</td>
      <td style="text-align:center"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${dot}"></span></td>
    </tr>`
  }).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaina+2:wght@600;700;800&family=Noto+Sans+Oriya:wght@400;600;700&display=swap" rel="stylesheet">
    <style>@page{size:A4 landscape;margin:12mm}
    body{font-family:'Noto Sans Oriya','Baloo Bhaina 2',sans-serif;color:#1f2937;font-size:12px}
    h1{color:#241a5e;font-family:'Baloo Bhaina 2';font-size:20px;margin:0 0 2px}
    .sub{color:#6b7280;margin:0 0 10px}
    .kpi{display:inline-block;background:#eceafc;color:#241a5e;font-weight:700;border-radius:8px;padding:4px 12px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #e5e7eb;padding:5px 7px;vertical-align:top}
    th{background:#241a5e;color:#fff;font-size:11px}
    .legend{margin-top:8px;color:#6b7280;font-size:10px}</style></head>
    <body>
    <h1>ବାର୍ଷିକ LO ଆବୃତି ରିପୋର୍ଟ · Term Coverage Report</h1>
    <p class="sub">ଶ୍ରେଣୀ ${od(cls)} · ${escapeHtml(subjectPrinted || subject)} · ଟର୍ମ ${od(term)}</p>
    <div class="kpi">${od(los.length)}ଟି LO ମଧ୍ୟରୁ ${od(covered)}ଟି ଆବୃତ</div>
    <table><thead><tr><th>LO Code</th><th>ଶିକ୍ଷଣ ଫଳାଫଳ (LO)</th><th>CG</th><th>କାର୍ଯ୍ୟ</th><th>ପ୍ରକଳ୍ପ</th><th>ସ୍ଥିତି</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="legend">● ନୀଳ = କାର୍ଯ୍ୟ · ● ସବୁଜ = ପ୍ରକଳ୍ପ · ● ଇଣ୍ଡିଗୋ = ଉଭୟ · ● ଧୂସର = ବାକି</div>
    </body></html>`
  const base = await renderHtmlToPdf(html, { orientation: 'landscape', margin: '10mm' })
  return stampForUser(base, user, { title: 'Coverage Report' })
}
