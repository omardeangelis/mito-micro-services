import {
  defineConfig,
  type TestProjectInlineConfiguration,
} from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

/**
 * Tests of dates that must not depend on the time zone of the process (the
 * import, AC33; the windows and the dates of the dashboard amounts): the
 * `utc` and `rome` projects run them in UTC and in Europe/Rome, in child
 * processes, where TZ applies (worker threads keep the process's)
 */
export const timeZoneTests = [
  "packages/client/src/import/**/_test/**/*.test.ts",
  "packages/domain/src/import/**/_test/**/*.test.ts",
  "packages/domain/src/utils/_test/{romeClock,dates}.test.ts",
  "src/app/dashboard/_components/_test/FinanceCard.dates.test.tsx",
  "packages/server/src/services/analytics/_test/windows.db.test.ts",
]

// Vitest 1's `configDefaults.exclude`: vitest 5 excludes only node_modules and .git
const defaultExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/cypress/**",
  "**/.{idea,git,cache,output,temp}/**",
  "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
  // The React app has its own vitest (apps/web/vite.config.ts)
  "apps/web/**",
]

// Server tests on the in-memory database (src/test/db.ts), in node
const dbTests = "**/*.db.test.ts"
// On a real Postgres (src/test/pg.ts): TEST_DATABASE_URL, the Postgres of
// docker-compose.yml in local, a service in CI
const pgTests = "**/*.pg.test.ts"

// Every project spells out its whole config, without `extends`: an
// extending project would append its arrays (setupFiles, exclude) to the
// inherited ones
const project = (
  test: NonNullable<TestProjectInlineConfiguration["test"]> & { name: string }
): TestProjectInlineConfiguration => ({
  plugins: [react()],
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
  test: {
    setupFiles: ["src/test/setup.ts"],
    // Vitest 1's defaults. In threads, TZ of `env` doesn't change the time
    // zone: these tests see the host's
    pool: "threads",
    fakeTimers: {
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    },
    // Vitest 1's default: the hooks of a suite run in parallel (vitest 5: "stack")
    sequence: { hooks: "parallel" },
    // Vitest 5's default (true): its restoreAllMocks no longer resets the
    // vi.fn mocks, and tests relied on that reset between tests
    clearMocks: true,
    ...test,
    env: {
      TZ: "UTC",
      SKIP_ENV_VALIDATION: "true",
      // better-auth of the app (getAuth), as on staging: https, so the
      // cookies are __Secure- (src/test/authSession.ts)
      BETTER_AUTH_URL: "https://staging-crm.example.it",
      BETTER_AUTH_SECRET: "test-secret-of-better-auth-0123456789",
      ...test.env,
    },
  },
})

// The same tests in a child process with TZ set. The node ones say so in a
// `@vitest-environment` comment
const inTimeZone = (name: string, tz: string) =>
  project({
    name,
    environment: "jsdom",
    include: timeZoneTests,
    exclude: defaultExclude,
    pool: "forks",
    env: { TZ: tz },
  })

export default defineConfig({
  test: {
    projects: [
      project({
        name: "unit",
        environment: "jsdom",
        exclude: [...defaultExclude, dbTests, pgTests, ...timeZoneTests],
      }),
      project({
        name: "db",
        environment: "node",
        include: [dbTests],
        exclude: [...defaultExclude, pgTests, ...timeZoneTests],
      }),
      project({
        name: "pg",
        environment: "node",
        include: [pgTests],
        exclude: defaultExclude,
        setupFiles: ["src/test/setup.ts", "src/test/pg.setup.ts"],
      }),
      inTimeZone("utc", "UTC"),
      inTimeZone("rome", "Europe/Rome"),
    ],
    coverage: {
      // you can include other reporters, but 'json-summary' is required, json is recommended
      reporter: ["text", "json-summary", "json"],
      // If you want a coverage reports even if your tests are failing, include the reportOnFailure option
      reportOnFailure: true,
    },
  },
})
