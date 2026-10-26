// ============================================================================
//  lib/recovery-export.js — Subscription Recovery export (CSV + Excel).
//  Pure data + file builders; the route wires auth. Respects the same filters
//  as the recovery list (bucket / plan / contact / search) and adds a date-type
//  range (Expiry / Renewed / Contacted) evaluated in IST.
// ============================================================================
import ExcelJS from 'exceljs'

const DAY = 86400000
const LIFETIME = new Date('2099-01-01')
const IST_OFFSET = '+05:30'

// Parse a YYYY-MM-DD as an IST day boundary → UTC Date. `end=true` → 23:59:59.999.
export function istBoundary(ymd, end = false) {
  if (!ymd) return null
  const t = end ? '23:59:59.999' : '00:00:00.000'
  const dt = new Date(`${ymd}T${t}${IST_OFFSET}`)
  return isNaN(dt) ? null : dt
}

// Format a Date → IST YYYY-MM-DD (empty string if null).
export function istDateStr(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  const ist = new Date(dt.getTime() + 5.5 * 3600 * 1000)
  return ist.toISOString().slice(0, 10)
}

function bucketRange(b, now) {
  if (b === '1-7') return { $gt: new Date(now - 7 * DAY), $lte: now }
  if (b === '8-30') return { $gt: new Date(now - 30 * DAY), $lte: new Date(now - 8 * DAY) }
  if (b === '31-60') return { $gt: new Date(now - 60 * DAY), $lte: new Date(now - 31 * DAY) }
  if (b === '61-90') return { $gt: new Date(now - 90 * DAY), $lte: new Date(now - 61 * DAY) }
  if (b === '90+') return { $lte: new Date(now - 90 * DAY) }
  return null
}

// Build the export rows. params: { bucket, plan, contact, search, dateType, from, to }
export async function buildRecoveryRows(d, params) {
  const now = new Date()
  const base = {
    'subscription.plan': { $nin: [null, ''] },
    'subscription.startDate': { $exists: true, $ne: null },
    'subscription.expiryDate': { $lt: LIFETIME, $lte: now },
  }
  const filter = { ...base }
  const br = bucketRange(params.bucket, now)
  if (br) filter['subscription.expiryDate'] = { $lt: LIFETIME, ...br }
  if (params.plan) filter['subscription.plan'] = params.plan
  if (params.search) {
    const rx = new RegExp(String(params.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ name: rx }, { mobile: rx }, { email: rx }]
  }
  const contactedIds = await d.collection('subscriptionContacts').distinct('userId')
  if (params.contact === 'not') filter.id = { $nin: contactedIds }
  else if (params.contact === 'contacted') filter.id = { $in: contactedIds }

  const users = await d.collection('users')
    .find(filter, { projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1, subscription: 1 } })
    .sort({ 'subscription.expiryDate': -1 }).limit(5000).toArray()
  const ids = users.map(u => u.id)

  const [contacts, pendingPays, successPays] = await Promise.all([
    d.collection('subscriptionContacts').aggregate([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: '$userId', count: { $sum: 1 }, last: { $max: '$at' } } },
    ]).toArray(),
    d.collection('payments').distinct('userId', { userId: { $in: ids }, status: 'pending' }),
    d.collection('payments').aggregate([
      { $match: { userId: { $in: ids }, status: 'success' } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: '$userId', amts: { $push: '$amount' }, dates: { $push: '$createdAt' }, lastAmount: { $last: '$amount' }, lastDate: { $max: '$createdAt' } } },
    ]).toArray(),
  ])
  const cMap = new Map(contacts.map(c => [c._id, c]))
  const pendingSet = new Set(pendingPays)
  const pMap = new Map(successPays.map(p => [p._id, p]))

  const dateType = params.dateType || 'expiry'
  const from = istBoundary(params.from, false)
  const to = istBoundary(params.to, true)

  const rows = []
  for (const u of users) {
    const sub = u.subscription || {}
    const exp = sub.expiryDate ? new Date(sub.expiryDate) : null
    const c = cMap.get(u.id)
    const pay = pMap.get(u.id)
    const renewed = pay && (pay.amts || []).length >= 2
    const renewedDate = renewed ? (pay.lastDate ? new Date(pay.lastDate) : null) : null
    const renewedAmount = renewed ? pay.lastAmount ?? null : null
    const lastContacted = c?.last ? new Date(c.last) : null

    // date-type range filter (IST)
    if (from || to) {
      const field = dateType === 'renewed' ? renewedDate : dateType === 'contacted' ? lastContacted : exp
      if (!field) continue
      if (from && field < from) continue
      if (to && field > to) continue
    }

    rows.push({
      name: u.name || '',
      mobile: u.mobile || '',
      plan: sub.plan || '',
      expiryDate: exp,
      daysSinceExpiry: exp ? Math.floor((now - exp) / DAY) : null,
      lastAmountPaid: pay?.lastAmount ?? null,
      contactStatus: (c?.count || 0) > 0 ? 'Contacted' : 'Not contacted',
      lastContactedDate: lastContacted,
      renewalStatus: renewed ? 'Renewed' : (pendingSet.has(u.id) ? 'Payment Pending' : 'Not Renewed'),
      renewedDate,
      renewedAmount,
    })
  }
  return rows
}

