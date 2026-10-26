import { backgroundJobsDisabled } from './background-jobs.js'
// =============================================================================
//  Smart WhatsApp Message Queue Engine
//  ---------------------------------------------------------------------------
//  Persistent, self-healing background worker that drains msgQueueItems by
//  calling UltraMsg with configurable delays, batch pauses, daily limits, and
//  automatic retries.  Survives Next.js hot-reload via globalThis.__msgWorker.
//
//  Public API (called from route handlers):
//    getSettings(d)                      → object
//    updateSettings(d, patch, adminId)   → object
//    createQueue(d, params, admin)       → { queue, itemCount }
//    startQueue(d, queueId)              → queue
//    pauseQueue(d, queueId)              → queue
//    resumeQueue(d, queueId)             → queue
//    stopQueue(d, queueId)               → queue
//    retryFailed(d, queueId)             → { count }
//    getQueueStats(d, queueId)           → { kpis, progress, dailyCount }
//    listQueueItems(d, queueId, opts)    → { items, total }
//    ensureWorker(d)                     → starts the tick loop (idempotent)
// =============================================================================

import { v4 as uuidv4 } from 'uuid'
import { sendWhatsApp } from '@/lib/ultramsg.js'

// ------------------------- Default settings --------------------------------
export const DEFAULT_SETTINGS = {
  id: 'default',
  minDelaySec: 40,
  maxDelaySec: 120,
  randomDelay: true,
  batchSize: 20,
  batchPauseMin: 3,
  dailyLimit: 20,
  retryEnabled: true,
  maxRetries: 3,
  retryIntervalMin: 5,
  updatedAt: null,
  updatedBy: null,
}

// ------------------------- Helpers -----------------------------------------
const isoDayIST = () => {
  // Compute today's date in Asia/Kolkata (IST = UTC+05:30) → YYYY-MM-DD
  const now = new Date()
  const ist = new Date(now.getTime() + (5.5 * 60 - now.getTimezoneOffset()) * 60000)
  return ist.toISOString().slice(0, 10)
}

const renderTemplate = (tpl, user) => {
  const safe = (v) => String(v ?? '').trim()
  return String(tpl || '')
    .replace(/\{name\}/gi, safe(user?.name) || 'Teacher')
    .replace(/\{mobile\}/gi, safe(user?.mobile))
    .replace(/\{class\}/gi, safe(user?.classesTaught?.[0] || user?.class || ''))
    .replace(/\{email\}/gi, safe(user?.email))
    .replace(/\{link\}/gi, 'https://lessonguruodisha.in')
    .replace(/\{site\}/gi, 'https://lessonguruodisha.in')
}

// ------------------------- Settings ----------------------------------------
export async function getSettings(d) {
  const doc = await d.collection('msgQueueSettings').findOne({ id: 'default' }, { projection: { _id: 0 } })
  if (!doc) {
    await d.collection('msgQueueSettings').insertOne({ ...DEFAULT_SETTINGS, updatedAt: new Date() })
    return { ...DEFAULT_SETTINGS, updatedAt: new Date() }
  }
  return doc
}

export async function updateSettings(d, patch, adminId) {
  const cur = await getSettings(d)
  const num = (v, min, max, fallback) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < min || n > max) return fallback
    return n
  }
  const next = {
    ...cur,
    minDelaySec: num(patch.minDelaySec, 1, 3600, cur.minDelaySec),
    maxDelaySec: num(patch.maxDelaySec, 1, 3600, cur.maxDelaySec),
    randomDelay: !!patch.randomDelay,
    batchSize: num(patch.batchSize, 1, 10000, cur.batchSize),
    batchPauseMin: num(patch.batchPauseMin, 0, 1440, cur.batchPauseMin),
    dailyLimit: num(patch.dailyLimit, 1, 100000, cur.dailyLimit),
    retryEnabled: !!patch.retryEnabled,
    maxRetries: num(patch.maxRetries, 0, 20, cur.maxRetries),
    retryIntervalMin: num(patch.retryIntervalMin, 1, 1440, cur.retryIntervalMin),
    updatedAt: new Date(),
    updatedBy: adminId,
  }
  if (next.minDelaySec > next.maxDelaySec) next.maxDelaySec = next.minDelaySec
  await d.collection('msgQueueSettings').updateOne({ id: 'default' }, { $set: next }, { upsert: true })
  return next
}

