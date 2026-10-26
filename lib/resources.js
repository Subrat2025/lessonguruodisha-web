// =============================================================================
//  Resources — generic lesson-grounded AI resource generator
//  ---------------------------------------------------------------------------
//  Supports all "supplementary teaching resource" types requested by the user:
//    - activity-sheet
//    - rubric
//    - answer-key            (input = question list, output = detailed answers)
//    - practice-paper
//    - unit-test
//    - revision-worksheet
//    - oral-questions
//    - picture-based-questions
//    - hots-questions
//
//  Every type shares the same 2-stage pipeline (Gemini draft → ChatGPT humanize)
//  and the same lesson-content guardrail. Only the prompt template + response
//  schema vary per resource type.
// =============================================================================

import { runTwoStage, normalizeQuestions } from '@/lib/ai-pipeline.js'

// ------------------- Resource type registry -------------------------------
export const RESOURCE_TYPES = {
  'activity-sheet': {
    label: 'Activity Sheet',
    emoji: '🧩',
    description: 'Hands-on classroom activities tied to the lesson',
    defaultCount: 5,
  },
  'rubric': {
    label: 'Rubric',
    emoji: '📏',
    description: 'Assessment rubric with multiple criteria and 4 performance levels',
    defaultCount: 5,
  },
  'answer-key': {
    label: 'Answer Key',
    emoji: '🔑',
    description: 'Detailed answer key with marking scheme, keywords and explanations',
    defaultCount: 10,
  },
  'practice-paper': {
    label: 'Practice Paper',
    emoji: '📝',
    description: 'Non-graded practice paper with answers on the last page',
    defaultCount: 15,
  },
  'unit-test': {
    label: 'Unit Test',
    emoji: '📋',
    description: 'Short unit test at end of chapter with clear marks distribution',
    defaultCount: 10,
  },
  'revision-worksheet': {
    label: 'Revision Worksheet',
    emoji: '🔁',
    description: 'Focused revision covering key concepts of the chapter',
    defaultCount: 12,
  },
  'oral-questions': {
    label: 'Oral Questions',
    emoji: '🎤',
    description: 'Questions for teacher to ask verbally during class',
    defaultCount: 15,
  },
  'picture-based-questions': {
    label: 'Picture-based Questions',
    emoji: '🖼️',
    description: 'Questions built around simple diagrams/pictures (described in text)',
    defaultCount: 8,
  },
  'hots-questions': {
    label: 'HOTS Questions',
    emoji: '🧠',
    description: 'Higher-Order Thinking Skills questions (Apply/Analyse/Evaluate/Create)',
    defaultCount: 10,
  },
}

