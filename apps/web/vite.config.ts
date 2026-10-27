import { fileURLToPath } from "node:url"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// The backend of `pnpm api:dev` (apps/api/src/server.ts): in development the
// browser calls /api on the origin of Vite, so the session cookie stays
// first-party, as with the rewrites of Vercel (F10)
const backend = process.env.WEB_BACKEND_URL ?? "http://localhost:4000"

// Vercel sets VERCEL_ENV in the build: copied to a VITE_ variable, which
// Vite reads after this file, so the app knows the deployment (src/env.ts)
if (process.env.VERCEL_ENV !== undefined) {
  process.env.VITE_VERCEL_ENV = process.env.VERCEL_ENV
}

// As next.config.js: only the production build talks to Sentry, uploading
// the source maps and creating the release; staging, the previews and
// local builds send nothing
const isProduction =
  process.env.VERCEL_ENV === "production" &&
  process.env.VITE_APP_ENV !== "staging"
// An empty token, as an unset one, uploads nothing
const sentryAuthToken =
  isProduction && process.env.SENTRY_AUTH_TOKEN !== ""
    ? process.env.SENTRY_AUTH_TOKEN
    : undefined

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sentryAuthToken !== undefined &&
      sentryVitePlugin({
        org: "spatalo-b9",
        // The project of the Next.js app, so the issues keep their history
        project: process.env.SENTRY_PROJECT ?? "javascript-nextjs",
        authToken: sentryAuthToken,
        telemetry: false,
        // The maps go to Sentry, not to the browser
        sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
        // A failed upload warns instead of failing the deploy, as in next.config.js
        errorHandler: (err) => {
          console.warn(
            "[@sentry/vite-plugin] Source map upload failed:",
            err.message
          )
        },
      }),
  ],
  // Tailwind 4 runs as a Vite plugin: no PostCSS, and not the
  // postcss.config.cjs of the root, which is Tailwind 3 of the Next.js app
  css: { postcss: {} },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Source maps without the comment that points to them, only for Sentry
  build: { sourcemap: sentryAuthToken !== undefined ? "hidden" : false },
  server: {
    port: 5173,
    proxy: { "/api": { target: backend, changeOrigin: false } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    env: { TZ: "UTC" },
  },
})
