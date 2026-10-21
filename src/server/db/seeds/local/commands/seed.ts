// `pnpm seed:local [--customers N]`: fills mito_local with the dataset of the
// Rome day of the launch and writes its manifest (D5, D6). The client, the
// clock and the manifest path come from the caller. Must not import `../cron`
// (D7): the seed never loads `server-only` nor the global db.
// Type only: a value import would load `server-only` and the global `db`
import type { DbClient } from "@mito/server/effect/db"
import { pendingMigrations } from "../../../scripts/localDb"
import { assertSameRomeAndUtcDay, romeDay } from "../day"
import { MIN_CUSTOMERS } from "../generate"
import { seedDatabase } from "../seed"
import type { Dataset, Day } from "../types"
import {
  defaultManifestPath,
  deleteManifest,
  writeManifest,
} from "./manifestFile"

/** Customers of the seed when `--customers` is not given (D2). */
export const DEFAULT_CUSTOMERS = 10_000

const USAGE = "Uso: pnpm seed:local [--customers N]"

function assertCustomers(n: number): void {
  if (!Number.isInteger(n) || n < MIN_CUSTOMERS) {
    throw new Error(
      `Numero di clienti non valido (${n}): serve un intero di almeno ` +
        `${MIN_CUSTOMERS}. Non ho toccato il database.`
    )
  }
}

/** The arguments of `seed:local`, after the script name. */
export function parseSeedArgs(argv: readonly string[]): { n: number } {
  let n = DEFAULT_CUSTOMERS
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    // `pnpm seed:local -- --customers N` passes the separator through
    if (arg === "--") continue
    let value: string | undefined
    if (arg === "--customers") {
      value = argv[++i]
    } else if (arg.startsWith("--customers=")) {
      value = arg.slice("--customers=".length)
    } else {
      throw new Error(`Argomento sconosciuto "${arg}". ${USAGE}`)
    }
    if (value === undefined || !/^\d+$/.test(value)) {
      throw new Error(
        `--customers vuole un numero intero, non "${value ?? ""}". ${USAGE}`
      )
    }
    n = Number(value)
  }
  assertCustomers(n)
  return { n }
}

export type SeedSummary = {
  day: Day
  n: number
  manifestPath: string
  /** Rows written per table of the dataset. */
  counts: Record<keyof Dataset, number>
}

/**
 * Seeds mito_local for the Rome day of `now`. Before writing anything it
 * checks `n`, that the Rome and UTC days are the same (AC4) and that the
 * database has every migration of the repo (AC2). Then it deletes the old
 * manifest, writes the dataset in one transaction and, only once that is
 * committed, writes the new manifest (D6): a failed seed leaves no manifest.
 */
export async function seedLocal({
  client,
  now,
  n = DEFAULT_CUSTOMERS,
  manifestPath = defaultManifestPath(),
}: {
  client: DbClient
  now: Date
  n?: number
  manifestPath?: string
}): Promise<SeedSummary> {
  assertCustomers(n)
  assertSameRomeAndUtcDay(now)
  const problems = await pendingMigrations(client)
  if (problems.length > 0) {
    throw new Error(
      `mito_local non ha le migrazioni del repo:\n` +
        problems.map((problem) => `- ${problem}`).join("\n") +
        `\nLancia \`pnpm db:local:migrate\` (su un database con righe di ` +
        `migrazione che il repo non ha, prima \`pnpm db:local:reset\`). ` +
        `Non ho scritto nulla.`
    )
  }

  const day = romeDay(now)
  await deleteManifest(manifestPath)
  const { dataset, manifest } = await seedDatabase(client, { n, day })
  await writeManifest(manifestPath, manifest)

  const counts = Object.fromEntries(
    Object.entries(dataset).map(([table, rows]) => [table, rows.length])
  ) as Record<keyof Dataset, number>
  return { day, n, manifestPath, counts }
}
