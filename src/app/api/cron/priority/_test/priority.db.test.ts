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
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { task } from "@mito/db/schema/task"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { causeTag } from "@/test/effect"
import { reportedErrors } from "@/test/errorReporter"
import { countStatementsOn, failNextUpdateOf } from "@/test/failpoint"
import { createAlert, createCustomer, createTask } from "@/test/factories"
import { GET, POST } from "../route"

// The cron's own authentication is a boundary: these tests run as the job
vi.mock("@/app/api/_utils/auth", () => ({ authCheck: vi.fn(async () => null) }))

/** 05:00 in Italy, when the night's crons have run. */
const NOW = new Date("2026-10-14T03:00:00.000Z")
const BEFORE = new Date("2026-10-01T08:00:00.000Z")
const YESTERDAY = new Date("2026-10-13T08:00:00.000Z")
const TOMORROW = new Date("2026-10-15T08:00:00.000Z")

const url = "http://localhost/api/cron/priority"

async function runCron() {
  const response = await GET(new NextRequest(url))
  return { status: response.status, body: (await response.json()) as unknown }
}

async function runCronFor(id: number) {
  const response = await POST(
    new NextRequest(url, { method: "POST", body: JSON.stringify({ id }) })
  )
  return { status: response.status, body: (await response.json()) as unknown }
}

let practiceCount = 0

/** A customer with a liquidated practice, and its contact. */
async function contact(values: Partial<typeof task.$inferInsert>) {
  const customer = await createCustomer()
  const praticaId = `P-${++practiceCount}`
  await testDb.insert(practices).values({
    praticaId,
    importoFinanziato: "12000.50",
    importoErogato: "10000.00",
    rateTotali: 84,
    importoRata: "190.00",
    ratePagate: 12,
    dataLiquidazione: new Date("2026-10-10T22:00:00.000Z"),
    state: "Liquidata",
  })
  await testDb
    .insert(customerToPratica)
    .values({ customerId: customer.id, praticaId })
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

describe("cron priority (comportamento attuale)", () => {
  it("ricalcola la priorità dei contatti attivi senza priorità personalizzata, secondo lo stato", async () => {
    const toCall = await contact({ state: "chiamare", priority: 0 })
    const overdue = await contact({
      state: "richiamare",
      closedAt: YESTERDAY,
      priority: 0,
    })
    await createAlert({ taskId: overdue.id, deadline: YESTERDAY })
    const scheduled = await contact({
      state: "richiamare",
      closedAt: YESTERDAY,
      priority: 0,
    })
    await createAlert({ taskId: scheduled.id, deadline: TOMORROW })
    const neverCalled = await contact({ state: "richiamare", priority: 99 })
    const notInterested = await contact({
      state: "non interessato",
      priority: 0,
    })
    const followup = await contact({ state: "followup", priority: 150 })
    const none = await contact({ state: "nessuno", priority: 0 })

    expect(await runCron()).toEqual({
      status: 200,
      body: { message: "Cron job ran" },
    })

    const priorities = await Promise.all(
      [
        toCall,
        overdue,
        scheduled,
        neverCalled,
        notInterested,
        followup,
        none,
      ].map(async ({ id }) => (await rowOf(id)).priority)
    )
    // Per calculatePriority: an overdue alert adds 20, a last call 30 whatever
    // its day, the liquidation date nothing
    expect(priorities).toEqual([120, 50, 30, 0, 10, 1, 1])
  })

  it("segna come aggiornati i contatti che ricalcola, e solo quelli", async () => {
    const refreshed = await contact({ state: "non interessato", priority: 0 })
    const urgent = await contact({ state: "chiamare", priority: 120 })
    const custom = await contact({
      state: "richiamare",
      priority: 77,
      customPriority: true,
    })
    const inactive = await contact({
      state: "non interessato",
      priority: 5,
      isActive: false,
    })

    await runCron()

    expect(await rowOf(refreshed.id)).toEqual({ priority: 10, updatedAt: NOW })
    expect(await rowOf(urgent.id)).toEqual({ priority: 120, updatedAt: BEFORE })
    expect(await rowOf(custom.id)).toEqual({ priority: 77, updatedAt: BEFORE })
    expect(await rowOf(inactive.id)).toEqual({ priority: 5, updatedAt: BEFORE })
  })

  it("con un id ricalcola solo quel contatto", async () => {
    const chosen = await contact({ state: "non interessato", priority: 0 })
    const other = await contact({ state: "non interessato", priority: 0 })

    expect(await runCronFor(chosen.id)).toEqual({
      status: 200,
      body: { message: "Cron job ran" },
    })

    expect(await rowOf(chosen.id)).toEqual({ priority: 10, updatedAt: NOW })
    expect(await rowOf(other.id)).toEqual({ priority: 0, updatedAt: BEFORE })
  })

  it("senza contatti da ricalcolare risponde come quando ne ha", async () => {
    await contact({ state: "chiamare", priority: 120 })

    expect(await runCron()).toEqual({
      status: 200,
      body: { message: "Cron job ran" },
    })
  })
})

describe("cron priority: tutti i contatti in poche scritture", () => {
  it("se una scrittura fallisce non cambia nessuna priorità, risponde come oggi e lo segnala una volta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const first = await contact({ state: "non interessato", priority: 0 })
    const failing = await contact({ state: "followup", priority: 150 })
    const last = await contact({ state: "chiamare", priority: 0 })
    await failNextUpdateOf(task, { id: failing.id })

    // priority.js reads only the status: a 200 keeps the job green, as today
    expect(await runCron()).toEqual({
      status: 200,
      body: {
        message: "Error exporting data",
        filePath: null,
        error: "Error exporting data",
      },
    })

    expect(await rowOf(first.id)).toEqual({ priority: 0, updatedAt: BEFORE })
    expect(await rowOf(failing.id)).toEqual({
      priority: 150,
      updatedAt: BEFORE,
    })
    expect(await rowOf(last.id)).toEqual({ priority: 0, updatedAt: BEFORE })
    expect(reportedErrors).toHaveLength(1)
    expect(causeTag(reportedErrors[0]!.cause)).toBe("DbError")
    expect(reportedErrors[0]!.data).toEqual({ route: "/api/cron/priority" })
  })

  it("ricalcola migliaia di contatti con una scrittura per valore di priorità, non una per contatto", async () => {
    // In prod one UPDATE per contact, 20,270 of them, ran past the 60 s of
    // the function and left most priorities as they were
    const states = ["non interessato", "followup", "chiamare"] as const
    const rows = Array.from({ length: 3000 }, (_, index) => ({
      id: `bulk-${index}`,
      state: states[index % states.length]!,
    }))
    await testDb.insert(customers).values(
      rows.map(({ id }) => ({
        id,
        name: "Anna",
        surname: id,
        tempID: id,
        uniqueHash: id,
        source: "inbound" as const,
      }))
    )
    await testDb.insert(task).values(
      rows.map(({ id, state }) => ({
        customerId: id,
        state,
        isActive: true,
        priority: 0,
        updatedAt: BEFORE,
      }))
    )
    const updates = await countStatementsOn(task, "UPDATE")

    await runCron()

    expect(await updates()).toBeLessThanOrEqual(states.length)
    const refreshed = await testDb
      .select({ priority: task.priority, updatedAt: task.updatedAt })
      .from(task)
    expect(refreshed).toHaveLength(rows.length)
    expect(new Set(refreshed.map(({ priority }) => priority))).toEqual(
      new Set([10, 1, 120])
    )
    expect(
      refreshed.every(({ updatedAt }) => updatedAt.getTime() === NOW.getTime())
    ).toBe(true)
  })
})
