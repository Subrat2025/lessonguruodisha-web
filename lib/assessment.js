// =============================================================================
//  Assessment Generator — 2-stage pipeline
//  ---------------------------------------------------------------------------
//  Stage 1: Gemini (draft) — structured JSON output
//  Stage 2: Gemini (polish) — improves language, pedagogy, rubrics
//
//  🔒 Paid AI Credit zone — Gemini ONLY, no OpenAI fallback.
//
//  Public API:
//    generateAssessment({ klass, book, chapters, type, language, teacherContext })
//        → { title, learningOutcomes, competencies, blueprint, questions,
//            answerKey, rubrics, observationSheet, markDistribution,
//            homework, remedial, enrichment, selfAssessment, peerAssessment,
//            _draft, _polished }
// =============================================================================

import { generateJSONGeminiOnly } from '@/lib/gemini.js'
import { buildScertPersonaBlock } from '@/lib/prompts/persona.js'

// Map internal detectLanguage() → the persona-block language keys the master
// persona expects (odia | english | hindi | sanskrit). `odia-math` still uses
// the Odia persona but the caller may keep numerals in Odia script.
const _personaLangKey = (lang) => {
  const l = String(lang || '').toLowerCase()
  if (l === 'english') return 'english'
  if (l === 'hindi') return 'hindi'
  if (l === 'sanskrit') return 'sanskrit'
  return 'odia'
}

// ------------------- Assessment type meta ----------------------------------
export const ASSESSMENT_TYPES = {
  fa1: {
    label: 'Formative Assessment 1 (FA1)', kind: 'formative',
    totalMarks: 25, durationMin: 45,
    questionMix: { mcq: 6, fill: 4, truefalse: 3, veryShort: 3, activity: 1, application: 1 },
  },
  fa2: {
    label: 'Formative Assessment 2 (FA2)', kind: 'formative',
    totalMarks: 25, durationMin: 45,
    questionMix: { mcq: 5, fill: 3, match: 2, veryShort: 4, picture: 1, competency: 2 },
  },
  sa1: {
    label: 'Summative Assessment 1 (SA1)', kind: 'summative',
    totalMarks: 50, durationMin: 90,
    questionMix: { mcq: 6, veryShort: 6, short: 4, long: 2, assertion: 2, competency: 2 },
  },
  sa2: {
    label: 'Summative Assessment 2 (SA2)', kind: 'summative',
    totalMarks: 50, durationMin: 90,
    questionMix: { mcq: 6, veryShort: 6, short: 4, long: 2, caseBased: 2, analytical: 2 },
  },
  observation: {
    label: 'Teacher Observation Sheet', kind: 'observation',
    totalMarks: 25, durationMin: 0,
    questionMix: {},
  },
  complete: {
    // Complete Assessment = FA (25) + Observation (25) + SA (50) = 100 marks
    label: 'Complete Assessment (FA + Observation + SA)', kind: 'complete',
    totalMarks: 100, durationMin: 120,
    questionMix: { mcq: 10, fill: 5, veryShort: 6, short: 4, long: 3, caseBased: 2, competency: 2 },
  },
}

// ------------------- Language detection ------------------------------------
const detectLanguage = (subject = '', bookName = '', override = '') => {
  if (override) return override
  const s = String(subject + ' ' + bookName).toLowerCase()
  // Strict SCERT/OSEPA rule: paper language MUST match subject language.
  // Order matters — check Sanskrit / Hindi before generic Odia so a Sanskrit
  // textbook doesn't get mis-detected as Odia just because the metadata is
  // stored in Odia elsewhere.
  if (/(sanskrit|संस्कृत|ସଂସ୍କୃତ)/i.test(s)) return 'sanskrit'
  if (/(hindi|हिंदी|हिन्दी|ହିନ୍ଦୀ|ହିନ୍ଦି)/i.test(s)) return 'hindi'
  if (/(english|literature|englishreader|my english|ଇଂରାଜୀ|ଇଂଲିଶ)/i.test(s)) return 'english'
  if (/(odia|ଓଡ଼ିଆ|ଝୁଲଣା|ବିଚିତ୍ର|ଓଡିଆ)/i.test(s)) return 'odia'
  if (/(math|ganit|arithmetic|geometry|algebra|mathematics)/i.test(s)) return 'odia-math'
  return 'odia'
}

