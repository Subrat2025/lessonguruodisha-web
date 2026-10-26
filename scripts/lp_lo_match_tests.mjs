// ============================================================
//  Unit tests — Lesson-plan LO-code class-prefix stripping
//  Run: node --experimental-loader ./scripts/_alias_loader.mjs scripts/lp_lo_match_tests.mjs
// ------------------------------------------------------------
//  Verifies the narrow "C<class>-<letter>" prefix rule:
//   • strips ONLY "C<class>-" when the class matches AND a letter follows
//   • NEVER touches Hindi "C.9.7.1", competency "C-9.7"/"C-9.7.1", or "CG-9"
//   • a stripped Class-1 lesson code still matches the LO-Master key
//   • Class-6 Hindi "C.9.7.1" still matches the LO-Master key
// ============================================================
import { classifyCodes } from '@/lib/lp/version.js'
import { looseCode } from '@/lib/tob/lo-normalize.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg) } else { fail++; console.log('  ✗ FAIL: ' + msg) } }

// Build a fake LO index (same shape buildLoIndex returns) so we can test the
// class-aware matcher without a DB. classOrder drives prefix stripping.
const idxFor = (classOrder, masterCodes = [], oldCodes = []) => ({
  classOrder,
  masterSet: new Set(masterCodes.map(c => looseCode(c)).filter(Boolean)),
  oldSet: new Set(oldCodes.map(c => looseCode(c)).filter(Boolean)),
})

console.log('\n[1] Class 1 file "C1-LLD-9.7.1" matches LO-Master "LLD 9.7.1"')
{
  const idx = idxFor(1, ['LLD 9.7.1'])
  const r = classifyCodes(['C1-LLD-9.7.1'], idx, 'new')
  ok(r.inMaster === 1 && r.unknown.length === 0, 'C1-LLD-9.7.1 → matched in master (prefix stripped)')
}

console.log('\n[2] Class 6 Hindi "C.9.7.1" still matches LO-Master "C.9.7.1" (NOT stripped)')
{
  const idx = idxFor(6, ['C.9.7.1'])
  const r = classifyCodes(['C.9.7.1'], idx, 'new')
  ok(r.inMaster === 1 && r.unknown.length === 0, 'C.9.7.1 matches for Class 6 Hindi')
}

console.log('\n[3] Competency "C-9.7" / "C-9.7.1" are NOT stripped')
{
  // If these were wrongly stripped they would become "9.7"/"9.7.1" and fail to
  // match a master entry keyed on "C-9.7". We assert the key is preserved.
  const idx = idxFor(1, ['C-9.7', 'C-9.7.1'])
  const r = classifyCodes(['C-9.7', 'C-9.7.1'], idx, 'new')
  ok(r.inMaster === 2 && r.unknown.length === 0, 'C-9.7 & C-9.7.1 preserved & matched (Class 1)')
}

console.log('\n[4] "CG-9" is NOT stripped (letter G, not a class number)')
{
  const idx = idxFor(9, ['CG-9'])
  const r = classifyCodes(['CG-9'], idx, 'new')
  ok(r.inMaster === 1 && r.unknown.length === 0, 'CG-9 preserved & matched (even with classOrder 9)')
}

console.log('\n[5] Class mismatch: a "C5-" prefix is NOT stripped inside a Class 1 file')
{
  // In a Class 1 file, only "C1-" may be stripped. "C5-LLD-1.1" must stay intact
  // (so it would only match a master literally keyed "C5-LLD-1.1").
  const idx = idxFor(1, ['LLD 1.1'])
  const r = classifyCodes(['C5-LLD-1.1'], idx, 'new')
  ok(r.inMaster === 0 && r.unknown.length === 1, 'C5-LLD-1.1 NOT stripped in Class 1 → unknown (not a false match)')
}

console.log('\n[6] "C1-9.7" (digit after hyphen, no letter) is NOT stripped')
{
  const idx = idxFor(1, ['C1-9.7'])
  const r = classifyCodes(['C1-9.7'], idx, 'new')
  ok(r.inMaster === 1 && r.unknown.length === 0, 'C1-9.7 preserved (letter lookahead blocks stripping)')
}

console.log('\n[7] "C12-" does not match a Class 1 "C1" prefix (number boundary)')
{
  const idx = idxFor(1, ['C12-SCI-1.1'])
  const r = classifyCodes(['C12-SCI-1.1'], idx, 'new')
  ok(r.inMaster === 1 && r.unknown.length === 0, 'C12-SCI-1.1 preserved for Class 1 (C1 boundary respected)')
}

console.log('\n[8] Direct Class 1 strip + looseCode equivalence spot-checks')
{
  // Confirm the real stripped key equals the master key, via classifyCodes.
  const idx = idxFor(1, ['LLD 9.7.1', 'EVS 2.3'])
  const r = classifyCodes(['C1-LLD-9.7.1', 'c1-evs-2.3'], idx, 'new')
  ok(r.inMaster === 2 && r.unknown.length === 0, 'case-insensitive "c1-evs-2.3" also matches "EVS 2.3"')
}

console.log(`\n==== LP LO-match tests: ${pass} passed, ${fail} failed ====\n`)
process.exit(fail ? 1 : 0)
