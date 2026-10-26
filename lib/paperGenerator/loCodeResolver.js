// ============================================================
// LessonGuru Odisha — FA/SA Paper: LO Code Resolver
// Reads the OFFICIAL LO Code collection from MongoDB (`loCodes`)
// so Gemini can only choose from real, existing codes.
// ============================================================

import { gradeToInt } from './sectionPlanner.js'

// Map UI subject → canonical loCodes.subject values used in the DB.
// The DB stores subject as e.g. 'Odia' | 'English' | 'Hindi' | 'Sanskrit'
// | 'Mathematics' | 'Science' | 'Social Science' | 'EVS' | etc.
// We normalise common variants so the resolver never returns []
// for a valid subject name.
function canonicalSubject(subject = '') {
  const s = String(subject || '').toLowerCase().trim()
  if (s.startsWith('odia'))     return ['Odia']
  if (s.startsWith('english'))  return ['English']
  if (s.startsWith('hindi'))    return ['Hindi']
  if (s.startsWith('sanskrit')) return ['Sanskrit']
  if (s.startsWith('math'))     return ['Mathematics']
  if (s.startsWith('science') && !s.includes('social')) return ['Science']
  if (s.includes('social'))     return ['Social Science', 'Social', 'SST']
  if (s.startsWith('evs') || s.includes('world around')) return ['EVS', 'The World Around Us']
  if (s.startsWith('art'))      return ['Art', 'Art Education']
  if (s.includes('physical'))   return ['PE', 'Physical Education', 'Physical Education and Well-being']
  if (s.includes('vocation'))   return ['Vocational', 'Vocational Education']
  return [subject]
}

/**
 * Fetch LO Codes for a class + subject from the loCodes collection.
 * Returns [{ code, description, competency, class, subject }, …]
 * If the collection is empty for that combo, returns [] (caller falls back
 * to generic bloom-level tagging so the pipeline still succeeds).
 */
export async function fetchLOCodes(db, { grade, subject } = {}) {
  if (!db || !grade || !subject) return []
  const klass = gradeToInt(grade)
  const subjects = canonicalSubject(subject)
  const filter = {
    ...(klass != null ? { class: klass } : {}),
    subject: { $in: subjects },
  }
  try {
    const docs = await db.collection('loCodes').find(filter).limit(200).toArray()
    return (docs || []).map(d => ({
      code: d.code || d.id || '',
      description: d.description || d.competency || '',
      competency: d.competency || '',
      chapter: d.chapter || '',
      class: d.class,
      subject: d.subject,
    })).filter(x => x.code)
  } catch (_) {
    return []
  }
}

/**
 * Given the fetched pool, return a compact string block for the Gemini
 * prompt.  Kept short (max ~2500 chars) so the model can quote them
 * verbatim without hitting the prompt-length budget.
 */
export function loCodeBlock(codes = [], { max = 40 } = {}) {
  const list = codes.slice(0, max)
  if (!list.length) return ''
  const lines = list.map(c => `${c.code} — ${(c.description || '').slice(0, 140)}`)
  return lines.join('\n')
}

/** Validate an LO code returned by Gemini — case-insensitive, whitespace tolerant. */
export function isValidLOCode(codes = [], candidate = '') {
  if (!candidate) return false
  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase()
  const target = norm(candidate)
  return codes.some(c => norm(c.code) === target)
}
