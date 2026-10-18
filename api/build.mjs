// Bundles the backend into api/dist/server.js. The code under src/ is bundled
// (the `@/` alias comes from tsconfig.json); the packages stay in node_modules
import { build } from "esbuild"
import { existsSync, readFileSync } from "node:fs"
import { isBuiltin } from "node:module"
import { dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

// Paths the build resolves itself: the tsconfig alias and the `alias` below
const ownPaths = /^(@\/|server-only$|@sentry\/nextjs$)/

// Node's rule: .cjs and .mjs decide, a .js follows the nearest package.json
const isCommonJs = (file) => {
  const ext = extname(file)
  if (ext === ".cjs") return true
  if (ext !== ".js") return false
  for (let dir = dirname(file); dir !== dirname(dir); dir = dirname(dir)) {
    const manifest = join(dir, "package.json")
    if (existsSync(manifest))
      return JSON.parse(readFileSync(manifest, "utf8")).type !== "module"
  }
  return true
}

// Next.js and vitest give `import X from "pkg"` the `exports.default` of a
// CommonJS module compiled from ESM (`__esModule`, like the next-auth
// providers); Node gives it the whole `module.exports`. Those packages go
// through a module that picks the default the same way Next.js does. Their
// named imports become property reads, so a missing one is undefined, not a
// startup error
const isCompiledFromEsm = (file) =>
  isCommonJs(file) && readFileSync(file, "utf8").includes("__esModule")

const cjsDefaultInterop = {
  name: "cjs-default-interop",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.namespace === "cjs-interop")
        return { path: args.path, external: true }
      if (ownPaths.test(args.path) || isBuiltin(args.path)) return
      let url
      try {
        url = import.meta.resolve(args.path)
      } catch {
        return
      }
      if (!url.startsWith("file:") || !isCompiledFromEsm(fileURLToPath(url)))
        return
      return { path: args.path, namespace: "cjs-interop" }
    })
    build.onLoad({ filter: /.*/, namespace: "cjs-interop" }, ({ path }) => {
      const pkg = JSON.stringify(path)
      return {
        contents: [
          `import * as ns from ${pkg}`,
          `export * from ${pkg}`,
          "const cjs = ns.default",
          "export default cjs?.__esModule ? cjs.default : cjs",
        ].join("\n"),
        loader: "js",
        resolveDir: root,
      }
    })
  },
}

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
  plugins: [cjsDefaultInterop],
  logLevel: "info",
})
