import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const alt = 'LessonGuru Store product'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OG({ params }) {
  const BASE = process.env.NEXT_PUBLIC_BASE_URL || ''
  let p = null
  try { const r = await fetch(`${BASE}/api/store/product/${params.slug}`, { cache: 'no-store' }); if (r.ok) { const d = await r.json(); p = d.product } } catch {}
  const title = p?.titleOdia || p?.titleEnglish || 'LessonGuru Store'
  const price = p?.pricing?.free ? 'FREE' : p?.pricing ? `₹${p.pricing.price}` : ''
  const sub = [p?.classes?.[0] ? `Class ${p.classes[0]}` : '', p?.subject, p?.exam].filter(Boolean).join('  •  ')
  return new ImageResponse((
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 70, background: 'linear-gradient(135deg, #241a5e, #3b2a8c)', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, color: '#f7b32b', fontWeight: 800 }}>🛍️ LESSONGURU STORE</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {sub ? <div style={{ fontSize: 30, color: '#cbd5e1' }}>{sub}</div> : null}
        <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.1 }}>{title.slice(0, 90)}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: '#e8452c', background: '#fff', borderRadius: 20, padding: '10px 36px' }}>{price}</div>
        <div style={{ fontSize: 26, color: '#cbd5e1' }}>LessonGuru Odisha</div>
      </div>
    </div>
  ), { ...size })
}
