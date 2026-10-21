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
import { Effect, Layer } from "effect"
import { asc, eq } from "drizzle-orm"
import { Db, type DbClient } from "@mito/server/effect/db"
import { customers } from "@mito/db/schema/customers"
import { operators } from "@mito/db/schema/operators"
import { practices } from "@mito/db/schema/pratiche"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { cleanupTaskEventLog } from "../cleanupTaskEventLog"
import { updateCustomerAge } from "../updateCustomerAge"
import { updatePractices } from "../updatePractices"

// The services take their client from `Db`: the module's `db` must never be
// reached, so every query on it throws (as `unset` in src/test/pg.ts)
vi.mock("@mito/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("the global db was used")
      },
    }
  ),
}))

/** 05:00 in Italy, when the night's crons have run. */
const NOW = new Date("2026-10-14T03:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000
/** 08:00 of the day the cron matches, in UTC (the time zone of the tests). */
const TODAY_AT_8 = Date.parse("2026-10-14T08:00:00.000Z")

const run = <A, E>(program: Effect.Effect<A, E, Db>) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(Layer.succeed(Db, testDb as unknown as DbClient))
    )
  )

let customerId: string
let actorOperatorId: number

/** An event of the test customer, created at `createdAt`; returns its id. */
async function eventAt(createdAt: Date) {
  const [row] = await testDb
    .insert(taskEventLog)
    .values({
      customerId,
      actorOperatorId,
      action: "state_change",
      source: "cron_alert",
      createdAt,
    })
    .returning({ id: taskEventLog.id })
  return row!.id
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  const [customer] = await testDb
    .insert(customers)
    .values({
      id: "c1",
      name: "Anna",
      surname: "Rossi",
      tempID: "c1",
      uniqueHash: "c1",
      source: "inbound",
    })
    .returning()
  customerId = customer!.id
  const [operator] = await testDb
    .insert(operators)
    .values({ userId: "system", name: "Sistema" })
    .returning()
  actorOperatorId = operator!.id
})

afterAll(async () => {
  await resetDb()
})

describe("cron services on an injected Db", () => {
  it("cleanupTaskEventLog deletes the rows older than three months", async () => {
    const old = await eventAt(new Date("2026-07-14T02:59:59.999Z"))
    const kept = await eventAt(new Date("2026-07-14T03:00:00.000Z"))

    const deleted = await run(cleanupTaskEventLog(NOW))

    expect(deleted).toBe(1)
    const remaining = await testDb
      .select({ id: taskEventLog.id })
      .from(taskEventLog)
      .orderBy(asc(taskEventLog.id))
    expect(remaining.map(({ id }) => id)).toEqual([kept])
    expect(remaining.map(({ id }) => id)).not.toContain(old)
  })
})

describe("update services on an injected Db", () => {
  beforeEach(() => {
    // Only Date: the in-memory database needs real timers
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** A practice whose next rate falls due today, imported 40 days ago. */
  async function practiceDueToday(
    praticaId: string,
    values: Partial<typeof practices.$inferInsert> = {}
  ) {
    const ratePagate = values.ratePagate ?? 12
    await testDb.insert(practices).values({
      praticaId,
      importoFinanziato: "10000",
      importoErogato: "10000",
      rateTotali: 84,
      importoRata: "190.00",
      ratePagate,
      debitoResiduo: "9000.00",
      // The cron matches DATE(data_liquidazione) plus 30 days per rate paid
      dataLiquidazione: new Date(TODAY_AT_8 - ratePagate * 30 * DAY),
      state: "Liquidata",
      lastImportUpdate: new Date(NOW.getTime() - 40 * DAY),
      ...values,
    })
  }

  async function praticaOf(praticaId: string) {
    const [row] = await testDb
      .select({
        ratePagate: practices.ratePagate,
        debitoResiduo: practices.debitoResiduo,
        state: practices.state,
      })
      .from(practices)
      .where(eq(practices.praticaId, praticaId))
    return { ...row!, debitoResiduo: Number(row!.debitoResiduo) }
  }

  async function customerAged(id: string, age: number, birthday: string) {
    await testDb.insert(customers).values({
      id,
      name: "Anna",
      surname: id,
      tempID: id,
      uniqueHash: id,
      source: "inbound",
      age,
      birthdayDate: new Date(birthday),
    })
  }

  async function ageOf(id: string) {
    const [row] = await testDb
      .select({ age: customers.age })
      .from(customers)
      .where(eq(customers.id, id))
    return row!.age
  }

  it("updatePractices adds today's rate, closes on the last one, and skips a recent import", async () => {
    await practiceDueToday("due")
    await practiceDueToday("last", { rateTotali: 13 })
    await practiceDueToday("recent", {
      lastImportUpdate: new Date(NOW.getTime() - 10 * DAY),
    })

    const updated = await run(updatePractices("2026-10-14"))

    expect(updated).toBe(2)
    expect(await praticaOf("due")).toEqual({
      ratePagate: 13,
      debitoResiduo: 8810,
      state: "Liquidata",
    })
    expect(await praticaOf("last")).toEqual({
      ratePagate: 13,
      debitoResiduo: 8810,
      state: "Chiusa",
    })
    expect(await praticaOf("recent")).toEqual({
      ratePagate: 12,
      debitoResiduo: 9000,
      state: "Liquidata",
    })
  })

  it("updateCustomerAge adds a year to the customers born on that month and day only", async () => {
    await customerAged("today", 45, "1980-10-14T12:00:00.000Z")
    await customerAged("other-year", 35, "1990-10-14T12:00:00.000Z")
    await customerAged("tomorrow", 45, "1980-10-15T12:00:00.000Z")
    await customerAged("other-month", 45, "1980-11-14T12:00:00.000Z")

    const updated = await run(updateCustomerAge(10, 14))

    expect(updated).toBe(2)
    expect(await ageOf("today")).toBe(46)
    expect(await ageOf("other-year")).toBe(36)
    expect(await ageOf("tomorrow")).toBe(45)
    expect(await ageOf("other-month")).toBe(45)
  })
})
