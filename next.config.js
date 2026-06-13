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
  authToken: env.SENTRY_AUTH_TOKEN,
  silent: true,
}

export default withSentryConfig(config, sentryWebpackPluginOptions)
