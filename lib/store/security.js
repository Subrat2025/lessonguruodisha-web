// === STORE === security, settings, gating, collections, indexes, access logs.
// Writes ONLY to new 'store*' collections + the 'store_settings' setting key.
import { v4 as uuidv4 } from 'uuid'

export const STORE_SETTINGS_KEY = 'store_settings'

export const STORE_COLL = {
  categories:   'storeCategories',
  products:     'storeProducts',
  files:        'storeProductFiles',
  carts:        'storeCarts',
  orders:       'storeOrders',
  entitlements: 'storeEntitlements',
  coupons:      'storeCoupons',
  couponUses:   'storeCouponUses',
  reviews:      'storeReviews',
  banners:      'storeBanners',
  shareLinks:   'storeShareLinks',
  events:       'storeEvents',
  accessLogs:   'storeAccessLogs',
  priceHistory: 'storePriceHistory',
  addresses:    'storeAddresses',
  shipments:    'storeShipments',
  studentLists: 'storeStudentLists',
}

export const STORE_DEFAULTS = Object.freeze({
  enabled: false,              // master switch
  betaTesters: [],             // mobiles that can use the store while master switch is OFF
  physicalEnabled: false,      // store_physical_enabled — printed orders (teacher screens)
  defaultSecurityLevel: 2,
  downloadLimits: { 1: 10, 2: 5, 3: 3 }, // per security level
  currency: 'INR',
  gstin: '', gstLegalName: '', gstAddress: '',
  supportWhatsapp: '',
  flatDeliveryInr: 60,         // physical delivery fallback
})

export const STORE_MAX_FILE_BYTES = 25 * 1024 * 1024

export async function getStoreSettings(db) {
  const doc = await db.collection('settings').findOne({ key: STORE_SETTINGS_KEY })
  return { ...STORE_DEFAULTS, ...(doc?.value || {}) }
}

export function normMobile(m) { return String(m || '').replace(/[^0-9]/g, '') }

export async function saveStoreSettings(db, patch, adminUser) {
  const cur = await getStoreSettings(db)
  const next = { ...cur, ...(patch || {}) }
  next.enabled = !!next.enabled
  next.physicalEnabled = !!next.physicalEnabled
  next.setsLive = !!next.setsLive
  next.defaultSecurityLevel = Math.min(4, Math.max(1, Number(next.defaultSecurityLevel) || 2))
  next.betaTesters = Array.isArray(next.betaTesters)
    ? [...new Set(next.betaTesters.map(normMobile).filter(Boolean))] : []
  await db.collection('settings').updateOne(
    { key: STORE_SETTINGS_KEY },
    { $set: { key: STORE_SETTINGS_KEY, value: next, updatedAt: new Date(), updatedBy: adminUser?.id || null } },
    { upsert: true },
  )
  return next
}

// Is the store visible/usable for this user? Master ON => everyone; OFF => beta only.
export function storeVisibleFor(settings, user) {
  if (settings?.enabled) return true
  if (!user?.mobile) return false
  const um = normMobile(user.mobile)
  const list = (settings?.betaTesters || []).map(normMobile).filter(Boolean)
  return list.some(x => x === um || (x.length >= 10 && um.length >= 10 && x.slice(-10) === um.slice(-10)))
}

// TEST-only account for simulated payments: name starts with TEST_ AND is a beta tester.
export function isStoreTestAccount(settings, user) {
  return !!user && typeof user.name === 'string' && user.name.startsWith('TEST_') && storeVisibleFor(settings, user)
}

export function storePhysicalEnabledFor(settings, user) {
  return !!settings?.physicalEnabled && storeVisibleFor(settings, user)
}

export async function ensureStoreIndexes(db) {
  try {
    await db.collection(STORE_COLL.products).createIndex({ slug: 1 }, { unique: true, sparse: true })
    await db.collection(STORE_COLL.orders).createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true })
    await db.collection(STORE_COLL.entitlements).createIndex({ userId: 1, productId: 1 }, { unique: true })
    await db.collection(STORE_COLL.products).createIndex({ status: 1, visibility: 1 })
    await db.collection(STORE_COLL.events).createIndex({ type: 1, createdAt: -1 })
    await db.collection(STORE_COLL.accessLogs).createIndex({ userId: 1, createdAt: -1 })
    await db.collection(STORE_COLL.shareLinks).createIndex({ productId: 1, tag: 1 })
  } catch (_) { /* index creation is best-effort, never blocks */ }
}

export async function logStoreAccess(db, { userId = null, productId = null, fileId = null, action, ip = null, userAgent = null, meta = {} }) {
  try {
    await db.collection(STORE_COLL.accessLogs).insertOne({
      id: uuidv4(), userId, productId, fileId, action, ip, userAgent, meta, createdAt: new Date(),
    })
  } catch (_) {}
}

// Count recent denied access attempts for a user (abuse flagging).
export async function deniedAttemptCount(db, userId, sinceMs = 24 * 3600 * 1000) {
  if (!userId) return 0
  return db.collection(STORE_COLL.accessLogs).countDocuments({
    userId, action: { $in: ['DENIED', 'TOKEN_REJECTED', 'LIMIT_REACHED', 'REVOKED_ACCESS'] },
    createdAt: { $gte: new Date(Date.now() - sinceMs) },
  })
}
