// ═════════════════════════════════════════════════════════════════════
// AI Lesson Generator — server-side helper
//
// Pipeline (Admin-only, Phase A + B):
//   1. fetchDriveCatalog()        → normalised { classes, subjects, books, chapters[] }
//                                    from the Apps Script Drive Bridge (?action=list).
//   2. fetchChapterPdfBase64(id)  → base64-encoded PDF from the Bridge (?action=file).
//   3. generateLessonJson(...)    → Gemini multimodal call using PDF as an inline_data
//                                    part + a strict `responseSchema` for structured
//                                    output.  Never renders HTML from the model.
//   4. jsonToPanchapadiHtml(...)  → converts the Gemini JSON into HTML that MATCHES
//                                    the exact structure of an admin-uploaded Panchapadi
//                                    HTML file so the existing parser + viewer + PDF
//                                    flow work unchanged.
//   5. saveToDriveBridge(...)     → posts the generated PDF back to the Apps Script
//                                    (POST /?action=save) — requires the small Apps
//                                    Script extension documented at the top of that
//                                    file (see AGENT-README section 18).
//
// NEVER expose GEMINI_API_KEY or the Drive Bridge URL to the browser.  Both are
// read via process.env and only used server-side.
// ═════════════════════════════════════════════════════════════════════

const BRIDGE_URL   = () => process.env.GOOGLE_DRIVE_BRIDGE_URL || ''
const GEMINI_KEY   = () => process.env.GEMINI_API_KEY          || ''
const GEMINI_MODEL = () => process.env.GEMINI_MODEL            || 'gemini-2.5-flash'

// ────────────────────────────── DRIVE BRIDGE ──────────────────────────

/**
 * Fetch the flat list of chapter PDFs discovered by the Apps Script,
 * then reshape it into a hierarchical tree so the UI can populate
 * cascading Class → Subject → Book → Chapter dropdowns without
 * re-hitting the bridge on every step.
 *
 * Returns:
 *   {
 *     ok, classes: [{
 *       classLabel, classOrder,
 *       subjects: [{ subject, books: [{ book, chapters: [{ chapterName, fileId, fileName, size, url, periods }] }] }]
 *     }]
 *   }
 */
// Server-side catalog cache — the Apps Script `list` action currently
// takes 30-40 s to enumerate the entire Drive tree, so we memoise the
// normalised catalog for 10 minutes.  Force-refresh via ?refresh=1.
let CATALOG_CACHE = null
let CATALOG_CACHED_AT = 0
const CATALOG_TTL_MS = 10 * 60 * 1000

