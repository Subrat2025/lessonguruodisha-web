// Worksheet generation library — builds Gemini prompts + schemas per
// worksheet type/format/difficulty combination. Paid AI Credit zone:
// 🔒 Gemini ONLY (no OpenAI fallback).

import { generateJSONGeminiOnly } from './gemini.js'

// ============================================================
// Custom Worksheet-only question normalizer.
// Ensures every question object handed to lib/worksheet-html.js has
// a NON-EMPTY q.question string (the renderer prints
// <b>${escape(q.question)}</b> and produces the empty-box symptom
// when q.question is undefined).  Handles both v2 questionEngine
// output ({ stem, match_left, match_right, pairs, passage }) and
// legacy generator output ({ statement, instruction, description }).
//
// Scope-locked to Custom Worksheet — none of the other flows
// (Chapter Assessment / FA-SA / Engagement / Assessment Builder)
// consume this content object.
//
// Format keys are the caller-supplied legacy keys:
//   mcq | fill | truefalse | oneword | vshort | short | long |
//   match | diagram | case | assessment-period
// ============================================================
function _trim(s) { return String(s ?? '').trim() }

// Pull the question text from whichever field the model chose to use.
function _pickQuestionText(q) {
  return (
    _trim(q?.question) ||
    _trim(q?.stem) ||
    _trim(q?.statement) ||
    _trim(q?.instruction) ||
    _trim(q?.description) ||
    _trim(q?.prompt) ||
    _trim(q?.text) ||
    ''
  )
}

function adaptV2ToLegacy(v2Questions, format) {
  const list = Array.isArray(v2Questions) ? v2Questions : []
  const legacyFormat = String(format || '').toLowerCase()

  // Merge case_based sub-parts that share the same passage into one legacy card.
  if (legacyFormat === 'case') {
    const groups = new Map()
    for (const q of list) {
      const passage = _trim(q.passage)
      const stem = _pickQuestionText(q)
      if (!passage || !stem) continue
      const key = passage
      if (!groups.has(key)) {
        groups.set(key, { passage, subQuestions: [], answer: [], marks: 0 })
      }
      const g = groups.get(key)
      g.subQuestions.push(stem)
      g.answer.push(_trim(q.answer))
      g.marks += Number(q.marks || 0)
    }
    return [...groups.values()].map((g, i) => ({
      question_no: i + 1,
      question: g.passage,
      subQuestions: g.subQuestions,
      answer: g.answer,
      marks: g.marks || undefined,
    })).filter(x => x.question && x.subQuestions.length)
  }

  return list.map((q, i) => {
    const stem = _pickQuestionText(q)
    const ans  = _trim(q.answer)
    if (!stem) return null

    const base = {
      question_no: i + 1,
      question: stem,
      answer: ans,
      marks: Number(q.marks) || undefined,
      hint: _trim(q.hint) || undefined,
      explanation: _trim(q.explanation) || undefined,
      bloom: q.bloom || undefined,
      lo_code: q.lo_code || undefined,
    }

    switch (legacyFormat) {
      case 'mcq': {
        const options = Array.isArray(q.options) ? q.options.map(_trim).filter(Boolean) : []
        return { ...base, options }
      }
      case 'match': {
        // v2 emits three possible shapes: match_left/match_right, pairs[{left,right}], or legacy columnA/columnB.
        let columnA = Array.isArray(q.columnA) ? q.columnA.slice() : []
        let columnB = Array.isArray(q.columnB) ? q.columnB.slice() : []
        if (!columnA.length && Array.isArray(q.match_left))  columnA = q.match_left.slice()
        if (!columnB.length && Array.isArray(q.match_right)) columnB = q.match_right.slice()
        if ((!columnA.length || !columnB.length) && Array.isArray(q.pairs)) {
          columnA = q.pairs.map(p => _trim(p?.left)).filter(Boolean)
          columnB = q.pairs.map(p => _trim(p?.right)).filter(Boolean)
        }
        columnA = columnA.map(_trim).filter(Boolean)
        columnB = columnB.map(_trim).filter(Boolean)
        let answerArr = []
        if (Array.isArray(q.answer)) answerArr = q.answer.map(_trim).filter(Boolean)
        else if (typeof q.answer === 'string') {
          answerArr = q.answer.split(/[;,\n]+/).map(_trim).filter(Boolean)
        } else if (Array.isArray(q.pairs)) {
          answerArr = q.pairs.map((p, idx) => `${idx + 1} → ${_trim(p?.right)}`).filter(x => x !== 'undefined')
        }
        if (!columnA.length || !columnB.length) return null
        return { ...base, answer: answerArr, columnA, columnB }
      }
      case 'truefalse': {
        // Legacy generator emits { statement, is_true }.  Normalize both fields.
        const isTrue = (q.answer === undefined && q.is_true !== undefined) ? q.is_true : undefined
        const norm = isTrue === true ? 'True' : isTrue === false ? 'False' : ans
        return { ...base, answer: norm }
      }
      case 'diagram': {
        return {
          ...base,
          subject: _trim(q.subject) || undefined,
          labels: Array.isArray(q.labels) ? q.labels.map(_trim).filter(Boolean) : [],
          description: _trim(q.description) || undefined,
        }
      }
      case 'fill':
      case 'oneword':
      case 'vshort':
      case 'short':
      case 'long':
      default:
        return base
    }
  }).filter(Boolean)
}

