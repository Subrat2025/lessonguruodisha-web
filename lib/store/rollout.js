// === STORE · SETS ROLLOUT (atomic switch + two-restore-point rollback) ===
// Safe, deterministic go-live for the "5 sets per chapter" model, plus a
// reversible rollback with named restore points. ADDITIVE ONLY — this module
// NEVER touches storeOrders, storeEntitlements, payments, users, lessons,
// Panchapadi or the Assessment Store. It only changes store PRODUCT prices,
// set visibility, the per-class pack-price overrides and the `setsLive` flag.
//
// Order of every mutating operation (switch AND restore) is identical & safe:
//   1) VALIDATE everything first (counts + computed prices) — no writes.
//   2) Snapshot the exact current state into a restore point (before 1st write).
//   3) Apply chapter + set + pack prices while sets stay hidden & flag stays off.
//   4) Flip set visibility + setsLive (+ banner, which is derived from the flag).
//   5) VERIFY a sample; on ANY error → auto-rollback to the snapshot & report.
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL as SC, getStoreSettings, saveStoreSettings } from '@/lib/store/security.js'

const RESTORE_COLL = 'storeRestorePoints'
const LOG_COLL = 'storeRolloutLog'
const OVERRIDES_ID = 'default'

const SET_PRICE = 2
const SET_MRP = 5
// Approved exact class-pack prices (admin overrides). Class 4 < Class 3 is intentional
// (price follows chapter count, not class number).
export const CLASS_PACK_OVERRIDES = { '1': 99, '2': 219, '3': 499, '4': 449, '5': 459, '6': 829, '7': 519 }
// Expected live catalogue (for the pre-switch guard).
export const EXPECTED_CHAPTERS_BY_CLASS = { '1': 16, '2': 37, '3': 84, '4': 75, '5': 77, '6': 138, '7': 86 }
export const EXPECTED_SETS_TOTAL = 2563

const round = (n) => Math.round(n)
const subjectPackPrice = (chapters) => Math.max(5, round(chapters * 10 * 0.75)) // round(ch×₹10×0.75), min ₹5

// ---------------- snapshot ----------------
// Capture EVERYTHING the switch/restore can change, so a restore is exact.
export async function captureSnapshot(db) {
  const settings = await getStoreSettings(db)
  const prods = await db.collection(SC.products)
    .find({ type: { $in: ['unit_test', 'unit_test_set', 'unit_test_pack'] } })
    .project({ id: 1, type: 1, priceInr: 1, mrpInr: 1, launchPriceInr: 1, visibility: 1, priceCustomized: 1, packScope: 1, unitTest: 1 })
    .toArray()
  const ov = await db.collection('storePricingOverrides').findOne({ id: OVERRIDES_ID }, { projection: { _id: 0 } })
  const products = prods.map(p => ({
    id: p.id, type: p.type,
    priceInr: p.priceInr ?? null, mrpInr: p.mrpInr ?? null, launchPriceInr: p.launchPriceInr ?? null,
    visibility: p.visibility || 'public', priceCustomized: !!p.priceCustomized,
  }))
  return {
    setsLive: settings.setsLive === true,
    classPackOverrides: ov?.classPacks || {},
    products,
    counts: {
      chapters: prods.filter(p => p.type === 'unit_test').length,
      sets: prods.filter(p => p.type === 'unit_test_set').length,
      packs: prods.filter(p => p.type === 'unit_test_pack').length,
      setsVisible: prods.filter(p => p.type === 'unit_test_set' && (p.visibility || 'public') === 'public').length,
    },
  }
}

// ---------------- restore points ----------------
export async function saveRestorePoint(db, { label, kind = 'manual', adminId = null, note = '', snapshot = null } = {}) {
  snapshot = snapshot || await captureSnapshot(db)
  const doc = {
    id: uuidv4(), label, kind, note, createdAt: new Date(), createdBy: adminId, snapshot,
    summary: {
      setsLive: snapshot.setsLive,
      chapters: snapshot.counts.chapters, sets: snapshot.counts.sets, packs: snapshot.counts.packs,
      setsVisible: snapshot.counts.setsVisible,
    },
  }
  await db.collection(RESTORE_COLL).insertOne(doc)
  const { _id, ...clean } = doc
  return clean
}

