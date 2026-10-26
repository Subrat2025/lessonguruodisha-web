#!/bin/sh
# Usage: call.sh /api/some/cron/path
# Needs SITE_URL and WEBHOOK_CRON_SECRET in the environment.
set -eu
case "${BACKGROUND_JOBS_DISABLED:-}" in
  1|true|yes|on) echo "Paused: BACKGROUND_JOBS_DISABLED is set on lessonguru-web. Nothing sent."; exit 0 ;;
esac
url="${SITE_URL%/}$1"
echo "POST $url"
code=$(curl -sS -o /tmp/out -w '%{http_code}' --max-time 120 -X POST \
  -H "Authorization: Bearer ${WEBHOOK_CRON_SECRET}" -H 'Content-Type: application/json' -d '{}' "$url")
head -c 2000 /tmp/out; echo
echo "HTTP $code"
case "$code" in 2*) exit 0 ;; *) exit 1 ;; esac