// ------------------- Type-specific prompts -------------------------------
function promptFor(resourceType, { klass, book, chapters, language, difficulty, count, teacherContext, questions }) {
  const cls = klass?.name || 'the class'
  const bk = book?.name || ''
  const ch = chapters.map(c => c.name).join(', ')
  const langNote = language === 'odia' ? 'Write EVERYTHING in Odia script.' :
    language === 'hindi' ? 'Write EVERYTHING in Hindi (Devanagari).' :
    language === 'english' ? 'Write clear, grade-appropriate English.' :
    language === 'odia-math' ? 'Question text in Odia (use Odia digits ୦-୯), but keep math symbols readable.' : 'Write in Odia.'

  const commonHeader = `You are creating a ${RESOURCE_TYPES[resourceType].label} for ${cls}${bk ? ' — ' + bk : ''}.
Chapter(s): ${ch}
${langNote}
${difficulty ? 'Difficulty: ' + difficulty + '.' : ''}
${teacherContext ? '\nTeacher notes: ' + String(teacherContext).slice(0, 500) : ''}

Ground every item in the LESSON CONTENT above. NEVER invent characters, facts, or scenarios that are not in the lesson.`

  switch (resourceType) {
    case 'activity-sheet':
      return `${commonHeader}

Produce ${count} classroom activities that a teacher can actually run in a real Odisha govt-school classroom.

Each activity must have:
- title (short)
- objective (1-sentence learning aim, ideally tied to a Learning Outcome from the lesson)
- materials (list of easily available items — chalk, notebook, tiffin box, etc.)
- steps (5-7 short numbered steps a teacher can read aloud)
- assessmentHint (how the teacher can quickly assess understanding)
- durationMin (integer, realistic — usually 10-25 min)

Output JSON: { "title": "...", "activities": [ {title, objective, materials[], steps[], assessmentHint, durationMin} ] }`

    case 'rubric':
      return `${commonHeader}

Produce a scoring rubric with ${count || 5} distinct assessment criteria for evaluating student work on this chapter.
Each criterion must have 4 performance levels: Excellent (4), Very Good (3), Good (2), Needs Improvement (1) — with concrete, observable descriptors (not vague).

Output JSON: { "title": "...", "criteria": [ {name, weight (0-100), levels: {excellent, veryGood, good, needsImprovement}} ] }
Weights across criteria must sum to 100.`

    case 'answer-key':
      return `${commonHeader}

Below is a list of questions. Produce a detailed answer key.
QUESTIONS:
${(questions || []).map((q, i) => `${i + 1}. ${typeof q === 'string' ? q : q.q || q.question || JSON.stringify(q)}`).join('\n')}

For each question produce:
- qNumber (1-based)
- answer (the correct answer as a complete sentence)
- keywords (list of key words a teacher looks for)
- stepMarks (only for calculation/long answer questions — list of steps with mark allocation)
- explanation (2-3 sentence teacher-facing explanation)
- commonMistakes (list of typical wrong answers students give)

Output JSON: { "title": "...", "answers": [ {qNumber, answer, keywords[], stepMarks[], explanation, commonMistakes[]} ] }`

    case 'practice-paper':
      return `${commonHeader}

Produce a printable practice paper with ${count} mixed questions grounded in the lesson content.
Include a variety: MCQ, fill-in, short answer, and 1-2 long answer.
Provide correct answer for every question (goes on a separate last-page answer key).

Output JSON: { "title", "instructions", "totalMarks", "durationMin",
  "questions": [ {q, type, marks, options[]?, answer, bloomLevel} ],
  "answerKey": [ {qNumber, answer, explanation?} ] }`

    case 'unit-test':
      return `${commonHeader}

Produce a short unit test (${count} questions) covering all key concepts of the chapter.
Include clear sections (Section A: MCQ, Section B: Short Answer, Section C: Long Answer) with visible marks distribution.
Total marks should be reasonable (25-40 for a unit test).

Output JSON: { "title", "instructions", "totalMarks", "durationMin",
  "sections": [ {name, description, questions: [{q, type, marks, options[]?, answer, bloomLevel}]} ] }`

    case 'revision-worksheet':
      return `${commonHeader}

Produce ${count} revision-focused questions that revisit the MOST IMPORTANT concepts of the chapter — the parts students commonly forget or get wrong.
Vary formats — MCQ, fill-in, match, short answer.
Include a "Quick Revision Tips" section (3-5 bullets) at the top.

Output JSON: { "title", "quickRevisionTips": ["...","...", ...],
  "questions": [ {q, type, marks, options[]?, answer, chapterConcept} ] }`

    case 'oral-questions':
      return `${commonHeader}

Produce ${count} questions a teacher can ASK VERBALLY in class (no writing required).
Focus on quick, engaging, conversational questions — not test-style.
Group them by difficulty: warm-up (easy), main (medium), extension (hard).

Output JSON: { "title", "sections": [ {level: "warm-up"|"main"|"extension", questions: [{q, expectedAnswer, followUp}]} ] }`

    case 'picture-based-questions':
      return `${commonHeader}

Produce ${count} picture-based questions. Since we cannot render images, describe the picture in plain text (2-3 lines) as "PICTURE:" and then the question below.

Output JSON: { "title", "questions": [ {pictureDescription, q, type, options[]?, answer, marks, bloomLevel} ] }`

    case 'hots-questions':
      return `${commonHeader}

Produce ${count} Higher-Order Thinking Skills (HOTS) questions.
Every question must be at Bloom levels Apply / Analyse / Evaluate / Create — NEVER Remember/Understand.
Prefer scenario-based / open-ended / "what if" style questions grounded in the lesson.

Output JSON: { "title", "questions": [ {q, bloomLevel, marks, expectedThinkingProcess, sampleAnswer} ] }`

    default:
      throw new Error('Unknown resource type: ' + resourceType)
  }
}

