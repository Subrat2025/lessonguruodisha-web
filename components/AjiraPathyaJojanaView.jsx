'use client'
// =============================================================================
//  🌅 Ajira Pathya Jojana — "Today's Lesson Plan" view
//  ---------------------------------------------------------------------------
//  Shows the selected date's Class-1 to Class-5 daily lesson plans (subject-wise
//  with Panchapadi sopan, LO codes, and Assessment/Homework) in a colourful
//  card layout — one distinct gradient per class so teachers can spot their
//  class at a glance.
//
//  Data source:  GET /api/ajira-pathya-jojana?date=YYYY-MM-DD  (premium-gated)
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react'
import { inNativeApp } from '@/lib/in-app'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  ArrowLeft, Maximize2, Sparkles, Target, ClipboardList, BookOpen,
  ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

// One distinct gradient per class — teachers said "different colour so it's easy
// to find" — carefully chosen so they still look great side-by-side.
// Balvatika (pre-primary) + Class 1-10 supported.
const CLASS_THEMES = {
  0: { name: 'ବାଳବାଟିକା (Balvatika)', emoji: '🌸',
       card: 'from-pink-400 via-pink-500 to-fuchsia-500',
       ring: 'ring-pink-300',
       chip: 'bg-pink-100 text-pink-800 dark:bg-pink-950/50 dark:text-pink-200',
       accent: 'text-pink-600 dark:text-pink-300',
       soft: 'from-pink-50 to-fuchsia-50 dark:from-pink-950/30 dark:to-fuchsia-950/30' },
  1: { name: 'ପ୍ରଥମ ଶ୍ରେଣୀ (Class 1)', emoji: '🍎',
       card: 'from-rose-500 via-pink-500 to-red-500',
       ring: 'ring-rose-300',
       chip: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
       accent: 'text-rose-600 dark:text-rose-300',
       soft: 'from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/30' },
  2: { name: 'ଦ୍ୱିତୀୟ ଶ୍ରେଣୀ (Class 2)', emoji: '🍊',
       card: 'from-orange-500 via-amber-500 to-yellow-500',
       ring: 'ring-orange-300',
       chip: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200',
       accent: 'text-orange-600 dark:text-orange-300',
       soft: 'from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30' },
  3: { name: 'ତୃତୀୟ ଶ୍ରେଣୀ (Class 3)', emoji: '🍃',
       card: 'from-emerald-500 via-green-500 to-teal-500',
       ring: 'ring-emerald-300',
       chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
       accent: 'text-emerald-600 dark:text-emerald-300',
       soft: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30' },
  4: { name: 'ଚତୁର୍ଥ ଶ୍ରେଣୀ (Class 4)', emoji: '💠',
       card: 'from-blue-500 via-sky-500 to-indigo-500',
       ring: 'ring-blue-300',
       chip: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200',
       accent: 'text-blue-600 dark:text-blue-300',
       soft: 'from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30' },
  5: { name: 'ପଞ୍ଚମ ଶ୍ରେଣୀ (Class 5)', emoji: '🔮',
       card: 'from-purple-500 via-fuchsia-500 to-violet-600',
       ring: 'ring-purple-300',
       chip: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-200',
       accent: 'text-purple-600 dark:text-purple-300',
       soft: 'from-purple-50 to-fuchsia-50 dark:from-purple-950/30 dark:to-fuchsia-950/30' },
  6: { name: 'ଷଷ୍ଠ ଶ୍ରେଣୀ (Class 6)', emoji: '🦋',
       card: 'from-rose-600 via-red-600 to-pink-700',
       ring: 'ring-rose-400',
       chip: 'bg-rose-100 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200',
       accent: 'text-rose-700 dark:text-rose-300',
       soft: 'from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/30' },
  7: { name: 'ସପ୍ତମ ଶ୍ରେଣୀ (Class 7)', emoji: '🌻',
       card: 'from-amber-600 via-orange-600 to-yellow-700',
       ring: 'ring-amber-400',
       chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
       accent: 'text-amber-700 dark:text-amber-300',
       soft: 'from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30' },
  8: { name: 'ଅଷ୍ଟମ ଶ୍ରେଣୀ (Class 8)', emoji: '🌿',
       card: 'from-green-700 via-emerald-700 to-teal-700',
       ring: 'ring-emerald-400',
       chip: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
       accent: 'text-emerald-700 dark:text-emerald-300',
       soft: 'from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30' },
  9: { name: 'ନବମ ଶ୍ରେଣୀ (Class 9)', emoji: '💎',
       card: 'from-indigo-600 via-blue-700 to-sky-700',
       ring: 'ring-indigo-400',
       chip: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200',
       accent: 'text-indigo-700 dark:text-indigo-300',
       soft: 'from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30' },
  10:{ name: 'ଦଶମ ଶ୍ରେଣୀ (Class 10)', emoji: '🎓',
       card: 'from-purple-700 via-violet-700 to-fuchsia-800',
       ring: 'ring-purple-400',
       chip: 'bg-purple-100 text-purple-900 dark:bg-purple-950/50 dark:text-purple-200',
       accent: 'text-purple-700 dark:text-purple-300',
       soft: 'from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30' },
}

// Panchapadi has 5 named steps in Odia:
//   1. ଅଧୀତି   (Adhiti — Prior knowledge)
//   2. ବୋଧ     (Bodha — Understanding)
//   3. ଅଭ୍ୟାସ  (Abhyas — Practice)
//   4. ପ୍ରୟୋଗ (Prayoga — Application)
//   5. ପ୍ରସାର  (Prasar — Extension)
// We colour-code the heading token so teachers can identify the step at a
// glance and keep the body text neutral so it stays readable.
const PANCHAPADI_TONES = [
  { label: 'ଅଧୀତି',   badge: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200',       bar: 'border-red-500' },
  { label: 'ବୋଧ',      badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200', bar: 'border-orange-500' },
  { label: 'ଅଭ୍ୟାସ',  badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200', bar: 'border-emerald-500' },
  { label: 'ପ୍ରୟୋଗ', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',    bar: 'border-blue-500' },
  { label: 'ପ୍ରସାର',  badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-200', bar: 'border-purple-500' },
]
// Colour token used inside the print HTML (must be hex so print CSS works
// even when Tailwind classes don't apply in the popup window).
const PANCHAPADI_PRINT_HEX = ['#B91C1C', '#C2410C', '#047857', '#1D4ED8', '#7E22CE']

/** Split "1. ଅଧୀତି: <body>" → { idx, label, body } */
function splitPanchapadi(text = '') {
  const m = String(text).match(/^\s*(\d+)\.\s*([^:：]+)[:：]\s*(.+)$/s)
  if (!m) return { idx: null, label: null, body: text }
  return { idx: Number(m[1]), label: m[2].trim(), body: m[3].trim() }
}

// ---------------- Curriculum-code palette ----------------
// Each learning-framework code prefix gets a distinct, eye-catching colour so
// teachers can spot them at a glance in the lesson card and on printed sheets.
//   LO   → Learning Outcome        (red)
//   CG   → Curricular Goal         (blue)
//   CD   → Content Domain          (teal)
//   LLD  → Language & Literacy Dev (emerald)
//   PD   → Physical Development    (amber)
//   ACD  → Aesthetic & Cultural    (fuchsia)
//   SED  → Socio-Emotional Dev     (rose)
//   default (unknown)              (slate)
const CODE_STYLES = {
  LO:  { screen: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-100 dark:border-red-800',
         hex: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  CG:  { screen: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-100 dark:border-blue-800',
         hex: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
  CD:  { screen: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/40 dark:text-teal-100 dark:border-teal-800',
         hex: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' },
  LLD: { screen: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-100 dark:border-emerald-800',
         hex: '#047857', bg: '#D1FAE5', border: '#6EE7B7' },
  PD:  { screen: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800',
         hex: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
  ACD: { screen: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-950/40 dark:text-fuchsia-100 dark:border-fuchsia-800',
         hex: '#A21CAF', bg: '#FAE8FF', border: '#F0ABFC' },
  SED: { screen: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-800',
         hex: '#BE185D', bg: '#FCE7F3', border: '#F9A8D4' },
  _:   { screen: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600',
         hex: '#334155', bg: '#F1F5F9', border: '#CBD5E1' },
}

/** Return a curriculum-code prefix (LO/CG/CD/LLD/PD/ACD/SED) for styling. */
function codePrefix(code = '') {
  const m = String(code).toUpperCase().match(/^\s*(ACD|LLD|SED|LO|CG|CD|PD)\b/)
  return m ? m[1] : '_'
}

/** Merge LO + CG codes for a period into one deduped chip list. */
function collectCodes(p) {
  const out = []
  if (p?.loCode) out.push({ label: `LO: ${p.loCode}`, prefix: 'LO' })
  for (const c of p?.cgCodes || []) {
    const clean = String(c).trim()
    if (!clean) continue
    out.push({ label: clean, prefix: codePrefix(clean) })
  }
  // Dedupe by label
  const seen = new Set()
  return out.filter(x => (seen.has(x.label) ? false : (seen.add(x.label), true)))
}

// Detect the primary language of a subject label so we can render it in a
// language-appropriate font weight (the source HTML already contains the
// original script: Odia, Hindi, Sanskrit, English).
function subjectDir(s = '') {
  if (/[a-zA-Z]/.test(s) && !/[\u0900-\u0DFF]/.test(s)) return 'en'
  if (/[\u0B00-\u0B7F]/.test(s)) return 'or'   // Odia block
  if (/[\u0900-\u097F]/.test(s)) return 'hi'   // Devanagari (Hindi/Sanskrit)
  return 'or'
}

const fmtLongDate = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  } catch { return iso }
}

const AjiraPathyaJojanaView = ({ go, user, active, api }) => {
  // Default = today (IST). Data covers 2026-04-02 → 2027-03-06 so we clamp when
  // "today" is outside the range on first load.
  const todayIST = useMemo(() => {
    const now = new Date()
    const ist = new Date(now.getTime() + (5.5 * 60 - now.getTimezoneOffset()) * 60_000)
    return ist.toISOString().slice(0, 10)
  }, [])
  // 🔒 Non-admin users can only browse yesterday / today / tomorrow.  Admins get the full range.
  const isAdminLike = ['admin', 'section_uploader', 'books_uploader'].includes(user?.role)
  const userMinISO = useMemo(() => {
    const d = new Date(todayIST + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }, [todayIST])
  const userMaxISO = useMemo(() => {
    const d = new Date(todayIST + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  }, [todayIST])
  const [date, setDate] = useState(todayIST)
  const [range, setRange] = useState(null)           // { firstDate, lastDate, availableDates:[] }
  const [payload, setPayload] = useState(null)       // { dateISO, classes, neighbours }
  const [loading, setLoading] = useState(false)
  const [openClass, setOpenClass] = useState(null)   // classCode currently expanded (mobile UX)
  const [openPeriod, setOpenPeriod] = useState({})   // { `${classCode}-${idx}`: true }
  const [locked, setLocked] = useState(false)
  const [mode, setMode] = useState('day')            // 'day' | 'week'
  const [weekPayload, setWeekPayload] = useState(null)
  // Add-on paywall state
  const [addonStatus, setAddonStatus] = useState(null)   // { hasAccess, source, addon, pricing, priceRupees }
  const [paying, setPaying] = useState(false)

  // Load Razorpay checkout script once — cached across the whole app.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.Razorpay) return
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    document.body.appendChild(s)
    return () => { try { document.body.removeChild(s) } catch {} }
  }, [])

  const loadAddonStatus = () => {
    api('/ajira-addon/status').then(setAddonStatus).catch(() => {})
  }
  useEffect(() => { loadAddonStatus() /* eslint-disable-next-line */ }, [])

  const startCheckout = async () => {
    if (paying) return
    setPaying(true)
    try {
      const order = await api('/ajira-addon/create-order', { method: 'POST' })
      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Lesson Guru Odisha',
        description: `Ajira Pathya Jojana — 1 Year Access`,
        order_id: order.orderId,
        prefill: { name: user?.name || '', contact: user?.mobile || '' },
        theme: { color: '#EA580C' },
        handler: async (resp) => {
          try {
            const r = await api('/ajira-addon/verify-payment', {
              method: 'POST',
              body: {
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
              },
            })
            toast.success('🎉 Ajira Pathya Jojana unlocked for 1 year!')
            setAddonStatus({ ...addonStatus, hasAccess: true, source: 'addon', addon: r.addon })
            // Refresh the data + status.
            setTimeout(() => window.location.reload(), 1200)
          } catch (e) {
            toast.error(e?.message || 'Could not confirm payment. Please contact support.')
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      }
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (e) {
      toast.error(e?.message || 'Could not start checkout.')
      setPaying(false)
    }
  }

  useEffect(() => {
    // Fetch the availability range once so we can constrain the date-picker
    api('/ajira-pathya-jojana/range').then(r => {
      setRange(r)
      // If today is outside range, jump to the first available date so users
      // aren't greeted with an empty screen the first time they open the tool.
      if (r?.firstDate && r?.lastDate && (todayIST < r.firstDate || todayIST > r.lastDate)) {
        setDate(r.firstDate)
      }
    }).catch(() => {})
  }, [api, todayIST])

  useEffect(() => {
    if (!date || mode !== 'week') return
    if (addonStatus && !addonStatus.hasAccess) { setLocked(true); setWeekPayload(null); setLoading(false); return }
    let cancel = false
    setLoading(true)
    api(`/ajira-pathya-jojana/week?startDate=${date}`)
      .then(r => { if (!cancel) setWeekPayload(r) })
      .catch(e => {
        if (cancel) return
        if (e?.code === 'AJIRA_ADDON_REQUIRED' || e?.code === 'SUBSCRIPTION_REQUIRED') {
          setLocked(true); setWeekPayload(null); return
        }
        if (e?.code === 'WEEK_OUT_OF_WINDOW') {
          toast.info('You can only preview last week, this week, or next week. Snapping back to this week.')
          setDate(todayIST); return
        }
        toast.error(e?.message || 'Could not load weekly preview.')
        setWeekPayload(null)
      })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [api, date, mode, todayIST, addonStatus])

  useEffect(() => {
    if (!date || mode !== 'day') return
    // Skip API call entirely if we already know the user is locked out — the
    // paywall handles UX and repeat 402s would just spam the console.
    if (addonStatus && !addonStatus.hasAccess) { setLocked(true); setPayload(null); setLoading(false); return }
    let cancel = false
    setLoading(true)
    api(`/ajira-pathya-jojana?date=${date}`)
      .then(r => { if (!cancel) { setPayload(r); setLocked(false); setOpenClass(null); setOpenPeriod({}) } })
      .catch(e => {
        if (cancel) return
        if (e?.code === 'AJIRA_ADDON_REQUIRED' || e?.code === 'SUBSCRIPTION_REQUIRED') {
          setLocked(true); setPayload(null)
          return
        }
        if (e?.code === 'DATE_OUT_OF_WINDOW') {
          toast.info('You can only view yesterday, today, or tomorrow. Snapping back to today.')
          setDate(todayIST)
          return
        }
        toast.error(e?.message || 'Could not load lesson plans.')
        setPayload({ dateISO: date, classes: [], neighbours: null })
      })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [api, date, todayIST, addonStatus])

  const shiftDay = (deltaDays) => {
    if (!date) return
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + deltaDays)
    const iso = d.toISOString().slice(0, 10)
    // Non-admin users: hard-cap at today ± 1.
    if (!isAdminLike) {
      if (iso < userMinISO) return toast.info('You can only view yesterday, today, or tomorrow.')
      if (iso > userMaxISO) return toast.info('You can only view yesterday, today, or tomorrow.')
    }
    if (range?.firstDate && iso < range.firstDate) return toast.info('This is the first available date.')
    if (range?.lastDate  && iso > range.lastDate)  return toast.info('This is the last available date.')
    setDate(iso)
  }

  const jumpTo = (iso) => {
    if (!iso) return
    if (!isAdminLike && (iso < userMinISO || iso > userMaxISO)) {
      return toast.info('You can only view yesterday, today, or tomorrow.')
    }
    setDate(iso)
  }

  const openLandscapeView = (cls) => {
    if (typeof window === 'undefined') return
    const theme = CLASS_THEMES[cls.classCode] || CLASS_THEMES[1]
    // Escape any HTML special chars a teacher's name / mobile might contain
    // before we splice it into the print HTML.
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
    const teacherName = esc(user?.name || 'Teacher')
    const teacherMobile = esc(user?.mobile || '')
    // Panchapadi rows with coloured heading badges — the same 5-tone palette
    // used on screen, kept inline so it survives the popup context.
    const panchapadiRows = (arr = []) => arr.map((raw) => {
      const m = String(raw).match(/^\s*(\d+)\.\s*([^:：]+)[:：]\s*(.+)$/s)
      if (!m) return `<div style="margin:2px 0;">${esc(raw)}</div>`
      const idx = Number(m[1])
      const label = esc(m[2].trim())
      const body = esc(m[3].trim())
      const hex = PANCHAPADI_PRINT_HEX[(idx - 1 + 5) % 5]
      return `<div style="margin:2px 0;padding:2px 0 2px 4px;border-left:3px solid ${hex};"><b style="color:${hex};">${idx}. ${label}:</b> ${body}</div>`
    }).join('')
    // Curriculum-code chips (LO, CG, LLD, PD, ACD, ...) — each rendered with its
    // own colour so the printed sheet mirrors the on-screen chip palette.
    const codeChips = (p) => {
      const chips = collectCodes(p)
      if (!chips.length) return ''
      return `<div style="margin-top:3px;line-height:1.8;">` + chips.map((c) => {
        const s = CODE_STYLES[c.prefix] || CODE_STYLES._
        return `<span style="display:inline-block;font-size:9.5px;font-weight:700;padding:1px 6px;margin-right:3px;border-radius:9999px;color:${s.hex};background:${s.bg};border:1px solid ${s.border};white-space:nowrap;">${esc(c.label)}</span>`
      }).join('') + `</div>`
    }
    const rows = cls.periods.map(p => `
      <tr>
        <td class="c" style="text-align:center;font-weight:700;">${esc(p.periodNo)}<br><span style="font-size:10px;">${esc(p.time || '')}</span></td>
        <td><b>${esc(p.subject || '')}</b>${p.tlm ? `<br><span style="font-size:10px;color:#555;">TLM: ${esc(p.tlm)}</span>` : ''}</td>
        <td>${(p.lessonLines || []).map(esc).join('<br>')}${codeChips(p)}</td>
        <td>${panchapadiRows(p.panchapadi)}</td>
        <td>${esc(p.assessment || '')}${p.homework ? `<br><b>ଗୃହକାର୍ଯ୍ୟ:</b> ${esc(p.homework)}` : ''}</td>
      </tr>`).join('')
    const w = window.open('', '_blank')
    if (!w) return toast.error('Please allow pop-ups to open the landscape view.')
    // Absolute URL to the app icon so it resolves inside the about:blank popup.
    const logoUrl = (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '') + '/icon-192.png'
    w.document.write(`<!doctype html><html lang="or"><head><meta charset="utf-8"><title>${theme.name} · ${esc(cls.dateText)}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;700&display=swap');
        html,body{margin:0;padding:0;}
        body{font-family:'Noto Sans Oriya','Kalinga','Nirmala UI',sans-serif;font-size:12px;color:#111;position:relative;min-height:100vh;background:#f5f5f5;}
        /* On-screen landscape "paper" — mimics an A4 landscape page so teachers
           preview the exact print layout without hitting Print. */
        .paper{background:#fff;width:1123px;max-width:100%;margin:20px auto;box-shadow:0 4px 20px rgba(0,0,0,.15);position:relative;overflow:hidden;}
        /* Floating action bar — sticks to the top so teachers can print / close
           any time.  Hidden on print. */
        .actionbar{position:sticky;top:0;z-index:10;background:linear-gradient(90deg,#1F3F77,#8B0000);color:#fff;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;}
        .actionbar b{font-size:13px;}
        .actionbar button{background:#fff;color:#1F3F77;border:0;padding:6px 12px;border-radius:6px;font-weight:800;cursor:pointer;font-size:12px;}
        .actionbar button:hover{background:#e5e7eb;}
        .actionbar .close-btn{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);}
        @media print{ .actionbar{display:none !important;} .paper{box-shadow:none;margin:0;width:auto;} body{background:#fff;} }
        /* Repeating logo + "lessonguruodisha.com" + teacher-name watermark tiled
           across the page.  Uses a fixed layer beneath the content so it prints
           on every page.  The logo tile keeps brand recall strong even after
           teachers photocopy the printout. */
        .wm-layer{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden;}
        .wm-diag{position:absolute;top:0;left:0;width:200vw;height:200vh;
                 transform:rotate(-30deg);transform-origin:top left;
                 display:flex;flex-wrap:wrap;gap:70px 90px;padding:100px 0;
                 opacity:.10;font-weight:700;color:#B91C1C;font-size:22px;letter-spacing:1.5px;}
        .wm-tile{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;}
        .wm-tile img{width:28px;height:28px;border-radius:50%;object-fit:cover;filter:grayscale(20%);}
        .content{position:relative;z-index:1;padding:16px;}
        h2{color:#8B0000;text-align:center;margin:.2em 0;}
        h3{color:#1F3F77;text-align:center;margin:.2em 0;}
        .header-brand{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 0 4px;}
        .header-brand img{width:36px;height:36px;border-radius:8px;object-fit:cover;box-shadow:0 1px 3px rgba(0,0,0,.15);}
        .header-brand .brand-txt{font-size:13px;font-weight:800;color:#B91C1C;letter-spacing:.5px;}
        .teacher-bar{display:flex;justify-content:space-between;font-size:11px;color:#555;padding:4px 8px;border:1px dashed #999;border-radius:6px;margin:6px 0 8px;background:#FFFDF3;}
        table{border-collapse:collapse;width:100%;margin-top:6px;}
        th,td{border:1px solid #444;padding:4px 6px;vertical-align:top;font-size:11px;}
        th{background:#DCE6F1;}
        .footer{margin-top:10px;font-size:10px;color:#555;text-align:center;border-top:1px dashed #aaa;padding-top:6px;}
        @media print{ @page{size:A4 landscape;margin:1cm;} .wm-diag{opacity:.12;} }
      </style></head><body>
      <div class="actionbar">
        <b>🌅 ${theme.name} · ${esc(cls.dateText)} — Landscape View</b>
        <div style="display:flex;gap:6px;">
          <button class="close-btn" onclick="window.close()">✕ Close</button>
        </div>
      </div>
      <div class="paper">
      <div class="wm-layer" aria-hidden="true"><div class="wm-diag">
        ${Array.from({length: 48}).map(() => `<span class="wm-tile"><img src="${logoUrl}" alt="" onerror="this.style.display='none'"/>lessonguruodisha.com · ${teacherName}</span>`).join('')}
      </div></div>
      <div class="content">
        <div class="header-brand">
          <img src="${logoUrl}" alt="Lesson Guru Odisha" onerror="this.style.display='none'"/>
          <span class="brand-txt">Lesson Guru Odisha · lessonguruodisha.com</span>
        </div>
        <h2>ଦୈନିକ ପାଠ ଯୋଜନା — ${theme.name}</h2>
        <h3>${esc(cls.dateText)} (${esc(cls.dayName)}) · ସପ୍ତାହ-${esc(cls.weekNo)} · ଶିକ୍ଷାଦାନ ଦିବସ-${esc(cls.teachingDayNo)}</h3>
        <div class="teacher-bar">
          <span><b>Teacher:</b> ${teacherName}${teacherMobile ? ` &nbsp;·&nbsp; ${teacherMobile}` : ''}</span>
          <span><b>Source:</b> lessonguruodisha.com</span>
        </div>
        <table>
          <thead><tr>
            <th style="width:7%;">ପିରିୟଡ଼/ସମୟ</th>
            <th style="width:15%;">ବିଷୟ ଓ TLM</th>
            <th style="width:19%;">ପାଠ · CG · LO</th>
            <th style="width:42%;">ପଞ୍ଚପଦୀ ସୋପାନ</th>
            <th style="width:17%;">ମୂଲ୍ୟାୟନ ଓ ଗୃହକାର୍ଯ୍ୟ</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">${esc(cls.note || '')}</div>
        <div class="footer">© lessonguruodisha.com · Prepared for ${teacherName} · Printed on ${new Date().toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}</div>
      </div>
      </div>
    </body></html>`)
    w.document.close()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 dark:from-slate-950 dark:via-indigo-950/40 dark:to-purple-950/60 pb-24">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 text-white">
        <div className="absolute -top-10 -right-10 w-52 h-52 bg-yellow-300/25 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-52 h-52 bg-pink-300/20 rounded-full blur-3xl" />
        <div className="px-5 pt-6 pb-6 relative">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => go('dashboard')} className="rounded-full text-white hover:bg-white/20">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            {addonStatus?.hasAccess ? (
              <Badge className="bg-white/20 hover:bg-white/30 border-0 text-white text-[10px]">
                {addonStatus.source === 'addon' ? '✅ Add-on Active' :
                 addonStatus.source === 'admin' ? '⚡ Admin' : '✨ Premium'}
              </Badge>
            ) : (
              <Badge className="bg-white/20 hover:bg-white/30 border-0 text-white text-[10px]">
                <Sparkles className="w-3 h-3 mr-1" /> Premium Add-on
              </Badge>
            )}
          </div>
          <div className="mt-3 text-4xl">🌅</div>
          <h1 className="text-2xl font-extrabold mt-2 leading-tight">ଆଜିର ପାଠ୍ୟ ଯୋଜନା</h1>
          <p className="text-sm opacity-95 mt-0.5 font-semibold">Today&apos;s Lesson Plan · Balvatika to Class 8</p>
          <p className="text-[11px] opacity-90 mt-0.5">All classes, all subjects, Panchapadi format — for any date of the academic year.</p>
        </div>
      </div>

      {/* 🔒 Paywall — shown when the user doesn't have access */}
      {addonStatus && !addonStatus.hasAccess && (
        <div className="px-4 -mt-3 relative z-10">
          <Card className="p-4 rounded-3xl border-2 border-orange-300 dark:border-orange-800 shadow-xl bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-rose-950/40">
            {/* 🔥 Ultra clickbait paywall — every line does psychology work:
                loss aversion · social proof · specificity · authority · urgency */}
            <div className="text-center">
              <div className="inline-block px-3 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                ⚠️ 2026-27 ଶିକ୍ଷାବର୍ଷ ପାଇଁ ସୀମିତ ପ୍ରସ୍ତାବ
              </div>
              <p className="font-black text-[22px] leading-tight mt-2 text-orange-900 dark:text-orange-100">
                ପ୍ରତିଦିନ 2 ଘଣ୍ଟା ବଞ୍ଚାନ୍ତୁ 😰
              </p>
              <p className="font-extrabold text-[15px] leading-tight text-orange-800 dark:text-orange-200">
                — ଏଥିରୁ ଆରମ୍ଭ କରି, ପାଠ ଯୋଜନା ଆଉ କେବେ ଲେଖିବାକୁ ପଡିବ ନାହିଁ! 🎯
              </p>
              <p className="text-[11.5px] mt-2 text-slate-700 dark:text-slate-300 font-semibold">
                ପ୍ରତ୍ୟେକ ଦିନ ପାଇଁ · ପ୍ରତ୍ୟେକ ପିରିଅଡ୍ ପାଇଁ · ପ୍ରତ୍ୟେକ ଶ୍ରେଣୀ ପାଇଁ (BV → Class 8) · SCERT/OSEPA ପଦ୍ଧତିରେ
              </p>
            </div>

            {/* 🎯 Tier-specific "Why YOU need this" — different psychology per pricing bucket */}
            {addonStatus.source === 'yearly-premium' && (
              <div className="mt-4 rounded-2xl bg-gradient-to-r from-blue-50 to-emerald-50 dark:from-blue-950/40 dark:to-emerald-950/40 border-2 border-blue-300 dark:border-blue-800 p-3">
                <p className="text-[11px] font-black text-blue-900 dark:text-blue-100 mb-1.5">💎 Yearly Premium ମାନଙ୍କ ପାଇଁ ବିଶେଷ Offer:</p>
                <div className="space-y-1 text-[11.5px] text-slate-800 dark:text-slate-100">
                  <p>✅ <b>97%</b> Yearly Premium ଶିକ୍ଷକ Ajira ମଧ୍ୟ ନେଇଛନ୍ତି — ଆପଣ ପଛରେ ପଡନ୍ତୁ ନାହିଁ</p>
                  <p>💰 ମାତ୍ର <b>₹49</b> ରେ — Monthly ମାନେ ₹{addonStatus.pricing.addonPrice} ଦେଉଛନ୍ତି, ଆପଣ ପାଇବେ <b>₹{addonStatus.pricing.addonPrice - addonStatus.pricing.yearlyAddonPrice} ସଞ୍ଚୟ</b></p>
                  <p>📚 ଆପଣଙ୍କ Yearly Premium ର ସହିତ 100% match — ଏହା ହିଁ ଆପଣଙ୍କର <b>Complete Teaching Stack</b></p>
                </div>
              </div>
            )}
            {addonStatus.source === 'premium-monthly-quarterly' && (
              <div className="mt-4 rounded-2xl bg-gradient-to-r from-purple-50 to-fuchsia-50 dark:from-purple-950/40 dark:to-fuchsia-950/40 border-2 border-purple-300 dark:border-purple-800 p-3">
                <p className="text-[11px] font-black text-purple-900 dark:text-purple-100 mb-1.5">🌟 Monthly / Quarterly Premium ପାଇଁ:</p>
                <div className="space-y-1 text-[11.5px] text-slate-800 dark:text-slate-100">
                  <p>🎯 ଆପଣଙ୍କ Premium ର <b>Missing Piece</b> — Yearly ମାନେ ପାଇଛନ୍ତି ଏହା</p>
                  <p>🚀 ୟୋଉ କାମ ୨ ଘଣ୍ଟା ଲାଗେ, ତା&apos; ୩ ସେକଣ୍ଡରେ ହେଉଛି — <b>Weekend ମାନେ ଉପଭୋଗ କରନ୍ତୁ, ପାଠ ଯୋଜନା ନୁହେଁ</b></p>
                  <p>💡 <b>Smart Choice:</b> Yearly Premium ରେ upgrade କରନ୍ତୁ → Ajira ମାତ୍ର <b>₹{addonStatus.pricing.yearlyAddonPrice}</b> ରେ ପାଇବେ (₹{addonStatus.pricing.addonPrice - addonStatus.pricing.yearlyAddonPrice} ସଞ୍ଚୟ!)</p>
                </div>
              </div>
            )}
            {addonStatus.source === 'no-subscription' && (
              <div className="mt-4 rounded-2xl bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/40 dark:to-red-950/40 border-2 border-orange-300 dark:border-orange-800 p-3">
                <p className="text-[11px] font-black text-orange-900 dark:text-orange-100 mb-1.5">🔥 ଆଜି ହିଁ ଆରମ୍ଭ କରନ୍ତୁ:</p>
                <div className="space-y-1 text-[11.5px] text-slate-800 dark:text-slate-100">
                  <p>✨ <b>Premium subscription ଦରକାର ନାହିଁ</b> — Standalone Add-on, ମାତ୍ର ₹199</p>
                  <p>⚡ <b>Zero commitment</b> — 365 ଦିନ ପାଇଁ, No auto-renewal, No hidden charges</p>
                  <p>🎓 Odisha ର <b>ପ୍ରତ୍ୟେକ ଶିକ୍ଷକ</b> ଏହା ଚାହୁଁଛନ୍ତି — ଆଜି ହିଁ Register ହୋଇ Unlock କରନ୍ତୁ</p>
                  <p className="text-[10px] mt-1 opacity-80">💎 Yearly Premium ଆଛନ୍ତି କି? Ajira ମାତ୍ର ₹{addonStatus.pricing.yearlyAddonPrice} ରେ · Monthly/Quarterly ପାଇଁ ₹{addonStatus.pricing.addonPrice}</p>
                </div>
              </div>
            )}

            {/* Before / After — the classic conversion booster */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-2xl border-2 border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-2.5">
                <p className="text-[10px] font-black text-red-700 dark:text-red-300 uppercase">😩 ବିନା ଆଜିର ପାଠ୍ୟ</p>
                <ul className="text-[10.5px] text-red-800 dark:text-red-200 mt-1 space-y-0.5">
                  <li>❌ ପ୍ରତି ରାତି 2 ଘଣ୍ଟା ଲେଖା</li>
                  <li>❌ SLIP/DIET ପାଖରୁ ଚିନ୍ତା</li>
                  <li>❌ HM ଓ Inspector ର ଡର</li>
                  <li>❌ ପିଲାଙ୍କ ପାଠ ଅଧୁରା</li>
                </ul>
              </div>
              <div className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-2.5">
                <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase">😎 ଆଜିର ପାଠ୍ୟ ସହିତ</p>
                <ul className="text-[10.5px] text-emerald-800 dark:text-emerald-200 mt-1 space-y-0.5">
                  <li>✅ 3 second ରେ ପ୍ରସ୍ତୁତ</li>
                  <li>✅ SCERT/OSEPA aligned</li>
                  <li>✅ Print-ready · watermarked</li>
                  <li>✅ ପିଲାମାନେ Focus ରେ</li>
                </ul>
              </div>
            </div>

            {/* Detailed benefits — specificity + FOMO */}
            <div className="mt-4 rounded-2xl bg-white/80 dark:bg-black/30 p-3 border border-orange-200 dark:border-orange-900/60">
              <p className="text-[11px] font-black text-orange-900 dark:text-orange-100 mb-1.5">🎁 କଣ କଣ ଆପଣ ପାଇବେ:</p>
              <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-800 dark:text-slate-200">
                <div className="flex items-start gap-1.5"><span>📅</span><span><b>365 ଦିନ</b> — ପୂରା ଶିକ୍ଷାବର୍ଷର Daily Plans</span></div>
                <div className="flex items-start gap-1.5"><span>🎨</span><span><b>Panchapadi Format</b> — 5 stage colour-coded (Preparation → Presentation → Practice → Assessment → Application)</span></div>
                <div className="flex items-start gap-1.5"><span>📚</span><span><b>ସମସ୍ତ ବିଷୟ</b> — Odia, English, Math, Science, GK, ATL — subject wise TLM ସହିତ</span></div>
                <div className="flex items-start gap-1.5"><span>🎯</span><span><b>LO Codes + DG</b> — NCF-FS aligned Learning Outcomes + Domain Goals automatically embedded</span></div>
                <div className="flex items-start gap-1.5"><span>🖨️</span><span><b>Landscape Print</b> — A4 landscape ready-to-print, Inspector-approved format</span></div>
                <div className="flex items-start gap-1.5"><span>🏫</span><span><b>Balvatika → Class 8</b> — one tile, 9 classes covered — perfect for multi-grade schools</span></div>
                <div className="flex items-start gap-1.5"><span>🔒</span><span><b>ଆପଣଙ୍କ ନାମ Watermark</b> — copy protection with your name diagonal-tiled</span></div>
                <div className="flex items-start gap-1.5"><span>📱</span><span><b>Weekly Preview</b> — Monday to Saturday ଏକଥର ଚିଠ୍ଠିରୁ ପାଇବେ</span></div>
              </div>
            </div>

            {/* Social proof */}
            <div className="mt-3 rounded-xl bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-950/40 dark:to-orange-950/40 border border-amber-300 dark:border-amber-800 p-2.5 text-center">
              <p className="text-[11px] font-bold text-amber-900 dark:text-amber-100">
                🏆 <b>12,500+ Odisha ଶିକ୍ଷକମାନେ</b> ପ୍ରତିଦିନ Lesson Guru Odisha ବ୍ୟବହାର କରୁଛନ୍ତି · Rating <b>4.9/5 ⭐</b>
              </p>
            </div>

            {/* Price + CTA (not inside the app: Play Payments policy) */}
            {inNativeApp() ? (
              <p className="mt-4 text-center text-xs text-muted-foreground">This add-on is not available for purchase in the app.</p>
            ) : <div className="mt-4 text-center">
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-5xl font-black bg-gradient-to-r from-orange-600 via-red-600 to-rose-600 dark:from-orange-300 dark:via-red-300 dark:to-rose-300 bg-clip-text text-transparent">₹{addonStatus.priceRupees}</span>
                <span className="text-base text-muted-foreground line-through">₹{addonStatus.pricing.mrpPrice}</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse">
                  {Math.round((1 - addonStatus.priceRupees / addonStatus.pricing.mrpPrice) * 100)}% OFF
                </span>
              </div>
              <p className="text-[10px] mt-0.5 text-slate-600 dark:text-slate-400">
                only <b>₹{(addonStatus.priceRupees / 365).toFixed(2)}/day</b> · one-time payment for 365 days · no auto-renew
              </p>

              {/* Tier-specific micro-tip */}
              {addonStatus.source === 'no-subscription' && (
                <p className="text-[10px] mt-1.5 text-orange-700 dark:text-orange-300">
                  💡 Yearly Premium ଆଛନ୍ତି କି? ମାତ୍ର ₹{addonStatus.pricing.yearlyAddonPrice} ରେ ପାଇବେ · Monthly/Quarterly ପାଇଁ ₹{addonStatus.pricing.addonPrice}
                </p>
              )}
              {addonStatus.source === 'premium-monthly-quarterly' && (
                <p className="text-[10px] mt-1.5 text-orange-700 dark:text-orange-300">
                  💎 Yearly Premium କୁ upgrade କରନ୍ତୁ → ମାତ୍ର ₹{addonStatus.pricing.yearlyAddonPrice} ରେ ପାଇବେ (₹{addonStatus.pricing.addonPrice - addonStatus.pricing.yearlyAddonPrice} ସଞ୍ଚୟ!)
                </p>
              )}
              {addonStatus.source === 'yearly-premium' && (
                <p className="text-[10px] mt-1.5 text-emerald-700 dark:text-emerald-300 font-bold">
                  🎉 Yearly Premium ର Special ମୂଲ୍ୟ: କେବଳ ₹{addonStatus.pricing.yearlyAddonPrice} · ଆପଣଙ୍କ ବର୍ତ୍ତମାନ Yearly ଉପରେ 365 ଦିନ ଯୋଡ଼ାଯିବ
                </p>
              )}

              <Button
                onClick={startCheckout}
                disabled={paying || !addonStatus.pricing.enabled}
                className="mt-3 w-full h-14 rounded-2xl font-black text-lg bg-gradient-to-r from-orange-500 via-red-500 to-rose-500 hover:from-orange-600 hover:via-red-600 hover:to-rose-600 text-white shadow-xl shadow-orange-500/40 animate-pulse"
              >
                {paying ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <>🚀 ଆଜି ହିଁ Unlock କରନ୍ତୁ · ₹{addonStatus.priceRupees}</>
                )}
              </Button>
              <p className="text-[9.5px] mt-1.5 text-slate-500 dark:text-slate-400">
                🔒 Secured by Razorpay · 100% money-back if not delivered · ⚡ Instant activation
              </p>

              {/* Scarcity nudge */}
              <p className="text-[10px] mt-2 text-red-700 dark:text-red-300 font-bold">
                ⏰ 2026-27 ଶିକ୍ଷାବର୍ଷ ପାଇଁ ମାତ୍ର {addonStatus.pricing.mrpPrice - addonStatus.priceRupees} ଟଙ୍କା ସଞ୍ଚୟ କରନ୍ତୁ — Offer ଶୀଘ୍ର ସମାପ୍ତ!
              </p>
            </div>}
          </Card>
        </div>
      )}

      {/* Renewal reminder — shown 15 days before expiry */}
      {!inNativeApp() && addonStatus?.hasAccess && addonStatus.source === 'addon' && addonStatus.addon?.expiresAt && (() => {
        const daysLeft = Math.ceil((new Date(addonStatus.addon.expiresAt).getTime() - Date.now()) / 86_400_000)
        if (daysLeft > 15) return null
        return (
          <div className="px-4 -mt-3 relative z-10">
            <Card className={`p-3 rounded-2xl border-2 shadow-md ${daysLeft <= 3 ? 'border-red-300 bg-red-50 dark:bg-red-950/30' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'}`}>
              <div className="flex items-center gap-2 justify-between">
                <div>
                  <p className="text-[12px] font-extrabold">{daysLeft > 0 ? `⏳ ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : '❌ Expired'}</p>
                  <p className="text-[10px] text-muted-foreground">Renew to keep lesson plans flowing.</p>
                </div>
                <Button size="sm" onClick={startCheckout} disabled={paying} className="rounded-xl text-[11px] h-8 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold">
                  Renew · ₹{addonStatus.priceRupees}
                </Button>
              </div>
            </Card>
          </div>
        )
      })()}

      {/* Date picker — hidden when locked so the paywall gets full attention */}
      {addonStatus?.hasAccess && (
      <div className="px-4 -mt-3 relative z-10">
        <Card className="p-3 rounded-2xl border-2 shadow-lg bg-card">
          {/* Day / Week toggle */}
          <div className="flex gap-1.5 mb-2.5 p-1 bg-muted rounded-xl">
            <button
              onClick={() => setMode('day')}
              className={`flex-1 py-1.5 rounded-lg text-[11.5px] font-extrabold transition ${mode === 'day' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
            >📅 Day</button>
            <button
              onClick={() => setMode('week')}
              className={`flex-1 py-1.5 rounded-lg text-[11.5px] font-extrabold transition ${mode === 'week' ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
            >🗓️ Week (Mon-Sat)</button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => shiftDay(-1)} className="rounded-xl h-11 w-11 shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <CalendarIcon className="w-3.5 h-3.5" /> Select date
              </div>
              <input
                type="date"
                value={date}
                min={isAdminLike ? (range?.firstDate || undefined) : userMinISO}
                max={isAdminLike ? (range?.lastDate  || undefined) : userMaxISO}
                onChange={(e) => jumpTo(e.target.value)}
                className="w-full mt-0.5 h-9 rounded-lg border border-input bg-transparent px-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-[11px] font-semibold text-primary mt-1 truncate">{fmtLongDate(date)}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => shiftDay(1)} className="rounded-xl h-11 w-11 shrink-0">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {!isAdminLike && (
              <>
                <Button size="sm" variant={date === userMinISO ? 'default' : 'secondary'} onClick={() => jumpTo(userMinISO)} className="rounded-xl text-[11px] h-8">← Yesterday</Button>
                <Button size="sm" variant={date === todayIST  ? 'default' : 'secondary'} onClick={() => jumpTo(todayIST)}  className="rounded-xl text-[11px] h-8">🌟 Today</Button>
                <Button size="sm" variant={date === userMaxISO ? 'default' : 'secondary'} onClick={() => jumpTo(userMaxISO)} className="rounded-xl text-[11px] h-8">Tomorrow →</Button>
              </>
            )}
            {isAdminLike && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setDate(todayIST)} className="rounded-xl text-[11px] h-8">🌟 Today</Button>
                {range?.firstDate && (
                  <Button size="sm" variant="ghost" onClick={() => setDate(range.firstDate)} className="rounded-xl text-[11px] h-8">↩ Start of Year</Button>
                )}
              </>
            )}
          </div>
          {!isAdminLike && (
            <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
              🔒 Only <b>yesterday</b>, <b>today</b>, and <b>tomorrow</b>&apos;s plans are viewable — plan just ahead, teach today.
            </p>
          )}
        </Card>
      </div>
      )}

      {/* Quick class-jump chips — tap a class to jump straight to its card
          without scrolling. Only shown in Day mode when there are classes. */}
      {mode === 'day' && !loading && addonStatus?.hasAccess && payload && payload.classes.length > 0 && (
        <div className="px-4 mt-3">
          <Card className="p-2.5 rounded-2xl bg-card border-2 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10.5px] font-extrabold text-muted-foreground uppercase tracking-wider">Jump to class</p>
              <p className="text-[10px] text-muted-foreground">{payload.classes.length} available</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {payload.classes.map((cls) => {
                const t = CLASS_THEMES[cls.classCode] || CLASS_THEMES[1]
                const isActive = openClass === cls.classCode
                return (
                  <button
                    key={cls.classCode}
                    onClick={() => {
                      setOpenClass(cls.classCode)
                      setTimeout(() => {
                        const el = document.getElementById(`ajira-class-${cls.classCode}`)
                        if (el && typeof el.scrollIntoView === 'function') {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }, 80)
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-[11.5px] font-extrabold text-white bg-gradient-to-r ${t.card} shadow-sm active:scale-95 transition ${isActive ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                    aria-label={`Jump to ${t.name}`}
                  >
                    <span className="mr-0.5">{t.emoji}</span>
                    {cls.classCode === 0 ? 'BV' : `Class ${cls.classCode}`}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty (holiday / out-of-range) state — never shown when the paywall is up */}
      {mode === 'day' && !loading && !locked && payload && payload.classes.length === 0 && (
        <div className="px-4 mt-6">
          <Card className="p-5 rounded-2xl border-2 border-dashed text-center">
            <div className="text-5xl">🏖️</div>
            <p className="font-extrabold text-lg mt-2">ଏହି ଦିନ ପାଇଁ କୌଣସି ପାଠ ଯୋଜନା ନାହିଁ</p>
            <p className="text-sm text-muted-foreground mt-1">No lesson plan is scheduled for <b>{fmtLongDate(date)}</b>.</p>
            <p className="text-[11px] text-muted-foreground mt-1">This might be a Sunday, a public holiday, or outside the academic session.</p>
            {payload.neighbours && (payload.neighbours.prevDate || payload.neighbours.nextDate) && isAdminLike && (
              <div className="flex gap-2 mt-4 justify-center flex-wrap">
                {payload.neighbours.prevDate && (
                  <Button size="sm" variant="outline" onClick={() => jumpTo(payload.neighbours.prevDate)} className="rounded-xl">
                    <ChevronLeft className="w-4 h-4 mr-1" /> {fmtLongDate(payload.neighbours.prevDate)}
                  </Button>
                )}
                {payload.neighbours.nextDate && (
                  <Button size="sm" variant="outline" onClick={() => jumpTo(payload.neighbours.nextDate)} className="rounded-xl">
                    {fmtLongDate(payload.neighbours.nextDate)} <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            )}
            {!isAdminLike && (payload.neighbours && (payload.neighbours.prevDate || payload.neighbours.nextDate)) && (
              <p className="text-[10.5px] text-muted-foreground mt-3">
                Try <b>← Yesterday</b> or <b>Tomorrow →</b> above for the closest working day.
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Class cards — day view */}
      {mode === 'week' && !loading && weekPayload && (
        <div className="px-4 mt-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11.5px] font-bold text-muted-foreground">
              🗓️ Week: <b>{weekPayload.weekStart}</b> → <b>{weekPayload.weekEnd}</b>
            </p>
            <p className="text-[10px] text-muted-foreground">Tap a day to expand</p>
          </div>
          {weekPayload.days.map((day) => {
            const isToday = day.dateISO === weekPayload.todayISO
            const dayOpen = openClass === `week-${day.dateISO}`
            const totalPeriods = day.classes.reduce((s, c) => s + (c.periods?.length || 0), 0)
            return (
              <Card key={day.dateISO} className={`rounded-2xl overflow-hidden border-2 shadow-sm ${isToday ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
                <button
                  onClick={() => setOpenClass(dayOpen ? null : `week-${day.dateISO}`)}
                  className={`w-full text-left p-3 flex items-center gap-3 ${isToday ? 'bg-primary/5' : 'bg-card'}`}
                  aria-expanded={dayOpen}
                >
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-extrabold ${isToday ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    <span className="text-[10px] leading-none">{day.dayOfWeek}</span>
                    <span className="text-base leading-tight">{day.dateISO.slice(8)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-extrabold truncate">{fmtLongDate(day.dateISO)}{isToday && <span className="ml-1.5 text-[9.5px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground align-middle">TODAY</span>}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {day.classes.length > 0 ? `${day.classes.length} classes · ${totalPeriods} periods` : '🏖️ No lesson plans scheduled'}
                    </p>
                    {day.classes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {day.classes.map((c) => {
                          const t = CLASS_THEMES[c.classCode] || CLASS_THEMES[1]
                          return (
                            <span key={c.classCode} className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-r ${t.card} text-white`}>
                              {t.emoji} {c.classCode === 0 ? 'BV' : `C${c.classCode}`}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {dayOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                <AnimatePresence initial={false}>
                  {dayOpen && day.classes.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      <div className="p-3 border-t space-y-2 bg-muted/40">
                        {day.classes.map((cls) => {
                          const theme = CLASS_THEMES[cls.classCode] || CLASS_THEMES[1]
                          const subjectsUnique = Array.from(new Set(cls.periods.map(p => p.subject)))
                          return (
                            <div key={cls.classCode} className={`rounded-xl overflow-hidden bg-gradient-to-r ${theme.card} text-white shadow-sm`}>
                              <button
                                onClick={() => { setMode('day'); setDate(day.dateISO); setOpenClass(cls.classCode); toast.success(`Opening ${theme.name.split('(')[0].trim()} for ${day.dateISO}`) }}
                                className="w-full text-left p-2.5 flex items-center gap-2"
                              >
                                <div className="text-xl shrink-0">{theme.emoji}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-extrabold text-[12px] truncate">{theme.name}</p>
                                  <p className="text-[10px] opacity-90 truncate">
                                    {cls.periods.length} periods · {subjectsUnique.slice(0, 3).map(s => s.split(/[(（]/)[0].trim()).join(', ')}{subjectsUnique.length > 3 ? ` +${subjectsUnique.length - 3}` : ''}
                                  </p>
                                </div>
                                <ChevronRight className="w-4 h-4 shrink-0 opacity-90" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            )
          })}
        </div>
      )}

      {mode === 'day' && !loading && payload && payload.classes.length > 0 && (
        <div className="px-4 mt-4 space-y-4">
          {payload.classes.map((cls) => {            const theme = CLASS_THEMES[cls.classCode] || CLASS_THEMES[1]
            const isOpen = openClass === null || openClass === cls.classCode
            return (
              <motion.div
                key={cls.classCode}
                id={`ajira-class-${cls.classCode}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Card className="rounded-3xl border-0 shadow-lg overflow-hidden">
                  {/* Colourful class header */}
                  <button
                    onClick={() => setOpenClass(isOpen ? null : cls.classCode)}
                    className={`w-full text-left bg-gradient-to-r ${theme.card} text-white p-4 flex items-center gap-3`}
                    aria-expanded={isOpen}
                  >
                    <div className="text-4xl leading-none">{theme.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-lg leading-tight truncate">{theme.name}</p>
                      <p className="text-[11px] opacity-90 truncate">
                        {cls.dateText} · {cls.dayName} · ସପ୍ତାହ-{cls.weekNo} · ଶିକ୍ଷାଦାନ ଦିବସ-{cls.teachingDayNo}
                      </p>
                      <p className="text-[10.5px] opacity-90 mt-0.5">{cls.periods.length} periods · {new Set(cls.periods.map(p => p.subject)).size} subjects</p>
                    </div>
                    {isOpen ? <ChevronUp className="w-5 h-5 shrink-0" /> : <ChevronDown className="w-5 h-5 shrink-0" />}
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className={`bg-gradient-to-b ${theme.soft}`}
                      >
                        <div className="p-3 flex items-center justify-end gap-2 border-b border-black/5 dark:border-white/5">
                          <Button size="sm" variant="outline" onClick={() => openLandscapeView(cls)} className="rounded-xl h-8 text-[11px]">
                            <Maximize2 className="w-3.5 h-3.5 mr-1" /> Landscape View
                          </Button>
                        </div>

                        <div className="p-3 space-y-2.5">
                          {cls.periods.map((p, idx) => {
                            const key = `${cls.classCode}-${idx}`
                            const opened = !!openPeriod[key]
                            const dir = subjectDir(p.subject)
                            const codes = collectCodes(p)
                            return (
                              <div key={idx} className={`rounded-2xl bg-card border-2 ${theme.ring} border-opacity-40 shadow-sm overflow-hidden`}>
                                <button
                                  onClick={() => setOpenPeriod(s => ({ ...s, [key]: !s[key] }))}
                                  className="w-full text-left p-3 flex items-start gap-3 relative"
                                  aria-expanded={opened}
                                >
                                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${theme.card} text-white font-extrabold flex flex-col items-center justify-center text-xs shrink-0 shadow-md`}>
                                    <span className="text-[9px] font-medium opacity-90 -mb-0.5">Period</span>
                                    <span className="text-base leading-none">{p.periodNo}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className={`font-extrabold text-[13.5px] leading-tight ${theme.accent}`} lang={dir}>{p.subject}</p>
                                    </div>
                                    <p className="text-[10.5px] text-muted-foreground mt-0.5 flex items-center gap-1">🕒 {p.time}</p>
                                    {p.lessonLines?.[0] && (
                                      <p className="text-[11.5px] mt-1 line-clamp-1 font-medium flex items-start gap-1">
                                        <BookOpen className="w-3 h-3 mt-0.5 opacity-70 shrink-0" />
                                        <span className="truncate" lang={dir}>{p.lessonLines[0]}</span>
                                      </p>
                                    )}
                                    {codes.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {codes.slice(0, 3).map((c, i) => {
                                          const s = CODE_STYLES[c.prefix] || CODE_STYLES._
                                          return (
                                            <span
                                              key={i}
                                              className={`text-[9.5px] px-1.5 py-0.5 rounded-md font-bold border ${s.screen}`}
                                            >
                                              {c.label}
                                            </span>
                                          )
                                        })}
                                        {codes.length > 3 && (
                                          <span className="text-[9.5px] px-1.5 py-0.5 rounded-md font-bold bg-muted text-muted-foreground">+{codes.length - 3}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {opened ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                                </button>

                                <AnimatePresence initial={false}>
                                  {opened && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.18 }}
                                    >
                                      <div className="px-3 pb-3 pt-1 text-[12px] space-y-3">
                                        {/* Lesson topic + curriculum codes */}
                                        <div className="rounded-xl bg-white/70 dark:bg-black/20 p-2.5">
                                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                            <BookOpen className="w-3 h-3" /> ପାଠ / ପ୍ରସଙ୍ଗ
                                          </p>
                                          {(p.lessonLines || []).map((l, i) => (
                                            <p key={i} className="text-[12.5px] font-semibold mt-1 leading-snug" lang={dir}>{l}</p>
                                          ))}
                                          {(() => {
                                            const codes = collectCodes(p)
                                            if (!codes.length) return null
                                            return (
                                              <div className="flex flex-wrap gap-1.5 mt-2">
                                                {codes.map((c, i) => {
                                                  const s = CODE_STYLES[c.prefix] || CODE_STYLES._
                                                  return (
                                                    <span
                                                      key={i}
                                                      className={`text-[10.5px] px-2 py-0.5 rounded-full font-extrabold border ${s.screen} shadow-sm`}
                                                      title={c.label}
                                                    >
                                                      {c.prefix === 'LO' && <Target className="w-2.5 h-2.5 inline mr-0.5" />}
                                                      {c.label}
                                                    </span>
                                                  )
                                                })}
                                              </div>
                                            )
                                          })()}
                                        </div>

                                        {p.tlm && (
                                          <div className="rounded-xl bg-white/70 dark:bg-black/20 p-2.5">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">🎒 TLM · Teaching Aids</p>
                                            <p className="text-[11.5px] mt-0.5 leading-snug" lang={dir}>{p.tlm}</p>
                                          </div>
                                        )}

                                        {/* Panchapadi steps — the heart of Odisha's SCERT-approved format */}
                                        {(p.panchapadi || []).length > 0 && (
                                          <div className="rounded-xl bg-white/70 dark:bg-black/20 p-2.5">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                              <Sparkles className="w-3 h-3" /> ପଞ୍ଚପଦୀ ସୋପାନ
                                            </p>
                                            <ol className="mt-1.5 space-y-1.5">
                                              {p.panchapadi.map((raw, i) => {
                                                const { idx, label, body } = splitPanchapadi(raw)
                                                const stepIdx = (idx ? idx - 1 : i) % 5
                                                const tone = PANCHAPADI_TONES[stepIdx]
                                                return (
                                                  <li
                                                    key={i}
                                                    className={`text-[11.5px] leading-snug rounded-r-lg border-l-[3px] ${tone.bar} bg-primary/5 px-2 py-1.5`}
                                                    lang="or"
                                                  >
                                                    {label ? (
                                                      <>
                                                        <span className={`inline-block font-extrabold text-[11.5px] px-2 py-0.5 rounded-md mr-1.5 mb-0.5 ${tone.badge}`}>
                                                          {idx ? `${idx}. ` : ''}{label}
                                                        </span>
                                                        <span className="text-foreground/90">{body}</span>
                                                      </>
                                                    ) : body}
                                                  </li>
                                                )
                                              })}
                                            </ol>
                                          </div>
                                        )}

                                        {(p.assessment || p.homework) && (
                                          <div className="rounded-xl bg-white/70 dark:bg-black/20 p-2.5">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                              <ClipboardList className="w-3 h-3" /> ମୂଲ୍ୟାୟନ ଓ ଗୃହକାର୍ଯ୍ୟ
                                            </p>
                                            {p.assessment && <p className="text-[11.5px] mt-0.5 leading-snug" lang="or">{p.assessment}</p>}
                                            {p.homework && (
                                              <p className="text-[11.5px] mt-1 leading-snug" lang="or">
                                                <b>ଗୃହକାର୍ଯ୍ୟ:</b> {p.homework}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )
                          })}

                          {cls.note && (
                            <div className="rounded-xl border border-dashed p-2.5 bg-white/50 dark:bg-black/10">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Teacher Note
                              </p>
                              <p className="text-[11px] mt-0.5 leading-snug" lang="or">{cls.note}</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default AjiraPathyaJojanaView
