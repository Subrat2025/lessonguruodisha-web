// === STORE === lightweight analytics (own collections only).
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL } from '@/lib/store/security.js'

// Hard-coded TEST mobiles (beta testers) that must NEVER count in real funnel/sales.
const TEST_MOBILES = ['8000000001', '8000000002']

// Canonical "is this actor a TEST account?" check used for funnel exclusion.
// TEST_-prefixed names + the known beta-tester mobiles. Anonymous = not test.
export function isTestActor(user) {
  if (!user) return false
  if (typeof user.name === 'string' && user.name.startsWith('TEST_')) return true
  const m = String(user.mobile || '').replace(/[^0-9]/g, '')
  if (m && TEST_MOBILES.some(t => m.endsWith(t))) return true
  return false
}

// REAL paid-order filter — excludes simulated/test payments + TEST_ accounts.
// Kept identical to salesDashboard() so revenue and funnel-paid always agree.
const REAL = Object.freeze({ simulated: { $ne: true }, method: { $ne: 'test' }, userName: { $not: /^TEST_/ } })

export async function logEvent(db, { type, productId = null, userId = null, src = null, meta = {}, test = false }) {
  try { await db.collection(STORE_COLL.events).insertOne({ id: uuidv4(), type, productId, userId, src, meta, test: !!test, createdAt: new Date() }) } catch (_) {}
}

// ---------------- Day-One Store Funnel (views → add-to-cart → checkout → paid) ----------------
// Returns both ALL-TIME and TODAY blocks so the admin widget can toggle client-side.
// TEST accounts (TEST_* names, beta mobiles) + simulated payments are excluded everywhere.
export async function storeFunnel(db) {
  const EV = db.collection(STORE_COLL.events)
  const ORD = db.collection(STORE_COLL.orders)
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

  const block = async (dateFilter, ordDateFilter) => {
    const evBase = { test: { $ne: true }, ...dateFilter }
    const [views, productViews, listViews, addToCart, checkout] = await Promise.all([
      EV.countDocuments({ ...evBase, type: 'view' }),
      EV.countDocuments({ ...evBase, type: 'view', 'meta.scope': 'product' }),
      EV.countDocuments({ ...evBase, type: 'view', 'meta.scope': 'list' }),
      EV.countDocuments({ ...evBase, type: 'add_to_cart' }),
      EV.countDocuments({ ...evBase, type: 'checkout' }),
    ])
    const paid = await ORD.countDocuments({ ...REAL, status: 'paid', ...ordDateFilter })
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
    return {
      views, productViews, listViews, addToCart, checkout, paid,
      rates: {
        viewToCart: pct(addToCart, views),
        cartToCheckout: pct(checkout, addToCart),
        checkoutToPaid: pct(paid, checkout),
        viewToPaid: pct(paid, views),
      },
    }
  }

  const [all, today] = await Promise.all([
    block({}, {}),
    block({ createdAt: { $gte: startOfDay } }, { paidAt: { $gte: startOfDay } }),
  ])
  return { all, today, generatedAt: new Date() }
}

