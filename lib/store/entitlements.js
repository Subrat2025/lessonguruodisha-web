// === STORE === entitlements: who owns what, download counters, revoke.
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL } from '@/lib/store/security.js'

// A unit-test is "owned" if the user has a direct entitlement OR owns a pack
// (unit_test_pack) whose scope covers it (dynamic — includes tests added later).
function _scopeCovers(scope, product) {
  if (!scope || !product?.unitTest) return false
  if (String(scope.class) !== String(product.unitTest.class)) return false
  if (scope.kind === 'class') return true
  if (scope.kind === 'subject') return scope.subjectKey === product.unitTest.subjectKey
  return false
}
async function _ownedPackScopes(db, userId) {
  const ents = await db.collection(STORE_COLL.entitlements).find({ userId, revokedAt: null }).project({ productId: 1 }).toArray()
  if (!ents.length) return []
  const ids = ents.map(e => e.productId)
  const packs = await db.collection(STORE_COLL.products).find({ id: { $in: ids }, type: 'unit_test_pack' }).project({ packScope: 1 }).toArray()
  return packs.map(p => p.packScope).filter(Boolean)
}

async function _directOwned(db, userId, productId) {
  const e = await db.collection(STORE_COLL.entitlements).findOne({ userId, productId })
  return !!e && !e.revokedAt
}

// SINGLE SOURCE OF TRUTH for ownership. Resolves transitively:
//   pack (unit_test_pack) → chapter bundle (unit_test) → set (unit_test_set)
// Used by EVERY check: view, download-token, download, My Library, product
// "owned" state and cart — so they can never disagree.
export async function ownsProductDoc(db, userId, prod) {
  if (!prod) return false
  if (await _directOwned(db, userId, prod.id)) return true
  if (prod.type === 'unit_test_set' && prod.parentChapterId) {
    const parent = await db.collection(STORE_COLL.products).findOne({ id: prod.parentChapterId }, { projection: { id: 1, type: 1, unitTest: 1, parentChapterId: 1 } })
    return ownsProductDoc(db, userId, parent)
  }
  if (prod.type === 'unit_test' && prod.unitTest) {
    const scopes = await _ownedPackScopes(db, userId)
    return scopes.some(s => _scopeCovers(s, prod))
  }
  return false
}

export async function hasEntitlement(db, userId, productId) {
  const prod = await db.collection(STORE_COLL.products).findOne({ id: productId }, { projection: { id: 1, type: 1, unitTest: 1, parentChapterId: 1 } })
  if (!prod) return _directOwned(db, userId, productId)
  return ownsProductDoc(db, userId, prod)
}
export async function getEntitlement(db, userId, productId) {
  return db.collection(STORE_COLL.entitlements).findOne({ userId, productId })
}

// Return the user's entitlement, lazily materialising a DIRECT entitlement when
// the product is owned transitively (set via chapter, chapter via pack). Keeps
// per-file download counters, oath state and orderId working. Never grants
// access that ownsProductDoc() wouldn't already allow.
export async function ensureEntitlement(db, userId, productId) {
  const existing = await getEntitlement(db, userId, productId)
  if (existing && !existing.revokedAt) return existing
  const prod = await db.collection(STORE_COLL.products).findOne({ id: productId }, { projection: { id: 1, type: 1, unitTest: 1, parentChapterId: 1 } })
  if (!prod || !(await ownsProductDoc(db, userId, prod))) return existing
  let orderId = null, via = null
  if (prod.type === 'unit_test_set' && prod.parentChapterId) {
    const pEnt = await ensureEntitlement(db, userId, prod.parentChapterId)
    orderId = pEnt?.orderId || null; via = prod.parentChapterId
  } else if (prod.type === 'unit_test') {
    const ents = await db.collection(STORE_COLL.entitlements).find({ userId, revokedAt: null }).toArray()
    const packs = ents.length ? await db.collection(STORE_COLL.products).find({ id: { $in: ents.map(e => e.productId) }, type: 'unit_test_pack' }).project({ id: 1, packScope: 1 }).toArray() : []
    const covering = packs.find(p => _scopeCovers(p.packScope, prod))
    if (covering) { orderId = ents.find(e => e.productId === covering.id)?.orderId || null; via = covering.id }
  }
  await grantEntitlement(db, { userId, productId, orderId })
  if (via) await db.collection(STORE_COLL.entitlements).updateOne({ userId, productId }, { $set: { viaPack: via } })
  return getEntitlement(db, userId, productId)
}

