// ============================================================================
// /lp — Facebook Ads Landing Page (dedicated conversion-optimized page)
// ============================================================================
// Route: /lp
// Purpose: convert Facebook Ad traffic → Try Demo / WhatsApp / Buy Premium.
// No global nav bar, no distractions.  Every section funnels the visitor
// toward one of the three CTAs.  Fully mobile-first, Apple/Notion/Stripe
// styling with Framer Motion micro-animations, Odia-native typography.
// ============================================================================
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  UrgencyBar, ScrollProgressBar, Hero, SocialProof, DemoVideo, InteractiveDemo,
  Problems, FeatureGrid, DashboardSlider, HowItWorks, Testimonials, Pricing,
  ComparisonTable, FAQ, Footer, VisitorCountdown,
} from './sections'
import {
  LoadingSplash, StickyBottomCTA, FloatingWhatsApp, FloatingNotifications,
  ExitIntentModal, ScrollDepthTracker,
} from './overlays'
import { track } from './tracking'

export default function LandingPage() {
  const demoRef = useRef(null)
  const [config, setConfig] = useState(null)

  const scrollToDemo = useCallback(() => {
    demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Fire ViewContent once + fetch admin-editable /lp config
  useEffect(() => {
    track({ fb: 'ViewContent', ga: 'view_landing_page', props: { content_name: 'lp' } })
    fetch('/api/lp/config').then(r => r.json()).then(setConfig).catch(() => {/* silent */})
  }, [])

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased selection:bg-[#0B5FFF]/20 selection:text-[#0B5FFF] overflow-x-hidden">
      <LoadingSplash />
      <ScrollProgressBar />
      {config?.urgencyEnabled !== false && <UrgencyBar text={config?.urgencyText} />}
      {config?.timerEnabled !== false && <VisitorCountdown config={config} />}

      <main>
        <Hero onTryDemo={scrollToDemo} config={config} />
        <SocialProof />
        <DemoVideo config={config} />
        <InteractiveDemo demoRef={demoRef} />
        <Problems />
        <FeatureGrid />
        <DashboardSlider />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <ComparisonTable />
        <FAQ />
      </main>

      <Footer />

      {/* Overlays */}
      <FloatingNotifications />
      <FloatingWhatsApp />
      <StickyBottomCTA onTryDemo={scrollToDemo} />
      <ExitIntentModal onTryDemo={scrollToDemo} />
      <ScrollDepthTracker />
    </div>
  )
}
