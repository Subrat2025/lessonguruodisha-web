// === SHARED LO-CODE MATCHER =================================================
// Single source of truth for comparing Learning-Outcome codes across differing
// separator conventions. Used by Teacher Observation validation (validate.js)
// AND the lesson-plan "Upload new version" dry-run (lib/lp/version.js) so both
// honour the exact same rule.
//
// Files write a space ("H 10.3.1"), the master uses a dot ("H.10.3.1") or runs
// them together ("H10.1.1"); Art uses parens ("AE(V) 1.1.1" vs "AE-(V)1.1.1").
// We drop parens/hyphens, split the leading letters from the number, then unify
// every space/dot run inside the number to a single dot (and trim stray
// leading/trailing/double dots). Internal dots are kept so 4.1.1 ≠ 41.1.
export function looseCode(s) {
  const t = String(s || '').toUpperCase().replace(/[()\-\u2013\u2014]/g, '').trim()
  const m = t.match(/^([A-Z]+)(.*)$/)
  if (!m) return t.replace(/[\s.]+/g, '.').replace(/^\.|\.$/g, '')
  const nums = m[2].replace(/[\s.]+/g, '.').replace(/^\.|\.$/g, '')
  return m[1] + (nums ? '.' + nums : '')
}
