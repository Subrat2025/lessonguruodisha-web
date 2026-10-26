// =============================================================================
//  AI Cache — per-chapter reusable resource cache
//  ---------------------------------------------------------------------------
//  Stores every AI-generated resource in the `chapter_ai_cache` collection so
//  subsequent teachers can instantly reuse the same result OR click Regenerate.
//
//  Cache key: (chapterIds, resourceType, params-hash)
//    where params-hash covers: difficulty, language, assessmentType,
//    questionMix, count, etc.
//
//  ★ Cache stores GENERATED resources only. Never touches original curriculum
//    data (classes / books / chapters / lessons).
// =============================================================================

import crypto from 'crypto'

const COLLECTION = 'chapter_ai_cache'

/** Compute a stable short hash for the params object (order-insensitive). */
export function hashParams(params = {}) {
  // Sort keys for stable output
  const sortedKeys = Object.keys(params).sort()
  const canon = sortedKeys
    .map(k => {
      const v = params[k]
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) return null
      const val = Array.isArray(v) ? [...v].sort().join(',') : (typeof v === 'object' ? JSON.stringify(v) : String(v))
      return `${k}=${val}`
    })
    .filter(Boolean)
    .join('|')
  return crypto.createHash('sha1').update(canon || 'default').digest('hex').substring(0, 12)
}

/** Build a canonical cache key for a resource. */
export function cacheKey({ chapterIds, resourceType, params }) {
  const chapKey = [...(chapterIds || [])].sort().join(',')
  const paramsHash = hashParams(params || {})
  return `${resourceType}::${chapKey}::${paramsHash}`
}

/**
 * Look up a cached resource. Returns null if not found or if the resource is
 * older than `maxAgeDays` (default: unlimited).
 */
export async function getCachedResource(db, {
  chapterIds, resourceType, params = {}, maxAgeDays,
}) {
  const key = cacheKey({ chapterIds, resourceType, params })
  const filter = { key }
  if (maxAgeDays) {
    filter.updatedAt = { $gte: new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000) }
  }
  const doc = await db.collection(COLLECTION).findOne(filter, { projection: { _id: 0 } })
  return doc || null
}

/**
 * Save (upsert) a generated resource to the cache.
 *
 * @param db  mongo db
 * @param opts
 *   - chapterIds:  string[]  (required)
 *   - resourceType: 'assessment' | 'question-paper' | 'worksheet' | ...
 *   - params:      object     — the input params used for generation
 *   - resourceId:  string     — the id of the actual generated doc (e.g. assessment.id)
 *   - resourceRef: string     — collection where the full doc is stored (e.g. 'assessments')
 *   - createdBy:   string     — user id who first generated
 *   - createdByName: string
 *   - title:       string     — display title for reuse UI
 *   - summary:     string     — short summary of the resource
 */
export async function saveCachedResource(db, {
  chapterIds, resourceType, params = {}, resourceId, resourceRef,
  createdBy, createdByName, title, summary,
}) {
  const key = cacheKey({ chapterIds, resourceType, params })
  const now = new Date()
  const update = {
    $set: {
      key,
      chapterIds,
      resourceType,
      params,
      resourceId,
      resourceRef,
      title: title || '',
      summary: summary || '',
      updatedAt: now,
      updatedBy: createdBy,
      updatedByName: createdByName,
    },
    $inc: { reuseCount: 0 },
    $setOnInsert: {
      createdAt: now,
      createdBy,
      createdByName,
      firstResourceId: resourceId,
    },
  }
  await db.collection(COLLECTION).updateOne({ key }, update, { upsert: true })
  return key
}

/** Mark a cache entry as reused (increments counter). */
export async function markReused(db, key) {
  await db.collection(COLLECTION).updateOne({ key }, { $inc: { reuseCount: 1 }, $set: { lastReusedAt: new Date() } })
}

/**
 * List all cached resources for a given chapter — useful for the teacher UI
 * to show "already generated" resources so they can reuse them.
 */
export async function listCachedForChapter(db, { chapterId, resourceType }) {
  const filter = { chapterIds: chapterId }
  if (resourceType) filter.resourceType = resourceType
  return db.collection(COLLECTION).find(filter, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).limit(20).toArray()
}
