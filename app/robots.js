// Next.js built-in robots.txt generator
const SITE_URL = 'https://lessonguruodisha.com'

// Public read-only API endpoints that external tools / AI sandboxes are
// EXPLICITLY allowed to fetch.  These carry no user data, no auth, and are
// CORS-open + HTTP-cached.  Everything else under /api/ stays disallowed.
const PUBLIC_API_ALLOW = [
  '/api/lo-codes',
  '/api/lo-codes/legacy',
  '/api/lo-codes/foundational',
  '/api/lo-codes/dakhyata',
  '/api/lo-codes/balvatika-cg',
  '/api/lo-codes/meta',
  '/api/lo-codes/export/json',
  '/api/lo-codes/export/csv',
  '/api/export/json',
  '/api/settings/public',
  '/api/reviews/public',
]

const PRIVATE_API_DISALLOW = [
  '/api/admin',
  '/api/auth',
  '/api/lessons',
  '/api/chapters',
  '/api/books',
  '/api/classes',
  '/api/subscriptions',
  '/api/payments',
  '/api/quizzes',
  '/api/qbank',
  '/api/uploads',
  '/api/user',
  '/api/whatsapp',
  '/admin',
  '/?view=admin',
  '/?view=change-password',
]

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', ...PUBLIC_API_ALLOW],
        disallow: PRIVATE_API_DISALLOW,
      },
      {
        userAgent: 'Googlebot',
        allow: ['/', ...PUBLIC_API_ALLOW],
        disallow: PRIVATE_API_DISALLOW,
      },
      {
        userAgent: 'Bingbot',
        allow: ['/', ...PUBLIC_API_ALLOW],
        disallow: PRIVATE_API_DISALLOW,
      },
      // Explicit allow-list for common AI crawlers so external LLM tools /
      // sandboxed fetchers (Claude, ChatGPT, Perplexity, Gemini, etc.) can
      // read the public LO / CG code catalog.
      { userAgent: 'GPTBot', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
      { userAgent: 'ChatGPT-User', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
      { userAgent: 'ClaudeBot', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
      { userAgent: 'Claude-Web', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
      { userAgent: 'anthropic-ai', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
      { userAgent: 'PerplexityBot', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
      { userAgent: 'Google-Extended', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
      { userAgent: 'Bytespider', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
      { userAgent: 'CCBot', allow: PUBLIC_API_ALLOW, disallow: PRIVATE_API_DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