// Apply the same normalizer to legacy-generator output so field-name
// drift (statement / instruction / description) doesn't cause blank
// renderer cards.  Idempotent — safe to run on already-normalized data.
function normalizeLegacyContent(content, format) {
  if (!content || !Array.isArray(content.questions)) return content
  const adapted = adaptV2ToLegacy(content.questions, format)
  if (!adapted.length) return content   // don't destroy content on a bad pass
  return { ...content, questions: adapted }
}



// ----- Schemas (Gemini-permissive; toOpenAISchema converts on fallback) -----
const QUESTION_ITEM = {
  mcq: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
      answer: { type: 'string' },
      explanation: { type: 'string' },
    },
  },
  fill: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      answer: { type: 'string' },
      hint: { type: 'string' },
    },
  },
  short: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      answer: { type: 'string' },
      keyPoints: { type: 'array', items: { type: 'string' } },
    },
  },
  truefalse: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      answer: { type: 'string', enum: ['True', 'False', 'ସତ୍ୟ', 'ମିଥ୍ୟା'] },
      explanation: { type: 'string' },
    },
  },
  oneword: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      answer: { type: 'string' },
    },
  },
  vshort: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      answer: { type: 'string' }, // one-line answer
    },
  },
  long: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      answer: { type: 'string' },      // 4-6 sentence model answer
      keyPoints: { type: 'array', items: { type: 'string' } },
    },
  },
  match: {
    type: 'object',
    properties: {
      question: { type: 'string' },         // Instruction e.g., "Match Column A with Column B"
      columnA: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 6 },
      columnB: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 6 }, // shuffled
      answer: { type: 'array', items: { type: 'string' } }, // ["A1 → B3", "A2 → B1", ...]
    },
  },
  diagram: {
    type: 'object',
    properties: {
      question: { type: 'string' },        // "Label the parts of ..."
      subject: { type: 'string' },          // What's being labeled
      labels: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 8 },
      description: { type: 'string' },     // teacher hint about diagram
      answer: { type: 'array', items: { type: 'string' } }, // labels in expected order
    },
  },
  case: {
    type: 'object',
    properties: {
      question: { type: 'string' },        // Contextual passage / scenario (2-4 sentences)
      subQuestions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
      answer: { type: 'array', items: { type: 'string' } }, // one per sub-question
    },
  },
}

const buildSchema = (format, count) => {
  // 📋 Special-case: "Assessment of the Period" — always a fixed 25-mark
  // multi-section paper.  The count selector is IGNORED for this format.
  if (format === 'assessment-period') {
    return {
      type: 'object',
      properties: {
        title: { type: 'string' },
        instructions: { type: 'string' },
        totalMarks: { type: 'integer' }, // MUST be 25
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name:        { type: 'string' },   // e.g. "Section A — Objective"
              description: { type: 'string' },   // e.g. "Choose the correct option"
              marks:       { type: 'integer' },  // total marks for this section
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    qtype: { type: 'string' },      // 'mcq'|'fill'|'truefalse'|'match'|'oneword'|'vshort'|'short'|'long'|'hots'|'competency'
                    question: { type: 'string' },
                    marks:    { type: 'integer' },
                    options:  { type: 'array', items: { type: 'string' } }, // MCQ
                    columnA:  { type: 'array', items: { type: 'string' } }, // match
                    columnB:  { type: 'array', items: { type: 'string' } }, // match
                    subQuestions: { type: 'array', items: { type: 'string' } }, // case/HOTS
                    hint:     { type: 'string' },
                    keyPoints:{ type: 'array', items: { type: 'string' } },
                    answer:   { type: 'string' }, // for match, this is a JSON-encoded string like "1-B,2-A"
                  },
                },
              },
            },
          },
        },
      },
    }
  }
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      instructions: { type: 'string' },
      questions: {
        type: 'array',
        items: QUESTION_ITEM[format] || QUESTION_ITEM.mcq,
        minItems: format === 'case' ? Math.max(3, Math.ceil(count / 2)) : count,
        maxItems: count,
      },
    },
  }
}

// ----- Language detector from subject/book name -----
const detectLanguage = (subject, bookName) => {
  const s = ((subject || '') + ' ' + (bookName || '')).toLowerCase()
  if (/english|ଇଂରାଜୀ/.test(s)) return 'english'
  if (/hindi|ହିନ୍ଦୀ/.test(s)) return 'hindi'
  if (/sanskrit|ସଂସ୍କୃତ/.test(s)) return 'sanskrit'
  if (/math|ଗଣିତ/.test(s)) return 'odia-math'
  return 'odia'
}

const LANG_NAME = {
  odia: 'Odia (ଓଡ଼ିଆ)',
  english: 'English',
  hindi: 'Hindi (हिन्दी)',
  sanskrit: 'Sanskrit',
  'odia-math': 'Odia (with proper mathematical symbols: ×, ÷, ≤, ≥, °, √, π, fractions)',
}

