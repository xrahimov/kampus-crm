# syntax=docker/dockerfile:1.7
# Multi-stage build. Targets:
#   runner   — the production web server (Next.js standalone output)
#   migrator — runs `prisma migrate deploy` (and optionally the seed) once
#   worker   — the background job runner (auto-SMS, Telegram, daily scans)

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Postinstall-free install; the client is generated explicitly below.
RUN npm ci --ignore-scripts

# --- build ------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

# --- migrator: full toolchain, no app server ---------------------------------
# Carries the source tree because the seed and the bootstrap import services
# (and `@/` path aliases need tsconfig.json).
FROM deps AS migrator
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./
RUN npx prisma generate
CMD ["npx", "prisma", "migrate", "deploy"]

# --- worker: job queue process (A-21), runs the TypeScript source with tsx -----
FROM deps AS worker
ENV NODE_ENV=production
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./
RUN npx prisma generate
CMD ["npx", "tsx", "scripts/worker.ts"]

# --- runner: minimal production image ----------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# Uploaded photos (UPLOAD_DIR); compose mounts a volume here.
RUN mkdir -p /data/uploads && chown nextjs:nodejs /data/uploads
ENV UPLOAD_DIR=/data/uploads
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["node", "server.js"]
