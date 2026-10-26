// ============================================================================
//  Professional Assessment Builder — Main Orchestrator
//  ---------------------------------------------------------------------------
//  Given a builder configuration + read-only lesson context, this module:
//    1. Distributes total marks across the selected WRITTEN question types.
//    2. Fires ONE dedicated Gemini prompt per question type in parallel.
//    3. Optionally fires prompts for Teacher-Conducted blocks (Oral, Practical,
//       Observation, Rubrics).
//    4. Assembles a single AssessmentPacket object ready for HTML rendering.
//    5. Builds the Blueprint deterministically from sections + LO codes.
//
//  Gemini-preferred pipeline with automatic OpenAI (gpt-4o-mini) fallback.
//  If Gemini is rate-limited / quota-exhausted / errors out, the same request
//  is transparently retried against OpenAI so teachers never see "Server is busy".
// ============================================================================

import { generateJSONGeminiOnly } from './gemini.js'
import { buildLessonContext, buildPromptContext } from './lesson-context.js'
import { findOrGenerateBatch } from './image-library.js'
import {
  WRITTEN_TYPES,
  TEACHER_CONDUCTED_TYPES,
  ASSESSMENT_TYPE_LABELS,
  toOdiaNum,
  ODIA_SECTION_LETTERS,
} from './prompts/question-types.js'
import { distributeMarks, distributeDifficulty } from './prompts/marks-distribution.js'
import {
  promptMCQ, promptFill, promptMatch, promptTrueFalse, promptOneWord,
  promptVSA, promptSA, promptLA, promptHOTS, promptCompetency,
  promptCaseStudy, promptPicture, promptDiagram, promptActivity, promptProject,
  promptOral, promptPractical, promptObservation, promptRubrics,
  promptHeader, buildBlueprintFromSections,
} from './prompts/assessment.js'

// Map registry key → prompt builder + response reader
const PROMPT_MAP = {
  mcq:        { build: promptMCQ,        pick: r => r.questions || [] },
  fill:       { build: promptFill,       pick: r => r.questions || [] },
  match:      { build: promptMatch,      pick: r => [r] }, // one big match block
  truefalse:  { build: promptTrueFalse,  pick: r => r.questions || [] },
  oneword:    { build: promptOneWord,    pick: r => r.questions || [] },
  vsa:        { build: promptVSA,        pick: r => r.questions || [] },
  sa:         { build: promptSA,         pick: r => r.questions || [] },
  la:         { build: promptLA,         pick: r => r.questions || [] },
  competency: { build: promptCompetency, pick: r => r.questions || [] },
  hots:       { build: promptHOTS,       pick: r => r.questions || [] },
  casestudy:  { build: promptCaseStudy,  pick: r => r.cases || [] },
  picture:    { build: promptPicture,    pick: r => r.items || [] },
  diagram:    { build: promptDiagram,    pick: r => r.items || [] },
  activity:   { build: promptActivity,   pick: r => r.items || [] },
  project:    { build: promptProject,    pick: r => r.items || [] },
}

// Sensible durations per total marks (SCERT convention)
export function guessDuration(totalMarks) {
  if (totalMarks <= 25) return 45
  if (totalMarks <= 40) return 60
  if (totalMarks <= 50) return 75
  if (totalMarks <= 80) return 120
  return 180
}

// Convert any internal error into a friendly user-facing string.
// Never leak provider names (Gemini/OpenAI) — teachers don't care.
function userSafeError(err) {
  const msg = String(err?.message || '').toLowerCase()
  if (msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('exhaust')) {
    return 'Server is busy right now. Please try again in a minute.'
  }
  if (msg.includes('timeout') || msg.includes('etimedout')) {
    return 'Content generation timed out. Please try again.'
  }
  if (msg.includes('not configured')) {
    return 'Service is temporarily unavailable. Please contact support.'
  }
  return 'Content could not be generated for this section. Please try again.'
}

/**
 * Build a Professional Assessment.
 *
 * @param {import('mongodb').Db} db
 * @param {Object} cfg
 *   assessmentType    'fa1' | 'fa2' | 'sa1' | 'sa2' | 'practice' | 'unit' | 'revision'
 *   classId, bookId
 *   chapterIds[]                         chapter ids used as read-only context
 *   totalMarks        number             25 | 50 | 80 | 100 | custom
 *   writtenTypes[]    string[]           subset of Object.keys(WRITTEN_TYPES)
 *   teacherConducted[] string[]          subset of Object.keys(TEACHER_CONDUCTED_TYPES)
 *   difficulty        { easy, medium, hard }  percent (default 40/40/20)
 *   includeAnswerKey  boolean
 *   includeBlueprint  boolean
 *   includeObservation boolean
 *   includeRubrics    boolean
 *   language          'odia' (default)
 *   onProgress        optional (stage) => void
 *
 * @returns {Promise<AssessmentPacket>}
 */