export async function fetchDriveCatalog(opts = {}) {
  const force = opts.force === true
  const now = Date.now()
  if (!force && CATALOG_CACHE && (now - CATALOG_CACHED_AT) < CATALOG_TTL_MS) {
    return CATALOG_CACHE
  }
  const url = BRIDGE_URL()
  if (!url) return { ok: false, error: 'GOOGLE_DRIVE_BRIDGE_URL not configured' }
  try {
    // The Apps Script `list` walks the entire Drive tree so cold calls
    // take 30-40 seconds — allow 90 s of headroom.
    const r = await fetch(`${url}?action=list`, { method: 'GET', signal: AbortSignal.timeout(90000) })
    if (!r.ok) return { ok: false, error: `Drive bridge HTTP ${r.status}` }
    const j = await r.json()
    if (!j?.ok) return { ok: false, error: j?.error || 'Drive bridge returned an error' }
    const rows = Array.isArray(j.rows) ? j.rows : []
    // Group into class → subject → book → chapters[].  De-dupe by fileId.
    const classesMap = new Map()
    for (const row of rows) {
      const classLabel = String(row.className || `Class ${row.cls || '?'}`).trim()
      const classOrder = Number(row.cls) || 999
      const subject = String(row.subject || 'Unknown').trim()
      const book = String(row.chapterName || row.chapter || 'Unknown Book').trim()
      const fileId = String(row.fileId || row.driveId || '').trim()
      if (!fileId) continue
      const chapterName = String(row.fileName || row.name || fileId).replace(/\.pdf$/i, '').trim()
      if (!classesMap.has(classLabel)) classesMap.set(classLabel, { classLabel, classOrder, subjectsMap: new Map() })
      const cEntry = classesMap.get(classLabel)
      if (!cEntry.subjectsMap.has(subject)) cEntry.subjectsMap.set(subject, { subject, booksMap: new Map() })
      const sEntry = cEntry.subjectsMap.get(subject)
      if (!sEntry.booksMap.has(book)) sEntry.booksMap.set(book, { book, chapters: [] })
      const bEntry = sEntry.booksMap.get(book)
      if (bEntry.chapters.some(c => c.fileId === fileId)) continue
      bEntry.chapters.push({
        chapterName,
        fileId,
        fileName: row.fileName || row.name || '',
        size: Number(row.size) || 0,
        mimeType: row.mimeType || 'application/pdf',
        url: row.url || '',
        downloadUrl: row.downloadUrl || '',
        periods: Number(row.periods) || 1,
      })
    }
    // Materialise to plain objects (drop the intermediate Maps) with
    // deterministic sort orders so the UI never jitters.
    const classes = [...classesMap.values()]
      .sort((a, b) => a.classOrder - b.classOrder)
      .map(c => ({
        classLabel: c.classLabel,
        classOrder: c.classOrder,
        subjects: [...c.subjectsMap.values()]
          .sort((a, b) => a.subject.localeCompare(b.subject))
          .map(s => ({
            subject: s.subject,
            books: [...s.booksMap.values()]
              .sort((a, b) => a.book.localeCompare(b.book))
              .map(b => ({
                book: b.book,
                chapters: b.chapters.sort((x, y) => {
                  // Prefer explicit "Chapter-NN" prefix ordering when
                  // present in filename.
                  const mx = /Chapter-(\d+)/i.exec(x.fileName || x.chapterName || '')
                  const my = /Chapter-(\d+)/i.exec(y.fileName || y.chapterName || '')
                  if (mx && my) return Number(mx[1]) - Number(my[1])
                  return String(x.chapterName || '').localeCompare(String(y.chapterName || ''))
                }),
              })),
          })),
      }))
    const result = { ok: true, classes }
    CATALOG_CACHE = result
    CATALOG_CACHED_AT = Date.now()
    return result
  } catch (e) {
    return { ok: false, error: e?.message || 'Drive bridge fetch failed' }
  }
}

/**
 * Retrieve a specific chapter PDF from the bridge as base64.
 * Returns { ok, name, mimeType, size, base64 }.
 */