// list without the heavy products array
export async function listRestorePoints(db) {
  const rows = await db.collection(RESTORE_COLL)
    .find({}, { projection: { _id: 0, 'snapshot.products': 0 } })
    .sort({ createdAt: -1 }).limit(50).toArray()
  return rows
}

export async function getRestorePoint(db, id) {
  return db.collection(RESTORE_COLL).findOne({ id }, { projection: { _id: 0 } })
}

// ---------------- plan (dry-run, NO writes) ----------------
// Target prices for every chapter / set / pack per the approved spec.
export async function computeSwitchPlan(db) {
  const chapters = await db.collection(SC.products).find({ type: 'unit_test', status: { $ne: 'archived' } })
    .project({ id: 1, unitTest: 1, priceInr: 1, mrpInr: 1, titleOdia: 1 }).toArray()
  const sets = await db.collection(SC.products).find({ type: 'unit_test_set', status: { $ne: 'archived' } })
    .project({ id: 1, priceInr: 1, mrpInr: 1, visibility: 1 }).toArray()
  const packs = await db.collection(SC.products).find({ type: 'unit_test_pack', status: { $ne: 'archived' } })
    .project({ id: 1, packScope: 1, priceInr: 1, mrpInr: 1, titleOdia: 1 }).toArray()

  const chByCls = {}, chBySub = {}
  for (const c of chapters) {
    const cls = String(c.unitTest?.class), sk = c.unitTest?.subjectKey
    chByCls[cls] = (chByCls[cls] || 0) + 1
    chBySub[`${cls}|${sk}`] = (chBySub[`${cls}|${sk}`] || 0) + 1
  }

  const chapterPlan = chapters.map(c => {
    const pages = c.unitTest?.pageCount || 5
    return { id: c.id, title: c.titleOdia, from: c.priceInr, to: pages * SET_PRICE, fromMrp: c.mrpInr, toMrp: pages * SET_MRP }
  })
  const setPlan = { count: sets.length, to: SET_PRICE, toMrp: SET_MRP }

  const warnings = []
  const packPlan = packs.map(pk => {
    const cls = String(pk.packScope?.class)
    const sk = pk.packScope?.subjectKey
    let to, sep
    if (pk.packScope?.kind === 'class') {
      sep = (chByCls[cls] || 0) * 10
      to = CLASS_PACK_OVERRIDES[cls] != null ? Number(CLASS_PACK_OVERRIDES[cls]) : Math.max(9, round(sep * 0.6))
    } else {
      const ch = chBySub[`${cls}|${sk}`] || 0
      sep = ch * 10
      to = subjectPackPrice(ch)
      if (to >= sep && sep > 0) warnings.push({ id: pk.id, kind: 'subject', cls, subjectKey: sk, price: to, separately: sep, msg: `subject pack ${cls}|${sk} ₹${to} not below separately ₹${sep}` })
    }
    return { id: pk.id, title: pk.titleOdia, kind: pk.packScope?.kind, cls, subjectKey: sk, from: pk.priceInr, to, separately: sep }
  })

  return {
    chByCls, chaptersCount: chapters.length, setsCount: sets.length, packsCount: packs.length,
    chapterPlan, setPlan, packPlan, warnings,
  }
}

