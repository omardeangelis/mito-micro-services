# syntax=docker/dockerfile:1
# The backend (api/), from the repo root: docker build -f api/Dockerfile .
# It bundles the server code under src/ with api/build.mjs; the packages come
# from a production install of the root package.json

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm is the one of packageManager in package.json
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml .npmrc ./
# No install scripts: the backend loads no native package. The token of the
# private @s-p-a-talo packages is a build secret, so no layer keeps it
RUN --mount=type=secret,id=github_packages_token,env=GITHUB_PACKAGES_TOKEN \
  pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json ./
COPY api ./api
COPY src ./src
RUN pnpm api:build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=secret,id=github_packages_token,env=GITHUB_PACKAGES_TOKEN \
  pnpm install --prod --frozen-lockfile --ignore-scripts && pnpm store prune
COPY --from=build /app/api/dist ./api/dist
USER node
# Cloud Run sends requests to PORT
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--enable-source-maps", "api/dist/server.js"]
