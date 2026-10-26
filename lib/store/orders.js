// === STORE === cart, checkout, Razorpay order/verify/webhook (idempotent),
// orders, fulfilment, refunds, receipts. Reuses the platform Razorpay keys.
import crypto from 'crypto'
import Razorpay from 'razorpay'
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL } from '@/lib/store/security.js'
import { getProductById, effectivePrice, isLive } from '@/lib/store/catalog.js'
import { grantForOrder, revokeForOrder, hasEntitlement } from '@/lib/store/entitlements.js'
import { validateCoupon, recordCouponUse } from '@/lib/store/coupons.js'
import { resolveCart } from '@/lib/store/sets.js'

const RZP_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || ''
let _rzp = null
export function getRzp() { if (_rzp) return _rzp; if (!RZP_KEY_ID || !RZP_KEY_SECRET) return null; _rzp = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET }); return _rzp }

// ---------------- Cart ----------------
export async function getCart(db, userId) {
  const c = await db.collection(STORE_COLL.carts).findOne({ userId })
  return c?.productIds || []
}
export async function setCart(db, userId, productIds) {
  await db.collection(STORE_COLL.carts).updateOne({ userId }, { $set: { userId, productIds: [...new Set(productIds)], updatedAt: new Date() } }, { upsert: true })
  return [...new Set(productIds)]
}
export async function addToCart(db, userId, productId) { const ids = await getCart(db, userId); if (!ids.includes(productId)) ids.push(productId); return setCart(db, userId, ids) }
export async function removeFromCart(db, userId, productId) { const ids = (await getCart(db, userId)).filter(x => x !== productId); return setCart(db, userId, ids) }
export async function clearCart(db, userId) { await db.collection(STORE_COLL.carts).updateOne({ userId }, { $set: { productIds: [], updatedAt: new Date() } }, { upsert: true }) }

// ---------------- Order draft (server-priced) ----------------
// Returns { items, subtotal, discount, total, coupon, priceChanges, alreadyOwned, cartMessages }.
// Uses resolveCart() so set/bundle/pack dedup + dynamic chapter-bundle pricing
// are computed server-side; the client never sends prices.
export async function buildOrderDraft(db, user, { productIds, couponCode, clientPrices = {} }) {
  const resolved = await resolveCart(db, user, productIds)
  const items = [], priceChanges = []
  const alreadyOwned = resolved.messages.filter(m => m.code === 'owned').map(m => ({ productId: m.productId, title: m.productId }))
  for (const l of resolved.lines) {
    const it = { productId: l.productId, slug: l.slug, title: l.title, titleOdia: l.titleOdia, type: l.type, categoryId: l.categoryId || null, price: l.price, mrp: l.mrp, bundleItems: l.bundleItems || [], setNo: l.setNo || null, parentChapterId: l.parentChapterId || null, isBundle: !!l.isBundle }
    items.push(it)
    const cp = clientPrices[l.productId]
    if (cp != null && Number(cp) !== l.price) priceChanges.push({ productId: l.productId, title: l.title, oldPrice: Number(cp), newPrice: l.price })
  }
  const subtotal = resolved.subtotal
  let discount = 0, coupon = null, couponReason = null, couponShort = 0
  if (couponCode) {
    const v = await validateCoupon(db, couponCode, { userId: user.id, items, subtotal })
    if (v.ok) { discount = v.discount; coupon = v.coupon } else { couponReason = v.reason; couponShort = v.short || 0 }
  }
  const total = Math.max(discount > 0 ? 1 : 0, subtotal - discount)
  return { items, subtotal, discount, total, coupon, couponReason, couponShort, priceChanges, alreadyOwned, cartMessages: resolved.messages, groups: resolved.groups, mrpTotal: resolved.mrpTotal }
}

// ---------------- Checkout ----------------
// confirm=false + detected price change => returns { priceChanged } without charging.
export async function createCheckout(db, user, { productIds, couponCode, clientPrices, confirm, src }) {
  const draft = await buildOrderDraft(db, user, { productIds, couponCode, clientPrices })
  if (!draft.items.length) return { error: draft.alreadyOwned.length ? 'You already own these items' : 'Nothing to buy', alreadyOwned: draft.alreadyOwned }
  if (draft.priceChanges.length && !confirm) return { priceChanged: true, priceChanges: draft.priceChanges, draft: publicDraft(draft) }
  const orderId = uuidv4()
  const baseOrder = {
    id: orderId, userId: user.id, userMobile: user.mobile, userName: user.name,
    items: draft.items, subtotal: draft.subtotal, discount: draft.discount, total: draft.total,
    couponCode: draft.coupon?.code || null, couponId: draft.coupon?.id || null,
    currency: 'INR', src: src || null, status: 'pending', createdAt: new Date(),
  }
  if (draft.total === 0) {
    baseOrder.status = 'paid'; baseOrder.paidAt = new Date(); baseOrder.razorpayOrderId = `FREE_${orderId}`; baseOrder.method = 'free'
    await db.collection(STORE_COLL.orders).insertOne(baseOrder)
    await afterPaid(db, baseOrder)
    return { free: true, orderId, order: orderView(baseOrder) }
  }
  const rzp = getRzp()
  if (!rzp) return { error: 'Payment not configured' }
  const rzpOrder = await rzp.orders.create({ amount: draft.total * 100, currency: 'INR', receipt: orderId, notes: { kind: 'store_order', userId: user.id } })
  baseOrder.razorpayOrderId = rzpOrder.id
  await db.collection(STORE_COLL.orders).insertOne(baseOrder)
  return { orderId, razorpayOrderId: rzpOrder.id, amount: rzpOrder.amount, currency: 'INR', keyId: RZP_KEY_ID }
}

