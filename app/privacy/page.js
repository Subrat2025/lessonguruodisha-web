import Link from 'next/link'

const SITE_URL = 'https://lessonguruodisha.in'

export const metadata = {
  title: 'Privacy Policy - Lesson Guru Odisha',
  description: 'Privacy policy of Lesson Guru Odisha. Learn how we collect, use, and protect your personal information.',
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-32">
      <nav className="text-xs text-muted-foreground mb-4"><Link href="/" className="hover:underline">Home</Link> / Privacy Policy</nav>
      <header className="rounded-3xl p-6 text-white bg-gradient-to-br from-emerald-600 to-teal-700 shadow-xl">
        <div className="text-5xl">🔒</div>
        <h1 className="text-4xl font-black mt-3">Privacy Policy</h1>
        <p className="text-sm mt-2 opacity-95">Last updated: 17 June 2025</p>
      </header>
      <article className="prose prose-slate mt-8 max-w-none dark:prose-invert">
        <p>At <strong>Lesson Guru Odisha</strong> ("we", "us", "our"), accessible from {SITE_URL}, the privacy of our users is one of our top priorities. This Privacy Policy document outlines what information we collect, how we use it, and the rights you have regarding your information.</p>

        <h2>1. Information We Collect</h2>
        <p>When you register an account on Lesson Guru Odisha, we collect:</p>
        <ul>
          <li><strong>Full Name</strong> — to personalize your dashboard and watermark lesson plans</li>
          <li><strong>Mobile Number (10 digits)</strong> — used as your unique login identifier</li>
          <li><strong>Encrypted Password</strong> — stored using industry-standard bcrypt hashing (never visible to us)</li>
          <li><strong>Subscription & Payment Records</strong> — transaction IDs, plan, validity dates (processed via Razorpay)</li>
          <li><strong>Usage Data</strong> — lessons viewed, recent activity, favorites (to improve your experience)</li>
          <li><strong>Cloud Library files</strong> — PDFs and documents you save to your Cloud Library (from the Android app or by uploading), kept privately for your account only</li>
        </ul>
        <p>The Android app keeps your daily streak and app preferences on your phone. If the app closes unexpectedly, it can show you an error report, which is sent to us only if you choose to share it on WhatsApp.</p>
        <p>We do <strong>not</strong> collect or store any payment card details — Razorpay handles all payment processing securely.</p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To create and maintain your account</li>
          <li>To validate your active subscription before showing lesson content</li>
          <li>To watermark lesson content with your name & mobile (anti-piracy)</li>
          <li>To send important account-related notifications (no marketing spam)</li>
          <li>To improve content quality based on usage patterns</li>
        </ul>

        <h2>3. Information Sharing</h2>
        <p>We do <strong>not sell, rent, or trade</strong> your personal information to third parties. Your data is shared only with:</p>
        <ul>
          <li><strong>Razorpay</strong> — for processing subscription payments</li>
          <li><strong>Our WhatsApp messaging provider</strong> — your mobile number, to deliver login OTPs and account messages</li>
          <li><strong>Cloud hosting providers</strong> — for serving the platform reliably</li>
          <li><strong>Legal authorities</strong> — only if required by Indian law</li>
        </ul>

        <h2>4. Content Protection & Anti-Piracy</h2>
        <p>To protect our premium content, we implement:</p>
        <ul>
          <li>Dynamic watermarks showing your name, mobile, date & time on every lesson</li>
          <li>Disabled right-click, copy, print, and save shortcuts</li>
          <li>View-only access (no PDF download)</li>
          <li>Session-based authentication</li>
        </ul>
        <p>By creating an account, you accept that any redistribution of our content is strictly prohibited and tracked via watermarking.</p>

        <h2>5. Cookies & Local Storage</h2>
        <p>We use browser <code>localStorage</code> to keep you logged in. We do not use third-party advertising cookies.</p>

        <h2>6. Data Security</h2>
        <p>All passwords are hashed with bcrypt. All connections use HTTPS/TLS. Subscription verification happens server-side to prevent client tampering.</p>

        <h2>7. Children’s Privacy</h2>
        <p>Our platform is intended for educators (adults). We do not knowingly collect information from anyone under 18.</p>

        <h2>8. Your Rights</h2>
        <p>You can request:</p>
        <ul>
          <li>Access to your stored data</li>
          <li>Correction of inaccurate data</li>
          <li>Deletion of your account (subject to retention obligations)</li>
          <li>Export of your account data</li>
        </ul>
        <p>Email <a href="mailto:support@teacherutilitytoolkit.com">support@teacherutilitytoolkit.com</a> with your request.</p>
        <p><strong>Deleting your account:</strong> you can request deletion yourself at <Link href="/delete-account">lessonguruodisha.in/delete-account</Link> or in the Android app (Profile → Delete account). We remove your profile and Cloud Library files within 30 days. Payment records are kept, without your name or number, as Indian tax law requires.</p>

        <h2>9. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. Material changes will be posted on this page with an updated date.</p>

        <h2>10. Contact</h2>
        <ul>
          <li>📧 <a href="mailto:support@teacherutilitytoolkit.com">support@teacherutilitytoolkit.com</a></li>
          <li>📱 WhatsApp: <a href="https://wa.me/918093414633" target="_blank" rel="noopener">+91 80934 14633</a></li>
        </ul>

        <p><Link href="/">← Back to Home</Link></p>
      </article>
    </div>
  )
}
