// =============================================================================
//  Question Paper Generator — single-stage Gemini pipeline
//  ---------------------------------------------------------------------------
//  Fast, focused printable question papers. Unlike full Assessments (which
//  include rubrics, observation sheets, blueprints, etc.), this module produces
//  a clean printable paper: title, instructions, questions grouped by type,
//  and a paired answer key (available as separate PDF download).
//
//  Public API:
//    generateQuestionPaper({ klass, book, chapters, questionMix, difficulty,
//                          durationMin, totalMarks, language, teacherContext,
//                          learningOutcomesInDB })
//      → { title, instructions, totalMarks, durationMin, questions,
//          answerKey, language, meta }
// =============================================================================

// 🔒 Paid AI Credit zone — Gemini ONLY (no OpenAI fallback).
// Question Paper generation delegates to runTwoStage from ai-pipeline.js
// which is itself Gemini-only after the paid-zone hardening.
import { runTwoStage, runDraftStage, normalizeQuestions } from '@/lib/ai-pipeline.js'

// Hard timeout per LLM call — prevents hung Gemini/OpenAI requests from blocking
// the background pipeline forever. If Gemini itself takes >45s we abandon it and
// let the outer pipeline try OpenAI directly.
const LLM_CALL_TIMEOUT_MS = 55_000

// Difficulty levels
export const DIFFICULTIES = {
  easy: { label: 'Easy', hint: 'Focus on Remember & Understand Bloom levels; direct recall from textbook.' },
  medium: { label: 'Medium', hint: 'Balanced mix of Remember/Understand/Apply; some Analyse.' },
  hard: { label: 'Hard', hint: 'Focus on Apply, Analyse, Evaluate, Create; HOTS-heavy.' },
  mixed: { label: 'Mixed', hint: 'Well-balanced mix across all Bloom levels.' },
}

// Standard question types we support (teacher can pick which and how many)
export const QUESTION_TYPES = {
  mcq: { label: 'Multiple Choice (MCQ)', marks: 1 },
  fill: { label: 'Fill in the Blanks', marks: 1 },
  truefalse: { label: 'True or False', marks: 1 },
  match: { label: 'Match the Following', marks: 2 },
  veryshort: { label: 'Very Short Answer', marks: 2 },
  short: { label: 'Short Answer', marks: 3 },
  long: { label: 'Long Answer', marks: 5 },
  casebased: { label: 'Case Study / Passage-based', marks: 4 },
  assertion: { label: 'Assertion & Reason', marks: 1 },
  competency: { label: 'Competency-based', marks: 4 },
  hots: { label: 'HOTS (Higher Order Thinking)', marks: 3 },
}

// Compute total marks from a mix
export function computeTotalMarks(mix = {}) {
  return Object.entries(mix).reduce((sum, [k, count]) => {
    const t = QUESTION_TYPES[k]
    if (!t || !count) return sum
    return sum + (Number(count) * t.marks)
  }, 0)
}

// Sanitize/normalize the question mix
export function normalizeMix(input = {}) {
  const out = {}
  for (const [k, v] of Object.entries(input)) {
    const n = Math.max(0, Math.min(50, Number(v) || 0))
    if (n > 0 && QUESTION_TYPES[k]) out[k] = n
  }
  return out
}

// ------------------- Language detection ------------------------------------
const detectLanguage = (subject = '', bookName = '', override = '') => {
  if (override) return override
  const s = String(subject + ' ' + bookName).toLowerCase()
  if (/(odia|ଓଡ଼ିଆ|ଝୁଲଣା|ବିଚିତ୍ର|ଓଡିଆ)/i.test(s)) return 'odia'
  if (/(math|ganit|arithmetic|geometry|algebra|mathematics)/i.test(s)) return 'odia-math'
  if (/(hindi|हिंदी)/i.test(s)) return 'hindi'
  if (/(english|literature)/i.test(s)) return 'english'
  return 'odia'
}

