# Partner Activation API — Teacher Utility Toolkit → Lesson Guru

Server-to-server API the **Toolkit** calls to grant / revoke **Lesson Guru Premium**
when a teacher buys a combo on the Toolkit.

| Combo | Price (set on Toolkit) | `comboType` | Grants on Lesson Guru |
|-------|------------------------|-------------|------------------------|
| Combo Master | ₹999 | `master` | Premium for 365 days |
| Combo Duo | ₹699 | `duo` | Premium for 365 days |

Both give **365 days of Lesson Guru Premium**, stacked **after** any current expiry.
`comboType` is metadata on the Lesson Guru side (the Teacher Utility PRO / MDM
Sahayak PRO products live on the Toolkit).

## Base URL (never hardcode)

The Toolkit MUST read the Lesson Guru base URL from a setting:

```
LESSONGURU_BASE_URL
  • Toolkit PREVIEW → Lesson Guru PREVIEW URL
  • Toolkit LIVE    → https://lessonguruodisha.in
```

Endpoints: `POST {LESSONGURU_BASE_URL}/api/partner/grant`, `POST {LESSONGURU_BASE_URL}/api/partner/revoke`.

## Shared secret

`PARTNER_GRANT_SECRET` is stored only in the Lesson Guru environment. Copy the
same value into the Toolkit environment. **Never commit it or log it.**

## Signing

`X-Signature: <hex>` = `HMAC_SHA256(rawRequestBodyString, PARTNER_GRANT_SECRET)`.

- Sign the **exact raw JSON string** you send (byte-for-byte). Do not re-stringify
  after signing — send the same string you signed.
- Verification is constant-time. An optional `sha256=` prefix is accepted.

## 1) Grant — `POST /api/partner/grant`

```json
{
  "phone": "9876543210",
  "name": "Teacher Name",
  "days": 365,
  "orderId": "TUT-ORDER-12345",
  "comboType": "master",
  "source": "toolkit_combo",
  "ts": 1718000000000
}
```

Rules / rejections:

| Condition | Response |
|-----------|----------|
| Bad / missing signature | `401 { error: "Invalid signature" }` |
| Kill switch OFF (default) | `403 { error: "Partner grant disabled" }` |
| `ts` older/newer than 5 min (sec or ms) | `400 { error: "Stale or invalid timestamp" }` |
| `days` not exactly 365 | `400 { error: "days must be 365" }` |
| `comboType` not `master`/`duo` | `400 { error: "Invalid comboType" }` |
| phone not a valid Indian mobile (10 digits, starts 6-9) | `400 { error: "Invalid phone" }` |

Success:

```json
{ "ok": true, "created": false, "orderId": "TUT-ORDER-12345",
  "status": "active", "comboType": "master", "days": 365,
  "expiryDate": "2026-06-10T00:00:00.000Z" }
```

- **Idempotent**: calling again with the same `orderId` returns the same record
  (`idempotent: true`) and never adds days twice.
- If no user has that phone, a Lesson Guru account is created (`created: true`,
  `source: "toolkit_combo"`). The teacher can set a password later via recovery.
- Sends the existing `order_confirmed` WhatsApp (UTILITY) template.

## 2) Revoke — `POST /api/partner/revoke`

```json
{ "orderId": "TUT-ORDER-12345", "ts": 1718000000000 }
```

- Signature required; `ts` freshness required.
- **Not** blocked by the kill switch (refunds are always reversible).
- Removes exactly the days granted for that `orderId`. Silent (audit log only).
- Idempotent: `{ ok: true, revoked: false, reason: "already_revoked" }` on repeat.

Success: `{ "ok": true, "revoked": true, "newExpiry": "..." }`

## Node example (Toolkit side)

```js
const crypto = require('crypto')

async function grantCombo({ phone, name, orderId, comboType }) {
  const base = process.env.LESSONGURU_BASE_URL // preview or https://lessonguruodisha.in
  const secret = process.env.PARTNER_GRANT_SECRET
  const payload = {
    phone, name, days: 365, orderId, comboType,
    source: 'toolkit_combo', ts: Date.now(),
  }
  const raw = JSON.stringify(payload)              // sign the EXACT bytes you send
  const signature = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex')

  const res = await fetch(`${base}/api/partner/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body: raw,
  })
  return res.json()
}

async function revokeCombo({ orderId }) {
  const base = process.env.LESSONGURU_BASE_URL
  const secret = process.env.PARTNER_GRANT_SECRET
  const raw = JSON.stringify({ orderId, ts: Date.now() })
  const signature = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
  const res = await fetch(`${base}/api/partner/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body: raw,
  })
  return res.json()
}
```

## Admin

- **Admin → Referrals tab → "Partner Activations"** card: list (date, phone last 4,
  combo, days, order id, status), CSV export, and the kill switch (default OFF).
- The kill switch stays **OFF on LIVE** until turned on from the admin panel.
