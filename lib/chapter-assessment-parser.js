// ============================================================
// Chapter Assessments — deterministic 5-section detector
// ============================================================
// Splits ONE admin-uploaded HTML file into 5 individual assessment
// sub-documents.  Uses PRIMARY (structured) markers first, then
// falls back to HEADING-based detection.  No AI / no Gemini.
//
// Public API:
//   detectAssessmentSections(rawHtml) →
//     { sections: [{ index, title, html }], warnings: [], detectedCount }
//
//   splitAssessmentPreview(sections, index) →
//     returns just section[index-1] as a stand-alone HTML fragment
//     (used by the admin preview UI and the user PDF/print endpoints).
//
// Note: `rawHtml` is expected to already be sanitized by
// /app/lib/academic-resources.js `sanitizeResourceHtml()` — the
// detector operates purely as text-processing on the sanitized markup.
// ============================================================

// ---- Structured (PRIMARY) detection ----------------------------------------
// Any of the following identify a section:
//   <section data-assessment-number="1">…</section>   ← official template
//   <section data-assessment="1">…</section>          ← legacy alias
//   <div class="assessment-1">…</div>                 ← legacy alias
//   <div class="assessment assessment-1">…</div>      ← legacy alias
//   <article data-assessment-number="1">…</article>
//
// We use a lightweight regex-based extractor rather than a full DOM
// parser because sanitize-html has already normalized the markup; a
// balanced-tag scanner works reliably for these container tags.
//
// The regex captures the tag, the number (from either attribute style),
// and the inner body.  Order matters: `data-assessment-number` must be
// checked BEFORE `data-assessment` because "data-assessment=…" is a
// prefix of the longer attribute name.
const STRUCTURED_RE = new RegExp(
  '<(section|div|article)\\b[^>]*(?:data-assessment-number=["\']?(\\d+)["\']?|data-assessment=["\']?(\\d+)["\']?|class=["\'][^"\']*\\bassessment[-_](\\d+)\\b[^"\']*["\'])[^>]*>([\\s\\S]*?)</\\1>',
  'gi',
)

// ---- Heading-based (FALLBACK) detection ------------------------------------
// Matches `Assessment 1`, `Assessment - 1`, `Test 3`, `ମୂଲ୍ୟାଙ୍କନ ୧`,
// `ପରୀକ୍ଷା 2`, etc. inside a heading tag (h1..h6, p.assessment-title).
//
// Odia digit range: U+0B66 (୦) .. U+0B6F (୯)
// We normalise all detected numbers to Latin digits.
const ODIA_DIGIT_MAP = { '୦': '0', '୧': '1', '୨': '2', '୩': '3', '୪': '4', '୫': '5', '୬': '6', '୭': '7', '୮': '8', '୯': '9' }
const toLatinDigits = s => s.replace(/[୦-୯]/g, d => ODIA_DIGIT_MAP[d] || d)

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

// Words that indicate an assessment heading in supported languages.
// Ordered longest-first so 'ମୂଲ୍ୟାଙ୍କନ' matches before shorter tokens.
const ASSESSMENT_KEYWORDS = [
  'assessment', 'test', 'evaluation', 'quiz', 'exam',
  'ମୂଲ୍ୟାଙ୍କନ', 'ପରୀକ୍ଷା', 'ମୂଲ୍ୟାୟନ', 'ଅଭ୍ୟାସ',
]

// Compile a case-insensitive regex that finds a heading whose text
// contains one of the keywords followed by a 1–5 digit number.
const HEADING_TEXT_RE = new RegExp(
  '(?:' + ASSESSMENT_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|') + ')' +
  '\\s*[-–—:.#]?\\s*' +
  '(?:no\\.?|number|nos\\.?)?\\s*' +
  '(\\d+|[୦-୯]+|[IVX]+)',
  'i',
)