// ------------------- Build Gemini prompt (single stage) --------------------
// Aligned with the **SCERT Odisha / Directorate of Teacher Education**
// Assessment Framework 2026–27 (Preparatory Stage III–V + Middle Stage VI–VIII).
// The prompt below turns Gemini into an "Official SCERT Odisha Assessment
// Engine" — competency-based, cognitively weighted, activity-anchored, and
// textbook-grounded.
const buildPrompt = ({ klass, book, chapters, questionMix, difficulty, durationMin, totalMarks, language, teacherContext, learningOutcomesInDB, assessmentType }) => {
  const langNote = language === 'odia' ? 'Write EVERYTHING in Odia script (except LO codes like LO-1.4 and English proper nouns).' :
    language === 'odia-math' ? 'Question text in Odia (use Odia digits ୦-୯ where natural), but keep mathematical symbols and formulas readable.' :
    language === 'english' ? 'Write everything in clear, grade-appropriate English.' :
    language === 'hindi' ? 'Write everything in Hindi (Devanagari script).' :
    language === 'sanskrit' ? 'Write everything in Sanskrit (Devanagari script). Follow classical Sanskrit orthography.' :
    'Write in Odia script.'

  const chList = chapters.map((c, i) => `${i + 1}. ${c.name} (id:${c.id})`).join('\n')
  const loList = (learningOutcomesInDB || []).slice(0, 20).map(lo => `- ${lo.code ? lo.code + ': ' : ''}${lo.description || lo.text || lo}`).join('\n')

  // Detect stage from class number so we can apply the correct SCERT rules
  // (Foundational C1-2 / Preparatory C3-5 / Middle C6-8).
  const clsNumMatch = String(klass?.name || '').match(/\d+/)
  const clsNum = clsNumMatch ? Number(clsNumMatch[0]) : null
  const stage = clsNum == null ? 'Elementary'
    : clsNum <= 2 ? 'Foundational'
    : clsNum <= 5 ? 'Preparatory'
    : clsNum <= 8 ? 'Middle'
    : 'Secondary'

  // Assessment-type aware mark structure (per official framework)
  const at = String(assessmentType || '').toLowerCase()
  const isFA = /^fa[12]?$/.test(at) || at === 'formative' || at === 'unit'
  const isSA = /^sa[12]?$/.test(at) || at === 'summative'
  const scertStructure = isFA
    ? `OFFICIAL FA MARK STRUCTURE (per SCERT 2026-27 · ${stage} Stage):
  • Oral Assessment            → 5 marks   (Reading · Recitation · Listening · Speaking · Picture Reading · Story-telling · Q&A · Conversation · Pronunciation)
  • Written Assessment         → 15 marks  (MCQ · Fill · Short · Match · Reasoning · Competency · Application)
  • Performance / Activity     → 5 marks   (Activity · Experiment · Drawing · Observation · Role-play · Art-integration · Hands-on · Field-observation · Model-making)
  • TOTAL                      → 25 marks`
    : isSA
    ? `OFFICIAL SA MARK STRUCTURE (per SCERT 2026-27 · ${stage} Stage):
  • Oral Assessment            → 10 marks
  • Written Assessment         → 40 marks  (mix of MCQ · Fill · Match · Short · Long · Case-based · Competency · HOTS · Diagram · Reasoning)
  • TOTAL                      → 50 marks`
    : `Standard question paper — teacher-defined mix (below).`

  const mixDesc = Object.entries(questionMix)
    .map(([k, n]) => `${n}× ${QUESTION_TYPES[k]?.label || k} (${QUESTION_TYPES[k]?.marks || 1} mark${(QUESTION_TYPES[k]?.marks || 1) > 1 ? 's' : ''} each)`)
    .join(', ')

  const diffMeta = DIFFICULTIES[difficulty] || DIFFICULTIES.mixed

  return `You are the OFFICIAL SCERT ODISHA ASSESSMENT ENGINE for LessonGuru Odisha.

╔══ ROLE ═════════════════════════════════════════════════════════════════╗
You are an expert in NEP 2020, NCF 2023, OCF-SE Odisha, PARAKH, SCERT Odisha,
OSEPA and the **Directorate of Teacher Education & SCERT Odisha Assessment
Framework 2026-27**. Generate assessment materials EXACTLY per the official
framework. Never invent assessment patterns. Never generate questions outside
the uploaded syllabus / chapters / LO codes.

╔══ CONTEXT ══════════════════════════════════════════════════════════════╗
• Class         : ${klass?.name || 'a class'}${clsNum != null ? ` (Class ${clsNum})` : ''}
• Stage         : ${stage} Stage (per SCERT categorisation)
• Book          : ${book?.name || 'chapter set'}
• Assessment    : ${assessmentType ? assessmentType.toUpperCase() : 'Custom Question Paper'}
• Total Marks   : ${totalMarks}
• Duration      : ${durationMin} minutes
• Difficulty    : ${diffMeta.label} — ${diffMeta.hint}

CHAPTERS COVERED (${chapters.length}):
${chList}
${loList ? '\nLEARNING OUTCOMES FROM CURRICULUM DATABASE (must map each question to one of these):\n' + loList + '\n' : ''}
${teacherContext ? 'TEACHER NOTES / CONTEXT:\n' + String(teacherContext).slice(0, 1500) + '\n' : ''}

╔══ SCERT MARK-DISTRIBUTION RULE ═════════════════════════════════════════╗
${scertStructure}

╔══ COGNITIVE WEIGHTAGE (COMPULSORY, per framework) ═════════════════════╗
• Knowledge (Remember)                → 30%
• Understanding (Understand)          → 40%
• Higher-Order Thinking (Apply/Analyse/Evaluate/Create) → 30%
Never create only memory-based questions. Distribute Bloom levels exactly
per the above ratios across the paper.

╔══ COMPETENCY & ACTIVITY-BASED REQUIREMENT ═════════════════════════════╗
• Every paper MUST contain at least one activity-based question
  (Observe · Draw · Colour · Experiment · Role-play · Group activity
   · Survey · Field-visit · Practical · Art-integration · Problem-solving
   · Hands-on · Subject-activity). Mark the question with type "activity"
   or set the boolean flag "isActivity": true.
• Every paper MUST contain at least one competency-based question
  and one application/real-life question.
• Each question must trace to a Learning Outcome (loCode) from the DB
  above whenever possible; otherwise auto-generate a plausible code.

╔══ LANGUAGE RULE (STRICT) ══════════════════════════════════════════════╗
${langNote}
Never mix languages. Never translate into another script. Keep proper nouns
(place names, product names, formulas) intact in their native form.

╔══ TEXTBOOK ALIGNMENT (STRICT) ═════════════════════════════════════════╗
Every question MUST originate from the CHAPTERS list above (or the LO codes
provided). If a topic isn't in these chapters, don't ask about it. Reference
the chapter by name in the "chapterName" field of every question.

╔══ HUMAN, CHILD-FRIENDLY VOICE ═════════════════════════════════════════╗
Write like an experienced Odisha school teacher speaking to a child, not a
robot. Use local names (Rina, Manoj, Suresh, Priya), places (Cuttack,
Bhubaneswar, Puri, our village), everyday objects (mango, jackfruit, bullock
cart, cycle, tiffin box). Vary sentence structure — some short, some longer;
never repeat the same opening pattern. When natural, wrap short/long
questions in a tiny 1-2 line real-life story instead of a dry stem.

╔══ IMAGE / DIAGRAM RULE ════════════════════════════════════════════════╗
If a question NEEDS an image (picture · clock · map · plant · animal ·
apparatus · geometry · graph · table · fraction · human body · traffic sign
· tool · machine · EVS picture), set "needsImage": true on that question and
put a short description in "imageHint" (e.g., "clock showing 3:45",
"line graph of rainfall May-Aug"). The renderer will insert a
print-friendly black-and-white educational illustration next to it.

╔══ QUESTION-MIX (STRICT) ═══════════════════════════════════════════════╗
Generate EXACTLY these counts: ${mixDesc}.
Total marks must equal ${totalMarks}. Duration ${durationMin} minutes.

╔══ MCQ / MATCH RULES ═══════════════════════════════════════════════════╗
• MCQ: exactly 4 options; options MUST be plain strings (never {text, correct}
  objects); the correct option TEXT goes in the "answer" field.
• Match: options[] = left column, matchB[] = right column (same length).

╔══ MAPPING FIELDS PER QUESTION (COMPULSORY) ════════════════════════════╗
Each question object must include:
  q, type, marks, chapterName, loCode, competency, bloomLevel,
  difficulty, section ("oral"|"written"|"performance"|"activity"),
  isActivity (boolean), needsImage (boolean), imageHint (string, optional).

╔══ ANSWER KEY (COMPULSORY) ═════════════════════════════════════════════╗
For every question generate a matching answerKey entry:
  qNumber (1-based), answer (model answer), stepMarks (array — step-marking
  for long/case questions), keywords (array — accepted key terms for
  short-answer grading), explanation (1-2 lines — why this is the answer).

╔══ INSTRUCTIONS ROW (TOP OF PAPER) ═════════════════════════════════════╗
Write 2-3 lines: time, marks, sections, general rules. Professional Odisha
school-examination tone.

╔══ QUALITY CHECK — BEFORE YOU OUTPUT ═══════════════════════════════════╗
✓ Official SCERT 2026-27 pattern followed
✓ Correct stage (${stage})
✓ Total marks = ${totalMarks}
✓ Bloom 30/40/30 distribution
✓ Activity + competency + application present
✓ Diagrams flagged where needed (needsImage:true)
✓ LO, competency, Bloom mapped on every question
✓ Language = ${language}
✓ No spelling / grammar mistakes
✓ Textbook alignment maintained
✓ Human, teacher-like voice; no AI phrasing

Output STRICTLY valid JSON matching the schema. NO markdown fences, NO preamble.`
}

