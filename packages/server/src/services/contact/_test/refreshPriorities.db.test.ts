import { afterAll, afterEach, beforeAll, beforeEach, vi } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { eq } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { failNextUpdateOf } from "@/test/failpoint"
import { createAlert, createCustomer, createTask } from "@/test/factories"
import { refreshPriorities } from "../refreshPriorities"

/** 05:00 in Italy, when the night's crons have run. */
const NOW = new Date("2026-10-14T03:00:00.000Z")
const BEFORE = new Date("2026-10-01T08:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000
const YESTERDAY = new Date(NOW.getTime() - DAY)
const TOMORROW = new Date(NOW.getTime() + DAY)

/** The program as the priority route runs it: `provideServer` provides ServerLive. */
const refresh = (taskId?: number) =>
  refreshPriorities(taskId).pipe(provideServer, Effect.exit)

/** A contact of its own customer, last updated before NOW. */
async function contact(values: Partial<typeof task.$inferInsert>) {
  const customer = await createCustomer()
  return createTask({ customerId: customer.id, updatedAt: BEFORE, ...values })
}

const rowOf = async (id: number) => {
  const [row] = await testDb
    .select({ priority: task.priority, updatedAt: task.updatedAt })
    .from(task)
    .where(eq(task.id, id))
  return row!
}

beforeAll(async () => {
  await migrateUpTo()
  // Only Date: the in-memory database needs real timers
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("refreshPriorities chiamata direttamente", () => {
  it.effect(
    "senza id ricalcola i contatti attivi senza priorità personalizzata e lascia gli altri come sono",
    () =>
      Effect.gen(function* () {
        const toCall = yield* Effect.promise(() =>
          contact({ state: "chiamare", priority: 0 })
        )
        const notInterested = yield* Effect.promise(() =>
          contact({
            state: "non interessato",
            priority: 0,
          })
        )
        const followup = yield* Effect.promise(() =>
          contact({ state: "followup", priority: 150 })
        )
        const alreadyUrgent = yield* Effect.promise(() =>
          contact({ state: "chiamare", priority: 120 })
        )
        const custom = yield* Effect.promise(() =>
          contact({
            state: "non interessato",
            priority: 77,
            customPriority: true,
          })
        )
        const inactive = yield* Effect.promise(() =>
          contact({
            state: "non interessato",
            priority: 5,
            isActive: false,
          })
        )
        expect(Exit.isSuccess(yield* refresh())).toBe(true)

        expect(yield* Effect.promise(() => rowOf(toCall.id))).toEqual({
          priority: 120,
          updatedAt: NOW,
        })
        expect(yield* Effect.promise(() => rowOf(notInterested.id))).toEqual({
          priority: 10,
          updatedAt: NOW,
        })
        expect(yield* Effect.promise(() => rowOf(followup.id))).toEqual({
          priority: 1,
          updatedAt: NOW,
        })
        expect(yield* Effect.promise(() => rowOf(alreadyUrgent.id))).toEqual({
          priority: 120,
          updatedAt: BEFORE,
        })
        expect(yield* Effect.promise(() => rowOf(custom.id))).toEqual({
          priority: 77,
          updatedAt: BEFORE,
        })
        expect(yield* Effect.promise(() => rowOf(inactive.id))).toEqual({
          priority: 5,
          updatedAt: BEFORE,
        })
      })
  )

  it.effect(
    "un alert scaduto in richiamare vale venti punti, uno futuro nessuno",
    () =>
      Effect.gen(function* () {
        const overdue = yield* Effect.promise(() =>
          contact({ state: "richiamare", priority: 0 })
        )
        yield* Effect.promise(() =>
          createAlert({ taskId: overdue.id, deadline: YESTERDAY })
        )
        const scheduled = yield* Effect.promise(() =>
          contact({ state: "richiamare", priority: 0 })
        )
        yield* Effect.promise(() =>
          createAlert({ taskId: scheduled.id, deadline: TOMORROW })
        )
        expect(Exit.isSuccess(yield* refresh())).toBe(true)

        expect((yield* Effect.promise(() => rowOf(overdue.id))).priority).toBe(
          20
        )
        expect(
          (yield* Effect.promise(() => rowOf(scheduled.id))).priority
        ).toBe(0)
      })
  )

  it.effect("con un id ricalcola solo quel contatto", () =>
    Effect.gen(function* () {
      const chosen = yield* Effect.promise(() =>
        contact({ state: "non interessato", priority: 0 })
      )
      const other = yield* Effect.promise(() =>
        contact({ state: "non interessato", priority: 0 })
      )
      expect(Exit.isSuccess(yield* refresh(chosen.id))).toBe(true)

      expect(yield* Effect.promise(() => rowOf(chosen.id))).toEqual({
        priority: 10,
        updatedAt: NOW,
      })
      expect(yield* Effect.promise(() => rowOf(other.id))).toEqual({
        priority: 0,
        updatedAt: BEFORE,
      })
    })
  )

  it.effect(
    "con l'id di un contatto escluso o inesistente riesce e non tocca nulla",
    () =>
      Effect.gen(function* () {
        const custom = yield* Effect.promise(() =>
          contact({
            state: "non interessato",
            priority: 77,
            customPriority: true,
          })
        )
        expect(Exit.isSuccess(yield* refresh(custom.id))).toBe(true)
        expect(Exit.isSuccess(yield* refresh(999_999))).toBe(true)

        expect(yield* Effect.promise(() => rowOf(custom.id))).toEqual({
          priority: 77,
          updatedAt: BEFORE,
        })
      })
  )

  it.effect("senza contatti da ricalcolare riesce", () =>
    Effect.gen(function* () {
      expect(Exit.isSuccess(yield* refresh())).toBe(true)
    })
  )

  it.effect(
    "se una scrittura fallisce l'Effect fallisce con DbError e nessuna priorità cambia",
    () =>
      Effect.gen(function* () {
        const first = yield* Effect.promise(() =>
          contact({ state: "non interessato", priority: 0 })
        )
        const failing = yield* Effect.promise(() =>
          contact({ state: "followup", priority: 150 })
        )
        const last = yield* Effect.promise(() =>
          contact({ state: "chiamare", priority: 0 })
        )
        yield* Effect.promise(() => failNextUpdateOf(task, { id: failing.id }))

        const exit = yield* refresh()

        expect(failureTag(exit)).toBe("DbError")
        expect(yield* Effect.promise(() => rowOf(first.id))).toEqual({
          priority: 0,
          updatedAt: BEFORE,
        })
        expect(yield* Effect.promise(() => rowOf(failing.id))).toEqual({
          priority: 150,
          updatedAt: BEFORE,
        })
        expect(yield* Effect.promise(() => rowOf(last.id))).toEqual({
          priority: 0,
          updatedAt: BEFORE,
        })
      })
  )
})
