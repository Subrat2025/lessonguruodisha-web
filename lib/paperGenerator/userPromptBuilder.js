// ============================================================
// LessonGuru Odisha — FA/SA Paper Generator: USER PROMPT BUILDER
// Includes the mandatory SECTION PLAN and LO CODE LIST, so Gemini
// cannot make up either.
// ============================================================

import { gradeToInt } from './sectionPlanner.js'
import { loCodeBlock } from './loCodeResolver.js'

function stageForGrade(gradeRoman) {
  const G = String(gradeRoman || '').toUpperCase().trim()
  if (['I', 'II', '1', '2'].includes(G)) return 'Foundational'
  if (['III', 'IV', 'V', '3', '4', '5'].includes(G)) return 'Preparatory'
  return 'Middle' // VI–VIII
}

function defaultFullMarks(assessmentType) {
  const t = String(assessmentType || '').toUpperCase()
  if (t.startsWith('FA')) return 25
  if (t.startsWith('SA')) return 50
  return 25
}

function planText(plan) {
  const rows = plan.map((s, i) => `  Section ${s.id}: ${s.count} × ${s.type} × ${s.marksEach} = ${s.count * s.marksEach}`)
  const total = plan.reduce((n, s) => n + s.count * s.marksEach, 0)
  return rows.join('\n') + `\n  Total = ${total} marks\n  Total questions = ${plan.reduce((n, s) => n + s.count, 0)}`
}

export function buildUserPrompt(input, ctx = {}) {
  const {
    school_name = 'Government Elementary School',
    session = '2026-27',
    grade = '',
    subject = '',
    language = 'Odia',
    assessment_type = 'FA1',
    term = 'Term 1 (April–September)',
    full_marks = '',
    duration = '',
    exam_date = '',
    chapters_or_topics = '',
    learning_outcomes = '',
    textbook_edition = '',
    special_instructions = '',
    variation_seed = '',
  } = input || {}

  const stage = stageForGrade(grade)
  const marks = full_marks && !isNaN(Number(full_marks)) ? Number(full_marks) : defaultFullMarks(assessment_type)
  const plan = ctx.plan || []
  const loCodes = ctx.loCodes || []
  const previousError = ctx.previousError || ''
  const syllabusData = ctx.syllabusData || null       // Rule-0 grounding payload
  const previousQuestions = Array.isArray(ctx.previousQuestions) ? ctx.previousQuestions : []

  const loBlock = loCodeBlock(loCodes, { max: 40 })
  const loSection = loBlock
    ? `\nLO CODE LIST (use ONLY these codes — one per question):\n${loBlock}\n`
    : `\nLO CODE LIST: (no codes supplied — omit lo_code field or use "" for each question)\n`

  // Clip book content aggressively so we stay under Gemini's 128k input budget
  // even for very long textbook chapters. 12k chars ≈ 3-4k tokens.
  const bookBlock = String(input.bookContent || '').trim().slice(0, 12000)
  const bookSection = bookBlock
    ? `\nOFFICIAL TEXTBOOK CHAPTER (PRIMARY SOURCE — quote directly from here whenever possible):\n<<<BOOK_CHAPTER_START>>>\n${bookBlock}\n<<<BOOK_CHAPTER_END>>>\n`
    : ''

  // SYLLABUS_DATA — Rule-0 grounding payload.  Only serialise chapter/lesson
  // structure (title, periods, LO, key_concepts).  Full chapter TEXT is
  // already delivered above via bookSection when available.
  let syllabusBlock = ''
  if (syllabusData) {
    const trimmed = {
      book_title: syllabusData.book_title || input.textbook_edition || '',
      book_edition: syllabusData.book_edition || '2026-27',
      class: syllabusData.class || grade,
      subject: syllabusData.subject || subject,
      medium: syllabusData.medium || language,
      chapters: (syllabusData.chapters || []).map(c => ({
        chapter_title: c.chapter_title || c.name,
        periods: Number(c.periods || c.totalPeriods || 0) || undefined,
        learning_outcomes: (c.learning_outcomes || []).slice(0, 8),
        key_concepts: (c.key_concepts || []).slice(0, 10),
        key_terms: (c.key_terms || []).slice(0, 15),
        has_full_text: !!c.has_full_text,
      })),
      excluded_chapters: syllabusData.excluded_chapters || [],
    }
    syllabusBlock = `\nSYLLABUS_DATA (Rule-0 — ONLY source of subject content; do not reach beyond this):\n${JSON.stringify(trimmed, null, 2)}\n`
  }

  // Previous questions to avoid repeating (deduplication).
  const avoidBlock = previousQuestions.length
    ? `\nPREVIOUS_PAPERS_AVOID (do NOT repeat these in wording OR substance):\n${previousQuestions.slice(0, 40).map((q, i) => `${i + 1}. ${String(q).slice(0, 180)}`).join('\n')}\n`
    : ''

  return `Generate the complete assessment JSON now. Return ONLY the JSON — no markdown fences, no prose.

INPUT DETAILS
-------------
School name          : ${school_name}
Academic session     : ${session}
Class / Grade        : ${grade}   (int: ${gradeToInt(grade) || '?'}, stage: ${stage})
Subject              : ${subject}
Language of the paper: ${language}
Assessment type      : ${assessment_type}
Term                 : ${term}
Full marks           : ${marks}
Duration             : ${duration || (String(assessment_type).toUpperCase().startsWith('FA') ? '45 minutes' : '2 hours')}
Date of examination  : ${exam_date}
Textbook / edition   : ${textbook_edition}
Chapters / topics    :
${chapters_or_topics || '(auto — use standard Odisha textbook contents for this grade/subject/term)'}
Optional teacher-supplied LO hints:
${learning_outcomes || '(none)'}
Special instructions :
${special_instructions || '(none)'}
${variation_seed ? `Variation seed (make questions DIFFERENT from a previous set): ${variation_seed}` : ''}

SECTION PLAN (must match EXACTLY):
${planText(plan)}
${loSection}${syllabusBlock}${bookSection}${avoidBlock}
GENERATE NOW. Return one JSON object with keys "assessment" and "questions". Every question MUST include ALL of: question_no, section, type, question, answer, marks, chapter (EXACT title from SYLLABUS_DATA when supplied), lo_code, bloom_level. MCQs MUST include options[4] + correct_option. Questions worth ≥ 2 marks MUST include value_points[] and stepwise_marks[] that sum to the marks.

${previousError ? `\nTHE PREVIOUS ATTEMPT FAILED VALIDATION. Fix these problems this time:\n${previousError}\n` : ''}`
}

export { stageForGrade, defaultFullMarks }
