// === TOB === Unit tests for the per-subject marks framework + Odia label reader
// + class detection. Pure (no DB). Run:
//   node --experimental-loader ./scripts/_alias_loader.mjs scripts/tob_framework_tests.mjs
// (the alias loader maps "@/..." → repo root). Exits non-zero on first failure.
import { labelKey, odiaDigitsToAscii, classFromHeader, detectDomain } from '../lib/tob/odia.js'
import { parseChapterPack, parseSet } from '../lib/tob/parse.js'
import { validateItem } from '../lib/tob/validate.js'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
  ok ? pass++ : fail++
}
const hasRed = (checks, code) => checks.some(c => c.level === 'red' && (!code || c.code === code))

// ---- 1) Odia label reader: both nukta encodings + ZWJ + English aliases ----
eq('label ନୃତ୍ୟ (precomposed ୟ U+0B5F) → D', labelKey('ନୃତ୍ୟ'), 'D')
eq('label ନୃତ୍\u200Dୟ (ZWJ inside) → D', labelKey('ନୃତ୍\u200Dୟ'), 'D')
eq('label ସଙ୍ଗୀତ → M', labelKey('ସଙ୍ଗୀତ'), 'M')
eq('label ନାଟକ → T', labelKey('ନାଟକ'), 'T')
eq('label ଦୃଶ୍ୟକଳା → V', labelKey('ଦୃଶ୍ୟକଳା'), 'V')
eq('label "music" → M', labelKey('music'), 'M')
eq('label "Visual Art" → V', labelKey('Visual Art'), 'V')
eq('label ଲିଖିତ → written', labelKey('ଲିଖିତ'), 'written')
eq('label ପ୍ରକଳ୍ପ → project', labelKey('ପ୍ରକଳ୍ପ'), 'project')
eq('label ପ୍ରଦର୍ଶନ → performance', labelKey('ପ୍ରଦର୍ଶନ'), 'performance')
eq('label "ଯେକୌଣସି ୧ଟି" (unknown) → null', labelKey('ଯେକୌଣସି ୧ଟି'), null)

// ---- 2) Odia vs ASCII digits ----
eq('digits ୧୦ → 10', odiaDigitsToAscii('(୧୦)'), '(10)')
eq('digits ୫ → 5', odiaDigitsToAscii('୫ଟି'), '5ଟି')

// ---- 3) Class detection from header only (ignore body) ----
eq('classFromHeader "… | Class 5 Art"', classFromHeader('x | Class 5 Art'), '5')
eq('classFromHeader "ପଞ୍ଚମ ଶ୍ରେଣୀ"', classFromHeader('ପଞ୍ଚମ ଶ୍ରେଣୀ କଳା'), '5')
eq('classFromHeader "Class V"', classFromHeader('Observation (Class V)'), '5')
eq('classFromHeader body ref "ଚତୁର୍ଥ ଶ୍ରେଣୀ ପୁସ୍ତକ" is passed → 4 (so we must NOT pass body)', classFromHeader('ପାଇଁ ଚତୁର୍ଥ ଶ୍ରେଣୀ ପୁସ୍ତକ'), '4')

// ---- 4) detectDomain from the chapter note ----
eq('detectDomain visual (10)', detectDomain('ଏହି ଅଧ୍ୟାୟ: ଦୃଶ୍ୟକଳା — ୫ଟି ବ୍ୟବହାରିକ କାର୍ଯ୍ୟର ହାରାହାରି (୧୦)'), { key: 'V', n: 10 })
eq('detectDomain drama (5)', detectDomain('ଏହି ଅଧ୍ୟାୟ: ନାଟକ — … (୫)'), { key: 'T', n: 5 })

