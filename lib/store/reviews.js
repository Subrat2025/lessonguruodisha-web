// === STORE === buyer reviews. Only owners (entitled, non-revoked) can review.
// Product ratingAvg/ratingCount are recomputed from VISIBLE reviews only.
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL } from '@/lib/store/security.js'

export async function addReview(db, { userId, userName, productId, rating, text }) {
  const r = Math.min(5, Math.max(1, Math.round(Number(rating) || 0)))
  const now = new Date()
  await db.collection(STORE_COLL.reviews).updateOne(
    { userId, productId },
    { $set: { rating: r, text: String(text || '').slice(0, 1000), userName: userName || 'Teacher', hidden: false, updatedAt: now },
      $setOnInsert: { id: uuidv4(), userId, productId, createdAt: now } },
    { upsert: true },
  )
  await recomputeRating(db, productId)
  return db.collection(STORE_COLL.reviews).findOne({ userId, productId })
}

export async function listReviews(db, productId, { includeHidden = false } = {}) {
  const q = { productId, ...(includeHidden ? {} : { hidden: { $ne: true } }) }
  return db.collection(STORE_COLL.reviews).find(q).sort({ updatedAt: -1 }).limit(100).toArray()
}

export async function myReview(db, userId, productId) {
  return db.collection(STORE_COLL.reviews).findOne({ userId, productId })
}

export async function setHidden(db, id, hidden) {
  const rev = await db.collection(STORE_COLL.reviews).findOne({ id })
  if (!rev) return null
  await db.collection(STORE_COLL.reviews).updateOne({ id }, { $set: { hidden: !!hidden } })
  await recomputeRating(db, rev.productId)
  return true
}

export async function recomputeRating(db, productId) {
  const rows = await db.collection(STORE_COLL.reviews).find({ productId, hidden: { $ne: true } }).toArray()
  const count = rows.length
  const avg = count ? Math.round((rows.reduce((a, r) => a + (r.rating || 0), 0) / count) * 10) / 10 : 0
  await db.collection(STORE_COLL.products).updateOne({ id: productId }, { $set: { ratingAvg: avg, ratingCount: count } })
  return { avg, count }
}

export function reviewView(r) {
  return { id: r.id, userName: r.userName, rating: r.rating, text: r.text, createdAt: r.createdAt, hidden: !!r.hidden }
}
