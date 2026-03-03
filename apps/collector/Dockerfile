FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/collector/package.json apps/collector/
RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY apps/collector/ apps/collector/
COPY config/ config/
RUN pnpm --filter @travelrisk/collector build

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/apps/collector/dist ./dist
COPY --from=builder /app/config ./config
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/collector/node_modules ./apps/collector/node_modules

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
