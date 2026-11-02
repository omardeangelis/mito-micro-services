import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import { alert } from "@mito/db/schema/task"
import { type GetContactsInput } from "@mito/domain/contact/listInput"
import { getContacts } from "../getContacts"
import { db } from "@mito/db"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

// 2026-03-11 in Rome
const NOW = new Date("2026-03-11T09:00:00Z")
const YESTERDAY = new Date("2026-03-10T09:00:00Z")
const TODAY_EVENING = new Date("2026-03-11T20:00:00Z")
const TOMORROW = new Date("2026-03-12T09:00:00Z")

const seed = async (values: Parameters<typeof createTask>[0] = {}) => {
  const customer = await createCustomer()
  return createTask({ customerId: customer.id, ...values })
}

/** The list as the operator sees it at `NOW` (AC5 reads the clock). */
const list = (input: Partial<GetContactsInput> = {}) =>
  Effect.gen(function* () {
    const operator = yield* Effect.promise(() => createOperator())
    yield* TestClock.setTime(NOW.getTime())
    return yield* getContacts({
      actor: { operatorId: operator.id, role: "ADMIN" },
      page: 1,
      perPage: 50,
      orderBy: "priority",
      sortedBy: "desc",
      operatorIds: [],
      onlyMe: false,
      states: [],
      priorities: [],
      customerQuery: "",
      dateField: "closedAt",
      hasAlert: false,
      includeInactive: false,
      ...input,
    }).pipe(provideServer)
  })

const ids = (result: { contacts: { id: number }[] }) =>
  result.contacts.map((contact) => contact.id)

describe("getContacts: order by priority (AC5, D13)", () => {
  it.effect(
    "a Non risponde with an alert of yesterday comes before a Da chiamare without alert",
    () =>
      Effect.gen(function* () {
        const call = yield* Effect.promise(() =>
          seed({ state: "chiamare", priority: 90 })
        )
        const overdue = yield* Effect.promise(() =>
          seed({ state: "non risponde", priority: 10 })
        )
        yield* Effect.promise(() =>
          createAlert({ taskId: overdue.id, deadline: YESTERDAY })
        )

        const result = yield* list()

        expect(ids(result)).toEqual([overdue.id, call.id])
      })
  )

  it.effect(
    "puts due today, then Da chiamare, then Non risponde, then the rest, whatever the stored priority",
    () =>
      Effect.gen(function* () {
        const rest = yield* Effect.promise(() =>
          seed({ state: "richiamare", priority: 99 })
        )
        const noReply = yield* Effect.promise(() =>
          seed({ state: "non risponde", priority: 1 })
        )
        const call = yield* Effect.promise(() =>
          seed({ state: "chiamare", priority: 1 })
        )
        const dueToday = yield* Effect.promise(() =>
          seed({ state: "richiamare", priority: 1 })
        )
        yield* Effect.promise(() =>
          createAlert({ taskId: dueToday.id, deadline: TODAY_EVENING })
        )

        const result = yield* list()

        expect(ids(result)).toEqual([dueToday.id, call.id, noReply.id, rest.id])
      })
  )

  it.effect(
    "the rest stays under Non risponde with the 120 a state change wrote",
    () =>
      Effect.gen(function* () {
        const noReply = yield* Effect.promise(() =>
          seed({ state: "non risponde", priority: 1 })
        )
        // createContact, changeState and the bulk write the key of Da chiamare;
        // only the nightly refresh lowers it
        const appointment = yield* Effect.promise(() =>
          seed({ state: "app.to", priority: 120 })
        )
        const callback = yield* Effect.promise(() =>
          seed({ state: "richiamare", priority: 120 })
        )
        yield* Effect.promise(() =>
          createAlert({ taskId: callback.id, deadline: TOMORROW })
        )

        const result = yield* list()

        expect(ids(result)[0]).toBe(noReply.id)
        expect(ids(result).slice(1).sort()).toEqual(
          [appointment.id, callback.id].sort()
        )
      })
  )

  it.effect("drops out of the first group as soon as its alert closes", () =>
    Effect.gen(function* () {
      const call = yield* Effect.promise(() =>
        seed({ state: "chiamare", priority: 90 })
      )
      const overdue = yield* Effect.promise(() =>
        seed({ state: "non risponde", priority: 10 })
      )
      const expired = yield* Effect.promise(() =>
        createAlert({ taskId: overdue.id, deadline: YESTERDAY })
      )
      expect(ids(yield* list())).toEqual([overdue.id, call.id])

      yield* Effect.promise(() =>
        db
          .update(alert)
          .set({ isResolved: true })
          .where(eq(alert.id, expired.id))
      )

      expect(ids(yield* list())).toEqual([call.id, overdue.id])
    })
  )

  it.effect("an alert of tomorrow does not lift the contact", () =>
    Effect.gen(function* () {
      const call = yield* Effect.promise(() =>
        seed({ state: "chiamare", priority: 90 })
      )
      const later = yield* Effect.promise(() =>
        seed({ state: "non risponde", priority: 10 })
      )
      yield* Effect.promise(() =>
        createAlert({ taskId: later.id, deadline: TOMORROW })
      )

      expect(ids(yield* list())).toEqual([call.id, later.id])
    })
  )

  it.effect(
    "a manual priority keeps its value, whatever the state and alert",
    () =>
      Effect.gen(function* () {
        const call = yield* Effect.promise(() =>
          seed({ state: "chiamare", priority: 5 })
        )
        const manual = yield* Effect.promise(() =>
          seed({ state: "non risponde", priority: 125, customPriority: true })
        )
        const manualOverdue = yield* Effect.promise(() =>
          seed({ state: "chiamare", priority: 20, customPriority: true })
        )
        yield* Effect.promise(() =>
          createAlert({ taskId: manualOverdue.id, deadline: YESTERDAY })
        )

        const result = yield* list()

        // 125 above the call (120); 20 stays 20, below the call
        expect(ids(result)).toEqual([manual.id, call.id, manualOverdue.id])
      })
  )

  it.effect("ascending reverses the order", () =>
    Effect.gen(function* () {
      const call = yield* Effect.promise(() =>
        seed({ state: "chiamare", priority: 90 })
      )
      const overdue = yield* Effect.promise(() =>
        seed({ state: "non risponde", priority: 10 })
      )
      yield* Effect.promise(() =>
        createAlert({ taskId: overdue.id, deadline: YESTERDAY })
      )

      expect(ids(yield* list({ sortedBy: "asc" }))).toEqual([
        call.id,
        overdue.id,
      ])
    })
  )
})