// ------------------- Chapter weightage -------------------------------------
const smartDistribute = (chapters, totalQuestions) => {
  // Weight by chapter length (fallback to equal)
  const totalLen = chapters.reduce((a, c) => a + Math.max(1, (c.name || '').length + (c.periods || 1) * 5), 0)
  const dist = chapters.map(c => {
    const w = Math.max(1, (c.name || '').length + (c.periods || 1) * 5) / totalLen
    return { chapterId: c.id, chapterName: c.name, weight: w, questions: Math.max(1, Math.round(w * totalQuestions)) }
  })
  return dist
}

// ------------------- Gemini prompt (Stage 1) --------------------------------
const buildDraftPrompt = ({ typeMeta, klass, book, chapters, language, learningOutcomesInDB, teacherContext }) => {
  const langNote = language === 'odia' ? 'Write EVERYTHING in Odia script (except Learning Outcome codes which stay as-is, e.g. LO-1.4). Only names of scientific concepts / English proper nouns may stay in English if they are common.' :
    language === 'odia-math' ? 'Question text in Odia, but keep mathematical symbols, numerals (use Odia digits ୦-୯ where natural), and formulas readable.' :
    language === 'english' ? 'Write everything in clear, grade-appropriate English.' :
    language === 'hindi' ? 'Write everything in Hindi (Devanagari script).' :
    language === 'sanskrit' ? 'Write everything in Sanskrit (Devanagari script — शुद्ध संस्कृत).' : 'Write in Odia script.'

  const chList = chapters.map((c, i) => `${i + 1}. ${c.name} (id:${c.id}${c.periods ? ', periods:' + c.periods : ''})`).join('\n')
  const loList = (learningOutcomesInDB || []).slice(0, 20).map(lo => `- ${lo.code ? lo.code + ': ' : ''}${lo.description || lo.text || lo}`).join('\n')

  const isObs = typeMeta.kind === 'observation'
  const mixNote = isObs ? '' : `Question mix (approximate): ${Object.entries(typeMeta.questionMix).map(([k, n]) => `${n}× ${k}`).join(', ')}. Total = ${typeMeta.totalMarks} marks.`

  // 🔥 SCERT / OSEPA master persona — same block used by the newer
  //    buildProfessionalAssessment pipeline.  Guarantees identical voice,
  //    quality bar, and strict subject-language enforcement (Odia / English
  //    / Hindi / Sanskrit) across BOTH assessment endpoints.
  const scertPersona = buildScertPersonaBlock({
    language: _personaLangKey(language),
    subjectName: book?.name || '',
    className: klass?.name || '',
    includeLanguagePolicy: true,
    includeIdentity: true,
    includeQuality: true,
    includeLessonOnly: true,
    includeStyle: true,
    includeDifficulty: true,
    includeClassLevel: true,
    includePicture: false,
    includeMCQ: true,
    includeLong: true,
    includeSelfReview: true,
    includeMultiSource: true,
    includeMarksStructure: true,
    includeSubjectDesign: true,
    includeOutputPages: true,
  })

  // Explicit "prompt variables" block — Gemini reliability improves dramatically
  // when the selected Subject AND the Output Language are BOTH surfaced as
  // top-of-prompt variables, in addition to the STRICT LANGUAGE POLICY above.
  const outputLangLabel = ({
    english: 'English',
    hindi: 'Hindi (Devanagari)',
    sanskrit: 'Sanskrit (Devanagari)',
    odia: 'Odia (ଓଡ଼ିଆ)',
    'odia-math': 'Odia (ଓଡ଼ିଆ)',
  })[String(language || 'odia').toLowerCase()] || 'Odia (ଓଡ଼ିଆ)'

  return `${scertPersona}

================================================================
PROMPT VARIABLES
================================================================
Selected Class      :  ${klass?.name || '(not provided)'}
Selected Subject    :  ${book?.name || '(not provided)'}
Selected Chapters   :  ${chapters.map(c => c.name).join(' · ') || '(not provided)'}
Assessment Type     :  ${typeMeta.label}
Total Marks         :  ${typeMeta.totalMarks}
Output Language     :  ${outputLangLabel}

================================================================
TASK — build an ${typeMeta.label} for ${klass?.name || 'a class'}${book?.name ? ' (' + book.name + ')' : ''}
================================================================

CHAPTERS (${chapters.length}):
${chList}

${loList ? 'LEARNING OUTCOMES FROM CURRICULUM DATABASE:\n' + loList + '\n' : ''}
${teacherContext ? 'TEACHER NOTES / CONTEXT:\n' + String(teacherContext).slice(0, 1500) + '\n' : ''}

REQUIREMENTS
- ${langNote}
- **Human writing quality — CRITICAL**: Every question and every option must read like it was written by a caring, experienced Odisha school teacher — NOT like AI text. Warm, direct, natural sentences. NO awkward phrasing, NO translation-y wording, NO generic filler ("various", "different types of", "as we know"). Use complete, clear sentences that a 10-year-old actually understands.
- **Vary sentence structure**: Some short, some longer. Do NOT repeat the same opening pattern across questions.
- **Concrete, child-friendly examples**: Use local Odia names (Rina, Manoj, Suresh, Priya, Anwesha, Sagar), places (Cuttack, Bhubaneswar, Puri, Rourkela, our village), and everyday Odisha objects (mango, jackfruit, bullock cart, cycle, tiffin box, saree, dhoti, rasagulla). NEVER invent foreign contexts (skiing, hamburgers, snow).
- **Contextual richness**: For short/long/case-based questions, wrap the question in a tiny real-life story (1-2 lines) that the child can relate to — do NOT use dry stems like "Explain X" or "Define Y" alone. Instead: "Rina's father brought 8 mangoes home. She gave 2 to her brother. How many mangoes are left with Rina?"
- **Complete-sense answers**: The correct MCQ answer must be a self-contained clear phrase; distractors must be plausible (near-misses) not silly. For fill-in-the-blank, the blank should have ONE clearly correct answer.
- **NO garbled text**: Do NOT output half-sentences, ellipses, or repeated words. If in Odia, use fully-formed Odia grammar.
- Follow Odisha OCF (Odisha Curriculum Framework) alignment.
- NEP 2020 competency-based approach.
- Use Bloom's Taxonomy — mix Remember, Understand, Apply, Analyse, Evaluate, Create.
- Age-appropriate difficulty for ${klass?.name || 'the class'}.
- If multiple chapters, distribute questions proportional to chapter weight (bigger / longer chapters get more).
${mixNote ? '- ' + mixNote : ''}
- Total marks must equal ${typeMeta.totalMarks}. Duration: ${typeMeta.durationMin} minutes.
- Every question must have a chapter reference, marks, and mapped LO code (use provided codes or generate LO-1.n style).
- For observation type: generate 16 observation indicators (Participation, Communication, Reading, Writing, Speaking, Listening, Critical Thinking, Problem Solving, Creativity, Collaboration, Leadership, Confidence, Behaviour, Notebook, Homework, Activity Participation) each with 4-level rubric (Excellent/Good/Satisfactory/Needs Improvement) and marks distribution.
- Include Answer Key with correct answers, step marks (for long questions), and expected keywords.
- Include Rubrics for subjective questions (4 levels: Excellent / Very Good / Good / Needs Improvement).
- Include Homework, Remedial Activities, Enrichment Activities, and Project Work (if applicable).
- Include Self-Assessment (Yes/Partially/No + "I need help with") and Peer Assessment.
- MCQ options MUST be plain strings (not objects). Do NOT wrap options in {text: "...", correct: true} — just an array of strings, and the correct answer text goes in the "answer" field.

EXAMPLE OF GOOD vs BAD (for grade 5 Math, English translation):
❌ BAD (AI-flavoured):   "What is 1/2 of a mango?"
✅ GOOD (teacher-speak): "Suresh cut a mango into 2 equal parts and gave one part to Priya. Which fraction shows Priya's share?"

❌ BAD (dry):            "Define fraction."
✅ GOOD (contextual):    "Rina's mother made a chapati and divided it into 4 equal parts. Rina ate 1 part. In your own words, what does '1/4 of a chapati' mean here?"

Output STRICTLY valid JSON matching the schema. NO markdown fences, NO preamble.`
}

