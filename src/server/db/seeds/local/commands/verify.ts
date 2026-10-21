// `pnpm seed:local:verify`: compares mito_local with the manifest after the
// four runs (AC29). Read only. Must not import `../cron` (D7): the
// verification never loads `server-only` nor the global db.
// Type only: a value import would load `server-only` and the global `db`
import type { DbClient } from "@mito/server/effect/db"
import { assertIsToday, assertSameRomeAndUtcDay } from "../day"
import { generateDataset } from "../generate"
import type { CronName, Manifest } from "../types"
import { formatResults, verifyManifest } from "../verify"
import { defaultManifestPath, readManifest } from "./manifestFile"

// The jobs of the seed, as `CRON_ORDER` of ../cron, which this file can't
// import (D7)
const SEED_JOBS: readonly CronName[] = [
  "priority",
  "alert",
  "update",
  "cleanup-task-event-log",
]

/** The last run of each job must have succeeded (D6). */
function assertAllRunsSucceeded(manifest: Manifest): void {
  for (const job of SEED_JOBS) {
    const run = [...manifest.runs].reverse().find((each) => each.job === job)
    if (!run) {
      throw new Error(
        `Il cron "${job}" non è stato eseguito dopo il seed: la verifica ` +
          "vuole le quattro corse riuscite. Lancia `pnpm seed:local:cron`."
      )
    }
    if (run.outcome !== "succeeded") {
      const how = run.outcome === "failed" ? "è fallito" : "si è interrotto"
      throw new Error(
        `Il cron "${job}" ${how}: serve un nuovo seed (\`pnpm seed:local\`), ` +
          "poi `pnpm seed:local:cron`."
      )
    }
  }
}

/**
 * Checks the database against the manifest at `manifestPath`: one line per
 * scenario, "passato" or "fallito" with the rows that don't match, and the
 * exit code (1 if a scenario failed). Throws, before reading the database, if
 * the manifest isn't of today in Rome, in the hour where the Rome and UTC days
 * differ (AC28b), or without the four runs succeeded (D6).
 */
export async function verifyLocal({
  client,
  now,
  manifestPath = defaultManifestPath(),
}: {
  client: DbClient
  now: Date
  manifestPath?: string
}): Promise<{ lines: string[]; exitCode: 0 | 1 }> {
  const manifest = await readManifest(manifestPath)
  assertIsToday(manifest.day, now)
  assertSameRomeAndUtcDay(now)
  assertAllRunsSucceeded(manifest)

  const dataset = generateDataset({ n: manifest.n, day: manifest.day })
  const results = await verifyManifest(client, manifest, dataset)
  return {
    lines: formatResults(results),
    exitCode: results.every((result) => result.passed) ? 0 : 1,
  }
}
