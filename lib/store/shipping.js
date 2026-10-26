// === STORE === shipping interface (NOT integrated). Leave a clean seam for a
// courier API (e.g. Shiprocket) later. For now: quote from admin rules only.
import { getStoreSettings } from '@/lib/store/security.js'

// Flat delivery charge (admin rule). District/PIN rules can extend this later.
export async function getShippingQuote(db, { district, pin, copies } = {}) {
  const s = await getStoreSettings(db)
  const flat = Number(s.flatDeliveryInr) || 60
  return { deliveryInr: flat, rule: 'flat' }
}

// Placeholder — a real courier integration would create a shipment here.
export async function createCourierShipment(/* db, shipment */) {
  return { ok: false, integrated: false, message: 'Courier API not integrated yet' }
}