// ------------------- Draft JSON schema (Stage 1) ---------------------------
const draftSchema = (isObs) => ({
  type: 'object',
  required: ['title', 'totalMarks', 'durationMin', 'learningOutcomes', 'blueprint', 'questions', 'answerKey', 'rubrics', 'markDistribution', 'homework', 'remedial', 'enrichment', 'selfAssessment', 'peerAssessment'],
  properties: {
    title: { type: 'string' },
    totalMarks: { type: 'number' },
    durationMin: { type: 'number' },
    instructions: { type: 'string' },
    learningOutcomes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['code', 'description'],
        properties: {
          code: { type: 'string' },
          description: { type: 'string' },
          competency: { type: 'string' },
          bloomLevel: { type: 'string' },
        },
      },
    },
    competencies: { type: 'array', items: { type: 'string' } },
    blueprint: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chapterName: { type: 'string' },
          questionType: { type: 'string' },
          count: { type: 'number' },
          marksEach: { type: 'number' },
          totalMarks: { type: 'number' },
          bloomLevel: { type: 'string' },
          competency: { type: 'string' },
          difficulty: { type: 'string' },
        },
      },
    },
    questions: isObs ? { type: 'array', items: {} } : {
      type: 'array',
      items: {
        type: 'object',
        required: ['q', 'marks', 'type'],
        properties: {
          q: { type: 'string' },
          type: { type: 'string' },
          marks: { type: 'number' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          chapterName: { type: 'string' },
          loCode: { type: 'string' },
          bloomLevel: { type: 'string' },
          difficulty: { type: 'string' },
          hint: { type: 'string' },
        },
      },
    },
    observationSheet: {
      type: 'object',
      properties: {
        indicators: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              excellent: { type: 'string' },
              good: { type: 'string' },
              satisfactory: { type: 'string' },
              needsImprovement: { type: 'string' },
              maxMarks: { type: 'number' },
            },
          },
        },
      },
    },
    answerKey: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          qNumber: { type: 'number' },
          answer: { type: 'string' },
          stepMarks: { type: 'array', items: { type: 'string' } },
          keywords: { type: 'array', items: { type: 'string' } },
          alternatives: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    rubrics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterion: { type: 'string' },
          excellent: { type: 'string' },
          veryGood: { type: 'string' },
          good: { type: 'string' },
          needsImprovement: { type: 'string' },
        },
      },
    },
    markDistribution: {
      type: 'object',
      properties: { fa: { type: 'number' }, observation: { type: 'number' }, sa: { type: 'number' } },
    },
    homework: { type: 'array', items: { type: 'string' } },
    remedial: { type: 'array', items: { type: 'string' } },
    enrichment: { type: 'array', items: { type: 'string' } },
    projectWork: { type: 'string' },
    selfAssessment: {
      type: 'object',
      properties: {
        statements: { type: 'array', items: { type: 'string' } },
        needHelpPrompt: { type: 'string' },
      },
    },
    peerAssessment: {
      type: 'object',
      properties: {
        criteria: { type: 'array', items: { type: 'string' } },
      },
    },
  },
})

