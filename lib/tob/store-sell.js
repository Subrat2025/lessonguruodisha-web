// === TOB === Phase-2 "sell" layer for Teacher Observation sets + chapters.
// Reuses the platform Razorpay keys (getRzp) + HMAC verify from the store.
// Paywall is DB-controlled and default OFF → when OFF everything is free and
// the register behaves exactly like today. Entitlements live in tobEntitlements.
//
// Pricing model (June 2025):
//  • Admin sets SELLING prices only (set-term / set-full / chapter / subject-pack
//    / class-pack). Global defaults + optional per class+subject override.
//  • MRP (the struck-through "real total") is COMPUTED automatically:
//      - set MRP = its own fixed MRP (term 15 / full 25), chapter MRP = 10
//      - subject-pack MRP = Σ of its singles' SELLING prices
//        (e.g. 10 full-year sets × 15 + 14 chapters × 5 = ₹220)
//      - class-pack MRP = Σ of its subject-pack SELLING prices
//  • Class pack is shown ONLY when the class has 2+ subjects with content
//    AND the class-pack price is lower than the sum of its subject packs.
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getRzp } from '@/lib/store/orders.js'
import { TOB_COLL } from '@/lib/tob/store.js'
import { subjectPrinted } from '@/lib/tob/parse.js'
import { frameworkFor, stageForClass } from '@/lib/tob/validate.js'

// Compact marks line for the store (published items show framework values — the
// same "effective marks" the teacher app uses). Component subjects (AE/PE) return
// their labelled split + a separate performance box; academic returns written/project.
function marksView(cls, S, item) {
  const fw = frameworkFor(stageForClass(cls), S)
  if (fw.kind === 'components') return { components: true, total: fw.total, parts: fw.components.map(c => ({ label: c.label, marks: c.marks })), performance: fw.performance ?? item?.marks?.performance ?? null }
  if (fw.kind === 'unset') return { frameworkUnset: true, total: item?.marks?.total ?? 25 }
  if (!fw.marks) return { none: true }
  return { total: fw.total, written: fw.written, project: fw.project, diary: fw.diary || 0 }
}

const RZP_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || ''
const CFG_COLL = 'settings'
const ENT = 'tobEntitlements'
const ORD = 'tobOrders'

// Fixed single MRPs (setTermMrp / setFullMrp / chapterMrp) are not editable:
// they only drive the per-item struck-through price. Admin edits the SELLING
// numbers (setTerm / setFull / chapter / subjectPack / classPack).
const DEFAULT_PRICES = { setTerm: 15, setTermMrp: 15, setFull: 25, setFullMrp: 25, chapter: 10, chapterMrp: 10, subjectPack: 199, classPack: 499 }
// Only these keys are admin-editable selling prices (global + per override).
export const EDITABLE_PRICE_KEYS = ['setTerm', 'setFull', 'chapter', 'subjectPack', 'classPack']

// === config (with D: DB-error guard → treat paywall as OFF) ===
// freeClasses = optional per-class "keep free" exception list. Even when the
// GLOBAL paywall switch is ON, any class whose id is in this list stays free
// (used e.g. to keep a newly-launched class free for a week).
export async function getSellConfig(db) {
  try {
    const doc = await db.collection(CFG_COLL).findOne({ key: 'tob_sell' })
    const v = doc?.value || {}
    return {
      paywallOn: v.paywallOn === true,
      prices: { ...DEFAULT_PRICES, ...(v.prices || {}) },
      overrides: (v.overrides && typeof v.overrides === 'object') ? v.overrides : {},
      freeClasses: Array.isArray(v.freeClasses) ? v.freeClasses.map(String) : [],
    }
  } catch (e) {
    // If the paid-mode setting cannot be read, fail safe to OFF (free for all).
    return { paywallOn: false, prices: { ...DEFAULT_PRICES }, overrides: {}, freeClasses: [] }
  }
}

// Effective paid status for ONE class: global switch ON *and* not on the
// per-class "keep free" exception list. This is the single source of truth
// used by the catalog, the register lock and checkout.
export function isClassPaid(cfg, cls) {
  if (!cfg?.paywallOn) return false
  return !(cfg.freeClasses || []).map(String).includes(String(cls))
}
function sanitizeFreeClasses(input) {
  if (!Array.isArray(input)) return undefined
  return [...new Set(input.map(x => String(x).trim()).filter(Boolean))]
}