// ---- helpers to build HTML ----
const card = (part, lo) => `<article class="card ${part}"><div class="card-h"><span class="num">1</span><h3>କାର୍ଯ୍ୟ</h3><span class="kind">Task</span></div><div class="lostrip"><div><span class="code cgc">CG-1</span><span class="code ccc">C-1.1</span><span class="code loc">${lo}</span><span class="lt"></span></div></div></article>`
const aeMarks = (v, m, d, t, note, perf) => `<section class="marks"><div class="mbox"><h2 class="mh">ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ</h2><div class="eq"><span class="n">25<small>ମୋଟ</small></span><span class="n">${v}<small>ଦୃଶ୍ୟକଳା</small></span><span class="n">${m}<small>ସଙ୍ଗୀତ</small></span><span class="n">${d}<small>ନୃତ୍ୟ</small></span><span class="n">${t}<small>ନାଟକ</small></span></div><p class="note">${note}</p></div><div class="mbox"><h2 class="mh">ପ୍ରଦର୍ଶନ — ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ</h2><div class="eq"><span class="n">${perf}<small>ଯେକୌଣସି ୧ଟି ପ୍ରକଳ୍ପ</small></span></div></div></section>`
const acadMarks = (w, p, extra = '') => `<section class="marks"><div class="eq"><span class="n">25<small>ମୋଟ</small></span><span class="n">${w}<small>ଲିଖିତ</small></span><span class="n">${p}<small>ପ୍ରକଳ୍ପ</small></span>${extra}</div></section>`
const page = (marks, cards, title = 'ABC') => `<!doctype html><html><head><title>${title}</title></head><body><p> </p>${marks}${cards}</body></html>`
const V = (parsed, subject_id, cls) => validateItem(parsed, { codeMap: new Map(), class: cls, subject_id, masterTotal: 0 })

// ---- 5) AE chapter (drama, N=5): parts read by label, no project/diary misread ----
{
  const html = page(aeMarks(10, 5, 5, 5, 'ଏହି ଅଧ୍ୟାୟ: ନାଟକ — … (୫)', 5), card('A', 'AE(T) 1.1.1'), 'ନାଟକ | Class 5')
  const p = parseChapterPack(html, { filename: 'Ch06.html' })
  eq('AE chapter: components V/M/D/T', p.marks.components, { V: 10, M: 5, D: 5, T: 5 })
  eq('AE chapter: project NOT read (null)', p.marks.project, null)
  eq('AE chapter: diary NOT read (0)', p.marks.diary, 0)
  eq('AE chapter: isArt', p.marks.isArt, true)
  const v = V(p, 'AE', '5')
  eq('AE chapter valid: no MARKS red', hasRed(v.checks, 'MARKS'), false)
}

// ---- 6) AE set (10/5/5/5, project "10 / 5") → no red ----
{
  const html = page(aeMarks(10, 5, 5, 5, 'ଏହି ସେଟ୍ (ପ୍ରତି ଟର୍ମ): …', '10 / 5'), card('A', 'AE(V) 1.1.1') + card('B', 'AE(M) 1.1.1'), 'Set A | Class 5')
  const p = parseSet(html, { filename: 'Set_A.html' })
  const v = V(p, 'AE', '5')
  eq('AE set valid: no MARKS red', hasRed(v.checks, 'MARKS'), false)
}

// ---- 6b) AE chapter WRONG (drama=10) → MARKS red ----
{
  const html = page(aeMarks(10, 5, 5, 10, 'ଏହି ଅଧ୍ୟାୟ: ନାଟକ — … (୧୦)', 10), card('A', 'AE(T) 1.1.1'), 'ନାଟକ | Class 5')
  const p = parseChapterPack(html, { filename: 'Ch06.html' })
  const v = V(p, 'AE', '5')
  eq('AE wrong (ନାଟକ 10): MARKS red', hasRed(v.checks, 'MARKS'), true)
}

// ---- 7) MATH chapter 10 + 15 (academic) → no MARKS red ----
{
  const html = page(acadMarks(10, 15), card('A', 'M 1.1.1'), 'ଗଣିତ | Class 5')
  const p = parseChapterPack(html, { filename: 'Ch01.html' })
  eq('MATH chapter: written 10', p.marks.written, 10)
  eq('MATH chapter: project 15', p.marks.project, 15)
  const v = V(p, 'MATH', '5')
  eq('MATH chapter valid: no MARKS red', hasRed(v.checks, 'MARKS'), false)
}

// ---- 8) Class 6 Odia (Middle) with diary 5 → no DIARY red ----
{
  const html = page(acadMarks(10, 10, '<span class="n">5<small>ଶିକ୍ଷାର୍ଥୀ ଡାଏରୀ</small></span>'), card('A', 'OD 1.1.1'), 'ଓଡ଼ିଆ | Class 6')
  const p = parseChapterPack(html, { filename: 'Ch01.html' })
  eq('Class6 OD: diary 5 read by label', p.marks.diary, 5)
  const v = V(p, 'OD', '6')
  eq('Class6 OD Middle: no DIARY red', hasRed(v.checks, 'DIARY'), false)
  eq('Class6 OD Middle: no MARKS red', hasRed(v.checks, 'MARKS'), false)
}