// ------------------- Stage 1: Gemini draft ---------------------------------
export async function generateDraft({ klass, book, chapters, type, language, learningOutcomesInDB, teacherContext, lessonContext }) {
  const typeMeta = ASSESSMENT_TYPES[type]
  if (!typeMeta) throw new Error('Unknown assessment type: ' + type)
  const lang = detectLanguage(book?.name || '', book?.name || '', language)
  const basePrompt = buildDraftPrompt({ typeMeta, klass, book, chapters, language: lang, learningOutcomesInDB, teacherContext })
  // Inject lesson content as source-of-truth if provided (new pipeline)
  let prompt = basePrompt
  if (lessonContext && lessonContext.compactContext) {
    const { LESSON_CONTEXT_GUARDRAIL } = await import('@/lib/lesson-context.js')
    prompt = `LESSON CONTENT (source of truth — from LessonGuru DB):
${'─'.repeat(60)}
${lessonContext.compactContext}
${'─'.repeat(60)}

${LESSON_CONTEXT_GUARDRAIL}

${basePrompt}`
  }
  const schema = draftSchema(typeMeta.kind === 'observation')
  const draft = await generateJSONGeminiOnly({ prompt, schema, temperature: 0.6 })
  return { ...draft, language: lang, meta: { type, ...typeMeta } }
}