function sanitizePrices(input = {}) {
  const out = {}
  for (const k of EDITABLE_PRICE_KEYS) {
    if (input[k] != null && input[k] !== '') { const n = Math.max(0, Math.round(Number(input[k]))); if (Number.isFinite(n)) out[k] = n }
  }
  return out
}
function sanitizeOverrides(input = {}) {
  const out = {}
  for (const key of Object.keys(input || {})) {
    const p = sanitizePrices(input[key] || {})
    if (Object.keys(p).length) out[key] = p
  }
  return out
}

export async function setSellConfig(db, { paywallOn, prices, overrides, freeClasses }, by) {
  const cur = await getSellConfig(db)
  const nextFree = sanitizeFreeClasses(freeClasses)
  const next = {
    paywallOn: typeof paywallOn === 'boolean' ? paywallOn : cur.paywallOn,
    prices: { ...cur.prices, ...sanitizePrices(prices || {}) },
    overrides: overrides != null ? sanitizeOverrides(overrides) : cur.overrides,
    freeClasses: nextFree != null ? nextFree : cur.freeClasses,
  }
  await db.collection(CFG_COLL).updateOne({ key: 'tob_sell' }, { $set: { key: 'tob_sell', value: next, updatedAt: new Date(), updatedBy: by || null } }, { upsert: true })
  return next
}

// Build a DRAFT config object (not persisted) from unsaved admin input, so the
// admin screen can show a live preview line before saving.
function draftConfig({ paywallOn, prices, overrides, freeClasses }) {
  return {
    paywallOn: paywallOn === true,
    prices: { ...DEFAULT_PRICES, ...sanitizePrices(prices || {}) },
    overrides: sanitizeOverrides(overrides || {}),
    freeClasses: sanitizeFreeClasses(freeClasses) || [],
  }
}

// === price resolution (global defaults ← per class+subject override) ===
const ckey = (cls, subj) => `${cls}:${String(subj || '').toUpperCase()}`   // subject-level override
const cckey = (cls) => `${cls}:`                                           // class-level (classPack) override
function effPrices(cfg, cls, subj) {
  const o = (cfg.overrides && cfg.overrides[ckey(cls, subj)]) || {}
  return { ...cfg.prices, ...o }
}
function classPackPrice(cfg, cls) {
  const o = (cfg.overrides && cfg.overrides[cckey(cls)]) || {}
  return o.classPack != null ? o.classPack : cfg.prices.classPack
}

const termKey = (t) => (t === '1' || t === 1) ? '1' : (t === '2' || t === 2) ? '2' : 'full'
export function setSku(cls, subj, setCode, term) { return `set:${cls}:${String(subj).toUpperCase()}:${setCode}:${termKey(term)}` }
export function chapterSku(cls, subj, chapterNo) { return `chapter:${cls}:${String(subj).toUpperCase()}:${chapterNo}` }
export function subjectPackSku(cls, subj) { return `subjpack:${cls}:${String(subj).toUpperCase()}` }
export function classPackSku(cls) { return `classpack:${cls}` }

function setPrice(p, term) { return termKey(term) === 'full' ? { price: p.setFull, mrp: p.setFullMrp } : { price: p.setTerm, mrp: p.setTermMrp } }

// === ownership ===
export async function ownedSkus(db, userId) {
  if (!userId) return new Set()
  const rows = await db.collection(ENT).find({ userId }).project({ sku: 1 }).toArray()
  return new Set(rows.map(r => r.sku))
}
export function isSetOwned(owned, cls, subj, setCode, term) {
  const S = String(subj).toUpperCase()
  return owned.has(setSku(cls, S, setCode, term)) || owned.has(subjectPackSku(cls, S)) || owned.has(classPackSku(cls))
}
export function isChapterOwned(owned, cls, subj, chapterNo) {
  const S = String(subj).toUpperCase()
  return owned.has(chapterSku(cls, S, chapterNo)) || owned.has(subjectPackSku(cls, S)) || owned.has(classPackSku(cls))
}

// Count sets (distinct) + chapters for a class+subject from published items.
function countSingles(pub, cls, subj) {
  const S = String(subj).toUpperCase()
  const mine = pub.filter(i => i.class === String(cls) && String(i.subject_id).toUpperCase() === S)
  const sets = new Set(mine.filter(x => x.type === 'set' && x.setCode).map(x => x.setCode))
  const chapters = mine.filter(x => x.type === 'chapter').length
  return { nSets: sets.size, nChapters: chapters }
}
// Subject-pack MRP = Σ singles' SELLING prices (full-year set price + chapter price).
function subjectPackMrp(ep, nSets, nChapters) { return nSets * ep.setFull + nChapters * ep.chapter }

