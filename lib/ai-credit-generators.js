// AI Credit — Generator Prompt + Schema Registry
//
// Maps the 21 seeded generation types to (a) a Gemini JSON schema and
// (b) a prompt builder. Every zone/type must be registered here so the
// dispatcher route can look it up and reject anything unknown.
//
// This file is imported ONLY by the new /api/ai-credits/generate route.
// It never touches existing Panchapadi or LO paths.

// ---------------- Reusable primitive schemas ----------------

const S_QUESTIONS = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          a: { type: 'string' },
          hint: { type: 'string' },
          difficulty: { type: 'string' },
          marks: { type: 'number' },
        },
        required: ['q'],
      },
    },
  },
  required: ['questions'],
}

const S_EXAMPLES = {
  type: 'object',
  properties: {
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'description'],
      },
    },
  },
  required: ['examples'],
}

const S_PROJECT = {
  type: 'object',
  properties: {
    projects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          objective: { type: 'string' },
          materials: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          outcome: { type: 'string' },
        },
        required: ['title', 'objective', 'steps'],
      },
    },
  },
  required: ['projects'],
}

const S_ACTIVITIES = {
  type: 'object',
  properties: {
    activities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          duration: { type: 'string' },
          materials: { type: 'array', items: { type: 'string' } },
          instructions: { type: 'string' },
          learningGoal: { type: 'string' },
        },
        required: ['title', 'instructions'],
      },
    },
  },
  required: ['activities'],
}

const S_WORKSHEET = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    instructions: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          type: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          marks: { type: 'number' },
        },
        required: ['q', 'type'],
      },
    },
    totalMarks: { type: 'number' },
  },
  required: ['title', 'questions'],
}

const S_ASSESSMENT_PAPER = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    duration: { type: 'string' },
    totalMarks: { type: 'number' },
    generalInstructions: { type: 'array', items: { type: 'string' } },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          instructions: { type: 'string' },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                q: { type: 'string' },
                type: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                answer: { type: 'string' },
                marks: { type: 'number' },
              },
              required: ['q'],
            },
          },
        },
        required: ['name', 'questions'],
      },
    },
  },
  required: ['title', 'sections'],
}

const S_OBSERVATION = {
  type: 'object',
  properties: {
    indicators: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          indicator: { type: 'string' },
          descriptor: { type: 'string' },
          rubric: { type: 'array', items: { type: 'string' } },
        },
        required: ['indicator'],
      },
    },
  },
  required: ['indicators'],
}

// ---------------- Prompt builder helpers ----------------

function ctxHeader({ className, bookName, chapterName, topic, loCodes, language, extra }) {
  const lang = String(language || 'odia').toLowerCase() === 'english' ? 'English' : 'Odia (ଓଡ଼ିଆ)'
  const parts = [
    `Class: ${className || 'unspecified'}`,
    `Book/Subject: ${bookName || 'unspecified'}`,
    `Chapter: ${chapterName || 'unspecified'}`,
    `Topic: ${topic || 'unspecified'}`,
    Array.isArray(loCodes) && loCodes.length ? `Aligned LO Codes: ${loCodes.join(', ')}` : null,
    `Output Language: ${lang}`,
  ].filter(Boolean)
  if (extra && typeof extra === 'object') {
    const bag = Object.entries(extra)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' • ')
    if (bag) parts.push(`Extra parameters: ${bag}`)
  }
  return parts.join('\n')
}

const q = (n) => `Generate ${n} items. Be topic-specific — never generic filler.`
const rooted = 'Use Odisha cultural context (Konark, Chilika, paddy, Jagannath, local festivals, common Odia names) wherever a real-life example is helpful.'

// ---------------- Registry ----------------
// Every zone/type MUST be here. If not present → the dispatcher rejects the request.