// ------------------- JSON schema for Gemini structured output --------------
const questionPaperSchema = {
  type: 'object',
  required: ['title', 'instructions', 'totalMarks', 'durationMin', 'questions', 'answerKey'],
  properties: {
    title: { type: 'string' },
    instructions: { type: 'string' },
    totalMarks: { type: 'number' },
    durationMin: { type: 'number' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['q', 'type', 'marks'],
        properties: {
          q: { type: 'string' },
          type: { type: 'string' },
          marks: { type: 'number' },
          options: { type: 'array', items: { type: 'string' } },
          matchB: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          chapterName: { type: 'string' },
          loCode: { type: 'string' },
          competency: { type: 'string' },
          bloomLevel: { type: 'string' },
          difficulty: { type: 'string' },
          section: { type: 'string' },        // 'oral' | 'written' | 'performance' | 'activity'
          isActivity: { type: 'boolean' },
          needsImage: { type: 'boolean' },
          imageHint: { type: 'string' },
        },
      },
    },
    answerKey: {
      type: 'array',
      items: {
        type: 'object',
        required: ['qNumber', 'answer'],
        properties: {
          qNumber: { type: 'number' },
          answer: { type: 'string' },
          stepMarks: { type: 'array', items: { type: 'string' } },
          keywords: { type: 'array', items: { type: 'string' } },
          explanation: { type: 'string' },
        },
      },
    },
  },
}