// === catalog for the store page (+ computed MRPs + what the user owns) ===
export async function buildSellCatalog(db, { class: cls, subject, userId, isAdmin }) {
  const cfg = await getSellConfig(db)
  return _catalog(db, cfg, { class: cls, subject, userId, isAdmin })
}

// Admin live preview: compute the exact catalog numbers from UNSAVED input.
export async function previewSell(db, { class: cls, subject, paywallOn, prices, overrides, freeClasses }) {
  const cfg = draftConfig({ paywallOn, prices, overrides, freeClasses })
  return _catalog(db, cfg, { class: cls, subject, userId: null })
}

async function _catalog(db, cfg, { class: cls, subject, userId, isAdmin }) {
  const owned = await ownedSkus(db, userId)
  const pub = await db.collection(TOB_COLL.items).find({ status: 'published' }).project({ class: 1, subject_id: 1, subject_printed: 1, type: 1, setCode: 1, chapterNo: 1, term: 1, title: 1, id: 1, coverage: 1, marks: 1, updatedAt: 1, createdAt: 1 }).toArray()
  // Sample cache-bust token = item version (updatedAt epoch). Matches download.js
  // sampleVer(): when an item is replaced/re-imported its updatedAt bumps, the
  // token changes, and the 7-day-immutable sample URL fetches the fresh image.
  const sampleVer = (i) => new Date(i?.updatedAt || i?.createdAt || 0).getTime()
  const classes = [...new Set(pub.map(i => i.class))].sort()
  const subjectsByClass = {}
  for (const i of pub) { (subjectsByClass[i.class] ||= {})[i.subject_id] = i.subject_printed || subjectPrinted(i.subject_id) || i.subject_id }
  const subjects = Object.entries(subjectsByClass[cls] || {}).map(([id, name]) => ({ id, name }))
  const ep = effPrices(cfg, cls, subject)

  let sets = [], chapters = []
  if (cls && subject) {
    const S = String(subject).toUpperCase()
    const mine = pub.filter(i => i.class === String(cls) && String(i.subject_id).toUpperCase() === S)
    const setMap = {}
    for (const i of mine.filter(x => x.type === 'set' && x.setCode)) {
      const t = termKey(i.term)
      ;(setMap[i.setCode] ||= { setCode: i.setCode, terms: {} }).terms[t] = { itemId: i.id, v: sampleVer(i), title: i.title, coverage: i.coverage, marks: marksView(cls, S, i), ...setPrice(ep, t), owned: isSetOwned(owned, cls, S, i.setCode, t) }
    }
    sets = Object.values(setMap).sort((a, b) => a.setCode.localeCompare(b.setCode))
    chapters = mine.filter(x => x.type === 'chapter').map(i => ({
      itemId: i.id, v: sampleVer(i), chapterNo: i.chapterNo, term: termKey(i.term), title: i.title, coverage: i.coverage, marks: marksView(cls, S, i),
      sku: chapterSku(cls, S, i.chapterNo), price: ep.chapter, mrp: ep.chapterMrp, owned: isChapterOwned(owned, cls, S, i.chapterNo),
    })).sort((a, b) => (a.chapterNo || 0) - (b.chapterNo || 0))
  }

  // Packs
  let packs = null
  if (cls && subject) {
    const S = String(subject).toUpperCase()
    const { nSets, nChapters } = countSingles(pub, cls, S)
    const nReg = pub.filter(i => i.type === 'register' && i.class === String(cls) && String(i.subject_id).toUpperCase() === S).length
    const subjPackMrp = subjectPackMrp(ep, nSets, nChapters)
    // #3: a pack must never cost >= the real sum of its published singles.
    // If it does, hide it on the store and surface a warning for the admin.
    const subjPackBad = !(subjPackMrp > ep.subjectPack)
    const savings = Math.max(0, subjPackMrp - ep.subjectPack)
    const pctOff = subjPackMrp > 0 ? Math.round(savings / subjPackMrp * 100) : 0
    const subjectPack = { sku: subjectPackSku(cls, S), price: ep.subjectPack, mrp: subjPackMrp, singles: nSets + nChapters, savings, pctOff, contents: { chapters: nChapters, sets: nSets, register: nReg }, owned: owned.has(subjectPackSku(cls, S)) || owned.has(classPackSku(cls)), per: nSets ? Math.round(ep.subjectPack / nSets) : null, hidden: subjPackBad, warning: subjPackBad ? `Pack ₹${ep.subjectPack} is not cheaper than the published singles (₹${subjPackMrp}). Lower the pack price or publish more items.` : null }

    // Class pack — Σ of subject-pack selling prices; show only if 2+ subjects with content
    // AND the class pack is cheaper than buying each subject pack.
    const classSubjects = Object.keys(subjectsByClass[cls] || {})
    const cpMrp = classSubjects.reduce((sum, sid) => sum + effPrices(cfg, cls, sid).subjectPack, 0)
    const cpPrice = classPackPrice(cfg, cls)
    const showClassPack = classSubjects.length >= 2 && cpPrice < cpMrp
    const classPack = showClassPack ? { sku: classPackSku(cls), price: cpPrice, mrp: cpMrp, subjects: classSubjects.length, owned: owned.has(classPackSku(cls)) } : null
    packs = { subjectPack, classPack }
  }

  return { paywallOn: cls ? isClassPaid(cfg, cls) : cfg.paywallOn, globalPaywallOn: cfg.paywallOn, isAdmin: !!isAdmin, freeClass: cls ? (cfg.freeClasses || []).map(String).includes(String(cls)) : false, prices: ep, classes, subjects, class: cls || null, subject: subject ? String(subject).toUpperCase() : null, sets, chapters, packs }
}

