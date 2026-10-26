/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("@mito/env")
import { existsSync } from "node:fs"
import { withSentryConfig } from "@sentry/nextjs"
import { env, isProduction } from "@mito/env"

// Next.js loads .env.production.local in every `next build` and `next start`:
// with the production database in it, a local build would reach it. The
// database scripts read .env.prod.local instead (src/lib/global/loadDbEnv.ts). The
// path is the project's, whatever the current directory
if (existsSync(new URL(".env.production.local", import.meta.url))) {
  throw new Error(
    "Rename .env.production.local to .env.prod.local: Next.js loads .env.production.local in every local build"
  )
}

// `vercel build` sets VERCEL, and VERCEL_ENV only when `vercel pull` writes it,
// which needs "Enable access to System Environment Variables" on in the
// project (Settings → Environment Variables). Without it the production build
// would come out as not production: filter on sign-in, no required Azure, no
// Sentry
if (process.env.VERCEL && process.env.VERCEL_ENV === undefined) {
  throw new Error(
    "VERCEL_ENV is missing: turn on Enable access to System Environment Variables in the Vercel project settings"
  )
}
// Anywhere, Vercel or not: a typo would pass this config and fail only when
// the app reads it
if (
  process.env.VERCEL_ENV !== undefined &&
  !["production", "preview", "development"].includes(process.env.VERCEL_ENV)
) {
  throw new Error(
    "VERCEL_ENV is invalid: only Vercel sets it, to production, preview or development"
  )
}

// The bundles get NEXT_PUBLIC_VERCEL_ENV from VERCEL_ENV (env below), while
// @mito/env reads NEXT_PUBLIC_VERCEL_ENV first: one defined by hand with
// another value would make this config and the app disagree on production
if (
  process.env.NEXT_PUBLIC_VERCEL_ENV !== undefined &&
  process.env.NEXT_PUBLIC_VERCEL_ENV !== process.env.VERCEL_ENV
) {
  throw new Error(
    "NEXT_PUBLIC_VERCEL_ENV differs from VERCEL_ENV: remove NEXT_PUBLIC_VERCEL_ENV from the environment variables"
  )
}

// Staging is a production deployment of its own Vercel project, and only
// APP_ENV=staging, set there and nowhere else, keeps it from being production
// (@mito/env). Any other value would be a typo that makes staging production
if (process.env.APP_ENV !== undefined && process.env.APP_ENV !== "staging") {
  throw new Error(
    'APP_ENV is invalid: set it to "staging" in the staging project only, and nowhere else'
  )
}

// Like NEXT_PUBLIC_VERCEL_ENV above: the bundles get NEXT_PUBLIC_APP_ENV from
// APP_ENV, and @mito/env reads NEXT_PUBLIC_APP_ENV first
if (
  process.env.NEXT_PUBLIC_APP_ENV !== undefined &&
  process.env.NEXT_PUBLIC_APP_ENV !== process.env.APP_ENV
) {
  throw new Error(
    "NEXT_PUBLIC_APP_ENV differs from APP_ENV: remove NEXT_PUBLIC_APP_ENV from the environment variables"
  )
}

// The backend on Cloud Run (apps/api) serves the same API on the same paths. With
// BACKEND_URL set, Vercel sends the browser's tRPC calls there, and
// @/trpc/server calls it over HTTP. The rewrite is fixed at build time, so a
// change needs a new deploy. The session cookie travels to it: https only,
// except for the local backend of `pnpm api:dev`
const backendUrl = process.env.BACKEND_URL || undefined
/** @type {string | undefined} */
let backendOrigin
if (backendUrl !== undefined) {
  if (!URL.canParse(backendUrl)) {
    throw new Error("BACKEND_URL is not a URL: set it to https://<host>")
  }
  const url = new URL(backendUrl)
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error(
      "BACKEND_URL must be https: the session cookie travels to it"
    )
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "BACKEND_URL must be the origin of the backend, without a path"
    )
  }
  backendOrigin = url.origin
}