// ---------------- low-level price writer (deterministic, logs history) ----------------
async function applyTargetPrices(db, plan, adminId) {
  const now = new Date()
  const ops = []
  const logs = []
  const push = (id, type, fromPrice, toPrice, fromMrp, toMrp, extraSet = {}) => {
    if (fromPrice === toPrice && fromMrp === toMrp && !Object.keys(extraSet).length) return
    ops.push({ updateOne: { filter: { id }, update: { $set: { priceInr: toPrice, mrpInr: toMrp, updatedAt: now, ...extraSet } } } })
    logs.push({ id: uuidv4(), productId: id, type, oldPrice: fromPrice, newPrice: toPrice, oldMrp: fromMrp, newMrp: toMrp, at: now, by: adminId || null, reason: 'sets-rollout-switch' })
  }
  for (const c of plan.chapterPlan) push(c.id, 'unit_test', c.from, c.to, c.fromMrp, c.toMrp)
  // sets: all to SET_PRICE/SET_MRP
  const setDocs = await db.collection(SC.products).find({ type: 'unit_test_set', status: { $ne: 'archived' } }).project({ id: 1, priceInr: 1, mrpInr: 1 }).toArray()
  for (const s of setDocs) push(s.id, 'unit_test_set', s.priceInr, SET_PRICE, s.mrpInr, SET_MRP)
  // packs
  for (const pk of plan.packPlan) {
    const extra = pk.kind === 'class' ? { priceCustomized: true, 'packMeta.chapters': plan.chByCls[pk.cls] || 0, 'packMeta.separately': pk.separately } : { 'packMeta.chapters': (pk.separately || 0) / 10, 'packMeta.separately': pk.separately }
    // fromMrp unknown here for packs (not fetched in plan) → read current
    const cur = await db.collection(SC.products).findOne({ id: pk.id }, { projection: { mrpInr: 1 } })
    push(pk.id, 'unit_test_pack', pk.from, pk.to, cur?.mrpInr ?? null, pk.separately, extra)
  }
  let modified = 0
  for (let i = 0; i < ops.length; i += 500) {
    if (!ops.slice(i, i + 500).length) continue
    const r = await db.collection(SC.products).bulkWrite(ops.slice(i, i + 500), { ordered: false })
    modified += (r.modifiedCount || 0)
  }
  if (logs.length) { for (let i = 0; i < logs.length; i += 500) await db.collection('storePriceHistory').insertMany(logs.slice(i, i + 500)) }
  return { modified, logged: logs.length }
}

async function verifyState(db, { wantSetsLive, sampleChapterPrice, sampleSetPrice } = {}) {
  const settings = await getStoreSettings(db)
  const problems = []
  if (wantSetsLive != null && (settings.setsLive === true) !== wantSetsLive) problems.push(`setsLive expected ${wantSetsLive} got ${settings.setsLive === true}`)
  if (wantSetsLive === true) {
    const ch = await db.collection(SC.products).findOne({ type: 'unit_test', status: { $ne: 'archived' } }, { projection: { priceInr: 1 } })
    if (ch && sampleChapterPrice != null && ch.priceInr !== sampleChapterPrice) problems.push(`sample chapter price ${ch.priceInr} != ${sampleChapterPrice}`)
    const st = await db.collection(SC.products).findOne({ type: 'unit_test_set', status: { $ne: 'archived' } }, { projection: { priceInr: 1, visibility: 1 } })
    if (st) {
      if (sampleSetPrice != null && st.priceInr !== sampleSetPrice) problems.push(`sample set price ${st.priceInr} != ${sampleSetPrice}`)
      if (st.visibility !== 'public') problems.push(`sample set not public (${st.visibility})`)
    }
    // class pack overrides
    for (const [cls, val] of Object.entries(CLASS_PACK_OVERRIDES)) {
      const cp = await db.collection(SC.products).findOne({ type: 'unit_test_pack', 'packScope.kind': 'class', 'packScope.class': cls }, { projection: { priceInr: 1 } })
      if (cp && cp.priceInr !== val) problems.push(`class ${cls} pack ₹${cp.priceInr} != ₹${val}`)
    }
  }
  return { ok: problems.length === 0, problems }
}

async function logRollout(db, entry) {
  try { await db.collection(LOG_COLL).insertOne({ id: uuidv4(), at: new Date(), ...entry }) } catch (_) {}
}