export async function adminAnalytics(db, { fromMs } = {}) {
  const since = new Date(fromMs || (Date.now() - 30 * 864e5))
  const paid = await db.collection(STORE_COLL.orders).find({ status: 'paid', paidAt: { $gte: since } }).toArray()
  const revenue = paid.reduce((a, o) => a + (o.total || 0), 0)
  const orders = paid.length
  const aov = orders ? Math.round(revenue / orders) : 0
  const views = await db.collection(STORE_COLL.events).countDocuments({ type: 'view', createdAt: { $gte: since } })
  const carts = await db.collection(STORE_COLL.events).countDocuments({ type: 'add_to_cart', createdAt: { $gte: since } })
  const checkouts = await db.collection(STORE_COLL.events).countDocuments({ type: 'checkout', createdAt: { $gte: since } })
  const refunds = await db.collection(STORE_COLL.orders).countDocuments({ status: 'refunded', refundedAt: { $gte: since } })
  // best sellers
  const sales = {}
  paid.forEach(o => o.items.forEach(i => { sales[i.productId] = (sales[i.productId] || 0) + 1 }))
  const top = Object.entries(sales).sort((a, b) => b[1] - a[1]).slice(0, 10)
  // share-link performance
  const bySrc = {}
  const srcViews = await db.collection(STORE_COLL.events).aggregate([{ $match: { type: 'view', src: { $ne: null }, createdAt: { $gte: since } } }, { $group: { _id: '$src', n: { $sum: 1 } } }]).toArray()
  srcViews.forEach(r => { bySrc[r._id] = { ...(bySrc[r._id] || {}), views: r.n } })
  const srcBuys = await db.collection(STORE_COLL.events).aggregate([{ $match: { type: 'purchase', src: { $ne: null }, createdAt: { $gte: since } } }, { $group: { _id: '$src', n: { $sum: 1 }, amt: { $sum: '$amount' } } }]).toArray()
  srcBuys.forEach(r => { bySrc[r._id] = { ...(bySrc[r._id] || {}), purchases: r.n, revenue: r.amt } })
  const denied = await db.collection(STORE_COLL.accessLogs).countDocuments({ action: { $in: ['DENIED', 'TOKEN_REJECTED', 'LIMIT_REACHED'] }, createdAt: { $gte: since } })
  return { revenue, orders, aov, funnel: { views, carts, checkouts, paid: orders }, refunds, top, bySrc, denied }
}

// Admin Store home dashboard — REAL sales only (excludes TEST_ accounts + simulated/test payments).
export async function salesDashboard(db) {
  const real = { simulated: { $ne: true }, method: { $ne: 'test' }, userName: { $not: /^TEST_/ } }
  const now = new Date()
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const start7 = new Date(startOfDay); start7.setDate(start7.getDate() - 6)
  const ORD = db.collection(STORE_COLL.orders)
  const paidBase = { ...real, status: 'paid' }

  const today = await ORD.find({ ...paidBase, paidAt: { $gte: startOfDay } }).toArray()
  const month = await ORD.find({ ...paidBase, paidAt: { $gte: startOfMonth } }).toArray()
  const week = await ORD.find({ ...paidBase, paidAt: { $gte: start7 } }).toArray()
  const sum = (arr) => arr.reduce((a, o) => a + (o.total || 0), 0)

  // 7-day daily trend
  const trend = []
  for (let i = 0; i < 7; i++) { const d0 = new Date(start7); d0.setDate(d0.getDate() + i); trend.push({ date: d0.toISOString().slice(0, 10), revenue: 0, orders: 0 }) }
  week.forEach(o => { const key = new Date(o.paidAt).toISOString().slice(0, 10); const row = trend.find(x => x.date === key); if (row) { row.revenue += o.total || 0; row.orders += 1 } })

  // top 5 best sellers this month
  const sales = {}
  month.forEach(o => (o.items || []).forEach(i => { const s = sales[i.productId] || { units: 0, revenue: 0, title: i.title, titleOdia: i.titleOdia }; s.units += 1; s.revenue += i.price || 0; sales[i.productId] = s }))
  const top = Object.entries(sales).map(([productId, v]) => ({ productId, ...v })).sort((a, b) => b.units - a.units).slice(0, 5)

  // coupon usage (real paid orders, all-time)
  const couponOrders = await ORD.find({ ...real, status: 'paid', couponCode: { $ne: null } }).toArray()
  const cmap = {}
  couponOrders.forEach(o => { const k = o.couponCode; const c = cmap[k] || { code: k, uses: 0, discount: 0 }; c.uses += 1; c.discount += o.discount || 0; cmap[k] = c })
  const coupons = Object.values(cmap).sort((a, b) => b.uses - a.uses)

  // refunds this month
  const refundRows = await ORD.find({ ...real, status: 'refunded', refundedAt: { $gte: startOfMonth } }).toArray()

  return {
    today: { revenue: sum(today), orders: today.length },
    month: { revenue: sum(month), orders: month.length },
    trend, top, coupons,
    refunds: { count: refundRows.length, amount: sum(refundRows) },
  }
}
