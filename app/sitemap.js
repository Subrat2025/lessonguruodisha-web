// Next.js built-in sitemap generator - dynamic with all classes + books
import { getDb } from '@/lib/mongodb'
import { seedDatabase } from '@/lib/seed-data'

const SITE_URL = 'https://lessonguruodisha.com'

// Built on request (not at build time): the build has no database access on Render, and a sitemap
// frozen at build time would never show new classes or books.
export const dynamic = 'force-dynamic'
export const revalidate = 3600

export default async function sitemap() {
  const now = new Date()
  let db
  try {
    db = await getDb()
    await seedDatabase(db)
  } catch (e) {
    console.error('[sitemap] database unavailable:', e?.message)
    return [{ url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 }]
  }

  const [classes, books] = await Promise.all([
    db.collection('classes').find({}).project({ _id: 0, slug: 1 }).toArray(),
    db.collection('books').find({}).project({ _id: 0, id: 1, classId: 1 }).toArray(),
  ])

  const staticRoutes = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/refund`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/shipping`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/?view=plans`, lastModified: now, changeFrequency: 'weekly', priority: 0.95 },
    { url: `${SITE_URL}/?view=classes`, lastModified: now, changeFrequency: 'daily', priority: 0.95 },
    { url: `${SITE_URL}/?view=search`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/?view=login`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/?view=register`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
  ]

  // Build classSlug map
  const classMap = {}
  classes.forEach(c => { classMap[c.slug] = c.slug })
  const classBySlugId = {}
  const classes2 = await db.collection('classes').find({}).project({ _id: 0 }).toArray()
  classes2.forEach(c => { classBySlugId[c.id] = c.slug })

  const classRoutes = classes2.map(c => ({
    url: `${SITE_URL}/class/${c.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.9,
  }))

  const bookRoutes = books.map(b => ({
    url: `${SITE_URL}/class/${classBySlugId[b.classId]}/book/${b.id}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.85,
  })).filter(r => r.url.includes('/class/') && !r.url.includes('/undefined/'))

  return [...staticRoutes, ...classRoutes, ...bookRoutes]
}