const HEADERS = [
  'Name', 'Mobile', 'Plan', 'Expiry date', 'Days since expiry', 'Last amount paid',
  'Contact status', 'Last contacted date', 'Renewal status', 'Renewed date', 'Renewed amount',
]

// CSV with UTF-8 BOM so Odia + Excel open correctly.
export function toCSV(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [HEADERS.map(esc).join(',')]
  for (const r of rows) {
    lines.push([
      r.name, r.mobile, r.plan, istDateStr(r.expiryDate), r.daysSinceExpiry ?? '',
      r.lastAmountPaid ?? '', r.contactStatus, istDateStr(r.lastContactedDate),
      r.renewalStatus, istDateStr(r.renewedDate), r.renewedAmount ?? '',
    ].map(esc).join(','))
  }
  return '\uFEFF' + lines.join('\r\n')
}

// Excel (.xlsx) via exceljs: bold + frozen header row, real date columns, Odia-safe.
export async function toXLSX(rows, meta = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'LessonGuru'
  wb.created = new Date()
  const ws = wb.addWorksheet('Recovery', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Mobile', key: 'mobile', width: 14 },
    { header: 'Plan', key: 'plan', width: 16 },
    { header: 'Expiry date', key: 'expiryDate', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Days since expiry', key: 'daysSinceExpiry', width: 16 },
    { header: 'Last amount paid', key: 'lastAmountPaid', width: 15, style: { numFmt: '#,##0' } },
    { header: 'Contact status', key: 'contactStatus', width: 15 },
    { header: 'Last contacted date', key: 'lastContactedDate', width: 17, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Renewal status', key: 'renewalStatus', width: 15 },
    { header: 'Renewed date', key: 'renewedDate', width: 14, style: { numFmt: 'yyyy-mm-dd' } },
    { header: 'Renewed amount', key: 'renewedAmount', width: 15, style: { numFmt: '#,##0' } },
  ]
  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }
  head.alignment = { vertical: 'middle' }
  head.height = 20
  const toDate = (d) => d ? new Date(d) : null
  for (const r of rows) {
    ws.addRow({
      name: r.name, mobile: r.mobile, plan: r.plan,
      expiryDate: toDate(r.expiryDate), daysSinceExpiry: r.daysSinceExpiry,
      lastAmountPaid: r.lastAmountPaid, contactStatus: r.contactStatus,
      lastContactedDate: toDate(r.lastContactedDate), renewalStatus: r.renewalStatus,
      renewedDate: toDate(r.renewedDate), renewedAmount: r.renewedAmount,
    })
  }
  ws.autoFilter = { from: 'A1', to: 'K1' }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

export async function logExportAudit(d, entry) {
  try {
    await d.collection('recoveryExportAudit').insertOne({
      id: (globalThis.crypto?.randomUUID?.() || String(Date.now())),
      at: new Date(), ...entry,
    })
  } catch (_) { /* non-fatal */ }
}

export { HEADERS }
