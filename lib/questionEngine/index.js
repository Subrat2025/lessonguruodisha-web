// ============================================================
// LessonGuru Odisha — Question Generation Engine (public entry).
// One service. One prompt builder. One validator. Two callers.
//
// Callers:
//   POST /api/lessons/:id/worksheets                (mode='worksheet')
//   POST /api/lessons/:id/engagement/:section       (mode='engagement')
//
// The engine:
//   1. hard-gates missing sourceText (ERR_NO_SOURCE, no credit debit)
//   2. resolves language + script (Part G)
//   3. picks the type profile brief (Part E)
//   4. builds the strict prompt (Part B)
//   5. calls Gemini with responseSchema (Part C)
//   6. runs the validator (Part D)
//   7. regenerates ONLY the failed items (up to 2 retries, no extra debit)
//   8. returns the normalized question set  { meta, questions[] }
// ============================================================

import { resolveLanguage } from './languageResolver.js'
import { getTypeProfile } from './typeProfiles.js'
import { SYSTEM_INSTRUCTION, buildUserPrompt } from './promptBuilder.js'
import { getStringPack, getTypeNames, getInstructionLine } from './stringPacks.js'
import { QUESTION_SET_SCHEMA } from './schema.js'
import { validateQuestionSet } from './validator.js'

// Gemini model choice — Standard (Flash) is cheap and fast; Pro is used
// when the caller sets qualityMode='High'.
// The exact model names + safety settings live in @/lib/gemini which is
// the platform-wide client.  We stay JSON-mode only here.
async function callGeminiStructured({ system, user, qualityMode = 'Standard' }) {
  const { generateJSONGeminiOnly, geminiEnabled } = await import('@/lib/gemini.js')
  if (!geminiEnabled()) throw Object.assign(new Error('Gemini not configured on server'), { code: 'GEMINI_DISABLED' })
  const temperature = qualityMode === 'High' ? 0.3 : 0.4
  return await generateJSONGeminiOnly({
    prompt: user,
    schema: QUESTION_SET_SCHEMA,
    temperature,
    systemInstruction: system,
  })
}

/**
 * Public entry.
 * @param {object} req
 * @returns {Promise<{ok:boolean,meta:object,questions:object[],warnings:string[],attempts:number}>}
 */
export async function generateQuestions(req) {
  const {
    mode = 'worksheet',                       // 'worksheet' | 'engagement'
    classLevel = '', subject = '', medium = '',
    book = '', chapter = null, topic = '',
    sourceText = '',
    worksheetType = 'practice',
    format = 'mcq',
    difficulty = 'medium',
    count = 10,
    qualityMode = 'Standard',
    learningOutcomes = [],
    sanskritScript = 'Odia',
    schoolMedium = '',
  } = req || {}

  // ── Hard gate: no source text → no Gemini call, no credit debit.
  const cleanSource = String(sourceText || '').trim()
  if (cleanSource.length < 200) {
    return {
      ok: false,
      code: 'ERR_NO_SOURCE',
      error: 'Chapter content not loaded. Please open the chapter first.',
      questions: [],
      meta: {},
      warnings: [],
      attempts: 0,
    }
  }

  // ── Language + script + labels (Part E v2: registry-first, no English fallback).
  const { language, script, numerals, labels, resolvedBy } = resolveLanguage(subject, medium, {
    sanskritScript, book, schoolMedium, classLevel,
  })

  // ── Localized string pack for this language/script (labels the model must reuse).
  const stringPack = getStringPack(language, script)
  const typeNames = getTypeNames(language, script)
  const instructionLine = getInstructionLine(language, script)

  // ── Type-profile brief.
  const typeProfile = getTypeProfile(worksheetType, mode)
  const typeName = typeNames[typeProfile.key] || typeProfile.label

  // ── Prompt.
  const buildReq = {
    language, script, numerals,
    classLevel, subject, medium,
    book,
    chapterNumber: chapter?.number || '',
    chapterTitle:  chapter?.title  || '',
    topic,
    worksheetType: typeProfile.label,
    typeProfileBrief: typeProfile.brief,
    stringPack, typeName, instructionLine,
    format,
    difficulty,
    resolvedBy,
    count: Math.min(Math.max(Number(count) || 10, 3), 30),
    learningOutcomes,
    sourceText: cleanSource.slice(0, 24000),         // keep prompt within budget
  }

  // ── First call.
  let attempts = 0
  let raw = null
  let lastError = null
  for (let a = 0; a < 3; a++) {
    try {
      attempts++
      raw = await callGeminiStructured({
        system: SYSTEM_INSTRUCTION,
        user: buildUserPrompt(buildReq),
        qualityMode,
      })
      break
    } catch (err) {
      lastError = err
      const msg = err?.message || ''
      if (/429|500|503|timeout|ECONNRESET/i.test(msg) && a < 2) {
        // Exponential backoff: 2s, 5s (12s only used on the 3rd retry which we skip here).
        await new Promise(r => setTimeout(r, a === 0 ? 2000 : 5000))
        continue
      }
      throw err
    }
  }

  if (!raw || !raw.questions) {
    throw lastError || new Error('Gemini returned an unusable response')
  }

  // ── Validate + auto-regenerate failed items (max 2 retries).
  let content = raw
  const validationReq = { ...buildReq, difficulty }
  let val = validateQuestionSet(content, validationReq)
  let retries = 0
  while (!val.ok && retries < 2 && val.regenerateItems.length) {
    retries++
    const failedStems = val.regenerateItems.map(i => content.questions[i]?.stem).filter(Boolean)
    const goodStems   = content.questions.filter((_, i) => !val.regenerateItems.includes(i)).map(q => q.stem)
    // Ask for only the failed count, avoiding overlap with already-good items.
    const patchReq = { ...buildReq, count: val.regenerateItems.length, alreadyGenerated: goodStems.concat(failedStems) }
    let patchRaw
    try {
      attempts++
      patchRaw = await callGeminiStructured({
        system: SYSTEM_INSTRUCTION,
        user: buildUserPrompt(patchReq) + `\n\nThese items were REJECTED by the validator — regenerate DIFFERENT, better items that FIX the following issues:\n${val.failures.slice(0, 8).map(f => `  · item ${f.item + 1}: ${f.check} — ${f.reason}`).join('\n')}`,
        qualityMode,
      })
    } catch (err) {
      // Non-fatal — keep the previous set (some bad items) and break.
      break
    }
    if (Array.isArray(patchRaw?.questions) && patchRaw.questions.length) {
      // Splice the new items into the failed slots.
      const fresh = patchRaw.questions.slice(0, val.regenerateItems.length)
      val.regenerateItems.forEach((slot, k) => {
        if (fresh[k]) content.questions[slot] = { ...fresh[k], id: slot + 1 }
      })
      val = validateQuestionSet(content, validationReq)
    } else {
      break
    }
  }

  // ── Renumber ids 1..N for a stable print order.
  content.questions = (val.questions || content.questions).map((q, i) => ({ ...q, id: i + 1 }))

  // ── Attach engine-side info the caller might need.
  content.meta = {
    ...(content.meta || {}),
    language,
    script,
    numerals,
    labels,
    resolvedBy,
    coverage_warning: !!content.meta?.coverage_warning || content.questions.length < buildReq.count,
  }

  return {
    ok: true,
    meta: content.meta,
    questions: content.questions,
    warnings: val.failures.map(f => f.reason).slice(0, 8),
    attempts,
    validation: {
      passed: val.ok,
      failedChecks: val.failures.map(f => ({ item: f.item, check: f.check, reason: f.reason })),
    },
  }
}
