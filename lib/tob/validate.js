// === TOB === Framework config (source of truth for marks/stage rules) + validator.
// Marks are NEVER auto-changed — mismatches are flagged RED with a fix suggestion
// that only an admin can apply. LO text/CG/Competency mismatches DO auto-correct to
// the LO Master (per spec §3) and are flagged YELLOW.
import { normCode } from '@/lib/tob/parse.js'
import { DOMAIN_LABEL } from '@/lib/tob/odia.js'
import { looseCode } from '@/lib/tob/lo-normalize.js'

// Stage rules. Foundational = no marks (observation + HPC levels only).
export const TOB_FRAMEWORK = {
  Foundational: { marks: false, levels: ['ପ୍ରାରମ୍ଭ', 'ପ୍ରଗତି', 'ନିପୁଣ'] },
  Preparatory: { marks: true, total: 25, written: 10, project: 15, diary: 0, weightage: '30/40/30' },
  Middle: { marks: true, total: 25, written: 10, project: 10, diary: 5, weightage: '30/40/30' },
}

// === Per-SUBJECT marks framework (config, not if/else). Keyed by canonical
// subject id. Subjects NOT listed here are "academic" and use TOB_FRAMEWORK by
// stage (25 = written 10 + project 15, + diary only for Middle classes 6–8).
//  - AE (Art Education): 25 = ଦୃଶ୍ୟକଳା 10 + ସଙ୍ଗୀତ 5 + ନୃତ୍ୟ 5 + ନାଟକ 5; no diary.
//  - PE (Physical Education): 25 = ମୌଳିକ ଗତିବିଧି 10 + ଖେଳ ଓ କ୍ରୀଡ଼ା 5 + ଯୋଗ 10;
//    separate ପ୍ରଦର୍ଶନ project box = 15 (NOT part of the 25); no diary.
//  - VE (Vocational): Teacher-Observation box = 25 (average of 5 practical tasks,
//    each 5+5+5+5+5); a SEPARATE ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ box = 20 (one project), read like
//    PE's ପ୍ରଦର୍ଶନ box and NOT added to the 25; no diary. Classes 6–8.
export const SUBJECT_FRAMEWORK = {
  AE: {
    kind: 'components', marks: true, total: 25, diary: 0, domainChapters: true,
    components: [
      { key: 'V', label: 'ଦୃଶ୍ୟକଳା', marks: 10 },
      { key: 'M', label: 'ସଙ୍ଗୀତ', marks: 5 },
      { key: 'D', label: 'ନୃତ୍ୟ', marks: 5 },
      { key: 'T', label: 'ନାଟକ', marks: 5 },
    ],
  },
  PE: {
    kind: 'components', marks: true, total: 25, diary: 0, performance: 15,
    components: [
      { key: 'FM', label: 'ମୌଳିକ ଗତିବିଧି', marks: 10 },
      { key: 'GS', label: 'ଖେଳ ଓ କ୍ରୀଡ଼ା', marks: 5 },
      { key: 'YG', label: 'ଯୋଗ', marks: 10 },
    ],
  },
  VE: { kind: 've', marks: true, total: 25, diary: 0, projectBox: 20 },
}
// Resolve the framework for an item. Academic subjects fall back to stage rules.
export function frameworkFor(stage, subject_id) {
  const sub = String(subject_id || '').toUpperCase()
  if (SUBJECT_FRAMEWORK[sub]) return { ...SUBJECT_FRAMEWORK[sub], stage }
  return { kind: 'academic', ...(TOB_FRAMEWORK[stage] || {}), stage }
}
// Read-only description for the admin framework table.
export function frameworkTable() {
  return [
    { subjects: 'OD, MATH, E, EV, H, S, SC, SS', rule: '25 = ଲିଖିତ 10 + ପ୍ରକଳ୍ପ 15 (+ ଡାଏରୀ 5 only Classes 6–8)' },
    { subjects: 'AE (Art Education)', rule: '25 = ଦୃଶ୍ୟକଳା 10 + ସଙ୍ଗୀତ 5 + ନୃତ୍ୟ 5 + ନାଟକ 5 (no diary)' },
    { subjects: 'PE (Physical Education)', rule: '25 = ମୌଳିକ ଗତିବିଧି 10 + ଖେଳ ଓ କ୍ରୀଡ଼ା 5 + ଯୋଗ 10 · ପ୍ରଦର୍ଶନ 15 (separate)' },
    { subjects: 'VE (Vocational)', rule: '25 = ୫ଟି ବ୍ୟବହାରିକ କାର୍ଯ୍ୟର ହାରାହାରି · ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ 20 (separate, no diary)' },
  ]
}

