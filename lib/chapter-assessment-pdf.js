// ============================================================
// Chapter Assessment — PDF Generation + Password Encryption
// ============================================================
// Pipeline:
//   assessment HTML  →  split into Question Page + Answer Page
//   →  wrap in a strict 2-A4-page branded template with watermarks
//   →  puppeteer (existing /app/lib/pdf.js htmlToPDFBuffer)
//   →  validate strictly: pageCount === 2, Answer Key ONLY on page 2
//   →  retry with progressively compact CSS profiles if validation fails
//   →  qpdf --encrypt USER-PASSWORD (AES-256, optional)
//   →  Buffer returned to caller
//
// The user-entered password is used ONLY as the argument to
// `qpdf --encrypt` for the duration of one shell invocation.
// It is never persisted, never logged, and never returned.
// ============================================================

import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import * as cheerio from 'cheerio'
import { htmlToPDFBuffer } from './pdf.js'

// ------------------------------------------------------------
// escapeHtml — used everywhere below (module-scope so both the
// HTML builder and the split helper can share one implementation).
// ------------------------------------------------------------
const escapeHtml = s => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// ------------------------------------------------------------
// Regex to detect a "Answer Key" heading in Odia OR English.
//   ଉତ୍ତର ସୂଚୀ / ଉତ୍ତର ସୁଚୀ / Answer Key / Answers
// Also matches when the heading text contains extra whitespace.
// ------------------------------------------------------------
const ANSWER_KEY_TEXT_RE = /(ଉତ୍ତର\s*ସୂଚୀ|ଉତ୍ତର\s*ସୁଚୀ|Answer\s*Key|Answers?\b)/i

