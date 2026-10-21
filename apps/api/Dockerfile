# The backend (apps/api), from the repo root: docker build -f apps/api/Dockerfile .
# It bundles the server code under src/ with apps/api/build.mjs; the packages
# come from a production install of the root package.json. The workspace
# packages (pnpm-workspace.yaml) come in with their package.json first: the
# lockfile lists each of them
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm is the one of packageManager in package.json
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/domain/package.json ./packages/domain/
COPY packages/env/package.json ./packages/env/
COPY apps/api/package.json ./apps/api/
# No install scripts: the backend loads no native package
RUN pnpm install --frozen-lockfile --ignore-scripts
# tsconfig.json extends the one of packages/config
COPY packages/config ./packages/config
COPY packages/db ./packages/db
COPY packages/domain ./packages/domain
COPY packages/env ./packages/env
COPY tsconfig.json ./
COPY apps/api ./apps/api
COPY src ./src
RUN pnpm api:build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/config/package.json ./packages/config/
COPY packages/db/package.json ./packages/db/
COPY packages/domain/package.json ./packages/domain/
COPY packages/env/package.json ./packages/env/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && pnpm store prune
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
# Cloud Run sends requests to PORT
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--enable-source-maps", "apps/api/dist/server.js"]
