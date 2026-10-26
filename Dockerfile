# Production image for lessonguruodisha.in (Render, or any Docker host).
# Next.js "standalone" server + system Chromium (PDF generation) + Odia/Indic fonts.
# The app reads fonts from /app/public/fonts, so it must run from /app.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ---- dependencies ----
FROM base AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile --network-timeout 600000

# ---- build ----
FROM base AS build
WORKDIR /app
# NEXT_PUBLIC_* values are baked into the browser bundle at build time.
# Render passes the service's environment variables as build args.
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID
ARG NEXT_PUBLIC_WHATSAPP_NUMBER
ARG NEXT_PUBLIC_WHATSAPP_MESSAGE
ARG NEXT_PUBLIC_DISABLE_QE_V2
ARG NEXT_PUBLIC_GA4_ID
ARG NEXT_PUBLIC_FB_PIXEL_ID
ARG NEXT_PUBLIC_CLARITY_ID
ARG NEXT_PUBLIC_HOTJAR_ID
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=3584 yarn build

# ---- runtime ----
FROM base AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium qpdf poppler-utils fonts-noto-core fonts-noto-color-emoji fonts-liberation ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=10000 \
    HOSTNAME=0.0.0.0 \
    CHROMIUM_PATH=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# runtime files read with fs (also listed in outputFileTracingIncludes; copied again to be safe)
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts/copy-database.mjs ./scripts/copy-database.mjs
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s CMD curl -fsS http://127.0.0.1:${PORT}/api/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