// ------------------------------------------------------------
// Split the sanitized inner HTML of ONE <section data-assessment-number="N">
// into a question page and an answer page.
//
// Preferred structure (official template):
//   <div class="assessment-question-page"> ... </div>
//   <div class="assessment-answer-page"> ... </div>
//
// Backward-compatibility fallbacks:
//   • Section contains TWO <div class="page"> — first = questions, second = answers
//   • Section contains a <div class="answer-key"> or [data-field="answer-key"]
//     → walk up to the nearest "page-like" ancestor and use it as the answer
//   • Section contains an "Answer Key" heading (Odia/English)
//     → split the raw string at that heading
//   • Otherwise → treat everything as questions, answer page empty
//
// Returns: { questionHtml, answerHtml|null, source }
// ------------------------------------------------------------
export function splitQuestionAndAnswer(rawInner) {
  const src = String(rawInner || '')
  if (!src.trim()) return { questionHtml: '', answerHtml: null, source: 'empty' }

  // Load into cheerio.  `#__root` wrapper lets us treat siblings uniformly.
  const $ = cheerio.load(`<div id="__root">${src}</div>`, { decodeEntities: false })
  const root = $('#__root')

  // 1) Explicit structured containers (preferred / official template)
  const qStruct = root.find('.assessment-question-page').first()
  const aStruct = root.find('.assessment-answer-page').first()
  if (qStruct.length && aStruct.length) {
    return {
      questionHtml: qStruct.html() || '',
      answerHtml: aStruct.html() || '',
      source: 'structured',
    }
  }

  // 2) Two-page layout using <div class="page">…</div>  (legacy template)
  const pageDivs = root.find('.page').filter((_, el) => {
    // Only consider ".page" that is a top-level assessment child (skip nested).
    return $(el).parents('.page').length === 0
  }).toArray()
  if (pageDivs.length >= 2) {
    // The "answer" page is the one that contains an .answer-key OR an
    // Answer Key heading.  If none matches, fall back to the last page.
    let answerIdx = pageDivs.findIndex(el =>
      $(el).find('.answer-key, [data-field="answer-key"]').length > 0 ||
      $(el).find('h1,h2,h3,h4,h5,h6').filter((_i, h) => ANSWER_KEY_TEXT_RE.test($(h).text())).length > 0
    )
    if (answerIdx === -1) answerIdx = pageDivs.length - 1
    const questionIdx = answerIdx === 0 ? 1 : 0
    return {
      questionHtml: $(pageDivs[questionIdx]).html() || '',
      answerHtml: $(pageDivs[answerIdx]).html() || '',
      source: 'div-page',
    }
  }

  // 3) An .answer-key container exists but only one .page (or none).
  const akContainer = root.find('.answer-key, [data-field="answer-key"]').first()
  if (akContainer.length) {
    // Everything inside the .answer-key element → answer.
    // Take the answer-key outer HTML plus any following siblings (like a
    // teacher-note) as the answer page.  Everything else stays in the
    // question page.
    const answerHtml = ($.html(akContainer) || '') +
      akContainer.nextAll().toArray().map(el => $.html(el)).join('')
    // Remove the answer block (and following siblings) from the clone to
    // produce the question HTML.
    const $clone = cheerio.load(`<div id="__root">${src}</div>`, { decodeEntities: false })
    const cloneAK = $clone('.answer-key, [data-field="answer-key"]').first()
    cloneAK.nextAll().remove()
    cloneAK.remove()
    return {
      questionHtml: $clone('#__root').html() || '',
      answerHtml,
      source: 'answer-key-class',
    }
  }

  // 4) Fallback: locate an "Answer Key" heading in the raw string and split.
  //    Uses text-based match (not cheerio) because the heading may be
  //    inside an already-rendered structure we can't safely reason about.
  const headingRE = /<(h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi
  let m
  while ((m = headingRE.exec(src)) !== null) {
    const inner = m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (ANSWER_KEY_TEXT_RE.test(inner)) {
      const idx = m.index
      return {
        questionHtml: src.slice(0, idx),
        answerHtml: src.slice(idx),
        source: 'answer-heading',
      }
    }
  }

  // 5) Nothing split — treat as question only.
  return { questionHtml: src, answerHtml: null, source: 'single' }
}

// ------------------------------------------------------------
// Build an SVG containing the watermark lines (rotated diagonally).
// Used as a data-uri background so it repeats on every printed page.
// ------------------------------------------------------------
function buildWatermarkSVG(lines) {
  const w = 520, h = 300
  const fontSize = 22
  const gap = fontSize + 6
  const total = lines.length * gap
  const startY = h / 2 - total / 2 + fontSize
  const esc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
  const textEls = lines.map((line, i) => `<text x="${w / 2}" y="${startY + i * gap}" text-anchor="middle" font-family="Inter, Noto Sans Oriya, sans-serif" font-size="${i === 0 ? fontSize + 4 : fontSize}" font-weight="${i === 0 ? 900 : 600}" fill="#0f766e">${esc(line)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g transform="rotate(-24 ${w / 2} ${h / 2})">${textEls}</g></svg>`
}

// ------------------------------------------------------------
// Return a big CSS string that lays out TWO A4 portrait pages,
// with progressive compaction based on `compactProfile` (0..2).
// ------------------------------------------------------------
function buildAssessmentCSS(compactProfile, watermarkSvgUri) {
  const wm = watermarkSvgUri
    ? `background-image: url("${watermarkSvgUri}"); background-repeat: repeat; background-position: center center; background-size: 520px 300px; opacity: 0.14;`
    : 'display:none;'

  // Compact profile knobs.  These are ONLY applied to the question page
  // (never the answer page — the answer key is always short).
  const profiles = [
    // 0 — normal
    { qFont: '13px', qLine: '1.5',  qGap: '14px', pGap: '5px', tdPad: '4px 6px', tdFont: '12px', headerPad: '10px', metaFont: '11px' },
    // 1 — compact
    { qFont: '12px', qLine: '1.38', qGap: '10px', pGap: '3px', tdPad: '3px 5px', tdFont: '11.5px', headerPad: '8px', metaFont: '10.5px' },
    // 2 — extra-compact (last resort — must stay readable)
    { qFont: '11.5px', qLine: '1.28', qGap: '7px', pGap: '2px', tdPad: '2px 4px', tdFont: '11px', headerPad: '6px', metaFont: '10px' },
  ]
  const p = profiles[Math.max(0, Math.min(compactProfile | 0, 2))]

  return `
/* ---- Print sheet ---------------------------------------- */
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: 'Inter','Noto Sans Oriya','Segoe UI',system-ui,sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #0f172a;
}
* { box-sizing: border-box; }

/* ---- The two physical pages ----------------------------- */
.assessment-question-page,
.assessment-answer-page {
  width: 210mm;
  height: 297mm;
  box-sizing: border-box;
  padding: 14mm 14mm 18mm;
  position: relative;
  overflow: hidden;   /* strict — the question-page must self-contain */
}
.assessment-question-page {
  page-break-after: always;
  break-after: page;
}
.assessment-answer-page {
  page-break-before: always;
  break-before: page;
}

/* ---- Repeating diagonal watermark inside each page ------ */
.assessment-question-page::before,
.assessment-answer-page::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  ${wm}
}
.lg-page-header, .lg-page-body, .lg-page-footer { position: relative; z-index: 1; }

/* ---- Page header (brand + meta strip + title) ----------- */
.lg-page-header {
  text-align: center;
  border-bottom: 2px solid #0f766e;
  padding-bottom: ${p.headerPad};
  margin-bottom: 8px;
}
.lg-brand {
  font-size: 14px; font-weight: 900; letter-spacing: 1.2px;
  background: linear-gradient(90deg,#0f766e,#1e40af);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  display: inline-block;
}
.lg-url { color: #64748b; margin-left: 8px; font-size: 10px; }
.lg-meta {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 4px 16px;
  padding: 5px 4px 6px;
  font-size: ${p.metaFont};
  color: #334155;
}
.lg-meta b { color: #0f766e; font-weight: 700; }
.lg-title {
  margin: 6px 0 2px;
  font-weight: 900; font-size: 15px;
  color: #0f172a;
}
.lg-title .sub { display:block; font-weight:600; font-size: 11.5px; color: #475569; margin-top: 2px; }

/* ---- Body: the assessment content ----------------------- */
.lg-page-body { padding: 4px 0; }

/* ---- Break-inside guardrails (never split a question) --- */
.assessment-question-page .question,
.assessment-question-page .question-block,
.assessment-question-page .question-item,
.assessment-question-page .sub-question,
.assessment-question-page .question-group,
.assessment-question-page .assessment-question,
.assessment-question-page .questions > *,
.assessment-question-page table,
.assessment-question-page tr,
.assessment-question-page .question-table,
.assessment-question-page blockquote {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* ---- Question-page typography (compaction dialed here) -- */
.assessment-question-page .lg-page-body {
  font-size: ${p.qFont};
  line-height: ${p.qLine};
}
.assessment-question-page .lg-page-body p,
.assessment-question-page .lg-page-body li {
  margin: ${p.pGap} 0;
}
.assessment-question-page .lg-page-body .question,
.assessment-question-page .lg-page-body .question-block,
.assessment-question-page .lg-page-body .question-item,
.assessment-question-page .lg-page-body .question-group {
  margin-bottom: ${p.qGap};
}
.assessment-question-page .lg-page-body h1,
.assessment-question-page .lg-page-body h2,
.assessment-question-page .lg-page-body h3,
.assessment-question-page .lg-page-body h4 {
  margin: 6px 0 3px;
}

/* ---- Tables ---- */
table { border-collapse: collapse; width: 100%; margin: 6px 0; }
th, td { border: 1px solid #94a3b8; text-align: left; vertical-align: top; }
th { background: #f1f5f9; font-weight: 700; }
.assessment-question-page .lg-page-body table td,
.assessment-question-page .lg-page-body table th {
  padding: ${p.tdPad};
  font-size: ${p.tdFont};
}
.assessment-answer-page .lg-page-body table td,
.assessment-answer-page .lg-page-body table th {
  padding: 3px 5px;
  font-size: 11.5px;
}

/* ---- Answer-key styling (fixed, not compacted) ---------- */
.assessment-answer-page .lg-page-body {
  font-size: 12.5px;
  line-height: 1.55;
}
.assessment-answer-page .lg-page-body p { margin: 6px 0; }

/* ---- Footer inside each page (fixed to bottom) ---------- */
.lg-page-footer {
  position: absolute;
  bottom: 8mm;
  left: 14mm; right: 14mm;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 9px; color: #64748b;
  border-top: 1px dashed #cbd5e1;
  padding-top: 3mm;
  z-index: 1;
}

/* ---- Assorted content niceties -------------------------- */
img { max-width: 100%; height: auto; }
ul, ol { padding-left: 1.3em; }
hr { border: none; border-bottom: 1px solid #94a3b8; margin: 8px 0; }
blockquote { margin: 6px 12px; padding: 6px 10px; background: #f9f9f9; border: 1px solid #ddd; }
`
}

// ------------------------------------------------------------
// Build the branded 2-page HTML document
// ------------------------------------------------------------
/**
 * @param {object} opts
 * @param {string} opts.assessmentHtml   sanitized section inner HTML
 * @param {string} opts.assessmentTitle  e.g. "ଆକଳନ - ୧"
 * @param {string} opts.chapterName
 * @param {string} opts.className
 * @param {string} opts.subject
 * @param {string} opts.teacherName
 * @param {string} opts.schoolName
 * @param {boolean} opts.showBrandWatermark
 * @param {boolean} opts.showUserWatermark
 * @param {boolean} opts.showSchoolWatermark
 * @param {number}  [opts.compactProfile=0]   0=normal, 1=compact, 2=extra-compact
 * @returns {string} full HTML document ready for Puppeteer
 */
export function buildAssessmentHTML(opts) {
  const {
    assessmentHtml,
    assessmentTitle,
    chapterName,
    className,
    subject,
    teacherName,
    schoolName,
    showBrandWatermark,
    showUserWatermark,
    showSchoolWatermark,
    compactProfile = 0,
  } = opts

  // --- Watermark strip (unchanged from the previous implementation) ---
  const brandLine  = showBrandWatermark  ? 'LESSON GURU ODISHA'                  : ''
  const userLine   = showUserWatermark   ? `Teacher: ${teacherName || ''}`       : ''
  const schoolLine = showSchoolWatermark ? `School: ${schoolName || ''}`         : ''
  const watermarkLines = [brandLine, userLine, schoolLine].filter(Boolean)
  const watermarkSvgUri = watermarkLines.length
    ? `data:image/svg+xml;utf8,${encodeURIComponent(buildWatermarkSVG(watermarkLines))}`
    : ''

  const css = buildAssessmentCSS(compactProfile, watermarkSvgUri)

  // --- Split into Question / Answer pages -----------------------------
  const { questionHtml, answerHtml, source } = splitQuestionAndAnswer(assessmentHtml)
  const safeAnswerHtml = answerHtml && answerHtml.trim().length > 0
    ? answerHtml
    : '<p><em>Answer key not provided in the uploaded assessment.</em></p>'

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const meta = `
    <div class="lg-meta">
      <span><b>Class:</b> ${escapeHtml(className) || '—'}</span>
      <span><b>Subject:</b> ${escapeHtml(subject) || '—'}</span>
      <span><b>Chapter:</b> ${escapeHtml(chapterName) || '—'}</span>
      <span><b>Teacher:</b> ${escapeHtml(teacherName) || '—'}</span>
      <span><b>School:</b> ${escapeHtml(schoolName) || '—'}</span>
      <span><b>Date:</b> ${escapeHtml(dateStr)}</span>
    </div>`

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(assessmentTitle)} — ${escapeHtml(chapterName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Noto+Sans+Oriya:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>${css}</style>
<meta name="lg-split-source" content="${escapeHtml(source)}">
</head><body>

  <section class="assessment-question-page">
    <div class="lg-page-header">
      <div>
        <span class="lg-brand">LESSON GURU ODISHA</span>
        <span class="lg-url">lessonguruodisha.in</span>
      </div>
      <h1 class="lg-title">${escapeHtml(assessmentTitle)}</h1>
    </div>
    ${meta}
    <div class="lg-page-body">${questionHtml}</div>
    <div class="lg-page-footer">
      <span>LESSON GURU ODISHA · lessonguruodisha.in</span>
      <span>Page 1 of 2</span>
    </div>
  </section>

  <section class="assessment-answer-page">
    <div class="lg-page-header">
      <div>
        <span class="lg-brand">LESSON GURU ODISHA</span>
        <span class="lg-url">lessonguruodisha.in</span>
      </div>
      <h1 class="lg-title">${escapeHtml(assessmentTitle)} <span class="sub">ଉତ୍ତର ସୂଚୀ · Answer Key</span></h1>
    </div>
    ${meta}
    <div class="lg-page-body">${safeAnswerHtml}</div>
    <div class="lg-page-footer">
      <span>LESSON GURU ODISHA · lessonguruodisha.in</span>
      <span>Page 2 of 2</span>
    </div>
  </section>

</body></html>`
}

// ------------------------------------------------------------
// Validate a rendered PDF matches the strict 2-page contract.
//   • Pages == 2
//   • Page 1 does NOT contain the Answer Key heading text
//   • Page 2 DOES contain the Answer Key heading text
// Returns: { ok, reasons[], pageCount, page1Text, page2Text }
// ------------------------------------------------------------
async function validateAssessmentPDF(pdfBuffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-vpdf-'))
  const file = path.join(tmpDir, 'v.pdf')
  try {
    await fs.writeFile(file, pdfBuffer)

    const runInfo = () => new Promise((res, rej) => {
      execFile('/usr/bin/pdfinfo', [file], { timeout: 15000 }, (err, stdout) => {
        if (err) return rej(err)
        res(stdout || '')
      })
    })
    const runText = (pageNum) => new Promise((res, rej) => {
      execFile('/usr/bin/pdftotext', ['-f', String(pageNum), '-l', String(pageNum), '-enc', 'UTF-8', '-layout', file, '-'], { timeout: 15000 }, (err, stdout) => {
        if (err) return rej(err)
        res(String(stdout || ''))
      })
    })

    let pageCount = 0
    try {
      const info = await runInfo()
      const m = /^\s*Pages:\s*(\d+)/mi.exec(info)
      pageCount = m ? parseInt(m[1], 10) : 0
    } catch (_) { pageCount = 0 }

    const reasons = []
    if (pageCount !== 2) reasons.push(`expected 2 pages, got ${pageCount}`)

    let page1Text = ''
    let page2Text = ''
    try { if (pageCount >= 1) page1Text = await runText(1) } catch (_) { /* ignore */ }
    try { if (pageCount >= 2) page2Text = await runText(2) } catch (_) { /* ignore */ }

    if (pageCount >= 1 && ANSWER_KEY_TEXT_RE.test(page1Text)) {
      reasons.push('page 1 contains Answer Key text')
    }
    if (pageCount >= 2 && !ANSWER_KEY_TEXT_RE.test(page2Text)) {
      reasons.push('page 2 missing Answer Key text')
    }
    // Cheap heuristic: page 1 should have "Page 1" footer, page 2 should have "Page 2"
    if (pageCount >= 1 && !/Page\s*1\s*of\s*2/i.test(page1Text)) {
      reasons.push('page 1 footer marker missing')
    }
    if (pageCount >= 2 && !/Page\s*2\s*of\s*2/i.test(page2Text)) {
      reasons.push('page 2 footer marker missing')
    }

    return { ok: reasons.length === 0, reasons, pageCount, page1Text, page2Text }
  } finally {
    try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch (_) { /* ignore */ }
  }
}

// ------------------------------------------------------------
// Encrypt with qpdf using a USER password (viewer MUST enter it to open).
// ------------------------------------------------------------
/**
 * @param {Buffer} pdfBuffer
 * @param {string} userPassword — never persisted, never logged
 * @returns {Promise<Buffer>} encrypted PDF
 */
export async function qpdfEncryptWithUserPassword(pdfBuffer, userPassword) {
  if (!userPassword || String(userPassword).length < 4) {
    throw new Error('Password too short.')
  }
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-ca-'))
  const inFile = path.join(tmpDir, 'in.pdf')
  const outFile = path.join(tmpDir, 'out.pdf')
  try {
    await fs.writeFile(inFile, pdfBuffer)
    const ownerPass = crypto.randomBytes(24).toString('base64')
    const args = [
      '--encrypt', String(userPassword), ownerPass, '256',
      '--print=low',
      '--modify=none',
      '--extract=n',
      '--annotate=n',
      '--',
      inFile,
      outFile,
    ]
    await new Promise((resolve, reject) => {
      execFile('/usr/bin/qpdf', args, { timeout: 30000 }, (err, _stdout, _stderr) => {
        if (!err) return resolve()
        if (err.code === 3) return resolve() // qpdf: 3 = warnings, PDF still valid
        return reject(new Error('PDF encryption failed'))
      })
    })
    const encrypted = await fs.readFile(outFile)
    return encrypted
  } finally {
    try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch (_) { /* ignore */ }
  }
}

// ------------------------------------------------------------
// One-shot helper — render + validate + retry + encrypt.
//
// Strict acceptance:
//   The returned PDF MUST be exactly 2 A4 pages.  If none of the
//   compaction profiles produce a valid 2-page layout, this function
//   throws — the caller MUST return a 5xx and MUST NOT log a success.
// ------------------------------------------------------------
/**
 * @param {object} args identical to buildAssessmentHTML + { userPassword? }
 * @returns {Promise<Buffer>} encrypted (if password provided) or plain PDF
 */
export async function generateAssessmentPDF(args) {
  const profiles = [0, 1, 2]
  let lastValidation = null
  let lastPdf = null

  for (const profile of profiles) {
    const html = buildAssessmentHTML({ ...args, compactProfile: profile })
    let pdf
    try {
      pdf = await htmlToPDFBuffer(html, {
        format: 'A4',
        preferCSSPageSize: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      })
    } catch (renderErr) {
      // Render itself failed — propagate up (nothing to validate).
      throw renderErr
    }
    let v
    try { v = await validateAssessmentPDF(pdf) }
    catch (verr) { v = { ok: false, reasons: [`validator crashed: ${verr.message}`], pageCount: 0 } }

    lastPdf = pdf
    lastValidation = v
    if (v.ok) {
      // Passed strict validation on this profile — done.
      if (args.userPassword) return qpdfEncryptWithUserPassword(pdf, args.userPassword)
      return pdf
    }
    console.warn(`[assessment-pdf] validation failed at compactProfile=${profile}:`, v.reasons.join('; '))
  }

  // All profiles failed — refuse to return a broken PDF (user requirement).
  const detail = lastValidation ? lastValidation.reasons.join('; ') : 'unknown validation failure'
  const pageCount = lastValidation ? lastValidation.pageCount : 0
  // Attach a hint on `.details` so route.js can decide how to report to admin.
  const err = new Error(`Assessment PDF pagination failed strict validation (final pageCount=${pageCount}): ${detail}`)
  err.code = 'ASSESSMENT_PAGINATION_FAILED'
  err.pageCount = pageCount
  err.reasons = lastValidation ? lastValidation.reasons : []
  throw err
  // NB: `lastPdf` is intentionally NOT returned.  This ensures the caller
  // MUST return an HTTP error and never records a "success" in analytics.
}

// ------------------------------------------------------------
// Sanitize a filename component for HTTP `Content-Disposition` headers.
// (Unchanged — see the ByteString fix in an earlier commit.)
// ------------------------------------------------------------
export function sanitizeFilenamePart(s) {
  return String(s || '')
    .replace(/[^\w\s.\-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

// ------------------------------------------------------------
// Build an RFC 5987-compliant `Content-Disposition` header value.
// (Unchanged.)
// ------------------------------------------------------------
export function buildContentDisposition(unicodeName, fallbackAscii) {
  const safeAscii = fallbackAscii || 'download'
  const pct = encodeURIComponent(unicodeName || safeAscii).replace(/\*/g, '%2A')
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${pct}`
}