export async function fetchChapterPdfBase64(fileId) {
  const url = BRIDGE_URL()
  if (!url) return { ok: false, error: 'GOOGLE_DRIVE_BRIDGE_URL not configured' }
  if (!fileId) return { ok: false, error: 'fileId required' }
  try {
    const r = await fetch(`${url}?action=file&fileId=${encodeURIComponent(fileId)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(90000),
      redirect: 'follow',
    })
    if (!r.ok) return { ok: false, error: `Drive bridge HTTP ${r.status}` }
    const j = await r.json()
    if (!j?.ok || !j?.base64) return { ok: false, error: j?.error || 'PDF not returned' }
    if (j.mimeType && j.mimeType !== 'application/pdf') {
      return { ok: false, error: `Unexpected mime type: ${j.mimeType}` }
    }
    return { ok: true, name: j.name || j.fileName || '', mimeType: j.mimeType || 'application/pdf', size: Number(j.size) || 0, base64: j.base64 }
  } catch (e) {
    return { ok: false, error: e?.message || 'PDF fetch failed' }
  }
}

/**
 * POST a generated PDF back to the Drive bridge for archival under a
 * dynamic path (e.g. Generated Lesson Plans → Class 1 → Odia → Book →
 * Chapter → Period 1 — Panchapadi Lesson Plan.pdf).
 *
 * IMPORTANT: this requires the Apps Script to be extended with a
 * `save` handler (POST body).  If the extension is not deployed yet
 * the bridge will respond with `Unknown action: save` and we surface
 * that verbatim so admins know to upgrade the Apps Script.
 */
export async function saveToDriveBridge({ path, fileName, base64, mimeType = 'application/pdf', overwrite = false }) {
  const url = BRIDGE_URL()
  if (!url) return { ok: false, error: 'GOOGLE_DRIVE_BRIDGE_URL not configured' }
  if (!Array.isArray(path) || !path.length) return { ok: false, error: 'path[] required' }
  if (!fileName || !base64) return { ok: false, error: 'fileName + base64 required' }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', path, fileName, base64, mimeType, overwrite }),
      signal: AbortSignal.timeout(60000),
      redirect: 'follow',
    })
    const j = await r.json().catch(() => ({}))
    if (!j?.ok) return { ok: false, error: j?.error || `Drive save HTTP ${r.status}` }
    return { ok: true, fileId: j.fileId || '', fileUrl: j.fileUrl || j.url || '', versioned: !!j.versioned }
  } catch (e) {
    return { ok: false, error: e?.message || 'Drive save failed' }
  }
}

/**
 * Lightweight handshake with the Apps Script bridge — POSTs
 * `{ action: 'ping' }` and returns whether the `save` handler is
 * deployed.  Admins hit this from the "🧪 Test Drive Save Handler"
 * button before doing a real upload so they can catch missing
 * deployments without touching Drive.
 */
export async function pingDriveBridge() {
  const url = BRIDGE_URL()
  if (!url) return { ok: false, error: 'GOOGLE_DRIVE_BRIDGE_URL not configured' }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ping' }),
      signal: AbortSignal.timeout(30000),
      redirect: 'follow',
    })
    const j = await r.json().catch(() => ({}))
    if (!j?.ok) return { ok: false, error: j?.error || `Ping HTTP ${r.status}`, canSave: false }
    return { ok: true, canSave: j.canSave !== false, version: j.version || '', raw: j }
  } catch (e) {
    return { ok: false, error: e?.message || 'Drive ping failed', canSave: false }
  }
}

/**
 * Wrap a raw Panchapadi HTML (either from the AI generator or an
 * uploaded lesson) with the shared PDF stylesheet that renders A4
 * portrait pages with the LessonGuru header + soft watermark.  Used
 * by the "Save PDF to Drive" flow so the archive matches the print
 * output teachers see in the app.
 */
export function wrapForPdf(rawHtml, { classLabel = '', bookLabel = '', chapterLabel = '', period = '', subject = '' } = {}) {
  const html = String(rawHtml || '')
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const stampDate = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })
  const headerBits = [classLabel, subject, bookLabel, chapterLabel, period ? `Period ${period}` : '']
    .filter(Boolean).map(esc).join(' · ')
  const wmBlock = `
<style>
  @page { size: A4 portrait; margin: 14mm 12mm 18mm 12mm; }
  body { font-family: 'Inter', 'Noto Sans Oriya', 'Noto Sans', sans-serif; color: #0f172a; }
  body::before { content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background-image: repeating-linear-gradient(-30deg, transparent 0, transparent 140px, rgba(30, 78, 121, 0.04) 140px, rgba(30, 78, 121, 0.04) 141px); }
  #lgo-wm-header { position: fixed; top: 4mm; left: 8mm; right: 8mm; z-index: 5; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #1E4E79; padding: 4px 8px; border-bottom: 1px solid rgba(30,78,121,0.2); }
  #lgo-wm-footer { position: fixed; bottom: 4mm; left: 8mm; right: 8mm; z-index: 5; font-size: 9px; color: #1E4E79; padding: 3px 8px; border-top: 1px solid rgba(30,78,121,0.2); display: flex; justify-content: space-between; }
  body > * { position: relative; z-index: 1; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
  th { background: #f1f5f9; text-align: left; }
  td.label { font-weight: 600; width: 32%; background: #f8fafc; }
  td.label small, small { display: block; font-weight: 400; color: #64748b; font-size: 9px; margin-top: 2px; }
  h1 { font-size: 16px; margin: 4px 0 6px; }
  h2 { font-size: 13px; margin: 12px 0 6px; padding: 4px 8px; background: #eff6ff; border-left: 3px solid #1E4E79; }
  .hero p { font-size: 11px; color: #475569; margin: 2px 0 8px; }
  ul { margin: 4px 0 4px 18px; padding: 0; }
</style>
<div id="lgo-wm-header">
  <span>📘 Lesson Guru Odisha · ପଞ୍ଚପଦୀ New Lesson Plan</span>
  <span>${headerBits}</span>
</div>
<div id="lgo-wm-footer">
  <span>© Lesson Guru Odisha · Archived ${esc(stampDate)}</span>
  <span>${esc(headerBits) || 'Panchapadi Lesson Plan'}</span>
</div>`
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${wmBlock}`)
  }
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${wmBlock}${html}</body></html>`
}

/**
 * Format the Drive filename per the confirmed convention:
 *   `<ChapterName>_P<Period>_Panchapadi_<YYYY-MM-DD>.pdf`
 * We include the period so multi-period chapters get distinct files
 * even without Apps Script auto-versioning.
 */
export function buildDriveFilename({ chapterName, period }) {
  const safe = String(chapterName || 'Panchapadi Lesson')
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Panchapadi Lesson'
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const pTag = period ? `_P${period}` : ''
  return `${safe}${pTag}_Panchapadi_${yyyy}-${mm}-${dd}.pdf`
}

/**
 * Build the Drive folder path used for archived lessons.  Confirmed
 * convention: everything goes under the "Generated Lessons" root
 * folder, subdivided by Class → Subject → Book.
 */
export function buildDrivePath({ classLabel, subject, book }) {
  return ['Generated Lessons', classLabel, subject || 'General', book || 'Uncategorised']
    .map(s => String(s || '').trim()).filter(Boolean)
}

// ────────────────────────────── GEMINI ────────────────────────────────

/**
 * JSON schema Gemini must follow.  Every field is a plain string / array
 * of strings so the frontend never has to parse arbitrary shapes.  Empty
 * strings + empty arrays are ALLOWED — the prompt tells the model to
 * leave a field blank when the chapter PDF doesn't cover it.
 */
const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    chapterTitle:  { type: 'string' },
    topic:         { type: 'string' },
    subTopic:      { type: 'string' },
    prerequisite:  { type: 'string' },
    learningOutcomes: { type: 'array', items: { type: 'string' } },
    loCodes:       { type: 'array', items: { type: 'string' } },
    cgCodes:       { type: 'array', items: { type: 'string' } },
    competencyCodes: { type: 'array', items: { type: 'string' } },
    curricularGoalOcf:  { type: 'string' },
    curricularGoalScert: { type: 'string' },
    competencyOcf:      { type: 'string' },
    competencyScert:    { type: 'string' },
    tlm:           { type: 'array', items: { type: 'string' } },
    panchapadi: {
      type: 'object',
      properties: {
        adhiti:  { type: 'object', properties: { duration: { type: 'string' }, teacherActivity: { type: 'string' }, studentActivity: { type: 'string' }, teachingNotes: { type: 'string' }, assessmentEvidence: { type: 'string' } }, required: ['teacherActivity', 'studentActivity'] },
        bodha:   { type: 'object', properties: { duration: { type: 'string' }, teacherActivity: { type: 'string' }, studentActivity: { type: 'string' }, teachingNotes: { type: 'string' }, assessmentEvidence: { type: 'string' } }, required: ['teacherActivity', 'studentActivity'] },
        abhyasa: { type: 'object', properties: { duration: { type: 'string' }, teacherActivity: { type: 'string' }, studentActivity: { type: 'string' }, teachingNotes: { type: 'string' }, assessmentEvidence: { type: 'string' } }, required: ['teacherActivity', 'studentActivity'] },
        prayoga: { type: 'object', properties: { duration: { type: 'string' }, teacherActivity: { type: 'string' }, studentActivity: { type: 'string' }, teachingNotes: { type: 'string' }, assessmentEvidence: { type: 'string' } }, required: ['teacherActivity', 'studentActivity'] },
        prasar:  { type: 'object', properties: { duration: { type: 'string' }, teacherActivity: { type: 'string' }, studentActivity: { type: 'string' }, teachingNotes: { type: 'string' }, assessmentEvidence: { type: 'string' } }, required: ['teacherActivity', 'studentActivity'] },
      },
      required: ['adhiti', 'bodha', 'abhyasa', 'prayoga', 'prasar'],
    },
    assessment: {
      type: 'object',
      properties: {
        questions:   { type: 'array', items: { type: 'string' } },
        support:     { type: 'string' },
        enrichment:  { type: 'string' },
        homework:    { type: 'string' },
        reflection:  { type: 'string' },
      },
    },
  },
  required: ['topic', 'panchapadi'],
}

// Strip any AI-added citation markers like "[cite 1]", "(cite 2)", "[Source 3]".
const stripCitations = (s) => String(s || '').replace(/\s*[\[(](?:cite|source)\s*\d+[\])]/gi, '').trim()

/**
 * Recursively strip citation markers from every string in the returned
 * JSON so the final lesson plan never leaks "[cite 1]", "(Source 2)"
 * etc.  Preserves the object shape.
 */
function cleanCitationsDeep(v) {
  if (v == null) return v
  if (typeof v === 'string') return stripCitations(v)
  if (Array.isArray(v)) return v.map(cleanCitationsDeep)
  if (typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v)) out[k] = cleanCitationsDeep(v[k])
    return out
  }
  return v
}

/**
 * Ask Gemini to read the actual chapter PDF and return a structured
 * lesson plan.  We enforce `responseMimeType=application/json` and
 * `responseSchema` so the model can't wander into markdown/HTML.
 */
export async function generateLessonJson({ pdfBase64, classLabel, subject, book, chapterName, period, periodTime, plannedTopic, plannedSubTopic, chapterTotalPeriods }) {
  const key = GEMINI_KEY()
  if (!key) return { ok: false, error: 'GEMINI_API_KEY not configured' }
  const model = GEMINI_MODEL()
  // Language rule — headings + generated body must follow the subject.
  const langHint = /odia|ଓଡ଼ିଆ/i.test(subject) ? 'Odia (ଓଡ଼ିଆ)'
                : /hindi|हिंदी/i.test(subject) ? 'Hindi (हिन्दी)'
                : /sanskrit|संस्कृत/i.test(subject) ? 'Sanskrit (संस्कृतम्)'
                : /english/i.test(subject) ? 'English'
                : 'English'
  // Admin-approved pacing constraints (Phase 2c).  Hard constraint =
  // both Topic AND Sub-topic set → Gemini must use them verbatim.
  // Soft constraint = only Topic set → Gemini uses Topic, infers rest.
  // No constraint = both blank → Gemini infers everything (legacy).
  const cleanTopic = String(plannedTopic || '').trim()
  const cleanSub = String(plannedSubTopic || '').trim()
  const totalPeriodsLabel = chapterTotalPeriods
    ? `The chapter is planned across ${chapterTotalPeriods} total periods — you are generating Period ${period} of ${chapterTotalPeriods}.`
    : ''
  let pacingBlock = ''
  if (cleanTopic && cleanSub) {
    pacingBlock = [
      `ADMIN-APPROVED PACING (HARD CONSTRAINT):`,
      `  • Topic (must appear verbatim in "prasanga"/"topic" fields): "${cleanTopic}"`,
      `  • Sub-topic (must appear verbatim as the sub-topic / "upa_prasanga"): "${cleanSub}"`,
      `You MUST scope this Period ${period} lesson to these exact strings. Do NOT substitute synonyms.`,
      `Every Panchapadi stage (adhiti…prasar) MUST relate to this Topic + Sub-topic.`,
      totalPeriodsLabel,
    ].filter(Boolean).join('\n')
  } else if (cleanTopic) {
    pacingBlock = [
      `ADMIN-APPROVED PACING (SOFT CONSTRAINT):`,
      `  • Topic (must appear verbatim): "${cleanTopic}"`,
      `  • Sub-topic: NOT SET — infer a suitable sub-topic from the chapter PDF that fits Period ${period}.`,
      totalPeriodsLabel,
    ].filter(Boolean).join('\n')
  } else if (totalPeriodsLabel) {
    pacingBlock = `PACING: ${totalPeriodsLabel} Infer a suitable Topic and Sub-topic for this Period from the chapter PDF.`
  }
  const prompt = [
    `You are a curriculum designer producing a period-level lesson plan for the Odisha SCERT Panchapadi (5-step) methodology.`,
    `Class: ${classLabel}. Subject: ${subject}. Book: ${book}. Chapter file: ${chapterName}. Target period: Period ${period}${periodTime ? ` (${periodTime})` : ''}.`,
    pacingBlock,
    `LANGUAGE: write ALL generated content in ${langHint}. Do NOT translate the source subject into English.`,
    `SOURCE OF TRUTH: read the attached chapter PDF. Extract the actual topic, sub-topic, prerequisite, learning outcomes, teaching-learning material, activities, examples, and assessment opportunities directly from the chapter. Do NOT invent facts. If a field is not covered, return an EMPTY STRING or EMPTY ARRAY for that field.`,
    `PERIOD SCOPING: if the chapter clearly spans multiple periods, generate content appropriate to the requested Period ${period} only (introduction for P1, concept development for P2, practice / application / assessment for later periods).`,
    `PANCHAPADI FIVE STAGES: adhiti (introduction / preparation), bodha (conceptual understanding), abhyasa (guided practice), prayoga (application / expression), prasar (extension / sharing). For each stage produce a duration in minutes ("5 min"), a Teacher Activity, a Student Activity, brief Teaching Notes, and one Assessment Evidence indicator.`,
    `NEVER include citation markers like "[cite 1]", "(Source 2)", "[cite: X]". Never include AI-tool references.`,
    `CODES: only include CG codes, Competency codes, LO codes if they are clearly present in the chapter or its standard NCERT/SCERT curriculum alignment for the topic — otherwise leave the arrays empty.`,
    `Return STRICT JSON matching the provided schema. No prose outside the JSON.`,
  ].filter(Boolean).join('\n\n')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0.4,
      response_mime_type: 'application/json',
      response_schema: LESSON_SCHEMA,
      // Wide budget — chapter PDFs can be dense.
      maxOutputTokens: 8192,
    },
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: j?.error?.message || `Gemini HTTP ${r.status}`, raw: j }
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    if (!text) return { ok: false, error: 'Gemini returned empty content', raw: j }
    let lesson
    try { lesson = JSON.parse(text) } catch (parseErr) {
      // Attempt salvage — model sometimes wraps JSON in ```json ... ```
      const m = /\{[\s\S]*\}/.exec(text)
      if (!m) return { ok: false, error: 'Gemini returned unparseable JSON', rawText: text.slice(0, 500) }
      try { lesson = JSON.parse(m[0]) } catch { return { ok: false, error: 'Gemini JSON salvage failed', rawText: text.slice(0, 500) } }
    }
    lesson = cleanCitationsDeep(lesson)
    return { ok: true, lesson, model, usage: j?.usageMetadata || null }
  } catch (e) {
    return { ok: false, error: e?.message || 'Gemini call failed' }
  }
}

// ────────────────────────── JSON → PANCHAPADI HTML ────────────────────

/** HTML-escape a string. */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const escLines = (s) => esc(s).replace(/\n/g, '<br/>')
const listHtml = (arr) => Array.isArray(arr) && arr.length
  ? `<ul>${arr.filter(Boolean).map(x => `<li>${escLines(x)}</li>`).join('')}</ul>`
  : ''

/**
 * Convert Gemini's structured lesson JSON into a single-period Panchapadi
 * HTML document that matches the EXACT structure of an admin-uploaded
 * Panchapadi HTML file.  That way `parsePanchapadi()` (existing) picks
 * up every section correctly, and the existing `PanchapadiLessonViewer`
 * renders it with zero code changes.
 *
 *   • `.page` wrapper (one per period)
 *   • Lesson Profile table with rows `ଅଧ୍ୟାୟ / ପ୍ରସଙ୍ଗ`, `ପୂର୍ବ ଜ୍ଞାନ`, `ଶିକ୍ଷଣ ସାମଗ୍ରୀ (TLM)`
 *   • Curriculum Alignment table with rows `ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ`, `ଦକ୍ଷତା`, `LO ସଂକେତ`, `ଶିକ୍ଷଣ ଫଳାଫଳ`
 *   • Panchapadi 5-step table with classes aditi / bodh / abhyas / prayog / prasar
 *   • Assessment section with the 5 sub-rows
 *
 * `meta` = { classLabel, bookLabel, chapterLabel, period, periodTime, subject }.
 */
export function jsonToPanchapadiHtml(lesson, meta) {
  const m = meta || {}
  const p = lesson.panchapadi || {}
  const stage = (obj, num, odia, en, css) => `
    <tr class="${css}">
      <td><span class="odia">${odia}</span><br/><span class="en">${en}</span></td>
      <td>${esc(obj?.duration || '')}</td>
      <td>${escLines(obj?.teacherActivity || '')}${obj?.teachingNotes ? `<br/><em>${escLines(obj.teachingNotes)}</em>` : ''}</td>
      <td>${escLines(obj?.studentActivity || '')}</td>
      <td>${escLines(obj?.assessmentEvidence || '')}</td>
    </tr>`
  const asmt = lesson.assessment || {}
  return `<!doctype html>
<html lang="or">
<head>
<meta charset="utf-8"/>
<meta name="em-class" content="${esc(m.classLabel || '')}"/>
<meta name="em-book" content="${esc(m.bookLabel || '')}"/>
<meta name="em-chapter" content="${esc(m.chapterLabel || '')}"/>
<meta name="em-period" content="${esc(String(m.period || 1))}"/>
<meta name="em-generated-by" content="ai-lesson-generator"/>
</head>
<body>
<div class="page">
  <header class="hero">
    <h1>📘 ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ଯୋଜନା · PANCHAPADI LESSON PLAN</h1>
    <p>${esc(m.classLabel || '')} · ${esc(m.subject || '')} · ${esc(m.bookLabel || '')} · ${esc(m.chapterLabel || '')} · ପିରିୟଡ୍ ${esc(String(m.period || 1))}${m.periodTime ? ` (${esc(m.periodTime)})` : ''}</p>
  </header>

  <section>
    <h2>୧ ପାଠ ପରିଚୟ · Lesson Profile</h2>
    <table>
      <tr><td class="label">ଅଧ୍ୟାୟ / ପ୍ରସଙ୍ଗ<small>Chapter / Topic</small></td><td>${escLines(lesson.topic || lesson.chapterTitle || m.chapterLabel || '')}${lesson.subTopic ? `<br/><small>${escLines(lesson.subTopic)}</small>` : ''}</td></tr>
      <tr><td class="label">ପୂର୍ବ ଜ୍ଞାନ<small>Prerequisite</small></td><td>${escLines(lesson.prerequisite || '')}</td></tr>
      <tr><td class="label">ଶିକ୍ଷଣ ସାମଗ୍ରୀ (TLM)<small>Teaching-learning materials</small></td><td>${listHtml(lesson.tlm)}</td></tr>
    </table>
  </section>

  <section>
    <h2>୨ ପାଠ୍ୟକ୍ରମ ସଂଯୋଜନା · Curriculum Alignment</h2>
    <table>
      <tr><td class="label">ପାଠ୍ୟକ୍ରମ ଲକ୍ଷ୍ୟ<small>Curricular goal</small></td><td>${escLines(lesson.curricularGoalOcf || '')}${lesson.curricularGoalScert ? `<br/>${escLines(lesson.curricularGoalScert)}` : ''}</td></tr>
      <tr><td class="label">ଦକ୍ଷତା<small>Competency</small></td><td>${escLines(lesson.competencyOcf || '')}${lesson.competencyScert ? `<br/>${escLines(lesson.competencyScert)}` : ''}</td></tr>
      <tr><td class="label">LO ସଂକେତ<small>LO code</small></td><td>${esc((lesson.loCodes || []).join(', '))}</td></tr>
      <tr><td class="label">ଶିକ୍ଷଣ ଫଳାଫଳ<small>Learning outcomes</small></td><td>${listHtml(lesson.learningOutcomes)}</td></tr>
    </table>
  </section>

  <section>
    <h2>୩ ପଞ୍ଚପଦୀ ଶିକ୍ଷଣ ପ୍ରକ୍ରିୟା · Panchapadi Process</h2>
    <table>
      <thead>
        <tr>
          <th>ସୋପାନ (Stage)</th>
          <th>ସମୟ (Time)</th>
          <th>ଶିକ୍ଷକଙ୍କ କାର୍ଯ୍ୟ (Teacher facilitation)</th>
          <th>ଶିକ୍ଷାର୍ଥୀଙ୍କ କାର୍ଯ୍ୟ (Learner engagement)</th>
          <th>ମୂଲ୍ୟାୟନ ପ୍ରମାଣ (Assessment evidence)</th>
        </tr>
      </thead>
      <tbody>
        ${stage(p.adhiti,  '୧', '୧. ଅଧୀତି',  'Adhiti',  'aditi')}
        ${stage(p.bodha,   '୨', '୨. ବୋଧ',    'Bodha',   'bodh')}
        ${stage(p.abhyasa, '୩', '୩. ଅଭ୍ୟାସ', 'Abhyasa', 'abhyas')}
        ${stage(p.prayoga, '୪', '୪. ପ୍ରୟୋଗ', 'Prayoga', 'prayog')}
        ${stage(p.prasar,  '୫', '୫. ପ୍ରସାର',  'Prasar',  'prasar')}
      </tbody>
    </table>
  </section>

  <section>
    <h2>୪ ମୂଲ୍ୟାୟନ, ସମାବେଶନ ଓ ଚିନ୍ତନ · Assessment, Inclusion &amp; Reflection</h2>
    <table>
      <tr><td class="label">ମୂଲ୍ୟାୟନ ପ୍ରଶ୍ନ / ଏକ୍ଜିଟ୍ ଟିକେଟ୍<small>Assessment Questions / Exit Ticket</small></td><td>${listHtml(asmt.questions)}</td></tr>
      <tr><td class="label">ସହାୟତା ଆବଶ୍ୟକ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ<small>Support for learners needing help</small></td><td>${escLines(asmt.support || '')}</td></tr>
      <tr><td class="label">ଅଗ୍ରଣୀ ଶିକ୍ଷାର୍ଥୀଙ୍କ ପାଇଁ<small>Enrichment</small></td><td>${escLines(asmt.enrichment || '')}</td></tr>
      <tr><td class="label">🏠 ଗୃହକାର୍ଯ୍ୟ<small>Homework / Extension</small></td><td>${escLines(asmt.homework || '')}</td></tr>
      <tr><td class="label">ଶିକ୍ଷକଙ୍କ ଆତ୍ମଚିନ୍ତନ<small>Teacher Reflection</small></td><td>${escLines(asmt.reflection || '')}</td></tr>
    </table>
  </section>
</div>
</body>
</html>`
}
