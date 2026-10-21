// The manifest file of the local seed (D6): `.local-seed/manifest.json` in
// the folder the command is launched from. Always written atomically: a
// temporary file in the same folder, then `rename`, so a reader never finds
// half a manifest. Must not import `../cron` (D7).
import { randomBytes } from "crypto"
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises"
import path from "path"
import type { Manifest } from "../types"

/** Where the commands read and write the manifest by default. */
export function defaultManifestPath(): string {
  return path.resolve(process.cwd(), ".local-seed/manifest.json")
}

const isManifest = (value: unknown): value is Manifest => {
  if (typeof value !== "object" || value === null) return false
  const { day, n, scenarios, runs } = value as Record<string, unknown>
  return (
    typeof day === "string" &&
    typeof n === "number" &&
    Array.isArray(scenarios) &&
    Array.isArray(runs)
  )
}

/** The manifest at `manifestPath`, or an Italian error saying what to do. */
export async function readManifest(manifestPath: string): Promise<Manifest> {
  let text: string
  try {
    text = await readFile(manifestPath, "utf8")
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") {
      throw new Error(
        `Non trovo il manifesto ${manifestPath}: lancia prima ` +
          "`pnpm seed:local` dalla stessa cartella."
      )
    }
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  if (!isManifest(parsed)) {
    throw new Error(
      `Il manifesto ${manifestPath} non è valido: serve un nuovo seed ` +
        "(`pnpm seed:local`)."
    )
  }
  return parsed
}

/** Writes `manifest` atomically, creating its folder if needed. */
export async function writeManifest(
  manifestPath: string,
  manifest: Manifest
): Promise<void> {
  const folder = path.dirname(manifestPath)
  await mkdir(folder, { recursive: true })
  // Same folder: `rename` replaces the file in one step
  const temporary = path.join(
    folder,
    `.${path.basename(manifestPath)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  )
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`)
    await rename(temporary, manifestPath)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

/** Removes the manifest, if there is one. */
export async function deleteManifest(manifestPath: string): Promise<void> {
  await rm(manifestPath, { force: true })
}
