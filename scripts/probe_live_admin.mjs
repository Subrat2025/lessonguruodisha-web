// READ-ONLY probe of LIVE production via its own admin API (admin creds), plus public reads.
const LIVE = 'https://lessonguruodisha.in'
const ADMIN_MOBILE = '9692604577'
const ADMIN_PASS = 'Subrat@909e'

async function jfetch(path, opts={}) {
  const r = await fetch(LIVE + path, opts)
  const t = await r.text(); let j=null; try{ j=JSON.parse(t) }catch{}
  return { status:r.status, j, raw:t.slice(0,300) }
}

// 1) login
let token=null
for (const body of [
  { mobile: ADMIN_MOBILE, password: ADMIN_PASS },
  { identifier: ADMIN_MOBILE, password: ADMIN_PASS },
  { phone: ADMIN_MOBILE, password: ADMIN_PASS },
]) {
  const r = await jfetch('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
  if (r.j?.token || r.j?.accessToken || r.j?.jwt) { token = r.j.token||r.j.accessToken||r.j.jwt; console.log('LOGIN OK with keys', Object.keys(body)); break }
  console.log('login try', Object.keys(body), '->', r.status, r.raw?.slice(0,120))
}
if (!token) { console.log('!! could not login to LIVE admin; aborting admin reads'); }

const AH = token ? { headers:{ authorization:'Bearer '+token } } : {}

// 2) LIVE admin settings (setsLive)
if (token) {
  const s = await jfetch('/api/admin/store/settings', AH)
  console.log('\n=== LIVE admin settings ===', s.status, 'setsLive:', s.j?.settings?.setsLive, 'enabled:', s.j?.settings?.enabled)
}

// 3) LIVE sets count via admin unit-tests reference / or public
const ref = await jfetch('/api/admin/store/unit-tests/reference', AH)
console.log('\n=== LIVE sets reference ===', ref.status, ref.raw?.slice(0,200))

// 4) public: chapters for a class to read totalSets + single chapter price
const ch = await jfetch('/api/store/unit-tests/chapters?cls=2&subjectKey=math')
console.log('\n=== LIVE chapters cls2 math ===', ch.status, 'totalSets:', ch.j?.totalSets, 'chapterCount:', ch.j?.chapterCount)
if (ch.j?.chapters?.[0]) {
  const c0 = ch.j.chapters[0]
  console.log('first chapter sample:', JSON.stringify({ title:c0.chapterTitle, setCount:c0.setCount, bundle:c0.bundle, sets:(c0.sets||[]).length }).slice(0,300))
}

// 5) product count of sets on live (admin unit-tests list)
if (token) {
  const lst = await jfetch('/api/admin/store/unit-tests?class=1', AH)
  const items = lst.j?.items || lst.j?.products || []
  console.log('\n=== LIVE admin unit-tests class1 count ===', lst.status, 'items:', items.length)
}

// 6) LIVE orders (admin) read-only
if (token) {
  const ord = await jfetch('/api/admin/store/orders', AH)
  const list = ord.j?.orders || ord.j?.items || []
  console.log('\n=== LIVE orders (admin) ===', ord.status, 'count:', list.length)
  for (const o of list.slice(0,20)) {
    const items = o.items||[]
    console.log(`${o.createdAt} | ${o.status} | sim=${o.simulated?1:0} | ₹${o.total} | ${o.userMobile||''} | ${items.map(it=>`${it.type||'?'}@₹${it.price}`).join(', ').slice(0,120)}`)
  }
}
