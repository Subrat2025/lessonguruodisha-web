import Link from 'next/link'
const SITE_URL = 'https://lessonguruodisha.com'
export const metadata = {
  title: 'Sources & Disclaimer - Lesson Guru Odisha',
  description: 'Official sources of the curriculum information used in Lesson Guru Odisha, and our disclaimer: we are not a government app.',
  alternates: { canonical: `${SITE_URL}/sources` },
}

// Only links that open from outside India (checked with check-host.net); Google Play reviews from abroad.
const SOURCES = [
  ['OSEPA (Odisha School Education Programme Authority, Samagra Shiksha)', 'https://osepa.odisha.gov.in', 'Odisha school programmes, curriculum and teacher resources'],
  ['Board of Secondary Education, Odisha', 'https://bseodisha.ac.in', 'Class 9–10 syllabus and examination pattern'],
  ['DIKSHA (Ministry of Education, Government of India)', 'https://diksha.gov.in', 'Official digital textbooks (including Odisha textbooks), NCERT material and Learning Outcomes'],
]

export default function SourcesPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-32">
      <nav className="text-xs text-muted-foreground mb-4"><Link href="/" className="hover:underline">Home</Link> / Sources &amp; Disclaimer</nav>
      <header className="rounded-3xl p-6 text-white bg-gradient-to-br from-slate-600 to-indigo-700 shadow-xl">
        <div className="text-5xl">🏛️</div>
        <h1 className="text-4xl font-black mt-3">Sources &amp; Disclaimer</h1>
        <p className="text-sm mt-2 opacity-95">Last updated: 31 October 2026</p>
      </header>
      <article className="prose prose-slate mt-8 max-w-none dark:prose-invert">
        <div className="not-prose rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-900">
          <b>⚠️ Not a government app.</b> Lesson Guru Odisha is an independent private service by Teacher Utility Tool Kit.
          It does not represent, and is not affiliated with, endorsed by or a service of the Government of Odisha, the Government of India,
          SCERT Odisha, OSEPA, the Board of Secondary Education Odisha, NCERT or any other government body.
        </div>
        <h2>Where our curriculum information comes from</h2>
        <p>Our lesson plans, Panchapadi plans, question papers, assessments and Learning Outcome (LO) codes are prepared by teachers from the
          publicly available curriculum documents and textbooks published by these official sources. Always check the official source for the latest version:</p>
        <ul>
          {SOURCES.map(([name, url, what]) => (
            <li key={url}><b>{name}</b>: <a href={url} target="_blank" rel="noopener noreferrer">{url.replace('https://', '')}</a><br /><span className="text-sm">{what}</span></li>
          ))}
        </ul>
        <h2>Accuracy</h2>
        <p>We try to keep everything correct and up to date, but official circulars, syllabi and textbooks can change. If anything differs, the official source is correct.
          Please tell us about mistakes on WhatsApp <a href="https://wa.me/918093414633" target="_blank" rel="noopener">+91 80934 14633</a> or
          {' '}<a href="mailto:teacherutilitytoolkit@gmail.com">teacherutilitytoolkit@gmail.com</a>.</p>
        <p><Link href="/">← Back to Home</Link></p>
      </article>
    </div>
  )
}
