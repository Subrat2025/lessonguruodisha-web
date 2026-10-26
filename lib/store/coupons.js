// === STORE === coupons (own collections only). Server-validated discounts.
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL } from '@/lib/store/security.js'

export async function upsertCoupon(db, body) {
  const now = new Date()
  if (body.id) {
    const { id, ...rest } = body
    if (rest.code) rest.code = String(rest.code).toUpperCase().trim()
    await db.collection(STORE_COLL.coupons).updateOne({ id }, { $set: { ...rest, updatedAt: now } })
    return db.collection(STORE_COLL.coupons).findOne({ id })
  }
  const doc = {
    id: uuidv4(), code: String(body.code || '').toUpperCase().trim(),
    kind: body.kind === 'flat' ? 'flat' : 'pct', value: Number(body.value) || 0,
    maxDiscount: body.maxDiscount == null || body.maxDiscount === '' ? null : Number(body.maxDiscount),
    minOrder: Number(body.minOrder) || 0,
    validFrom: body.validFrom || null, validTo: body.validTo || null,
    usageLimit: body.usageLimit == null || body.usageLimit === '' ? null : Number(body.usageLimit),
    perUserLimit: body.perUserLimit == null || body.perUserLimit === '' ? null : Number(body.perUserLimit),
    appliesTo: ['all', 'categories', 'products'].includes(body.appliesTo) ? body.appliesTo : 'all',
    categoryIds: body.categoryIds || [], productIds: body.productIds || [],
    labelOdia: body.labelOdia || '', labelEnglish: body.labelEnglish || '',
    active: body.active !== false, createdAt: now, updatedAt: now,
  }
  await db.collection(STORE_COLL.coupons).insertOne(doc)
  return doc
}

export async function listCoupons(db) { return db.collection(STORE_COLL.coupons).find({}).sort({ createdAt: -1 }).toArray() }

// items: [{ productId, categoryId, price }]. Returns { ok, discount, coupon, reason }.
export async function validateCoupon(db, code, { userId, items, subtotal }) {
  if (!code) return { ok: false, discount: 0, reason: 'No code' }
  const c = await db.collection(STORE_COLL.coupons).findOne({ code: String(code).toUpperCase().trim() })
  if (!c || !c.active) return { ok: false, discount: 0, reason: 'Invalid coupon' }
  const now = Date.now()
  if (c.validFrom && new Date(c.validFrom).getTime() > now) return { ok: false, discount: 0, reason: 'Coupon not started' }
  if (c.validTo && new Date(c.validTo).getTime() < now) return { ok: false, discount: 0, reason: 'Coupon expired' }
  if (c.minOrder && subtotal < c.minOrder) return { ok: false, discount: 0, reason: `ଏହି କୁପନ ₹${c.minOrder} ବା ଅଧିକ ଅର୍ଡରରେ ଲାଗିବ`, short: c.minOrder - subtotal, minOrder: c.minOrder }
  if (c.usageLimit != null) {
    const total = await db.collection(STORE_COLL.couponUses).countDocuments({ couponId: c.id })
    if (total >= c.usageLimit) return { ok: false, discount: 0, reason: 'Coupon limit reached' }
  }
  if (c.perUserLimit != null && userId) {
    const mine = await db.collection(STORE_COLL.couponUses).countDocuments({ couponId: c.id, userId })
    if (mine >= c.perUserLimit) return { ok: false, discount: 0, reason: 'You have used this coupon' }
  }
  // eligible base
  let base = subtotal
  if (c.appliesTo === 'categories') base = items.filter(i => (c.categoryIds || []).includes(i.categoryId)).reduce((a, i) => a + i.price, 0)
  else if (c.appliesTo === 'products') base = items.filter(i => (c.productIds || []).includes(i.productId)).reduce((a, i) => a + i.price, 0)
  if (base <= 0) return { ok: false, discount: 0, reason: 'Coupon not applicable to these items' }
  let discount = c.kind === 'flat' ? c.value : Math.floor(base * (c.value / 100))
  if (c.maxDiscount != null && c.maxDiscount > 0) discount = Math.min(discount, c.maxDiscount)
  discount = Math.min(discount, base, subtotal)
  if (discount <= 0) return { ok: false, discount: 0, reason: 'No discount' }
  return { ok: true, discount, coupon: c }
}

// Idempotent launch coupon. 20% off, max ₹50, one per buyer, valid until 15 Nov 2026 11:59 PM IST.
export async function ensureFestiveCoupon(db) {
  const code = 'FESTIVE2026'
  const existing = await db.collection(STORE_COLL.coupons).findOne({ code })
  if (existing) {
    // Phase C: enforce the ₹20 minimum order on the launch coupon (idempotent patch).
    if (existing.minOrder !== 20) await db.collection(STORE_COLL.coupons).updateOne({ code }, { $set: { minOrder: 20, updatedAt: new Date() } })
    return db.collection(STORE_COLL.coupons).findOne({ code })
  }
  const now = new Date()
  const doc = {
    id: uuidv4(), code, kind: 'pct', value: 20, maxDiscount: 50, minOrder: 20,
    validFrom: null, validTo: '2026-11-15T18:29:59.000Z', // 15 Nov 2026 23:59:59 IST
    usageLimit: null, perUserLimit: 1, appliesTo: 'all', categoryIds: [], productIds: [],
    labelOdia: 'FESTIVE2026 — 20% ଛାଡ଼ · 15 Nov 2026 ପର୍ଯ୍ୟନ୍ତ', labelEnglish: 'FESTIVE2026 — 20% off · until 15 Nov 2026',
    active: true, createdAt: now, updatedAt: now,
  }
  await db.collection(STORE_COLL.coupons).insertOne(doc)
  return doc
}

// Public display info for a featured/launch coupon (no PII). Returns null if none.
export async function getFeaturedCoupon(db, code = 'FESTIVE2026') {
  const c = await db.collection(STORE_COLL.coupons).findOne({ code: String(code).toUpperCase().trim() })
  if (!c || !c.active) return null
  const now = Date.now()
  const notStarted = c.validFrom && new Date(c.validFrom).getTime() > now
  const expired = c.validTo && new Date(c.validTo).getTime() < now
  return {
    code: c.code, kind: c.kind, value: c.value, maxDiscount: c.maxDiscount || null, minOrder: c.minOrder || 0,
    validTo: c.validTo || null, expired: !!expired, notStarted: !!notStarted,
    labelOdia: c.labelOdia || '', labelEnglish: c.labelEnglish || '',
    expiredLabelOdia: 'ଏହି କୁପନର ସମୟ ସମାପ୍ତ',
  }
}

export async function recordCouponUse(db, coupon, userId, orderId) {
  if (!coupon) return
  await db.collection(STORE_COLL.couponUses).insertOne({ id: uuidv4(), couponId: coupon.id, code: coupon.code, userId, orderId, at: new Date() })
}
