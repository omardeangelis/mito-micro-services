import { and, eq } from "drizzle-orm"
import { Clock, Effect } from "effect"
import { importRun } from "@mito/db/schema/importRun"
import { type Day, romeToday } from "@mito/domain/wave/days"
import { type Db, type DbError, query } from "../../../effect/db"
import { DeadlineInvalid, WaveNotFound } from "./errors"

// The deadline of a Wave (spec assegnazione-wave, AC7, AC20): `confirm` sets
// it once the flow starts (the last one saved wins), `extend` moves it later,
// writing only over the deadline it read.
// "Today" is the day of Rome at the Clock's instant

export type DeadlineChange = {
  readonly deadline: Day
  readonly kind: "confirm" | "extend"
}

export type DeadlineResult = {
  /** The deadline before the change; null when the Wave was never confirmed */
  readonly before: Day | null
  readonly after: Day
}

/** Sets the deadline of the completed Wave `runId`, or `WaveNotFound` */
export const setDeadline = Effect.fn("import.setDeadline")(function* (
  runId: number,
  { deadline, kind }: DeadlineChange
): Effect.fn.Return<
  DeadlineResult,
  WaveNotFound | DeadlineInvalid | DbError,
  Db
> {
  const today = romeToday(new Date(yield* Clock.currentTimeMillis))
  const [run] = yield* query((client) =>
    client
      .select({ deadline: importRun.deadline })
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

  const before = run.deadline
  if (kind === "confirm") {
    if (deadline <= today) {
      return yield* new DeadlineInvalid({ reason: "not after today" })
    }
    if (deadline !== before) {
      yield* query((client) =>
        client
          .update(importRun)
          .set({ deadline })
          .where(eq(importRun.id, runId))
      )
    }
    return { before, after: deadline }
  }

  if (before === null) {
    return yield* new DeadlineInvalid({ reason: "no deadline to extend" })
  }
  // A repeat of the saved day, after an uncertain outcome (AC20): it succeeded
  if (deadline === before) return { before, after: before }
  if (deadline <= before || deadline <= today) {
    return yield* new DeadlineInvalid({ reason: "not after the deadline" })
  }

  // An extension writes only over the deadline it checked: one saved in the
  // meantime is never undone by an earlier day
  const written = yield* query((client) =>
    client
      .update(importRun)
      .set({ deadline })
      .where(and(eq(importRun.id, runId), eq(importRun.deadline, before)))
      .returning({ id: importRun.id })
  )
  if (written.length === 0) {
    const [current] = yield* query((client) =>
      client
        .select({ deadline: importRun.deadline })
        .from(importRun)
        .where(eq(importRun.id, runId))
    )
    // The same day, saved by a concurrent request: a repeat (AC20)
    if (current?.deadline === deadline) {
      return { before: deadline, after: deadline }
    }
    return yield* new DeadlineInvalid({ reason: "deadline changed" })
  }
  return { before, after: deadline }
})