export async function buildProfessionalAssessment(db, cfg) {
  const {
    assessmentType = 'fa1',
    classId, bookId, chapterIds,
    totalMarks = 25,
    writtenTypes = ['mcq', 'fill', 'vsa', 'la'],
    teacherConducted = [],
    difficulty = { easy: 40, medium: 40, hard: 20 },
    includeAnswerKey = true,
    includeBlueprint = true,
    includeObservation = false,
    includeRubrics = false,
    language = 'odia',
    strictLanguageLock = false,
    onProgress = () => {},
  } = cfg

  if (!classId || !bookId || !Array.isArray(chapterIds) || chapterIds.length === 0) {
    throw new Error('classId, bookId, and chapterIds[] are required')
  }
  if (!Array.isArray(writtenTypes) || writtenTypes.length === 0) {
    throw new Error('writtenTypes[] must contain at least one question type')
  }

  // 1. Fetch read-only lesson context
  onProgress('reading')
  const ctx = await buildLessonContext(db, { classId, bookId, chapterIds })
  if (!ctx.hasContent) {
    throw new Error('No lesson content found for the selected chapters — cannot build assessment.')
  }
  const contextBlock = buildPromptContext(ctx, 'LESSON CONTENT (READ-ONLY)')

  // 1.b Detect PRIMARY VISUAL MODE — Balvatika, Class 1, 2, 3.
  //     Admin can override via cfg.visualMode: true|false|'auto' (default 'auto').
  const primaryClassNames = ['balvatika', 'class 1', 'class 2', 'class 3', 'ପ୍ରଥମ', 'ଦ୍ୱିତୀୟ', 'ତୃତୀୟ', 'ବାଳବାଟିକା']
  const clsName = String(ctx.klass?.name || '').toLowerCase()
  const clsNameOd = String(ctx.klass?.nameOdia || '')
  const isPrimary = primaryClassNames.some(p => clsName.includes(p) || clsNameOd.includes(p))
  const visualMode = cfg.visualMode === true
    ? true
    : (cfg.visualMode === false ? false : isPrimary)
  const generateImages = cfg.generateImages !== false && visualMode // opt-out with cfg.generateImages=false

  // 1.b.2  Detect PRIMARY-FA CLASSES (Balvatika + Class 1..5) for the SCERT/OSEPA
  //        oral-first mark structure: FA papers for these classes are ALWAYS
  //        25 total = 5-mark Oral Test (rendered first) + 20-mark Written.
  //        Falls back to `visualMode` for classes we couldn't parse.
  const primaryFAClassNames = [
    'balvatika', 'ବାଳବାଟିକା',
    'class 1', 'class 2', 'class 3', 'class 4', 'class 5',
    'ପ୍ରଥମ', 'ଦ୍ୱିତୀୟ', 'ତୃତୀୟ', 'ଚତୁର୍ଥ', 'ପଞ୍ଚମ',
  ]
  const isPrimaryFAClass = primaryFAClassNames.some(p => clsName.includes(p) || clsNameOd.includes(p)) || isPrimary
  const isFormativeType = /^(fa|formative)/i.test(String(assessmentType || ''))
  const useOralFirstStructure = cfg.oralFirst === true
    ? true
    : (cfg.oralFirst === false ? false : (isPrimaryFAClass && isFormativeType))

  // 1.c AUTO-ADD PICTURE SECTION for primary classes when the teacher didn't
  //     explicitly include one. Picture questions are the most visual/engaging
  //     format for young learners and get a dedicated illustration each.
  //     Only injected when:
  //       - visualMode is on (primary class detected or admin override)
  //       - user did NOT already include 'picture' in writtenTypes
  //       - cfg.autoAddPictureSection !== false (opt-out available)
  //       - totalMarks is large enough (>= 15) to accommodate an extra section
  let effectiveWrittenTypes = [...writtenTypes]
  let autoAddedPictureSection = false
  if (visualMode
      && cfg.autoAddPictureSection !== false
      && !effectiveWrittenTypes.includes('picture')
      && totalMarks >= 15) {
    // Inject 'picture' at the end of the paper — matches SCERT convention where
    // observation-heavy questions come after MCQ/Fill/Match.
    effectiveWrittenTypes.push('picture')
    autoAddedPictureSection = true
  }

  // 1.d AUTO-DETECT PAPER LANGUAGE FROM SUBJECT — strict SCERT/OSEPA rule:
  //     the entire paper (questions, instructions, answer key, blueprint,
  //     observation, rubrics) must be written in the language of the subject.
  //     English subject → English · Hindi → Hindi · Sanskrit → Sanskrit ·
  //     everything else (including Odia, EVS, Maths, Science, Social) → Odia.
  //     Teacher can override by explicitly passing cfg.language.
  const bookNameLower = String(ctx.book?.name || '').toLowerCase()
  const bookNameOdia = String(ctx.book?.nameOdia || '')
  const englishSubjectMarkers  = ['english', 'english reader', 'my english', 'englishreader', 'ଇଂରାଜୀ', 'ଇଂଲିଶ']
  const hindiSubjectMarkers    = ['hindi', 'हिन्दी', 'हिंदी', 'हिन्दि', 'ହିନ୍ଦୀ', 'ହିନ୍ଦି']
  const sanskritSubjectMarkers = ['sanskrit', 'संस्कृत', 'ସଂସ୍କୃତ', 'ସଂସ୍କୃତା']
  const matchesAny = (arr) => arr.some(m => bookNameLower.includes(m.toLowerCase()) || bookNameOdia.includes(m))
  const looksEnglishSubject  = matchesAny(englishSubjectMarkers)
  const looksHindiSubject    = matchesAny(hindiSubjectMarkers)
  const looksSanskritSubject = matchesAny(sanskritSubjectMarkers)
  const autoLanguage = looksEnglishSubject
    ? 'english'
    : looksHindiSubject
      ? 'hindi'
      : looksSanskritSubject
        ? 'sanskrit'
        : 'odia'
  // Only auto-flip when caller didn't explicitly pick a language.
  const finalLanguage = cfg.language ? cfg.language : autoLanguage
  const digitFmt = finalLanguage === 'english' ? (n) => String(n) : toOdiaNum

  // 1.e  PROMPT VARIABLES PREAMBLE — surface the selected Subject AND the
  //      Output Language as top-of-prompt variables in EVERY per-type
  //      prompt.  This works alongside the SCERT_LANGUAGE_POLICY block
  //      inside `commonRules` to slash the chance Gemini defaults to Odia
  //      when the subject is English / Hindi / Sanskrit.
  const outputLangLabel = ({
    english: 'English',
    hindi: 'Hindi (Devanagari)',
    sanskrit: 'Sanskrit (Devanagari)',
    odia: 'Odia (ଓଡ଼ିଆ)',
  })[String(finalLanguage || 'odia').toLowerCase()] || 'Odia (ଓଡ଼ିଆ)'
  const langCode = ({ english: 'en', hindi: 'hi', sanskrit: 'sa', odia: 'or' })[String(finalLanguage || 'odia').toLowerCase()] || 'or'
  // When the caller passed strictLanguageLock:true from the UI, the paper
  // MUST be generated in the picked language regardless of book/chapter/PDF
  // language.  Surface this as a top-of-prompt flag for the model.
  const strictLock = strictLanguageLock ? 'TRUE' : 'FALSE'
  const promptVariablesBlock = `================================================================
PROMPT VARIABLES (highest priority — obey exactly)
================================================================
Selected Class            :  ${ctx.klass?.name || '(not provided)'}
Selected Subject          :  ${ctx.book?.name || '(not provided)'}
Selected Chapters         :  ${(ctx.chapters || []).map(c => c.name).join(' · ') || '(not provided)'}
Assessment Type           :  ${ASSESSMENT_TYPE_LABELS[assessmentType] || assessmentType}
Output Language           :  ${outputLangLabel}
Language Code             :  ${langCode}
Strict Language Lock      :  ${strictLock}

${strictLanguageLock ? `⚠️  STRICT LANGUAGE LOCK IS ACTIVE — the paper MUST be generated in
    ${outputLangLabel}.  The book PDF language, chapter title language,
    school language, state, or ANY previous context DOES NOT decide the
    output language.  ONLY the "Output Language" field above decides it.
    If any sentence is generated in another language, delete the output
    and regenerate the entire paper in ${outputLangLabel}.` : ''}
`.trim()
  // Prepend to context so every downstream prompt inherits the variables.
  const contextBlockWithVars = `${promptVariablesBlock}\n\n${contextBlock}`

  // 2. Compute marks distribution
  //    When the SCERT oral-first primary FA structure is active, the paper
  //    is split as: Oral (5, block) + Written (totalMarks - 5) — the written
  //    section total is reduced by 5 so the paper still totals 25 marks.
  const oralMarks = useOralFirstStructure ? 5 : 0
  const writtenTargetMarks = Math.max(5, totalMarks - oralMarks)
  const sections = distributeMarks(writtenTargetMarks, effectiveWrittenTypes)
  // Attach registry bloom-level to sections for blueprint use
  for (const s of sections) s.bloom = WRITTEN_TYPES[s.key]?.bloomLevel || 'Understand'

  // 3. Header (Gemini) — with automatic retry once, respecting server-provided retryAfterSec
  onProgress('header')
  const assessmentTypeLabel = ASSESSMENT_TYPE_LABELS[assessmentType] || assessmentType
  const durationMin = guessDuration(totalMarks)
  let headerFatalErr = null   // if the daily quota is exhausted we short-circuit sections too
  const headerCall = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await generateJSONGeminiOnly({
          ...promptHeader({ contextBlock: contextBlockWithVars, assessmentTypeLabel, totalMarks, durationMin, sections, language: finalLanguage, className: ctx.klass?.name || '' }),
          temperature: 0.5,
        })
      } catch (e) {
        console.warn(`[assessment-builder] header attempt ${attempt + 1} failed:`, e?.message)
        if (e?.isDailyQuota) { headerFatalErr = e; break }
        if (attempt === 0) await new Promise(r => setTimeout(r, Math.min((e?.retryAfterSec || 1) * 1000, 3000)))
      }
    }
    return { title: `${assessmentTypeLabel} — ${ctx.chapters.map(c => c.name).join(', ')}`, instructions: [] }
  })()

  // 4. Generate each written section SEQUENTIALLY (Gemini-only).
  //    Sequential order avoids burst rate limits that were causing all
  //    4 parallel calls to fail together on production.  Each section also
  //    retries up to 3 times with progressive backoff before giving up.
  onProgress('sections')
  const generatedSections = []
  for (let idx = 0; idx < sections.length; idx++) {
    const s = sections[idx]
    onProgress(`section-${idx + 1}-of-${sections.length}`)
    const mp = PROMPT_MAP[s.key]
    if (!mp) { generatedSections.push({ ...s, questions: [] }); continue }
    const diffCounts = distributeDifficulty(s.count, difficulty)
    const built = mp.build({
      count: s.count,
      contextBlock: contextBlockWithVars,
      difficultyMix: {
        easy:   digitFmt(diffCounts.easy),
        medium: digitFmt(diffCounts.medium),
        hard:   digitFmt(diffCounts.hard),
      },
      marksPerQ: s.marksPerQ,
      primaryVisual: visualMode, // ← enables child-friendly stems + conceptKey field for MCQ/Fill
      language: finalLanguage,   // ← 'english' for English-subject books; else 'odia'
      className: ctx.klass?.name || '',
    })
    let lastErr = null
    let sectionResult = null
    // If the header call detected a daily-quota fatal error, don't even try —
    // save the user 30+ seconds of waiting on doomed retries.
    if (headerFatalErr) {
      generatedSections.push({ ...s, questions: [], error: userSafeError(headerFatalErr) })
      continue
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await generateJSONGeminiOnly({ prompt: built.prompt, schema: built.schema, temperature: 0.6 })
        const items = mp.pick(raw)
        if (Array.isArray(items) && items.length > 0) {
          sectionResult = { ...s, questions: items.slice(0, Math.max(s.count, items.length)) }
          break
        }
        lastErr = new Error('Content generation returned an empty response for this section.')
      } catch (e) {
        lastErr = e
        console.warn(`[assessment-builder] section ${s.key} attempt ${attempt + 1} failed:`, e?.message)
        // Daily quota exhausted → don't retry, don't try the next sections either.
        if (e?.isDailyQuota) { headerFatalErr = e; break }
      }
      // Respect Gemini's server-provided retry delay when it's short; otherwise fall back to progressive backoff.
      if (attempt < 2) {
        const suggested = (lastErr?.retryAfterSec || 0) * 1000
        const wait = suggested > 0 && suggested <= 5000 ? suggested : 800 * (attempt + 1)
        await new Promise(r => setTimeout(r, wait))
      }
    }
    if (!sectionResult) {
      sectionResult = { ...s, questions: [], error: userSafeError(lastErr) }
    }
    generatedSections.push(sectionResult)
    // Small stagger between sections to be gentle on the upstream rate limits
    if (idx < sections.length - 1) await new Promise(r => setTimeout(r, 250))
  }

  // 5. Optional Teacher-Conducted blocks
  onProgress('teacher-blocks')
  const teacherBlocks = {}
  const teacherCalls = []
  const selectedTC = new Set([...(teacherConducted || [])])
  if (includeObservation) selectedTC.add('observation')
  if (includeRubrics)     selectedTC.add('rubrics')
  // ⭐ SCERT / OSEPA primary-FA rule — Balvatika through Class 5 formative
  //    papers must ALWAYS include the Oral Test (5 marks, 5 items, placed
  //    FIRST in the packet).  Teacher can opt-out via cfg.oralFirst=false.
  if (useOralFirstStructure) selectedTC.add('oral')

  const tcBuilders = {
    oral:        { build: () => promptOral({ count: 5, contextBlock: contextBlockWithVars, language: finalLanguage, className: ctx.klass?.name || '' }), key: 'oral' },
    practical:   { build: () => promptPractical({ count: 3, contextBlock: contextBlockWithVars, language: finalLanguage, className: ctx.klass?.name || '' }), key: 'practical' },
    observation: { build: () => promptObservation({ contextBlock: contextBlockWithVars, language: finalLanguage, className: ctx.klass?.name || '' }), key: 'observation' },
    rubrics:     { build: () => promptRubrics({ contextBlock: contextBlockWithVars, language: finalLanguage, className: ctx.klass?.name || '' }), key: 'rubrics' },
  }
  for (const k of selectedTC) {
    const b = tcBuilders[k]; if (!b) continue
    teacherCalls.push((async () => {
      try {
        const built = b.build()
        const raw = await generateJSONGeminiOnly({ prompt: built.prompt, schema: built.schema, temperature: 0.5 })
        teacherBlocks[b.key] = raw
      } catch (e) {
        teacherBlocks[b.key] = { error: userSafeError(e) }
      }
    })())
  }

  await Promise.all(teacherCalls)
  const header = await headerCall

  // 6. IMAGE ENRICHMENT — primary visual mode only.
  //    Walk every question in every section, collect distinct conceptKeys,
  //    batch-lookup in the library / generate missing ones, and attach the
  //    resulting Cloudinary URL back onto each question/item.
  const imageStats = { attempted: 0, cached: 0, generated: 0, failed: 0 }
  if (generateImages) {
    try {
      onProgress('images')
      const toEnrich = [] // {section, item, concept, mode}
      for (const s of generatedSections) {
        const mode = s.key === 'diagram' ? 'diagram' : 'illustration'
        for (const item of (s.questions || [])) {
          const key = item?.conceptKey || null
          if (key && String(key).trim()) {
            toEnrich.push({ section: s, item, concept: String(key).trim(), mode })
          }
        }
      }
      // Deduplicate by (concept, mode) so we don't request the same image twice
      const uniq = new Map()
      for (const t of toEnrich) {
        const k = `${t.mode}::${t.concept.toLowerCase()}`
        if (!uniq.has(k)) uniq.set(k, { concept: t.concept, mode: t.mode })
      }
      const items = Array.from(uniq.values())
      imageStats.attempted = items.length
      if (items.length > 0) {
        const results = await findOrGenerateBatch(db, items, {
          className: ctx.klass?.name,
          subjectHints: [ctx.book?.name].filter(Boolean),
          aspectRatio: '1:1',
          concurrency: 3,
        })
        // Build lookup map: (mode+concept) → url
        const urlMap = new Map()
        for (let i = 0; i < items.length; i++) {
          const r = results[i]
          if (r?.image?.url) {
            const k = `${items[i].mode}::${items[i].concept.toLowerCase()}`
            urlMap.set(k, r.image.url)
            if (r.cached) imageStats.cached++ ; else imageStats.generated++
          } else {
            imageStats.failed++
          }
        }
        // Attach URLs back onto each matching question
        for (const t of toEnrich) {
          const k = `${t.mode}::${t.concept.toLowerCase()}`
          const url = urlMap.get(k)
          if (url) t.item.image_url = url
        }
      }
    } catch (e) {
      console.warn('[assessment-builder] image enrichment failed:', e?.message)
    }
  }

  // 7. Blueprint (deterministic from sections + LO codes)
  const blueprint = includeBlueprint
    ? buildBlueprintFromSections({ sections: generatedSections, chapters: ctx.chapters, loCodes: ctx.loCodes })
    : []

  // 7. Answer Key — flatten questions with answers from generated sections
  const answerKey = includeAnswerKey ? extractAnswerKey(generatedSections) : []

  onProgress('done')
  const totalQuestions = generatedSections.reduce((s, x) => s + (x.questions?.length || 0), 0)
  const failedSections = generatedSections.filter(s => (s.questions?.length || 0) === 0)
  const allFailed = generatedSections.length > 0 && failedSections.length === generatedSections.length
  return {
    // meta
    assessmentType,
    assessmentTypeLabel,
    totalMarks,
    durationMin,
    language,
    title: header?.title || `${assessmentTypeLabel} — ${ctx.chapters.map(c => c.name).join(', ')}`,
    instructions: Array.isArray(header?.instructions) ? header.instructions : [],
    className: ctx.klass?.name || '',
    classNameOdia: ctx.klass?.nameOdia || ctx.klass?.name || '',
    bookName: ctx.book?.name || '',
    chapterNames: ctx.chapters.map(c => c.name),
    // paper
    sections: generatedSections,
    // extras
    teacherBlocks,
    blueprint,
    answerKey,
    // flags
    includeAnswerKey, includeBlueprint, includeObservation, includeRubrics,
    // health/telemetry so callers can decide to retry or surface an error
    totalQuestionsGenerated: totalQuestions,
    failedSectionKeys: failedSections.map(s => s.key),
    sectionErrors: failedSections.filter(s => s.error).map(s => ({ key: s.key, error: s.error })),
    allSectionsFailed: allFailed,
    // Visual/image telemetry (primary classes)
    visualMode,
    imagesEnabled: generateImages,
    imageStats,
    autoAddedPictureSection,
    writtenTypesSelected: writtenTypes,
    writtenTypesEffective: effectiveWrittenTypes,
    finalLanguage,   // 'english' | 'odia' — auto-detected from book subject unless overridden
    // ⭐ SCERT / OSEPA primary-FA structure flags — surfaced so the renderer
    //    can print the "5-mark Oral Test" page FIRST and label the written
    //    section as "Written Test (20 marks)".
    oralFirstStructure: useOralFirstStructure,
    oralMarks,
    writtenMarks: writtenTargetMarks,
    generatedAt: new Date(),
  }
}

