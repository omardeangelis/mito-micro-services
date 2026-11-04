import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect"
import { eq } from "drizzle-orm"
import { importRun } from "@mito/db/schema/importRun"
import { setDeadline } from "../deadline"
import { failureTag, provideServer } from "@/test/effect"
import { createOperator } from "@/test/factories"
import {
  hasTestDatabase,
  migrateUpTo,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// Two extensions of the same Wave at once, on a real Postgres (PGlite has one
// connection): each writes only over the deadline it read (AC20), so the later
// day saved first is never undone. The order is made deterministic by the
// Wave's row the test holds and `waitUntilBlocked`

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A completed Wave of a new admin, due on `deadline` */
const seed = (deadline: string) =>
  given(async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const [run] = await pgDb
      .insert(importRun)
      .values({
        startedBy: admin.userId,
        fileName: "1026_WAVE_NOV.xlsx",
        format: "wave",
        status: "completed",
        rowsTotal: 1,
        rowsDiscarded: 0,
        deadline,
      })
      .returning()
    return run!.id
  })

/** Holds the Wave's row `FOR UPDATE` until `release` */
const holdRun = (runId: number) =>
  given(async () => {
    let release: () => void = () => undefined
    const freed = new Promise<void>((resolve) => {
      release = resolve
    })
    let locked: () => void = () => undefined
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve
    })
    const holding = pgDb.transaction(async (tx) => {
      await tx
        .select({ id: importRun.id })
        .from(importRun)
        .where(eq(importRun.id, runId))
        .for("update")
      locked()
      await freed
    })
    await isLocked
    return {
      release: async () => {
        release()
        await holding
      },
    }
  })

const deadlineOf = async (runId: number) => {
  const [run] = await pgDb
    .select({ deadline: importRun.deadline })
    .from(importRun)
    .where(eq(importRun.id, runId))
  return run?.deadline ?? null
}

describe.skipIf(!hasTestDatabase)("setDeadline su Postgres vero", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it.live(
    "due proroghe concorrenti: quella a un giorno prima, scritta dopo, è DeadlineInvalid e resta il giorno più lontano",
    () =>
      Effect.gen(function* () {
        const runId = yield* seed("2099-01-10")

        const held = yield* holdRun(runId)
        const later = yield* Effect.forkChild(
          setDeadline(runId, { deadline: "2099-03-01", kind: "extend" }).pipe(
            provideServer,
            Effect.exit
          )
        )
        yield* given(() => waitUntilBlocked(1))
        const earlier = yield* Effect.forkChild(
          setDeadline(runId, { deadline: "2099-02-01", kind: "extend" }).pipe(
            provideServer,
            Effect.exit
          )
        )
        yield* given(() => waitUntilBlocked(2))
        yield* given(() => held.release())
        const [a, b] = yield* Effect.all([
          Fiber.join(later),
          Fiber.join(earlier),
        ])

        expect(a).toEqual(
          Exit.succeed({ before: "2099-01-10", after: "2099-03-01" })
        )
        expect(failureTag(b)).toBe("DeadlineInvalid")
        expect(yield* given(() => deadlineOf(runId))).toBe("2099-03-01")
      })
  )

  it.live(
    "due proroghe concorrenti allo stesso giorno: la seconda risponde come una ripetizione",
    () =>
      Effect.gen(function* () {
        const runId = yield* seed("2099-01-10")

        const held = yield* holdRun(runId)
        const first = yield* Effect.forkChild(
          setDeadline(runId, { deadline: "2099-03-01", kind: "extend" }).pipe(
            provideServer,
            Effect.exit
          )
        )
        yield* given(() => waitUntilBlocked(1))
        const second = yield* Effect.forkChild(
          setDeadline(runId, { deadline: "2099-03-01", kind: "extend" }).pipe(
            provideServer,
            Effect.exit
          )
        )
        yield* given(() => waitUntilBlocked(2))
        yield* given(() => held.release())
        const [a, b] = yield* Effect.all([
          Fiber.join(first),
          Fiber.join(second),
        ])

        expect(a).toEqual(
          Exit.succeed({ before: "2099-01-10", after: "2099-03-01" })
        )
        expect(b).toEqual(
          Exit.succeed({ before: "2099-03-01", after: "2099-03-01" })
        )
        expect(yield* given(() => deadlineOf(runId))).toBe("2099-03-01")
      })
  )
})
