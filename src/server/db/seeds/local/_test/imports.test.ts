// @vitest-environment node
import { readFileSync } from "fs"
import path from "path"
import { build, type Metafile, type Plugin } from "esbuild"
import { describe, expect, it } from "vitest"

// The repo root: tsconfig.json, src/, packages/ and node_modules are there
const root = path.resolve(__dirname, "../../../../../..")

/**
 * The workspace packages (`@mito/<name>`) ship TypeScript sources: the graph
 * follows them through their `exports`, as apps/api/build.mjs does, while the
 * third-party packages stay external.
 */
const workspacePackages: Plugin = {
  name: "workspace-packages",
  setup(builder) {
    builder.onResolve({ filter: /^@mito\// }, (args) => {
      const [, name, subpath] = /^@mito\/([^/]+)(?:\/(.+))?$/.exec(args.path)!
      const folder = path.join(root, "packages", name!)
      const { exports } = JSON.parse(
        readFileSync(path.join(folder, "package.json"), "utf8")
      ) as { exports: Record<string, string> }
      const target = subpath
        ? exports["./*"]?.replace("*", subpath)
        : exports["."]
      if (!target) throw new Error(`${args.path} is not exported`)
      return { path: path.join(folder, target) }
    })
  },
}

/**
 * The module graph of `entry` as esbuild bundles it: the files of the repo it
 * loads (relative to the root) and the external packages it imports.
 */
async function graphOf(entry: string, conditions: string[] = []) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    metafile: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node22",
    // The `@/` alias comes from tsconfig.json
    tsconfig: "tsconfig.json",
    packages: "external",
    conditions,
    plugins: [workspacePackages],
    logLevel: "silent",
  })
  const metafile: Metafile = result.metafile
  const files = Object.keys(metafile.inputs)
  const externals = new Set(
    Object.values(metafile.inputs).flatMap((input) =>
      input.imports.filter((each) => each.external).map((each) => each.path)
    )
  )
  return { files, externals }
}

const LOAD_DB_ENV = "src/lib/global/loadDbEnv.ts"
const GLOBAL_DB = "packages/db/src/index.ts"
const LOCAL = "src/server/db/seeds/local"

describe("the module graphs of the seed:local commands (AC7, D7)", () => {
  it("the positive control: createSystemOperator.ts loads loadDbEnv.ts and dotenv", async () => {
    const graph = await graphOf("src/server/db/scripts/createSystemOperator.ts")
    expect(graph.files).toContain(LOAD_DB_ENV)
    expect(graph.externals).toContain("dotenv")
    // The workspace packages are followed into their sources
    expect(graph.files).toContain("packages/db/src/schema/index.ts")
  }, 60_000)

  it.each([
    ["seed", `${LOCAL}/seed.cli.ts`],
    ["verify", `${LOCAL}/verify.cli.ts`],
  ])(
    "%s loads neither loadDbEnv.ts nor dotenv, nor the global db nor server-only",
    async (_, entry) => {
      const graph = await graphOf(entry)
      expect(graph.files).toContain(`${LOCAL}/generate.ts`)
      expect(graph.files).toContain("packages/db/src/localDsn.ts")
      expect(graph.files).not.toContain(LOAD_DB_ENV)
      expect(graph.externals).not.toContain("dotenv")
      expect(graph.files).not.toContain(GLOBAL_DB)
      expect(graph.externals).not.toContain("server-only")
      expect(graph.files).not.toContain(`${LOCAL}/cron.ts`)
    },
    60_000
  )

  it("cron loads neither loadDbEnv.ts nor dotenv", async () => {
    const graph = await graphOf(`${LOCAL}/cron.cli.ts`, ["react-server"])
    // The backend's jobs are in the graph, with the global db they import
    // (never queried: AC28a)
    expect(graph.files).toContain("apps/api/src/cron/jobs.ts")
    expect(graph.files).toContain("packages/db/src/localDsn.ts")
    expect(graph.files).not.toContain(LOAD_DB_ENV)
    expect(graph.externals).not.toContain("dotenv")
  }, 60_000)
})
