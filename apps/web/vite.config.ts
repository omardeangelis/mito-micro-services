import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// The backend of `pnpm api:dev` (apps/api/src/server.ts): in development the
// browser calls /api on the origin of Vite, so the session cookie stays
// first-party, as with the rewrites of Vercel (F10)
const backend = process.env.WEB_BACKEND_URL ?? "http://localhost:4000"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tailwind 4 runs as a Vite plugin: no PostCSS, and not the
  // postcss.config.cjs of the root, which is Tailwind 3 of the Next.js app
  css: { postcss: {} },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
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