function publicDraft(d) { return { items: d.items, subtotal: d.subtotal, discount: d.discount, total: d.total, couponCode: d.coupon?.code || null, couponReason: d.couponReason } }

// Verify a Razorpay signature then fulfil (idempotent).
export async function verifyAndFulfill(db, { razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return { error: 'Missing payment fields' }
  const expected = crypto.createHmac('sha256', RZP_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
  if (expected !== razorpay_signature) return { error: 'Invalid signature' }
  const order = await fulfillByRzpId(db, razorpay_order_id, { paymentId: razorpay_payment_id, method: 'razorpay' })
  if (!order) return { error: 'Order not found' }
  return { ok: true, orderId: order.id, order: orderView(order) }
}

// Webhook payload fulfilment (payment.captured / order.paid). Idempotent.
export async function webhookFulfill(db, event) {
  try {
    const ent = event?.payload?.payment?.entity || event?.payload?.order?.entity
    const rzpOrderId = ent?.order_id || event?.payload?.order?.entity?.id
    const paymentId = event?.payload?.payment?.entity?.id || null
    if (!rzpOrderId) return { ok: false }
    const order = await fulfillByRzpId(db, rzpOrderId, { paymentId, method: 'razorpay_webhook' })
    return { ok: !!order }
  } catch (_) { return { ok: false } }
}

// TEST-only simulated payment (route gates to TEST_ beta accounts).
export async function testFulfill(db, user, { productIds, couponCode, src }) {
  const draft = await buildOrderDraft(db, user, { productIds, couponCode, clientPrices: {} })
  if (!draft.items.length) return { error: 'Nothing to buy', alreadyOwned: draft.alreadyOwned }
  const orderId = uuidv4()
  const order = {
    id: orderId, userId: user.id, userMobile: user.mobile, userName: user.name, items: draft.items,
    subtotal: draft.subtotal, discount: draft.discount, total: draft.total, couponCode: draft.coupon?.code || null,
    couponId: draft.coupon?.id || null, currency: 'INR', src: src || null, status: 'paid', method: 'test',
    razorpayOrderId: `TEST_${orderId}`, paidAt: new Date(), createdAt: new Date(), simulated: true,
  }
  await db.collection(STORE_COLL.orders).insertOne(order)
  await afterPaid(db, order)
  return { ok: true, simulated: true, orderId, order: orderView(order) }
}

// Core idempotent fulfilment keyed on razorpayOrderId.
export async function fulfillByRzpId(db, rzpOrderId, { paymentId, method }) {
  const order = await db.collection(STORE_COLL.orders).findOne({ razorpayOrderId: rzpOrderId })
  if (!order) return null
  if (order.status === 'paid') return order // already fulfilled -> idempotent
  const res = await db.collection(STORE_COLL.orders).updateOne(
    { id: order.id, status: { $ne: 'paid' } },
    { $set: { status: 'paid', paidAt: new Date(), razorpayPaymentId: paymentId || null, method: method || 'razorpay' } },
  )
  if (res.modifiedCount === 0) return await db.collection(STORE_COLL.orders).findOne({ id: order.id })
  const fresh = await db.collection(STORE_COLL.orders).findOne({ id: order.id })
  await afterPaid(db, fresh)
  return fresh
}

async function afterPaid(db, order) {
  await grantForOrder(db, order)
  const pids = order.items.map(i => i.productId)
  if (pids.length) await db.collection(STORE_COLL.products).updateMany({ id: { $in: pids } }, { $inc: { salesCount: 1 } })
  if (order.couponId) await recordCouponUse(db, { id: order.couponId, code: order.couponCode }, order.userId, order.id)
  await clearCart(db, order.userId)
  await db.collection(STORE_COLL.events).insertOne({ id: uuidv4(), type: 'purchase', userId: order.userId, orderId: order.id, src: order.src || null, amount: order.total, productIds: pids, createdAt: new Date() })
}

export async function refundOrder(db, orderId, admin) {
  const order = await db.collection(STORE_COLL.orders).findOne({ id: orderId })
  if (!order) return { error: 'Order not found' }
  if (order.status === 'refunded') return { ok: true, already: true }
  await db.collection(STORE_COLL.orders).updateOne({ id: orderId }, { $set: { status: 'refunded', refundedAt: new Date(), refundedBy: admin?.id || null } })
  await revokeForOrder(db, order)
  return { ok: true }
}

export async function listOrders(db, userId) { return (await db.collection(STORE_COLL.orders).find({ userId }).sort({ createdAt: -1 }).limit(100).toArray()).map(orderView) }
export async function getOrder(db, id, userId) { const o = await db.collection(STORE_COLL.orders).findOne({ id, userId }); return o ? orderView(o) : null }

export function orderView(o) {
  return { id: o.id, status: o.status, items: o.items, subtotal: o.subtotal, discount: o.discount, total: o.total, couponCode: o.couponCode, currency: o.currency, method: o.method, createdAt: o.createdAt, paidAt: o.paidAt, refundedAt: o.refundedAt }
}

export function receiptData(order, settings) {
  return {
    orderId: order.id, date: order.paidAt || order.createdAt, items: order.items,
    subtotal: order.subtotal, discount: order.discount, total: order.total, couponCode: order.couponCode,
    buyer: { name: order.userName, mobile: order.userMobile },
    gstin: settings?.gstin || '', gstLegalName: settings?.gstLegalName || '', gstAddress: settings?.gstAddress || '',
    seller: 'LessonGuru Odisha',
  }
}