// ---- 9) PE framework: 25 = ମୌଳିକ ଗତିବିଧି 10 + ଖେଳ ଓ କ୍ରୀଡ଼ା 5 + ଯୋଗ 10 ----
eq('label ମୌଳିକ ଗତିବିଧି → FM', labelKey('ମୌଳିକ ଗତିବିଧି'), 'FM')
eq('label ଖେଳ ଓ କ୍ରୀଡ଼ା (nukta) → GS', labelKey('ଖେଳ ଓ କ୍ରୀଡ଼ା'), 'GS')
eq('label ଖେଳ ଓ କ୍ରୀଡ\u0B3Cା (decomposed nukta) → GS', labelKey('ଖେଳ ଓ କ୍ରୀଡ\u0B3Cା'), 'GS')
eq('label ଯୋଗ → YG', labelKey('ଯୋଗ'), 'YG')
const peMarks = () => `<section class="marks"><div class="mbox"><h2 class="mh">ଶିକ୍ଷକ ପର୍ଯ୍ୟବେକ୍ଷଣ</h2><div class="eq"><span class="n">25<small>ମୋଟ</small></span><span class="n">10<small>ମୌଳିକ ଗତିବିଧି</small></span><span class="n">5<small>ଖେଳ ଓ କ୍ରୀଡ଼ା</small></span><span class="n">10<small>ଯୋଗ</small></span></div></div><div class="mbox"><h2 class="mh">ପ୍ରଦର୍ଶନ — ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ</h2><div class="eq"><span class="n">15<small>ଯେକୌଣସି ୧ଟି ପ୍ରକଳ୍ପ</small></span></div></div></section>`
{
  const html = page(peMarks(), card('A', 'PE 1.1.1'), 'ଶାରୀରିକ | Class 5')
  const p = parseChapterPack(html, { filename: 'Ch01.html' })
  eq('PE: components FM/GS/YG', p.marks.components, { FM: 10, GS: 5, YG: 10 })
  eq('PE: performance box = 15 (not in sum)', p.marks.performance, 15)
  eq('PE: project NOT read (null)', p.marks.project, null)
  const v = V(p, 'PE', '5')
  eq('PE valid: no MARKS red', hasRed(v.checks, 'MARKS'), false)
}
// ---- 9b) PE wrong (ଯୋଗ=5) → MARKS red ----
{
  const html = page(peMarks().replace('10<small>ଯୋଗ', '5<small>ଯୋଗ'), card('A', 'PE 1.1.1'), 'Class 5')
  const p = parseChapterPack(html, { filename: 'Ch01.html' })
  const v = V(p, 'PE', '5')
  eq('PE wrong (ଯୋଗ 5): MARKS red', hasRed(v.checks, 'MARKS'), true)
}
// ---- 9c) VE now HAS a framework: a box with total 25 but NO separate project
//        box → no RED (publishable), emits a MARKS_COMP yellow (box not in form).
{
  const html = page(acadMarks(10, 15), card('A', 'VE 1.1.1'), 'Class 6')
  const p = parseChapterPack(html, { filename: 'Ch01.html' })
  const v = V(p, 'VE', '6')
  eq('VE synthetic: no MARKS red (total 25)', hasRed(v.checks, 'MARKS'), false)
  eq('VE synthetic: no DIARY red', hasRed(v.checks, 'DIARY'), false)
  eq('VE synthetic: MARKS_COMP yellow when no project box', v.checks.some(c => c.code === 'MARKS_COMP'), true)
}