// Grant one entitlement (idempotent on {userId, productId}).
export async function grantEntitlement(db, { userId, productId, orderId }) {
  const now = new Date()
  await db.collection(STORE_COLL.entitlements).updateOne(
    { userId, productId },
    { $set: { revokedAt: null, orderId, updatedAt: now }, $setOnInsert: { id: uuidv4(), userId, productId, grantedAt: now, downloadsUsed: {}, oathAcceptedAt: null } },
    { upsert: true },
  )
}

// Grant everything in a paid order (expands bundles into their items).
export async function grantForOrder(db, order) {
  for (const it of order.items || []) {
    await grantEntitlement(db, { userId: order.userId, productId: it.productId, orderId: order.id })
    if (it.bundleItems?.length) {
      for (const pid of it.bundleItems) await grantEntitlement(db, { userId: order.userId, productId: pid, orderId: order.id })
    }
  }
}

export async function revokeForOrder(db, order) {
  const pids = []
  for (const it of order.items || []) { pids.push(it.productId); if (it.bundleItems?.length) pids.push(...it.bundleItems) }
  if (pids.length) {
    await db.collection(STORE_COLL.entitlements).updateMany(
      { userId: order.userId, productId: { $in: pids }, orderId: order.id },
      { $set: { revokedAt: new Date() } },
    )
  }
}

export async function adminRevoke(db, userId, productId) {
  await db.collection(STORE_COLL.entitlements).updateOne({ userId, productId }, { $set: { revokedAt: new Date() } })
}

// Per-file download counter. Returns { used, limit, left }.
export function downloadStatus(ent, fileId, limit) {
  const used = (ent?.downloadsUsed && ent.downloadsUsed[fileId]) || 0
  return { used, limit, left: Math.max(0, limit - used) }
}
export async function incrementDownload(db, userId, productId, fileId) {
  await db.collection(STORE_COLL.entitlements).updateOne(
    { userId, productId }, { $inc: { [`downloadsUsed.${fileId}`]: 1 }, $set: { lastDownloadAt: new Date() } },
  )
}
export async function acceptOath(db, userId, productId) {
  await db.collection(STORE_COLL.entitlements).updateOne({ userId, productId }, { $set: { oathAcceptedAt: new Date() } })
}

export async function listLibrary(db, userId) {
  const ents = await db.collection(STORE_COLL.entitlements).find({ userId, revokedAt: null }).sort({ grantedAt: -1 }).toArray()
  const ids = ents.map(e => e.productId)
  const prods = ids.length ? await db.collection(STORE_COLL.products).find({ id: { $in: ids } }).toArray() : []
  const byId = Object.fromEntries(prods.map(p => [p.id, p]))
  const out = ents.map(e => ({ ent: e, product: byId[e.productId] })).filter(x => x.product)
  // Expand owned unit_test_pack entitlements into their member unit tests (dynamic).
  const ownedIds = new Set(ids)
  const packs = out.filter(x => x.product.type === 'unit_test_pack')
  for (const { ent, product } of packs) {
    const scope = product.packScope; if (!scope) continue
    const q = { type: 'unit_test', 'unitTest.class': scope.class, status: { $ne: 'archived' } }
    if (scope.kind === 'subject') q['unitTest.subjectKey'] = scope.subjectKey
    const members = await db.collection(STORE_COLL.products).find(q).toArray()
    for (const m of members) {
      if (ownedIds.has(m.id)) continue
      ownedIds.add(m.id)
      out.push({ ent: { ...ent, productId: m.id, viaPack: product.id }, product: m })
    }
  }
  // Expand owned chapter bundles into their SETS (dynamic — includes sets added later).
  const chapterIds = out.filter(x => x.product.type === 'unit_test').map(x => x.product.id)
  if (chapterIds.length) {
    const sets = await db.collection(STORE_COLL.products).find({ type: 'unit_test_set', parentChapterId: { $in: chapterIds }, status: { $ne: 'archived' } }).sort({ setNo: 1 }).toArray()
    const entByProd = Object.fromEntries(out.map(x => [x.product.id, x.ent]))
    for (const s of sets) {
      if (ownedIds.has(s.id)) continue
      ownedIds.add(s.id)
      const pe = entByProd[s.parentChapterId] || ents[0] || {}
      out.push({ ent: { ...pe, productId: s.id, viaChapter: s.parentChapterId }, product: s })
    }
  }
  return out
}
