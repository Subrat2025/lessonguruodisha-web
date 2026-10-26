// ============================================================
// LessonGuru Odisha — FA/SA Paper: Gemini responseSchema.
// Passed to Gemini so the model returns a STRICTLY TYPED object.
// The validator then applies content-level checks on top.
// ============================================================

export const ASSESSMENT_SCHEMA = {
  type: 'object',
  required: ['assessment', 'questions'],
  properties: {
    assessment: {
      type: 'object',
      required: ['title', 'class', 'subject', 'language', 'assessment_type', 'total_marks', 'duration'],
      properties: {
        title:            { type: 'string' },
        school_name:      { type: 'string' },
        session:          { type: 'string' },
        class:            { type: 'string' },
        subject:          { type: 'string' },
        language:         { type: 'string' },
        assessment_type:  { type: 'string' },
        term:             { type: 'string' },
        total_marks:      { type: 'integer' },
        duration:         { type: 'string' },
        exam_date:        { type: 'string' },
        instructions:     { type: 'array', items: { type: 'string' } },
        chapters:         { type: 'array', items: { type: 'string' } },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['question_no', 'section', 'type', 'question', 'answer', 'marks', 'chapter', 'lo_code', 'bloom_level'],
        properties: {
          question_no:  { type: 'integer' },
          section:      { type: 'string' },       // 'A' | 'B' | 'C' | 'D' | 'E'
          type:         { type: 'string' },       // MCQ | FIB | TF | MATCH | VSA | SA | LA | CASE
          question:     { type: 'string' },
          options:      { type: 'array', items: { type: 'string' } },
          correct_option: { type: 'string' },     // 'A'|'B'|'C'|'D' for MCQ, empty otherwise
          answer:       { type: 'string' },
          marks:        { type: 'integer' },
          chapter:      { type: 'string' },
          lo_code:      { type: 'string' },
          competency:   { type: 'string' },
          bloom_level:  { type: 'string' },       // Remember | Understand | Apply | Analyse | Evaluate | Create
          value_points: { type: 'array', items: { type: 'string' } },
          stepwise_marks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['point', 'marks'],
              properties: {
                point: { type: 'string' },
                marks: { type: 'number' },
              },
            },
          },
          alternate_accepted_answers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

// Forbidden placeholder tokens — any field containing one of these
// strings (case-insensitive) is rejected by the validator.
export const PLACEHOLDER_PATTERNS = [
  /^correct\s*answer$/i,
  /^value\s*points?\s*:?$/i,
  /^answer\s*:?$/i,
  /^correct\s*response$/i,
  /^to\s*be\s*answered$/i,
  /^n\s*\/?\s*a$/i,
  /^not\s*(available|applicable)$/i,
  /^[—\-–]+$/,
  /^\.{3,}$/,
  /\[answer\]/i,
  /\[insert\s*answer\]/i,
  /\[generate\s*answer\]/i,
  /\[to be filled\]/i,
  /value\s*point\s*→\s*\d+\s*m/i,
  /correct\s*answer\s*\/\s*value\s*point/i,
  /^option\s*[a-d]$/i,
  /^\?+$/,
  /^xxx+$/i,
]

export function isPlaceholder(str) {
  const s = String(str || '').trim()
  if (!s) return true                 // empty counts as placeholder
  // Reject single characters ONLY when they're pure punctuation/dashes —
  // a lone digit, letter or fraction (½) is legitimate content.
  if (s.length === 1 && /[\s\-–—.,;:_·•]/.test(s)) return true
  return PLACEHOLDER_PATTERNS.some(rx => rx.test(s))
}
