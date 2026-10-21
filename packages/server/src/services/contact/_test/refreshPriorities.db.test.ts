import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { Exit } from "effect"
import { eq } from "drizzle-orm"
import { task } from "@mito/db/schema/task"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, runServer } from "@/test/effect"
import { failNextUpdateOf } from "@/test/failpoint"
import { createAlert, createCustomer, createTask } from "@/test/factories"
import { refreshPriorities } from "../refreshPriorities"

/** 05:00 in Italy, when the night's crons have run. */
const NOW = new Date("2026-10-14T03:00:00.000Z")
const BEFORE = new Date("2026-10-01T08:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000
const YESTERDAY = new Date(NOW.getTime() - DAY)
const TOMORROW = new Date(NOW.getTime() + DAY)

/** The program as the priority route runs it: `runServer` provides ServerLive. */
const refresh = (taskId?: number) => runServer(refreshPriorities(taskId))

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
  it("senza id ricalcola i contatti attivi senza priorità personalizzata e lascia gli altri come sono", async () => {
    const toCall = await contact({ state: "chiamare", priority: 0 })
    const notInterested = await contact({
      state: "non interessato",
      priority: 0,
    })
    const followup = await contact({ state: "followup", priority: 150 })
    const alreadyUrgent = await contact({ state: "chiamare", priority: 120 })
    const custom = await contact({
      state: "non interessato",
      priority: 77,
      customPriority: true,
    })
    const inactive = await contact({
      state: "non interessato",
      priority: 5,
      isActive: false,
    })

    expect(Exit.isSuccess(await refresh())).toBe(true)

    expect(await rowOf(toCall.id)).toEqual({ priority: 120, updatedAt: NOW })
    expect(await rowOf(notInterested.id)).toEqual({
      priority: 10,
      updatedAt: NOW,
    })
    expect(await rowOf(followup.id)).toEqual({ priority: 1, updatedAt: NOW })
    expect(await rowOf(alreadyUrgent.id)).toEqual({
      priority: 120,
      updatedAt: BEFORE,
    })
    expect(await rowOf(custom.id)).toEqual({ priority: 77, updatedAt: BEFORE })
    expect(await rowOf(inactive.id)).toEqual({ priority: 5, updatedAt: BEFORE })
  })

  it("un alert scaduto in richiamare vale venti punti, uno futuro nessuno", async () => {
    const overdue = await contact({ state: "richiamare", priority: 0 })
    await createAlert({ taskId: overdue.id, deadline: YESTERDAY })
    const scheduled = await contact({ state: "richiamare", priority: 0 })
    await createAlert({ taskId: scheduled.id, deadline: TOMORROW })

    expect(Exit.isSuccess(await refresh())).toBe(true)

    expect((await rowOf(overdue.id)).priority).toBe(20)
    expect((await rowOf(scheduled.id)).priority).toBe(0)
  })

  it("con un id ricalcola solo quel contatto", async () => {
    const chosen = await contact({ state: "non interessato", priority: 0 })
    const other = await contact({ state: "non interessato", priority: 0 })

    expect(Exit.isSuccess(await refresh(chosen.id))).toBe(true)

    expect(await rowOf(chosen.id)).toEqual({ priority: 10, updatedAt: NOW })
    expect(await rowOf(other.id)).toEqual({ priority: 0, updatedAt: BEFORE })
  })

  it("con l'id di un contatto escluso o inesistente riesce e non tocca nulla", async () => {
    const custom = await contact({
      state: "non interessato",
      priority: 77,
      customPriority: true,
    })

    expect(Exit.isSuccess(await refresh(custom.id))).toBe(true)
    expect(Exit.isSuccess(await refresh(999_999))).toBe(true)

    expect(await rowOf(custom.id)).toEqual({ priority: 77, updatedAt: BEFORE })
  })

  it("senza contatti da ricalcolare riesce", async () => {
    expect(Exit.isSuccess(await refresh())).toBe(true)
  })

  it("se una scrittura fallisce l'Effect fallisce con DbError e nessuna priorità cambia", async () => {
    const first = await contact({ state: "non interessato", priority: 0 })
    const failing = await contact({ state: "followup", priority: 150 })
    const last = await contact({ state: "chiamare", priority: 0 })
    await failNextUpdateOf(task, { id: failing.id })

    const exit = await refresh()

    expect(failureTag(exit)).toBe("DbError")
    expect(await rowOf(first.id)).toEqual({ priority: 0, updatedAt: BEFORE })
    expect(await rowOf(failing.id)).toEqual({
      priority: 150,
      updatedAt: BEFORE,
    })
    expect(await rowOf(last.id)).toEqual({ priority: 0, updatedAt: BEFORE })
  })
})
