import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Server tests on the in-memory database (src/test/db.ts)
    environmentMatchGlobs: [["**/*.db.test.ts", "node"]],
    setupFiles: ["src/test/setup.ts"],
    env: { TZ: "UTC", SKIP_ENV_VALIDATION: "true" },
    coverage: {
      // you can include other reporters, but 'json-summary' is required, json is recommended
      reporter: ["text", "json-summary", "json"],
      // If you want a coverage reports even if your tests are failing, include the reportOnFailure option
      reportOnFailure: true,
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: resolve(__dirname, "./src") },
      // Server modules import it; outside the Next.js bundler its index throws
      {
        find: /^server-only$/,
        replacement: resolve(__dirname, "./node_modules/server-only/empty.js"),
      },
    ],
  },
})