export function stageForClass(cls) {
  const s = String(cls || '').toUpperCase()
  if (s.startsWith('SV')) return 'Foundational'
  const n = parseInt(s, 10)
  if (n >= 1 && n <= 2) return 'Foundational'
  if (n >= 3 && n <= 5) return 'Preparatory'
  if (n >= 6 && n <= 8) return 'Middle'
  return 'Preparatory'
}

const OLD_LO = /^[A-Z]{1,4}\s?\d{3}$/   // e.g. "OD 401", "OD401" (pre-2026 list)

// Validate one parsed item (chapter or set) against LO Master + framework.
// `codeMap` = Map(normalisedLoCode -> masterRow) for the chosen class+subject.
export function validateItem(item, { codeMap, class: cls, subject_id, masterTotal }) {
  const checks = []
  const add = (level, code, message, fix) => checks.push({ level, code, message, ...(fix ? { fix } : {}) })
  const stage = stageForClass(cls)
  const sfw = frameworkFor(stage, subject_id)   // per-subject framework
  const fw = TOB_FRAMEWORK[stage]

  // ---- class match ---- (headerMeta reads the TITLE/BADGE only, never body text)
  // A disagreement is a non-blocking YELLOW conflict, NOT a RED. The manifest /
  // import-form class is authoritative; incidental body mentions never flag.
  if (item.class && String(item.class) !== String(cls)) add('yellow', 'CLASS', `File title says Class ${item.class}, but manifest/import says Class ${cls}.`)
  // ---- stage match ----
  if (item.stage && item.stage !== stage) add('yellow', 'STAGE', `File stage "${item.stage}" differs from framework stage "${stage}" for Class ${cls}.`)

  // ---- marks (chapters/sets only) — per SUBJECT framework ----
  if (item.type !== 'register') {
    const m = item.marks || {}
    // Any label the Odia reader could not recognise → YELLOW (never mapped to
    // project/diary by position).
    for (const u of (m.unknownLabels || [])) add('yellow', 'MARK_LABEL', `Unknown marks label "${u}" — ignored (not mapped to project/diary).`)

    if (sfw.kind === 'components') {
      // Component-based subjects (AE, PE): total = Σ named components, each read
      // by its Odia label. Never positional, so a 5-mark component is never
      // misread as project/diary.
      const comps = sfw.components           // [{ key, label, marks }]
      const c = m.components || {}
      const labelOf = (k) => (comps.find(x => x.key === k) || {}).label || DOMAIN_LABEL[k] || k
      const have = comps.some(cc => c[cc.key] != null)
      if (!have) {
        add('yellow', 'MARKS_COMP', `${subject_id} marks box not in the expected ${comps.map(cc => cc.label).join('/')} form — not verified.`)
      } else {
        const mism = []
        for (const cc of comps) { if (c[cc.key] != null && c[cc.key] !== cc.marks) mism.push(`${cc.label} = ${c[cc.key]}, framework says ${cc.marks}`) }
        const sum = comps.reduce((a, cc) => a + (c[cc.key] ?? 0), 0)
        if (m.total != null && m.total !== sfw.total) mism.push(`ମୋଟ = ${m.total}, framework says ${sfw.total}`)
        else if (sum !== sfw.total) mism.push(`ଯୋଗଫଳ ${sum} ≠ ${sfw.total}`)
        // AE only: a chapter's single-domain note (N) must match its domain framework.
        if (sfw.domainChapters && item.type === 'chapter' && m.chapterDomain && m.chapterDomainN != null) {
          const expN = (comps.find(cc => cc.key === m.chapterDomain) || {}).marks
          if (expN != null && m.chapterDomainN !== expN) mism.push(`${labelOf(m.chapterDomain)} N = ${m.chapterDomainN}, framework says ${expN}`)
        }
        if (mism.length) add('red', 'MARKS', `${subject_id} marks mismatch — ${mism.join('; ')} (framework ${sfw.total} = ${comps.map(cc => cc.label + ' ' + cc.marks).join(' + ')}).`, { components: Object.fromEntries(comps.map(cc => [cc.key, cc.marks])), total: sfw.total })
      }
    } else if (sfw.kind === 've') {
      // VE (Vocational): Teacher-Observation box total = 25 (the average of 5
      // practical tasks, each 5+5+5+5+5). A SEPARATE ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ box = 20 (one
      // project), read like PE's ପ୍ରଦର୍ଶନ box and NOT added to the 25. No diary.
      const mism = []
      if (m.total != null && m.total !== sfw.total) mism.push(`ମୋଟ = ${m.total}, framework says ${sfw.total}`)
      if (m.projectBox != null && m.projectBox !== sfw.projectBox) mism.push(`ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ = ${m.projectBox}, framework says ${sfw.projectBox}`)
      if (mism.length) add('red', 'MARKS', `VE marks mismatch — ${mism.join('; ')} (framework: ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ ${sfw.total} = ୫ଟି ବ୍ୟବହାରିକ କାର୍ଯ୍ୟର ହାରାହାରି · ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ ${sfw.projectBox} separate, no diary).`, { total: sfw.total, projectBox: sfw.projectBox })
      else if (m.projectBox == null) add('yellow', 'MARKS_COMP', `VE project box (ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ ${sfw.projectBox}) not found in the expected form — total ${m.total ?? '?'} accepted.`)
      // VE has NO Learner's Diary (same as AE and PE) — never require it.
    } else if (sfw.kind === 'unset') {
      // Framework not set yet for this subject. Only total=25 is meaningful; never RED.
      if (m.total != null && m.total !== 25) add('yellow', 'MARKS_NOFW', `Marks framework for ${subject_id} not set yet — only total checked (file total ${m.total}, expected 25). Publishable.`)
      else add('yellow', 'MARKS_NOFW', `Marks framework for ${subject_id} not set yet — accepted (total 25). Publishable.`)
      // diary still applies to Middle (classes 6–8)
      if (stage === 'Middle' && !(m.diary > 0)) add('red', 'DIARY', `Middle stage needs a Learner's Diary component but none found.`)
    } else if (!fw.marks) {
      if (m.total || m.written || m.project) add('red', 'MARKS', `Foundational (Class ${cls}) must have NO marks, but the file shows total ${m.total}.`, { noMarks: true })
    } else {
      const mism = []
      if (m.total !== fw.total) mism.push(`total ${m.total} vs ${fw.total}`)
      if (m.written !== fw.written) mism.push(`written ${m.written} vs ${fw.written}`)
      if (m.project !== fw.project) mism.push(`project ${m.project} vs ${fw.project}`)
      const expectDiary = fw.diary || 0
      if ((m.diary || 0) !== expectDiary) mism.push(`diary ${m.diary || 0} vs ${expectDiary}`)
      if (mism.length) add('red', 'MARKS', `File marks mismatch — ${mism.join('; ')} (framework for Class ${cls} = ${fw.total}=${fw.written}+${fw.project}${fw.diary ? '+' + fw.diary + ' diary' : ''}).`, { total: fw.total, written: fw.written, project: fw.project, diary: fw.diary, weightage: fw.weightage })
      // Rubric SUB-totals are a secondary cross-check only — the headline marks
      // box above is authoritative. A difference here is a YELLOW note, not a
      // blocking RED (rubrics are often split across sub-skills).
      if (m.writtenRubric != null && m.writtenRubric !== fw.written) add('yellow', 'RUBRIC', `Written-rubric sub-total ${m.writtenRubric} differs from framework written ${fw.written} (headline marks box is authoritative).`)
      if (m.projectRubric != null && m.projectRubric !== fw.project) add('yellow', 'RUBRIC', `Project-rubric sub-total ${m.projectRubric} differs from framework project ${fw.project} (headline marks box is authoritative).`)
      // weightage (non-blocking)
      if (m.weightage && fw.weightage && m.weightage.replace(/%/g, '') !== fw.weightage) add('yellow', 'WEIGHTAGE', `Weightage ${m.weightage} vs framework ${fw.weightage}.`)
      // diary presence vs stage
      if (stage === 'Middle' && !(m.diary > 0)) add('red', 'DIARY', `Middle stage needs a Learner's Diary component (${fw.diary} marks) but none found.`)
      // Only flag a NON-Middle file if it actually CARRIES diary marks — a mere
      // mention of the Learner's Diary in notes is fine and must not go RED.
      if (stage !== 'Middle' && (m.diary || 0) > 0) add('red', 'DIARY', `Learner's Diary marks (${m.diary}) found in a ${stage} file; diary applies only to the Middle stage.`)
    }
  }

  // ---- LO validation (per chip) with auto-correct to LO Master ----
  // If the LO Master has NO rows for this class+subject, we DO NOT flag each chip
  // RED. Instead we add ONE YELLOW note, keep the chips exactly as authored, and
  // still allow the item to publish (the LO badge is hidden on the store).
  const hasMaster = (masterTotal || 0) > 0
  if (!hasMaster) add('yellow', 'NO_LO_MASTER', `No LO Master for Class ${cls} ${subject_id} — LO chips kept as-is (not verified). Item can still be published.`)
  // LO codes are matched with the shared `looseCode` normaliser (see
  // lib/tob/lo-normalize.js) so the same rule is used everywhere.
  const looseMap = new Map()
  try { for (const [k, v] of codeMap) looseMap.set(looseCode(k), v) } catch (_) {}
  const correctedCards = []
  const coveredCodes = new Set()
  for (const card of (item.cards || [])) {
    const correctedLos = []
    for (const lo of (card.los || [])) {
      const code = normCode(lo.lo_code)
      const out = { ...lo }
      // No LO Master at all → keep as authored, never RED.
      if (!hasMaster) { out._noMaster = true; correctedLos.push(out); continue }
      if (OLD_LO.test(code)) { add('yellow', 'OLD_LO', `"${lo.lo_code}" is from the old LO list (not used in 2026-27).`); out._old = true; correctedLos.push(out); continue }
      const master = codeMap.get(code) || looseMap.get(looseCode(lo.lo_code))
      if (!master) { add('red', 'LO_MISSING', `LO code "${lo.lo_code}" is not in the LO Master for Class ${cls} ${subject_id}.`); out._missing = true; correctedLos.push(out); continue }
      coveredCodes.add(code)
      // auto-correct text / cg / competency to master (YELLOW)
      if (norm(lo.lo_text) && norm(lo.lo_text) !== norm(master.lo_text)) { add('yellow', 'LO_TEXT', `LO text for ${lo.lo_code} differs from LO Master — auto-corrected.`); out.lo_text = master.lo_text; out._corrected = true }
      else out.lo_text = master.lo_text || lo.lo_text
      if (lo.cg && norm(lo.cg) !== norm(master.cg)) { add('yellow', 'LO_CG', `CG for ${lo.lo_code} (${lo.cg}) differs from LO Master (${master.cg}) — auto-corrected.`); out.cg = master.cg; out._corrected = true }
      else out.cg = master.cg || lo.cg
      if (lo.competency && norm(lo.competency) !== norm(master.competency)) { add('yellow', 'LO_COMP', `Competency for ${lo.lo_code} (${lo.competency}) differs from LO Master (${master.competency}) — auto-corrected.`); out.competency = master.competency; out._corrected = true }
      else out.competency = master.competency || lo.competency
      out.cg_text = master.cg_text; out.competency_text = master.competency_text
      correctedLos.push(out)
    }
    correctedCards.push({ ...card, los: correctedLos })
  }

  // ---- coverage (recomputed from chips, never from the file) ----
  const coverage = { covered: coveredCodes.size, total: masterTotal, codes: [...coveredCodes].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }

  const status = checks.some(c => c.level === 'red') ? 'red' : checks.some(c => c.level === 'yellow') ? 'yellow' : 'green'
  const redCount = checks.filter(c => c.level === 'red').length
  const yellowCount = checks.filter(c => c.level === 'yellow').length
  return { status, redCount, yellowCount, checks, correctedCards, coverage, stage }
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()
