// ============================================================
// LessonGuru Odisha — FA/SA Paper: Comprehensive Validator.
// Rejects any assessment JSON that contains blank content,
// placeholder text, wrong section counts, wrong marks totals,
// invalid LO codes, or a language leak.  Every failure is
// surfaced with an actionable message so the retry prompt can
// tell Gemini exactly what to fix.
// ============================================================

import { isPlaceholder } from './schema.js'
import { isValidLOCode } from './loCodeResolver.js'

const SCRIPT_RE = {
  Odia:       /[\u0B00-\u0B7F]/g,
  Devanagari: /[\u0900-\u097F]/g,
  Latin:      /[A-Za-z]/g,
}
const SCRIPT_FOR_LANG = { Odia: 'Odia', English: 'Latin', Hindi: 'Devanagari', Sanskrit: 'Devanagari' }

const BLOOM_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyse', 'Analyze', 'Evaluate', 'Create', 'HOTS', 'Knowledge']

const VALID_TYPES = ['MCQ', 'FIB', 'TF', 'MATCH', 'VSA', 'SA', 'LA', 'CASE']

// Estimate script purity per language.  Same idea as the old checker
// but works on a single string (question / option / answer).
export function scriptPurity(text, language) {
  const target = SCRIPT_FOR_LANG[language] || 'Odia'
  const stripped = String(text || '')
    .replace(/\d+/g, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
  if (!stripped.length) return { score: 1, target }   // empty → skip check
  const tgt = (stripped.match(SCRIPT_RE[target]) || []).length
  const latin = target === 'Latin' ? tgt : (stripped.match(SCRIPT_RE.Latin) || []).length
  const denom = target === 'Latin' ? stripped.length : (tgt + latin)
  return { score: denom ? tgt / denom : 0, target }
}

// Central marks-check helper.
function sumStepwise(q) {
  return (Array.isArray(q.stepwise_marks) ? q.stepwise_marks : [])
    .reduce((n, s) => n + Number(s?.marks || 0), 0)
}

/**
 * @param {object} data — { assessment, questions[] } from Gemini
 * @param {object} ctx  — { plan, expectedMarks, language, subject, loCodes }
 * @returns {{ ok:boolean, failures: Array<{q?:number,type:string,reason:string}>, retryHint:string }}
 */
export function validateAssessment(data, ctx = {}) {
  const failures = []
  const add = (type, reason, q) => failures.push({ q, type, reason })

  if (!data || typeof data !== 'object') {
    return { ok: false, failures: [{ type: 'shape', reason: 'Gemini returned non-object output.' }], retryHint: 'Return a valid JSON object with fields "assessment" and "questions".' }
  }
  const A = data.assessment || {}
  const Q = Array.isArray(data.questions) ? data.questions : []

  if (!Q.length) add('missing_questions', 'questions[] is empty.')

  // ---- Language check on the whole set ----
  const language = ctx.language || A.language || 'Odia'
  const combined = Q.map(q => [
    q.question, q.answer,
    ...(Array.isArray(q.options) ? q.options : []),
    ...(Array.isArray(q.value_points) ? q.value_points : []),
  ].filter(Boolean).join(' ')).join(' ')
  const purity = scriptPurity(combined, language)
  if (purity.score < 0.90) {
    add('language', `Language purity ${(purity.score * 100).toFixed(0)}% < 90% (target ${language}/${purity.target}). Rewrite everything in ${language}.`)
  }

  // ---- Section-plan compliance ----
  const plan = Array.isArray(ctx.plan) ? ctx.plan : []
  const bySection = {}
  for (const q of Q) {
    const s = String(q.section || '').trim().toUpperCase()
    if (!s) continue
    bySection[s] = bySection[s] || []
    bySection[s].push(q)
  }
  for (const sec of plan) {
    const list = bySection[sec.id] || []
    if (list.length !== sec.count) {
      add('section_count', `Section ${sec.id} expected ${sec.count} questions but got ${list.length}.`)
    }
    // All questions in this section must match the expected type + marks.
    for (const q of list) {
      const t = String(q.type || '').toUpperCase()
      if (t !== sec.type) {
        add('section_type', `Section ${sec.id} Q${q.question_no}: expected type ${sec.type} but got "${t}".`, q.question_no)
      }
      if (Number(q.marks) !== sec.marksEach) {
        add('section_marks', `Section ${sec.id} Q${q.question_no}: expected ${sec.marksEach} marks but got ${q.marks}.`, q.question_no)
      }
    }
  }

  // ---- Marks total ----
  const expectedTotal = Number(ctx.expectedMarks) || Number(A.total_marks) || 0
  const actualTotal = Q.reduce((n, q) => n + Number(q.marks || 0), 0)
  if (expectedTotal && actualTotal !== expectedTotal) {
    add('total_marks', `Total marks ${actualTotal} ≠ expected ${expectedTotal}.`)
  }

  // ---- Per-question checks ----
  const seenStems = new Set()
  for (const q of Q) {
    const qN = q.question_no

    // Basics.
    if (isPlaceholder(q.question))  add('blank_question', `Q${qN}: question is empty or placeholder.`, qN)
    if (!Number.isFinite(Number(q.marks)) || Number(q.marks) < 1) add('bad_marks', `Q${qN}: marks must be a positive integer.`, qN)
    if (!q.section) add('missing_section', `Q${qN}: section is missing.`, qN)
    if (!VALID_TYPES.includes(String(q.type || '').toUpperCase())) add('bad_type', `Q${qN}: type "${q.type}" is not one of ${VALID_TYPES.join(', ')}.`, qN)
    if (!q.chapter) add('missing_chapter', `Q${qN}: chapter is missing.`, qN)
    if (!BLOOM_LEVELS.some(b => String(q.bloom_level || '').toLowerCase().startsWith(b.toLowerCase()))) {
      add('bad_bloom', `Q${qN}: bloom_level "${q.bloom_level}" is invalid. Use Remember | Understand | Apply | Analyse | Evaluate | Create.`, qN)
    }

    // Duplicate detection (normalised).
    const norm = String(q.question || '').replace(/[\s\p{P}]/gu, '').toLowerCase()
    if (norm.length > 8 && seenStems.has(norm)) add('duplicate', `Q${qN}: duplicate of an earlier question.`, qN)
    if (norm.length > 8) seenStems.add(norm)

    // LO Code check — only enforce when we have a code pool.
    if (Array.isArray(ctx.loCodes) && ctx.loCodes.length) {
      if (!q.lo_code || !isValidLOCode(ctx.loCodes, q.lo_code)) {
        add('bad_lo_code', `Q${qN}: lo_code "${q.lo_code || '(missing)'}" does not exist in the LessonGuru LO database for this class/subject.`, qN)
      }
    }

    // Type-specific rules.
    const t = String(q.type || '').toUpperCase()
    if (t === 'MCQ') {
      const opts = Array.isArray(q.options) ? q.options : []
      if (opts.length !== 4) add('mcq_options_count', `Q${qN}: MCQ must have exactly 4 options (got ${opts.length}).`, qN)
      opts.forEach((o, i) => { if (isPlaceholder(o)) add('mcq_option_blank', `Q${qN}: option ${String.fromCharCode(65 + i)} is empty/placeholder.`, qN) })
      const setLower = new Set(opts.map(o => String(o || '').trim().toLowerCase()))
      if (setLower.size !== opts.length) add('mcq_option_duplicate', `Q${qN}: MCQ options contain duplicates.`, qN)
      const co = String(q.correct_option || '').trim().toUpperCase()
      if (!/^[A-D]$/.test(co)) add('mcq_no_correct', `Q${qN}: correct_option must be A|B|C|D (got "${q.correct_option}").`, qN)
      // answer must equal one of the options (case-insensitive trim).
      if (isPlaceholder(q.answer)) add('mcq_blank_answer', `Q${qN}: answer is empty/placeholder.`, qN)
      else if (opts.length === 4 && /^[A-D]$/.test(co)) {
        const idx = co.charCodeAt(0) - 65
        const expected = String(opts[idx] || '').trim().toLowerCase()
        const got = String(q.answer || '').trim().toLowerCase()
        if (expected && got && expected !== got && !got.includes(expected.slice(0, 20))) {
          add('mcq_answer_mismatch', `Q${qN}: answer text does not match option ${co}.`, qN)
        }
      }
    } else if (t === 'FIB') {
      if (!/(_{2,}|\.{3,}|—{2,})/.test(String(q.question || ''))) add('fib_no_blank', `Q${qN}: fill-in-the-blank must contain a blank (____ or …).`, qN)
      if (isPlaceholder(q.answer)) add('fib_blank_answer', `Q${qN}: fill-in-the-blank answer is empty/placeholder.`, qN)
    } else if (t === 'TF') {
      if (!/^(true|false|ସତ୍ୟ|ମିଥ୍ୟା|सत्य|असत्य|t|f)/i.test(String(q.answer || '').trim())) {
        add('tf_bad_answer', `Q${qN}: True/False answer must be True or False.`, qN)
      }
    } else {
      // VSA / SA / LA / CASE / MATCH
      if (isPlaceholder(q.answer)) add('written_blank_answer', `Q${qN}: model answer is empty/placeholder.`, qN)
      const vp = Array.isArray(q.value_points) ? q.value_points.filter(v => !isPlaceholder(v)) : []
      const sw = Array.isArray(q.stepwise_marks) ? q.stepwise_marks : []
      if (Number(q.marks) >= 2 && vp.length === 0) add('no_value_points', `Q${qN}: needs value_points[] (at least ${Math.max(2, Math.ceil(Number(q.marks) / 2))} points).`, qN)
      if (Number(q.marks) >= 2 && sw.length === 0) add('no_stepwise', `Q${qN}: needs stepwise_marks[] that sum to ${q.marks}.`, qN)
      if (sw.length) {
        const swSum = sumStepwise(q)
        if (Math.abs(swSum - Number(q.marks)) > 0.01) add('stepwise_sum', `Q${qN}: stepwise_marks sum to ${swSum} but marks = ${q.marks}.`, qN)
        sw.forEach((s, i) => { if (isPlaceholder(s?.point)) add('stepwise_blank', `Q${qN}: stepwise_marks[${i}].point is empty/placeholder.`, qN) })
      }
      // For 5-mark LA we insist on ≥3 value points and ≥3 stepwise items.
      if (Number(q.marks) >= 5 && vp.length < 3) add('la_thin_value_points', `Q${qN}: 5-mark question needs ≥3 value_points (got ${vp.length}).`, qN)
      if (Number(q.marks) >= 5 && sw.length < 3) add('la_thin_stepwise', `Q${qN}: 5-mark question needs ≥3 stepwise_marks (got ${sw.length}).`, qN)
    }
  }

  // ---- Build a concise retry hint (top failures only) ----
  const uniqueMsgs = []
  const seen = new Set()
  for (const f of failures) {
    const key = f.type
    if (seen.has(key) && uniqueMsgs.length > 12) continue
    seen.add(key)
    uniqueMsgs.push('• ' + f.reason)
  }
  return {
    ok: failures.length === 0,
    failures,
    retryHint: uniqueMsgs.slice(0, 20).join('\n'),
  }
}
