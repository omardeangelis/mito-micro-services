import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { asc, eq, getTableName } from "drizzle-orm"
import { type TaskStatus } from "@mito/domain/schemas"
import { customers } from "@mito/db/schema/customers"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { processDueAlerts } from "../processDueAlerts"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import { beforeNextLockOf } from "@/test/failpoint"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

const NOW = new Date("2026-09-25T06:00:00.000Z")
const TODAY = new Date("2026-09-25T08:00:00.000Z")
const EARLIER_DAY = new Date("2026-09-20T08:00:00.000Z")
const THREE_DAYS_AGO = new Date("2026-09-22T08:00:00.000Z")
const TOMORROW = new Date("2026-09-26T08:00:00.000Z")

const run = (budgetMs: number, now = NOW) =>
  Effect.gen(function* () {
    const exit = yield* processDueAlerts(now, { budgetMs }).pipe(
      provideServer,
      Effect.exit
    )
    if (exit._tag === "Failure") throw new Error("processDueAlerts failed")
    return exit.value
  })

async function seedAlert(
  deadline: Date,
  {
    state = "richiamare",
    isActive = true,
  }: {
    state?: TaskStatus
    isActive?: boolean
  } = {}
) {
  const operator = await createOperator()
  const customer = await createCustomer({ operatorId: operator.id })
  const contact = await createTask({
    customerId: customer.id,
    operatorId: operator.id,
    state,
    isActive,
  })
  const alert = await createAlert({ taskId: contact.id, deadline })
  return { operator, customer, contact, alert }
}

type Seeded = Awaited<ReturnType<typeof seedAlert>>

const contactsOf = ({ customer }: Seeded) =>
  testDb
    .select({ id: task.id, state: task.state, isActive: task.isActive })
    .from(task)
    .where(eq(task.customerId, customer.id))
    .orderBy(asc(task.id))

const alertOf = async ({ alert: seeded }: Seeded) => {
  const [row] = await testDb.select().from(alert).where(eq(alert.id, seeded.id))
  return row
}

const logOf = ({ customer }: Seeded) =>
  testDb
    .select()
    .from(taskEventLog)
    .where(eq(taskEventLog.customerId, customer.id))
    .orderBy(asc(taskEventLog.id))

/** The contact is `chiamare`, with its alert open: no other contact, no close. */
const expectWorked = async (seeded: Seeded) => {
  expect(await contactsOf(seeded)).toEqual([
    { id: seeded.contact.id, state: "chiamare", isActive: true },
  ])
  expect(await alertOf(seeded)).toMatchObject({
    id: seeded.alert.id,
    isResolved: false,
  })
  expect(await logOf(seeded)).toMatchObject([
    {
      action: "state_change",
      source: "cron_alert",
      taskId: seeded.contact.id,
      fromState: "richiamare",
      toState: "chiamare",
    },
  ])
}

/** Nothing written for the customer: the contact as seeded, the alert open. */
const expectUntouched = async (seeded: Seeded, state: TaskStatus) => {
  expect(await contactsOf(seeded)).toEqual([
    {
      id: seeded.contact.id,
      state,
      isActive: seeded.contact.isActive,
    },
  ])
  expect(await alertOf(seeded)).toMatchObject({ isResolved: false })
  expect(await logOf(seeded)).toEqual([])
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
  await createSystemOperator()
})

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

// AC19, AC20: the pass moves the contact, it does not close the alert
describe("processDueAlerts: Richiamo diventa Da chiamare", () => {
  it.effect(
    "un alert di oggi porta il contatto a Da chiamare, con l'alert aperto e nessun contatto nuovo",
    () =>
      Effect.gen(function* () {
        const seeded = yield* given(() => seedAlert(TODAY))
        expect(yield* run(60_000)).toEqual({
          found: 1,
          processed: 1,
          skipped: 0,
          failed: 0,
          remaining: 0,
        })

        yield* given(() => expectWorked(seeded))
      })
  )

  it.effect(
    "un alert scaduto da 3 giorni, dopo notti saltate, fa lo stesso lavoro",
    () =>
      Effect.gen(function* () {
        const seeded = yield* given(() => seedAlert(THREE_DAYS_AGO))
        expect(yield* run(60_000)).toMatchObject({ found: 1, processed: 1 })

        yield* given(() => expectWorked(seeded))
      })
  )

  it.effect("un alert di domani non si tocca", () =>
    Effect.gen(function* () {
      const seeded = yield* given(() => seedAlert(TOMORROW))
      expect(yield* run(60_000)).toMatchObject({ found: 0, processed: 0 })

      yield* given(() => expectUntouched(seeded, "richiamare"))
    })
  )

  it.effect.each([
    ["non risponde", "non risponde"],
    ["app.to", "app.to"],
  ] as const)("un contatto %s con un alert di oggi resta com'è", ([_, state]) =>
    Effect.gen(function* () {
      const seeded = yield* given(() => seedAlert(TODAY, { state }))
      expect(yield* run(60_000)).toMatchObject({ found: 0, processed: 0 })

      yield* given(() => expectUntouched(seeded, state))
    })
  )

  it.effect("un contatto non attivo con un alert aperto non cambia", () =>
    Effect.gen(function* () {
      const seeded = yield* given(() => seedAlert(TODAY, { isActive: false }))
      expect(yield* run(60_000)).toMatchObject({ found: 0, processed: 0 })

      yield* given(() => expectUntouched(seeded, "richiamare"))
    })
  )

  it.effect("due giri di fila danno lo stesso risultato del primo", () =>
    Effect.gen(function* () {
      const seeded = yield* given(() => seedAlert(TODAY))
      expect(yield* run(60_000)).toMatchObject({ found: 1, processed: 1 })
      expect(yield* run(60_000)).toEqual({
        found: 0,
        processed: 0,
        skipped: 0,
        failed: 0,
        remaining: 0,
      })

      yield* given(() => expectWorked(seeded))
    })
  )

  it.effect(
    "un contatto che dopo il primo giro ha cambiato stato non torna a Da chiamare",
    () =>
      Effect.gen(function* () {
        const seeded = yield* given(() => seedAlert(TODAY))
        yield* run(60_000)
        yield* given(() =>
          testDb
            .update(task)
            .set({ state: "non risponde" })
            .where(eq(task.id, seeded.contact.id))
        )
        expect(yield* run(60_000)).toMatchObject({ found: 0, processed: 0 })

        expect(yield* given(() => contactsOf(seeded))).toEqual([
          { id: seeded.contact.id, state: "non risponde", isActive: true },
        ])
        expect(yield* given(() => logOf(seeded))).toHaveLength(1)
      })
  )
})

