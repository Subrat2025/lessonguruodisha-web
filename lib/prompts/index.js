// ============================================================================
//  Prompt library — barrel export
//  ---------------------------------------------------------------------------
//  Each feature has its own dedicated prompt file so we can tune them
//  independently.  For now the Assessment Builder file is fully specialised;
//  the other feature stubs re-export their existing generator functions from
//  /app/lib/gemini.js and /app/lib/resources.js so nothing regresses today.
//  A follow-up refactor can migrate each helper into its own prompt file.
// ============================================================================

export * from './question-types.js'
export * from './marks-distribution.js'
export * as assessmentPrompts from './assessment.js'

// ---------- Feature prompt stubs (delegating to existing generators) --------
//
// The following exports satisfy the "dedicated prompt file per feature"
// architecture without breaking existing generators.  Each one can be
// hardened with a bespoke prompt over time.

export { genLessonPlan as promptLessonPlan } from '../gemini.js'
export { genWorksheet as promptWorksheetLegacy } from '../gemini.js'
export { genEngagement as promptEngagement } from '../gemini.js'
export { genActivities as promptActivities } from '../gemini.js'
export { suggestLoCodes as promptSuggestLoCodes } from '../gemini.js'
