// === TOB === Admin "sales" layer: Orders, Files tree, Buyers. Read-mostly;
// refund/grant are the only writes (both logged in tobSalesLog). Teacher-
// Observation only — never touches the platform's main store/revenue.
import { v4 as uuidv4 } from 'uuid'
import { TOB_COLL } from '@/lib/tob/store.js'
import { subjectPrinted } from '@/lib/tob/parse.js'

const ENT = 'tobEntitlements'
const ORD = 'tobOrders'
const DL = 'tobDownloads'
const LOG = 'tobSalesLog'

export const maskPhone = (m) => { const s = String(m || '').replace(/\D/g, ''); return s.length >= 4 ? `${s.slice(0, 2)}••••${s.slice(-4)}` : '••••' }

// Parse a SKU → { kind, class, subject, label }
export function skuInfo(sku) {
  const p = String(sku || '').split(':')
  if (p[0] === 'set') return { kind: 'set', class: p[1], subject: p[2], label: `Set ${p[3]} (${p[4] === 'full' ? 'Full year' : 'Term ' + p[4]})` }
  if (p[0] === 'chapter') return { kind: 'chapter', class: p[1], subject: p[2], label: `Chapter ${p[3]}` }
  if (p[0] === 'subjpack') return { kind: 'subjpack', class: p[1], subject: p[2], label: 'Subject pack' }
  if (p[0] === 'classpack') return { kind: 'classpack', class: p[1], subject: '', label: 'Class pack' }
  return { kind: 'other', class: '', subject: '', label: sku }
}
function orderSkus(o) { return o.skus && o.skus.length ? o.skus : (o.sku ? [o.sku] : (o.grants || [])) }

// === Orders list (with teacher + masked phone + item labels) ===
export async function listOrders(db, { search = '', class: cls = '', subject = '', status = '', from = '', to = '', limit = 500 } = {}) {
  const q = {}
  if (status) q.status = status
  if (from || to) { q.createdAt = {}; if (from) q.createdAt.$gte = new Date(from); if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); q.createdAt.$lte = t } }
  const raw = await db.collection(ORD).find(q).sort({ createdAt: -1 }).limit(limit).toArray()
  const userIds = [...new Set(raw.map(o => o.userId).filter(Boolean))]
  const users = await db.collection('users').find({ id: { $in: userIds } }).project({ id: 1, name: 1, mobile: 1 }).toArray()
  const uMap = Object.fromEntries(users.map(u => [u.id, u]))
  const S = String(subject || '').toUpperCase()
  const rows = raw.map(o => {
    const skus = orderSkus(o)
    const infos = skus.map(skuInfo)
    const u = uMap[o.userId] || {}
    return {
      id: o.id, date: o.createdAt, paidAt: o.paidAt || null,
      teacher: u.name || '—', mobileMasked: maskPhone(u.mobile), userId: o.userId,
      items: infos.map(i => i.label).join(', ') || '—',
      classes: [...new Set(infos.map(i => i.class).filter(Boolean))].join(','),
      subjects: [...new Set(infos.map(i => i.subject).filter(Boolean))].join(','),
      isPack: infos.some(i => i.kind === 'subjpack' || i.kind === 'classpack'),
      amount: o.amount || 0, method: o.method || (o.razorpayOrderId ? 'razorpay' : 'qr'), status: o.status || 'created',
      razorpayOrderId: o.razorpayOrderId || null,
      _mobile: String(u.mobile || ''),
    }
  }).filter(r => {
    if (cls && !String(r.classes).split(',').includes(String(cls))) return false
    if (S && !String(r.subjects).split(',').includes(S)) return false
    if (search) { const s = search.toLowerCase(); if (!(`${r.teacher} ${r.items} ${r.id} ${r._mobile}`.toLowerCase().includes(s))) return false }
    return true
  })
  rows.forEach(r => { delete r._mobile })
  const paid = rows.filter(r => r.status === 'paid')
  const summary = {
    total: rows.length, paidCount: paid.length,
    revenue: paid.reduce((s, r) => s + (r.amount || 0), 0),
    packCount: paid.filter(r => r.isPack).length, singleCount: paid.filter(r => !r.isPack).length,
  }
  return { orders: rows, summary }
}

export async function ordersCsv(db, filters) {
  const { orders } = await listOrders(db, { ...filters, limit: 5000 })
  const head = ['Order ID', 'Date', 'Teacher', 'Phone', 'Items', 'Class', 'Subject', 'Amount', 'Payment', 'Status']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [head.join(',')]
  for (const o of orders) lines.push([o.id, new Date(o.date).toISOString().slice(0, 10), o.teacher, o.mobileMasked, o.items, o.classes, o.subjects, o.amount, o.method, o.status].map(esc).join(','))
  return lines.join('\n')
}

