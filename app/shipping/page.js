import Link from 'next/link'
const SITE_URL = 'https://lessonguruodisha.com'
export const metadata = {
  title: 'Shipping & Delivery Policy - Lesson Guru Odisha',
  description: 'Lesson Guru Odisha delivers digital subscriptions instantly online. No physical shipping.',
  alternates: { canonical: `${SITE_URL}/shipping` },
}
export default function Page() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-32">
      <nav className="text-xs text-muted-foreground mb-4"><Link href="/" className="hover:underline">Home</Link> / Shipping &amp; Delivery</nav>
      <header className="rounded-3xl p-6 text-white bg-gradient-to-br from-emerald-500 to-teal-600 shadow-xl">
        <div className="text-5xl">🚚</div>
        <h1 className="text-4xl font-black mt-3">Shipping &amp; Delivery Policy</h1>
        <p className="text-sm mt-2 opacity-95">Last updated: 27 October 2026</p>
      </header>
      <article className="prose prose-slate mt-8 max-w-none dark:prose-invert">
        <p>Lesson Guru Odisha sells <strong>digital subscriptions and digital content only</strong> (lesson plans, Panchapadi, question papers, assessments and other teaching resources). <strong>No physical goods are shipped.</strong></p>
        <h2>1. How you receive your purchase</h2>
        <ul>
          <li>Access is given <strong>online, instantly</strong> after successful payment, on the same account (mobile number) used to pay.</li>
          <li>You can use it on <a href="https://lessonguruodisha.com">lessonguruodisha.com</a> and in the Lesson Guru Odisha Android app.</li>
          <li>Downloadable items (PDF / Word) are available from your account as soon as payment succeeds.</li>
        </ul>
        <h2>2. Delivery time</h2>
        <p>Usually within <strong>a few minutes</strong> of payment. In rare cases (bank delays) it can take up to <strong>24 hours</strong>.</p>
        <h2>3. If you did not get access</h2>
        <ol>
          <li>Log out and log in again with the same mobile number.</li>
          <li>If access is still missing after 24 hours, contact us with your registered mobile number and Razorpay payment ID:
            email <a href="mailto:support@teacherutilitytoolkit.com">support@teacherutilitytoolkit.com</a> or WhatsApp <a href="https://wa.me/918093414633" target="_blank" rel="noopener">+91 80934 14633</a>.</li>
          <li>We will activate your access or refund the payment as per our <Link href="/refund">Refund &amp; Cancellation Policy</Link>.</li>
        </ol>
        <h2>4. Shipping charges</h2>
        <p>None. All products are delivered digitally at no extra cost.</p>
        <p><Link href="/">← Back to Home</Link></p>
      </article>
    </div>
  )
}
