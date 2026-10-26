'use client'
import React from 'react'

// STEP 2 · P4 — "ପୁରସ୍କାର ନିୟମ" reward-rules list. Exact Odia copy (approved).
// Shown on the referral page and the popup Terms page ONLY when the ladder is OFF.
// Pure presentational: pass the unified all-time count X as `count`.
const ORIYA = { fontFamily: '"Noto Sans Oriya",Inter,sans-serif' }

export const MILESTONE_ROWS = [
  { count: 5,   text: '5 Refer → 1 ମାସ ମାଗଣା Premium' },
  { count: 15,  text: '15 Refer → 3 ମାସ ମାଗଣା Premium' },
  { count: 30,  text: '30 Refer → 6 ମାସ ମାଗଣା Premium' },
  { count: 50,  text: '50 Refer → 1 ବର୍ଷ ମାଗଣା Premium' },
  { count: 100, text: '100 Refer → 1 ବର୍ଷ ମାଗଣା Premium (ଶେଷ ମାଗଣା Premium)' },
  { count: 500, text: '500 Refer → Ambassador: 1 ବର୍ଷ ମାଗଣା Mobile Recharge, Gift Hamper, District Head ପଦବୀ ଓ ବର୍ଷକୁ ମାତ୍ର ₹99 ରେ Premium' },
]

export const MILESTONE_FOOTNOTE = 'ପ୍ରତ୍ୟେକ ପୁରସ୍କାର ଥରେ ମାତ୍ର ମିଳିବ। ଆଗରୁ ମିଳିଥିବା ପୁରସ୍କାର ଅପରିବର୍ତ୍ତିତ ରହିବ।\nସଫଳ Referral = ଆପଣଙ୍କ Link ରେ ଯୋଗଦେଇ Premium କିଣିଥିବା ଶିକ୍ଷକ।'

export default function MilestoneRewardsList({ count = 0, earned = [], bare = false }) {
  const X = Math.max(0, Number(count) || 0)
  const earnedSet = new Set((earned || []).map(Number))
  const body = (
    <>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2" style={ORIYA}>ପୁରସ୍କାର ନିୟମ</div>
      <div className="space-y-1.5">
        {MILESTONE_ROWS.map((m) => {
          const passed = X >= m.count
          const isAmbassadorRow = m.count >= 500
          // "EARNED" ONLY when a real reward record exists; "Processing" when X
          // passed the milestone but the reward isn't granted yet. The 500 row is
          // an eligibility (admin-approved perks), shown as "Ready" when reached.
          let badge = null
          if (isAmbassadorRow) {
            if (passed) badge = <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full shrink-0">Ready</span>
          } else if (earnedSet.has(m.count)) {
            badge = <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">EARNED</span>
          } else if (passed) {
            badge = <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">Processing</span>
          }
          const dotDone = isAmbassadorRow ? passed : earnedSet.has(m.count)
          return (
            <div key={m.count} className={`flex items-start gap-2.5 text-[13px] ${passed ? 'opacity-100' : 'opacity-70'}`}>
              <div className={`mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-black ${dotDone ? (isAmbassadorRow ? 'bg-rose-500' : 'bg-green-500') : (passed ? 'bg-amber-400' : 'bg-slate-300')}`}>
                {dotDone ? '\u2713' : (isAmbassadorRow ? '\u2605' : m.count)}
              </div>
              <div className="flex-1 font-semibold text-slate-800 leading-snug" style={ORIYA}>{m.text}</div>
              {badge}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11.5px] leading-relaxed font-semibold text-violet-800 whitespace-pre-line" style={ORIYA}>{MILESTONE_FOOTNOTE}</p>
    </>
  )
  if (bare) return body
  return <div className="rounded-2xl bg-white border border-slate-200 p-3">{body}</div>
}