function extractHeadingText(html) {
  // Strip tags to get plain heading text for the keyword match.
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Given full sanitized HTML, walk through and find heading positions
// that match the assessment pattern.  Returns [{ index:1..5, title,
// startOffset, endOffset }] — endOffset is the start of the NEXT
// matching heading (or EOF for the last section).
function findHeadingSplits(html) {
  const matches = []
  const headingRE = new RegExp(`<(${HEADING_TAGS.join('|')})\\b[^>]*>([\\s\\S]*?)</\\1>`, 'gi')
  let m
  while ((m = headingRE.exec(html)) !== null) {
    const inner = extractHeadingText(m[2])
    const km = HEADING_TEXT_RE.exec(inner)
    if (!km) continue
    let num = km[1]
    // Odia → Latin digits
    num = toLatinDigits(num)
    // Roman → Arabic (up to V)
    const roman = { I: 1, II: 2, III: 3, IV: 4, V: 5 }
    let idx = roman[num.toUpperCase()] ? roman[num.toUpperCase()] : parseInt(num, 10)
    if (!idx || idx < 1 || idx > 5) continue
    matches.push({ index: idx, title: inner, startOffset: m.index, endOffset: null })
  }
  // Attach endOffset = next split's startOffset OR EOF.
  for (let i = 0; i < matches.length; i++) {
    matches[i].endOffset = i < matches.length - 1 ? matches[i + 1].startOffset : html.length
  }
  return matches
}

/**
 * @param {string} rawHtml — already sanitized HTML.
 * @returns {{ sections: {index:number,title:string,html:string}[], warnings: string[], detectedCount: number }}
 */
export function detectAssessmentSections(rawHtml) {
  const warnings = []
  const html = String(rawHtml || '')
  if (html.trim().length < 20) {
    return { sections: [], warnings: ['HTML too small to detect any assessment.'], detectedCount: 0 }
  }

  // ---- Strategy 1: structured markers ----
  STRUCTURED_RE.lastIndex = 0
  const structured = []
  let m
  while ((m = STRUCTURED_RE.exec(html)) !== null) {
    // capture groups (1-based): 1=tagName, 2=data-assessment-number,
    // 3=data-assessment, 4=class="assessment-N", 5=inner body
    const idx = parseInt(m[2] || m[3] || m[4] || '0', 10)
    if (!idx || idx < 1 || idx > 5) continue
    // Avoid duplicates but record them for validation.
    const dup = structured.find(s => s.index === idx)
    if (dup) {
      dup.duplicate = true
      continue
    }
    const inner = m[5]
    // Try to grab a title from the first heading inside the section.
    let title = `Assessment ${idx}`
    const headingMatch = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/i.exec(inner)
    if (headingMatch) title = extractHeadingText(headingMatch[2]) || title
    // Validation flags for the admin UI ------------------------
    // hasTitle: an h1..h6 exists (any text).
    const hasTitle = !!headingMatch
    // hasQuestions: rough heuristic — does the section body (excluding
    // the title heading) contain at least one <p>, <li>, <td>, or a
    // `.question` block?  We intentionally keep this loose to avoid
    // false-flagging valid but short assessments.
    const bodyWithoutTitle = inner.replace(headingMatch ? headingMatch[0] : '', '')
    const hasQuestionElements = /<(p|li|td)\b[^>]*>[\s\S]*?<\/(p|li|td)>/i.test(bodyWithoutTitle)
      || /<div\b[^>]*class=["'][^"']*\bquestion\b[^"']*["'][^>]*>/i.test(bodyWithoutTitle)
    // Also require at least ~10 characters of readable text so an empty
    // .questions container doesn't slip through.
    const readableText = bodyWithoutTitle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const hasQuestions = hasQuestionElements && readableText.length >= 10
    structured.push({ index: idx, title, html: inner.trim(), hasTitle, hasQuestions, duplicate: false })
  }
  if (structured.length > 0) {
    structured.sort((a, b) => a.index - b.index)
    const detectedCount = structured.length
    // Emit precise per-assessment warnings so the admin knows EXACTLY what to fix.
    const missing = [1, 2, 3, 4, 5].filter(n => !structured.find(x => x.index === n))
    if (missing.length) warnings.push(`Missing assessment(s): ${missing.join(', ')}.`)
    for (const s of structured) {
      if (s.duplicate)     warnings.push(`Duplicate marker for Assessment ${s.index}.`)
      if (!s.hasTitle)     warnings.push(`Assessment ${s.index} has no <h2> title.`)
      if (!s.hasQuestions) warnings.push(`Assessment ${s.index} contains no questions.`)
    }
    return { sections: structured, warnings, detectedCount }
  }

  // ---- Strategy 2: heading-based fallback ----
  const splits = findHeadingSplits(html)
  if (splits.length === 0) {
    return {
      sections: [],
      warnings: [
        'Could not detect any assessment section. Please add either:',
        '  • Structured markers: <section data-assessment="1"> … </section>',
        '  • Or headings like "Assessment 1", "Test 2", "ମୂଲ୍ୟାଙ୍କନ ୩" for each assessment.',
      ],
      detectedCount: 0,
    }
  }
  // Multiple headings with the same number → keep the first, drop rest.
  const seen = new Set()
  const uniq = splits.filter(s => (seen.has(s.index) ? false : (seen.add(s.index), true)))
  uniq.sort((a, b) => a.index - b.index)

  const sections = uniq.map((s) => ({
    index: s.index,
    title: s.title.slice(0, 200) || `Assessment ${s.index}`,
    html: html.slice(s.startOffset, s.endOffset).trim(),
  }))

  const detectedCount = sections.length
  if (detectedCount !== 5) {
    warnings.push(`Expected 5 assessments, but detected ${detectedCount}. Missing: ${[1, 2, 3, 4, 5].filter(n => !sections.find(x => x.index === n)).join(', ') || 'none'}.`)
  }
  return { sections, warnings, detectedCount }
}

/**
 * Get a single assessment (1..5) as a stand-alone HTML fragment.
 * Returns null if the requested number was not detected.
 */
export function getAssessmentSection(sections, assessmentNumber) {
  const idx = parseInt(assessmentNumber, 10)
  if (!idx || idx < 1 || idx > 5) return null
  return (sections || []).find(s => s.index === idx) || null
}
