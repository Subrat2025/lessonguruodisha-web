// =============================================================================
//  Lesson Context — Read-Only Source of Truth for AI Resource Generation
//  ---------------------------------------------------------------------------
//  Fetches lesson content stored in the LessonGuru DB for a given
//  (class, book, chapter[s]) combination and builds a compact context bundle
//  suitable for injection into Gemini / ChatGPT prompts.
//
//  ★ NEVER modifies anything. Read-only fetch + string assembly.
//
//  Public API:
//    buildLessonContext(db, { classId, bookId, chapterIds }) →
//      { klass, book, chapters, lessons, loCodes, hasContent, summary,
//        compactContext, subjectName }
// =============================================================================

/** Strip HTML tags + collapse whitespace so lesson content becomes AI-friendly. */
export function stripHTML(html = '') {
  if (!html) return ''
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Utility: normalize an item that could be string, array or object, into a
 *  clean bullet list string for prompts. */
export function normalizeList(x, max = 12) {
  if (!x) return ''
  if (Array.isArray(x)) {
    return x.slice(0, max).map(v => {
      if (typeof v === 'string') return '- ' + v
      const t = v?.text || v?.title || v?.name || v?.description || v?.question || v?.q
      return t ? '- ' + t : ''
    }).filter(Boolean).join('\n')
  }
  if (typeof x === 'string') return '- ' + stripHTML(x)
  if (typeof x === 'object') {
    return Object.entries(x).slice(0, max).map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')
  }
  return ''
}

/** Estimate rough character budget for a lesson section in the prompt. */
const clip = (s, n = 1200) => {
  const clean = stripHTML(s)
  return clean.length > n ? clean.substring(0, n) + '…' : clean
}

/**
 * Fetch class, book, chapters, all lessons (periods) for those chapters, and
 * mapped Learning Outcome codes. Returns a bundle safe to inject in prompts.
 *
 * @param {import('mongodb').Db} db  Mongo db handle
 * @param {Object} args
 * @param {string} args.classId
 * @param {string} args.bookId
 * @param {string[]} args.chapterIds
 * @returns {Promise<{ klass:any, book:any, chapters:any[], lessons:any[],
 *   loCodes:any[], subjectName:string, hasContent:boolean, summary:string,
 *   compactContext:string, contextByChapter:Record<string,string> }>}
 */
export async function buildLessonContext(db, { classId, bookId, chapterIds }) {
  if (!db) throw new Error('db is required')
  if (!classId || !bookId || !Array.isArray(chapterIds) || chapterIds.length === 0) {
    throw new Error('classId, bookId, and chapterIds[] are required')
  }

  const [klass, book, chapters, lessons] = await Promise.all([
    db.collection('classes').findOne({ id: classId }, { projection: { _id: 0 } }),
    db.collection('books').findOne({ id: bookId }, { projection: { _id: 0 } }),
    // Pull the extracted chapter PDF text as well so we can inject it as the
    // Priority-1 "BOOK PDF" block for AI retrieval.
    db.collection('chapters').find({ id: { $in: chapterIds } }, { projection: {
      _id: 0, id: 1, name: 1, title: 1, order: 1, summary: 1,
      pdfText: 1, pdfTextChars: 1, pdfPages: 1, pdfTextOk: 1, pdfFilename: 1,
    } }).sort({ order: 1 }).toArray(),
    db.collection('lessons').find({ chapterId: { $in: chapterIds } }, { projection: { _id: 0 } }).sort({ period: 1 }).toArray(),
  ])
  // loCodes query depends on klass.code so run after the initial fetch
  const loCodes = await db.collection('loCodes').find({
    $or: [{ chapterId: { $in: chapterIds } }, { classCode: klass?.code, bookId }],
  }, { projection: { _id: 0, code: 1, description: 1, competency: 1, bloomLevel: 1 } }).limit(30).toArray().catch(() => [])

  // ── PRIORITY 3: STORED LESSONGURU RESOURCES ─────────────────────────
  // Multi-source retrieval — pull existing worksheets, prior assessments,
  // question bank items, question papers, and educational images for the
  // SAME chapter(s). These are surfaced to the AI as REFERENCE MATERIAL so
  // it can (a) learn the difficulty/style already used, and (b) avoid
  // duplicating existing questions. All queries are size-capped so total
  // prompt tokens remain within LLM limits.
  const [refWorksheets, refAssessments, refQBank, refPapers, refImages] = await Promise.all([
    db.collection('worksheets').find(
      { chapterId: { $in: chapterIds } },
      { projection: { _id: 0, id: 1, title: 1, type: 1, format: 1, difficulty: 1, questions: 1, generatedAt: 1 } }
    ).sort({ generatedAt: -1 }).limit(4).toArray().catch(() => []),
    db.collection('assessments').find(
      { chapterIds: { $in: chapterIds } },
      { projection: { _id: 0, id: 1, title: 1, type: 1, language: 1, questions: 1, createdAt: 1 } }
    ).sort({ createdAt: -1 }).limit(4).toArray().catch(() => []),
    db.collection('question_bank_items').find(
      { chapterId: { $in: chapterIds }, active: { $ne: false } },
      { projection: { _id: 0, id: 1, question: 1, questionType: 1, difficulty: 1, marks: 1, loCode: 1, options: 1, correctAnswer: 1 } }
    ).limit(15).toArray().catch(() => []),
    db.collection('question_papers').find(
      { chapterIds: { $in: chapterIds } },
      { projection: { _id: 0, id: 1, title: 1, questions: 1, createdAt: 1 } }
    ).sort({ createdAt: -1 }).limit(3).toArray().catch(() => []),
    db.collection('educational_images').find(
      { $or: [{ classHints: klass?.name }, { subjectHints: book?.name }], approved: { $ne: false } },
      { projection: { _id: 0, concept: 1, description: 1, tags: 1 } }
    ).limit(15).toArray().catch(() => []),
  ])

  const subjectName = book?.name || book?.subject || ''
  const hasContent = lessons.length > 0

  // Build compact context per chapter, prioritising fields most useful for AI:
  //   content (short) · teacherNotes (medium) · panchapadi (short)
  //   learningOutcomes · activities · worksheet · homework · loCodes
  const contextByChapter = {}
  for (const ch of chapters) {
    const chLessons = lessons.filter(l => l.chapterId === ch.id)
    const parts = []
    parts.push(`══ CHAPTER: ${ch.name} ══`)
    if (ch.totalPeriods) parts.push(`(Total periods: ${ch.totalPeriods}${chLessons.length ? ', lessons in DB: ' + chLessons.length : ''})`)

    // Aggregate LOs across all lessons of this chapter
    const chLos = new Set()
    for (const l of chLessons) {
      if (Array.isArray(l.learningOutcomes)) for (const lo of l.learningOutcomes) {
        const t = typeof lo === 'string' ? lo : (lo?.description || lo?.text || '')
        if (t) chLos.add(t.substring(0, 200))
      }
      if (Array.isArray(l.loCodes)) for (const c of l.loCodes) chLos.add(typeof c === 'string' ? c : (c?.code || ''))
    }
    if (chLos.size > 0) {
      parts.push('\n▸ LEARNING OUTCOMES (from lesson data):')
      parts.push([...chLos].slice(0, 12).map(x => '  • ' + x).join('\n'))
    }

    // Panchapadi / teaching methodology (compressed) — up to first 2 lessons
    for (const [i, l] of chLessons.slice(0, 3).entries()) {
      parts.push(`\n▸ PERIOD ${l.period || i + 1}: ${l.title || ''}`)
      if (l.content) parts.push('  Content:\n    ' + clip(l.content, 900).replace(/\n/g, '\n    '))
      if (l.teacherNotes) parts.push('  Teacher Notes: ' + clip(l.teacherNotes, 400))
      if (l.tlm) parts.push('  TLM: ' + clip(l.tlm, 200))
      if (l.panchapadi || l.panchapadiSopana) {
        const p = l.panchapadi || l.panchapadiSopana
        const pText = typeof p === 'string' ? p : JSON.stringify(p).replace(/[{}"[\]]/g, ' ')
        parts.push('  Panchapadi (5-step): ' + clip(pText, 300))
      }
      if (l.activities?.length) parts.push('  Activities:\n' + normalizeList(l.activities, 4).replace(/^/gm, '    '))
      if (l.worksheet) parts.push('  Worksheet hints: ' + clip(typeof l.worksheet === 'string' ? l.worksheet : JSON.stringify(l.worksheet), 300))
      if (l.homework) parts.push('  Homework: ' + clip(typeof l.homework === 'string' ? l.homework : JSON.stringify(l.homework), 200))
      if (l.assessmentQuestions?.length) parts.push('  Sample teacher assessment Qs:\n' + normalizeList(l.assessmentQuestions, 4).replace(/^/gm, '    '))
    }
    if (chLessons.length > 3) parts.push(`\n  (+ ${chLessons.length - 3} more periods with additional content omitted for brevity)`)

    contextByChapter[ch.id] = parts.join('\n')
  }

  const compactContext = chapters.map(ch => contextByChapter[ch.id] || '').filter(Boolean).join('\n\n')

  // ── Build "REFERENCE MATERIAL" appendix (Priority 3) ────────────────
  // Compact enough to keep total prompt <20 KB. Callers can skip this by
  // reading `compactContext` only; assessment / worksheet builders now
  // include `referenceMaterial` after the lesson content block.
  const refParts = []
  // Surface competencies extracted from loCodes so the model can align
  // questions to them (Priority 4 SCERT compliance).
  const competencies = Array.from(new Set(
    (loCodes || []).map(x => (x?.competency || '').trim()).filter(Boolean)
  )).slice(0, 12)
  if (competencies.length) {
    refParts.push('▸ COMPETENCIES (from LO codes):')
    refParts.push(competencies.map(c => '  • ' + c).join('\n'))
  }
  if (refWorksheets.length) {
    refParts.push('\n▸ REFERENCE WORKSHEETS (already exist for this chapter — DO NOT duplicate their questions; use only for style/difficulty calibration):')
    for (const w of refWorksheets.slice(0, 4)) {
      const sampleQs = (w.questions || []).slice(0, 3).map(q => '     – ' + clip(q?.q || q?.question || '', 140)).filter(x => x.length > 8).join('\n')
      refParts.push(`  • [${w.type || w.format || 'worksheet'} · ${w.difficulty || 'medium'}] ${w.title || '(untitled)'}\n${sampleQs}`)
    }
  }
  if (refAssessments.length) {
    refParts.push('\n▸ REFERENCE PRIOR ASSESSMENTS (already generated for this chapter — DO NOT duplicate; use only to avoid repetition):')
    for (const a of refAssessments.slice(0, 4)) {
      const sampleQs = (a.questions || []).slice(0, 3).map(q => '     – ' + clip(q?.q || q?.question || '', 140)).filter(x => x.length > 8).join('\n')
      refParts.push(`  • [${a.type || 'assessment'}] ${a.title || '(untitled)'}\n${sampleQs}`)
    }
  }
  if (refPapers.length) {
    refParts.push('\n▸ REFERENCE QUESTION PAPERS (prior sets for this chapter):')
    for (const p of refPapers.slice(0, 3)) {
      const sampleQs = (p.questions || []).slice(0, 2).map(q => '     – ' + clip(q?.q || q?.question || '', 140)).filter(x => x.length > 8).join('\n')
      refParts.push(`  • ${p.title || '(untitled)'}\n${sampleQs}`)
    }
  }
  if (refQBank.length) {
    refParts.push('\n▸ REFERENCE QUESTION BANK (curriculum-mapped items — use as style hints only, do not copy verbatim):')
    for (const q of refQBank.slice(0, 12)) {
      refParts.push(`  • [${q.questionType || 'q'} · ${q.difficulty || 'M'} · ${q.marks || 1}m${q.loCode ? ' · ' + q.loCode : ''}] ` + clip(q.question || '', 160))
    }
  }
  if (refImages.length) {
    refParts.push('\n▸ REFERENCE IMAGE CONCEPTS (available in library — good candidates for picture-based questions):')
    refParts.push('  ' + refImages.slice(0, 15).map(i => i.concept).filter(Boolean).join(' · '))
  }
  // ── PRIORITY 1: OFFICIAL TEXTBOOK PDF (extracted chapter text) ─────────
  // If the admin has uploaded a chapter PDF and text extraction succeeded,
  // surface the raw chapter text as the highest-priority source. Each
  // chapter contributes at most ~8 KB (~2.5k tokens) so a multi-chapter
  // context still stays within Gemini/OpenAI context limits.
  const bookPdfParts = []
  for (const ch of chapters) {
    const rawTxt = String(ch?.pdfText || '').trim()
    if (!rawTxt || rawTxt.length < 40) continue
    const capped = rawTxt.length > 8000 ? rawTxt.slice(0, 8000) + '\n[…truncated for context window]' : rawTxt
    bookPdfParts.push(`▸ ${ch.name || ch.title || 'Chapter'} — ${ch.pdfFilename || 'chapter.pdf'} (${ch.pdfPages || '?'} pages, ${ch.pdfTextChars || rawTxt.length} chars extracted)\n${capped}`)
  }
  const bookPdfContext = bookPdfParts.length
    ? `════════════════ BOOK PDF — CHAPTER TEXT (Priority 1) ════════════════\n(Extracted from the official textbook PDF. Use to understand concepts only —\n never copy sentences verbatim into questions.)\n\n${bookPdfParts.join('\n\n')}\n════════════════════════════════════════════════════════════════════\n\n`
    : ''

  const referenceMaterial = refParts.length
    ? `\n\n════════════════ REFERENCE MATERIAL (Priority 3) ════════════════\n${refParts.join('\n')}\n════════════════════════════════════════════════════════════════`
    : ''

  // Human-readable summary (for logging + admin display)
  const bookPdfsAvailable = chapters.filter(c => c?.pdfTextOk && (c?.pdfTextChars || 0) > 40).length
  const summary = `Class ${klass?.name || classId} · ${subjectName} · ${chapters.length} chapter(s), ${lessons.length} lesson(s) in DB, ${loCodes.length} LO codes, ${bookPdfsAvailable}/${chapters.length} book PDFs, ${refWorksheets.length} worksheets, ${refAssessments.length} prior assessments, ${refQBank.length} QBank items.`

  return {
    klass, book, chapters, lessons, loCodes,
    subjectName, hasContent, summary,
    compactContext, contextByChapter,
    // Priority 1 — official textbook PDF text
    bookPdfContext, bookPdfsAvailable,
    // Multi-source retrieval (Priority 3 references + Priority 4 competencies)
    competencies, refWorksheets, refAssessments, refQBank, refPapers, refImages,
    referenceMaterial,
  }
}

/**
 * Guardrail block appended to every AI prompt so the model uses ONLY the
 * provided lesson content as source of truth.
 */
export const LESSON_CONTEXT_GUARDRAIL = `
STRICT SOURCE-OF-TRUTH RULES (VIOLATION = INVALID OUTPUT):
- Use ONLY the LESSON CONTENT provided above as the source of facts, examples, and vocabulary.
- Do NOT invent topics that are not in the lesson.
- Do NOT rewrite, translate away from, or replace the lesson's terminology.
- Do NOT introduce curriculum from other classes or subjects.
- If the lesson uses specific characters, examples, illustrations, or vocabulary, PREFER those exact same items in your generated questions.
- If a fact isn't in the lesson, do NOT include it — even if it's true in general knowledge.
- Learning Outcome codes (LO-1.4 etc.) referenced above must be preserved exactly.
- Chapter names, subject names, and book names must be preserved exactly.
`.trim()

/**
 * Convenience: return the guardrail + book PDF text + compact context +
 * reference material — the full multi-source bundle ready to inject into a
 * Gemini / OpenAI prompt.
 *   • Priority 1 = book PDF chapter text (if extracted)
 *   • Priority 2 = compact lesson content (all periods, merged)
 *   • Priority 3 = reference worksheets / prior assessments / QB / images
 *   • Priority 4 = curriculum guardrail
 */
export function buildPromptContext(ctx, headerLabel = 'LESSON CONTENT') {
  const pdfBlock = ctx?.bookPdfContext || ''
  const refBlock = ctx?.referenceMaterial || ''
  return `${pdfBlock}${headerLabel}\n${'─'.repeat(60)}\n${ctx.compactContext}${refBlock}\n${'─'.repeat(60)}\n\n${LESSON_CONTEXT_GUARDRAIL}\n`
}