describe("getContacts: expired alerts (AC24)", () => {
  it.effect("«Con alert» and the next alert count an open expired alert", () =>
    Effect.gen(function* () {
      const overdue = yield* Effect.promise(() => seed({ state: "richiamare" }))
      const expired = yield* Effect.promise(() =>
        createAlert({ taskId: overdue.id, deadline: YESTERDAY })
      )
      yield* Effect.promise(() => seed({ state: "chiamare" }))

      const result = yield* list({ hasAlert: true })

      expect(ids(result)).toEqual([overdue.id])
      expect(result.contacts[0]?.alert?.id).toBe(expired.id)
    })
  )
})

describe("getContacts: state filter (AC2)", () => {
  it.effect("Da chiamare also finds followup, nessuno and no state", () =>
    Effect.gen(function* () {
      const call = yield* Effect.promise(() => seed({ state: "chiamare" }))
      const followup = yield* Effect.promise(() => seed({ state: "followup" }))
      const none = yield* Effect.promise(() => seed({ state: "nessuno" }))
      const noState = yield* Effect.promise(() => seed({ state: null }))
      yield* Effect.promise(() => seed({ state: "richiamare" }))

      const result = yield* list({ states: ["chiamare"] })

      expect(new Set(ids(result))).toEqual(
        new Set([call.id, followup.id, none.id, noState.id])
      )
    })
  )

  it.effect("Pratica caricata also finds erogata", () =>
    Effect.gen(function* () {
      const loaded = yield* Effect.promise(() => seed({ state: "caricato" }))
      const paid = yield* Effect.promise(() => seed({ state: "erogata" }))
      yield* Effect.promise(() => seed({ state: "chiamare" }))

      const result = yield* list({ states: ["caricato"] })

      expect(new Set(ids(result))).toEqual(new Set([loaded.id, paid.id]))
    })
  )
})

describe("getContacts: old values in the filter (AC2)", () => {
  it.effect(
    "a filter on followup or nessuno finds Da chiamare and the legacy rows",
    () =>
      Effect.gen(function* () {
        const call = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const followup = yield* Effect.promise(() =>
          seed({ state: "followup" })
        )
        yield* Effect.promise(() => seed({ state: "richiamare" }))

        const result = yield* list({ states: ["nessuno"] })

        expect(new Set(ids(result))).toEqual(new Set([call.id, followup.id]))
      })
  )
})
