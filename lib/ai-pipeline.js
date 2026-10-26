// =============================================================================
//  AI Pipeline — shared 2-stage generator (Gemini draft → Gemini humanize)
//  ---------------------------------------------------------------------------
//  Used by every paid AI Credit zone (Student Engagement resources —
//  HOTS/Homework/Practice/Activities/Remedial/Exam, Custom Worksheets,
//  Assessment paid-generation).
//
//  🔒 GEMINI ONLY — no OpenAI fallback. If Gemini fails, we surface a
//     friendly error and the calling route MUST refund credits.
//
//  Pipeline:
//    Stage 1 (Gemini)  — lesson-grounded structured JSON draft
//    Stage 2 (Gemini)  — humanize, polish grammar, improve pedagogy
// =============================================================================

import { generateJSONGeminiOnly } from '@/lib/gemini.js'
import { withTimeout } from '@/lib/timeout.js'
import { buildPromptContext, LESSON_CONTEXT_GUARDRAIL } from '@/lib/lesson-context.js'

const CALL_TIMEOUT_MS = 55_000

/**
 * Style prompt appended to Stage 2 (ChatGPT). Enforces the "Odisha government
 * school teacher" voice + language + pedagogical quality rules.
 */
export const TEACHER_VOICE_INSTRUCTIONS = `
REWRITE THE ABOVE DRAFT so every line reads like it was written by an experienced
Odisha Government School teacher speaking to real students in a real classroom.

VOICE & TONE
- Warm, direct, natural — like a caring teacher, not an AI or an academic.
- Complete, grammatically correct sentences that a 10–12-year-old can understand.
- Vary sentence structure. NEVER repeat the same opening pattern across questions.
- Zero AI-flavour: NO phrases like "various", "as we know", "in this activity", "let us discuss".

LOCAL FLAVOUR
- Use Odia names (Rina, Manoj, Priya, Anwesha, Sagar, Suresh, Puja) and places
  (Cuttack, Bhubaneswar, Puri, Rourkela, our village) when giving examples.
- Use everyday Odisha objects: mango, jackfruit, chapati, rasagulla, tiffin box,
  bullock cart, cycle, saree, dhoti. NEVER use foreign contexts (skiing, snow,
  hamburgers, dollars).

PEDAGOGY
- Follow Odisha OCF / NEP 2020 competency-based approach.
- Mix Bloom levels — Remember, Understand, Apply, Analyse, Evaluate, Create.
- Wrap non-trivial questions in tiny real-life stories (1-2 lines) instead of
  dry stems.

STRUCTURE & QUALITY
- Preserve the JSON shape and all keys from the draft.
- Preserve chapter/subject/book names EXACTLY as written.
- Preserve Learning Outcome codes (LO-1.4 etc.) EXACTLY.
- MCQ options MUST be plain strings, not {text, correct} objects. Correct answer
  goes in a separate "answer" field.
- Every question must have a specific, unambiguous correct answer.
- Distractors must be plausible (near-misses), not silly.
- Print-ready: teachers should be able to print your output directly.

Output STRICTLY valid JSON matching the draft's schema. NO markdown fences,
NO preamble, NO explanation.
`.trim()

/**
 * Run Stage 1 (Gemini draft) with lesson context injected and hard timeout.
 * 🔒 Gemini-only — no OpenAI fallback. Throws friendly error on failure.
 */
export async function runDraftStage({ ctx, taskPrompt, schema, temperature = 0.5, label = 'draft' }) {
  const fullPrompt = `${buildPromptContext(ctx)}\n\n${taskPrompt}`
  return await withTimeout(
    generateJSONGeminiOnly({ prompt: fullPrompt, schema, temperature }),
    CALL_TIMEOUT_MS,
    `Gemini ${label}`,
  )
}

/**
 * Run Stage 2 (Gemini humanize). Rewrites the draft to teacher voice.
 * 🔒 Gemini-only — no OpenAI. If humanize fails, we return the draft
 * so the caller still gets usable content instead of nothing.
 */
export async function runHumanizeStage({ ctx, draft, schema, extraGuidance = '', temperature = 0.7, label = 'humanize' }) {
  const draftJson = JSON.stringify(draft)
  const prompt = `${buildPromptContext(ctx, 'ORIGINAL LESSON CONTENT (source of truth)')}

DRAFT JSON TO HUMANIZE:
${draftJson.length > 40000 ? draftJson.substring(0, 40000) + '\n// (truncated for length)' : draftJson}

${TEACHER_VOICE_INSTRUCTIONS}

${extraGuidance || ''}`

  try {
    return await withTimeout(
      generateJSONGeminiOnly({ prompt, schema, temperature }),
      CALL_TIMEOUT_MS,
      `Gemini ${label}`,
    )
  } catch (err) {
    // Humanize is optional polish — if Gemini quota/rate-limit hits during
    // humanize, return the draft rather than failing the whole generation.
    console.warn(`[ai-pipeline] Gemini ${label} failed → returning draft as-is:`, err.message)
    return draft
  }
}

/**
 * Convenience: run both stages back-to-back. Used by resource generators.
 */
export async function runTwoStage({
  ctx, draftPrompt, draftSchema,
  humanizeSchema, extraGuidance,
  onDraftReady,               // optional callback with the draft (used to save to DB early for progressive UX)
}) {
  const draft = await runDraftStage({ ctx, taskPrompt: draftPrompt, schema: draftSchema })
  try { if (onDraftReady) await onDraftReady(draft) } catch (_err) { /* non-fatal */ }
  const polished = await runHumanizeStage({ ctx, draft, schema: humanizeSchema || draftSchema, extraGuidance })
  return { draft, polished }
}

/** Sanitize AI-produced questions[] into a safe frontend-renderable shape. */
export const flattenChoice = (o) => typeof o === 'string' ? o : (o?.text || o?.option || o?.label || o?.value || String(o))
export function normalizeQuestions(arr) {
  return (Array.isArray(arr) ? arr : []).map(q => {
    const options = Array.isArray(q?.options) ? q.options.map(flattenChoice) : q?.options
    const matchB = Array.isArray(q?.matchB) ? q.matchB.map(flattenChoice) : q?.matchB
    const answer = typeof q?.answer === 'string' ? q.answer :
      (q?.answer?.text || q?.answer?.value || (q?.answer ? JSON.stringify(q.answer) : ''))
    return { ...q, options, matchB, answer }
  })
}
export function normalizeLOs(arr) {
  return (Array.isArray(arr) ? arr : []).map(lo => {
    if (typeof lo === 'string') return { code: '', description: lo }
    return {
      code: lo?.code || '',
      description: lo?.description || lo?.text || lo?.label || '',
      competency: lo?.competency || '',
      bloomLevel: lo?.bloomLevel || '',
    }
  })
}
