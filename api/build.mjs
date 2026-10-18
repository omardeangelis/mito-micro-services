// Bundles the backend into api/dist/server.js. The code under src/ is bundled
// (the `@/` alias comes from tsconfig.json); the packages stay in node_modules
import { build } from "esbuild"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

await build({
  absWorkingDir: root,
  entryPoints: ["api/src/server.ts"],
  outfile: "api/dist/server.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  sourcemap: true,
  tsconfig: "tsconfig.json",
  alias: {
    // The server modules import it so that Next.js keeps them out of the
    // browser; outside Next.js its index throws (vitest.config.ts does the same)
    "server-only": "./node_modules/server-only/empty.js",
    "@sentry/nextjs": "./api/src/shims/sentry.ts",
  },
  logLevel: "info",
})