// Resolve a SKU → { kind, title, amount(₹), grants:[skus] }
export async function resolveSku(db, sku) {
  const cfg = await getSellConfig(db)
  const p = sku.split(':')
  if (p[0] === 'set') { const [, cls, subj, setCode, term] = p; const pr = setPrice(effPrices(cfg, cls, subj), term); return { kind: 'set', title: `Set ${setCode} (${term === 'full' ? 'Full Year' : 'Term ' + term})`, amount: pr.price, grants: [sku] } }
  if (p[0] === 'chapter') { const [, cls, subj, chapterNo] = p; return { kind: 'chapter', title: `Chapter ${chapterNo}`, amount: effPrices(cfg, cls, subj).chapter, grants: [sku] } }
  if (p[0] === 'subjpack') { const [, cls, subj] = p; return { kind: 'subjpack', title: `Subject pack — all sets + chapters`, amount: effPrices(cfg, cls, subj).subjectPack, grants: [sku] } }
  if (p[0] === 'classpack') { const [, cls] = p; return { kind: 'classpack', title: `Class pack — all subjects`, amount: classPackPrice(cfg, cls), grants: [sku] } }
  return null
}

async function grant(db, userId, skus, orderId) {
  for (const sku of skus) {
    await db.collection(ENT).updateOne({ userId, sku }, { $set: { id: uuidv4(), userId, sku, orderId, grantedAt: new Date() } }, { upsert: true })
  }
}

// True if the teacher already owns `sku` directly OR via a pack that covers it.
export function alreadyOwned(owned, sku) {
  if (owned.has(sku)) return true
  const p = String(sku).split(':'); const kind = p[0], cls = p[1], subj = p[2]
  if (kind === 'set' || kind === 'chapter' || kind === 'register') return owned.has(`subjpack:${cls}:${subj}`) || owned.has(`classpack:${cls}`)
  if (kind === 'subjpack') return owned.has(`classpack:${cls}`)
  return false
}

// Checkout: skip if already owned; free/test path when paywall OFF (for that class) or amount 0; else a Razorpay order.
export async function checkoutSku(db, user, { sku }) {
  const cfg = await getSellConfig(db)
  const r = await resolveSku(db, sku)
  if (!r) return { error: 'Unknown item' }
  const owned = await ownedSkus(db, user.id)
  if (alreadyOwned(owned, sku)) return { owned: true, message: 'ଆପଣ ଏହା ପୂର୍ବରୁ କିଣିଛନ୍ତି' }
  const cls = String(sku).split(':')[1]
  const orderId = uuidv4()
  if (!isClassPaid(cfg, cls) || r.amount <= 0) {
    await db.collection(ORD).insertOne({ id: orderId, userId: user.id, sku, amount: r.amount, status: 'paid', method: 'free', createdAt: new Date(), paidAt: new Date() })
    await grant(db, user.id, r.grants, orderId)
    return { free: true, orderId, granted: r.grants }
  }
  const rzp = getRzp()
  if (!rzp) return { error: 'Payments not configured' }
  const rzpOrder = await rzp.orders.create({ amount: Math.round(r.amount * 100), currency: 'INR', receipt: orderId, notes: { kind: 'tob', sku, userId: user.id } })
  await db.collection(ORD).insertOne({ id: orderId, userId: user.id, sku, amount: r.amount, grants: r.grants, status: 'created', razorpayOrderId: rzpOrder.id, createdAt: new Date() })
  return { orderId, razorpayOrderId: rzpOrder.id, amount: rzpOrder.amount, currency: 'INR', keyId: RZP_KEY_ID, title: r.title }
}

