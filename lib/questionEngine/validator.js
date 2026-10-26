// ============================================================
// LessonGuru Odisha — Question-set validator (Part D).
// Runs 11 checks against a Gemini response and returns
//   { ok, questions, meta, failures[], regenerateItems[] }
// so the engine can auto-regenerate FAILED items only
// (up to 2 retries, no extra credit charge).
// ============================================================

import { CHAR_BUDGETS, BANNED_STRINGS, BLOOM_TARGETS } from './schema.js'

// ---- helpers ----
const SCRIPT_RANGES = {
  Odia:       /[\u0B00-\u0B7F]/g,
  Devanagari: /[\u0900-\u097F]/g,
  Latin:      /[A-Za-z]/g,
  // Latin sanity — Odia/Devanagari output must NOT be mostly Latin.
  latinAny:   /[A-Za-z]/g,
}
const tokenize = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(/\s+/).filter(Boolean)
const jaccard = (a, b) => {
  const A = new Set(tokenize(a)); const B = new Set(tokenize(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  A.forEach(t => { if (B.has(t)) inter++ })
  return inter / (A.size + B.size - inter)
}

/**
 * Validate an entire question set.
 * @param {object} content { meta, questions }
 * @param {object} req     the original engine request
 * @returns {object}       { ok, questions, meta, failures, regenerateItems, cleanedContent }
 */
export function validateQuestionSet(content, req) {
  const failures = []
  const regenerateItems = []          // 0-based indices of items to regenerate
  const meta = content?.meta || {}
  let questions = Array.isArray(content?.questions) ? content.questions.slice() : []

  // ---- D9 · Strip stray markdown / emoji / \n from every string field ----
  const stripDecor = (s) => {
    if (typeof s !== 'string') return s
    return s
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\n+/g, ' ')
      .replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]/g, '')   // surrogate emoji
      .replace(/[\u2600-\u27BF]/g, '')                 // BMP dingbats / emoji
      .trim()
  }
  questions = questions.map(q => {
    const out = { ...q }
    for (const k of ['stem', 'answer', 'explanation', 'hint', 'passage']) {
      if (out[k]) out[k] = stripDecor(out[k])
    }
    if (Array.isArray(out.options))     out.options     = out.options.map(stripDecor)
    if (Array.isArray(out.match_left))  out.match_left  = out.match_left.map(stripDecor)
    if (Array.isArray(out.match_right)) out.match_right = out.match_right.map(stripDecor)
    return out
  })

  // ---- D1 · Script purity (Rule 1) — inspects STEMS *and* scaffolding ----
  //  E8: also cover labels/headings/worked-examples/feedback the model emits,
  //  not just stems — the reported Homework bug had Odia stems but English
  //  scaffolding, which a stem-only check would have passed.
  const targetScript = req.script                       // 'Odia' | 'Devanagari' | 'Latin'
  if (targetScript && targetScript !== 'Latin') {
    const targetRe = SCRIPT_RANGES[targetScript]
    const scaffoldFields = ['worked_example', 'example', 'feedback', 'feedback_correct', 'feedback_incorrect', 'recap', 'reflection', 'instruction', 'instructions', 'heading', 'rubric']
    questions.forEach((q, i) => {
      const parts = [q.stem, ...(q.options || []), q.answer, q.explanation, q.hint, q.passage, ...(q.match_left || []), ...(q.match_right || [])]
      for (const f of scaffoldFields) {
        if (typeof q[f] === 'string') parts.push(q[f])
        else if (Array.isArray(q[f])) parts.push(q[f].join(' '))
      }
      // rubric objects with descriptor strings
      if (Array.isArray(q.rubric)) parts.push(q.rubric.map(r => `${r?.criterion || ''} ${r?.descriptor || ''}`).join(' '))
      const text = parts.filter(Boolean).join(' ')
      if (!text.trim()) return
      const targetChars = (text.match(targetRe) || []).length
      const latinChars  = (text.match(SCRIPT_RANGES.latinAny) || []).length
      // ≥95% target-script (ignoring punctuation / digits).
      const scriptScore = targetChars / Math.max(1, targetChars + latinChars)
      if (scriptScore < 0.95) {
        regenerateItems.push(i)
        failures.push({ item: i, check: 'D1', reason: `script purity ${(scriptScore * 100).toFixed(0)}% < 95% for ${targetScript}` })
      }
    })
    // Log clustered D1 rejections so a missing registry entry is visible.
    if (failures.some(f => f.check === 'D1')) {
      console.warn('[questionEngine][D1] script-purity rejections:', JSON.stringify({
        subject: req.subject, classLevel: req.classLevel, medium: req.medium,
        resolvedBy: req.resolvedBy, count: failures.filter(f => f.check === 'D1').length,
      }))
    }
  }

  // ---- D2 · MCQ has 4 non-empty non-duplicate options ----
  questions.forEach((q, i) => {
    if (q.format !== 'mcq') return
    const opts = Array.isArray(q.options) ? q.options : []
    const nonEmpty = opts.map(o => String(o || '').trim()).filter(Boolean)
    const uniq = new Set(nonEmpty.map(s => s.toLowerCase()))
    if (nonEmpty.length !== 4 || uniq.size !== 4) {
      regenerateItems.push(i)
      failures.push({ item: i, check: 'D2', reason: `MCQ options invalid: ${nonEmpty.length} non-empty / ${uniq.size} unique` })
    }
  })

  // ---- D3 · answer matches one option exactly (MCQ) ----
  questions.forEach((q, i) => {
    if (q.format !== 'mcq') return
    const opts = (q.options || []).map(o => String(o || '').trim().toLowerCase())
    const ans = String(q.answer || '').trim().toLowerCase()
    if (!ans) return
    // Allow "(କ)" / "A)" / "1." prefix on the answer
    const stripped = ans.replace(/^[(\[]?[କଖଗଘक-घa-d1-4][\.)\]]?\s*/i, '')
    if (!opts.includes(ans) && !opts.some(o => o.startsWith(stripped) || stripped.startsWith(o))) {
      regenerateItems.push(i)
      failures.push({ item: i, check: 'D3', reason: `MCQ answer does not match any option ("${q.answer}")` })
    }
  })

  // ---- D4 · Correct-answer position clustering (>50% same) — shuffle instead of regen ----
  const mcqs = questions.filter(q => q.format === 'mcq')
  if (mcqs.length >= 4) {
    const posCount = [0, 0, 0, 0]
    mcqs.forEach(q => {
      const idx = (q.options || []).findIndex(o => String(o || '').trim().toLowerCase() === String(q.answer || '').trim().toLowerCase())
      if (idx >= 0 && idx < 4) posCount[idx]++
    })
    const maxPos = Math.max(...posCount)
    if (maxPos / mcqs.length > 0.5) {
      failures.push({ item: -1, check: 'D4', reason: `answer position clustering: ${posCount.join(',')} — shuffling in place` })
      // Shuffle options in each MCQ that shares the clustered position.
      const clustered = posCount.indexOf(maxPos)
      questions.forEach(q => {
        if (q.format !== 'mcq' || !Array.isArray(q.options) || q.options.length !== 4) return
        const correctIdx = q.options.findIndex(o => String(o).trim().toLowerCase() === String(q.answer || '').trim().toLowerCase())
        if (correctIdx !== clustered) return
        // Swap correct into a random other slot.
        const target = ((correctIdx + 1 + Math.floor(Math.random() * 3)) % 4)
        ;[q.options[correctIdx], q.options[target]] = [q.options[target], q.options[correctIdx]]
      })
    }
  }

  // ---- D5 · Duplicate stems (>70% token overlap) — regenerate the LATER one ----
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      if (jaccard(questions[i].stem, questions[j].stem) > 0.7) {
        regenerateItems.push(j)
        failures.push({ item: j, check: 'D5', reason: `stem duplicate of item ${i + 1}` })
        break
      }
    }
  }

  // ---- D6 · Character budget per format ----
  questions.forEach((q, i) => {
    const stem = String(q.stem || '')
    let overflowed = false
    let budgetName = ''
    if (q.format === 'mcq' && stem.length > CHAR_BUDGETS.mcq_stem) { overflowed = true; budgetName = 'mcq_stem' }
    else if (q.format === 'fill' && stem.length > CHAR_BUDGETS.fill) { overflowed = true; budgetName = 'fill' }
    else if (q.format === 'truefalse' && stem.length > CHAR_BUDGETS.truefalse) { overflowed = true; budgetName = 'truefalse' }
    else if (q.format === 'very_short' && stem.length > CHAR_BUDGETS.very_short) { overflowed = true; budgetName = 'very_short' }
    else if (q.format === 'short' && stem.length > CHAR_BUDGETS.short) { overflowed = true; budgetName = 'short' }
    else if (q.format === 'long' && stem.length > CHAR_BUDGETS.long) { overflowed = true; budgetName = 'long' }
    else if (q.format === 'case_based' && q.passage && String(q.passage).length > CHAR_BUDGETS.case_passage) { overflowed = true; budgetName = 'case_passage' }
    if (q.format === 'mcq' && Array.isArray(q.options)) {
      if (q.options.some(o => String(o || '').length > CHAR_BUDGETS.mcq_option)) { overflowed = true; budgetName = 'mcq_option' }
    }
    if (overflowed) {
      regenerateItems.push(i)
      failures.push({ item: i, check: 'D6', reason: `${budgetName} budget exceeded (${stem.length} chars)` })
    }
  })

  // ---- D7 · Banned strings ("All of the above" etc.) ----
  questions.forEach((q, i) => {
    const blob = [q.stem, ...(q.options || [])].join(' ').toLowerCase()
    if (BANNED_STRINGS.some(b => blob.includes(b.toLowerCase()))) {
      regenerateItems.push(i)
      failures.push({ item: i, check: 'D7', reason: 'banned string present' })
    }
  })

  // ---- D8 · Every lo_code is in the allowed list; else blank it ----
  const allowed = new Set((req.learningOutcomes || []).map(String))
  if (allowed.size) {
    questions.forEach((q) => {
      if (q.lo_code && !allowed.has(String(q.lo_code))) {
        // Do not regenerate — just blank the fake code (D8: "Blank it rather than showing a fake code")
        q.lo_code = ''
      }
    })
  }

  // ---- D10 · Bloom distribution (±1 item) ----
  const targets = BLOOM_TARGETS[String(req.difficulty || 'medium').toLowerCase()] || BLOOM_TARGETS.medium
  const n = questions.length || 1
  const bloomCounts = {}
  for (const b of Object.keys(targets)) bloomCounts[b] = 0
  questions.forEach(q => { if (bloomCounts[q.bloom] != null) bloomCounts[q.bloom]++ })
  for (const b of Object.keys(targets)) {
    const want = Math.round(targets[b] * n)
    const got  = bloomCounts[b]
    if (Math.abs(got - want) > 2) { // ±1 too strict for small counts; use ±2 as tolerance
      failures.push({ item: -1, check: 'D10', reason: `bloom ${b} = ${got} (target ${want} ±2)` })
    }
  }

  // De-duplicate regenerateItems.
  const regenSet = new Set(regenerateItems)

  // ---- D11 · Item count enforcement is handled by the engine (top-up call) ----

  return {
    ok: regenSet.size === 0,
    questions,
    meta,
    failures,
    regenerateItems: [...regenSet].sort((a, b) => a - b),
  }
}