describe("processDueAlerts a tempo", () => {
  // The budget is measured on the real clock: under TestClock no time passes
  it.live(
    "a tempo esaurito elabora solo il primo alert: l'altro resta in Richiamo e lo prende la chiamata dopo",
    () =>
      Effect.gen(function* () {
        const first = yield* given(() => seedAlert(EARLIER_DAY))
        const second = yield* given(() => seedAlert(EARLIER_DAY))
        expect(yield* run(0)).toEqual({
          found: 2,
          processed: 1,
          skipped: 0,
          failed: 0,
          remaining: 1,
        })
        expect(yield* given(() => contactsOf(second))).toMatchObject([
          { state: "richiamare" },
        ])
        expect(yield* run(0)).toEqual({
          found: 1,
          processed: 1,
          skipped: 0,
          failed: 0,
          remaining: 0,
        })
        for (const seeded of [first, second]) {
          yield* given(() => expectWorked(seeded))
        }
      })
  )
})

// The app saves a deadline as midnight in Italy: 22:00 UTC of the day before
// in summer time, 23:00 UTC in winter time. The schedule runs at 23:47 UTC,
// past midnight in Italy all year, when the UTC day is still the one before
describe("processDueAlerts: il giorno è quello italiano", () => {
  const BUDGET_MS = 60_000

  it.effect.each([
    ["in ora legale", "2026-10-11T22:00:00.000Z", "2026-10-11T23:47:00.000Z"],
    ["in ora solare", "2026-11-09T23:00:00.000Z", "2026-11-09T23:47:00.000Z"],
    [
      "il giorno in cui torna l'ora solare",
      "2026-10-24T22:00:00.000Z",
      "2026-10-24T23:47:00.000Z",
    ],
    [
      "il giorno in cui torna l'ora legale",
      "2027-03-27T23:00:00.000Z",
      "2027-03-27T23:47:00.000Z",
    ],
    [
      "a un'ora qualsiasi della giornata",
      "2026-10-12T21:59:00.000Z",
      "2026-10-11T23:47:00.000Z",
    ],
    [
      "lanciato a mano di giorno",
      "2026-10-11T22:00:00.000Z",
      "2026-10-12T08:00:00.000Z",
    ],
    // Expired days ago: the same work (AC20)
    [
      "in ora legale, scaduto ieri",
      "2026-10-10T22:00:00.000Z",
      "2026-10-11T23:47:00.000Z",
    ],
    [
      "in ora solare, scaduto ieri",
      "2026-11-08T23:00:00.000Z",
      "2026-11-09T23:47:00.000Z",
    ],
  ])(
    "un alert che scade oggi o prima porta il contatto a Da chiamare %s",
    ([_, deadline = "", now = ""]) =>
      Effect.gen(function* () {
        const seeded = yield* given(() => seedAlert(new Date(deadline)))
        expect(yield* run(BUDGET_MS, new Date(now))).toMatchObject({
          found: 1,
          processed: 1,
        })

        yield* given(() => expectWorked(seeded))
      })
  )

  it.effect.each([
    ["in ora legale", "2026-10-12T22:00:00.000Z", "2026-10-11T23:47:00.000Z"],
    ["in ora solare", "2026-11-10T23:00:00.000Z", "2026-11-09T23:47:00.000Z"],
    // Why the schedule isn't an hour earlier: in winter time Italy would still
    // be on the day that is ending
    [
      "un'ora prima dello schedule, in ora solare",
      "2026-11-09T23:00:00.000Z",
      "2026-11-09T22:47:00.000Z",
    ],
  ])(
    "un alert che scade domani lascia il contatto in Richiamo %s",
    ([_, deadline = "", now = ""]) =>
      Effect.gen(function* () {
        const seeded = yield* given(() => seedAlert(new Date(deadline)))
        expect(yield* run(BUDGET_MS, new Date(now))).toMatchObject({ found: 0 })

        yield* given(() => expectUntouched(seeded, "richiamare"))
      })
  )
})

