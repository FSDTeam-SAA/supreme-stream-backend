# ── Build stage ─────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ─────────────────────────────────────────────
FROM node:24-alpine AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci --only=production && npm cache clean --force

RUN npx prisma generate

COPY --from=builder /usr/src/app/dist ./dist

USER node

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]