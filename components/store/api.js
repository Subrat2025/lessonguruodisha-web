// === STORE === client-side API helpers + small utilities (browser only).
export const BASE = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE_URL) || ''
export const API = `${BASE}/api`

export const COLORS = {
  indigo: '#241a5e', coral: '#e8452c', saffron: '#f7b32b', green: '#2a9d5c', sky: '#1fa2d9', pink: '#d6336c',
}
export const CLASS_COLORS = ['#e8452c', '#1fa2d9', '#2a9d5c', '#f7b32b', '#d6336c', '#241a5e', '#0ea5e9', '#7c3aed', '#059669', '#db2777']
export function classColor(cls) { const n = parseInt(String(cls).replace(/\D/g, '')) || 1; return CLASS_COLORS[(n - 1) % CLASS_COLORS.length] }
export function money(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}` }

export function getToken() { try { return typeof window !== 'undefined' ? localStorage.getItem('em_token') : null } catch { return null } }
export function requireLogin(returnTo) {
  try { localStorage.setItem('store_return', returnTo || window.location.pathname + window.location.search) } catch {}
  // Prefer the in-page WhatsApp OTP popup (mounted by the store layout); fall back
  // to the main login page only if the popup mount isn't present.
  try {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('store:login-request'))
      return
    }
  } catch {}
  window.location.href = '/'
}

async function req(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {}
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const t = auth ? getToken() : null
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined })
  let data = {}; try { data = await res.json() } catch {}
  if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; e.data = data; throw e }
  return data
}
export const sget = (p) => req(p, { method: 'GET' })
export const spost = (p, body) => req(p, { method: 'POST', body })
export const sput = (p, body) => req(p, { method: 'PUT', body })
export const sdel = (p) => req(p, { method: 'DELETE' })

export function loadRazorpay() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    if (window.Razorpay) return resolve(true)
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true); s.onerror = () => resolve(false); document.body.appendChild(s)
  })
}

// Download a secured file: get a 5-min token, then stream from /store/download.
export async function secureDownload(productId, fileId) {
  const { token } = await spost(`/store/file/${productId}/${fileId}/token?action=download`, {})
  const t = getToken()
  const res = await fetch(`${API}/store/download?token=${encodeURIComponent(token)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
  if (!res.ok) { let e = {}; try { e = await res.json() } catch {}; throw new Error(e.error || 'Download failed') }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const m = cd.match(/filename="?([^";]+)"?/); const name = m ? m[1] : 'download'
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export function previewUrl(productId, idx = 0) { return `${API}/store/preview/${productId}/${idx}` }
export function viewImageUrl(productId, fileId, page = 1) { const t = getToken(); return `${API}/store/view/${productId}/${fileId}?page=${page}${t ? `&t=${encodeURIComponent(t)}` : ''}` }

// ===================== GUEST CART (logged-out browsing) =====================
// Logged-out teachers can browse and build a cart in localStorage. Login is
// only required at "Buy / Pay / Checkout"; the guest cart is then merged into
// their server-side cart (see mergeGuestCart()).
const GUEST_CART_KEY = 'store_guest_cart'
export function guestCartGet() { try { return JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]') } catch { return [] } }
function guestCartSave(arr) { try { localStorage.setItem(GUEST_CART_KEY, JSON.stringify(arr)); window.dispatchEvent(new Event('guestcart')) } catch {} }
export function guestCartIds() { return guestCartGet().map(x => x.id) }
export function guestCartCount() { return guestCartGet().length }
export function guestCartAdd(item) {
  if (!item || !item.id) return guestCartGet()
  const arr = guestCartGet()
  if (!arr.find(x => x.id === item.id)) arr.push({ id: item.id, titleOdia: item.titleOdia || '', titleEnglish: item.titleEnglish || '', price: Number(item.price || 0), free: !!item.free })
  guestCartSave(arr); return arr
}
export function guestCartRemove(id) { const arr = guestCartGet().filter(x => x.id !== id); guestCartSave(arr); return arr }
export function guestCartClear() { try { localStorage.removeItem(GUEST_CART_KEY); window.dispatchEvent(new Event('guestcart')) } catch {} }

// Build a snapshot usable by guestCartAdd from a product-ish object.
export function cartSnapshot(p) {
  return { id: p.id, titleOdia: p.titleOdia || p.chapterTitle || '', titleEnglish: p.titleEnglish || '', price: Number(p?.pricing?.price ?? p?.price ?? 0), free: !!(p?.pricing?.free ?? p?.free) }
}

// Smart add-to-cart: server when logged-in, guest localStorage otherwise.
export async function addToCartSmart(product) {
  if (getToken()) { await spost('/store/cart/add', { productId: product.id }); return { guest: false } }
  guestCartAdd(cartSnapshot(product)); return { guest: true }
}

// After login, push any guest-cart items into the server cart, then clear it.
export async function mergeGuestCart() {
  if (!getToken()) return 0
  const ids = guestCartIds(); if (!ids.length) return 0
  for (const id of ids) { try { await spost('/store/cart/add', { productId: id }) } catch {} }
  guestCartClear(); return ids.length
}

// ===================== WHATSAPP SUPPORT =====================
export const SUPPORT_WHATSAPP = '918093414633'
export function waHelpUrl(message) {
  const text = encodeURIComponent(message || 'ନମସ୍କାର, ମୋର LessonGuru Store ସମ୍ବନ୍ଧୀୟ ସାହାଯ୍ୟ ଦରକାର।')
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`
}
