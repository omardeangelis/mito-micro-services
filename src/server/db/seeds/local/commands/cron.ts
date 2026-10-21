// `pnpm seed:local:cron [job…]`: runs the production cron jobs on mito_local,
// recording each run in the manifest (D5, D6). The only command that imports
// `../cron`, which loads the backend's `cronJobs` (D7).
// Type only: a value import would load `server-only` and the global `db`
import type { DbClient } from "@mito/server/effect/db"
import { CRON_ORDER, runLocalCrons } from "../cron"
import type { CronName, Manifest } from "../types"
import {
  defaultManifestPath,
  readManifest,
  writeManifest,
} from "./manifestFile"

/**
 * Runs `jobs` (all four, in order, when empty) on `client`, after the seed of
 * the manifest at `manifestPath`. The manifest is written atomically before
 * each job, with the run `started`, and after it, with its outcome and
 * counters. Throws on a missing manifest, on a request `runLocalCrons`
 * refuses, and after a failed job. Returns the final manifest.
 */
export async function cronLocal({
  client,
  now,
  jobs = [],
  manifestPath = defaultManifestPath(),
}: {
  client: DbClient
  now: Date
  jobs?: readonly string[]
  manifestPath?: string
}): Promise<Manifest> {
  const manifest = await readManifest(manifestPath)
  return runLocalCrons({
    client,
    manifest,
    // Names from the command line: `runLocalCrons` refuses any other job
    jobs: jobs.length > 0 ? ([...jobs] as CronName[]) : [...CRON_ORDER],
    now,
    onManifest: (each) => writeManifest(manifestPath, each),
  })
}