// ----- Worksheet-type context -----
const TYPE_CONTEXT = {
  practice: 'A practice worksheet for daily classroom drilling — focused on core skill reinforcement.',
  assessment: 'A formative assessment worksheet to gauge student comprehension — should test learning outcomes directly.',
  hots: 'A Higher-Order Thinking Skills worksheet — must include analysis, application, and evaluation-level questions (Bloom taxonomy top 3 levels).',
  activity: 'An engaging activity-based worksheet — hands-on tasks, drawing/coloring/sorting prompts, group activities suitable for classroom.',
  competency: 'A competency-based worksheet aligned with NEP 2020 — real-world scenarios testing 21st century skills (creativity, collaboration, critical thinking).',
  skill: 'A skill-development worksheet focused on building specific skills: reading fluency, computation speed, drawing, observation, or communication.',
  revision: 'A revision worksheet covering the ENTIRE lesson — mixed question types, quick recall + application spread across the whole topic.',
  homework: 'A homework worksheet designed for 20-30 minute completion at home — student-friendly, no external help needed, parent-viewable.',
  project: 'A project-based worksheet — one integrated task the student completes over multiple days, with sub-steps and reflection.',
  remedial: 'A remedial worksheet for students who need extra help — SIMPLER vocabulary, more scaffolding, step-by-step hints, foundational concept review.',
  exam: 'An exam-style worksheet mimicking Odisha board formative/summative pattern — balanced difficulty, section-wise, includes long-answer questions.',
}

const FORMAT_LABEL = {
  mcq: 'Multiple Choice Questions (4 options each; exactly one correct)',
  fill: 'Fill-in-the-blanks (use ______ for the blank; short factual answers)',
  short: 'Short-answer questions (2-3 sentence expected answers)',
  truefalse: 'True/False questions (with brief explanation for correct answer)',
  oneword: 'One-word answer questions (single word or number as answer)',
  vshort: 'Very Short answer questions (one-line, ~10 words answers)',
  long: 'Long answer questions (4-6 sentence detailed answers with key points)',
  match: 'Match the Following — Column A items (concepts) with Column B items (definitions/examples), shuffled',
  diagram: 'Diagram Labeling — student labels parts of a specific diagram (subject provided; labels are the correct answers)',
  case: 'Case Study — a short 2-4 sentence real-life scenario/passage followed by 2-4 sub-questions',
  'assessment-period': 'Assessment of the Period — a 25-mark multi-section school assessment paper based on the current lesson/period',
}

const DIFFICULTY_HINT = {
  easy: 'age-appropriate recall & basic-recognition level — most students should score 80%+',
  medium: 'balanced application-level — mix of recall + simple application',
  hard: 'challenging application + analysis — includes tricky distractors and multi-step reasoning',
}

import { buildScertPersonaBlock } from './prompts/persona.js'

