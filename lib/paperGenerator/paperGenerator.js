// ============================================================
// LessonGuru Odisha — FA/SA Paper Generator (v2)
// Public: generatePaper(input, db) → { ok, html, retries, language, validation, warnings }
//
// Architecture:
//   1. Compute the SECTION PLAN (single source of truth).
//   2. Fetch OFFICIAL LO CODES from MongoDB `loCodes` collection.
//   3. Call Gemini ONCE for structured JSON of the WHOLE assessment.
//   4. Run the validator (schema + content + language + LO + marks).
//   5. If invalid, retry up to 2 more times feeding back exact errors.
//   6. Render Question Paper + Answer Key + Marking Scheme + Blueprint
//      from the same validated dataset (never a second Gemini call).
// ============================================================

import crypto from 'crypto'
import { SYSTEM_INSTRUCTION } from './systemInstruction.js'
import { buildUserPrompt } from './userPromptBuilder.js'
import { validateAssessment } from './validator.js'
import { planSections, planFromDistribution, gradeToInt } from './sectionPlanner.js'
import { fetchLOCodes } from './loCodeResolver.js'
import { renderAssessmentHTML } from './htmlRenderer.js'
import { renderObservationHTML } from './observationRenderer.js'
import { ASSESSMENT_SCHEMA } from './schema.js'

const CACHE = new Map()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ATTEMPTS = 3

function hashInput(input, plan) {
  const key = JSON.stringify({
    grade: input.grade, subject: input.subject, language: input.language,
    assessment_type: input.assessment_type, term: input.term,
    full_marks: input.full_marks,
    chapters_or_topics: (input.chapters_or_topics || '').trim(),
    variation_seed: input.variation_seed || '',
    plan_hash: plan.map(p => `${p.id}${p.count}${p.marksEach}${p.type}`).join('|'),
  })
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)
}

function isFoundationalGrade(grade) {
  const g = String(grade || '').toUpperCase().trim()
  return ['I', 'II', '1', '2'].includes(g)
}

async function callGeminiJSON({ system, user }) {
  const { generateJSONGeminiOnly, geminiEnabled } = await import('@/lib/gemini.js')
  if (!geminiEnabled()) throw Object.assign(new Error('Gemini not configured'), { code: 'GEMINI_DISABLED' })
  return await generateJSONGeminiOnly({
    prompt: user,
    schema: ASSESSMENT_SCHEMA,
    temperature: 0.35,
    systemInstruction: system,
  })
}

// Normalise the Gemini output: some fields may be missing / typed oddly.
function normalize(data) {
  if (!data || typeof data !== 'object') return { assessment: {}, questions: [] }
  const A = data.assessment && typeof data.assessment === 'object' ? data.assessment : {}
  const Q = Array.isArray(data.questions) ? data.questions : []
  A.total_marks = Number(A.total_marks) || 0
  A.instructions = Array.isArray(A.instructions) ? A.instructions.map(String) : []
  A.chapters = Array.isArray(A.chapters) ? A.chapters.map(String) : []
  const cleaned = Q.map((q, i) => ({
    question_no: Number(q?.question_no) || (i + 1),
    section: String(q?.section || '').trim().toUpperCase(),
    type: String(q?.type || '').trim().toUpperCase(),
    question: String(q?.question || '').trim(),
    options: Array.isArray(q?.options) ? q.options.map(x => String(x || '').trim()) : [],
    correct_option: String(q?.correct_option || '').trim().toUpperCase(),
    answer: String(q?.answer || '').trim(),
    marks: Number(q?.marks) || 0,
    chapter: String(q?.chapter || '').trim(),
    lo_code: String(q?.lo_code || '').trim(),
    competency: String(q?.competency || '').trim(),
    bloom_level: String(q?.bloom_level || '').trim(),
    value_points: Array.isArray(q?.value_points) ? q.value_points.map(x => String(x || '').trim()).filter(Boolean) : [],
    stepwise_marks: Array.isArray(q?.stepwise_marks)
      ? q.stepwise_marks.map(s => ({ point: String(s?.point || '').trim(), marks: Number(s?.marks) || 0 })).filter(s => s.point || s.marks)
      : [],
    alternate_accepted_answers: Array.isArray(q?.alternate_accepted_answers)
      ? q.alternate_accepted_answers.map(x => String(x || '').trim()).filter(Boolean)
      : [],
  }))
  // Renumber sequentially by section order to keep the paper consistent even
  // if Gemini shuffled them.
  const order = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 }
  cleaned.sort((a, b) => (order[a.section] ?? 9) - (order[b.section] ?? 9) || a.question_no - b.question_no)
  cleaned.forEach((q, i) => { q.question_no = i + 1 })
  return { assessment: A, questions: cleaned }
}

