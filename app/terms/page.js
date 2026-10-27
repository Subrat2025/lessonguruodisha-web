import Link from 'next/link'

const SITE_URL = 'https://lessonguruodisha.com'

export const metadata = {
  title: 'Terms & Conditions - Lesson Guru Odisha',
  description: 'Terms and conditions for using Lesson Guru Odisha, the premium lesson plan platform for Odisha teachers.',
  alternates: { canonical: `${SITE_URL}/terms` },
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-32">
      <nav className="text-xs text-muted-foreground mb-4"><Link href="/" className="hover:underline">Home</Link> / Terms &amp; Conditions</nav>
      <header className="rounded-3xl p-6 text-white bg-gradient-to-br from-purple-600 to-fuchsia-700 shadow-xl">
        <div className="text-5xl">📜</div>
        <h1 className="text-4xl font-black mt-3">Terms &amp; Conditions</h1>
        <p className="text-sm mt-2 opacity-95">Last updated: 17 June 2025</p>
      </header>
      <article className="prose prose-slate mt-8 max-w-none dark:prose-invert">
        <p>Welcome to <strong>Lesson Guru Odisha</strong>. By accessing or using our website {SITE_URL} or related services, you agree to be bound by the following Terms &amp; Conditions. Please read them carefully.</p>

        <h2>1. Acceptance of Terms</h2>
        <p>By registering an account, subscribing, or otherwise using Lesson Guru Odisha, you accept and agree to be bound by these Terms. If you do not agree, you must not use our services.</p>

        <h2>2. Eligibility</h2>
        <p>Our services are intended exclusively for educators (school teachers, tutors, instructional staff) above the age of 18. By using the platform, you confirm you meet this requirement.</p>

        <h2>3. Account Registration</h2>
        <ul>
          <li>You agree to provide accurate, current, and complete information (name, mobile, password).</li>
          <li>You are responsible for keeping your password confidential.</li>
          <li>You are responsible for all activities under your account.</li>
          <li>Notify us immediately of any unauthorized access.</li>
        </ul>

        <h2>4. Subscription & Payment</h2>
        <ul>
          <li>Plans available: Monthly (₹99), Quarterly (₹249), Yearly (₹499), Lifetime (₹1499).</li>
          <li>Payments are processed securely via <strong>Razorpay</strong>.</li>
          <li>Subscription activates instantly upon successful payment.</li>
          <li>Subscriptions do not auto-renew — you must manually renew.</li>
          <li>Prices may change with prior notice; existing subscriptions are unaffected until expiry.</li>
        </ul>

        <h2>5. Content License & Usage</h2>
        <p>Upon subscribing, you are granted a <strong>limited, non-exclusive, non-transferable, revocable</strong> license to access lesson plans on the Lesson Guru Odisha platform for personal classroom teaching use only. You agree NOT to:</p>
        <ul>
          <li>Download, copy, print, screenshot, or save lesson content</li>
          <li>Share your account credentials with anyone else</li>
          <li>Redistribute, republish, sell, or resell our content</li>
          <li>Use the content for any commercial competing product</li>
          <li>Remove or tamper with the dynamic watermark</li>
          <li>Attempt to circumvent the security/anti-piracy mechanisms</li>
        </ul>
        <p>Violations may result in immediate account termination without refund, plus legal action under the Indian Copyright Act, 1957.</p>

        <h2>6. Intellectual Property</h2>
        <p>All lesson plans, content, design, logos, and trademarks are the property of Lesson Guru Odisha or our licensors. They are protected by Indian and international intellectual property laws.</p>

        <h2>7. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the platform for unlawful purposes</li>
          <li>Attempt to gain unauthorized access (hacking, brute-force, scraping)</li>
          <li>Upload viruses or malicious code</li>
          <li>Impersonate any person or entity</li>
          <li>Harass, abuse, or harm other users or our staff</li>
        </ul>

        <h2>8. Termination</h2>
        <p>We reserve the right to suspend or terminate any account that violates these Terms, with or without prior notice. Termination for cause forfeits any remaining subscription period.</p>

        <h2>9. Disclaimer of Warranties</h2>
        <p>The platform is provided "as is" and "as available". While we strive for accuracy, we do not guarantee that lesson plans will meet every specific classroom requirement. Teachers should always adapt content to their specific students and context.</p>

        <h2>10. Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, Lesson Guru Odisha shall not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the platform. Our total liability is limited to the amount you paid in the preceding 12 months.</p>

        <h2>11. Indemnification</h2>
        <p>You agree to indemnify and hold harmless Lesson Guru Odisha from any claims arising from your breach of these Terms or misuse of the platform.</p>

        <h2>12. Governing Law &amp; Jurisdiction</h2>
        <p>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in <strong>Bhubaneswar, Odisha, India</strong>.</p>

        <h2>13. Changes to Terms</h2>
        <p>We may revise these Terms at any time. Continued use after changes constitutes acceptance of the revised Terms.</p>

        <h2>14. Contact</h2>
        <ul>
          <li>📧 <a href="mailto:support@teacherutilitytoolkit.com">support@teacherutilitytoolkit.com</a></li>
          <li>📱 WhatsApp: <a href="https://wa.me/918093414633" target="_blank" rel="noopener">+91 80934 14633</a></li>
        </ul>

        <p><Link href="/">← Back to Home</Link></p>
      </article>
    </div>
  )
}
