import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Lesson Guru Odisha - Premium Lesson Plans for Teachers'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #2563EB 0%, #6366F1 50%, #7C3AED 100%)',
          padding: 60,
          color: '#fff',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(251, 191, 36, 0.2)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(236, 72, 153, 0.25)', filter: 'blur(40px)' }} />

        {/* Top brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 72 }}>🎓</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, opacity: 0.9 }}>Lesson Guru</div>
            <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1 }}>Odisha</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(255,255,255,0.2)', padding: '8px 18px', borderRadius: 99, fontSize: 22, fontWeight: 700 }}>
            ⭐ 12,500+ Teachers
          </div>
        </div>

        {/* Main heading */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 60, flex: 1 }}>
          <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>
            Premium Lesson Plans
          </div>
          <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1, color: '#FCD34D' }}>
            for Odisha Teachers
          </div>
          <div style={{ fontSize: 32, marginTop: 24, opacity: 0.95, display: 'flex', alignItems: 'center' }}>
            📚 Balvatika → Class 10 • All 85+ Official Books
          </div>
        </div>

        {/* Bottom badges */}
        <div style={{ display: 'flex', gap: 16, marginTop: 40 }}>
          {['📖 Lesson Plans', '🎯 LO Codes', '📝 Assessments', '🎨 TLM'].map((t) => (
            <div key={t} style={{ background: 'rgba(255,255,255,0.18)', padding: '14px 26px', borderRadius: 16, fontSize: 24, fontWeight: 700, display: 'flex' }}>{t}</div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 24, opacity: 0.9 }}>
          <div>🇮🇳 lessonguruodisha.in</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>From ₹99/month</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
