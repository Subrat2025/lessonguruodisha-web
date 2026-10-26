'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { inNativeApp } from '@/lib/in-app'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Gem, Sparkles, Loader2, ArrowLeft, Star, RefreshCw, CreditCard, TrendingUp, RotateCcw, ChevronRight, ShoppingBag } from 'lucide-react'

// ─── Shared API helper (uses the app's Bearer token from localStorage) ──────
// Uses a RELATIVE URL (/api/...) so it works on any host — preview, production,
// or a future custom domain — without depending on NEXT_PUBLIC_BASE_URL being
// baked in at build time.
const apiCall = async (path, opts = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const url = `/api${path}`
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  })
  const ct = res.headers.get('content-type') || ''
  let data = {}
  if (ct.includes('application/json')) {
    data = await res.json().catch(() => ({}))
  } else {
    const txt = await res.text().catch(() => '')
    data = { error: `Unexpected response (${res.status}). ${txt.slice(0, 100)}` }
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

// Ensure Razorpay Checkout script is loaded.
async function loadRazorpay() {
  if (typeof window === 'undefined') return false
  if (window.Razorpay) return true
  return new Promise((resolve) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
}

// ─── Wallet Chip (top-nav) ───────────────────────────────────────────────────
export const AICreditWalletChip = ({ user, onOpen, tone = 'onDark' }) => {
  const [balance, setBalance] = useState(null)
  const load = useCallback(async () => {
    if (!user?.id) { setBalance(null); return }
    try {
      const r = await apiCall('/ai-credits/wallet')
      setBalance(Number(r.balance || 0))
    } catch { /* silent — chip stays hidden */ }
  }, [user?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onEvt = () => load()
    window.addEventListener('ai-credits:changed', onEvt)
    return () => window.removeEventListener('ai-credits:changed', onEvt)
  }, [load])

  if (!user?.id || balance === null) return null
  const dark = tone === 'onDark'
  return (
    <button
      type="button"
      onClick={onOpen}
      title="AI Credits Wallet"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition ${dark ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
    >
      <Gem className="w-3.5 h-3.5" />
      <span className="tabular-nums">{balance.toLocaleString('en-IN')}</span>
      <span className="hidden sm:inline">Credits</span>
    </button>
  )
}

// ─── Buy Credits Modal ───────────────────────────────────────────────────────
export const BuyCreditsModal = ({ open, onOpenChange, user, onPurchased }) => {
  const [plans, setPlans] = useState([])
  const [loadingId, setLoadingId] = useState(null)
  const [ready, setReady] = useState(false)
  // Loading / error / success FSM so the modal never gets stuck on "Loading…"
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'error' | 'empty'
  const [error, setError] = useState(null)

  const loadPlans = useCallback(async () => {
    setStatus('loading')
    setError(null)
    // Absolute-max UX safety: even if fetch hangs, bail out after 20 s.
    const bailout = setTimeout(() => {
      setError('Request timed out. Please check your connection and try again.')
      setStatus('error')
    }, 20_000)
    try {
      const r = await apiCall('/ai-credits/plans')
      clearTimeout(bailout)
      const list = Array.isArray(r?.plans) ? r.plans.filter(p => p && p.active !== false) : []
      setPlans(list)
      setStatus(list.length === 0 ? 'empty' : 'success')
    } catch (e) {
      clearTimeout(bailout)
      setError(e?.message || 'Unable to load credit plans. Please try again.')
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    loadPlans()
    loadRazorpay().then(setReady)
  }, [open, loadPlans])

  const buy = async (plan) => {
    if (!user?.id) return toast.error('Please log in to purchase AI Credits.')
    if (!ready || !window.Razorpay) {
      toast.error('Payment gateway is still loading. Please try again in a moment.')
      return
    }
    if (loadingId) return // prevent duplicate orders on rapid clicks
    setLoadingId(plan._id)
    try {
      const order = await apiCall('/ai-credits/checkout', { method: 'POST', body: { planId: plan._id } })
      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Lesson Guru Odisha',
        description: `${plan.name} — ${plan.credits} AI Credits`,
        order_id: order.orderId,
        image: '/icon-192.png',
        prefill: { name: user.name || '', contact: user.mobile || '', email: user.email || '' },
        theme: { color: '#7c3aed' },
        notes: { productType: 'ai_credits', planId: plan._id, credits: String(plan.credits) },
        modal: { ondismiss: () => { setLoadingId(null); toast.info('Payment cancelled') } },
        handler: async (resp) => {
          try {
            const verify = await apiCall('/ai-credits/verify', {
              method: 'POST',
              body: {
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              },
            })
            if (verify.ok) {
              toast.success(verify.message || `🎉 ${plan.credits} AI Credits Added Successfully`)
              try { window.dispatchEvent(new Event('ai-credits:changed')) } catch { /* ignore */ }
              onPurchased && onPurchased(verify)
              onOpenChange && onOpenChange(false)
            } else {
              toast.error('Payment verification failed. Your credits were not added. Please contact support.')
            }
          } catch (e) {
            toast.error(e.message || 'Payment verification failed. Please contact support.')
          } finally {
            setLoadingId(null)
          }
        },
      }
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (r) => { toast.error(r.error?.description || 'Payment failed'); setLoadingId(null) })
      rzp.open()
    } catch (e) {
      toast.error(e.message || 'Unable to start payment. Please try again.')
      setLoadingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[90vh]">
        <DialogHeader className="p-5 pb-3 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Gem className="w-5 h-5" /> Buy AI Credits
          </DialogTitle>
          <p className="text-xs opacity-90 mt-1">Credits power Student Engagement, Custom Worksheets &amp; Assessment generation. Never expire.</p>
        </DialogHeader>
        <div className="p-4 space-y-3 overflow-y-auto max-h-[65vh]">
          {status === 'loading' && (
            <div className="py-10 flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
              <p className="text-sm text-muted-foreground">Loading credit plans…</p>
            </div>
          )}
          {status === 'error' && (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-rose-600 font-semibold">Unable to load credit plans.</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">{error}</p>
              <Button onClick={loadPlans} variant="outline" className="rounded-xl">
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          )}
          {status === 'empty' && (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">No credit plans are currently available.</p>
              <Button onClick={loadPlans} variant="outline" size="sm" className="rounded-xl mt-3">
                <RefreshCw className="w-3.5 h-3.5 mr-2" /> Refresh
              </Button>
            </div>
          )}
          {status === 'success' && plans.map((p) => {
            const inrPerCredit = (p.priceINR / p.credits)
            return (
              <Card key={p._id} className={`p-4 rounded-2xl relative ${p.bestValue ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}>
                {p.bestValue && (
                  <div className="absolute -top-2.5 right-3 bg-amber-400 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" /> BEST VALUE
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-base">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.credits.toLocaleString('en-IN')} Credits · ₹{inrPerCredit.toFixed(2)}/credit
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-2xl font-extrabold text-violet-700">₹{p.priceINR}</p>
                  </div>
                </div>
                <Button
                  onClick={() => buy(p)}
                  disabled={loadingId === p._id || !!loadingId || !ready}
                  className={`mt-3 w-full rounded-xl h-10 font-bold ${p.bestValue ? 'bg-amber-500 hover:bg-amber-600 text-amber-950' : 'bg-violet-600 hover:bg-violet-700 text-white'}`}
                >
                  {loadingId === p._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <>
                    <ShoppingBag className="w-4 h-4 mr-2" /> Buy for ₹{p.priceINR}
                  </>}
                </Button>
              </Card>
            )
          })}
        </div>
        <div className="px-5 py-3 bg-muted/50 text-[11px] text-muted-foreground border-t">
          🔒 Secure payment via Razorpay · Credits added instantly · No auto-renewal
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Wallet Page ─────────────────────────────────────────────────────────────
export const AICreditWalletView = ({ user, onBack }) => {
  const [wallet, setWallet] = useState(null)
  const [txns, setTxns] = useState([])
  const [buyOpen, setBuyOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [w, t] = await Promise.all([
        apiCall('/ai-credits/wallet'),
        apiCall('/ai-credits/transactions?limit=100'),
      ])
      setWallet(w)
      setTxns(t.transactions || [])
    } catch (e) { toast.error(e.message) }
    finally { setRefreshing(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const iconFor = (t) => {
    if (t.type === 'credit') return <TrendingUp className="w-4 h-4 text-emerald-600" />
    if (t.type === 'refund') return <RotateCcw className="w-4 h-4 text-amber-600" />
    if (t.cacheHit) return <RefreshCw className="w-4 h-4 text-blue-600" />
    return <Sparkles className="w-4 h-4 text-violet-600" />
  }
  const labelFor = (t) => {
    if (t.type === 'credit') return `Purchase • ${t.credits} credits added`
    if (t.type === 'refund') return `Refund • ${t.credits} credits • ${t.reason || 'Generation failed'}`
    const zone = t.zone ? `${t.zone.replace(/_/g, ' ')} · ` : ''
    const type = t.generationType ? t.generationType.replace(/_/g, ' ') : 'generation'
    return `${zone}${type}${t.cacheHit ? ' (cached)' : ''}`
  }

  return (
    <div className="pb-24">
      <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white">
        <div className="px-5 pt-6 pb-6 relative">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full text-white hover:bg-white/20">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <p className="text-sm opacity-90 font-semibold flex items-center gap-1"><Gem className="w-4 h-4" /> AI Credits Wallet</p>
            <Button variant="ghost" size="icon" onClick={load} disabled={refreshing} className="rounded-full text-white hover:bg-white/20">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <Card className="mt-4 p-5 rounded-2xl border-0 bg-white/15 backdrop-blur text-white">
            <p className="text-[11px] opacity-90 uppercase tracking-wider">Current Balance</p>
            <p className="font-extrabold text-4xl mt-1">
              {wallet ? Number(wallet.balance || 0).toLocaleString('en-IN') : '…'}
              <span className="text-base font-bold opacity-80 ml-2">credits</span>
            </p>
            <div className="grid grid-cols-3 gap-2 mt-4 text-[10px]">
              <div className="bg-white/10 rounded-lg p-2">
                <p className="opacity-80">Purchased</p>
                <p className="font-bold text-sm">{wallet?.lifetimePurchased || 0}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-2">
                <p className="opacity-80">Spent</p>
                <p className="font-bold text-sm">{wallet?.lifetimeSpent || 0}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-2">
                <p className="opacity-80">Refunded</p>
                <p className="font-bold text-sm">{wallet?.lifetimeRefunded || 0}</p>
              </div>
            </div>
            {!inNativeApp() && <Button
              onClick={() => setBuyOpen(true)}
              className="mt-4 w-full rounded-xl h-11 bg-white text-violet-700 hover:bg-violet-50 font-bold"
            >
              <CreditCard className="w-4 h-4 mr-2" /> Buy More Credits
            </Button>}
          </Card>
        </div>
      </div>

      <div className="px-5 mt-5 space-y-4">
        <div>
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2">Transaction History</p>
          {txns.length === 0 && (
            <Card className="p-6 rounded-2xl text-center">
              <p className="text-sm text-muted-foreground">No transactions yet. Buy credits to get started ✨</p>
            </Card>
          )}
          <div className="space-y-2">
            {txns.map((t) => (
              <Card key={t._id} className="p-3 rounded-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  {iconFor(t)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize truncate">{labelFor(t)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.createdAt ? new Date(t.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    {' · Balance: '}{t.balanceAfter}
                  </p>
                </div>
                <div className={`text-sm font-bold flex-shrink-0 ${t.type === 'credit' || t.type === 'refund' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {t.type === 'debit' ? '' : '+'}{t.credits}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <BuyCreditsModal
        open={buyOpen}
        onOpenChange={setBuyOpen}
        user={user}
        onPurchased={() => load()}
      />
    </div>
  )
}

// ─── Cache-hit / Fresh-gen inline badge (small pill used in zone UIs) ────────
export const AIGenerationBadge = ({ cacheHit, debited }) => {
  if (cacheHit) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-blue-300 bg-blue-50 text-blue-700">
        <RefreshCw className="w-3 h-3" /> Served from existing resource • {debited} Credits used
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-violet-300 bg-violet-50 text-violet-700">
      <Sparkles className="w-3 h-3" /> Freshly generated • {debited} Credits used
    </Badge>
  )
}
