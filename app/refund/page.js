import Link from 'next/link'

const SITE_URL = 'https://lessonguruodisha.com'

export const metadata = {
  title: 'Refund & Cancellation Policy - Lesson Guru Odisha',
  description: 'Refund and cancellation policy for Lesson Guru Odisha subscriptions. Clear, fair terms for teachers.',
  alternates: { canonical: `${SITE_URL}/refund` },
}

export default function RefundPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 pb-32">
      <nav className="text-xs text-muted-foreground mb-4"><Link href="/" className="hover:underline">Home</Link> / Refund Policy</nav>
      <header className="rounded-3xl p-6 text-white bg-gradient-to-br from-amber-500 to-orange-600 shadow-xl">
        <div className="text-5xl">💰</div>
        <h1 className="text-4xl font-black mt-3">Refund &amp; Cancellation Policy</h1>
        <p className="text-sm mt-2 opacity-95">Last updated: 17 June 2025</p>
      </header>
      <article className="prose prose-slate mt-8 max-w-none dark:prose-invert">
        <p>At <strong>Lesson Guru Odisha</strong>, we want every teacher to have a positive experience. This Refund &amp; Cancellation Policy explains how refunds work for our subscription plans.</p>

        <h2>1. Free Trial / Preview</h2>
        <p>Before subscribing, you can:</p>
        <ul>
          <li>Browse all class and book listings for free</li>
          <li>Preview the first ~350 characters of any lesson plan</li>
          <li>Read About Us, sample testimonials, and feature list</li>
        </ul>
        <p>We strongly encourage all users to explore the free preview thoroughly before purchasing.</p>

        <h2>2. 7-Day Money-Back Guarantee</h2>
        <p>We offer a <strong>7-day refund window</strong> from the date of your initial subscription purchase, under the following conditions:</p>
        <ul>
          <li>You have viewed <strong>fewer than 5 full lesson plans</strong> during the 7-day window</li>
          <li>You contact us via email or WhatsApp within 7 days of payment</li>
          <li>You provide a brief reason for the refund (helps us improve)</li>
        </ul>
        <p>Refund-eligible cases include:</p>
        <ul>
          <li>Accidental or duplicate payment</li>
          <li>Technical issues preventing access after good-faith troubleshooting</li>
          <li>Content significantly mismatched to expectations (as previewed)</li>
        </ul>

        <h2>3. Non-Refundable Situations</h2>
        <p>Refunds will <strong>not</strong> be granted in these cases:</p>
        <ul>
          <li>After 7 days from the date of purchase</li>
          <li>If you have viewed 5 or more full lesson plans (content already consumed)</li>
          <li>If your account is suspended due to violation of Terms (sharing credentials, scraping, redistributing content, etc.)</li>
          <li>Quarterly, Yearly, and Lifetime plans purchased during sale or discount campaigns (final sale)</li>
          <li>For dissatisfaction unrelated to platform issues (e.g., personal preference)</li>
          <li>Partial period refunds (e.g., refunding 15 days of a monthly plan)</li>
        </ul>

        <h2>4. Refund Process</h2>
        <ol>
          <li>Email <a href="mailto:support@teacherutilitytoolkit.com">support@teacherutilitytoolkit.com</a> or WhatsApp <a href="https://wa.me/918093414633" target="_blank" rel="noopener">+91 80934 14633</a> with subject "Refund Request"</li>
          <li>Include your registered mobile number, Razorpay transaction ID, and reason</li>
          <li>We will review and respond within <strong>2 business days</strong></li>
          <li>If approved, refunds are processed via Razorpay to the original payment method</li>
          <li>Refunds typically reach your bank account within <strong>5–10 business days</strong></li>
        </ol>

        <h2>5. Cancellation</h2>
        <p>Subscriptions do <strong>not</strong> auto-renew. You don’t need to "cancel" — your access simply expires at the end of the paid period unless you manually renew.</p>
        <p>If you wish to delete your account entirely, email <a href="mailto:support@teacherutilitytoolkit.com">support@teacherutilitytoolkit.com</a>.</p>

        <h2>6. Disputes &amp; Chargebacks</h2>
        <p>Before initiating a payment dispute or chargeback with your bank/card, please contact us first. We aim to resolve all genuine issues amicably. Unjustified chargebacks may result in account termination.</p>

        <h2>7. Lifetime Plan Special Notes</h2>
        <p>The Lifetime plan (₹1499) is a one-time payment valid for 99 years. Refund window for Lifetime plans is 7 days with the same conditions above.</p>

        <h2>8. Contact for Refunds</h2>
        <ul>
          <li>📧 Email: <a href="mailto:support@teacherutilitytoolkit.com">support@teacherutilitytoolkit.com</a></li>
          <li>📱 WhatsApp: <a href="https://wa.me/918093414633" target="_blank" rel="noopener">+91 80934 14633</a></li>
          <li>⏰ Response time: Within 2 business days</li>
        </ul>

        <h2>9. Changes to This Policy</h2>
        <p>We may update this Refund Policy from time to time. Existing subscriptions are governed by the policy in effect at the time of purchase.</p>

        <p><Link href="/">← Back to Home</Link></p>
      </article>
    </div>
  )
}
