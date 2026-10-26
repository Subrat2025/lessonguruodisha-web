// ============================================================================
//  Chapterwise Learning-Outcome export (read-only)
//
//  Pulls every academicResources doc of type `chapter_wise_lo`, groups them by
//  CLASS, and emits ONE self-contained HTML file per class (all chapters
//  inside) plus an index.html, packaged as a ZIP.
//
//  The uploaded htmlContent is a `.pcm-root` fragment with no embedded CSS, so
//  we inline the same "Period Code Map" stylesheet the in-app viewer uses
//  (components/ResourceLibraryView.jsx) + web fonts, so each file renders
//  identically when opened standalone. 100% read-only — never writes to Mongo.
// ============================================================================
import JSZip from 'jszip'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// --- class label -> sortable number + safe file name -----------------------
const OD = '୦୧୨୩୪୫୬୭୮୯'
function classInfo(className) {
  const s = String(className || '').trim()
  let num = null
  const m = s.match(/(\d{1,2})/)
  if (m) num = parseInt(m[1], 10)
  if (num == null) {
    const ord = [['ପ୍ରଥମ', 1], ['ଦ୍ୱିତୀୟ', 2], ['ତୃତୀୟ', 3], ['ଚତୁର୍ଥ', 4], ['ପଞ୍ଚମ', 5], ['ଷଷ୍ଠ', 6], ['ସପ୍ତମ', 7], ['ଅଷ୍ଟମ', 8], ['ନବମ', 9], ['ଦଶମ', 10],
      ['first', 1], ['second', 2], ['third', 3], ['fourth', 4], ['fifth', 5], ['sixth', 6], ['seventh', 7], ['eighth', 8], ['ninth', 9], ['tenth', 10]]
    for (const [w, n] of ord) { if (s.toLowerCase().includes(String(w).toLowerCase())) { num = n; break } }
  }
  if (num == null) { for (let i = 1; i < OD.length; i++) { if (s.includes(OD[i])) { num = i; break } } }
  const isBV = /balvatika|\bbv\b|ବାଳବାଟିକା|ବାଳ/i.test(s)
  if (isBV && num == null) return { order: 0, key: 'BV', label: 'Balvatika', file: 'Balvatika' }
  if (num != null) return { order: num, key: 'n' + num, label: 'Class ' + num, file: 'Class-' + num }
  const slug = s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Unknown'
  return { order: 999, key: 'x' + slug, label: s || 'Unknown', file: slug }
}