// Refund → mark refunded + revoke the entitlements granted by THIS order.
export async function refundOrder(db, orderId, by) {
  const o = await db.collection(ORD).findOne({ id: orderId })
  if (!o) return { ok: false, error: 'Order not found' }
  await db.collection(ORD).updateOne({ id: orderId }, { $set: { status: 'refunded', refundedAt: new Date(), refundedBy: by || null } })
  const del = await db.collection(ENT).deleteMany({ userId: o.userId, orderId })
  await db.collection(LOG).insertOne({ id: uuidv4(), action: 'refund', orderId, userId: o.userId, revoked: del.deletedCount, by: by || null, at: new Date() })
  return { ok: true, revoked: del.deletedCount }
}

// Manual grant → add entitlement + a manual order row + log (with reason).
export async function grantManual(db, { mobile, sku, reason = '', by }) {
  const m = String(mobile || '').replace(/\D/g, '').slice(-10)
  const u = await db.collection('users').findOne({ mobile: { $regex: m + '$' } })
  if (!u) return { ok: false, error: 'No teacher with that mobile' }
  const info = skuInfo(sku)
  if (info.kind === 'other') return { ok: false, error: 'Invalid SKU' }
  const orderId = uuidv4()
  await db.collection(ORD).insertOne({ id: orderId, userId: u.id, sku, amount: 0, status: 'paid', method: 'manual-grant', reason, createdAt: new Date(), paidAt: new Date(), grants: [sku] })
  await db.collection(ENT).updateOne({ userId: u.id, sku }, { $set: { id: uuidv4(), userId: u.id, sku, orderId, grantedAt: new Date(), manual: true } }, { upsert: true })
  await db.collection(LOG).insertOne({ id: uuidv4(), action: 'manual-grant', orderId, userId: u.id, sku, reason, by: by || null, at: new Date() })
  return { ok: true, teacher: u.name || maskPhone(u.mobile), sku, label: info.label }
}

export async function salesLog(db, limit = 100) {
  const rows = await db.collection(LOG).find({}).sort({ at: -1 }).limit(limit).toArray()
  const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))]
  const users = await db.collection('users').find({ id: { $in: userIds } }).project({ id: 1, name: 1, mobile: 1 }).toArray()
  const uMap = Object.fromEntries(users.map(u => [u.id, u]))
  return rows.map(r => ({ ...r, teacher: uMap[r.userId]?.name || maskPhone(uMap[r.userId]?.mobile) }))
}

// === Files tree (per class+subject) with buyers + downloads counts ===
function skuForItem(it) {
  const S = String(it.subject_id).toUpperCase()
  if (it.type === 'set') return `set:${it.class}:${S}:${it.setCode}:${it.term === 'full' || it.term == null ? 'full' : it.term}`
  if (it.type === 'chapter') return `chapter:${it.class}:${S}:${it.chapterNo}`
  return null
}
export async function filesTree(db, { class: cls, subject }) {
  const S = String(subject || '').toUpperCase()
  const items = await db.collection(TOB_COLL.items).find({ class: String(cls), subject_id: S, status: { $ne: 'trashed' } }).toArray()
  // entitlement counts per sku (subject/class packs also unlock items)
  const ents = await db.collection(ENT).find({ sku: { $regex: `:${cls}:` } }).project({ sku: 1 }).toArray()
  const entCount = {}; for (const e of ents) entCount[e.sku] = (entCount[e.sku] || 0) + 1
  const packBuyers = (entCount[`subjpack:${cls}:${S}`] || 0) + (entCount[`classpack:${cls}`] || 0)
  const dls = await db.collection(DL).aggregate([{ $match: { class: String(cls), subject_id: S } }, { $group: { _id: '$sku', n: { $sum: 1 } } }]).toArray().catch(() => [])
  const dlCount = Object.fromEntries((dls || []).map(d => [d._id, d.n]))

  const buckets = { Term1: [], Term2: [], Sets: [], Register: [] }
  for (const it of items) {
    const sku = skuForItem(it)
    const row = {
      id: it.id, type: it.type, title: it.title, term: it.term ?? 'full',
      chapterNo: it.chapterNo, setCode: it.setCode, status: it.status,
      lo: it.validation?.status || (it.type === 'register' ? 'green' : 'green'),
      coverage: it.coverage ? `${it.coverage.covered}/${it.coverage.total}` : '',
      buyers: (sku ? (entCount[sku] || 0) : 0) + packBuyers,
      downloads: sku ? (dlCount[sku] || 0) : 0,
      updatedAt: it.updatedAt || it.createdAt, sku,
    }
    if (it.type === 'register') buckets.Register.push(row)
    else if (it.type === 'set') buckets.Sets.push(row)
    else if (String(it.term) === '2') buckets.Term2.push(row)
    else buckets.Term1.push(row)
  }
  buckets.Term1.sort((a, b) => (a.chapterNo || 0) - (b.chapterNo || 0))
  buckets.Term2.sort((a, b) => (a.chapterNo || 0) - (b.chapterNo || 0))
  buckets.Sets.sort((a, b) => String(a.setCode).localeCompare(String(b.setCode)))
  return { class: String(cls), subject: S, subject_printed: subjectPrinted(S) || S, buckets, totalItems: items.length, packBuyers }
}

