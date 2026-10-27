import { configDefaults, defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

/**
 * Tests of dates that must not depend on the time zone of the process (the
 * import, AC33; the windows and the dates of the dashboard amounts):
 * vitest.workspace.ts runs them in UTC and in Europe/Rome, in
 * child processes, where TZ applies (worker threads keep the process's)
 */
export const timeZoneTests = [
  "src/lib/import/**/_test/**/*.test.ts",
  "packages/domain/src/import/**/_test/**/*.test.ts",
  "packages/domain/src/utils/_test/{romeClock,dates}.test.ts",
  "src/app/dashboard/_components/_test/FinanceCard.dates.test.tsx",
  "packages/server/src/services/analytics/_test/windows.db.test.ts",
]

export default defineConfig({
  plugins: [react()],
  test: {
    name: "unit",
    environment: "jsdom",
    exclude: [
      ...configDefaults.exclude,
      // The React app has its own vitest (apps/web/vite.config.ts)
      "apps/web/**",
      // On a real Postgres, in the other project of vitest.workspace.ts
      "**/*.pg.test.ts",
      ...timeZoneTests,
    ],
    // Server tests on the in-memory database (src/test/db.ts)
    environmentMatchGlobs: [["**/*.db.test.ts", "node"]],
    setupFiles: ["src/test/setup.ts"],
    env: {
      TZ: "UTC",
      SKIP_ENV_VALIDATION: "true",
      // better-auth of the app (getAuth), as on staging: https, so the
      // cookies are __Secure- (src/test/authSession.ts)
      BETTER_AUTH_URL: "https://staging-crm.example.it",
      BETTER_AUTH_SECRET: "test-secret-of-better-auth-0123456789",
    },
    coverage: {
      // you can include other reporters, but 'json-summary' is required, json is recommended
      reporter: ["text", "json-summary", "json"],
      // If you want a coverage reports even if your tests are failing, include the reportOnFailure option
      reportOnFailure: true,
    },
  },
  resolve: {
    alias: [
      // The real one runs only inside Next.js (`cache` of React's server
      // build, next/headers): the tests load the backend's, as apps/api/build.mjs
      // does, before the @ alias. Tests of Next.js code mock it
      {
        find: /^@\/trpc\/server$/,
        replacement: resolve(__dirname, "./apps/api/src/shims/trpcServer.ts"),
      },
      { find: "@", replacement: resolve(__dirname, "./src") },
      // Server modules import it; outside the Next.js bundler its index throws
      {
        find: /^server-only$/,
        replacement: resolve(__dirname, "./node_modules/server-only/empty.js"),
      },
    ],
  },
})