// Multi-item cart checkout — one order grants every sku. Free path when the
// class is not paid or the total is 0; else a single combined Razorpay order.
export async function checkoutCart(db, user, { skus = [] }) {
  const cfg = await getSellConfig(db)
  const list = [...new Set((skus || []).filter(Boolean))]
  if (!list.length) return { error: 'Cart is empty' }
  const owned = await ownedSkus(db, user.id)
  const toBuy = list.filter(s => !alreadyOwned(owned, s))
  if (!toBuy.length) return { owned: true, message: 'ସବୁ ଆଇଟମ୍ ପୂର୍ବରୁ କିଣାଯାଇଛି' }
  const resolved = []
  for (const sku of toBuy) { const r = await resolveSku(db, sku); if (r) resolved.push({ sku, ...r }) }
  if (!resolved.length) return { error: 'Unknown items' }
  const cls = String(resolved[0].sku).split(':')[1]
  const amount = resolved.reduce((s, r) => s + (r.amount || 0), 0)
  const grants = [...new Set(resolved.flatMap(r => r.grants))]
  const orderId = uuidv4()
  if (!isClassPaid(cfg, cls) || amount <= 0) {
    await db.collection(ORD).insertOne({ id: orderId, userId: user.id, skus: toBuy, amount, status: 'paid', method: 'free', createdAt: new Date(), paidAt: new Date() })
    await grant(db, user.id, grants, orderId)
    return { free: true, orderId, granted: grants }
  }
  const rzp = getRzp()
  if (!rzp) return { error: 'Payments not configured' }
  const rzpOrder = await rzp.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt: orderId, notes: { kind: 'tob-cart', userId: user.id, items: toBuy.length } })
  await db.collection(ORD).insertOne({ id: orderId, userId: user.id, skus: toBuy, amount, grants, status: 'created', razorpayOrderId: rzpOrder.id, createdAt: new Date() })
  return { orderId, razorpayOrderId: rzpOrder.id, amount: rzpOrder.amount, currency: 'INR', keyId: RZP_KEY_ID, title: `${toBuy.length} items` }
}

export async function verifyTob(db, { razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return { error: 'Missing payment fields' }
  const expected = crypto.createHmac('sha256', RZP_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex')
  if (expected !== razorpay_signature) return { error: 'Invalid signature' }
  const order = await db.collection(ORD).findOne({ razorpayOrderId: razorpay_order_id })
  if (!order) return { error: 'Order not found' }
  if (order.status !== 'paid') {
    await db.collection(ORD).updateOne({ id: order.id }, { $set: { status: 'paid', paidAt: new Date(), razorpayPaymentId: razorpay_payment_id } })
    await grant(db, order.userId, order.grants || [order.sku], order.id)
  }
  return { ok: true, granted: order.grants || [order.sku] }
}

// Server-side lock used by the register item-open: returns null if allowed,
// else a { locked, sku } payload. Admins and non-set/chapter are never locked.
export async function lockForItem(db, me, item) {
  const cfg = await getSellConfig(db)
  if (!item || (item.type !== 'set' && item.type !== 'chapter')) return null
  if (!isClassPaid(cfg, item.class)) return null
  if (me?.role === 'admin') return null
  const owned = await ownedSkus(db, me?.id)
  if (item.type === 'set') {
    if (isSetOwned(owned, item.class, item.subject_id, item.setCode, item.term)) return null
    return { locked: true, sku: setSku(item.class, item.subject_id, item.setCode, item.term), class: item.class, subject: item.subject_id }
  }
  // chapters are now individually buyable (also unlocked by subject/class pack)
  if (isChapterOwned(owned, item.class, item.subject_id, item.chapterNo)) return null
  return { locked: true, sku: chapterSku(item.class, item.subject_id, item.chapterNo), class: item.class, subject: item.subject_id }
}
