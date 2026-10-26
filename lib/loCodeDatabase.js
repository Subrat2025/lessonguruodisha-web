// ============================================================
//  loCodeDatabase.js — official Odisha SCERT code lookup
// ------------------------------------------------------------
//  Bundled from the user-supplied lo-database.json / lo-codes-flat.json
//  (see /app/lib/data/loCodeDb.json). Provides:
//    • lookupLoText(code)      → LO description for any LO code
//    • resolveCodes(loCodes[]) → { cg, comp, loText, loCodes }
//    • enrichPlanCodes(plan)   → fills each period/class with the
//                                official CG / Competency / LO codes+text
//                                when the plan didn't already carry them.
//
//  CG + Competency are derivable for FOUNDATIONAL / domain-coded LOs
//  (PD, SED, CD, LLD, ACD, PLH — pattern "<DOMAIN> g.c.o").  For plain
//  subject LOs (OD/M/EN/SCI/SST) the framework has no direct LO→CG link,
//  so we only fill the LO description and leave any existing CG/Competency
//  untouched.
// ============================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
// PRIMARY source: a static JSON import so webpack/Next INLINES the framework
// into the server bundle. This is bullet-proof for `output: 'standalone'`
// (no runtime fs / cwd dependency — the earlier fs.readFileSync approach
// silently loaded EMPTY in the deployed container, killing all CG/Competency).
import loCodeDbBundled from './data/loCodeDb.json'
import { geminiEnabled, suggestCgCompetency } from './gemini.js'

// Load the bundled code DB once (server-side only).
let loDb = { loText: {}, foundCompetencies: [], foundCGs: [], frameworkIndex: {}, stageOfClass: {} }
if (loCodeDbBundled && loCodeDbBundled.frameworkIndex && Object.keys(loCodeDbBundled.frameworkIndex).length) {
  loDb = loCodeDbBundled
} else {
  // Fallback for plain-node contexts where the JSON import resolved empty.
  let hereDir = ''
  try { hereDir = path.dirname(fileURLToPath(import.meta.url)) } catch { /* CJS/script */ }
  const candidates = [
    path.join(process.cwd(), 'lib', 'data', 'loCodeDb.json'),
    hereDir ? path.join(hereDir, 'data', 'loCodeDb.json') : null,
    hereDir ? path.join(hereDir, '..', 'lib', 'data', 'loCodeDb.json') : null,
    path.join(process.cwd(), '.next', 'server', 'lib', 'data', 'loCodeDb.json'),
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
      if (parsed && parsed.frameworkIndex) { loDb = parsed; break }
    } catch { /* try next */ }
  }
  if (!Object.keys(loDb.frameworkIndex || {}).length) {
    console.error('[loCodeDatabase] loCodeDb.json unavailable via import AND fs — CG/Competency will be empty')
  }
}


