import { getDb } from '@/lib/mongodb'
import { seedDatabase } from '@/lib/seed-data'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const SITE_URL = 'https://lessonguruodisha.com'

async function loadClass(slug) {
  const db = await getDb()
  await seedDatabase(db)
  const cls = await db.collection('classes').findOne({ slug }, { projection: { _id: 0 } })
  if (!cls) return null
  const books = await db.collection('books').find({ classId: cls.id }).sort({ order: 1 }).project({ _id: 0 }).toArray()
  const chapters = await db.collection('chapters').find({ classId: cls.id }).project({ _id: 0 }).toArray()
  const lessonCount = await db.collection('lessons').countDocuments({ classId: cls.id })
  return { cls, books, chapters, lessonCount }
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const data = await loadClass(slug)
  if (!data) return { title: 'Class Not Found' }
  const { cls, books, lessonCount } = data
  const title = `${cls.name} Lesson Plans - Odisha Curriculum | ${books.length} Books, ${lessonCount}+ Periods`
  const description = `Premium ${cls.name} (${cls.nameOdia}) lesson plans for Odisha teachers. Access ${books.length} official Odisha books: ${books.slice(0, 5).map(b => b.name).join(', ')}${books.length > 5 ? ' and more' : ''}. NCF-aligned, period-wise lesson plans with TLM, learning outcomes, and assessments.`
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/class/${slug}` },
    openGraph: { title, description, url: `${SITE_URL}/class/${slug}`, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    keywords: [
      `${cls.name} lesson plan`, `${cls.name} lesson plan Odisha`,
      `${cls.name} Odia lesson plan`, `${cls.nameOdia} ପାଠ ଯୋଜନା`,
      ...books.slice(0, 8).map(b => `${b.name} lesson plan`),
      `${cls.name} TLM`, `${cls.name} learning outcomes`,
    ],
  }
}

export default async function ClassPage({ params }) {
  const { slug } = await params
  const data = await loadClass(slug)
  if (!data) notFound()
  const { cls, books, chapters, lessonCount } = data

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: cls.name, item: `${SITE_URL}/class/${slug}` },
    ],
  }
  const itemListJsonLd = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: `${cls.name} Books - Odisha Curriculum`,
    numberOfItems: books.length,
    itemListElement: books.map((b, i) => ({
      '@type': 'ListItem', position: i + 1,
      item: { '@type': 'Book', name: b.name, url: `${SITE_URL}/class/${slug}/book/${b.id}`, inLanguage: 'or' }
    })),
  }

  return (
    <div className="max-w-4xl mx-auto p-6 pb-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />

      <nav className="text-xs text-muted-foreground mb-4">
        <Link href="/" className="hover:underline">Home</Link> {' / '} <span>{cls.name}</span>
      </nav>

      <header className={`rounded-3xl p-6 text-white bg-gradient-to-br ${cls.color} shadow-xl`}>
        <div className="text-6xl">{cls.emoji}</div>
        <h1 className="text-4xl font-black mt-3">{cls.name} Lesson Plans</h1>
        <p className="text-xl mt-1 opacity-95">{cls.nameOdia} • ଓଡ଼ିଶା ପାଠ୍ୟକ୍ରମ</p>
        <p className="text-sm mt-3 opacity-90">
          📚 {books.length} Books • 📖 {chapters.length} Chapters • 📝 {lessonCount}+ Period-wise Lessons
        </p>
        <Link href="/" className="inline-block mt-4 bg-white text-blue-700 font-bold px-5 py-2.5 rounded-xl">
          🚀 Open Full Lesson Plans →
        </Link>
      </header>

      <section className="mt-8">
        <h2 className="text-2xl font-bold mb-3">📒 All Official {cls.name} Books</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Aligned with the Odisha State curriculum (BSE/OAVS). Each book includes chapter-wise and period-wise NCF-aligned lesson plans.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {books.map(b => {
            const bookChapterCount = chapters.filter(c => c.bookId === b.id).length
            return (
              <li key={b.id}>
                <Link href={`/class/${slug}/book/${b.id}`} className={`block p-4 rounded-2xl bg-gradient-to-br ${b.color} text-white shadow hover:scale-[1.02] transition`}>
                  <div className="text-3xl">{b.emoji}</div>
                  <p className="font-bold text-lg mt-2 leading-tight">{b.name}</p>
                  <p className="text-xs opacity-90 mt-1">{bookChapterCount} chapter{bookChapterCount !== 1 ? 's' : ''} • View →</p>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-8 prose max-w-none">
        <h2 className="text-2xl font-bold">About {cls.name} Lesson Plans on Lesson Guru Odisha</h2>
        <p>
          Lesson Guru Odisha provides comprehensive, NCF-aligned lesson plans for {cls.name} ({cls.nameOdia}) covering every official Odisha State textbook.
          Our lesson plans are period-wise, include detailed teacher notes, Teaching Learning Materials (TLM), learning outcomes with LO codes,
          assessment questions, worksheets, and homework — everything an Odisha teacher needs to deliver effective, modern classroom instruction.
        </p>
        <p>
          Whether you teach in a government Upper Primary School, a private school, or an Odisha Adarsha Vidyalaya (OAVS), our {cls.name} lesson plans
          are designed to save you hours of preparation time and align with the latest NCF 2023 framework. Pricing starts at just ₹99/month for
          unlimited access across all classes and books.
        </p>
        <h3>What's included with each {cls.name} lesson plan?</h3>
        <ul>
          <li>📌 Period-wise lesson breakdown (typically 8–12 periods per chapter)</li>
          <li>🎯 Learning Outcomes mapped to LO codes</li>
          <li>📝 Teacher Notes for classroom delivery</li>
          <li>🎨 Teaching Learning Materials (TLM) list</li>
          <li>📖 Activities and Panchapadi Sopana approach</li>
          <li>🧠 Assessment questions and worksheets</li>
          <li>🏠 Homework suggestions</li>
        </ul>
      </section>
    </div>
  )
}
