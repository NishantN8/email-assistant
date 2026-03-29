# ── Stage 1: Build ────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy workspace manifests
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/email-copilot/package.json ./artifacts/email-copilot/
COPY scripts/ ./scripts/

# Install all deps (frozen lockfile)
RUN pnpm install --frozen-lockfile

# Copy source
COPY artifacts/api-server/ ./artifacts/api-server/
COPY artifacts/email-copilot/ ./artifacts/email-copilot/
COPY lib/ ./lib/

# Build API server
RUN pnpm --filter @workspace/api-server run build

# Build frontend
ENV NODE_ENV=production
RUN pnpm --filter @workspace/email-copilot run build

# ── Stage 2: Runtime ───────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

RUN npm install -g pnpm@9

# Copy built artifacts
COPY --from=builder /app/artifacts/api-server/dist/ ./artifacts/api-server/dist/
COPY --from=builder /app/artifacts/email-copilot/dist/ ./artifacts/email-copilot/dist/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/
COPY --from=builder /app/package.json ./

# Serve static frontend via API server
# The API server should serve /dist at its root in production

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