// ------------------- Stage 2: Gemini polish ---------------------------------
// 🔒 Gemini-only. If polish fails, we silently return the draft.
export async function polishAssessment(draft, { klass, book, chapters, type, language, lessonContext }) {
  const typeMeta = ASSESSMENT_TYPES[type]
  const lessonBlock = (lessonContext && lessonContext.compactContext)
    ? `\nORIGINAL LESSON CONTENT (source of truth):\n${'─'.repeat(60)}\n${lessonContext.compactContext.slice(0, 8000)}\n${'─'.repeat(60)}\n`
    : ''
  const prompt = `You are a senior Odisha Government School teacher polishing a ${klass?.name} ${book?.name || ''} ${typeMeta.label} written by another teacher.
${lessonBlock}
Return the SAME JSON shape but rewritten so it reads like an experienced Odisha teacher — warm, natural, classroom-ready.

CRITICAL VOICE RULES:
- Every question / option / instruction must sound like a real Odisha teacher speaking to a real classroom.
- Zero AI-flavour phrases ("various", "as we know", "let us explore", "in this activity").
- Vary sentence structure — never repeat the same opening pattern.
- Use local Odia names (Rina, Manoj, Priya, Suresh, Anwesha) and everyday objects (mango, jackfruit, tiffin, cycle) as examples ONLY if the paper language is Odia. For English/Hindi/Sanskrit papers, use culturally-neutral names appropriate to the medium.
- Wrap non-trivial questions in a tiny real-life story where natural (1-2 lines, not longer).
- Preserve chapter names, subject names, LO codes EXACTLY as in the input.

STRICT LANGUAGE RULE:
- The ENTIRE polished paper — questions, options, instructions, section headings, answer key, model answers, marking scheme, blueprint labels, teacher observation checklist, rubric rows/columns/descriptors — MUST be in ${draft.language || language}.
- NEVER mix languages. NEVER transliterate. NEVER add English translations in brackets.
- Digits, punctuation, and grammar must follow ${draft.language || language} norms.

CONTENT RULES:
1. Fix grammar and spelling in ${draft.language || language} language throughout.
2. Ensure every question has clear Bloom's Taxonomy level (Remember/Understand/Apply/Analyse/Evaluate/Create).
3. Ensure competency-based questions test skills grounded in the lesson content.
4. Remove any duplicate or near-duplicate questions; add replacements with same difficulty.
5. Improve pedagogical clarity — no ambiguous wording.
6. Ensure total marks = ${typeMeta.totalMarks} exactly. Adjust individual marks if needed.
7. Ensure answer key answers are correct and complete-sentence.
8. Improve rubric descriptors to be specific and actionable.
9. Age-appropriate language and difficulty.
10. Make instructions clear and student-friendly.
11. Every question must map to a chapter from the input.
12. Preserve all sections: learningOutcomes, blueprint, questions, answerKey, rubrics, observationSheet, homework, remedial, enrichment, selfAssessment, peerAssessment, markDistribution.
13. MCQ options MUST be plain strings (not {text, correct} objects).

STRICT: Output valid JSON only. NO markdown fences. NO preamble text. Same schema as input.

INPUT DRAFT (JSON):
${JSON.stringify(draft).slice(0, 12000)}`

  const schema = draftSchema(typeMeta.kind === 'observation')
  try {
    const polished = await generateJSONGeminiOnly({ prompt, schema, temperature: 0.4 })
    return { ...polished, language: draft.language, meta: draft.meta }
  } catch (e) {
    // If Gemini polish fails (quota/rate-limit), return the draft — better than nothing.
    console.warn('[assessment] Gemini polish stage failed, returning draft:', e.message)
    return draft
  }
}

// ------------------- Full pipeline ------------------------------------------
// Sanitize a raw AI-produced questions[] array so options are always plain strings
// and answers are always strings. Prevents "Objects are not valid as a React
// child" crashes in the frontend when Gemini/OpenAI return {text, correct}
// objects instead of the schema-declared strings.
const flattenChoice = (o) => typeof o === 'string' ? o : (o?.text || o?.option || o?.label || o?.value || String(o))
const normalizeQuestions = (arr) => (Array.isArray(arr) ? arr : []).map(q => {
  const options = Array.isArray(q?.options) ? q.options.map(flattenChoice) : q?.options
  const matchB = Array.isArray(q?.matchB) ? q.matchB.map(flattenChoice) : q?.matchB
  const answer = typeof q?.answer === 'string' ? q.answer :
    (q?.answer?.text || q?.answer?.value || (q?.answer ? JSON.stringify(q.answer) : ''))
  return { ...q, options, matchB, answer }
})
// Normalize LOs to always have {code, description, bloomLevel?}.
const normalizeLOs = (arr) => (Array.isArray(arr) ? arr : []).map(lo => {
  if (typeof lo === 'string') return { code: '', description: lo }
  return {
    code: lo?.code || '',
    description: lo?.description || lo?.text || lo?.label || '',
    competency: lo?.competency || '',
    bloomLevel: lo?.bloomLevel || '',
  }
})

export async function generateAssessment(params) {
  const draft = await generateDraft(params)
  const polished = await polishAssessment(draft, params)
  return {
    ...polished,
    questions: normalizeQuestions(polished.questions),
    learningOutcomes: normalizeLOs(polished.learningOutcomes),
    _stage: 'polished',
  }
}