// ------------------------- Audience resolution -----------------------------
async function resolveAudience(d, audience) {
  const t = audience?.type || 'no_plan'
  const now = new Date()
  let users = []
  if (t === 'no_plan') {
    users = await d.collection('users').find({
      $or: [
        { 'subscription.status': { $ne: 'active' } },
        { 'subscription.expiryDate': { $lte: now } },
        { subscription: { $exists: false } },
      ],
      role: { $ne: 'admin' },
    }, { projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1, classesTaught: 1 } }).toArray()
  } else if (t === 'expired') {
    users = await d.collection('users').find({
      'subscription.status': 'expired',
      role: { $ne: 'admin' },
    }, { projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1, classesTaught: 1 } }).toArray()
  } else if (t === 'recent') {
    const cutoff = new Date(now.getTime() - 7 * 86400000)
    users = await d.collection('users').find({
      createdAt: { $gte: cutoff },
      role: { $ne: 'admin' },
    }, { projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1, classesTaught: 1 } }).toArray()
  } else if (t === 'all') {
    users = await d.collection('users').find({ role: { $ne: 'admin' } }, {
      projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1, classesTaught: 1 }
    }).toArray()
  } else if (t === 'custom') {
    const nums = (audience.mobiles || []).map(m => String(m).replace(/\D/g, '').slice(-10)).filter(Boolean)
    if (nums.length === 0) return []
    const found = await d.collection('users').find({ mobile: { $in: nums } }, {
      projection: { _id: 0, id: 1, name: 1, mobile: 1, email: 1, classesTaught: 1 }
    }).toArray()
    // Include mobiles not in DB as anonymous recipients
    const foundMobiles = new Set(found.map(u => u.mobile))
    const anon = nums.filter(m => !foundMobiles.has(m)).map(m => ({ id: null, name: '', mobile: m, email: '', classesTaught: [] }))
    users = [...found, ...anon]
  }
  // De-duplicate by mobile
  const seen = new Set()
  return users.filter(u => {
    const m = String(u.mobile || '').replace(/\D/g, '')
    if (!m || seen.has(m)) return false
    seen.add(m)
    return true
  })
}

// ------------------------- Queue lifecycle ---------------------------------
export async function createQueue(d, { name, templateBody, audience }, admin) {
  if (!templateBody || String(templateBody).trim().length < 5) throw new Error('Template body too short')
  const users = await resolveAudience(d, audience)
  if (users.length === 0) throw new Error('Audience has 0 recipients')

  const queueId = uuidv4()
  const queue = {
    id: queueId,
    name: name || `Campaign · ${new Date().toLocaleString('en-IN')}`,
    templateBody,
    audience: audience || { type: 'no_plan' },
    status: 'draft', // 'draft'|'running'|'paused'|'stopped'|'completed'
    totalCount: users.length,
    sentCount: 0,
    failedCount: 0,
    pendingCount: users.length,
    createdBy: admin?.id,
    createdByName: admin?.name || admin?.mobile,
    createdAt: new Date(),
    startedAt: null, completedAt: null,
    batchesSent: 0,
    lastSentAt: null,
    nextSendAt: null,
    dailyCounter: { date: isoDayIST(), count: 0 },
  }
  await d.collection('msgQueues').insertOne(queue)

  // Insert items in bulk
  const items = users.map(u => ({
    id: uuidv4(),
    queueId,
    userId: u.id,
    mobile: String(u.mobile || '').replace(/\D/g, ''),
    name: u.name || '',
    finalBody: renderTemplate(templateBody, u),
    status: 'pending', // 'pending'|'sending'|'sent'|'failed'|'retrying'|'cancelled'
    attempts: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    ultramsgResponse: null,
    errorMessage: null,
    createdAt: new Date(),
    sentAt: null,
  }))
  if (items.length) await d.collection('msgQueueItems').insertMany(items)

  return { queue, itemCount: items.length }
}

const setStatus = async (d, queueId, patch) => {
  await d.collection('msgQueues').updateOne({ id: queueId }, { $set: patch })
  return d.collection('msgQueues').findOne({ id: queueId }, { projection: { _id: 0 } })
}

export const startQueue = (d, queueId) => setStatus(d, queueId, { status: 'running', startedAt: new Date() })
export const pauseQueue = (d, queueId) => setStatus(d, queueId, { status: 'paused' })
export const resumeQueue = (d, queueId) => setStatus(d, queueId, { status: 'running' })
export const stopQueue = (d, queueId) => setStatus(d, queueId, { status: 'stopped', completedAt: new Date() })

export async function retryFailed(d, queueId) {
  const r = await d.collection('msgQueueItems').updateMany(
    { queueId, status: 'failed' },
    { $set: { status: 'pending', nextRetryAt: null, errorMessage: null } }
  )
  // Reset failed counter
  await d.collection('msgQueues').updateOne(
    { id: queueId },
    [{ $set: { pendingCount: { $add: ['$pendingCount', r.modifiedCount] }, failedCount: 0 } }],
  )
  return { count: r.modifiedCount }
}