// ---- 10) REAL fixture — Class 6 English Ch16 + Set C: diary read ONLY from the
//         marks box / card heading, never falsely zeroed by body text. Ch16 has
//         "My diary: National War Memorial" which used to trip the "n/a" negation
//         (matched "Na" in "National") and wrongly produced "diary 0 vs 5". ----
const readFx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8')
{
  const p = parseChapterPack(readFx('Ch16.html'), { filename: 'Ch16.html', folder: 'Term2_Chapters' })
  eq('C6 EN Ch16: diary = 5 (from marks box, not zeroed by "National")', p.marks.diary, 5)
  eq('C6 EN Ch16: written 10', p.marks.written, 10)
  eq('C6 EN Ch16: project 10', p.marks.project, 10)
  const v = V(p, 'ENGLISH', '6')
  eq('C6 EN Ch16: no MARKS red', hasRed(v.checks, 'MARKS'), false)
  eq('C6 EN Ch16: no DIARY red', hasRed(v.checks, 'DIARY'), false)
}
{
  const p = parseSet(readFx('Set_C.html'), { filename: 'Set_C.html' })
  eq('C6 EN Set C: diary = 5 (from marks box, not zeroed)', p.marks.diary, 5)
  const v = V(p, 'ENGLISH', '6')
  eq('C6 EN Set C: no MARKS red', hasRed(v.checks, 'MARKS'), false)
  eq('C6 EN Set C: no DIARY red', hasRed(v.checks, 'DIARY'), false)
}
// ---- 10b) Negation ONLY from the marks-box label (synthetic) ----
{
  // Body contains "diary ... National" (the old trap) AND a genuine 5-mark box →
  // must still read 5 (body words never negate).
  const html = page(acadMarks(10, 10, '<span class="n">5<small>Learner\'s Diary</small></span>'),
    '<h2>Part C: Learner\'s Diary</h2><h3>My diary: National War Memorial</h3>', 'English | Class 6')
  const p = parseChapterPack(html, { filename: 'Ch16.html' })
  eq('Synthetic: "National" near diary does NOT zero a real 5-mark box', p.marks.diary, 5)
}

// ---- 11) VE (Vocational) framework — Class 6 real fixtures (U01 + Set_A) ----
//  Teacher-Observation box = 25 (average of 5 practical tasks). SEPARATE
//  ପ୍ରକଳ୍ପ କାର୍ଯ୍ୟ box = 20 (read like PE's ପ୍ରଦର୍ଶନ, not added to 25). NO diary.
{
  const p = parseChapterPack(readFx('VOC_U01.html'), { filename: 'U01.html', folder: 'Term1_Chapters' })
  eq('C6 VOC U01: TO total = 25', p.marks.total, 25)
  eq('C6 VOC U01: separate project box = 20', p.marks.projectBox, 20)
  eq('C6 VOC U01: no diary', p.marks.diary, 0)
  const v = V(p, 'VE', '6')
  eq('C6 VOC U01: no MARKS red', hasRed(v.checks, 'MARKS'), false)
  eq('C6 VOC U01: no DIARY red (VE needs no diary)', hasRed(v.checks, 'DIARY'), false)
}
{
  const p = parseSet(readFx('VOC_Set_A.html'), { filename: 'Set_A.html' })
  eq('C6 VOC Set A: TO total = 25', p.marks.total, 25)
  eq('C6 VOC Set A: separate project box = 20', p.marks.projectBox, 20)
  const v = V(p, 'VE', '6')
  eq('C6 VOC Set A: no MARKS red', hasRed(v.checks, 'MARKS'), false)
  eq('C6 VOC Set A: no DIARY red', hasRed(v.checks, 'DIARY'), false)
}
// Guard: a wrong VE project box (20 → 15) MUST go RED, and VE applies to 6/7/8.
{
  const bad = readFx('VOC_U01.html').replace('bg-leaf">20<', 'bg-leaf">15<')
  const p = parseChapterPack(bad, { filename: 'U01.html' })
  eq('C6 VOC: tampered project box parses as 15', p.marks.projectBox, 15)
  eq('C6 VOC: wrong project box → MARKS red', hasRed(V(p, 'VE', '6').checks, 'MARKS'), true)
  eq('C7 VOC: VE framework applies (no diary red)', hasRed(V(parseChapterPack(readFx('VOC_U01.html'), { filename: 'U01.html' }), 'VE', '7').checks, 'DIARY'), false)
  eq('C8 VOC: VE framework applies (no diary red)', hasRed(V(parseChapterPack(readFx('VOC_U01.html'), { filename: 'U01.html' }), 'VE', '8').checks, 'DIARY'), false)
}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAIL'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
