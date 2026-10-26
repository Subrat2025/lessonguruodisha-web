#!/usr/bin/env bash
# Scans built frontend JS/CSS bundle for leaked NON-PUBLIC secret VALUES.
# Reports only key name + match count. Never prints the secret value.
set -u
ENV_FILE="/app/.env"
SCAN_DIR="/app/.next/static"

# Secrets that must NEVER appear in the browser bundle.
SENSITIVE_KEYS=(
  CLOUDINARY_API_KEY CLOUDINARY_API_SECRET
  R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_GATEWAY_SECRET R2_ACCOUNT_ID
  BULKY_APPKEY BULKY_AUTHKEY
  JWT_SECRET RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET ASSESS_RAZORPAY_WEBHOOK_SECRET
  GEMINI_API_KEY OPENAI_API_KEY
  GOOGLE_SA_PRIVATE_KEY GOOGLE_SA_CLIENT_EMAIL
  ASSESS_PDF_OWNER_PASSWORD WEBHOOK_CRON_SECRET
  ULTRAMSG_TOKEN ULTRAMSG_INSTANCE_ID
)

echo "=== Frontend bundle secret scan ==="
echo "Scan dir: $SCAN_DIR"
echo

FOUND_ANY=0
for KEY in "${SENSITIVE_KEYS[@]}"; do
  VAL=$(grep -E "^${KEY}=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//')
  if [ -z "$VAL" ] || [ ${#VAL} -lt 6 ]; then
    echo "SKIP  $KEY (empty/too short in .env)"
    continue
  fi
  # Count matches in bundle for the raw value
  CNT=$(grep -rF -- "$VAL" "$SCAN_DIR" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$CNT" -gt 0 ]; then
    echo "!!!! LEAK  $KEY -> $CNT match(es) in bundle"
    FOUND_ANY=1
  else
    echo "OK    $KEY -> 0 matches"
  fi
done

echo
echo "=== Keyword scan (cloudinary secret-ish / r2 host patterns in bundle) ==="
grep -roiE "cloudinary\.com/[a-z0-9_-]+/(image|raw|video)/upload" "$SCAN_DIR" 2>/dev/null | wc -l | xargs echo "cloudinary upload URL occurrences:"
grep -roiE "api_secret|api-secret" "$SCAN_DIR" 2>/dev/null | wc -l | xargs echo "'api_secret' keyword occurrences:"
grep -roiE "r2\.cloudflarestorage\.com" "$SCAN_DIR" 2>/dev/null | wc -l | xargs echo "r2 endpoint host occurrences:"

echo
if [ "$FOUND_ANY" -eq 0 ]; then
  echo "RESULT: NO non-public secret VALUES found in built frontend bundle."
else
  echo "RESULT: POTENTIAL LEAK DETECTED — see !!!! lines above."
fi
