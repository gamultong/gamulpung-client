FROM node:20-alpine AS base

# --- WASM 빌드 ---
FROM rust:slim AS wasm-builder
RUN cargo install wasm-pack
RUN rustup target add wasm32-unknown-unknown
WORKDIR /wasm
COPY wasm/ .
RUN wasm-pack build --target web --release --out-dir /wasm-out

# --- 의존성 설치 ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- 빌드 ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=wasm-builder /wasm-out ./src/wasm-pkg
RUN npm run build

# --- 실행 ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
