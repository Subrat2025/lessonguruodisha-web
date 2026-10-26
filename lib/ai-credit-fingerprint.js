// AI Credit — Deterministic Fingerprint Helper
//
// Purpose:
//   Produce a stable, canonical SHA-256 hash for a generation request so we
//   can implement a strict CACHE-FIRST strategy: same inputs → same fingerprint
//   → serve the cached `aiGeneratedResources` document instead of calling
//   Gemini a second time. Every serve (cached or not) still debits credits.
//
// Non-invasive:
//   This module is pure — it does NOT read/write DB or hit any network.
//   Safe to import from any route once Phase 1B wires the endpoints.

import crypto from 'crypto'

/**
 * Normalise a value for canonical hashing.
 *  - Trims and lower-cases strings.
 *  - Sorts arrays of scalars so order does not affect the hash.
 *  - Sorts object keys recursively so key order does not affect the hash.
 *  - Coerces null/undefined to null.
 */
function normalise(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim().toLowerCase()
  if (typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) {
    const arr = v.map((x) => normalise(x))
    // Only sort arrays of primitives to keep semantic meaning of ordered lists
    const allScalar = arr.every((x) => x === null || typeof x !== 'object')
    return allScalar ? [...arr].sort((a, b) => String(a).localeCompare(String(b))) : arr
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v).sort()
    const out = {}
    for (const k of keys) out[k] = normalise(v[k])
    return out
  }
  return String(v)
}

/**
 * Build a deterministic fingerprint (sha256 hex string) for a generation request.
 *
 * Recommended fields:
 *   - zone            : 'engagement' | 'worksheet' | 'assessment'
 *   - generationType  : e.g. 'topic_check', 'practice_set', 'assessment_paper'
 *   - className
 *   - bookName / subject
 *   - chapterName
 *   - topic
 *   - loCodes         : array of LO code strings (order irrelevant)
 *   - language        : 'odia' | 'english' | ...
 *   - extra           : freeform object of type-specific knobs
 *                       (e.g. { count: 10, difficulty: 'medium', types: ['mcq','short'] })
 *
 * Any additional fields you pass are also included canonically.
 */
export function fingerprint(input = {}) {
  const canonical = normalise({
    zone: input.zone || '',
    generationType: input.generationType || '',
    className: input.className || '',
    bookName: input.bookName || '',
    chapterName: input.chapterName || '',
    topic: input.topic || '',
    loCodes: Array.isArray(input.loCodes) ? input.loCodes : [],
    language: input.language || 'odia',
    // Optional bag of type-specific parameters that influence output.
    extra: input.extra && typeof input.extra === 'object' ? input.extra : {},
  })
  const json = JSON.stringify(canonical)
  return crypto.createHash('sha256').update(json).digest('hex')
}

/**
 * Short human-friendly version of the fingerprint for logs / UI tooltips.
 */
export function shortFingerprint(fp) {
  return String(fp || '').slice(0, 12)
}

/**
 * Sanity self-test that can be executed via `node -e` at deployment time.
 * Two identical inputs (different key order, different array order, different case)
 * must produce IDENTICAL fingerprints.
 */
export function _selfTest() {
  const a = fingerprint({
    zone: 'worksheet', generationType: 'practice_set', className: 'Class 5',
    bookName: 'Math', chapterName: 'Fractions', topic: 'Adding Fractions',
    loCodes: ['C-5.1', 'C-5.2'], language: 'odia', extra: { count: 10, types: ['mcq', 'short'] },
  })
  const b = fingerprint({
    extra: { types: ['short', 'mcq'], count: 10 }, language: 'ODIA',
    loCodes: ['C-5.2', 'C-5.1'], topic: '  adding fractions  ',
    chapterName: 'FRACTIONS', bookName: 'math', className: 'class 5',
    generationType: 'practice_set', zone: 'Worksheet',
  })
  return a === b
}
