'use client'
// ============================================================================
//  ReferralDashboard — big card shown on the home/dashboard view after login.
//  Progress bar, share buttons, QR code, referral history, celebration modal.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Gift, Copy, Share2, MessageCircle, Facebook, Send, Mail, Trophy, Sparkles, X, Megaphone, Users, Clock, Award, ChevronRight, Target, Infinity as InfinityIcon, History, Info, CheckCircle2, MinusCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { friendlyReferralReason, referralBadge } from '@/lib/referral-reason'
import MilestoneRewardsList from '@/components/referral/MilestoneRewardsList'
import AmbassadorCard from '@/components/referral/AmbassadorCard'

const apiCall = async (path) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const r = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Error')
  return d
}

export default function ReferralDashboard({ user, onOpenPlans }) {
  const [data, setData] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [celebrate, setCelebrate] = useState(null)   // milestone recently unlocked
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [openReasonRow, setOpenReasonRow] = useState(null)  // index of referral row whose explanation is expanded
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  useEffect(() => { try { setNoticeDismissed(localStorage.getItem('lg_ref_notice_dismissed') === '1') } catch {} }, [])

  const load = useCallback(async () => {
    try {
      const r = await apiCall('/me/referral')
      setData(r)
      // Detect newly-earned reward (server persists them; celebrate if any granted in the last 60s)
      const fresh = (r.rewards || []).find(x => Date.now() - new Date(x.grantedAt).getTime() < 60_000 && !localStorage.getItem('lg_reward_ack_' + x.id))
      if (fresh) setCelebrate(fresh)
    } catch (e) { console.warn('referral load failed', e.message) }
  }, [])
  useEffect(() => { if (user) load() }, [user, load])

  const loadLeaderboard = useCallback(async () => {
    try { const r = await apiCall('/referral/leaderboard'); setLeaderboard(r.items || []) } catch {}
  }, [])

  const copyLink = () => {
    if (!data?.link) return
    navigator.clipboard.writeText(data.link).then(() => toast.success('Referral link copied!'))
  }
  const shareMsg = useMemo(() => data ? (data.shareMessage || `🎁 I'm loving LessonGuru Odisha! Join using my link and get access to Panchapadi lesson plans, worksheets, and more.\n\n${data.link}`) : '', [data])
  const shareOn = (platform) => {
    if (!data) return
    const url = encodeURIComponent(data.link)
    const msg = encodeURIComponent(shareMsg)
    const links = {
      whatsapp: `https://api.whatsapp.com/send?text=${msg}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${msg}`,
      email:    `mailto:?subject=${encodeURIComponent('Join LessonGuru Odisha')}&body=${msg}`,
    }
    window.open(links[platform], '_blank')
  }

  if (!user || !data) return null
  const { code, link, campaign, stats, rewards = [], rewardHistory = [], continuousLadder, referralNotice, milestoneCount, ambassador, earnedMilestones = [] } = data
  const ladderOff = continuousLadder === false
  // STEP 2: when the ladder is OFF, the whole page uses the unified all-time X.
  const xCount = Math.max(0, Number(milestoneCount ?? stats.qualified) || 0)
  const ambTarget = ambassador?.target || 500
  const ambEligible = !!ambassador?.eligible
  const notice = referralNotice || {}
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`
  const daysLeft = campaign?.endDate ? Math.max(0, Math.ceil((new Date(campaign.endDate) - Date.now()) / 86400000)) : null
  const continuousActive = !!stats.continuousActive
  const continuousStep = stats.continuousStep || 50
  const nextM = stats.nextMilestone
  // If we're in continuous mode, always show the next +50 target label.
  const nextTargetLabel = nextM
    ? (nextM.continuous
        ? `+${continuousStep} more teachers → +${Math.round((nextM.rewardDays || 365) / 30)} months free`
        : `${stats.remaining} more teacher${stats.remaining !== 1 ? 's' : ''} → ${nextM.label}`)
    : 'You have unlocked all rewards!'

  return (
    <>
      {/* Main dashboard card */}
      <div className="rounded-3xl overflow-hidden shadow-lg border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-blue-50">
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-pink-500 text-white flex items-center justify-center shadow-md flex-shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-widest text-orange-600">Refer & Earn</div>
              <div className="text-base sm:text-lg font-black text-slate-900 leading-tight">{campaign?.name || 'Invite Teachers & Earn Rewards'}</div>
              <div className="text-[12px] text-slate-600 mt-0.5">
                Invite teachers using your link. When they subscribe, you earn free Premium months automatically.
              </div>
            </div>
          </div>

          {/* New-rule notice banner — only when the ladder is OFF; admin can edit/hide; dismissible */}
          {ladderOff && notice.enabled !== false && !noticeDismissed && (
            <div className="mt-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-pink-50 p-3 flex items-start gap-2.5">
              <Megaphone className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
              <p className="flex-1 text-[12.5px] leading-relaxed font-semibold text-violet-900" style={{ fontFamily: '"Noto Sans Oriya",Inter,sans-serif' }}>
                {notice.text || 'ନୂଆ ନିୟମ: 100 Refer କଲେ 1 ବର୍ଷ ମାଗଣା Premium (ଥରେ ମାତ୍ର)। 500 Refer ପୂରଣ କଲେ 1 ବର୍ଷ ମାଗଣା Mobile Recharge, Gift Hamper ଓ District Head ପଦବୀ, ସହିତ ବର୍ଷକୁ ମାତ୍ର ₹99 ରେ Premium। ଆଗରୁ ମିଳିଥିବା ପୁରସ୍କାର ଅପରିବର୍ତ୍ତିତ।'}
              </p>
              <button onClick={() => { setNoticeDismissed(true); try { localStorage.setItem('lg_ref_notice_dismissed', '1') } catch {} }} className="shrink-0 text-violet-400 hover:text-violet-700" aria-label="Dismiss">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: ladder OFF → Ambassador card (progress toward / eligible). */}
          {ladderOff ? (
            <div className="mt-4">
              <AmbassadorCard
                count={xCount}
                target={ambTarget}
                eligible={ambEligible}
                onBuy={() => onOpenPlans && onOpenPlans()}
                onRefer={() => shareOn('whatsapp')}
              />
            </div>
          ) : (
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-sm font-bold text-slate-900">
                <span className="text-orange-600 text-lg">{stats.qualified}</span> / {stats.targetCount} Teachers
              </div>
              <div className="text-xs font-semibold text-slate-500">{stats.progressPct}% Complete</div>
            </div>
            <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stats.progressPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full ${continuousActive ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500' : 'bg-gradient-to-r from-orange-500 to-pink-500'}`}
              />
            </div>
            {/* Dynamic Next Target row */}
            <div className={`mt-2 rounded-xl border p-2.5 ${continuousActive ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${continuousActive ? 'bg-emerald-500' : 'bg-orange-500'} text-white flex-shrink-0`}>
                  {continuousActive ? <InfinityIcon className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] uppercase tracking-widest font-black ${continuousActive ? 'text-emerald-700' : 'text-orange-700'}`}>
                    {continuousActive ? 'Bonus Mode' : '🎯 Next Target'}
                  </div>
                  <div className="text-[12px] font-semibold text-slate-800 leading-tight">{nextTargetLabel}</div>
                </div>
              </div>
              {continuousActive && (
                <div className="mt-1.5 text-[10.5px] text-emerald-700 leading-snug">
                  You&apos;ve crossed the 50-teacher milestone. Every additional <b>{continuousStep}</b> referrals now gives you <b>+1 year</b> of free Premium.
                </div>
              )}
            </div>
          </div>
          )}

          {/* Stats mini cards */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <StatChip icon={Users} label="Qualified" value={ladderOff ? xCount : stats.qualified} color="green" />
            <StatChip icon={Clock} label="Pending"   value={stats.pending}   color="amber" />
            <StatChip icon={Award} label="Rewards"   value={rewards.length}  color="blue" />
          </div>

          {/* Referral code + copy */}
          <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Your Referral Code</div>
              <div className="font-black text-lg text-slate-900 tracking-widest">{code}</div>
              <div className="text-[11px] text-blue-600 truncate">{link}</div>
            </div>
            <button onClick={copyLink} className="rounded-xl bg-blue-600 text-white px-3 py-2 text-xs font-bold hover:brightness-110 active:scale-95 shadow flex items-center gap-1">
              <Copy className="w-3.5 h-3.5" /> Copy
            </button>
          </div>

          {/* Share row */}
          <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 gap-2">
            <ShareBtn onClick={() => shareOn('whatsapp')} color="#25D366" icon={MessageCircle} label="WhatsApp" />
            <ShareBtn onClick={() => shareOn('facebook')} color="#1877F2" icon={Facebook}      label="Facebook" />
            <ShareBtn onClick={() => shareOn('telegram')} color="#229ED9" icon={Send}          label="Telegram" />
            <ShareBtn onClick={() => shareOn('email')}    color="#EA4335" icon={Mail}          label="Email" />
            <ShareBtn onClick={() => { setShowHistory('qr') }} color="#7C3AED" icon={Share2}   label="QR Code" />
          </div>

          {/* Countdown */}
          {daysLeft !== null && (
            <div className="mt-3 text-center text-xs text-slate-600">
              ⏳ Campaign ends in <b className="text-orange-600">{daysLeft} day{daysLeft !== 1 ? 's' : ''}</b>
            </div>
          )}

          {/* Milestones ladder */}
          {ladderOff ? (
            <div className="mt-4">
              <MilestoneRewardsList count={xCount} earned={earnedMilestones} />
            </div>
          ) : campaign?.milestones?.length > 0 && (
            <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Reward Milestones</div>
                {continuousActive && (
                  <div className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                    <InfinityIcon className="w-2.5 h-2.5" /> Bonus
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                {campaign.milestones.map((m) => {
                  const achieved = stats.qualified >= m.count
                  return (
                    <div key={m.count} className={`flex items-center gap-2.5 text-[13px] ${achieved ? 'opacity-100' : 'opacity-60'}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-black ${achieved ? (m.continuous ? 'bg-emerald-500' : 'bg-green-500') : 'bg-slate-300'}`}>
                        {achieved ? '✓' : m.count}
                      </div>
                      <div className="flex-1 font-semibold text-slate-800">
                        {m.count} referrals → {m.label}
                      </div>
                      {achieved && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">EARNED</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button onClick={() => setShowHistory('history')} className="rounded-xl border border-slate-200 py-2 text-[11px] font-bold text-slate-700 hover:border-blue-400 flex items-center justify-center gap-1">
              <Users className="w-3.5 h-3.5" /> Referrals ({stats.total})
            </button>
            <button onClick={() => setShowHistory('rewards')} className="rounded-xl border border-slate-200 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-400 flex items-center justify-center gap-1">
              <History className="w-3.5 h-3.5" /> Rewards ({rewardHistory.length})
            </button>
            <button onClick={() => { setShowLeaderboard(true); loadLeaderboard() }} className="rounded-xl border border-slate-200 py-2 text-[11px] font-bold text-slate-700 hover:border-blue-400 flex items-center justify-center gap-1">
              <Trophy className="w-3.5 h-3.5" /> Leaderboard
            </button>
          </div>
        </div>
      </div>

      {/* History / QR modal */}
      <AnimatePresence>
        {showHistory && (
          <Modal onClose={() => setShowHistory(false)}>
            {showHistory === 'qr' ? (
              <div className="text-center p-4">
                <div className="text-lg font-black text-slate-900">Share via QR</div>
                <div className="text-xs text-slate-500 mb-3">Teachers can scan this to open your referral link.</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="QR" className="mx-auto rounded-2xl border border-slate-200 shadow-sm" />
                <div className="mt-3 text-xs font-mono text-slate-500 break-all">{link}</div>
              </div>
            ) : showHistory === 'rewards' ? (
              <div className="p-4 max-h-[70vh] overflow-y-auto">
                <div className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2">
                  <History className="w-5 h-5 text-orange-500" /> Reward History
                </div>
                <div className="text-[11px] text-slate-500 mb-3">All rewards you have unlocked. Every reward stacks on top of your current expiry.</div>
                {rewardHistory.length === 0 && (
                  <div className="text-sm text-slate-500 py-8 text-center">
                    No rewards earned yet.
                    <div className="text-[11px] text-slate-400 mt-1">Refer 5 teachers to unlock your first reward!</div>
                  </div>
                )}
                {rewardHistory.map((r) => (
                  <div key={r.id} className={`rounded-2xl border p-3 mb-2 ${r.continuous ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-widest font-black text-slate-600">
                          {r.continuous ? 'Bonus Reward' : `Milestone #${r.milestoneCount}`}
                        </div>
                        <div className="text-sm font-black text-slate-900 leading-tight">{r.milestoneLabel}</div>
                      </div>
                      {r.rewardDays > 0 && (
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-black text-emerald-600 leading-none">+{r.rewardDays}</div>
                          <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">days</div>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
                      <div className="rounded-lg bg-white/70 border border-slate-200 px-2 py-1">
                        <div className="text-[9px] uppercase text-slate-500 font-bold">Before</div>
                        <div className="font-bold text-slate-800">{r.expiryBefore ? new Date(r.expiryBefore).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                      </div>
                      <div className="rounded-lg bg-white/70 border border-slate-200 px-2 py-1">
                        <div className="text-[9px] uppercase text-emerald-600 font-bold">After</div>
                        <div className="font-black text-emerald-700">{r.expiryAfter ? new Date(r.expiryAfter).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-500">
                      Granted on {new Date(r.grantedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 max-h-[70vh] overflow-y-auto">
                <div className="text-lg font-black text-slate-900 mb-2">My Referrals ({data.stats.total})</div>
                {(data.joined || []).length === 0 && <div className="text-sm text-slate-500 py-6 text-center">No referrals yet — share your link to get started!</div>}
                {(data.joined || []).map((r, i) => {
                  const badge = referralBadge(r)
                  const isOpen = openReasonRow === i
                  const toneCls = badge.tone === 'green'
                    ? 'bg-green-100 text-green-700'
                    : badge.tone === 'amber'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                  return (
                    <div key={i} className="py-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{r.name || 'Teacher'}</div>
                          <div className="text-[11px] text-slate-500">
                            {r.mobile} · {new Date(r.joinedAt).toLocaleDateString('en-IN')}
                            <span className={`ml-1 font-semibold ${badge.counts ? 'text-green-600' : 'text-slate-400'}`}>
                              · {badge.counts ? 'counts toward milestone' : 'not counting'}
                            </span>
                          </div>
                        </div>
                        <div className={`text-[10px] font-black px-2 py-1 rounded-full uppercase leading-tight text-right max-w-[130px] ${toneCls}`}>
                          {badge.label}
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpenReasonRow(isOpen ? null : i)}
                          aria-label="Why this status?"
                          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className={`mt-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${badge.counts ? 'bg-green-50 border-green-200 text-green-800' : badge.tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                              <div className="flex items-start gap-1.5 font-semibold mb-1">
                                {badge.counts
                                  ? <><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Counts toward your referral milestone</>
                                  : <><MinusCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Does not currently count toward your milestone</>}
                              </div>
                              <div>{friendlyReferralReason(r.reason)}</div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            )}
          </Modal>
        )}
      </AnimatePresence>

      {/* Leaderboard modal */}
      <AnimatePresence>
        {showLeaderboard && (
          <Modal onClose={() => setShowLeaderboard(false)}>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              <div className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Top Referrers</div>
              {leaderboard.length === 0 && <div className="text-sm text-slate-500 py-6 text-center">No leaderboard entries yet.</div>}
              {leaderboard.map((r) => (
                <div key={r.rank} className="flex items-center gap-3 py-2 border-b border-slate-100">
                  <div className="w-8 text-lg text-center">{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}</div>
                  <div className="flex-1 font-semibold text-slate-800">{r.name}</div>
                  <div className="text-sm font-black text-orange-600">{r.qualified} <span className="text-[10px] text-slate-500 font-normal">qualified</span></div>
                </div>
              ))}
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Celebration modal — full-screen when a milestone just unlocked */}
      <AnimatePresence>
        {celebrate && (
          <Modal onClose={() => { try { localStorage.setItem('lg_reward_ack_' + celebrate.id, '1') } catch {}; setCelebrate(null) }} wide>
            <div className="p-6 text-center relative">
              <div className="text-6xl">🎉</div>
              <div className="mt-2 text-2xl font-black text-slate-900">Congratulations!</div>
              <div className="mt-1 text-sm text-slate-600">
                You have successfully referred <b>{celebrate.milestoneCount}</b> qualified teachers.
              </div>
              <div className="mt-4 rounded-2xl bg-gradient-to-br from-orange-500 to-pink-500 text-white p-4 shadow">
                <div className="text-[11px] uppercase tracking-widest opacity-80">Reward Activated</div>
                <div className="text-lg font-black">{celebrate.milestoneLabel}</div>
                {celebrate.newExpiry && (
                  <div className="mt-2 text-[11px]">Subscription active until <b>{new Date(celebrate.newExpiry).toLocaleDateString('en-IN')}</b></div>
                )}
              </div>
              <button
                onClick={() => { try { localStorage.setItem('lg_reward_ack_' + celebrate.id, '1') } catch {}; setCelebrate(null); load() }}
                className="mt-5 w-full rounded-full bg-slate-900 text-white py-3 text-sm font-bold"
              >Continue Learning</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </>
  )
}

const StatChip = ({ icon: Icon, label, value, color }) => {
  const map = { green: 'bg-green-50 text-green-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700' }
  return (
    <div className={`rounded-xl px-2 py-2 flex items-center gap-2 ${map[color]}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest font-bold opacity-70">{label}</div>
        <div className="text-sm font-black leading-tight">{value}</div>
      </div>
    </div>
  )
}
const ShareBtn = ({ onClick, color, icon: Icon, label }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm active:scale-95 transition-all">
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: color }}><Icon className="w-4 h-4" /></div>
    <div className="text-[10px] font-bold text-slate-700">{label}</div>
  </button>
)
const Modal = ({ children, onClose, wide = false }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}
      className={`bg-white rounded-3xl shadow-2xl relative ${wide ? 'max-w-md w-full' : 'max-w-md w-full'}`}>
      <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4" /></button>
      {children}
    </motion.div>
  </motion.div>
)