// ------------------- JSON schemas (loose — most flexibility) -------------------
const OBJ = { type: 'object', additionalProperties: true }
const ARR = { type: 'array', items: OBJ }
const schemaFor = () => ({
  __loose__: true,   // tells openai.js to use json_object mode (not strict schema)
  type: 'object',
  properties: {
    title: { type: 'string' },
    instructions: { type: 'string' },
    totalMarks: { type: 'number' },
    durationMin: { type: 'number' },
    activities: ARR,
    criteria: ARR,
    answers: ARR,
    questions: ARR,
    answerKey: ARR,
    sections: ARR,
    quickRevisionTips: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
})

// ------------------- Public API --------------------------------------------
/**
 * Generate a lesson-grounded resource.
 * @param {Object} args
 * @param args.ctx           lesson context bundle (from buildLessonContext)
 * @param args.resourceType  one of RESOURCE_TYPES keys
 * @param args.language      'odia' | 'english' | 'hindi' | 'odia-math'
 * @param args.difficulty    'easy' | 'medium' | 'hard' | 'mixed'
 * @param args.count         desired number of items
 * @param args.teacherContext  optional teacher notes
 * @param args.questions     ONLY for resourceType='answer-key' — the list of questions
 * @param args.onDraftReady  optional progressive-UX callback
 * @returns {Promise<Object>} the final polished resource
 */
export async function generateResource({
  ctx, resourceType, language, difficulty, count, teacherContext, questions,
  onDraftReady,
}) {
  if (!RESOURCE_TYPES[resourceType]) throw new Error('Unknown resource type: ' + resourceType)
  if (!ctx?.klass || !ctx?.book || !Array.isArray(ctx?.chapters) || ctx.chapters.length === 0) {
    throw new Error('lesson context (ctx) is required')
  }

  const cnt = Math.min(30, Math.max(1, count || RESOURCE_TYPES[resourceType].defaultCount))
  const draftPrompt = promptFor(resourceType, {
    klass: ctx.klass, book: ctx.book, chapters: ctx.chapters,
    language: language || 'odia', difficulty, count: cnt, teacherContext, questions,
  })
  const schema = schemaFor()

  const { polished: draft } = await runTwoStage({
    ctx,
    draftPrompt,
    draftSchema: schema,
    extraGuidance: `Final output is a ${RESOURCE_TYPES[resourceType].label} for ${ctx.klass.name}.`,
    onDraftReady,
  })

  // Normalize any questions arrays to prevent React child errors downstream.
  if (Array.isArray(draft.questions)) draft.questions = normalizeQuestions(draft.questions)
  if (Array.isArray(draft.sections)) {
    for (const s of draft.sections) {
      if (Array.isArray(s?.questions)) s.questions = normalizeQuestions(s.questions)
    }
  }

  return {
    title: draft.title || `${RESOURCE_TYPES[resourceType].label} — ${ctx.chapters.map(c => c.name).join(', ').slice(0, 60)}`,
    ...draft,
    resourceType,
    language: language || 'odia',
    meta: {
      resourceType,
      chapterCount: ctx.chapters.length,
      groundedInLessonContent: !!ctx.hasContent,
      generatedAt: new Date().toISOString(),
    },
  }
}
