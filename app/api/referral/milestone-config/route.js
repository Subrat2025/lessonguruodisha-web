// Public (logged-in) config for the ReferralPopupV2. Returns ONLY settings
// (target, reward texts, enabled flags, recharge limit, popupV2 switch).
// NEVER returns names / phones / counts of other users.
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { getUser } from '@/lib/auth'
import { getMilestoneConfig } from '@/lib/referral-milestone'
import { isContinuousLadderOn } from '@/lib/referral-engine'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const payload = getUser(request)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const d = await getDb()
    const cfg = await getMilestoneConfig(d)
    const continuousLadder = await isContinuousLadderOn(d)
    // Whitelist only non-sensitive settings.
    return NextResponse.json({
      popupV2: cfg.popupV2,
      milestoneEnabled: cfg.milestoneEnabled,
      target: cfg.target,
      rechargeLimit: cfg.rechargeLimit,
      referralBaseUrl: cfg.referralBaseUrl,
      rewards: cfg.rewards,
      continuousLadder,
    })
  } catch (e) {
    console.error('[milestone-config] failed:', e?.message)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