// ------------------- Phase 2: chunked generation for large papers ----------
// For 50-mark SA papers (and any large custom paper) a single Gemini call that
// must emit ~25-30 questions frequently exceeds the 55s per-call timeout and
// times out. Instead we split the question-mix into small batches, generate
// each batch as its own fast Gemini call IN PARALLEL, then merge + renumber.
// This dramatically cuts per-call size/latency and timeout risk.
function buildBatches(mix, maxPerBatch = 6) {
  const entries = Object.entries(mix).filter(([, n]) => n > 0)
  const batches = []
  let cur = {}, curCount = 0
  for (const [type, count] of entries) {
    let remaining = Number(count) || 0
    while (remaining > 0) {
      const space = maxPerBatch - curCount
      const take = Math.min(remaining, space)
      cur[type] = (cur[type] || 0) + take
      curCount += take
      remaining -= take
      if (curCount >= maxPerBatch) { batches.push(cur); cur = {}; curCount = 0 }
    }
  }
  if (curCount > 0) batches.push(cur)
  return batches.length ? batches : [{ ...mix }]
}

async function generateChunkedDraft({ context, k, b, chs, normMix, difficulty, duration, marks, lang, teacherContext, loCodes, assessmentType, versionSuffix }) {
  const batches = buildBatches(normMix, 6)
  const promptFor = (batchMix) => buildPrompt({
    klass: k, book: b, chapters: chs, questionMix: batchMix, difficulty,
    durationMin: duration, totalMarks: computeTotalMarks(batchMix),
    language: lang, teacherContext, learningOutcomesInDB: loCodes, assessmentType,
  }) + `\n\n╔══ CHUNKED GENERATION (IMPORTANT) ═════════════════════════════════════╗
You are generating ONE PART of a larger ${marks}-mark paper. Output ONLY the
exact questions requested above, each with its matching answerKey entry.
Number questions LOCALLY starting from 1. Leave "title" and "instructions"
EMPTY (they are assembled by the app). Keep the same strict language, LO
mapping, Bloom balance and textbook-grounding rules.` + (versionSuffix || '')

  // Run all batches in parallel; sections are distinct question types so
  // duplicate risk is low, and a single failing batch never kills the paper.
  const results = await Promise.allSettled(
    batches.map(bm => runDraftStage({ ctx: context, taskPrompt: promptFor(bm), schema: questionPaperSchema, label: 'sa-chunk' }))
  )

  const mergedQuestions = []
  const mergedAnswerKey = []
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    const dv = r.value
    const qs = Array.isArray(dv.questions) ? dv.questions : []
    const ak = Array.isArray(dv.answerKey) ? dv.answerKey : []
    const akByNo = new Map(ak.map(a => [Number(a.qNumber) || 0, a]))
    qs.forEach((q, i) => {
      const globalNo = mergedQuestions.length + 1
      mergedQuestions.push(q)
      const a = akByNo.get(i + 1) || akByNo.get(Number(q.qNumber) || (i + 1)) || {}
      mergedAnswerKey.push({ ...a, qNumber: globalNo })
    })
  }
  if (!mergedQuestions.length) throw new Error('Chunked generation produced no questions')
  return { title: '', instructions: '', totalMarks: marks, durationMin: duration, questions: mergedQuestions, answerKey: mergedAnswerKey }
}

