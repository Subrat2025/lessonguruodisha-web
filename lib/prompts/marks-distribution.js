// ============================================================================
//  Marks Distribution Engine
//  ---------------------------------------------------------------------------
//  Given a target total (e.g. 25 marks) and a list of selected question types,
//  produce an SCERT/OSEPA-style section breakdown:
//     Section A: MCQ 5 × 1 = 5
//     Section B: Fill 5 × 1 = 5
//     Section C: VSA 5 × 2 = 10
//     Section D: LA 1 × 5 = 5
//     Total = 25
//
//  The algorithm:
//    1. Give every selected type its `minCount` floor of questions.
//    2. Divide remaining marks proportionally so each section gets a roughly
//       equal share of the total (weighted by 1 / defaultMarks).
//    3. Round to whole question counts, then adjust the smallest-mark type up
//       or down until the sum exactly equals the target total.
//    4. Prefer "nice" counts (multiples of 5, then 3-4) when possible.
// ============================================================================
import { WRITTEN_TYPES, ODIA_SECTION_LETTERS } from './question-types.js'

/**
 * @param {number} totalMarks
 * @param {string[]} selectedKeys   ordered subset of Object.keys(WRITTEN_TYPES)
 * @returns {Array<{ type, key, label, labelOdia, marksPerQ, count, marks, sectionLetter, sectionLetterOdia }>}
 */
export function distributeMarks(totalMarks, selectedKeys) {
  if (!Number.isFinite(totalMarks) || totalMarks < 5) totalMarks = 25
  const types = (selectedKeys || []).map(k => WRITTEN_TYPES[k]).filter(Boolean)
  if (types.length === 0) return []

  // Step 1: seed with minCount per section, capped so we don't already exceed total.
  const sections = types.map((t, i) => ({
    key: t.key,
    label: t.label,
    labelOdia: t.labelOdia,
    marksPerQ: t.defaultMarks,
    count: t.minCount,
    marks: t.minCount * t.defaultMarks,
    sectionLetter: String.fromCharCode(65 + i),
    sectionLetterOdia: ODIA_SECTION_LETTERS[i] || String.fromCharCode(65 + i),
  }))

  let allocated = sections.reduce((s, x) => s + x.marks, 0)
  let remaining = totalMarks - allocated

  if (remaining > 0) {
    // Step 2: proportional top-up.  Each section wants to end up with roughly
    // totalMarks / N marks.  Compute how many additional questions to add.
    const targetPerSection = totalMarks / sections.length
    for (const s of sections) {
      const wantMarks = targetPerSection - s.marks
      if (wantMarks <= 0) continue
      const add = Math.max(0, Math.round(wantMarks / s.marksPerQ))
      s.count += add
      s.marks += add * s.marksPerQ
    }
    allocated = sections.reduce((s, x) => s + x.marks, 0)
    remaining = totalMarks - allocated
  }

  // Step 3: fine-tune by nudging the smallest-marks-per-Q section up/down.
  // Sort ascending by marksPerQ so we adjust with the finest granularity first.
  let guard = 0
  while (remaining !== 0 && guard++ < 200) {
    const ordered = [...sections].sort((a, b) => a.marksPerQ - b.marksPerQ)
    if (remaining > 0) {
      // Add to smallest denomination section that still fits.
      const target = ordered.find(s => s.marksPerQ <= remaining) || ordered[0]
      target.count += 1
      target.marks += target.marksPerQ
      remaining -= target.marksPerQ
    } else {
      // Remove from smallest denomination section — but respect minCount floor.
      const w = WRITTEN_TYPES[ordered[0].key]
      const shrinkable = ordered.find(s => s.count > (WRITTEN_TYPES[s.key]?.minCount || 1))
      if (!shrinkable) break
      shrinkable.count -= 1
      shrinkable.marks -= shrinkable.marksPerQ
      remaining += shrinkable.marksPerQ
      void w // eslint no-unused
    }
  }
  // Final safety: guarantee at least 1 question per section
  for (const s of sections) if (s.count < 1) { s.count = 1; s.marks = s.marksPerQ }
  return sections
}

/**
 * Format a section header line like:
 *   "ବିଭାଗ - କ: ବହୁ ବିକଳ୍ପୀୟ ପ୍ରଶ୍ନ [୫ × ୧ = ୫ ନମ୍ବର]"
 */
export function formatSectionHeader(section, toOdiaNum) {
  const c = toOdiaNum(section.count)
  const m = toOdiaNum(section.marksPerQ)
  const total = toOdiaNum(section.marks)
  return `ବିଭାଗ - ${section.sectionLetterOdia}: ${section.labelOdia} [${c} × ${m} = ${total} ନମ୍ବର]`
}

/**
 * Split a total into approximate {easy, medium, hard} question counts given
 * a distribution preset.  Distribution values are 0-100 percentages that sum
 * to 100.  The engine returns three integer counts summing to totalQuestions.
 */
export function distributeDifficulty(totalQuestions, dist = { easy: 40, medium: 40, hard: 20 }) {
  const total = Math.max(0, Math.round(totalQuestions))
  if (total === 0) return { easy: 0, medium: 0, hard: 0 }
  const raw = {
    easy:   total * (dist.easy   / 100),
    medium: total * (dist.medium / 100),
    hard:   total * (dist.hard   / 100),
  }
  const easy   = Math.round(raw.easy)
  const medium = Math.round(raw.medium)
  let hard = total - easy - medium
  if (hard < 0) hard = 0
  return { easy, medium, hard }
}