const norm = (c) => String(c ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

// ------------------------------------------------------------
//  SUBJECT framework helpers (CG↔Competency pool per stage+subject)
// ------------------------------------------------------------
const OD_DIGIT_MAP = { '୦': '0', '୧': '1', '୨': '2', '୩': '3', '୪': '4', '୫': '5', '୬': '6', '୭': '7', '୮': '8', '୯': '9' }
const odiaOrdinalToNum = { 'ପ୍ରଥମ': 1, 'ଦ୍ୱିତୀୟ': 2, 'ତୃତୀୟ': 3, 'ଚତୁର୍ଥ': 4, 'ପଞ୍ଚମ': 5, 'ଷଷ୍ଠ': 6, 'ସପ୍ତମ': 7, 'ଅଷ୍ଟମ': 8, 'ନବମ': 9, 'ଦଶମ': 10 }

// Determine the class number (1..10) or 'F' (foundational) from a label.
export function classNumFromLabel(label) {
  const s = String(label || '').trim()
  if (!s) return null
  if (/balvatika|balbatika|shishu|anganwadi|foundational|nursery|kg|ପ୍ରାକ|ଶିଶୁ|ବାଲ|ଅଙ୍ଗନ/i.test(s)) return 'F'
  // Odia digits
  let latin = s.replace(/[୦-୯]/g, (d) => OD_DIGIT_MAP[d] || d)
  const dm = latin.match(/(\d{1,2})/)
  if (dm) { const n = Number(dm[1]); if (n >= 1 && n <= 12) return n }
  for (const [k, v] of Object.entries(odiaOrdinalToNum)) { if (s.includes(k)) return v }
  return null
}

// Map a class label → framework stage.
export function stageForClass(label) {
  const n = classNumFromLabel(label)
  if (n === 'F') return 'foundational'
  if (n == null) return null
  const byMap = loDb.stageOfClass?.[String(n)]
  if (byMap) return byMap
  if (n <= 2) return 'foundational'
  if (n <= 5) return 'preparatory'
  if (n <= 8) return 'middle'
  return 'secondary'
}

// LO-code prefix → framework subject (the most reliable signal, since book
// names are textbook titles like "ଆମ ବିଚିତ୍ର ବିଶ୍ୱ" that don't name the subject).
const LO_PREFIX_SUBJECT = { OD: 'Odia', M: 'Mathematics', E: 'EVS', EN: 'English', SCI: 'Science', SST: 'Social Science', HI: 'Hindi', H: 'Hindi', SAN: 'Sanskrit', SA: 'Sanskrit' }

function subjectFromLoCodes(loCodes, available) {
  const list = (Array.isArray(loCodes) ? loCodes : [loCodes]).filter(Boolean)
  for (const raw of list) {
    const pref = norm(raw).split(/[\s0-9]/)[0]
    const cand = LO_PREFIX_SUBJECT[pref]
    if (cand) { const hit = available.find(a => a.toLowerCase() === cand.toLowerCase()); if (hit) return hit }
  }
  return null
}

// Canonical framework subject name for a stage, given any book/subject label
// (and optionally the lesson's LO codes for prefix-based inference).
export function canonicalSubject(subject, stage, loCodes) {
  const s = String(subject || '')
  const available = Object.keys(loDb.frameworkIndex?.[stage] || {})
  const pick = (name) => available.find(a => a.toLowerCase() === name.toLowerCase()) || null
  if (/evs|environ|ପରିବେଶ/i.test(s)) { const r = pick('EVS') || pick('Science'); if (r) return r }
  if (/math|ଗଣିତ/i.test(s)) { const r = pick('Mathematics'); if (r) return r }
  if (/social|ସାମାଜିକ|ସମାଜ/i.test(s)) { const r = pick('Social Science'); if (r) return r }
  if (/science|ବିଜ୍ଞାନ/i.test(s)) { const r = pick('Science'); if (r) return r }
  if (/english|ଇଂରାଜ/i.test(s)) { const r = pick('English'); if (r) return r }
  if (/hindi|ହିନ୍ଦୀ/i.test(s)) { const r = pick('Hindi'); if (r) return r }
  if (/sanskrit|ସଂସ୍କୃତ/i.test(s)) { const r = pick('Sanskrit'); if (r) return r }
  if (/odia|ଓଡ|ଓଡ଼ିଆ/i.test(s)) { const r = pick('Odia'); if (r) return r }
  // Fallback: infer from LO-code prefix.
  return subjectFromLoCodes(loCodes, available)
}

// The CG↔Competency pool for a subject lesson (empty for foundational).
export function frameworkPairsFor(classLabel, subject, loCodes) {
  const stage = stageForClass(classLabel)
  if (!stage || stage === 'foundational') return []
  const subj = canonicalSubject(subject, stage, loCodes)
  if (!subj) return []
  return (loDb.frameworkIndex?.[stage]?.[subj] || [])
}

// Deterministic text lookup for a subject CG/Competency code (once AI picked it).
export function lookupFrameworkText(classLabel, subject, cgCode, compCode, loCodes) {
  const pairs = frameworkPairsFor(classLabel, subject, loCodes)
  let cgText = '', compText = '', cgTextEn = '', compTextEn = ''
  if (compCode) { const m = pairs.find(p => p.c === compCode); if (m) { compText = m.cText || ''; compTextEn = m.cTextEn || ''; cgText = m.cgText || cgText; cgTextEn = m.cgTextEn || cgTextEn } }
  if (!cgText && cgCode) { const m = pairs.find(p => p.cg === cgCode); if (m) { cgText = m.cgText || ''; cgTextEn = m.cgTextEn || '' } }
  return { cgText, compText, cgTextEn, compTextEn }
}

export function lookupLoText(code) {
  return loDb.loText?.[norm(code)] || ''
}

// Resolve the best CG + Competency + first LO description for a set of LO codes.
export function resolveCodes(loCodes = []) {
  const codes = (Array.isArray(loCodes) ? loCodes : [loCodes]).map(String).map(norm).filter(Boolean)
  const FC = loDb.foundCompetencies || [], CG = loDb.foundCGs || []
  const cgOf = (cgcode, dom) => (dom && CG.find(x => x.cg === cgcode && x.domain === dom)) || CG.find(x => x.cg === cgcode) || null
  const cgTextOf = (cgcode, dom) => { const g = cgOf(cgcode, dom); return g ? (g.text || '') : '' }
  const cgTextEnOf = (cgcode, dom) => { const g = cgOf(cgcode, dom); return g ? (g.textEn || '') : '' }
  let loText = ''
  const directCGs = [], directComps = [], domainComps = []
  for (const n of codes) {
    if (!loText && loDb.loText?.[n]) loText = loDb.loText[n]
    let m
    if ((m = n.match(/^([A-Z]+)\s+(\d+)\.(\d+)\.(\d+)/))) {
      // "CD 7.1.1" (space-separated domain code)
      const fc = FC.find(x => x.code === `C-${m[2]}.${m[3]}` && x.domain === m[1]); if (fc) domainComps.push(fc)
    } else if ((m = n.match(/(?:^|[-\s])(PD|SED|CD|LLD|ACD|PLH)-(\d+)\.(\d+)(?:\.\d+)?/))) {
      // "BV3-LLD-9.1.1" / "LLD-9.1.1" / "C1-CD-1.1" (prefixed/hyphenated domain code)
      const fc = FC.find(x => x.code === `C-${m[2]}.${m[3]}` && x.domain === m[1]); if (fc) domainComps.push(fc)
    } else if ((m = n.match(/^C-?(\d+)\.(\d+)$/))) {
      // Direct competency code "C-10.1"
      const fc = FC.find(x => x.code === `C-${m[1]}.${m[2]}`); if (fc) directComps.push(fc)
    } else if ((m = n.match(/^CG-?(\d+)$/))) {
      // Direct curricular-goal code "CG-10"
      directCGs.push(`CG-${m[1]}`)
    }
  }
  let cg = null, comp = null
  if (directCGs.length) {
    const cgcode = directCGs[0]
    // Prefer a competency under the SAME goal so CG + Competency stay consistent.
    comp = directComps.find(fc => fc.cg === cgcode) || domainComps.find(fc => fc.cg === cgcode) || directComps[0] || domainComps[0] || null
    cg = { code: cgcode, text: cgTextOf(cgcode, comp?.domain), textEn: cgTextEnOf(cgcode, comp?.domain) }
  } else {
    comp = directComps[0] || domainComps[0] || null
    if (comp) cg = { code: comp.cg, text: cgTextOf(comp.cg, comp.domain), textEn: cgTextEnOf(comp.cg, comp.domain) }
  }
  return { cg, comp: (comp ? { code: comp.code, text: comp.text || '', textEn: comp.textEn || '' } : null), loText, loCodes: codes }
}

// ------------------------------------------------------------
//  AI-assisted: ensure a SUBJECT lesson has a CG + Competency code.
//  Order: cached on lesson → Gemini pick from official pool → null.
//  Persists the AI pick back onto the lesson doc for reuse.
//  Best-effort: never throws.
// ------------------------------------------------------------
export async function ensureSubjectCgCompetency({ d, lesson, className, subject, topic, chapterName }) {
  try {
    // 0. Self-fetch cached codes from the lesson doc when the caller didn't supply them.
    let src = lesson || {}
    if ((!src.cgCode || !src.competencyCode) && d && lesson?.id) {
      try {
        const fresh = await d.collection('lessons').findOne(
          { id: lesson.id },
          { projection: { cgCode: 1, competencyCode: 1, cgText: 1, competencyText: 1, cgTextEn: 1, competencyTextEn: 1 } }
        )
        if (fresh?.cgCode && fresh?.competencyCode) src = { ...lesson, ...fresh }
      } catch { /* ignore */ }
    }
    // 1. Already cached on the lesson?
    if (src.cgCode && src.competencyCode) {
      const t = lookupFrameworkText(className, subject, src.cgCode, src.competencyCode, lesson?.loCodes)
      return {
        cgCode: src.cgCode, competencyCode: src.competencyCode,
        cgText: src.cgText || t.cgText, competencyText: src.competencyText || t.compText,
        cgTextEn: src.cgTextEn || t.cgTextEn, competencyTextEn: src.competencyTextEn || t.compTextEn,
      }
    }
    // 2. Subject lesson with a real framework pool?
    const pairs = frameworkPairsFor(className, subject, lesson?.loCodes)
    if (!pairs.length || !geminiEnabled()) return null
    // 3. Ask Gemini to pick one pair (constrained to real codes).
    const loText = lesson?.loDescription || ''
    const pick = await suggestCgCompetency({
      className, subject, chapterName,
      lessonTitle: lesson?.title, lessonTopic: topic, loText,
      availablePairs: pairs,
    })
    const match = pairs.find(p => p.c === pick?.competencyCode)
      || pairs.find(p => p.cg === pick?.cgCode)
    if (!match) return null
    const result = { cgCode: match.cg, competencyCode: match.c, cgText: match.cgText || '', competencyText: match.cText || '', cgTextEn: match.cgTextEn || '', competencyTextEn: match.cTextEn || '' }
    // 4. Persist for reuse.
    if (d && lesson?.id) {
      try {
        await d.collection('lessons').updateOne({ id: lesson.id }, { $set: {
          cgCode: result.cgCode, cgText: result.cgText, cgTextEn: result.cgTextEn,
          competencyCode: result.competencyCode, competencyText: result.competencyText, competencyTextEn: result.competencyTextEn,
          cgCompSource: 'gemini', cgCompSetAt: new Date(),
        } })
      } catch (pe) { console.warn('[ensureSubjectCgCompetency] persist warn:', pe?.message) }
    }
    return result
  } catch (e) {
    console.error('[ensureSubjectCgCompetency]', e?.message)
    return null
  }
}

function enrichOne(p) {
  if (!p || typeof p !== 'object') return p
  const codes = (Array.isArray(p.loCodes) && p.loCodes.length) ? p.loCodes : (p.loCode ? [p.loCode] : [])
  const r = resolveCodes(codes)
  const out = { ...p }

  // Curricular Goal (foundational LO-derived)
  if (r.cg) {
    if (!out.cgCode && !(Array.isArray(out.cgCodes) && out.cgCodes.length)) out.cgCode = r.cg.code
    if (!out.curricularGoal && !out.curricularGoalOcf && r.cg.text) out.curricularGoal = r.cg.text
  }
  // Competency (foundational LO-derived)
  if (r.comp) {
    if (!out.competencyCode && !(Array.isArray(out.competencyCodes) && out.competencyCodes.length)) out.competencyCode = r.comp.code
    if (!out.competency && !out.competencyText && !out.competencyOcf && r.comp.text) out.competencyText = r.comp.text
  }
  // Learning Outcome description
  if (r.loText && !out.loDescription) out.loDescription = r.loText

  // SUBJECT codes already present (e.g. picked by Gemini at generate time) —
  // fill their official framework TEXT deterministically if missing.
  if ((out.cgCode || out.competencyCode) && (!out.curricularGoal && !out.curricularGoalOcf || !out.competencyText && !out.competency && !out.competencyOcf)) {
    const t = lookupFrameworkText(out.className, out.subject, out.cgCode, out.competencyCode, codes)
    if (!out.curricularGoal && !out.curricularGoalOcf && t.cgText) out.curricularGoal = t.cgText
    if (!out.competencyText && !out.competency && !out.competencyOcf && t.compText) out.competencyText = t.compText
  }

  return out
}

// Return a shallow-copied plan with periods[]/classes[] enriched with official codes.
export function enrichPlanCodes(plan) {
  if (!plan || typeof plan !== 'object') return plan
  const copy = { ...plan }
  if (Array.isArray(copy.periods)) copy.periods = copy.periods.map(enrichOne)
  if (Array.isArray(copy.classes)) copy.classes = copy.classes.map(enrichOne)
  return copy
}

// ------------------------------------------------------------
//  ASYNC: lesson-aware CG/Competency backfill for the Diary export.
//  For every period/class row that still has NO CG or NO Competency,
//  resolve them exactly like POST /api/lesson-curriculum does:
//    1. foundational LO codes → deterministic CG/Competency (resolveCodes)
//    2. subject lessons       → AI-picked pair, cached on the lesson doc
//                               (ensureSubjectCgCompetency)
//  Mutates the row objects in place (best-effort, never throws) so the
//  Daily 7-Period / Multigrade diaries show the SAME CG + Competency the
//  single Lesson-Plan PDF shows. Requires the Mongo db handle `d`.
// ------------------------------------------------------------
export async function enrichPlanCodesFromLessons(plan, d) {
  try {
    if (!plan || typeof plan !== 'object' || !d) return plan
    const rows = []
    if (Array.isArray(plan.periods)) rows.push(...plan.periods)
    if (Array.isArray(plan.classes)) rows.push(...plan.classes)
    await Promise.allSettled(rows.map(async (row) => {
      try {
        if (!row || typeof row !== 'object') return
        const hasCg = row.cgCode || (Array.isArray(row.cgCodes) && row.cgCodes.length)
        const hasComp = row.competencyCode || (Array.isArray(row.competencyCodes) && row.competencyCodes.length)
        if (hasCg && hasComp) return
        const codes = (Array.isArray(row.loCodes) && row.loCodes.length)
          ? row.loCodes.filter(Boolean)
          : (row.loCode ? [row.loCode] : [])
        if (!codes.length && !row.lessonId) return

        // 1. Foundational / domain-coded LOs → deterministic CG + Competency.
        const r = resolveCodes(codes)
        if (r.cg && !hasCg) {
          row.cgCode = r.cg.code
          if (r.cg.text && !row.curricularGoal && !row.curricularGoalOcf) row.curricularGoal = r.cg.text
        }
        if (r.comp && !hasComp) {
          row.competencyCode = r.comp.code
          if (r.comp.text && !row.competencyText && !row.competency && !row.competencyOcf) row.competencyText = r.comp.text
        }

        const nowCg = row.cgCode || (Array.isArray(row.cgCodes) && row.cgCodes.length)
        const nowComp = row.competencyCode || (Array.isArray(row.competencyCodes) && row.competencyCodes.length)
        if (nowCg && nowComp) return

        // 2. Subject lessons → AI-picked pair from the official framework pool
        //    (cached on the lesson doc for reuse).
        const cc = await ensureSubjectCgCompetency({
          d,
          lesson: { id: row.lessonId, loCodes: codes, title: row.title, loDescription: row.loDescription },
          className: row.className || row.class || '',
          subject: row.subject || row.bookName || '',
          topic: row.topic || row.chapterName || row.chapter || '',
          chapterName: row.chapterName || row.chapter || '',
        })
        if (cc) {
          if (!nowCg && cc.cgCode) {
            row.cgCode = cc.cgCode
            if (cc.cgText && !row.curricularGoal && !row.curricularGoalOcf) row.curricularGoal = cc.cgText
          }
          if (!nowComp && cc.competencyCode) {
            row.competencyCode = cc.competencyCode
            if (cc.competencyText && !row.competencyText && !row.competency && !row.competencyOcf) row.competencyText = cc.competencyText
          }
        }
      } catch { /* best-effort per row */ }
    }))
  } catch (e) {
    console.warn('[enrichPlanCodesFromLessons]', e?.message)
  }
  return plan
}
