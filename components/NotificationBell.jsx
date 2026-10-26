'use client'
// ============================================================================
//  NotificationBell — real-time referral notifications with unread badge.
//  Polls /api/me/notifications every 30s. Dropdown panel with mark-read.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, CheckCheck, Gift, Users, Sparkles, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const apiCall = async (path, options = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('em_token') : null
  const r = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'Error')
  return d
}

const timeAgo = (iso) => {
  if (!iso) return ''
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const day = Math.floor(h / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

const typeIcon = (t) => {
  switch (t) {
    case 'referral_joined': return { Icon: Users, color: 'text-blue-500 bg-blue-100' }
    case 'reward_unlocked': return { Icon: Gift, color: 'text-orange-500 bg-orange-100' }
    case 'subscription_extended': return { Icon: Sparkles, color: 'text-emerald-500 bg-emerald-100' }
    default: return { Icon: Bell, color: 'text-slate-500 bg-slate-100' }
  }
}

export default function NotificationBell({ user, tone = 'light' }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)
  const btnRef = useRef(null)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const r = await apiCall('/me/notifications?limit=30')
      setItems(r.items || [])
      setUnread(Number(r.unreadCount || 0))
    } catch (e) { /* silent */ }
  }, [user])

  useEffect(() => {
    if (!user) return
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [user, load])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  const markAll = async () => {
    try {
      setLoading(true)
      await apiCall('/me/notifications/mark-read', { method: 'POST', body: JSON.stringify({ all: true }) })
      await load()
    } catch (e) { /* silent */ }
    finally { setLoading(false) }
  }

  const markOne = async (id) => {
    try {
      // Optimistic update
      setItems(prev => prev.map(i => i.id === id ? { ...i, read: true } : i))
      setUnread(u => Math.max(0, u - 1))
      await apiCall('/me/notifications/mark-read', { method: 'POST', body: JSON.stringify({ ids: [id] }) })
    } catch (e) { load() }
  }

  const removeOne = async (id) => {
    try {
      setItems(prev => prev.filter(i => i.id !== id))
      await apiCall(`/me/notifications/${id}`, { method: 'DELETE' })
      load()
    } catch (e) { load() }
  }

  if (!user) return null
  const iconTone = tone === 'onDark' ? 'text-white hover:bg-white/20' : 'text-slate-700 hover:bg-slate-100'

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
        className={`relative w-9 h-9 rounded-full flex items-center justify-center ${iconTone} transition-colors`}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center px-1 shadow ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed sm:absolute z-[95] right-2 sm:right-0 mt-2 w-[calc(100vw-16px)] sm:w-[380px] max-w-[380px] bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
            style={{ top: 'auto' }}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" />
                <div className="text-sm font-bold">Notifications</div>
                {unread > 0 && (
                  <span className="text-[10px] bg-white/25 rounded-full px-1.5 py-0.5 font-bold">{unread} new</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={markAll}
                    disabled={loading}
                    className="text-[11px] font-bold bg-white/20 hover:bg-white/30 rounded-full px-2 py-1 flex items-center gap-1 disabled:opacity-50"
                  >
                    <CheckCheck className="w-3 h-3" /> Mark all
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto">
              {items.length === 0 && (
                <div className="p-8 text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <Bell className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="text-sm font-bold text-slate-700">No notifications yet</div>
                  <div className="text-xs text-slate-500 mt-1">Refer friends and unlock rewards to see updates here.</div>
                </div>
              )}
              {items.map(n => {
                const { Icon, color } = typeIcon(n.type)
                return (
                  <div key={n.id} className={`px-3 py-3 border-b border-slate-100 flex items-start gap-3 group ${n.read ? 'bg-white' : 'bg-blue-50/40'}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[13px] font-bold text-slate-900 leading-tight">{n.title}</div>
                        <div className="text-[10px] text-slate-500 whitespace-nowrap">{timeAgo(n.createdAt)}</div>
                      </div>
                      <div className="text-[12px] text-slate-600 mt-0.5 leading-snug">{n.message}</div>
                      {n.type === 'reward_unlocked' && n.meta?.expiryAfter && (
                        <div className="mt-1.5 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 rounded-md px-2 py-0.5 inline-block">
                          Extended till {new Date(n.meta.expiryAfter).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        {!n.read && (
                          <button onClick={() => markOne(n.id)} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Mark read
                          </button>
                        )}
                        <button onClick={() => removeOne(n.id)} className="text-[10px] font-semibold text-slate-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          Delete
                        </button>
                      </div>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
