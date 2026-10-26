// ============================================================
// LessonGuru Odisha — Gemini responseSchema (Part C).
// Passed to generationConfig.responseSchema so Gemini returns
// a strictly-typed JSON object every time — no more free-text
// parsing / regex normalisation.
// ============================================================

export const QUESTION_SET_SCHEMA = {
  type: 'object',
  required: ['meta', 'questions'],
  properties: {
    meta: {
      type: 'object',
      required: ['language', 'worksheet_type', 'total_marks', 'coverage_warning'],
      properties: {
        language:         { type: 'string' },
        worksheet_type:   { type: 'string' },
        instruction_line: { type: 'string' },
        time_allowed:     { type: 'string' },
        total_marks:      { type: 'integer' },
        coverage_warning: { type: 'boolean' },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'format', 'stem', 'answer', 'explanation', 'bloom', 'marks', 'lo_code'],
        properties: {
          id:          { type: 'integer' },
          format:      { type: 'string', enum: ['mcq', 'fill', 'truefalse', 'match', 'very_short', 'short', 'long', 'assertion_reason', 'case_based'] },
          stem:        { type: 'string' },
          passage:     { type: 'string' },
          options:     { type: 'array', items: { type: 'string' } },
          match_left:  { type: 'array', items: { type: 'string' } },
          match_right: { type: 'array', items: { type: 'string' } },
          answer:      { type: 'string' },
          explanation: { type: 'string' },
          hint:        { type: 'string' },
          bloom:       { type: 'string', enum: ['remember', 'understand', 'apply', 'analyse', 'evaluate', 'create'] },
          marks:       { type: 'integer' },
          lo_code:     { type: 'string' },
          answer_lines:{ type: 'integer' },
        },
      },
    },
  },
}

// Per-format character budgets (Part B / Rule 6).  Enforced by the validator.
export const CHAR_BUDGETS = {
  mcq_stem: 120,
  mcq_option: 45,
  fill: 110,
  truefalse: 100,
  very_short: 110,
  short: 150,
  long: 200,
  case_passage: 600,
  explanation: 180,
  hint: 70,
  match_cell: 40,
}

// Bloom targets by difficulty (Part B / Rule 3).  Validator uses these
// as ±1-item tolerance windows.
export const BLOOM_TARGETS = {
  easy:   { remember: 0.30, understand: 0.30, apply: 0.30, analyse: 0.10, evaluate: 0.00, create: 0.00 },
  medium: { remember: 0.15, understand: 0.15, apply: 0.40, analyse: 0.20, evaluate: 0.10, create: 0.00 },
  hard:   { remember: 0.05, understand: 0.05, apply: 0.30, analyse: 0.35, evaluate: 0.15, create: 0.10 },
}

// Banned strings — must not appear in stems or options.
export const BANNED_STRINGS = [
  'all of the above', 'none of the above', 'both a and b',
  'ଉପରୋକ୍ତ ସମସ୍ତ', 'ଉପରୋକ୍ତ କୌଣସି ନୁହେଁ',
  'उपरोक्त सभी', 'उपरोक्त कोई नहीं',
]
