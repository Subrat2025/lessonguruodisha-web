# WhatsApp Template — Ajira Pathya Jojana Add-On Receipt

Submit this template to Bulkymarketing (which forwards to Meta for approval).
The current codebase already calls it as **`ajira_addon_success`** in
`/app/app/api/[[...path]]/route.js` right after a successful add-on payment,
so once Meta approves it, receipts start flowing automatically.

---

## 🔑 Meta / Bulkymarketing Submission Fields

| Field           | Value                                       |
|-----------------|---------------------------------------------|
| Template name   | `ajira_addon_success`                       |
| Category        | **UTILITY** (payment confirmation)          |
| Language        | English (US) — `en_US`                      |
| Header          | *(none)* — keep it text-only for fast approval |
| Body            | See "Body Text" below                       |
| Footer          | `Lesson Guru Odisha · lessonguruodisha.in`  |
| Buttons         | 1 × URL button (see below) — optional but recommended |

---

## 📝 Body Text (copy verbatim)

```
Hi {{1}}, ✅ Your Ajira Pathya Jojana add-on is now active!

💰 Amount paid: {{2}}
📅 Valid till: {{3}}

Open the app and start planning your Panchapadi lessons for Class 1–5.

Need help? Reply to this message.
```

### Variable Samples (Meta requires these for approval)

| Placeholder | Sample value       | Example in message                |
|-------------|--------------------|-----------------------------------|
| `{{1}}`     | `Subrat`           | teacher's name                    |
| `{{2}}`     | `₹99`              | amount paid (already prefixed)    |
| `{{3}}`     | `03 Aug 2027`      | expiry date (dd MMM yyyy)         |

---

## 🔗 Optional URL Button (recommended — improves CTR)

| Field       | Value                                |
|-------------|--------------------------------------|
| Button type | **URL**                              |
| Button text | `Open Ajira Pathya Jojana`           |
| URL         | `https://lessonguruodisha.in/ajira-pathya-jojana` |

*No dynamic variable in the URL — a static button gets approved fastest.*

---

## 🚨 Why UTILITY (not MARKETING)?

Meta's UTILITY category is for **transactional** messages tied to a user action
(payment confirmations, appointment reminders, order updates). This receipt is
sent immediately after a purchase, so it fits perfectly. UTILITY templates:
- Approve **within 15–30 min** (vs 24–48h for MARKETING)
- Have **higher deliverability** and no send-window restrictions
- Cost less per message

---

## ✅ After Approval — How to Verify

1. Log into Admin → **🌅 Ajira Pathya Jojana** → **⚙️ Settings & Pricing**
2. Scroll to the **"WhatsApp Receipt"** section and tap **Send Test Receipt**
3. You'll receive the message on the admin mobile within 5–10 seconds
4. From that moment onward, every successful ₹99/₹199 purchase triggers this
   receipt automatically (best-effort — a template failure never blocks the
   payment verification response)

---

## 🛠️ If You Want to Change the Template Later

- Keep the same **template name** `ajira_addon_success` (or change both the
  template on Bulkymarketing AND the string in `route.js` — search for
  `template_id: 'ajira_addon_success'`)
- Keep the same **number of variables** (3) unless you also update the code
  that calls it (variables passed: name, amount, expiry-date)
