/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js")
import { withSentryConfig } from "@sentry/nextjs"
import { env } from "./src/env.js"

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  swcMinify: true,
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

const sentryWebpackPluginOptions = {
  org: "spatalo-b9",
  project: "javascript-nextjs",
  authToken: env.SENTRY_AUTH_TOKEN,
  // Build output only in CI (Vercel sets CI), so a failed source map upload shows in the build log
  silent: !process.env.CI,
  // Upload more client files for readable client stack traces
  widenClientFileUpload: true,
  // Don't expose source maps to the browser; Sentry still gets them
  hideSourceMaps: true,
  // Send browser events through /monitoring so ad-blockers don't drop them
  tunnelRoute: "/monitoring",
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