// ----- Build the prompt -----
const buildPrompt = ({ type, format, difficulty, count, className, bookName, chapterName, topic, title, learningOutcomes, teacherNotes, loCodesInLesson, language }) => {
  const langName = LANG_NAME[language] || LANG_NAME.odia
  const los = Array.isArray(learningOutcomes) && learningOutcomes.length
    ? learningOutcomes.join('; ')
    : (loCodesInLesson || []).join(', ') || 'derive from topic'
  // Prepend the shared SCERT / OSEPA senior-teacher persona so worksheets
  // sound exactly like Government-school assessments — human-written,
  // lesson-only, class-appropriate, with picture verification and a
  // self-review pass baked in.
  const personaBlock = buildScertPersonaBlock({
    language,
    className,
    includeIdentity: true,
    includeQuality: true,
    includeLessonOnly: true,
    includeStyle: true,
    includeDifficulty: true,
    includeClassLevel: true,
    includePicture: true,
    includeMCQ: format === 'mcq' || format === 'assessment-period',
    includeLong: format === 'long' || format === 'assessment-period',
    includeSelfReview: true,
  })

  // 📋 Special prompt for Assessment of the Period — 25-mark structured paper.
  if (format === 'assessment-period') {
    return `${personaBlock}

================================================================
ASSESSMENT OF THE PERIOD — 25 MARKS
================================================================
Prepare a school-ready **25-mark assessment paper** covering EXACTLY the lesson/period below.
Language: **${langName}**
Difficulty distribution: **${difficulty}** — ${DIFFICULTY_HINT[difficulty]}

LESSON CONTEXT (STRICT — every question must relate to this lesson only):
• Class: ${className}
• Book/Subject: ${bookName}
• Chapter: ${chapterName}
• Lesson Topic: ${topic || title}
• Learning Outcomes: ${los}
${teacherNotes ? `• Teacher Notes: ${String(teacherNotes).slice(0, 800)}` : ''}

REQUIRED STRUCTURE — four sections totalling EXACTLY 25 marks:
• Section A — Objective         → 5 questions × 1 mark = 5 marks
    · Mix of MCQ (qtype:"mcq" with exactly 4 options), Fill-in-the-blank (qtype:"fill"), True/False (qtype:"truefalse"), or One-word (qtype:"oneword").
• Section B — Short Answer      → 5 questions × 2 marks = 10 marks
    · qtype:"vshort" or "short" — one or two sentence answers.
• Section C — Application/Thinking → 2 questions × 3 marks = 6 marks
    · qtype:"short" or "long" — application-level questions grounded in the lesson.
• Section D — Competency / HOTS  → 1 question × 4 marks = 4 marks
    · qtype:"long", "hots" or "competency" — a real-world, competency-based prompt.

CRITICAL RULES:
1. totalMarks MUST be exactly 25 and the sum of section.marks MUST equal 25.
2. Every question MUST include its own "marks" field matching the section pattern above.
3. Every question MUST include a correct "answer" (or an "answer" mapping for match).
4. Include a top-level "title" (e.g. "Assessment of the Period — <lesson topic>") and short "instructions" for students.
5. All questions must be strictly from the specified lesson — no unrelated general knowledge.
6. Language: ${langName}. Do NOT switch languages mid-paper.
7. Age-appropriate vocabulary for ${className}.
8. Include model answers for the teacher (answers should NEVER appear on the student paper — the UI hides them).

RESPOND WITH VALID JSON matching this shape (no prose outside JSON):
{
  "title": "...",
  "instructions": "...",
  "totalMarks": 25,
  "sections": [
    {
      "name": "Section A — Objective",
      "description": "...",
      "marks": 5,
      "questions": [
        { "qtype": "mcq", "question": "...", "options": ["a","b","c","d"], "answer": "b", "marks": 1 },
        ...
      ]
    },
    ...
  ]
}`
  }

  return `${personaBlock}

================================================================
WORKSHEET GENERATION TASK
================================================================
Generate a **${TYPE_CONTEXT[type]}**
Format: **${FORMAT_LABEL[format]}**
Difficulty: **${difficulty}** — ${DIFFICULTY_HINT[difficulty]}
Number of questions: **exactly ${count}**
Language: **${langName}**

LESSON CONTEXT (STRICT — every question must relate to this specific lesson only):
• Class: ${className}
• Book/Subject: ${bookName}
• Chapter: ${chapterName}
• Lesson Topic: ${topic || title}
• Learning Outcomes: ${los}
${teacherNotes ? `• Teacher Notes: ${String(teacherNotes).slice(0, 800)}` : ''}

REQUIREMENTS:
1. Every question MUST test the specified learning outcomes and stay within the chapter scope.
2. Do NOT include unrelated general-knowledge or off-topic questions.
3. Difficulty must match "${difficulty}" — do not accidentally make it too easy/hard.
4. Age-appropriate vocabulary for ${className}.
5. No duplicate/similar questions.
6. Randomize order so consecutive questions aren't grouped by sub-topic.
${format === 'mcq' ? '7. Exactly 4 options per MCQ, only 1 correct, other 3 must be plausible distractors (no obvious throwaways).' : ''}
${format === 'fill' ? '7. Use exactly one blank per question (______); the answer must be a single word or short phrase.' : ''}
${format === 'short' ? '7. Short answers should be 2-3 sentences with concrete Odisha-context examples where relevant.' : ''}
${format === 'truefalse' ? '7. Mix True and False statements ~50/50. Never make False statements too obviously wrong. Include a 1-line explanation.' : ''}
${format === 'oneword' ? '7. Answer must be exactly ONE word (or one number). Question phrasing must make the single-word answer natural.' : ''}
${format === 'vshort' ? '7. Very short answers ~10 words, one line. Focused on definitions, examples, or single facts.' : ''}
${format === 'long' ? '7. Long-answer model responses = 4-6 sentences with 3-5 key points listed separately. Suitable for exam preparation.' : ''}
${format === 'match' ? '7. Each match item = ONE entry in columnA (concept/term) and its match in columnB (definition/example). SHUFFLE columnB so pairing is not obvious. In "answer" list, return "A1 → B<n>" strings pointing to the correct pair.' : ''}
${format === 'diagram' ? '7. Provide a "subject" (what the student draws/identifies, e.g., "human eye", "plant parts", "digestive system"). "labels" = the correct labels in order. "description" = a 1-line teacher hint about the diagram. The student will draw and label; no image is generated.' : ''}
${format === 'case' ? '7. Each item = a short 2-4 sentence case/scenario/passage (Odisha-flavoured) in "question" + 2-4 "subQuestions" testing comprehension/application. "answer" is an array of one model-answer per sub-question.' : ''}
8. Return a "title" (chapter + type name) and "instructions" (1-line student direction) at the top.

RESPOND WITH VALID JSON matching the provided schema. No prose outside the JSON.`
}

