// Server component: adds per-product OG/Twitter image (1200×630 cover) so
// WhatsApp / social shares of /store/p/<slug> render an attractive preview.
// The client product page itself lives in ./page.js.

export async function generateMetadata({ params }) {
  const { slug } = await params
  const base = process.env.NEXT_PUBLIC_BASE_URL || ''
  try {
    const res = await fetch(`${base}/api/store/product/${encodeURIComponent(slug)}`, { cache: 'no-store' })
    if (!res.ok) return {}
    const data = await res.json()
    const p = data?.product
    if (!p) return {}
    const title = p.titleEnglish || p.titleOdia || 'LessonGuru Store'
    const img = p.coverOgUrl || p.coverUrl || null
    const desc = p.shortDesc || p.titleOdia || 'LessonGuru Odisha — answer keys, unit tests & papers'
    return {
      title,
      description: desc,
      openGraph: { title, description: desc, type: 'website', images: img ? [{ url: img, width: 1200, height: 630 }] : [] },
      twitter: { card: 'summary_large_image', title, description: desc, images: img ? [img] : [] },
    }
  } catch {
    return {}
  }
}

export default function ProductLayout({ children }) {
  return children
}