// Buyers for one item sku (direct + via pack).
export async function buyersForSku(db, sku) {
  const info = skuInfo(sku)
  const skus = [sku]
  if (info.kind === 'set' || info.kind === 'chapter') { skus.push(`subjpack:${info.class}:${info.subject}`, `classpack:${info.class}`) }
  const ents = await db.collection(ENT).find({ sku: { $in: skus } }).toArray()
  const userIds = [...new Set(ents.map(e => e.userId))]
  const users = await db.collection('users').find({ id: { $in: userIds } }).project({ id: 1, name: 1, mobile: 1 }).toArray()
  const uMap = Object.fromEntries(users.map(u => [u.id, u]))
  const dl = await db.collection(DL).aggregate([{ $match: { sku } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]).toArray().catch(() => [])
  const dlMap = Object.fromEntries((dl || []).map(d => [d._id, d.n]))
  return {
    buyers: ents.map(e => ({ teacher: uMap[e.userId]?.name || '—', mobileMasked: maskPhone(uMap[e.userId]?.mobile), grantedAt: e.grantedAt, via: e.sku === sku ? 'direct' : skuInfo(e.sku).label, downloads: dlMap[e.userId] || 0 }))
      .sort((a, b) => new Date(b.grantedAt) - new Date(a.grantedAt)),
  }
}

// === Revenue (Teacher Observation only) ===
export async function revenueStats(db) {
  const paid = await db.collection(ORD).find({ status: 'paid' }).toArray()
  const now = new Date()
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0)
  const start7 = new Date(startToday); start7.setDate(start7.getDate() - 6)
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const sum = (arr) => arr.reduce((s, o) => s + (o.amount || 0), 0)
  const inRange = (o, from) => new Date(o.createdAt) >= from
  const isPack = (o) => orderSkus(o).map(skuInfo).some(i => i.kind === 'subjpack' || i.kind === 'classpack')
  const total = sum(paid)
  const packOrders = paid.filter(isPack).length
  // daily 30
  const daily = []
  for (let i = 29; i >= 0; i--) { const d = new Date(startToday); d.setDate(d.getDate() - i); const d2 = new Date(d); d2.setDate(d2.getDate() + 1); daily.push({ date: d.toISOString().slice(0, 10), amount: sum(paid.filter(o => new Date(o.createdAt) >= d && new Date(o.createdAt) < d2)) }) }
  // top aggregations
  const byClass = {}, bySubject = {}, byItem = {}
  for (const o of paid) for (const info of orderSkus(o).map(skuInfo)) {
    const share = (o.amount || 0) / Math.max(1, orderSkus(o).length)
    if (info.class) byClass[info.class] = (byClass[info.class] || 0) + share
    if (info.subject) bySubject[info.subject] = (bySubject[info.subject] || 0) + share
    const key = `${info.class}·${info.subject}·${info.label}`
    byItem[key] = (byItem[key] || 0) + share
  }
  const top = (obj, n = 8) => Object.entries(obj).map(([k, v]) => ({ key: k, amount: Math.round(v) })).sort((a, b) => b.amount - a.amount).slice(0, n)
  return {
    cards: {
      today: sum(paid.filter(o => inRange(o, startToday))),
      last7: sum(paid.filter(o => inRange(o, start7))),
      month: sum(paid.filter(o => inRange(o, startMonth))),
      total,
      orders: paid.length,
      avgOrder: paid.length ? Math.round(total / paid.length) : 0,
      pctPack: paid.length ? Math.round(packOrders / paid.length * 100) : 0,
      pctSingle: paid.length ? Math.round((paid.length - packOrders) / paid.length * 100) : 0,
    },
    daily,
    topClasses: top(byClass).map(x => ({ label: `Class ${x.key}`, amount: x.amount })),
    topSubjects: top(bySubject).map(x => ({ label: subjectPrinted(x.key) || x.key, amount: x.amount })),
    topItems: top(byItem, 10).map(x => ({ label: x.key, amount: x.amount })),
  }
}