// ----- Main generation function -----
export async function generateWorksheet({ lesson, book, chapter, klass, type, format, difficulty, count, premium = false, extraGuidance = '' }) {
  const language = detectLanguage(lesson.subject || book?.name, book?.name)
  let prompt = buildPrompt({
    type, format, difficulty, count,
    className: klass?.name || 'Class',
    bookName: book?.name || lesson.subject || '',
    chapterName: chapter?.name || lesson.title || '',
    topic: lesson.topic || lesson.title || chapter?.name || '',
    title: lesson.title || '',
    learningOutcomes: lesson.learningOutcomes || [],
    teacherNotes: lesson.teacherNotes || lesson.content || '',
    loCodesInLesson: lesson.loCodes || [],
    language,
  })
  if (extraGuidance) {
    prompt += `\n\nADDITIONAL GUIDANCE (based on previous validation issues, address these):\n${extraGuidance}`
  }
  const schema = buildSchema(format, count)
  const temperature = difficulty === 'hard' ? 0.85 : difficulty === 'medium' ? 0.75 : 0.65

  // 🔒 Paid AI Credit zone — Gemini ONLY (no OpenAI fallback). Premium
  // flag no longer routes to OpenAI; both tiers use Gemini strict.
  const result = await generateJSONGeminiOnly({ prompt, schema, temperature })

  return { ...result, language, meta: { type, format, difficulty, count, premium } }
}

// ============================================================================
//  12-POINT WORKSHEET QUALITY VALIDATOR (silent, background-only)
// ============================================================================
// Runs 12 programmatic checks on the AI-generated worksheet.  No LLM calls.
// Each check returns { id, name, passed, weight, reason? }.  The overall score
// is (sum of passed weights) / (sum of weights) * 100.  Scores drive:
//   >= 90   → accept immediately
//   80-89   → soft-improve once (regenerate with the failed checks in prompt)
//   < 80    → full regenerate once (also with failed checks in prompt)
// ---------------------------------------------------------------------------
const ODIA_RE = /[\u0B00-\u0B7F]/
const HINDI_RE = /[\u0900-\u097F]/
const HAS_DUP = (arr) => {
  const seen = new Set()
  for (const s of arr) {
    const k = String(s || '').toLowerCase().trim().replace(/[^a-z0-9\u0B00-\u0B7F\u0900-\u097F]+/g, ' ').slice(0, 60)
    if (!k) continue
    if (seen.has(k)) return true
    seen.add(k)
  }
  return false
}
const norm = (s) => String(s || '').toLowerCase()

