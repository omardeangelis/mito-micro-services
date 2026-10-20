import { configDefaults, defineWorkspace } from "vitest/config"
import config from "./vitest.config"

// The tests of vitest.config.ts, and the `*.pg.test.ts` files on a real
// Postgres (src/test/pg.ts): TEST_DATABASE_URL, the Postgres of
// docker-compose.yml in local, a service in CI
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
])
