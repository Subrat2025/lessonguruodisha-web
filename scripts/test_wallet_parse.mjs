import { MongoClient } from 'mongodb'
import { setManualBalance, getWalletState, getSendSettings, estimateSend } from '../lib/wa-send-core.js'

const cli = new MongoClient(process.env.MONGO_URL)
await cli.connect()
const d = cli.db(process.env.DB_NAME)

// 1) Simulate the exact endpoint parse for "2,782.46" (string with comma).
const raw = '2,782.46'
const n = Number(String(raw).replace(/[₹,\s]/g, ''))
console.log('parsed from comma-string:', n)
await setManualBalance(d, n)
let w = await getWalletState(d)
console.log('after PUT -> balance:', w.balance, '| stale:', w.stale, '| spendable:', w.spendable, '| low:', w.low)

// 2) Round-trip read (what GET returns).
const s = await getSendSettings(d)
console.log('stored settings.balance:', s.balance, '| balanceUpdatedAt:', s.balanceUpdatedAt)

// 3) Invalid should be rejected by setManualBalance.
let threw = false
try { await setManualBalance(d, 'abc') } catch (e) { threw = true; console.log('invalid "abc" rejected:', e.message) }
console.log('invalid rejected?', threw)

// 4) estimate still correct after fix.
const est = await estimateSend(d, 10, 'marketing')
console.log('estimate 10 marketing -> estCost:', est.estCost, '| balanceAfter:', est.balanceAfter, '| canSend:', est.canSend)

// Leave balance at the correct value.
await setManualBalance(d, 2782.46)
w = await getWalletState(d)
console.log('FINAL balance:', w.balance)
await cli.close()
