import Link from 'next/link'
const SITE_URL = 'https://lessonguruodisha.com'
export const metadata = {
  title: 'Contact Us - Lesson Guru Odisha',
  description: 'Contact Lesson Guru Odisha for support, payments and refunds.',
  alternates: { canonical: `${SITE_URL}/contact` },
}
export default function Page() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-32">
      <nav className="text-xs text-muted-foreground mb-4"><Link href="/" className="hover:underline">Home</Link> / Contact Us</nav>
      <header className="rounded-3xl p-6 text-white bg-gradient-to-br from-sky-500 to-indigo-600 shadow-xl">
        <div className="text-5xl">📞</div>
        <h1 className="text-4xl font-black mt-3">Contact Us</h1>
        <p className="text-sm mt-2 opacity-95">Last updated: 27 October 2026</p>
      </header>
      <article className="prose prose-slate mt-8 max-w-none dark:prose-invert">
        <p><strong>Lesson Guru Odisha</strong> is an online platform of ready lesson plans, Panchapadi, question papers and teaching tools for Odisha school teachers (Balvatika to Class 10).</p>
        <h2>Get in touch</h2>
        <ul>
          <li>📧 Email: <a href="mailto:teacherutilitytoolkit@gmail.com">teacherutilitytoolkit@gmail.com</a></li>
          <li>📱 WhatsApp / Phone: <a href="https://wa.me/918093414633" target="_blank" rel="noopener">+91 80934 14633</a></li>
          <li>🌐 Website: <a href="https://lessonguruodisha.com">lessonguruodisha.com</a></li>
          <li>📍 Address: Bada Sahi, Kalabada, Chikiti, Ganjam, Odisha – 761010, India</li>
          <li>⏰ Support hours: Monday to Saturday, 10:00 AM – 6:00 PM IST. We reply within 2 business days.</li>
        </ul>
        <h2>Payments and subscriptions</h2>
        <p>For help with a payment, Premium access or a refund, write to us with your registered mobile number and the Razorpay payment ID. See our <Link href="/refund">Refund &amp; Cancellation Policy</Link>.</p>
        <h2>More</h2>
        <ul>
          <li><Link href="/about">About Us</Link></li>
          <li><Link href="/terms">Terms &amp; Conditions</Link></li>
          <li><Link href="/privacy">Privacy Policy</Link></li>
          <li><Link href="/shipping">Shipping &amp; Delivery Policy</Link></li>
        </ul>
        <p><Link href="/">← Back to Home</Link></p>
      </article>
    </div>
  )
}