// What another writer commits after the pass read its list and before it
// takes the customer's lock: the update under the lock reads the contact again
// and skips it, whatever changed
describe("processDueAlerts: un contatto cambiato prima del lock si salta", () => {
  const TASK = `"${getTableName(task)}"`
  const ALERT = `"${getTableName(alert)}"`

  const linkNewAlert = ({ contact }: Seeded) =>
    `INSERT INTO ${ALERT} (task_id, deadline) VALUES (${contact.id}, '${TOMORROW.toISOString()}');
     UPDATE ${TASK} SET alert_id = (SELECT max(id) FROM ${ALERT}) WHERE id = ${contact.id}`

  const alertsOf = ({ contact }: Seeded) =>
    testDb
      .select({
        id: alert.id,
        isResolved: alert.isResolved,
        resolvedBy: alert.resolvedBy,
        resolvedAt: alert.resolvedAt,
        resolution: alert.resolution,
      })
      .from(alert)
      .where(eq(alert.taskId, contact.id))
      .orderBy(asc(alert.id))

  /** Skipped: counted as such, no log row, no alert closed by the pass. */
  const expectSkipped = function* (
    seeded: Seeded,
    contact: { state: TaskStatus; isActive: boolean },
    alertsResolved: boolean[]
  ) {
    expect(yield* given(() => contactsOf(seeded))).toEqual([
      { id: seeded.contact.id, ...contact },
    ])
    expect(yield* given(() => logOf(seeded))).toEqual([])
    const rows = yield* given(() => alertsOf(seeded))
    expect(rows.map(({ id: _id, ...row }) => row)).toEqual(
      alertsResolved.map((isResolved) => ({
        isResolved,
        resolvedBy: null,
        resolvedAt: null,
        resolution: null,
      }))
    )
    expect(rows[0]?.id).toBe(seeded.alert.id)
  }

  const skipped = {
    found: 1,
    processed: 0,
    skipped: 1,
    failed: 0,
    remaining: 0,
  }

  it.effect("un contatto passato a Non risponde resta Non risponde", () =>
    Effect.gen(function* () {
      const seeded = yield* given(() => seedAlert(TODAY))
      beforeNextLockOf(
        customers,
        `UPDATE ${TASK} SET state = 'non risponde' WHERE id = ${seeded.contact.id}`
      )
      expect(yield* run(60_000)).toEqual(skipped)

      yield* expectSkipped(seeded, { state: "non risponde", isActive: true }, [
        false,
      ])
    })
  )

  it.effect("un contatto con l'alert chiuso resta in Richiamo", () =>
    Effect.gen(function* () {
      const seeded = yield* given(() => seedAlert(TODAY))
      beforeNextLockOf(
        customers,
        `UPDATE ${ALERT} SET is_resolved = true WHERE id = ${seeded.alert.id}`
      )
      expect(yield* run(60_000)).toEqual(skipped)

      yield* expectSkipped(seeded, { state: "richiamare", isActive: true }, [
        true,
      ])
    })
  )

  it.effect(
    "un contatto con un alert nuovo al posto di quello chiuso resta in Richiamo",
    () =>
      Effect.gen(function* () {
        const seeded = yield* given(() => seedAlert(TODAY))
        beforeNextLockOf(
          customers,
          `UPDATE ${ALERT} SET is_resolved = true WHERE id = ${seeded.alert.id};
           ${linkNewAlert(seeded)}`
        )
        expect(yield* run(60_000)).toEqual(skipped)

        yield* expectSkipped(seeded, { state: "richiamare", isActive: true }, [
          true,
          false,
        ])
      })
  )

  it.effect(
    "un contatto legato a un alert nuovo, con il vecchio ancora aperto, resta in Richiamo",
    () =>
      Effect.gen(function* () {
        const seeded = yield* given(() => seedAlert(TODAY))
        beforeNextLockOf(customers, linkNewAlert(seeded))
        expect(yield* run(60_000)).toEqual(skipped)

        yield* expectSkipped(seeded, { state: "richiamare", isActive: true }, [
          false,
          false,
        ])
      })
  )

  it.effect("un contatto disattivato resta in Richiamo, non attivo", () =>
    Effect.gen(function* () {
      const seeded = yield* given(() => seedAlert(TODAY))
      beforeNextLockOf(
        customers,
        `UPDATE ${TASK} SET is_active = false WHERE id = ${seeded.contact.id}`
      )
      expect(yield* run(60_000)).toEqual(skipped)

      yield* expectSkipped(seeded, { state: "richiamare", isActive: false }, [
        false,
      ])
    })
  )
})
