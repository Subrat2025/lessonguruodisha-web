import { getDb } from '@/lib/mongodb'
import { seedDatabase } from '@/lib/seed-data'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const SITE_URL = 'https://lessonguruodisha.in'

async function loadBook(slug, bookId) {
  const db = await getDb()
  await seedDatabase(db)
  const cls = await db.collection('classes').findOne({ slug }, { projection: { _id: 0 } })
  if (!cls) return null
  const book = await db.collection('books').findOne({ id: bookId, classId: cls.id }, { projection: { _id: 0 } })
  if (!book) return null
  const chapters = await db.collection('chapters').find({ bookId }).sort({ order: 1 }).project({ _id: 0 }).toArray()
  const lessons = await db.collection('lessons').find({ bookId }).project({ _id: 0, content: 0, teacherNotes: 0, tlm: 0, learningOutcomes: 0, assessmentQuestions: 0, panchapadiSopana: 0, activities: 0, worksheet: 0, homework: 0 }).toArray()
  return { cls, book, chapters, lessons }
}

export async function generateMetadata({ params }) {
  const { slug, bookId } = await params
  const data = await loadBook(slug, bookId)
  if (!data) return { title: 'Book Not Found' }
  const { cls, book, chapters, lessons } = data
  const title = `${book.name} - ${cls.name} Lesson Plans | Odisha Curriculum`
  const description = `Lesson plans for "${book.name}" (${cls.name}) — ${chapters.length} chapters and ${lessons.length} period-wise lessons. NCF-aligned, includes TLM, learning outcomes, assessments. For Odisha teachers.`
  return {
    title, description,
    alternates: { canonical: `${SITE_URL}/class/${slug}/book/${bookId}` },
    openGraph: { title, description, type: 'book' },
    twitter: { card: 'summary_large_image', title, description },
    keywords: [
      `${book.name} lesson plan`, `${book.name} ${cls.name}`,
      `${book.name} Odisha`, `${book.name} teacher`,
      `${cls.name} ${book.name} lesson`, `${book.name} chapter wise lesson plan`,
      ...chapters.slice(0, 8).map(c => `${c.name} lesson plan`),
    ],
  }
}

export default async function BookPage({ params }) {
  const { slug, bookId } = await params
  const data = await loadBook(slug, bookId)
  if (!data) notFound()
  const { cls, book, chapters, lessons } = data

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: cls.name, item: `${SITE_URL}/class/${slug}` },
      { '@type': 'ListItem', position: 3, name: book.name, item: `${SITE_URL}/class/${slug}/book/${bookId}` },
    ],
  }
  const courseJsonLd = {
    '@context': 'https://schema.org', '@type': 'Course',
    name: `${book.name} (${cls.name})`,
    description: `Period-wise lesson plans for ${book.name}, ${cls.name}, aligned with Odisha curriculum and NCF 2023.`,
    provider: { '@type': 'Organization', name: 'Lesson Guru Odisha', sameAs: SITE_URL },
    inLanguage: 'or',
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: `${lessons.length}H`,
    },
    offers: { '@type': 'Offer', category: 'Premium Subscription', price: 99, priceCurrency: 'INR' },
  }

  return (
    <div className="max-w-4xl mx-auto p-6 pb-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }} />

      <nav className="text-xs text-muted-foreground mb-4">
        <Link href="/" className="hover:underline">Home</Link> {' / '}
        <Link href={`/class/${slug}`} className="hover:underline">{cls.name}</Link> {' / '}
        <span>{book.name}</span>
      </nav>

      <header className={`rounded-3xl p-6 text-white bg-gradient-to-br ${book.color} shadow-xl`}>
        <div className="text-5xl">{book.emoji}</div>
        <p className="text-xs uppercase tracking-wider opacity-90 mt-3">{cls.name} • {cls.nameOdia}</p>
        <h1 className="text-3xl sm:text-4xl font-black mt-1 leading-tight">{book.name}</h1>
        <p className="text-sm mt-3 opacity-95">📖 {chapters.length} Chapters • 📝 {lessons.length} Period-wise Lesson Plans</p>
        <Link href="/" className="inline-block mt-4 bg-white text-blue-700 font-bold px-5 py-2.5 rounded-xl">
          🔓 Open Full Lesson Plans →
        </Link>
      </header>

      {chapters.length > 0 && (
        <section className="mt-8">
          <h2 className="text-2xl font-bold mb-3">📚 Chapters in {book.name}</h2>
          <p className="text-sm text-muted-foreground mb-4">All chapters are mapped period-by-period with lesson plans, teacher notes, TLM, learning outcomes, and assessments.</p>
          <ol className="space-y-2">
            {chapters.map((c, i) => {
              const periodCount = lessons.filter(l => l.chapterId === c.id).length
              return (
                <li key={c.id} className="p-4 rounded-2xl border-2 bg-card flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold leading-tight">{c.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{periodCount || c.totalPeriods || 0} period{(periodCount || c.totalPeriods) !== 1 ? 's' : ''}</p>
                  </div>
                  <Link href="/" className="text-xs font-bold text-primary">View →</Link>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section className="mt-8 prose max-w-none">
        <h2 className="text-2xl font-bold">About "{book.name}" — {cls.name} Lesson Plans</h2>
        <p>
          {book.name} is an official Odisha State textbook for {cls.name} ({cls.nameOdia}). On Lesson Guru Odisha,
          you get access to comprehensive, period-wise lesson plans for every chapter of {book.name}, designed specifically for
          Odisha government and private school teachers.
        </p>
        <p>
          Each chapter is broken down into individual periods with detailed teaching steps, Panchapadi Sopana methodology,
          NCF 2023 aligned learning outcomes (with LO codes), Teaching Learning Materials (TLM), classroom activities,
          assessment questions, worksheets, and homework. Subscribe to unlock all {lessons.length} period-wise lesson plans
          for {book.name} starting at just ₹99/month.
        </p>
      </section>
    </div>
  )
}
