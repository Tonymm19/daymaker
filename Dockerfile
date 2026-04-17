# syntax=docker/dockerfile:1.7
#
# DAYMAKER CONNECT — Cloud Run Dockerfile
#
# Multi-stage build:
#   1. deps    — install npm packages (cacheable)
#   2. builder — run `next build` (standalone output)
#   3. runner  — minimal runtime image, just node + built artifacts
#
# NEXT_PUBLIC_* variables are inlined into the client bundle at build time,
# so they must be passed as --build-arg. Server-only secrets (Firebase admin,
# Anthropic, OpenAI, Stripe secret key, etc.) are injected at runtime via
# Cloud Run --set-secrets — they do NOT belong in this file.

# ─── 1. deps ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# libc6-compat is required by a handful of native deps on alpine.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ─── 2. builder ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public envs (baked into the client bundle).
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─── 3. runner ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone output is a self-contained bundle that includes server.js and a
# trimmed node_modules. Static assets and /public are copied alongside it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