// Flatten questions from all sections into a numbered answer-key list.
function extractAnswerKey(sections) {
  const key = []
  let n = 1
  for (const s of sections) {
    for (const q of (s.questions || [])) {
      // Match sections yield a single "match" object — expand to numbered pairs
      if (s.key === 'match' && q.answers) {
        for (const pair of q.answers) key.push({ n: n++, section: s.sectionLetterOdia, q: pair.left, answer: pair.right, marks: s.marksPerQ })
        continue
      }
      if (s.key === 'casestudy' && q.subQuestions) {
        for (const sq of q.subQuestions) key.push({ n: n++, section: s.sectionLetterOdia, q: sq.q, answer: sq.answer, marks: s.marksPerQ })
        continue
      }
      if (s.key === 'picture' && q.subQuestions) {
        for (const sq of q.subQuestions) key.push({ n: n++, section: s.sectionLetterOdia, q: sq.q, answer: sq.answer, marks: s.marksPerQ })
        continue
      }
      if (s.key === 'diagram') {
        key.push({ n: n++, section: s.sectionLetterOdia, q: q.q, answer: (q.expectedLabels || []).join(', '), marks: s.marksPerQ })
        continue
      }
      if (s.key === 'activity' || s.key === 'project') {
        key.push({ n: n++, section: s.sectionLetterOdia, q: q.title, answer: q.expectedOutcome || q.evaluation || '', marks: s.marksPerQ })
        continue
      }
      key.push({ n: n++, section: s.sectionLetterOdia, q: q.q || q.situation || '', answer: q.answer || '', marks: s.marksPerQ })
    }
  }
  return key
}

// Public re-exports for API layer convenience
export {
  WRITTEN_TYPES, TEACHER_CONDUCTED_TYPES, ASSESSMENT_TYPE_LABELS,
  distributeMarks, distributeDifficulty,
  ODIA_SECTION_LETTERS, toOdiaNum,
}
