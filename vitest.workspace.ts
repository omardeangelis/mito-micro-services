import { configDefaults, defineWorkspace } from "vitest/config"
import config, { timeZoneTests } from "./vitest.config"

// The same tests in a child process with TZ set: `env` of vitest.config.ts
// changes the time zone only in a new process, not in a worker thread
const inTimeZone = (name: string, tz: string) => ({
  ...config,
  test: {
    ...config.test,
    name,
    include: timeZoneTests,
    exclude: configDefaults.exclude,
    pool: "forks" as const,
    env: { ...config.test?.env, TZ: tz },
  },
})

// The tests of vitest.config.ts, the `*.pg.test.ts` files on a real
// Postgres (src/test/pg.ts): TEST_DATABASE_URL, the Postgres of
// docker-compose.yml in local, a service in CI; and the time zone tests
export default defineWorkspace([
  "./vitest.config.ts",
  {
    ...config,
    test: {
      ...config.test,
      name: "pg",
      include: ["**/*.pg.test.ts"],
      exclude: configDefaults.exclude,
      environment: "node",
      environmentMatchGlobs: [],
      setupFiles: ["src/test/setup.ts", "src/test/pg.setup.ts"],
    },
  },
  inTimeZone("utc", "UTC"),
  inTimeZone("rome", "Europe/Rome"),
])