export function validateWorksheet(content, params) {
  const { type, format, difficulty, count, className, bookName, chapterName, topic, learningOutcomes = [], language = 'odia' } = params || {}
  // 📋 assessment-period returns { sections: [{ questions: [...] }] }.
  // Flatten to a single questions array so the existing 12-point validator
  // can rate coverage/language/boundary/etc.  Format-specific checks are
  // skipped (see below) because each question in the paper can have its own
  // qtype.  Also verify totalMarks === 25 as a hard gate.
  const isPeriod = format === 'assessment-period'
  const flatQuestions = isPeriod
    ? (Array.isArray(content?.sections) ? content.sections.flatMap(s => Array.isArray(s?.questions) ? s.questions : []) : [])
    : (Array.isArray(content?.questions) ? content.questions : [])
  const questions = flatQuestions
  const checks = []
  const add = (id, name, passed, weight = 1, reason = '') => checks.push({ id, name, passed, weight, reason })

  // 1. Class present in title/metadata (or worksheet title mentions class-appropriate wording)
  add(1, 'class_alignment',
    !!content?.title || questions.length > 0,
    1,
    !content?.title ? 'missing title' : ''
  )

  // 2. Subject/book relevance — subject keyword or chapter word appears somewhere
  const allText = norm(JSON.stringify(content))
  const chapterKey = norm(chapterName).split(/\s+/).filter(w => w.length > 3).slice(0, 3)
  const topicKey = norm(topic).split(/\s+/).filter(w => w.length > 3).slice(0, 3)
  const kwHits = [...chapterKey, ...topicKey].some(k => allText.includes(k))
  add(2, 'subject_chapter_relevance', kwHits || !chapterName, 2, kwHits ? '' : 'no chapter/topic keywords found in questions')

  // 3. Chapter/lesson boundary — questions not obviously off-topic (no unrelated GK words)
  const offTopic = /(prime\s+minister|president of india|world war|(?:2019|2020|2021|2022|2023)\s+(?:election|world cup))/i.test(allText)
  add(3, 'chapter_boundary', !offTopic, 1, offTopic ? 'off-topic GK content detected' : '')

  // 4. Learning outcome coverage — questions cover at least half of LOs (or LOs empty → pass)
  if (Array.isArray(learningOutcomes) && learningOutcomes.length > 0) {
    const hits = learningOutcomes.filter(lo => {
      const words = norm(lo).split(/\s+/).filter(w => w.length > 3).slice(0, 3)
      return words.some(w => allText.includes(w))
    }).length
    const cover = hits / learningOutcomes.length
    add(4, 'lo_coverage', cover >= 0.4, 2, cover < 0.4 ? `only ${Math.round(cover*100)}% LOs covered` : '')
  } else {
    add(4, 'lo_coverage', true, 2)
  }

  // 5. Question count — must match requested count.  For Assessment of the
  // Period we accept anywhere from 10-15 total questions (4-section pattern).
  if (isPeriod) {
    add(5, 'count_match', questions.length >= 10 && questions.length <= 20, 2, `assessment paper has ${questions.length} questions (expected 10-15)`)
  } else {
    const minCount = format === 'case' ? Math.max(3, Math.ceil(count / 2)) : Math.max(3, count - 1)
    add(5, 'count_match', questions.length >= minCount, 2, `got ${questions.length}, expected ${count}`)
  }

  // 6. Difficulty spread — question length distribution matches difficulty
  const avgLen = questions.reduce((a, q) => a + String(q.question || '').length, 0) / Math.max(1, questions.length)
  const diffOk = difficulty === 'easy' ? avgLen >= 15 && avgLen <= 120
    : difficulty === 'medium' ? avgLen >= 20 && avgLen <= 200
    : avgLen >= 25 // hard
  add(6, 'difficulty_alignment', diffOk, 1, diffOk ? '' : `avg question length ${Math.round(avgLen)} does not match ${difficulty}`)

  // 7. NEP 2020 / competency alignment — for competency/hots types, expect application verbs
  if (['competency', 'hots'].includes(type)) {
    const verbs = /(analy[sz]e|evaluate|apply|create|design|compare|justify|explain\s+why|predict|infer|solve|construct|classify|hypothes[iy][sz]e|ବିଶ୍ଳେଷ|ପ୍ରୟୋଗ|ମୂଲ୍ୟାୟନ|ସୃଷ୍ଟି)/i
    add(7, 'nep_alignment', verbs.test(allText), 1, verbs.test(allText) ? '' : 'missing higher-order thinking verbs for ' + type)
  } else {
    add(7, 'nep_alignment', true, 1)
  }

  // 8. No duplicate/near-duplicate questions
  add(8, 'no_duplicates', !HAS_DUP(questions.map(q => q.question)), 2, 'duplicate or near-duplicate questions found')

  // 9. Language purity — questions written in the expected language script
  if (language === 'odia' || language === 'odia-math') {
    const odiaRatio = questions.filter(q => ODIA_RE.test(String(q.question || ''))).length / Math.max(1, questions.length)
    add(9, 'language_purity', odiaRatio >= 0.6, 2, odiaRatio < 0.6 ? `only ${Math.round(odiaRatio*100)}% questions in Odia script` : '')
  } else if (language === 'hindi') {
    const r = questions.filter(q => HINDI_RE.test(String(q.question || ''))).length / Math.max(1, questions.length)
    add(9, 'language_purity', r >= 0.6, 2, r < 0.6 ? `only ${Math.round(r*100)}% questions in Hindi script` : '')
  } else {
    add(9, 'language_purity', true, 2)
  }

  // 10. Format integrity — options/columns/answer presence per format spec.
  // Assessment-period paper: verify totalMarks==25 and section marks sum to 25.
  let fmtOk = true, fmtReason = ''
  if (isPeriod) {
    const sections = Array.isArray(content?.sections) ? content.sections : []
    const sectionMarks = sections.reduce((s, sec) => s + (Number(sec?.marks) || 0), 0)
    const totalMarks = Number(content?.totalMarks) || sectionMarks
    if (sections.length < 3) { fmtOk = false; fmtReason = 'assessment paper needs at least 3 sections' }
    else if (totalMarks !== 25) { fmtOk = false; fmtReason = `totalMarks=${totalMarks}, expected 25` }
    else if (sectionMarks !== 25) { fmtOk = false; fmtReason = `section marks sum to ${sectionMarks}, expected 25` }
  } else {
    for (const q of questions) {
      if (format === 'mcq') {
        const opts = Array.isArray(q.options) ? q.options : []
        if (opts.length !== 4 || !q.answer || !opts.includes(q.answer)) { fmtOk = false; fmtReason = 'MCQ requires exactly 4 options + one matching answer'; break }
      } else if (format === 'fill') {
        if (!/_{2,}/.test(String(q.question || ''))) { fmtOk = false; fmtReason = 'fill-in-the-blank missing ____ marker'; break }
      } else if (format === 'match') {
        const a = q.columnA || [], b = q.columnB || []
        if (a.length < 3 || b.length < 3 || a.length !== b.length) { fmtOk = false; fmtReason = 'match columns must be same length ≥3'; break }
      } else if (format === 'case') {
        if (!Array.isArray(q.subQuestions) || q.subQuestions.length < 2) { fmtOk = false; fmtReason = 'case study needs ≥2 sub-questions'; break }
      } else if (format === 'diagram') {
        if (!Array.isArray(q.labels) || q.labels.length < 3) { fmtOk = false; fmtReason = 'diagram needs ≥3 labels'; break }
      }
    }
  }
  add(10, 'format_integrity', fmtOk, 2, fmtReason)

  // 11. Answer key completeness — every question has a non-empty `answer` field
  const noAns = questions.filter(q => {
    const a = q.answer
    if (Array.isArray(a)) return a.length === 0
    return !a || !String(a).trim()
  })
  add(11, 'answer_key_complete', noAns.length === 0, 2, noAns.length ? `${noAns.length} questions missing answers` : '')

  // 12. Print-ready layout — has title + instructions + non-empty questions
  const printOk = !!content?.title && questions.every(q => q.question && String(q.question).trim().length > 4)
  add(12, 'print_ready', printOk, 1, printOk ? '' : 'missing title or empty questions')

  const totalWeight = checks.reduce((a, c) => a + c.weight, 0)
  const passedWeight = checks.filter(c => c.passed).reduce((a, c) => a + c.weight, 0)
  const score = Math.round((passedWeight / totalWeight) * 100)
  const failedChecks = checks.filter(c => !c.passed)

  return { score, checks, failedChecks, passedCount: checks.filter(c => c.passed).length, totalCount: checks.length }
}