// ---------------- ATOMIC SWITCH (go-live step c) ----------------
export async function runAtomicSwitch(db, { adminId = null, expectSets = EXPECTED_SETS_TOTAL, expectChaptersByClass = EXPECTED_CHAPTERS_BY_CLASS, force = false } = {}) {
  const log = []
  // 1) VALIDATE (no writes)
  const plan = await computeSwitchPlan(db)
  const mismatchCls = []
  for (const [cls, n] of Object.entries(expectChaptersByClass)) {
    const actual = plan.chByCls[cls] || 0
    if (actual !== n) mismatchCls.push({ cls, expected: n, actual })
  }
  if (mismatchCls.length && !force) return { ok: false, stage: 'validate', reason: 'chapter_count_mismatch', mismatchCls, chByCls: plan.chByCls }
  if (plan.setsCount !== expectSets && !force) return { ok: false, stage: 'validate', reason: 'set_count_mismatch', expected: expectSets, actual: plan.setsCount }
  if (plan.warnings.length) return { ok: false, stage: 'validate', reason: 'pack_price_not_below_separately', warnings: plan.warnings }

  // 2) SNAPSHOT "Before sets switch" — BEFORE the first write
  const before = await saveRestorePoint(db, { label: 'Before sets switch', kind: 'pre_switch', adminId, note: 'Auto-saved by atomic switch' })
  log.push(`pre_switch restore point saved: ${before.id}`)

  try {
    // 3) class-pack overrides persisted (so admin UI + future applyPricing agree)
    await db.collection('storePricingOverrides').updateOne({ id: OVERRIDES_ID }, { $set: { classPacks: CLASS_PACK_OVERRIDES, updatedAt: new Date() } }, { upsert: true })
    // 4) apply prices while sets still hidden & flag still off
    const priced = await applyTargetPrices(db, plan, adminId)
    log.push(`prices applied: ${priced.modified} products, ${priced.logged} history rows`)
    // 5) flip visibility + setsLive LAST (banner text is derived from setsLive on the client)
    const vis = await db.collection(SC.products).updateMany({ type: 'unit_test_set', visibility: { $ne: 'public' }, status: { $ne: 'archived' } }, { $set: { visibility: 'public', updatedAt: new Date() } })
    log.push(`sets made visible: ${vis.modifiedCount}`)
    await saveStoreSettings(db, { setsLive: true }, { id: adminId })
    log.push('setsLive = true')
    // 6) VERIFY
    const verify = await verifyState(db, { wantSetsLive: true, sampleChapterPrice: 10, sampleSetPrice: SET_PRICE })
    if (!verify.ok) throw new Error('post-switch verify failed: ' + JSON.stringify(verify.problems))
    // 7) "Approved prices <date>" restore point
    const approved = await saveRestorePoint(db, { label: 'Approved prices ' + new Date().toISOString().slice(0, 10), kind: 'approved', adminId, note: 'Post-switch state' })
    await logRollout(db, { action: 'switch', ok: true, adminId, beforeId: before.id, approvedId: approved.id, priced: priced.modified, setsVisible: vis.modifiedCount })
    return { ok: true, before, approved, priced, setsVisible: vis.modifiedCount, verify, log }
  } catch (e) {
    // AUTO-ROLLBACK to the pre-switch snapshot
    const full = await getRestorePoint(db, before.id)
    const rb = await restoreSnapshot(db, full.snapshot, { adminId, reason: 'auto-rollback after switch error: ' + String(e.message || e) })
    await logRollout(db, { action: 'switch', ok: false, adminId, error: String(e.message || e), autoRolledBack: true, restoreModified: rb.productsModified })
    return { ok: false, stage: 'apply', error: String(e.message || e), rolledBack: true, restore: rb, log }
  }
}

