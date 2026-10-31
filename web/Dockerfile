# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# A well-formed but unreachable DATABASE_URL is enough for `prisma generate`
# and `next build`: nothing opens a connection until a query actually runs.
ARG DATABASE_URL="postgresql://user:password@localhost:5432/notetaker"
ENV DATABASE_URL=${DATABASE_URL}

FROM deps AS generate
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

FROM generate AS builder
COPY . .
RUN npm run build

# ---- Runtime image -------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/data

# ffmpeg/ffprobe: splitting recordings by channel and into short chunks for STT.
RUN apk add --no-cache ffmpeg \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data && chown nextjs:nodejs /data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Standalone tracing misses the Prisma driver adapter (imported by lib/prisma.ts).
COPY --from=builder /app/node_modules/@prisma/adapter-pg ./node_modules/@prisma/adapter-pg
COPY --from=builder /app/node_modules/@prisma/driver-adapter-utils ./node_modules/@prisma/driver-adapter-utils

USER nextjs
VOLUME /data
CMD ["node", "server.js"]