// --- inlined .pcm-root stylesheet (mirrors ResourceLibraryView.jsx) ---------
const PCM_CSS = `
.pcm-root{--ink:#12203A;--soft:#5C688A;--line:#DCE2EE;--hair:#F0F3F8;--cg:#1A3EA8;--cgb:#E9EEFD;--cgl:#C3D1F7;--c:#07775A;--cb:#E1F5EF;--cl:#B2E0D1;--lo:#B85C00;--lob:#FDF0DD;--lol:#F2D5A6;--ll:#8A1F9E;--llb:#F8E9FB;--lll:#E6C2ED;color:var(--ink)}
.pcm-root *{max-width:100%;box-sizing:border-box}
.pcm-root .sheet{max-width:1240px;margin:0 auto;background:#fff}
.pcm-root header{background:linear-gradient(115deg,#1A3EA8 0%,#5B2BC4 45%,#07775A 100%);color:#fff;padding:24px 22px;border-radius:12px}
.pcm-root header *{color:#fff}
.pcm-root .kick{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:#C8D5FF;font-weight:600}
.pcm-root h1{font-size:23px;margin:6px 0 0;font-weight:800;line-height:1.25;border:none}
.pcm-root h1 small{display:block;font-size:13px;font-weight:500;color:#CBD7F5;margin-top:6px}
.pcm-root .chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}
.pcm-root .chip{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:4px 13px;font-size:12px;font-weight:600}
.pcm-root .chip.hi{background:#FFD24A;border-color:#FFD24A;color:#3A2A00}
.pcm-root .wrap{padding:0 20px}
.pcm-root h2{font-size:17px;margin:26px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--ink);color:var(--ink)}
.pcm-root .note{background:#F6F8FC;border-left:4px solid var(--cg);padding:12px 16px;font-size:13px;color:#33405E;margin:14px 0;border-radius:0 4px 4px 0}
.pcm-root .key{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 6px}
.pcm-root .kb{flex:1 1 210px;border:1px solid;border-radius:6px;overflow:hidden}
.pcm-root .kb .t{padding:7px 12px;color:#fff;font-size:12px;font-weight:700}
.pcm-root .kb .d{padding:8px 12px;font-size:12.3px}
.pcm-root .kb.cg{border-color:var(--cgl);background:var(--cgb)}.pcm-root .kb.cg .t{background:var(--cg)}
.pcm-root .kb.c{border-color:var(--cl);background:var(--cb)}.pcm-root .kb.c .t{background:var(--c)}
.pcm-root .kb.lo{border-color:var(--lol);background:var(--lob)}.pcm-root .kb.lo .t{background:var(--lo)}
.pcm-root .kb.ll{border-color:var(--lll);background:var(--llb)}.pcm-root .kb.ll .t{background:var(--ll)}
.pcm-root .tw{border:1px solid var(--line);border-radius:8px;overflow-x:auto;margin-top:8px}
.pcm-root table{width:100%;border-collapse:collapse;margin:0}
.pcm-root thead th{background:var(--ink);color:#fff;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;padding:9px 12px;text-align:left}
.pcm-root td{padding:7px 12px;border-bottom:1px solid var(--hair);vertical-align:top;text-align:left}
.pcm-root tr.th td{color:#fff;font-size:15px;font-weight:700;padding:10px 14px;border:none;background:#2A3A63}
.pcm-root td.pn{font-size:14px;font-weight:700;color:var(--soft);text-align:center;white-space:nowrap}
.pcm-root .lname{font-size:14px;font-weight:700;margin-right:10px}
.pcm-root .lm{font-size:11.6px;color:var(--soft);margin-right:10px}
.pcm-root .lm.np{float:right;font-size:11px;font-weight:600}
.pcm-root span.ch{display:inline-block;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:5px;border:1px solid;white-space:nowrap;margin:2px 4px 2px 0}
.pcm-root span.ch.cg{background:var(--cgb);color:var(--cg);border-color:var(--cgl)}
.pcm-root span.ch.c{background:var(--cb);color:var(--c);border-color:var(--cl)}
.pcm-root span.ch.lo{background:var(--lob);color:var(--lo);border-color:var(--lol)}
.pcm-root span.ch.ll{background:var(--llb);color:var(--ll);border-color:var(--lll)}
.pcm-root details.ch{display:inline-block;vertical-align:top;margin:2px 4px 2px 0}
.pcm-root details.ch>summary{list-style:none;cursor:pointer;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:5px;border:1px solid;white-space:nowrap;display:inline-block}
.pcm-root details.ch>summary::-webkit-details-marker{display:none}
.pcm-root details.ch>summary::after{content:" ⓘ";font-size:10px;opacity:.55}
.pcm-root details.ch[open]>summary::after{content:" ×";opacity:.8}
.pcm-root details.ch.cg>summary{background:var(--cgb);color:var(--cg);border-color:var(--cgl)}
.pcm-root details.ch.c>summary{background:var(--cb);color:var(--c);border-color:var(--cl)}
.pcm-root details.ch.lo>summary{background:var(--lob);color:var(--lo);border-color:var(--lol)}
.pcm-root details.ch.ll>summary{background:var(--llb);color:var(--ll);border-color:var(--lll)}
.pcm-root .ch-exp{display:block;margin-top:5px;padding:8px 11px;background:#fff;border:1px solid var(--line);border-left:3px solid var(--soft);border-radius:6px;font-size:12.5px;line-height:1.55;color:#1f2b47;max-width:340px;box-shadow:0 6px 18px rgba(18,32,58,.14)}
.pcm-root details.ch.cg .ch-exp{border-left-color:var(--cg)}
.pcm-root details.ch.c .ch-exp{border-left-color:var(--c)}
.pcm-root details.ch.lo .ch-exp{border-left-color:var(--lo)}
.pcm-root details.ch.ll .ch-exp{border-left-color:var(--ll)}
.pcm-root footer{margin-top:26px;padding:14px 20px 0;border-top:2px solid var(--ink);font-size:12px;color:var(--soft)}
@media (max-width:640px){.pcm-root .wrap{padding:0 12px}.pcm-root header{padding:16px 14px}.pcm-root h1{font-size:19px}.pcm-root .kb{flex:1 1 100%}.pcm-root table{font-size:12px}.pcm-root td,.pcm-root thead th{padding:6px 8px}.pcm-root .ch-exp{max-width:none}.pcm-root details.ch{display:block;margin:3px 0}}
`

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#eef2f6;font-family:'Noto Sans Oriya',system-ui,-apple-system,sans-serif;color:#12203A}
.lo-wrap{max-width:1240px;margin:0 auto;padding:16px}
.lo-top{background:linear-gradient(120deg,#241a5e,#5B2BC4);color:#fff;border-radius:14px;padding:20px 22px;margin-bottom:14px}
.lo-top .lo-kick{font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;opacity:.85;font-weight:700}
.lo-top h1{margin:6px 0 0;font-size:24px;font-weight:800}
.lo-top .lo-sub{font-size:13px;opacity:.9;margin-top:6px}
.lo-toc{background:#fff;border:1px solid #DCE2EE;border-radius:12px;padding:14px 18px;margin-bottom:18px}
.lo-toc b{font-size:13px;color:#5C688A}
.lo-toc ol{margin:8px 0 0;padding-left:20px}
.lo-toc li{margin:3px 0;font-size:13.5px}
.lo-toc a{color:#1A3EA8;text-decoration:none;font-weight:600}
.lo-toc a:hover{text-decoration:underline}
.lo-chapter{background:#fff;border:1px solid #DCE2EE;border-radius:14px;padding:16px;margin-bottom:18px}
.lo-chap-head{font-size:14px;font-weight:800;color:#241a5e;margin-bottom:10px}
.lo-chap-head .lo-pill{display:inline-block;background:#EEF2FF;color:#4338CA;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;margin-right:6px}
`

const FONT_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;700&display=swap" rel="stylesheet">'

function pageHtml(label, chapters) {
  const toc = chapters.map((ch, i) => `<li><a href="#ch${i}">${esc(ch.subject ? ch.subject + ' · ' : '')}${esc(ch.chapterName || ch.title || ('Chapter ' + (i + 1)))}</a></li>`).join('')
  const body = chapters.map((ch, i) => `<section id="ch${i}" class="lo-chapter"><div class="lo-chap-head">${ch.subject ? `<span class="lo-pill">${esc(ch.subject)}</span>` : ''}${esc(ch.chapterName || ch.title || ('Chapter ' + (i + 1)))}</div>${ch.htmlContent || ''}</section>`).join('\n')
  return `<!doctype html><html lang="or"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(label)} — Chapterwise Learning Outcomes</title>
${FONT_LINK}<style>${BASE_CSS}${PCM_CSS}</style></head>
<body><div class="lo-wrap">
<header class="lo-top"><div class="lo-kick">Lesson Guru Odisha · ଅଧ୍ୟାୟ ଅନୁଯାୟୀ ଶିକ୍ଷଣ ଫଳାଫଳ</div><h1>${esc(label)} — Chapterwise Learning Outcomes</h1><div class="lo-sub">CG · Competency · Learning Outcome · Domain Outcome — ${chapters.length} chapter(s)</div></header>
<nav class="lo-toc"><b>ବିଷୟ ସୂଚୀ / Contents</b><ol>${toc}</ol></nav>
${body}
</div></body></html>`
}

function indexHtml(index) {
  const rows = index.map(it => `<li><a href="./${encodeURIComponent(it.file)}">${esc(it.label)}</a> <span style="color:#5C688A">· ${it.n} chapter(s)</span></li>`).join('')
  return `<!doctype html><html lang="or"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chapterwise Learning Outcomes</title>
${FONT_LINK}<style>${BASE_CSS}</style></head>
<body><div class="lo-wrap">
<header class="lo-top"><div class="lo-kick">Lesson Guru Odisha</div><h1>Chapterwise Learning Outcomes</h1><div class="lo-sub">${index.length} class file(s) — open any class below</div></header>
<nav class="lo-toc"><b>Classes</b><ol>${rows}</ol></nav>
</div></body></html>`
}

// Build the ZIP (nodebuffer). Returns { zipBuffer, filename, classCount, chapterCount }.
export async function buildLoZip(d) {
  const rows = await d.collection('academicResources')
    .find({ resourceType: 'chapter_wise_lo', isDeleted: { $ne: true } })
    .project({ _id: 0, id: 1, className: 1, subject: 1, chapterName: 1, title: 1, sortOrder: 1, htmlContent: 1, createdAt: 1 })
    .toArray()

  const groups = new Map()
  for (const r of rows) {
    const ci = classInfo(r.className)
    if (!groups.has(ci.key)) groups.set(ci.key, { ci, items: [] })
    groups.get(ci.key).items.push(r)
  }
  const ordered = [...groups.values()].sort((a, b) => a.ci.order - b.ci.order)

  const zip = new JSZip()
  const index = []
  let chapterCount = 0
  for (const g of ordered) {
    g.items.sort((a, b) =>
      String(a.subject || '').localeCompare(String(b.subject || '')) ||
      (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) ||
      String(a.chapterName || a.title || '').localeCompare(String(b.chapterName || b.title || '')))
    zip.file(g.ci.file + '.html', pageHtml(g.ci.label, g.items))
    index.push({ label: g.ci.label, file: g.ci.file + '.html', n: g.items.length })
    chapterCount += g.items.length
  }
  zip.file('index.html', indexHtml(index))

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const ts = new Date().toISOString().slice(0, 10)
  return { zipBuffer, filename: `chapterwise-lo-${ts}.zip`, classCount: ordered.length, chapterCount }
}