// With BACKEND_AUTH=true too, the browser's /api/auth calls (login, callback,
// session, logout) go to the backend, which runs the same NextAuth. A step of
// its own, after tRPC: both read the same session table until the database
// moves (brain/chore/migrazione-gcp.md)
const backendAuth = process.env.BACKEND_AUTH === "true"
if (backendAuth && backendOrigin === undefined) {
  throw new Error("BACKEND_AUTH needs BACKEND_URL: set both or neither")
}

// With BACKEND_REST=true too, the REST routes of export and user preferences
// go to the backend: another step of its own
const backendRest = process.env.BACKEND_REST === "true"
if (backendRest && backendOrigin === undefined) {
  throw new Error("BACKEND_REST needs BACKEND_URL: set both or neither")
}
const REST_PREFIXES = ["/api/export", "/api/user"]

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript sources (packages/*)
  transpilePackages: ["@mito/db", "@mito/domain", "@mito/env", "@mito/server"],
  // `next lint` and the lint of `next build`: the app and the packages
  eslint: { dirs: ["src", "packages"] },
  swcMinify: true,
  env: {
    // The same value whether or not Vercel sets NEXT_PUBLIC_VERCEL_ENV too.
    // The deploy workflows run `vercel build`, which gets VERCEL_ENV from
    // `vercel pull`. Always a value, "none" when unset: Next.js writes an
    // entry into the bundles only when it isn't empty, and without it the
    // server would read the variables of the running deployment while the
    // browser keeps what the build saw
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "none",
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? "none",
  },
  async rewrites() {
    if (backendOrigin === undefined) return []
    // beforeFiles: otherwise the route of Next.js at /api/trpc answers first
    return {
      beforeFiles: [
        {
          source: "/api/trpc/:path*",
          destination: `${backendOrigin}/api/trpc/:path*`,
        },
        ...(backendAuth
          ? [
              {
                source: "/api/auth/:path*",
                destination: `${backendOrigin}/api/auth/:path*`,
              },
            ]
          : []),
        ...(backendRest
          ? REST_PREFIXES.map((prefix) => ({
              source: `${prefix}/:path*`,
              destination: `${backendOrigin}${prefix}/:path*`,
            }))
          : []),
      ],
      afterFiles: [],
      fallback: [],
    }
  },
  async headers() {
    return [
      {
        // Cache aggressiva per asset statici (immutabili con hash)
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Feature-Policy",
            value: "geolocation 'none'; microphone 'none'; camera 'none'",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            // Previene caching aggressivo delle pagine HTML
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ]
  },
}

// Only the production build talks to Sentry: staging and local builds upload
// no source maps, create no release and send no plugin telemetry
const sentryWebpackPluginOptions = {
  org: "spatalo-b9",
  project: "javascript-nextjs",
  authToken: env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !isProduction },
  release: { create: isProduction, finalize: isProduction },
  telemetry: isProduction,
  // Build output only in CI (Vercel sets CI), so a failed source map upload shows in the build log
  silent: !process.env.CI,
  // Upload more client files for readable client stack traces
  widenClientFileUpload: true,
  // Don't expose source maps to the browser; Sentry still gets them
  hideSourceMaps: true,
  // Send browser events through /monitoring so ad-blockers don't drop them.
  // Production only: elsewhere the route would relay to any Sentry project
  tunnelRoute: isProduction ? "/monitoring" : undefined,
  disableLogger: true,
  unstable_sentryWebpackPluginOptions: {
    // A failed release or source map upload (e.g. a token from another Sentry org) warns instead of failing the deploy
    /** @param {Error} err */
    errorHandler: (err) => {
      console.warn("[@sentry/nextjs] Source map upload failed:", err.message)
    },
  },
}

export default withSentryConfig(config, sentryWebpackPluginOptions)
