import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from 'next-themes'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://lessonguruodisha.com'
const SITE_NAME = 'Lesson Guru Odisha'
const SITE_DESC = "Odisha's #1 premium lesson plan platform for teachers. Access NCF-aligned lesson plans for Balvatika to Class 10 in Odia, English, Hindi, Mathematics, Science, Social Science & Sanskrit. ଓଡ଼ିଶା ଶିକ୍ଷକଙ୍କ ପାଇଁ ବାଳବାଟିକା ରୁ ଦଶମ ଶ୍ରେଣୀ ପର୍ଯ୍ୟନ୍ତ ସମ୍ପୂର୍ଣ୍ଣ ପାଠ୍ୟକ୍ରମ ଯୋଜନା।"

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Lesson Guru Odisha - Premium Lesson Plans for Odisha Teachers | Balvatika to Class 10',
    template: '%s | Lesson Guru Odisha',
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  generator: 'Next.js',
  keywords: [
    'Odisha lesson plans',
    'ଓଡ଼ିଶା ପାଠ ଯୋଜନା',
    'lesson plan Odisha teachers',
    'Balvatika lesson plan',
    'Class 1 Odia lesson plan',
    'Class 10 Odisha lesson plan',
    'Ganita Mela',
    'Jasmine textbook',
    'Bhasha Mahak',
    'Sahitya Sindhu',
    'Sahitya Surabhi',
    'Sanskrit Kalika',
    'NCERT Odisha',
    'NCF aligned lesson plan',
    'period wise lesson plan Odisha',
    'TLM Odisha',
    'learning outcomes Odisha',
    'ଶିକ୍ଷକ ସହାୟକ',
    'Odisha primary school lesson plan',
    'Odisha government school',
    'ଶିକ୍ଷଣ ଯୋଜନା',
    'BSE Odisha lesson plan',
    'OAVS lesson plan',
    'Odia textbook lesson plan',
    'panchapadi sopana',
    'Lesson Guru Odisha',
  ],
  authors: [{ name: 'Lesson Guru Odisha', url: SITE_URL }],
  creator: 'Lesson Guru Odisha',
  publisher: 'Lesson Guru Odisha',
  category: 'education',
  classification: 'Education / Lesson Plans',
  manifest: '/manifest.json',
  alternates: {
    canonical: SITE_URL,
    languages: {
      'en-IN': SITE_URL,
      'or-IN': SITE_URL,
      'x-default': SITE_URL,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    alternateLocale: ['or_IN'],
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'Lesson Guru Odisha - Premium Lesson Plans for Odisha Teachers',
    description: SITE_DESC,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'Lesson Guru Odisha - Premium Lesson Plan Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@lessonguruod',
    creator: '@lessonguruod',
    title: 'Lesson Guru Odisha - Premium Lesson Plans for Teachers',
    description: SITE_DESC,
    images: [`${SITE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'kLDeFqbdpARt5aA-AjFrDcNTWw1j1V_yiId205EJtpM',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Lesson Guru Odisha',
    startupImage: ['/icon-512.png'],
  },
  formatDetection: {
    telephone: false,
  },
  referrer: 'origin-when-cross-origin',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
    'application-name': 'Lesson Guru Odisha',
    'msapplication-TileColor': '#FF8A00',
    'msapplication-TileImage': '/icon-192.png',
  },
}

export const viewport = {
  themeColor: '#FF8A00',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

const jsonLdOrganization = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: 'Lesson Guru Odisha',
  alternateName: ['LessonGuru Odisha', 'Lesson Guru Odisha Premium', 'ଲେସନ ଗୁରୁ ଓଡ଼ିଶା'],
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  description: SITE_DESC,
  address: {
    '@type': 'PostalAddress',
    addressRegion: 'Odisha',
    addressCountry: 'IN',
  },
  sameAs: [],
  areaServed: { '@type': 'State', name: 'Odisha' },
  inLanguage: ['en', 'or'],
}

const jsonLdWebsite = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESC,
  inLanguage: ['en-IN', 'or-IN'],
  potentialAction: {
    '@type': 'SearchAction',
    target: `${SITE_URL}/?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
}

const jsonLdProduct = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'Lesson Guru Odisha Premium',
  description: 'Premium subscription for Odisha curriculum lesson plans from Balvatika to Class 10',
  provider: { '@type': 'Organization', name: SITE_NAME },
  serviceType: 'Educational Subscription',
  areaServed: 'Odisha, India',
  offers: [
    { '@type': 'Offer', name: 'Monthly Plan', price: 99, priceCurrency: 'INR', priceValidUntil: '2026-12-31' },
    { '@type': 'Offer', name: 'Quarterly Plan', price: 249, priceCurrency: 'INR', priceValidUntil: '2026-12-31' },
    { '@type': 'Offer', name: 'Yearly Plan', price: 499, priceCurrency: 'INR', priceValidUntil: '2026-12-31' },
    { '@type': 'Offer', name: 'Lifetime Plan', price: 1499, priceCurrency: 'INR', priceValidUntil: '2030-12-31' },
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    reviewCount: '512',
    bestRating: '5',
    worstRating: '1',
  },
}

const jsonLdFAQ = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Lesson Guru Odisha?',
      acceptedAnswer: { '@type': 'Answer', text: 'Lesson Guru Odisha is a premium subscription platform offering NCF-aligned lesson plans for Odisha government and private school teachers, covering Balvatika to Class 10 across all official Odisha textbooks.' },
    },
    {
      '@type': 'Question',
      name: 'Which classes and books are covered?',
      acceptedAnswer: { '@type': 'Answer', text: 'We cover Balvatika to Class 10 with 85+ official Odisha curriculum books including Jasmine, Ganita Mela, Bhasha Mahak, Sahitya Sindhu, Sahitya Surabhi, Sanskrit Kalika, Hindi Kalika, and many more.' },
    },
    {
      '@type': 'Question',
      name: 'How much does Lesson Guru Odisha cost?',
      acceptedAnswer: { '@type': 'Answer', text: 'Plans start at just ₹99/month, ₹249/quarter, ₹499/year, or ₹1499 lifetime — affordable for every Odisha teacher.' },
    },
    {
      '@type': 'Question',
      name: 'Can I download lesson plans as PDF?',
      acceptedAnswer: { '@type': 'Answer', text: 'No — all lesson plans are view-only inside the secure web platform to protect content. You can access them anytime online with your subscription.' },
    },
    {
      '@type': 'Question',
      name: 'Is the content aligned with NCF and Odisha curriculum?',
      acceptedAnswer: { '@type': 'Answer', text: 'Yes — every lesson plan follows the official Odisha State curriculum and is aligned with NCF 2023 learning outcomes (LO codes), including period-wise teaching plans, TLM, assessments, and worksheets.' },
    },
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <link rel="canonical" href={SITE_URL} />
        <link rel="alternate" hrefLang="en-IN" href={SITE_URL} />
        <link rel="alternate" hrefLang="or-IN" href={SITE_URL} />
        <link rel="alternate" hrefLang="x-default" href={SITE_URL} />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <meta name="theme-color" content="#FF8A00" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Lesson Guru Odisha" />
        <meta name="application-name" content="Lesson Guru Odisha" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#FF8A00" />
        <meta name="msapplication-TileImage" content="/icon-192.png" />
        <meta name="google-site-verification" content="kLDeFqbdpARt5aA-AjFrDcNTWw1j1V_yiId205EJtpM" />
        <meta name="geo.region" content="IN-OR" />
        <meta name="geo.placename" content="Odisha, India" />
        <meta name="ICBM" content="20.9517, 85.0985" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrganization) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebsite) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdProduct) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFAQ) }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
        {/* PWA + chunk-loading self-heal.
         * Fixes the "Loading chunk NNN failed" error that appears after a
         * production deploy: the browser's cached HTML still references old
         * chunk file-hashes that no longer exist on the server.  We:
         *   1. Catch ChunkLoadError globally → hard-reload once (state kept
         *      in sessionStorage so we never loop).
         *   2. Force the service worker to update itself + skip its cached
         *      HTML shell whenever it detects a new version.
         *   3. Re-register the SW as usual.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                // ---- 1. Chunk-load error auto-recovery ----
                function isChunkErr(e) {
                  var m = (e && (e.message || e.reason && e.reason.message || '')) || ''
                  return /Loading chunk [\\w\\d]+ failed|ChunkLoadError|Loading CSS chunk|Failed to fetch dynamically imported/i.test(m)
                }
                function recover(reason) {
                  try {
                    var k = 'em_chunk_reload_at'
                    var last = Number(sessionStorage.getItem(k) || 0)
                    if (Date.now() - last < 60 * 1000) return  // guard: once per minute max
                    sessionStorage.setItem(k, String(Date.now()))
                    // Unregister stale service worker so the fresh HTML is fetched
                    if ('serviceWorker' in navigator) {
                      navigator.serviceWorker.getRegistrations().then(function (regs) {
                        regs.forEach(function (r) { try { r.unregister() } catch (e) {} })
                      }).catch(function () {})
                    }
                    // Purge caches (SW may hold stale JS)
                    if (self.caches && caches.keys) {
                      caches.keys().then(function (ks) { ks.forEach(function (n) { try { caches.delete(n) } catch (e) {} }) }).catch(function () {})
                    }
                    // Reload with cache-bust ONCE
                    var u = new URL(location.href)
                    u.searchParams.set('_r', String(Date.now()))
                    location.replace(u.toString())
                  } catch (e) { try { location.reload() } catch (_) {} }
                }
                window.addEventListener('error', function (e) { if (isChunkErr(e)) recover('error') }, true)
                window.addEventListener('unhandledrejection', function (e) { if (isChunkErr(e)) recover('rejection') })

                // ---- 2 + 3. Register / update service worker ----
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function () {
                    navigator.serviceWorker.register('/sw.js').then(function (reg) {
                      // When a new SW is waiting, ask it to activate + reload once
                      if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
                      reg.addEventListener('updatefound', function () {
                        var nw = reg.installing
                        if (!nw) return
                        nw.addEventListener('statechange', function () {
                          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                            try { nw.postMessage({ type: 'SKIP_WAITING' }) } catch (e) {}
                          }
                        })
                      })
                    }).catch(function (e) { console.warn('SW reg failed', e) })
                    // Reload the page ONCE when the controller changes (new SW took over)
                    var reloaded = false
                    navigator.serviceWorker.addEventListener('controllerchange', function () {
                      if (reloaded) return; reloaded = true
                      try { location.reload() } catch (_) {}
                    })
                  })
                }
              })()
            `,
          }}
        />
      </body>
    </html>
  )
}
