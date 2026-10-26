const BASE = 'http://localhost:3000'
async function j(path, opts={}) { const r = await fetch(BASE+path, opts); const t = await r.text(); let d=null; try{d=JSON.parse(t)}catch{}; return {status:r.status,d,raw:t.slice(0,300)} }

// login admin
const login = await j('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ mobile:'9692604577', password:'Subrat@909e' }) })
const token = login.d?.token || login.d?.accessToken
console.log('login', login.status, 'token?', !!token)
const H = { headers:{ authorization:'Bearer '+token } }

const acc = await j('/api/admin/store/sets/rollout-access', H)
console.log('rollout-access', acc.status, JSON.stringify(acc.d))

const plan = await j('/api/admin/store/sets/switch-plan', H)
console.log('switch-plan', plan.status, 'chapters:', plan.d?.plan?.chaptersCount, 'sets:', plan.d?.plan?.setsCount, 'packs:', plan.d?.plan?.packsCount, 'warnings:', plan.d?.plan?.warnings?.length)
const packUp = (plan.d?.plan?.packPlan||[]).filter(p=>p.from!==p.to)
console.log('pack changes that would apply:', packUp.length, JSON.stringify(packUp.slice(0,6)))
console.log('chByCls:', JSON.stringify(plan.d?.plan?.chByCls))

const rp = await j('/api/admin/store/sets/restore-points', H)
console.log('restore-points', rp.status, 'count:', rp.d?.points?.length, 'super:', rp.d?.super)
