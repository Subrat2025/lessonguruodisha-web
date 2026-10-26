# Teacher Utility Toolkit → Lesson Guru Auto-Login (SSO)

The Toolkit mints a short-lived, single-use token and opens:

- **Preview:** `https://odisha-learning-pro.preview.emergentagent.com/sso/toolkit?token=<TOKEN>`
- **Live:**    `https://lessonguruodisha.in/sso/toolkit?token=<TOKEN>`

Lesson Guru verifies the token and signs the teacher in (same session as OTP login),
then sends them to the lessons home (if Premium is active) or the Premium plans page.

## Token format

```
TOKEN = base64url(JSON payload) + "." + hex HMAC-SHA256(base64url_payload_string, LG_SSO_SECRET)
```

`LG_SSO_SECRET` is the shared secret (set on the Lesson Guru side; keep it only in the
Toolkit backend env — never ship it to the browser).

### Payload (JSON)

| field  | type   | rule                                                                 |
|--------|--------|----------------------------------------------------------------------|
| phone  | string | Indian mobile; normalized to last 10 digits, must start 6–9          |
| name   | string | optional; used only when creating a brand-new account                |
| iat    | number | issued-at, epoch **milliseconds**                                    |
| exp    | number | expiry, epoch **milliseconds**; `exp - iat` must be **≤ 60000 (60s)**|
| nonce  | string | unique per token (e.g. a UUID) — single use, cannot be replayed      |
| src    | string | must be exactly `"toolkit"`                                          |

Rules enforced by Lesson Guru (any failure → no login, "Link expired" page):
- signature must match (constant-time check)
- `exp - iat ≤ 60s` and token not expired
- `nonce` not seen before (remembered for 10 minutes)
- valid Indian mobile; `src === "toolkit"`
- admin / blocked / deleted accounts are never auto-logged-in

Always generate the token **just before** redirecting the user (it lives ~60s).

## Node example

```js
const crypto = require('crypto')

// Keep this only in the Toolkit backend env. Placeholder name shown here.
const LG_SSO_SECRET = process.env.LG_SSO_SECRET

function makeLessonGuruSsoUrl({ phone, name, baseUrl }) {
  const now = Date.now()
  const payload = {
    phone,                       // e.g. "9876543210"
    name: name || '',            // optional
    iat: now,
    exp: now + 60 * 1000,        // 60 seconds
    nonce: crypto.randomUUID(),  // unique, single-use
    src: 'toolkit',
  }

  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', LG_SSO_SECRET).update(b64).digest('hex')
  const token = `${b64}.${sig}`

  return `${baseUrl}/sso/toolkit?token=${encodeURIComponent(token)}`
}

// Preview:
// makeLessonGuruSsoUrl({ phone: '9876543210', name: 'Sunil', baseUrl: 'https://odisha-learning-pro.preview.emergentagent.com' })
// Live:
// makeLessonGuruSsoUrl({ phone: '9876543210', name: 'Sunil', baseUrl: 'https://lessonguruodisha.in' })
```

Open the returned URL (full-page redirect or `window.location = url`). Do not cache or reuse the URL.