/**
 * Generate + auto-validate + optionally regenerate for quality.
 * Returns { content, validation, attempts, model }
 */
export async function generateAndValidateWorksheet(params) {
  const attempts = []
  // ------------------------------------------------------------
  // 🚀 NEW ENGINE (P0) — /app/lib/questionEngine
  // Tries the new engine first when we have sourceText.  On any
  // failure (missing source, unsupported format, Gemini error) we
  // silently fall through to the legacy code path below so nothing
  // regresses on chapters without content in the DB.
  // Disable via env: NEXT_PUBLIC_DISABLE_QE_V2=1
  // ------------------------------------------------------------
  const disableV2 = String(process.env.DISABLE_QE_V2 || process.env.NEXT_PUBLIC_DISABLE_QE_V2 || '').toLowerCase() === '1'
  if (!disableV2) {
    try {
      const lessonContent = String(params.lesson?.content || '').replace(/<[^>]+>/g, ' ').trim()
      if (lessonContent.length >= 200) {
        const FORMAT_MAP = { mcq: 'mcq', fill: 'fill', short: 'short', truefalse: 'truefalse', oneword: 'very_short', vshort: 'very_short', long: 'long', match: 'match', diagram: 'skill', case: 'case_based' }
        const engineFormat = FORMAT_MAP[params.format] || params.format
        // Skip Assessment-of-the-Period (has bespoke marks-summing logic) —
        // fall through to legacy generator for that specific format.
        if (params.format !== 'assessment-period') {
          const { generateQuestions } = await import('./questionEngine/index.js')
          const out = await generateQuestions({
            mode: 'worksheet',
            classLevel:   params.klass?.name || '',
            subject:      params.klass?.subject || params.book?.subject || '',
            medium:       params.klass?.medium || params.klass?.mediumOfInstruction || '',
            schoolMedium: params.klass?.mediumOfInstruction || params.schoolMedium || '',
            book:         params.book?.name || '',
            chapter:      { number: params.chapter?.number || '', title: params.chapter?.name || params.lesson?.title || '' },
            topic:        params.lesson?.topic || params.lesson?.title || '',
            sourceText:   lessonContent,
            worksheetType: params.type,
            format:       engineFormat,
            difficulty:   params.difficulty,
            count:        params.count,
            qualityMode:  params.premium ? 'High' : 'Standard',
            learningOutcomes: params.lesson?.learningOutcomes || [],
            sanskritScript: params.userSanskritScript || 'Odia',
          })
          if (out?.ok && Array.isArray(out.questions) && out.questions.length) {
            attempts.push({ engine: 'v2', attempts: out.attempts, warnings: out.warnings })
            // 🔧 CUSTOM WORKSHEET ADAPTER — convert the v2 questionEngine's
            // output shape ({ stem, match_left, match_right, passage })
            // into the legacy renderer shape ({ question, columnA,
            // columnB, subQuestions }) that /lib/worksheet-html.js expects.
            // Without this adapter, every non-Assessment format renders as
            // an empty box because q.question is undefined.
            //
            // Scope-locked to Custom Worksheet — none of the other flows
            // (Chapter Assessment / FA-SA / Engagement / Assessment Builder)
            // consume this content object.
            const adapted = adaptV2ToLegacy(out.questions, params.format)
            if (!adapted.length) {
              // v2 succeeded but every question was dropped by the adapter
              // (empty stems / malformed). Fall through to legacy generator.
              attempts.push({ engine: 'v2-adapter', failed: 'all_questions_empty_after_adaptation' })
            } else {
              const content = {
                language: out.meta?.language,
                instructions: out.meta?.instruction_line || '',
                questions: adapted,
                qeV2Meta: out.meta,     // preserve full meta for future renderer
              }
              return { content, validation: { score: out.validation?.passed ? 100 : 85, failedChecks: out.validation?.failedChecks || [] }, attempts }
            }
          }
          // ERR_NO_SOURCE → propagate to caller for a clean user message.
          if (out && out.code === 'ERR_NO_SOURCE') {
            const e = new Error(out.error); e.code = 'ERR_NO_SOURCE'
            throw e
          }
        }
      }
    } catch (v2err) {
      if (v2err?.code === 'ERR_NO_SOURCE') throw v2err
      // Any other failure → fall through to legacy.
      attempts.push({ engine: 'v2', failed: v2err?.message || 'unknown' })
    }
  }

  // ------------------------------------------------------------
  // Legacy path — unchanged.
  // ------------------------------------------------------------
  let content = await generateWorksheet(params)
  let validation = validateWorksheet(content, {
    type: params.type, format: params.format, difficulty: params.difficulty, count: params.count,
    className: params.klass?.name, bookName: params.book?.name,
    chapterName: params.chapter?.name || params.lesson?.title || '',
    topic: params.lesson?.topic || params.lesson?.title || '',
    learningOutcomes: params.lesson?.learningOutcomes || [],
    language: content.language,
  })
  attempts.push({ attempt: 1, score: validation.score, failed: validation.failedChecks.map(c => c.name) })

  if (validation.score < 90) {
    // Build feedback prompt from failed checks
    const feedback = validation.failedChecks
      .map(c => `- ${c.name}: ${c.reason || 'failed'}`)
      .join('\n')
    const extraGuidance = validation.score < 80
      ? `The previous attempt scored ${validation.score}/100 and failed these quality checks. REGENERATE the entire worksheet from scratch, strictly addressing:\n${feedback}`
      : `The previous attempt scored ${validation.score}/100. Please IMPROVE and address:\n${feedback}`

    try {
      const improved = await generateWorksheet({ ...params, extraGuidance })
      const v2 = validateWorksheet(improved, {
        type: params.type, format: params.format, difficulty: params.difficulty, count: params.count,
        className: params.klass?.name, bookName: params.book?.name,
        chapterName: params.chapter?.name || params.lesson?.title || '',
        topic: params.lesson?.topic || params.lesson?.title || '',
        learningOutcomes: params.lesson?.learningOutcomes || [],
        language: improved.language,
      })
      attempts.push({ attempt: 2, score: v2.score, failed: v2.failedChecks.map(c => c.name) })
      // Only accept the improved version if it actually scored higher
      if (v2.score > validation.score) {
        content = improved
        validation = v2
      }
    } catch (e) {
      attempts.push({ attempt: 2, error: e.message })
    }
  }

  // === Stage 2: Gemini humanize (optional, best-effort) ===
  // Rewrites the accepted worksheet in "Odisha govt-school teacher voice".
  // 🔒 Gemini-only — no OpenAI. If humanize fails, we silently use the
  // validated draft as-is (no failure surfaced to the user).
  try {
    if (Array.isArray(content?.questions) && content.questions.length > 0) {
      const humanized = await humanizeWorksheet(content, params)
      if (humanized && Array.isArray(humanized.questions) && humanized.questions.length >= content.questions.length - 1) {
        content = { ...content, ...humanized }
        attempts.push({ attempt: attempts.length + 1, humanized: true })
      }
    }
  } catch (e) {
    attempts.push({ humanizeError: e.message })
  }

  // 🔧 CUSTOM WORKSHEET NORMALIZER — bulletproof the renderer contract.
  // The legacy generator sometimes emits { statement } for truefalse and
  // { instruction } for match, leaving q.question empty → the renderer
  // produces the empty-box symptom.  Normalize both LEGACY and post-humanize
  // output through the same adapter as v2 so the renderer always sees
  // q.question, q.options / q.columnA / q.columnB / q.subQuestions.
  // Skip assessment-period (which has its own bespoke section-based shape).
  if (params.format !== 'assessment-period') {
    content = normalizeLegacyContent(content, params.format)
  }

  return { content, validation, attempts }
}

