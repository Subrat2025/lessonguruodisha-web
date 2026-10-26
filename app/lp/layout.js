// ============================================================================
// /lp — Landing Page dedicated layout
// ============================================================================
// This layout is used ONLY for the Facebook Ads landing page under /lp.  It
// overrides the SEO metadata (conversion-focused title/description),
// registers placeholder tracking scripts (Facebook Pixel, GA4, Microsoft
// Clarity, Hotjar) — all wrapped in guards so they are safe no-ops until the
// real IDs are provided via environment variables.
//
// To activate tracking, set these in /app/.env (already in Kubernetes env):
//   NEXT_PUBLIC_FB_PIXEL_ID       = 1234567890
//   NEXT_PUBLIC_GA4_ID            = G-XXXXXXX
//   NEXT_PUBLIC_CLARITY_ID        = abcd1234
//   NEXT_PUBLIC_HOTJAR_ID         = 1234567
// ============================================================================
import Script from 'next/script'

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://lessonguruodisha.in'
const LP_URL = `${SITE_URL}/lp`
const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID || ''
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID || ''
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID || ''
const HOTJAR_ID = process.env.NEXT_PUBLIC_HOTJAR_ID || ''

const LP_TITLE = 'LessonGuru Odisha · ୨ ମିନିଟରେ ପାଠ ଯୋଜନା — ୧୨,୫୦୦+ ଶିକ୍ଷକଙ୍କର ଭରସା'
const LP_DESC = 'ବାଳବାଟିକା ରୁ ଦଶମ ଶ୍ରେଣୀ · Panchapadi ପାଠ ଯୋଜନା · Worksheet · Question Bank · LO Code · Assessment. ମାତ୍ର ୨ ମିନିଟରେ ପ୍ରସ୍ତୁତ। Odisha ଶିକ୍ଷକଙ୍କ ପାଇଁ #୧ Premium Platform।'

export const metadata = {
  title: LP_TITLE,
  description: LP_DESC,
  alternates: { canonical: LP_URL },
  openGraph: {
    type: 'website',
    url: LP_URL,
    siteName: 'Lesson Guru Odisha',
    title: LP_TITLE,
    description: LP_DESC,
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'LessonGuru Odisha — ୨ ମିନିଟରେ ପାଠ ଯୋଜନା' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: LP_TITLE,
    description: LP_DESC,
    images: [`${SITE_URL}/og-image.png`],
  },
  robots: { index: true, follow: true },
}

export const viewport = {
  themeColor: '#0B5FFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function LPLayout({ children }) {
  return (
    <>
      {/* ============= Facebook Pixel (placeholder — activates when NEXT_PUBLIC_FB_PIXEL_ID is set) ============= */}
      {FB_PIXEL_ID ? (
        <>
          <Script id="fb-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){
              n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
              s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${FB_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript
            dangerouslySetInnerHTML={{
              __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1" alt="" />`,
            }}
          />
        </>
      ) : null}

      {/* ============= Google Analytics 4 (placeholder) ============= */}
      {GA4_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA4_ID}', { send_page_view: true });
            `}
          </Script>
        </>
      ) : null}

      {/* ============= Microsoft Clarity (placeholder) ============= */}
      {CLARITY_ID ? (
        <Script id="ms-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_ID}");
          `}
        </Script>
      ) : null}

      {/* ============= Hotjar (placeholder, ready) ============= */}
      {HOTJAR_ID ? (
        <Script id="hotjar" strategy="afterInteractive">
          {`
            (function(h,o,t,j,a,r){
              h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
              h._hjSettings={hjid:${HOTJAR_ID},hjsv:6};
              a=o.getElementsByTagName('head')[0];
              r=o.createElement('script');r.async=1;
              r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;
              a.appendChild(r);
            })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');
          `}
        </Script>
      ) : null}

      {children}
    </>
  )
}
