import { and, eq } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { importRun } from "@mito/db/schema/importRun"
import {
  type Day,
  daysSince,
  romeToday,
  workdaysLeft,
} from "@mito/domain/wave/days"
import { type Db, type DbError, query } from "../../../effect/db"
import {
  type CallsRegistryMissing,
  callsRegistryAt,
} from "../../export/callStats"
import { WaveNotFound } from "./errors"
import { type WaveParts, waveParts } from "./parts"
import { type WaveTeamMember, waveTeam } from "./team"

// The read of a Wave (spec assegnazione-wave, D10): everything its page shows,
// at the Clock's instant, in the day of Rome. The web computes previews and
// texts only from this

export type WaveRead = WaveParts & {
  /** The file name without its extension (Definizioni, OQ13) */
  readonly name: string
  readonly fileName: string
  readonly importedAt: Date
  readonly today: Day
  readonly deadline: Day | null
  readonly status: "open" | "expired" | "unconfirmed"
  readonly workdaysLeft: number | null
  readonly daysSinceDeadline: number | null
  readonly toAssign: number
  readonly team: ReadonlyArray<WaveTeamMember>
}

/** The name of a Wave: its file without the extension */
const waveName = (fileName: string) => fileName.replace(/\.[^.]*$/, "")

/** Reads the completed Wave `runId`, or `WaveNotFound` */
export const readWave = Effect.fn("import.readWave")(function* (
  runId: number
): Effect.fn.Return<
  WaveRead,
  WaveNotFound | CallsRegistryMissing | DbError,
  Db
> {
  const now = new Date(yield* Clock.currentTimeMillis)
  const today = romeToday(now)
  const [run] = yield* query((client) =>
    client
      .select({
        fileName: importRun.fileName,
        startedAt: importRun.startedAt,
        deadline: importRun.deadline,
      })
      .from(importRun)
      .where(
        and(
          eq(importRun.id, runId),
          eq(importRun.format, "wave"),
          eq(importRun.status, "completed")
        )
      )
  )
  if (!run) return yield* new WaveNotFound({ runId })

  const registryAt = yield* callsRegistryAt()
  const [parts, team] = yield* Effect.all(
    [
      waveParts(runId, now, registryAt),
      waveTeam(runId, now, today, registryAt),
    ],
    { concurrency: "unbounded" }
  )

  const deadline = run.deadline
  // Open through the deadline day, expired after it, unconfirmed without one
  const status =
    deadline === null ? "unconfirmed" : deadline >= today ? "open" : "expired"

  return {
    name: waveName(run.fileName),
    fileName: run.fileName,
    importedAt: run.startedAt,
    today,
    deadline,
    status,
    workdaysLeft:
      status === "open" && deadline !== null
        ? workdaysLeft(today, deadline)
        : null,
    daysSinceDeadline:
      status === "expired" && deadline !== null
        ? daysSince(deadline, today)
        : null,
    ...parts,
    toAssign: parts.parts.unassigned,
    team,
  }
})