export const GENERATORS = {
  // ============ ENGAGEMENT (13) ============
  'engagement:topic_check': {
    label: 'Topic Check',
    schema: S_QUESTIONS,
    temperature: 0.5,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate 5 quick "Topic Check" questions to verify a student's understanding of THIS topic.
- Mix of easy/medium.
- Each with a model answer (a) and a short hint.
- ${rooted}`,
  },
  'engagement:more_examples': {
    label: 'More Examples',
    schema: S_EXAMPLES,
    temperature: 0.8,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Provide 5 vivid real-life EXAMPLES that make this topic concrete for the student. ${rooted} Each: title + 2-3 sentence description.`,
  },
  'engagement:more_questions': {
    label: 'More Questions',
    schema: S_QUESTIONS,
    temperature: 0.7,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate 8 extra PRACTICE QUESTIONS for self-study. Mix recall + application + analysis. Include a short hint for each. Provide a short model answer.`,
  },
  'engagement:project_work': {
    label: 'Project Work',
    schema: S_PROJECT,
    temperature: 0.8,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Design 2 hands-on PROJECT ideas for students to do at home / small group. Materials must be locally available in rural Odisha. Give title, objective, materials, 5-8 steps, and expected outcome.`,
  },
  'engagement:practice_set': {
    label: 'Practice Set',
    schema: S_QUESTIONS,
    temperature: 0.6,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Create a PRACTICE SET of 10 questions in graded order (easy → medium → hard). Provide model answer for each. Mark difficulty per question.`,
  },
  'engagement:hots': {
    label: 'HOTS',
    schema: S_QUESTIONS,
    temperature: 0.7,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate 5 HIGHER-ORDER-THINKING (HOTS) questions requiring application, analysis, or synthesis. Include hints and a model answer.`,
  },
  'engagement:homework': {
    label: 'Homework',
    schema: S_QUESTIONS,
    temperature: 0.6,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate a HOMEWORK sheet of 6 questions (mix short + medium). Include model answers. Add difficulty tag.`,
  },
  'engagement:activity': {
    label: 'Activity',
    schema: S_ACTIVITIES,
    temperature: 0.8,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Design 3 classroom ACTIVITIES (5-10 minutes each). Include title, duration, materials, instructions, and learning goal. ${rooted}`,
  },
  'engagement:competency': {
    label: 'Competency',
    schema: S_QUESTIONS,
    temperature: 0.6,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate 6 COMPETENCY-based questions aligned to the topic + LO codes. Focus on demonstrating a real skill. Include model answers.`,
  },
  'engagement:skill': {
    label: 'Skill',
    schema: S_ACTIVITIES,
    temperature: 0.7,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Suggest 3 SKILL-development activities the student can practise around this topic. Include duration, materials, instructions, and learning goal.`,
  },
  'engagement:revision': {
    label: 'Revision',
    schema: S_QUESTIONS,
    temperature: 0.5,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Create a REVISION set of 8 short questions covering all key ideas. Include model answers and difficulty tags. Should be doable in 15 minutes.`,
  },
  'engagement:remedial': {
    label: 'Remedial',
    schema: S_QUESTIONS,
    temperature: 0.5,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Produce 6 REMEDIAL questions for students who struggle with this topic. Start very easy, build confidence, include worked-out hints and clear model answers.`,
  },
  'engagement:exam': {
    label: 'Exam',
    schema: S_QUESTIONS,
    temperature: 0.5,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate 10 EXAM-style questions on this topic. Mix objective + short + long. Provide marks per question and model answers.`,
  },

  // ============ WORKSHEET (2) ============
  'worksheet:custom_worksheet': {
    label: 'Custom Worksheet',
    schema: S_WORKSHEET,
    temperature: 0.6,
    buildPrompt: (ctx) => {
      const count = ctx?.extra?.count || 10
      const types = Array.isArray(ctx?.extra?.types) && ctx.extra.types.length ? ctx.extra.types : ['mcq', 'fill', 'short']
      return `${ctxHeader(ctx)}

Generate a CUSTOM WORKSHEET with ${count} questions using these types: ${types.join(', ')}.
- MCQ has 4 options with the correct one as "answer".
- Marks: MCQ/fill/truefalse=1, short=2, long=5, match=4.
- Provide "instructions" for students. Title in output language. Compute totalMarks.`
    },
  },
  'worksheet:assessment_worksheet': {
    label: 'Assessment Worksheet',
    schema: S_WORKSHEET,
    temperature: 0.5,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Create an ASSESSMENT WORKSHEET (10 questions) suitable for a graded formative check.
- Include MCQ, fill, short, long question types.
- Provide correct answers and marks.
- Compute totalMarks.`,
  },

  // ============ ASSESSMENT (4) ============
  'assessment:fa_assessment': {
    label: 'FA Assessment',
    schema: S_WORKSHEET,
    temperature: 0.5,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate a FORMATIVE ASSESSMENT (FA) — 10 questions, mix mcq/fill/short/long. Include answers + marks. Total marks 20.`,
  },
  'assessment:sa_assessment': {
    label: 'SA Assessment',
    schema: S_ASSESSMENT_PAPER,
    temperature: 0.5,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate a full SUMMATIVE ASSESSMENT (SA) paper. 4 sections (A: MCQ, B: Very short, C: Short, D: Long). Include general instructions, duration (~2 hours), total marks 40, and marks per question.`,
  },
  'assessment:observation': {
    label: 'Observation',
    schema: S_OBSERVATION,
    temperature: 0.6,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Design an OBSERVATION checklist for a teacher to assess this topic in class. 6 indicators; each has a descriptor and a 3-level rubric (Beginning / Progressing / Proficient).`,
  },
  'assessment:assessment_paper': {
    label: 'Assessment Paper',
    schema: S_ASSESSMENT_PAPER,
    temperature: 0.5,
    buildPrompt: (ctx) => `${ctxHeader(ctx)}

Generate a full ASSESSMENT PAPER. 4 sections (A: MCQ, B: Very short, C: Short, D: Long/HOTS). Include general instructions, duration ~2.5 hours, total marks 50, and marks per question.`,
  },

  // ============ BULK (2) — server orchestrates individual generations later.
  // For Phase 1B we still register a schema so the endpoint doesn't 400.
  'bulk:engagement_all': {
    label: 'Generate All (Engagement)',
    schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
    temperature: 0.5,
    buildPrompt: () => 'Return { "note": "bulk placeholder — orchestrated in Round B" }',
  },
  'bulk:worksheet_assessment_all': {
    label: 'Generate All (Worksheet/Assessment)',
    schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
    temperature: 0.5,
    buildPrompt: () => 'Return { "note": "bulk placeholder — orchestrated in Round B" }',
  },
}

export function getGenerator(zone, type) {
  const key = `${String(zone || '').toLowerCase()}:${String(type || '').toLowerCase()}`
  return GENERATORS[key] || null
}

export function listGenerators() {
  return Object.entries(GENERATORS).map(([key, gen]) => ({
    key,
    zone: key.split(':')[0],
    type: key.split(':')[1],
    label: gen.label,
  }))
}