// ------------------------- Stats & listing ---------------------------------
export async function getQueueStats(d, queueId) {
  const [queue, statusCounts, sentToday] = await Promise.all([
    d.collection('msgQueues').findOne({ id: queueId }, { projection: { _id: 0 } }),
    d.collection('msgQueueItems').aggregate([
      { $match: { queueId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray(),
    d.collection('msgQueueItems').countDocuments({
      queueId,
      status: 'sent',
      sentAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
  ])
  if (!queue) return null

  const byStatus = Object.fromEntries(statusCounts.map(x => [x._id, x.count]))
  const total = queue.totalCount || 0
  const sent = byStatus.sent || 0
  const failed = byStatus.failed || 0
  const pending = byStatus.pending || 0
  const sending = byStatus.sending || 0
  const retrying = byStatus.retrying || 0
  const cancelled = byStatus.cancelled || 0

  const attempted = sent + failed
  const successRate = attempted > 0 ? Math.round((sent / attempted) * 100) : 0
  const percent = total > 0 ? Math.round(((sent + failed + cancelled) / total) * 100) : 0

  // Speed = messages/hour based on last 10 minutes of sent items
  const tenMinAgo = new Date(Date.now() - 10 * 60000)
  const recentSent = await d.collection('msgQueueItems').countDocuments({
    queueId, status: 'sent', sentAt: { $gte: tenMinAgo },
  })
  const speedPerHour = Math.round(recentSent * 6) // 10-min sample × 6

  // ETA (naive): if we know speed and pending items, estimate
  let etaMinutes = null
  if (speedPerHour > 0 && pending > 0) etaMinutes = Math.round((pending / speedPerHour) * 60)

  return {
    queue,
    kpis: { total, sent, failed, pending, sending, retrying, cancelled, sentToday, successRate, speedPerHour, etaMinutes },
    progress: { current: sent + failed + cancelled, total, percent, remaining: pending + sending + retrying },
  }
}

export async function listQueueItems(d, queueId, { status = '', limit = 50, skip = 0, search = '' } = {}) {
  const filter = { queueId }
  if (status) filter.status = status
  if (search) filter.mobile = { $regex: String(search).replace(/[^\d]/g, ''), $options: 'i' }
  const [items, total] = await Promise.all([
    d.collection('msgQueueItems').find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: 1 }).skip(skip).limit(limit).toArray(),
    d.collection('msgQueueItems').countDocuments(filter),
  ])
  return { items, total, limit, skip }
}

export async function listQueues(d) {
  return d.collection('msgQueues').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(50).toArray()
}

export async function deleteQueue(d, queueId) {
  await d.collection('msgQueueItems').deleteMany({ queueId })
  await d.collection('msgQueues').deleteOne({ id: queueId })
  return { ok: true }
}

// ---------------------------------------------------------------------------
//  BACKGROUND WORKER — survives hot-reload via globalThis singleton.
//  Ticks every 10 seconds and processes running queues.  For each running
//  queue: honors dailyLimit + batch pause + inter-message delay + retries.
// ---------------------------------------------------------------------------
const WORKER_TICK_MS = 10 * 1000
const G = globalThis
if (!G.__msgWorker) G.__msgWorker = { running: false, timer: null, dbGetter: null }

async function tickOnce(d) {
  const settings = await getSettings(d)
  const runningQueues = await d.collection('msgQueues').find({ status: 'running' }, { projection: { _id: 0 } }).toArray()
  for (const q of runningQueues) {
    try { await processQueueStep(d, q, settings) } catch (e) { console.error('[msgWorker] queue error', q.id, e.message) }
  }
  // Also process pending retries (items with nextRetryAt <= now, retrying → pending)
  const now = new Date()
  const retryRes = await d.collection('msgQueueItems').updateMany(
    { status: 'retrying', nextRetryAt: { $lte: now } },
    { $set: { status: 'pending', nextRetryAt: null } }
  )
  if (retryRes.modifiedCount > 0) {
    console.log('[msgWorker] promoted', retryRes.modifiedCount, 'retrying → pending')
  }
}

async function processQueueStep(d, queue, settings) {
  const nowDate = new Date()

  // Reset daily counter if IST day changed
  const today = isoDayIST()
  if (!queue.dailyCounter || queue.dailyCounter.date !== today) {
    queue.dailyCounter = { date: today, count: 0 }
    await d.collection('msgQueues').updateOne({ id: queue.id }, { $set: { dailyCounter: queue.dailyCounter } })
  }
  // Respect daily limit
  if (queue.dailyCounter.count >= settings.dailyLimit) {
    return // wait until tomorrow
  }
  // Respect inter-message delay (nextSendAt)
  if (queue.nextSendAt && new Date(queue.nextSendAt) > nowDate) {
    return
  }
  // Respect batch pause
  if (settings.batchSize > 0 && queue.batchesSent && queue.batchesSent >= settings.batchSize) {
    // Time to pause?
    const pauseMs = (settings.batchPauseMin || 0) * 60 * 1000
    const lastSent = queue.lastSentAt ? new Date(queue.lastSentAt).getTime() : 0
    if (Date.now() - lastSent < pauseMs) return
    // Reset batch counter after pause
    await d.collection('msgQueues').updateOne({ id: queue.id }, { $set: { batchesSent: 0 } })
    queue.batchesSent = 0
  }

  // Pop the next pending item (oldest first)
  const nextItem = await d.collection('msgQueueItems').findOne(
    { queueId: queue.id, status: 'pending' },
    { sort: { createdAt: 1 }, projection: { _id: 0 } }
  )
  if (!nextItem) {
    // No pending → check if anything remains
    const remaining = await d.collection('msgQueueItems').countDocuments({
      queueId: queue.id, status: { $in: ['pending', 'sending', 'retrying'] },
    })
    if (remaining === 0) {
      await d.collection('msgQueues').updateOne({ id: queue.id }, { $set: { status: 'completed', completedAt: new Date() } })
      console.log('[msgWorker] queue completed', queue.id)
    }
    return
  }

  // Mark as sending
  await d.collection('msgQueueItems').updateOne(
    { id: nextItem.id, status: 'pending' },
    { $set: { status: 'sending', lastAttemptAt: new Date(), attempts: (nextItem.attempts || 0) + 1 } }
  )

  const result = await sendWhatsApp({ to: nextItem.mobile, body: nextItem.finalBody })

  if (result.ok) {
    await d.collection('msgQueueItems').updateOne({ id: nextItem.id }, {
      $set: {
        status: 'sent',
        sentAt: new Date(),
        ultramsgResponse: result.ultramsg || null,
        errorMessage: null,
      },
    })
    // Compute next-send delay
    const delaySec = settings.randomDelay
      ? (settings.minDelaySec + Math.floor(Math.random() * Math.max(1, settings.maxDelaySec - settings.minDelaySec + 1)))
      : settings.minDelaySec
    const nextSendAt = new Date(Date.now() + delaySec * 1000)
    await d.collection('msgQueues').updateOne({ id: queue.id }, {
      $inc: { sentCount: 1, pendingCount: -1, batchesSent: 1, 'dailyCounter.count': 1 },
      $set: { lastSentAt: new Date(), nextSendAt },
    })
    console.log('[msgWorker] sent', nextItem.mobile, '→ next in', delaySec, 's')
  } else {
    const attempts = (nextItem.attempts || 0) + 1
    const shouldRetry = settings.retryEnabled && attempts < settings.maxRetries + 1
    if (shouldRetry) {
      const nextRetry = new Date(Date.now() + (settings.retryIntervalMin || 5) * 60 * 1000)
      await d.collection('msgQueueItems').updateOne({ id: nextItem.id }, {
        $set: {
          status: 'retrying',
          nextRetryAt: nextRetry,
          errorMessage: String(result.error || 'send failed').slice(0, 300),
          ultramsgResponse: result.ultramsg || null,
        },
      })
      console.log('[msgWorker] retry', nextItem.mobile, 'in', settings.retryIntervalMin, 'min')
    } else {
      await d.collection('msgQueueItems').updateOne({ id: nextItem.id }, {
        $set: {
          status: 'failed',
          errorMessage: String(result.error || 'send failed').slice(0, 300),
          ultramsgResponse: result.ultramsg || null,
        },
      })
      await d.collection('msgQueues').updateOne({ id: queue.id }, {
        $inc: { failedCount: 1, pendingCount: -1 },
      })
      console.log('[msgWorker] failed permanently', nextItem.mobile, result.error)
    }
  }
}

export function ensureWorker(dbGetter) {
  const g = G.__msgWorker
  g.dbGetter = dbGetter
  if (g.running || backgroundJobsDisabled()) return
  g.running = true
  g.timer = setInterval(async () => {
    try {
      const d = await g.dbGetter()
      if (d) await tickOnce(d)
    } catch (e) { console.error('[msgWorker] tick error:', e.message) }
  }, WORKER_TICK_MS)
  console.log('[msgWorker] started (tick every ' + (WORKER_TICK_MS / 1000) + 's)')
}

// Manual tick — callable from an API endpoint (e.g. cron / fallback).
export async function manualTick(d) {
  return tickOnce(d)
}