// ------------------- Public API --------------------------------------------
/**
 * Generate a question paper grounded in existing lesson content.
 *
 * @param {Object} args
 * @param {Object} args.ctx  - Lesson context bundle from lesson-context.js
 *   (contains klass, book, chapters, lessons, loCodes, compactContext, etc.)
 *   Alternative: pass klass/book/chapters directly for legacy callers.
 * @param {Function} [args.onDraftReady] - optional callback invoked with the
 *   Gemini draft before humanization (used for progressive UX)
 */
export async function generateQuestionPaper({
  ctx, klass, book, chapters, questionMix, difficulty = 'mixed',
  durationMin, totalMarks, language, teacherContext,
  learningOutcomesInDB,
  assessmentType,
  numVersions = 1,   // 🆕 1 (default) or up to 5 — SCERT compliance
  onDraftReady,
  onVersionReady,    // 🆕 progressive callback per completed version
}) {
  // Legacy support: derive ctx if not passed (still works but without lesson content)
  const context = ctx || { klass, book, chapters, lessons: [], loCodes: learningOutcomesInDB || [], compactContext: `Class: ${klass?.name}\nBook: ${book?.name}\nChapters: ${(chapters || []).map(c => c.name).join(', ')}` }
  const k = context.klass, b = context.book, chs = context.chapters
  if (!k || !b || !Array.isArray(chs) || chs.length === 0) {
    throw new Error('class, book, and chapters are required')
  }
  const normMix = normalizeMix(questionMix)
  if (Object.keys(normMix).length === 0) {
    throw new Error('At least one question type must be selected')
  }

  const lang = detectLanguage(b?.name, b?.name, language)
  const marks = totalMarks || computeTotalMarks(normMix)
  const duration = durationMin || Math.min(180, Math.max(30, Math.round(marks * 1.5)))
  const N = Math.max(1, Math.min(5, Number(numVersions) || 1))
  const versionLabels = ['A', 'B', 'C', 'D', 'E'].slice(0, N)

  // ---------------------------------------------------------------------
  // Post-processing helper — sanitises Gemini's raw output into the
  // canonical shape expected by the storage layer + PDF renderer.
  // ---------------------------------------------------------------------
  const finaliseDraft = (draft) => {
    const questions = Array.isArray(draft.questions) ? draft.questions.map((q, i) => {
      const rawOptions = Array.isArray(q.options) ? q.options : undefined
      const options = rawOptions ? rawOptions.map(o => typeof o === 'string' ? o : (o?.text || o?.option || o?.label || String(o))) : undefined
      const matchB = Array.isArray(q.matchB) ? q.matchB.map(o => typeof o === 'string' ? o : (o?.text || o?.option || o?.label || String(o))) : undefined
      const answer = typeof q.answer === 'string' ? q.answer : (q.answer?.text || q.answer?.value || (q.answer ? JSON.stringify(q.answer) : ''))
      return {
        q: String(q.q || q.question || q.text || '').trim(),
        type: String(q.type || 'short').toLowerCase().replace(/\s+/g, ''),
        marks: Number(q.marks) || (QUESTION_TYPES[q.type]?.marks || 1),
        options, matchB, answer,
        chapterName: q.chapterName || (chs[0]?.name || ''),
        loCode: q.loCode || '',
        competency: q.competency || '',
        bloomLevel: q.bloomLevel || '',
        difficulty: q.difficulty || difficulty,
        section: q.section || 'written',
        isActivity: Boolean(q.isActivity),
        needsImage: Boolean(q.needsImage),
        imageHint: q.imageHint || '',
        qNumber: i + 1,
      }
    }) : []
    const answerKey = Array.isArray(draft.answerKey) ? draft.answerKey.map(a => ({
      qNumber: Number(a.qNumber) || 0,
      answer: String(a.answer || ''),
      stepMarks: Array.isArray(a.stepMarks) ? a.stepMarks : [],
      keywords: Array.isArray(a.keywords) ? a.keywords : [],
      explanation: String(a.explanation || ''),
    })) : []
    return {
      title: String(draft.title || `Question Paper — ${k?.name || ''} · ${b?.name || ''}`).trim(),
      instructions: String(draft.instructions || '').trim(),
      totalMarks: Number(draft.totalMarks) || marks,
      durationMin: Number(draft.durationMin) || duration,
      questions,
      answerKey,
    }
  }

  // ---------------------------------------------------------------------
  // Generate versions SEQUENTIALLY.  Serial (not parallel) so we respect
  // Gemini's rate limits and keep memory low.  Each subsequent version is
  // told to be DIFFERENT from the ones already generated (question stems,
  // order, examples, case studies) — this is what makes A/B/C/D/E useful
  // for exam-hall row rotation.
  // ---------------------------------------------------------------------
  const versions = []
  for (let i = 0; i < N; i++) {
    const label = versionLabels[i]
    const seenSummaries = versions.map((v, idx) =>
      `Version ${versionLabels[idx]} first-5 stems: ${v.questions.slice(0, 5).map(q => q.q.slice(0, 60)).join(' | ')}`
    ).join('\n')
    const versionSuffix = N > 1
      ? `\n\n╔══ MULTI-VERSION MODE — YOU ARE GENERATING VERSION ${label} of ${N} (A-${versionLabels[N-1]}) ═╗
This must be COMPLETELY DIFFERENT from the other versions on:
  • Every question stem (rephrase differently — different characters, different numbers, different scenarios)
  • Order of question types within each section
  • MCQ distractor options
  • Case-study passages
  • Diagrams referenced
  • Application/HOTS questions
${seenSummaries ? `\nVersions already generated (do NOT repeat these):\n${seenSummaries}` : ''}
Keep the exact same question-mix counts, marks, LO alignment and Bloom distribution.
Set the "title" field to: "${k?.name || ''} · ${b?.name || ''} — Version ${label}".`
      : ''

    const taskPrompt = buildPrompt({
      klass: k, book: b, chapters: chs,
      questionMix: normMix,
      difficulty, durationMin: duration, totalMarks: marks,
      language: lang, teacherContext,
      learningOutcomesInDB: context.loCodes || [],
      assessmentType,
    }) + versionSuffix

    // Phase 2: large papers (50-mark SA or 14+ questions) generate section-by-
    // section in parallel and skip the second humanize pass — this keeps each
    // Gemini call small/fast and well under the 55s timeout. Smaller papers keep
    // the richer two-stage (draft → humanize) pipeline unchanged.
    const totalQ = Object.values(normMix).reduce((a, c) => a + (Number(c) || 0), 0)
    const isLarge = marks >= 40 || totalQ >= 14
    let draft
    if (isLarge) {
      draft = await generateChunkedDraft({
        context, k, b, chs, normMix, difficulty, duration, marks,
        lang, teacherContext, loCodes: context.loCodes || [], assessmentType,
        versionSuffix,
      })
      draft.title = `${k?.name || ''}${b?.name ? ' · ' + b.name : ''}${N > 1 ? ` — Version ${label}` : ''}`.trim()
      if (i === 0) { try { await onDraftReady?.(draft) } catch (_e) { /* non-fatal */ } }
    } else {
      const res = await runTwoStage({
        ctx: context,
        draftPrompt: taskPrompt,
        draftSchema: questionPaperSchema,
        extraGuidance: `Question paper for ${k?.name || ''}${b?.name ? ' · ' + b.name : ''}. Preserve the exact question mix (counts) and difficulty level.${N > 1 ? ` This is Version ${label} of ${N}.` : ''}`,
        onDraftReady: i === 0 ? onDraftReady : undefined,
      })
      draft = res.polished
    }
    const finished = { label, ...finaliseDraft(draft) }
    versions.push(finished)
    try { await onVersionReady?.(finished, i, N) } catch (_e) { /* ignore */ }
  }

  // Legacy fields: expose Version A as the top-level questions/answerKey/etc.
  // so all existing renderer/PDF/UI code keeps working without changes.
  const primary = versions[0] || { title: '', instructions: '', questions: [], answerKey: [], totalMarks: marks, durationMin: duration }
  return {
    title: primary.title || `Question Paper — ${k?.name || ''} · ${b?.name || ''}`,
    instructions: primary.instructions,
    totalMarks: primary.totalMarks,
    durationMin: primary.durationMin,
    questions: primary.questions,
    answerKey: primary.answerKey,
    versions,                              // 🆕 all A-E versions
    numVersions: versions.length,
    language: lang,
    difficulty,
    questionMix: normMix,
    meta: {
      chapterCount: chs.length,
      generatedAt: new Date().toISOString(),
      groundedInLessonContent: context.hasContent || false,
      assessmentType: assessmentType || null,
      framework: 'SCERT Odisha 2026-27',
      numVersions: versions.length,
    },
  }
}