/**
 * Public entry.
 * @param {object} input — teacher's form input
 * @param {import('mongodb').Db|null} db — MongoDB db (for LO codes)
 * @returns
 */
export async function generatePaper(input, db = null) {
  const warnings = []

  if (isFoundationalGrade(input.grade)) {
    return {
      ok: false,
      code: 'ERR_FOUNDATIONAL_STAGE',
      error: 'Formal testing is not permitted for Grades I–II per the SCERT Odisha Assessment Framework. Use the Observation Checklist mode instead.',
    }
  }

  const assessmentType = String(input.assessment_type || 'FA1').toUpperCase()
  const chaptersRaw = String(input.chapters_or_topics || '').trim()
  if (assessmentType.startsWith('SA') && chaptersRaw.length < 5) {
    return {
      ok: false,
      code: 'ERR_MISSING_CHAPTERS',
      error: 'Please supply the chapter list for a Summative Assessment paper.',
    }
  }

  // 1) Section plan (authoritative structure).
  // If the caller supplies `input.customPlan` (from distributeMarks in the
  // legacy Build New tab) — use that; otherwise fall back to the default
  // SCERT plan.
  const fullMarks = Number(input.full_marks) || (assessmentType.startsWith('FA') ? 25 : 50)
  const plan = Array.isArray(input.customPlan) && input.customPlan.length
    ? planFromDistribution(input.customPlan)
    : planSections({ assessmentType, totalMarks: fullMarks })
  const planTotal = plan.reduce((n, s) => n + s.count * s.marksEach, 0)

  // 2) Cache lookup.
  const key = hashInput(input, plan)
  const cached = CACHE.get(key)
  if (cached && (Date.now() - cached.at) < CACHE_TTL_MS) {
    return { ...cached.value, fromCache: true }
  }

  // 3) LO codes from DB (best-effort — missing collection = validator skips LO check).
  // Caller (legacy /assessments/build) can also supply `input.loCodes` from an
  // already-built lesson context so we don't hit MongoDB twice.
  let loCodes = Array.isArray(input.loCodes) ? input.loCodes.filter(c => c && c.code) : []
  if (!loCodes.length) {
    try {
      loCodes = await fetchLOCodes(db, { grade: input.grade, subject: input.subject })
    } catch (_) { loCodes = [] }
  }
  if (!loCodes.length) warnings.push('No official LO Codes found for this class/subject — Gemini-generated codes accepted this run.')

  // 4) Previous-papers deduplication — pull the last 3 question texts for
  // this teacher + grade + subject + assessment_type combo.
  let previousQuestions = []
  if (db && input.userId) {
    try {
      const recent = await db.collection('paperGeneratorLog')
        .find({
          userId: input.userId,
          'input.grade': input.grade,
          'input.subject': input.subject,
          'input.assessment_type': input.assessment_type,
        })
        .sort({ at: -1 })
        .limit(3)
        .toArray()
      previousQuestions = recent.flatMap(r => (r.questionStems || []).slice(0, 15))
    } catch (_) { /* best-effort */ }
  }

  // 5) Gemini attempts + validation loop.
  let attempts = 0
  let lastError = ''
  let lastValidation = null
  let finalData = null

  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    attempts++
    let raw
    try {
      raw = await callGeminiJSON({
        system: SYSTEM_INSTRUCTION,
        user: buildUserPrompt(input, {
          plan, loCodes,
          previousError: lastError,
          syllabusData: input.syllabusData || null,
          previousQuestions,
        }),
      })
    } catch (err) {
      const msg = err?.message || 'Gemini error'
      // Rate limit / network → treat as retryable via natural loop.
      if (/429|500|503|504|timeout|ECONNRESET|RESOURCE_EXHAUSTED/i.test(msg) && a < MAX_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, a === 0 ? 2000 : 5000))
        lastError = `Previous attempt failed with a transient error (${msg.slice(0, 120)}). Try again.`
        continue
      }
      throw err
    }

    const data = normalize(raw)
    // Dev-only diagnostics — keep OFF in production by default. Enable via
    // PAPER_GEN_DEBUG=1 in .env.  Never logs textbook content or API keys.
    if (process.env.PAPER_GEN_DEBUG === '1') {
      const badMcq = data.questions.find(q => q.type === 'MCQ' && (q.options.length !== 4 || q.options.some(o => !o)))
      if (badMcq) {
        console.log('[paperGen debug] bad MCQ from Gemini:', JSON.stringify({
          question_no: badMcq.question_no, section: badMcq.section,
          question: badMcq.question.slice(0, 80),
          options: badMcq.options, correct_option: badMcq.correct_option,
          answer: badMcq.answer.slice(0, 60),
          _rawOptionsSample: (raw?.questions || []).find(x => x.question_no === badMcq.question_no)?.options,
        }, null, 2))
      }
    }
    const val = validateAssessment(data, {
      plan,
      expectedMarks: planTotal || fullMarks,
      language: input.language || 'Odia',
      loCodes,
    })
    lastValidation = val

    if (val.ok) {
      finalData = data
      break
    }
    lastError = val.retryHint
    warnings.push(`Attempt ${attempts}: ${val.failures.length} validation error(s) — retrying`)
  }

  if (!finalData) {
    return {
      ok: false,
      code: 'ERR_VALIDATION_FAILED',
      error: 'The AI could not produce a complete assessment after ' + attempts + ' attempts. Please tap Regenerate and try again.',
      attempts,
      validation: lastValidation ? {
        failures: lastValidation.failures.slice(0, 20).map(f => ({ q: f.q, type: f.type, reason: f.reason })),
      } : null,
      warnings,
    }
  }

  // 5) Fill in assessment metadata that the validator does not care about
  // but the renderer does. (Never rely on Gemini for these.)
  finalData.assessment = {
    ...finalData.assessment,
    school_name: finalData.assessment.school_name || input.school_name || '',
    session: finalData.assessment.session || input.session || '',
    class: finalData.assessment.class || input.grade || '',
    subject: finalData.assessment.subject || input.subject || '',
    language: finalData.assessment.language || input.language || 'Odia',
    assessment_type: finalData.assessment.assessment_type || assessmentType,
    term: finalData.assessment.term || input.term || '',
    total_marks: planTotal || fullMarks,
    duration: finalData.assessment.duration || input.duration || (assessmentType.startsWith('FA') ? '45 minutes' : '2 hours'),
    exam_date: finalData.assessment.exam_date || input.exam_date || '',
    book_title: finalData.assessment.book_title || input.book_title || input.textbook_edition || '',
    book_edition: finalData.assessment.book_edition || input.book_edition || (input.session || '2026-27'),
  }

  // 5b) Build Teacher Observation HTML (Rule 11 · v2) — only when requested.
  const observationHTML = input.include_observation
    ? renderObservationHTML({
        language: finalData.assessment.language,
        grade: input.grade,
        loCodes,
        chapters: input.syllabusData?.chapters || [],
      })
    : ''

  // 6) Render ONE HTML doc containing all four parts (+ optional Part E observation).
  const html = renderAssessmentHTML(finalData, plan, { observationHTML })

  const result = {
    ok: true,
    html,
    data: finalData,          // JSON is exposed for future data-driven UI use
    plan,
    retries: attempts - 1,
    attempts,
    language: finalData.assessment.language,
    validation: { passed: true, warnings: warnings.slice(0, 8) },
    warnings,
  }
  CACHE.set(key, { at: Date.now(), value: result })
  if (CACHE.size > 200) {
    const oldest = [...CACHE.keys()].slice(0, 50)
    oldest.forEach(k => CACHE.delete(k))
  }
  return result
}

export { hashInput }
