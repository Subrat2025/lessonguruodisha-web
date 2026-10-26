// === STORE === FUTURE physical printed-paper orders: data model + status
// timeline + student lists (privacy) + admin fulfilment. Teacher screens are
// gated behind store_physical_enabled (default OFF).
import { v4 as uuidv4 } from 'uuid'
import { STORE_COLL } from '@/lib/store/security.js'

export const ODISHA_DISTRICTS = ['Angul', 'Balangir', 'Balasore', 'Bargarh', 'Bhadrak', 'Boudh', 'Cuttack', 'Deogarh', 'Dhenkanal', 'Gajapati', 'Ganjam', 'Jagatsinghpur', 'Jajpur', 'Jharsuguda', 'Kalahandi', 'Kandhamal', 'Kendrapara', 'Kendujhar (Keonjhar)', 'Khordha', 'Koraput', 'Malkangiri', 'Mayurbhanj', 'Nabarangpur', 'Nayagarh', 'Nuapada', 'Puri', 'Rayagada', 'Sambalpur', 'Subarnapur (Sonepur)', 'Sundargarh']

export const SHIPMENT_STEPS = ['Ordered', 'Confirmed', 'Printing', 'Packed', 'Shipped', 'Out for delivery', 'Delivered']

export async function listAddresses(db, userId) { return db.collection(STORE_COLL.addresses).find({ userId }).sort({ updatedAt: -1 }).toArray() }
export async function saveAddress(db, userId, body) {
  const now = new Date()
  if (body.id) { const { id, ...rest } = body; await db.collection(STORE_COLL.addresses).updateOne({ id, userId }, { $set: { ...rest, updatedAt: now } }); return db.collection(STORE_COLL.addresses).findOne({ id, userId }) }
  const doc = { id: uuidv4(), userId, name: body.name || '', mobile: body.mobile || '', school: body.school || '', line1: body.line1 || '', line2: body.line2 || '', village: body.village || '', block: body.block || '', district: body.district || '', pin: String(body.pin || ''), landmark: body.landmark || '', createdAt: now, updatedAt: now }
  await db.collection(STORE_COLL.addresses).insertOne(doc); return doc
}
export function validPin(pin) { return /^[1-9][0-9]{5}$/.test(String(pin || '')) }

export async function createPhysicalOrder(db, user, { productId, copies, addressId, perCopyInr, deliveryInr, orderId }) {
  const now = new Date()
  const total = (Number(perCopyInr) || 0) * (Number(copies) || 0) + (Number(deliveryInr) || 0)
  const ship = {
    id: uuidv4(), orderId: orderId || null, userId: user.id, productId, copies: Number(copies) || 0,
    addressId, perCopyInr: Number(perCopyInr) || 0, deliveryInr: Number(deliveryInr) || 0, total,
    status: 'Ordered', courier: null, trackingNumber: null, trackingUrl: null, expectedDelivery: null,
    timeline: [{ step: 'Ordered', at: now }], createdAt: now, updatedAt: now,
  }
  await db.collection(STORE_COLL.shipments).insertOne(ship)
  return ship
}

export async function updateShipmentStatus(db, shipmentId, { status, courier, trackingNumber, trackingUrl, expectedDelivery, adminId }) {
  const ship = await db.collection(STORE_COLL.shipments).findOne({ id: shipmentId })
  if (!ship) return null
  const set = { updatedAt: new Date() }
  if (status) set.status = status
  if (courier !== undefined) set.courier = courier
  if (trackingNumber !== undefined) set.trackingNumber = trackingNumber
  if (trackingUrl !== undefined) set.trackingUrl = trackingUrl
  if (expectedDelivery !== undefined) set.expectedDelivery = expectedDelivery
  const push = status ? { timeline: { step: status, at: new Date(), by: adminId || null } } : null
  await db.collection(STORE_COLL.shipments).updateOne({ id: shipmentId }, push ? { $set: set, $push: push } : { $set: set })
  return db.collection(STORE_COLL.shipments).findOne({ id: shipmentId })
}

export async function saveStudentList(db, { shipmentId, userId, rows }) {
  const clean = (rows || []).filter(r => r && (r.name || r.roll)).map(r => ({ roll: String(r.roll || ''), name: String(r.name || ''), section: String(r.section || '') }))
  const doc = { id: uuidv4(), shipmentId, userId, count: clean.length, rows: clean, createdAt: new Date() }
  await db.collection(STORE_COLL.studentLists).insertOne(doc)
  return { id: doc.id, count: doc.count }
}

// Student lists auto-delete 30 days after delivery (keep only the count).
export async function autoDeleteStudentLists(db) {
  const cutoff = new Date(Date.now() - 30 * 864e5)
  const delivered = await db.collection(STORE_COLL.shipments).find({ status: 'Delivered', updatedAt: { $lte: cutoff } }).toArray()
  let purged = 0
  for (const s of delivered) {
    const lists = await db.collection(STORE_COLL.studentLists).find({ shipmentId: s.id, rows: { $exists: true, $ne: [] } }).toArray()
    for (const l of lists) { await db.collection(STORE_COLL.studentLists).updateOne({ id: l.id }, { $set: { rows: [], purgedAt: new Date() } }); purged++ }
  }
  return purged
}