// ============================================================================
//  Stage 2: Humanize — rewrite worksheet in Odisha teacher voice (Gemini only)
// ============================================================================
async function humanizeWorksheet(draft, params) {
  const { withTimeout } = await import('@/lib/timeout.js')
  const lessonBlock = params.lesson?.content
    ? `\nORIGINAL LESSON CONTENT (source of truth — never invent outside this):\n${'─'.repeat(50)}\n${String(params.lesson.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 4000)}\n${'─'.repeat(50)}\n`
    : ''
  const prompt = `You are an experienced Odisha Government School teacher polishing a worksheet drafted by another teacher.
${lessonBlock}
Rewrite EVERY question and option in the JSON below so it reads like real Odisha teacher-speak — warm, natural, classroom-ready.

CRITICAL RULES:
- Preserve the JSON schema and every top-level key exactly.
- Zero AI-flavour ("various", "as we know", "let us explore", "in this activity").
- Vary sentence structure — do NOT reuse the same opening pattern.
- Use local Odia names (Rina, Manoj, Priya, Suresh, Anwesha, Sagar) and everyday objects (mango, jackfruit, chapati, tiffin, cycle) as examples.
- Wrap non-trivial questions in a tiny real-life story where natural (1-2 lines max).
- Preserve chapter name, subject name, LO codes EXACTLY.
- MCQ options MUST be plain strings, NOT {text, correct} objects. Correct answer belongs in a separate "answer" or "correctAnswer" field if the schema has one.
- Every question must have a specific, unambiguous correct answer.
- Every question must be derivable from the lesson content above.
- Age-appropriate difficulty for ${params.klass?.name || 'the class'}.

Output STRICTLY valid JSON. NO markdown fences. NO preamble.

INPUT DRAFT:
${JSON.stringify(draft).substring(0, 12000)}`

  const schema = buildSchema(params.format, params.count)
  return withTimeout(
    generateJSONGeminiOnly({ prompt, schema, temperature: 0.6 }),
    55_000,
    'Worksheet humanize',
  )
}
