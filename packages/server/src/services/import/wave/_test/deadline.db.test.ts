import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { importRun } from "@mito/db/schema/importRun"
import { type DeadlineResult, setDeadline } from "../deadline"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { createUser } from "@/test/factories"

// The deadline of a Wave (T6, AC7, AC20): confirmed once, extended later, and
// a repeat of the saved day changes nothing

// Rome: 2026-10-25, 12:00
const NOW = new Date("2026-10-25T10:00:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

type Run = typeof importRun.$inferInsert

const insertRun = async (values: Partial<Run> & Pick<Run, "startedBy">) => {
  const [run] = await testDb
    .insert(importRun)
    .values({
      fileName: "0125_wave.xlsx",
      format: "wave",
      status: "completed",
      rowsTotal: 10,
      rowsDiscarded: 0,
      finishedAt: new Date("2026-10-20T10:00:00.000Z"),
      ...values,
    })
    .returning()
  return run!
}

const deadlineOf = async (runId: number) => {
  const [run] = await testDb
    .select({ deadline: importRun.deadline })
    .from(importRun)
    .where(eq(importRun.id, runId))
  return run?.deadline ?? null
}

describe("scadenza della Wave (AC7, AC20)", () => {
  it.effect(
    "proroga prima della scadenza attuale è DeadlineInvalid e la scadenza resta quella",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const run = yield* Effect.promise(() =>
          insertRun({ startedBy: admin.id, deadline: "2026-11-30" })
        )
        yield* TestClock.setTime(NOW.getTime())

        const exit = yield* setDeadline(run.id, {
          deadline: "2026-11-20",
          kind: "extend",
        }).pipe(provideServer, Effect.exit)

        expect(failureTag(exit)).toBe("DeadlineInvalid")
        expect(yield* Effect.promise(() => deadlineOf(run.id))).toBe(
          "2026-11-30"
        )
      })
  )

  it.effect("confirmar con oggi è DeadlineInvalid", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      const run = yield* Effect.promise(() =>
        insertRun({ startedBy: admin.id })
      )
      yield* TestClock.setTime(NOW.getTime())

      const exit = yield* setDeadline(run.id, {
        deadline: "2026-10-25",
        kind: "confirm",
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("DeadlineInvalid")
      expect(yield* Effect.promise(() => deadlineOf(run.id))).toBeNull()
    })
  )

  it.effect("confermare due volte con giorni diversi vale l'ultima", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      const run = yield* Effect.promise(() =>
        insertRun({ startedBy: admin.id })
      )
      yield* TestClock.setTime(NOW.getTime())

      const first = yield* setDeadline(run.id, {
        deadline: "2026-11-20",
        kind: "confirm",
      }).pipe(provideServer)
      const second = yield* setDeadline(run.id, {
        deadline: "2026-11-27",
        kind: "confirm",
      }).pipe(provideServer)

      expect(first).toEqual({ before: null, after: "2026-11-20" })
      expect(second).toEqual({ before: "2026-11-20", after: "2026-11-27" })
      expect(yield* Effect.promise(() => deadlineOf(run.id))).toBe("2026-11-27")
    })
  )

  it.effect("salvare due volte lo stesso giorno non cambia nulla", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      const run = yield* Effect.promise(() =>
        insertRun({ startedBy: admin.id })
      )
      yield* TestClock.setTime(NOW.getTime())

      yield* setDeadline(run.id, {
        deadline: "2026-11-20",
        kind: "confirm",
      }).pipe(provideServer)
      const again = yield* setDeadline(run.id, {
        deadline: "2026-11-20",
        kind: "confirm",
      }).pipe(provideServer)

      expect(again).toEqual({ before: "2026-11-20", after: "2026-11-20" })
      expect(yield* Effect.promise(() => deadlineOf(run.id))).toBe("2026-11-20")
    })
  )

  it.effect("prorogare una Wave senza scadenza è DeadlineInvalid", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      const run = yield* Effect.promise(() =>
        insertRun({ startedBy: admin.id })
      )
      yield* TestClock.setTime(NOW.getTime())

      const exit = yield* setDeadline(run.id, {
        deadline: "2026-11-20",
        kind: "extend",
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("DeadlineInvalid")
      expect(yield* Effect.promise(() => deadlineOf(run.id))).toBeNull()
    })
  )

  it.effect(
    "prorogare con il giorno già salvato è riuscito, senza scrivere",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const run = yield* Effect.promise(() =>
          insertRun({ startedBy: admin.id, deadline: "2026-11-30" })
        )
        yield* TestClock.setTime(NOW.getTime())

        const result: DeadlineResult = yield* setDeadline(run.id, {
          deadline: "2026-11-30",
          kind: "extend",
        }).pipe(provideServer)

        expect(result).toEqual({ before: "2026-11-30", after: "2026-11-30" })
        expect(yield* Effect.promise(() => deadlineOf(run.id))).toBe(
          "2026-11-30"
        )
      })
  )

  it.effect("prorogare dopo la scadenza attuale la sposta", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
      const run = yield* Effect.promise(() =>
        insertRun({ startedBy: admin.id, deadline: "2026-11-30" })
      )
      yield* TestClock.setTime(NOW.getTime())

      const result = yield* setDeadline(run.id, {
        deadline: "2026-12-14",
        kind: "extend",
      }).pipe(provideServer)

      expect(result).toEqual({ before: "2026-11-30", after: "2026-12-14" })
      expect(yield* Effect.promise(() => deadlineOf(run.id))).toBe("2026-12-14")
    })
  )

  it.effect(
    "una run che non è una Wave completata, o che manca, è WaveNotFound",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() => createUser({ role: "ADMIN" }))
        const standard = yield* Effect.promise(() =>
          insertRun({ startedBy: admin.id, format: "standard" })
        )
        const running = yield* Effect.promise(() =>
          insertRun({ startedBy: admin.id, status: "running" })
        )
        yield* TestClock.setTime(NOW.getTime())

        for (const runId of [standard.id, running.id, 999_999]) {
          const exit = yield* setDeadline(runId, {
            deadline: "2026-11-20",
            kind: "confirm",
          }).pipe(provideServer, Effect.exit)
          expect(failureTag(exit)).toBe("WaveNotFound")
        }
      })
  )
})
