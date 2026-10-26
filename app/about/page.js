import Link from 'next/link'

const SITE_URL = 'https://lessonguruodisha.in'

export const metadata = {
  title: 'About Us - Lesson Guru Odisha',
  description: 'Learn about Lesson Guru Odisha, the premier lesson plan platform for Odisha teachers from Balvatika to Class 10. Our mission, vision, and commitment to Odisha education.',
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: { title: 'About Lesson Guru Odisha', description: 'Premier lesson plan platform for Odisha teachers.', url: `${SITE_URL}/about` },
}

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-32">
      <nav className="text-xs text-muted-foreground mb-4"><Link href="/" className="hover:underline">Home</Link> / About Us</nav>
      <header className="rounded-3xl p-6 text-white bg-gradient-to-br from-blue-600 to-indigo-700 shadow-xl">
        <div className="text-5xl">🎓</div>
        <h1 className="text-4xl font-black mt-3">About Lesson Guru Odisha</h1>
        <p className="text-sm mt-2 opacity-95">Empowering Odisha teachers with premium lesson plans</p>
      </header>

      <article className="prose prose-slate mt-8 max-w-none dark:prose-invert">
        <h2>Our Mission</h2>
        <p>Lesson Guru Odisha is a premium educational platform built exclusively for Odisha teachers. Our mission is to save Odisha educators hours of preparation time every week by providing professionally crafted, NCF-aligned, period-wise lesson plans for every official Odisha curriculum book — from Balvatika to Class 10.</p>

        <h2>Who We Serve</h2>
        <p>We proudly serve over <strong>12,500+ teachers</strong> across Odisha, including educators in:</p>
        <ul>
          <li>Government Upper Primary Schools (UPS)</li>
          <li>Government High Schools</li>
          <li>Odisha Adarsha Vidyalayas (OAVS)</li>
          <li>Private CBSE/State schools across Odisha</li>
          <li>Anganwadi & Balvatika educators</li>
        </ul>

        <h2>What We Offer</h2>
        <ul>
          <li>📚 <strong>85+ official Odisha books</strong> covered — Jasmine, Ganita Mela, Bhasha Mahak, Sahitya Sindhu, Sanskrit Kalika, and many more</li>
          <li>📝 <strong>Period-wise lesson plans</strong> with teacher notes, TLM, and learning outcomes</li>
          <li>🎯 <strong>NCF 2023-aligned LO codes</strong> for every chapter</li>
          <li>🧪 <strong>Assessment questions & worksheets</strong> for every period</li>
          <li>🎨 <strong>Activities & Panchapadi Sopana</strong> teaching methodology</li>
          <li>📱 <strong>Mobile-first platform</strong> — works on any phone, tablet, or computer</li>
        </ul>

        <h2>Our Story</h2>
        <p>Founded in 2025 by a team of Odisha educators and technologists, Lesson Guru Odisha was born from a simple observation: Odisha teachers spend countless hours preparing lesson plans from scratch, often duplicating effort across schools. We saw an opportunity to build a platform that aggregates the best teaching practices, aligned with the official Odisha curriculum, and delivers them to every teacher’s pocket — affordably.</p>
        <p>From a single sample lesson, we have grown into a comprehensive library covering every class, every book, every chapter, and every period of the Odisha curriculum.</p>

        <h2>Why Teachers Choose Us</h2>
        <ul>
          <li>✅ Save 5+ hours of weekly lesson planning</li>
          <li>✅ Affordable plans starting at just ₹99/month</li>
          <li>✅ Mobile-friendly Android-style app</li>
          <li>✅ Available in Odia and English</li>
          <li>✅ Trusted by 12,500+ Odisha teachers</li>
          <li>✅ No download — secure, ad-free, focused experience</li>
        </ul>

        <h2>Contact Us</h2>
        <p>We love hearing from teachers. Reach out anytime:</p>
        <ul>
          <li>📧 Email: <a href="mailto:support@teacherutilitytoolkit.com">support@teacherutilitytoolkit.com</a></li>
          <li>📱 WhatsApp: <a href="https://wa.me/918093414633" target="_blank" rel="noopener">+91 80934 14633</a></li>
          <li>🌐 Website: <a href={SITE_URL}>{SITE_URL.replace('https://','')}</a></li>
          <li>📍 Location: Odisha, India</li>
        </ul>

        <p><Link href="/">← Back to Home</Link></p>
      </article>
    </div>
  )
}
