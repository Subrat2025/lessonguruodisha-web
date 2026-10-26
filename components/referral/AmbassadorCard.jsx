'use client'
import React from 'react'

// STEP 2 · P4 — Ambassador card. Two modes (exact approved Odia copy):
//  • eligible (X >= target)  → "✅ ଆପଣ ଜଣେ Ambassador!" + benefits + ₹99 buy button.
//  • non-eligible (X < target) → "Ambassador ହୁଅନ୍ତୁ" + progress + "Refer କରନ୍ତୁ".
// Only rendered when the Continuous ladder is OFF. Pure presentational.
const ORIYA = { fontFamily: '"Noto Sans Oriya",Inter,sans-serif' }

const BENEFITS = [
  '1 ବର୍ଷ ମାଗଣା Mobile Recharge',
  'Gift Hamper',
  'District Head ପଦବୀ',
  'ବର୍ଷକୁ ମାତ୍ର ₹99 ରେ Premium',
]

export default function AmbassadorCard({ count = 0, target = 500, eligible = false, onBuy, onRefer }) {
  const X = Math.max(0, Number(count) || 0)
  const tgt = Math.max(1, Number(target) || 500)
  const remaining = Math.max(0, tgt - X)
  const pct = Math.min(100, Math.round((X / tgt) * 100))

  if (eligible) {
    return (
      <div className="rounded-3xl p-[2px] bg-gradient-to-br from-amber-400 via-rose-400 to-violet-500 shadow-lg">
        <div className="rounded-3xl bg-white p-4">
          <div className="text-xl font-black text-slate-900 leading-tight" style={ORIYA}>{'\u2705'} ଆପଣ ଜଣେ Ambassador!</div>
          <div className="mt-1 text-[13px] font-bold text-rose-600" style={ORIYA}>ସଫଳ Referral: {X}</div>
          <div className="mt-3 space-y-2">
            {BENEFITS.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-800" style={ORIYA}>
                <span className="w-5 h-5 shrink-0 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px]">{'\u2713'}</span>
                {b}
              </div>
            ))}
          </div>
          <button onClick={onBuy} className="mt-4 w-full rounded-2xl py-3.5 text-[15.5px] font-black text-white bg-gradient-to-r from-rose-500 to-violet-600 shadow active:scale-[.98]" style={ORIYA}>
            ₹99 ରେ 1 ବର୍ଷ Premium ନିଅନ୍ତୁ
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500 text-center" style={ORIYA}>
            Recharge, Gift Hamper ଓ District Head Admin ଯାଞ୍ଚ ପରେ ଦିଆଯିବ।
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 to-rose-50 p-4">
      <div className="text-lg font-black text-slate-900" style={ORIYA}>Ambassador ହୁଅନ୍ତୁ</div>
      <div className="mt-2 flex items-baseline justify-between">
        <div className="text-sm font-bold text-slate-800"><span className="text-violet-700 text-lg">{X}</span> / {tgt} Referral</div>
        <div className="text-xs font-semibold text-slate-500">{pct}%</div>
      </div>
      <div className="mt-1.5 h-3 rounded-full bg-violet-100 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-rose-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed font-semibold text-slate-700" style={ORIYA}>
        ଆଉ {remaining} Refer କଲେ ପାଇବେ: 1 ବର୍ଷ ମାଗଣା Mobile Recharge, Gift Hamper, District Head ପଦବୀ ଓ ବର୍ଷକୁ ମାତ୍ର ₹99 ରେ Premium
      </p>
      <button onClick={onRefer} className="mt-4 w-full rounded-2xl py-3 text-[15px] font-black text-white bg-gradient-to-r from-violet-600 to-rose-500 shadow active:scale-[.98]" style={ORIYA}>
        Refer କରନ୍ତୁ
      </button>
    </div>
  )
}