// ---------------- RESTORE (rollback to a snapshot) ----------------
// Applies a snapshot with the same safety ordering as the switch.
export async function restoreSnapshot(db, snapshot, { adminId = null, reason = '' } = {}) {
  const now = new Date()
  // 1) restore class-pack overrides
  await db.collection('storePricingOverrides').updateOne({ id: OVERRIDES_ID }, { $set: { classPacks: snapshot.classPackOverrides || {}, updatedAt: now } }, { upsert: true })
  // 2) restore every product's prices + visibility + priceCustomized (bulk)
  const ops = snapshot.products.map(p => ({
    updateOne: { filter: { id: p.id }, update: { $set: { priceInr: p.priceInr, mrpInr: p.mrpInr, launchPriceInr: p.launchPriceInr, visibility: p.visibility, priceCustomized: p.priceCustomized, updatedAt: now } } },
  }))
  let modified = 0
  for (let i = 0; i < ops.length; i += 500) {
    const slice = ops.slice(i, i + 500)
    if (!slice.length) continue
    const r = await db.collection(SC.products).bulkWrite(slice, { ordered: false })
    modified += (r.modifiedCount || 0)
  }
  // 3) flip setsLive LAST
  await saveStoreSettings(db, { setsLive: snapshot.setsLive === true }, { id: adminId })
  await logRollout(db, { action: 'restore', adminId, reason, setsLive: snapshot.setsLive === true, productsModified: modified })
  return { ok: true, productsModified: modified, setsLive: snapshot.setsLive === true }
}

export async function restoreById(db, id, { adminId = null } = {}) {
  const rp = await getRestorePoint(db, id)
  if (!rp) return { ok: false, reason: 'restore_point_not_found' }
  // Safety snapshot of the current state before restoring (so a restore is itself reversible)
  const safety = await saveRestorePoint(db, { label: 'Auto-saved before restore', kind: 'auto_before_restore', adminId, note: `Before restoring "${rp.label}"` })
  try {
    const res = await restoreSnapshot(db, rp.snapshot, { adminId, reason: `restore to "${rp.label}" (${id})` })
    const verify = await verifyState(db, { wantSetsLive: rp.snapshot.setsLive === true, sampleChapterPrice: rp.snapshot.setsLive ? 10 : null, sampleSetPrice: rp.snapshot.setsLive ? SET_PRICE : null })
    return { ok: true, restored: rp.label, kind: rp.kind, ...res, verify, safetyPointId: safety.id }
  } catch (e) {
    return { ok: false, error: String(e.message || e), safetyPointId: safety.id }
  }
}

// Dry-run diff for the "Preview restore" button: what would change (old → new).
export async function previewRestore(db, id) {
  const rp = await getRestorePoint(db, id)
  if (!rp) return { ok: false, reason: 'restore_point_not_found' }
  const cur = await db.collection(SC.products)
    .find({ type: { $in: ['unit_test', 'unit_test_set', 'unit_test_pack'] } })
    .project({ id: 1, type: 1, priceInr: 1, visibility: 1, titleOdia: 1, packScope: 1 }).toArray()
  const byId = Object.fromEntries(cur.map(p => [p.id, p]))
  const snapById = Object.fromEntries(rp.snapshot.products.map(p => [p.id, p]))
  const settings = await getStoreSettings(db)
  const diffs = []
  for (const p of cur) {
    const s = snapById[p.id]
    if (!s) continue
    const priceChanged = (p.priceInr ?? null) !== (s.priceInr ?? null)
    const visChanged = (p.visibility || 'public') !== (s.visibility || 'public')
    if (priceChanged || visChanged) {
      diffs.push({
        id: p.id, type: p.type, title: p.titleOdia || p.id,
        packKind: p.packScope?.kind || null, cls: p.packScope?.class || p.packScope?.class,
        priceFrom: p.priceInr ?? null, priceTo: s.priceInr ?? null,
        visFrom: p.visibility || 'public', visTo: s.visibility || 'public',
      })
    }
  }
  return {
    ok: true, restorePoint: { id: rp.id, label: rp.label, kind: rp.kind, createdAt: rp.createdAt },
    setsLive: { from: settings.setsLive === true, to: rp.snapshot.setsLive === true },
    totalChanges: diffs.length,
    byType: {
      chapters: diffs.filter(d => d.type === 'unit_test').length,
      sets: diffs.filter(d => d.type === 'unit_test_set').length,
      packs: diffs.filter(d => d.type === 'unit_test_pack').length,
    },
    packChanges: diffs.filter(d => d.type === 'unit_test_pack'),
    sample: diffs.slice(0, 40),
  }
}
