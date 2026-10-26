// ============================================================
// LessonGuru Odisha — Subject Registry (Part E v2).
// States the language for every subject the app ships, as a FACT,
// so resolveLanguage() never has to guess for content subjects.
// Registry lookup runs before any inference. See languageResolver.js.
// ============================================================

export const SUBJECT_REGISTRY = {
  // ── LANGUAGE SUBJECTS — subject decides, medium is irrelevant ──────────
  'odia':            { language: 'Odia',     script: 'Odia',       numerals: 'odia' },
  'oriya':           { language: 'Odia',     script: 'Odia',       numerals: 'odia' },
  'ଓଡ଼ିଆ':            { language: 'Odia',     script: 'Odia',       numerals: 'odia' },
  'ଓଡିଆ':            { language: 'Odia',     script: 'Odia',       numerals: 'odia' },
  'ଭାଷାମହକ':         { language: 'Odia',     script: 'Odia',       numerals: 'odia' },
  'english':         { language: 'English',  script: 'Latin',      numerals: 'latin' },
  'hindi':           { language: 'Hindi',    script: 'Devanagari', numerals: 'devanagari' },
  'sanskrit':        { language: 'Sanskrit', script: 'Odia',       numerals: 'odia' },

  // ── CONTENT SUBJECTS — Odia-medium by default in SCERT Odisha ─────────
  'social science':        { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'social studies':        { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'ସାମାଜିକ ବିଜ୍ଞାନ':        { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'sst':                   { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'history':               { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'geography':             { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'civics':                { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'political science':     { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'economics':             { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'mathematics':           { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'maths':                 { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'math':                  { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'ଗଣିତ':                  { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'ଗଣିତ ମେଳା':             { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'ଗଣିତ ପ୍ରକାଶ':           { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'science':               { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'physical science':      { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'life science':          { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'ବିଜ୍ଞାନ':               { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'evs':                   { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'environmental studies': { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'environmental science': { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'ପରିବେଶ ଅଧ୍ୟୟନ':         { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'ଆମ ବିଚିତ୍ର ବିଶ୍ୱ':       { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'ବିଚିତ୍ର ଆମ ପୃଥିବୀ':      { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'health & physical education': { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'health and physical education': { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'general knowledge':     { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'gk':                    { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'art education':         { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'work education':        { language: 'Odia', script: 'Odia', numerals: 'odia' },
  'computer':              { language: 'Odia', script: 'Odia', numerals: 'odia' },
}

// In-memory log of subjects the registry did not know about. Feeds registry
// growth — if D1 rejections cluster on resolvedBy==='app-default', add these.
// ALSO persisted to MongoDB (collection: unresolvedSubjects) so admins can
// review + grow the registry across restarts. Persistence is best-effort and
// never blocks or throws in the resolution hot-path.
const _unresolved = []

function _norm(subject) {
  return String(subject || '').trim().toLowerCase()
}

async function _persistUnresolved(info) {
  try {
    const { getDb } = await import('@/lib/mongodb.js')
    const d = await getDb()
    const key = _norm(info.subject)
    if (!key) return
    await d.collection('unresolvedSubjects').updateOne(
      { key },
      {
        $set: {
          key,
          subject: info.subject || '',
          lastBook: info.book || '',
          lastMedium: info.medium || '',
          lastClassLevel: info.classLevel != null ? String(info.classLevel) : '',
          lastSeenAt: new Date(),
          resolved: false,
        },
        $setOnInsert: { firstSeenAt: new Date() },
        $inc: { count: 1 },
        $addToSet: {
          ...(info.classLevel != null ? { classes: String(info.classLevel) } : {}),
        },
      },
      { upsert: true },
    )
  } catch { /* best-effort */ }
}

export function logUnresolvedSubject(info) {
  try {
    _unresolved.push({ ...info, at: new Date().toISOString() })
    if (_unresolved.length > 500) _unresolved.shift()
    console.warn('[questionEngine] UNRESOLVED subject → app-default Odia:', JSON.stringify(info))
    // fire-and-forget DB persistence
    _persistUnresolved(info)
  } catch {}
}

// Synchronous in-memory snapshot (process lifetime).
export function getUnresolvedSubjects() { return _unresolved.slice() }

// Durable list from MongoDB for the Admin registry-growth view.
export async function getUnresolvedSubjectsFromDb({ includeResolved = false, limit = 200 } = {}) {
  try {
    const { getDb } = await import('@/lib/mongodb.js')
    const d = await getDb()
    const filter = includeResolved ? {} : { resolved: { $ne: true } }
    const rows = await d.collection('unresolvedSubjects')
      .find(filter, { projection: { _id: 0 } })
      .sort({ count: -1, lastSeenAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || 200, 1), 1000))
      .toArray()
    return rows
  } catch {
    return []
  }
}

// Admin marks a subject as handled (added to the registry) so it drops off
// the unresolved list without losing the historical record.
export async function markUnresolvedSubjectResolved(key) {
  try {
    const { getDb } = await import('@/lib/mongodb.js')
    const d = await getDb()
    const k = _norm(key)
    if (!k) return { ok: false }
    const r = await d.collection('unresolvedSubjects').updateOne(
      { key: k },
      { $set: { resolved: true, resolvedAt: new Date() } },
    )
    return { ok: true, modified: r.modifiedCount }
  } catch {
    return { ok: false }
  }
}
