import { build, type Metafile, type Plugin } from "esbuild"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// The repo root: tsconfig.json (the `@/` alias), src/ and packages/ are there
const root = fileURLToPath(new URL("../..", import.meta.url))

const serverPackage = "packages/server/"

// Paths the bundle follows: the tsconfig alias and the workspace packages
const ownPaths = /^(@\/|@mito\/)/

// The modules under `dir`, outside the `_test` folders
const sources = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return entry.name === "_test" ? [] : sources(path)
    return /\.[jt]sx?$/.test(entry.name) ? [path] : []
  })

// Next.js reads a directive before any import, comments may come first
const directive =
  /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*(["'])(use client|use server)\1/

const directiveOf = (file: string) =>
  directive.exec(readFileSync(file, "utf8"))?.[2]

// Marks the plugin's own calls to esbuild's resolver
const resolving = Symbol("resolving")

// The bundle holds the app's own code: the packages from node_modules stay
// out, and so do the server actions, of which Next.js puts only a reference
// in the browser bundle
const ownCode: Plugin = {
  name: "own-code",
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.pluginData === resolving) return
      if (/^[^./]/.test(args.path) && !ownPaths.test(args.path))
        return { path: args.path, external: true }
      const resolved = await build.resolve(args.path, {
        kind: args.kind,
        importer: args.importer,
        resolveDir: args.resolveDir,
        pluginData: resolving,
      })
      if (resolved.errors.length > 0) return { errors: resolved.errors }
      if (directiveOf(resolved.path) === "use server")
        return { path: resolved.path, external: true }
      return resolved
    })
  },
}

// The import chain from `entry` to the first module of packages/server, the
// shortest: the loop also visits the files added while it runs
const chainToServer = (inputs: Metafile["inputs"], entry: string) => {
  const parents = new Map<string, string | undefined>([[entry, undefined]])
  for (const file of parents.keys()) {
    if (file.startsWith(serverPackage)) {
      const chain: string[] = []
      for (let at: string | undefined = file; at; at = parents.get(at))
        chain.unshift(at)
      return chain
    }
    for (const { path, external } of inputs[file]?.imports ?? [])
      if (!external && !parents.has(path)) parents.set(path, file)
  }
}

/**
 * For each `"use client"` module under `dir` (repo-relative) whose browser
 * bundle holds a module of packages/server, the import chain from it to the
 * first one. Imports of types only leave no module in the bundle.
 */
export const clientBundleLeaks = async (dir: string) => {
  const entries = sources(dir)
    .filter((path) => directiveOf(join(root, path)) === "use client")
    .sort()
  const { metafile } = await build({
    absWorkingDir: root,
    entryPoints: entries.map((entry) => join(root, entry)),
    bundle: true,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    // Nothing is written: esbuild wants an outdir for more entry points
    write: false,
    outdir: "out",
    metafile: true,
    logLevel: "silent",
    plugins: [ownCode],
  })
  return entries.flatMap((entry) => {
    const chain = chainToServer(metafile.inputs, entry)
    return chain ? [chain] : []
  })
}
