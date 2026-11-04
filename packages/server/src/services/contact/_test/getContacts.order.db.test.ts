import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { alert, task as taskTable } from "@mito/db/schema/task"
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
  createUser,
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

/**
 * An import run (a Wave) with `deadline` (a Rome day, or null) holding the
 * customers of `tasks`. Returns the run id.
 */
const wave = async (
  deadline: string | null,
  ...tasks: { customerId: string | null }[]
) => {
  const user = await createUser()
  const [run] = await db
    .insert(importRun)
    .values({
      startedBy: user.id,
      fileName: "wave.xlsx",
      format: "wave",
      status: "completed",
      rowsTotal: 1,
      rowsDiscarded: 0,
      deadline,
    })
    .returning()
  await joinWave(run!.id, ...tasks)
  return run!.id
}

const joinWave = (runId: number, ...tasks: { customerId: string | null }[]) =>
  db
    .insert(importRunCustomer)
    .values(tasks.map((each) => ({ runId, customerId: each.customerId! })))

/** The list as the operator sees it at `NOW` (AC5 reads the clock). */
const list = (input: Partial<GetContactsInput> = {}, at: Date = NOW) =>
  Effect.gen(function* () {
    const operator = yield* Effect.promise(() => createOperator())
    yield* TestClock.setTime(at.getTime())
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

describe("getContacts: queue order with the deadline of open Waves (AC28, D15)", () => {
  it.effect(
    "a Da chiamare of a customer in an open Wave comes before one without Wave",
    () =>
      Effect.gen(function* () {
        const inWave = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const plain = yield* Effect.promise(() => seed({ state: "chiamare" }))
        yield* Effect.promise(() => wave("2026-03-12", inWave))

        expect(ids(yield* list())).toEqual([inWave.id, plain.id])
      })
  )

  it.effect("the six groups of AC28 come in order", () =>
    Effect.gen(function* () {
      const rest = yield* Effect.promise(() =>
        seed({ state: "richiamare", priority: 99 })
      )
      const noReplyWave = yield* Effect.promise(() =>
        seed({ state: "non risponde" })
      )
      const noReply = yield* Effect.promise(() =>
        seed({ state: "non risponde" })
      )
      const callWave = yield* Effect.promise(() => seed({ state: "chiamare" }))
      const call = yield* Effect.promise(() => seed({ state: "chiamare" }))
      const dueToday = yield* Effect.promise(() => seed({ state: "chiamare" }))
      yield* Effect.promise(() =>
        createAlert({ taskId: dueToday.id, deadline: TODAY_EVENING })
      )
      yield* Effect.promise(() => wave("2026-03-20", callWave, noReplyWave))

      expect(ids(yield* list())).toEqual([
        dueToday.id,
        callWave.id,
        call.id,
        noReplyWave.id,
        noReply.id,
        rest.id,
      ])
    })
  )

  it.effect(
    "the nearest deadline comes first: Promo of 8/11 before Wave of 30/11",
    () =>
      Effect.gen(function* () {
        const far = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const near = yield* Effect.promise(() => seed({ state: "chiamare" }))
        yield* Effect.promise(() => wave("2026-03-30", far))
        yield* Effect.promise(() => wave("2026-03-15", near))

        expect(ids(yield* list())).toEqual([near.id, far.id])
      })
  )

  it.effect("a customer in two open Waves takes the nearest deadline", () =>
    Effect.gen(function* () {
      const both = yield* Effect.promise(() => seed({ state: "chiamare" }))
      const middle = yield* Effect.promise(() => seed({ state: "chiamare" }))
      yield* Effect.promise(() => wave("2026-03-30", both))
      yield* Effect.promise(() => wave("2026-03-15", middle))
      yield* Effect.promise(() => wave("2026-03-12", both))

      expect(ids(yield* list())).toEqual([both.id, middle.id])
    })
  )

  it.effect("a Wave without deadline or expired gives no precedence", () =>
    Effect.gen(function* () {
      const plain = yield* Effect.promise(() => seed({ state: "chiamare" }))
      const noDeadline = yield* Effect.promise(() =>
        seed({ state: "chiamare" })
      )
      const expired = yield* Effect.promise(() => seed({ state: "chiamare" }))
      yield* Effect.promise(() => wave(null, noDeadline))
      yield* Effect.promise(() => wave("2026-03-10", expired))

      // all three tie on the key: the task id settles, newest first
      expect(ids(yield* list())).toEqual([expired.id, noDeadline.id, plain.id])
    })
  )

  it.effect("a deadline of today is still open", () =>
    Effect.gen(function* () {
      const today = yield* Effect.promise(() => seed({ state: "chiamare" }))
      const plain = yield* Effect.promise(() => seed({ state: "chiamare" }))
      yield* Effect.promise(() => wave("2026-03-11", today))

      expect(ids(yield* list())).toEqual([today.id, plain.id])
    })
  )

  it.effect("extending a Wave changes the order on the next read", () =>
    Effect.gen(function* () {
      const a = yield* Effect.promise(() => seed({ state: "chiamare" }))
      const b = yield* Effect.promise(() => seed({ state: "chiamare" }))
      const runA = yield* Effect.promise(() => wave("2026-03-12", a))
      yield* Effect.promise(() => wave("2026-03-20", b))
      expect(ids(yield* list())).toEqual([a.id, b.id])

      yield* Effect.promise(() =>
        db
          .update(importRun)
          .set({ deadline: "2026-04-30" })
          .where(eq(importRun.id, runA))
      )

      expect(ids(yield* list())).toEqual([b.id, a.id])
    })
  )

  it.effect(
    "ascending is the exact reverse, inside 120 with and without Wave",
    () =>
      Effect.gen(function* () {
        const plainOld = yield* Effect.promise(() =>
          seed({ state: "chiamare" })
        )
        const plainNew = yield* Effect.promise(() =>
          seed({ state: "chiamare" })
        )
        const near = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const far = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const noReplyWave = yield* Effect.promise(() =>
          seed({ state: "non risponde" })
        )
        const noReply = yield* Effect.promise(() =>
          seed({ state: "non risponde" })
        )
        yield* Effect.promise(() => wave("2026-03-12", near, noReplyWave))
        yield* Effect.promise(() => wave("2026-03-30", far))

        const desc = ids(yield* list({ sortedBy: "desc" }))
        expect(desc).toEqual([
          near.id,
          far.id,
          plainNew.id,
          plainOld.id,
          noReplyWave.id,
          noReply.id,
        ])
        expect(ids(yield* list({ sortedBy: "asc" }))).toEqual(
          [...desc].reverse()
        )
      })
  )

  it.effect(
    "a manual 120 without open Wave goes after a Da chiamare of an open Wave; ties stay by task id",
    () =>
      Effect.gen(function* () {
        const manualOld = yield* Effect.promise(() =>
          seed({ state: "chiamare", priority: 120, customPriority: true })
        )
        const manualNew = yield* Effect.promise(() =>
          seed({ state: "chiamare", priority: 120, customPriority: true })
        )
        const inWave = yield* Effect.promise(() => seed({ state: "chiamare" }))
        yield* Effect.promise(() => wave("2026-03-30", inWave))

        expect(ids(yield* list())).toEqual([
          inWave.id,
          manualNew.id,
          manualOld.id,
        ])
        expect(ids(yield* list({ sortedBy: "asc" }))).toEqual([
          manualOld.id,
          manualNew.id,
          inWave.id,
        ])
      })
  )
  it.effect(
    "a followup and a Da chiamare without state in an open Wave get the precedence too",
    () =>
      Effect.gen(function* () {
        const followup = yield* Effect.promise(() =>
          seed({ state: "followup" })
        )
        const noState = yield* Effect.promise(() => seed({ state: null }))
        // the newest task: it would lead if the Wave gave no precedence
        const plain = yield* Effect.promise(() => seed({ state: "chiamare" }))
        yield* Effect.promise(() => wave("2026-03-20", followup))
        yield* Effect.promise(() => wave("2026-03-15", noState))

        expect(ids(yield* list())).toEqual([noState.id, followup.id, plain.id])
      })
  )

  it.effect(
    "a manual 120 in an open Wave still goes after the Wave rows without manual priority",
    () =>
      Effect.gen(function* () {
        const inWave = yield* Effect.promise(() => seed({ state: "chiamare" }))
        // the newest task: it would lead if the manual row took the key
        const manual = yield* Effect.promise(() =>
          seed({ state: "chiamare", priority: 120, customPriority: true })
        )
        yield* Effect.promise(() => wave("2026-03-12", manual, inWave))

        expect(ids(yield* list())).toEqual([inWave.id, manual.id])
      })
  )

  it.effect(
    "a Richiamo in an open Wave keeps the task id order: no deadline key outside Da chiamare and Non risponde",
    () =>
      Effect.gen(function* () {
        const old = yield* Effect.promise(() =>
          seed({ state: "richiamare", priority: 50 })
        )
        const inWave = yield* Effect.promise(() =>
          seed({ state: "richiamare", priority: 50 })
        )
        const newest = yield* Effect.promise(() =>
          seed({ state: "richiamare", priority: 50 })
        )
        yield* Effect.promise(() => wave("2026-03-12", old))

        expect(ids(yield* list())).toEqual([newest.id, inWave.id, old.id])
      })
  )

  it.effect(
    "a deadline of the UTC day is expired when the Rome day is already the next one",
    () =>
      Effect.gen(function* () {
        const lapsed = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const plain = yield* Effect.promise(() => seed({ state: "chiamare" }))
        yield* Effect.promise(() => wave("2026-03-11", lapsed))
        // 23:30Z of the 11th is 00:30 of the 12th in Rome
        const late = new Date("2026-03-11T23:30:00Z")

        // still open at NOW: the Wave leads over the newer task
        expect(ids(yield* list())).toEqual([lapsed.id, plain.id])
        // expired in Rome: tie on the key, newest task first
        expect(ids(yield* list({}, late))).toEqual([plain.id, lapsed.id])
      })
  )

  it.effect(
    "a contact moved from Richiamo to Da chiamare in an open Wave takes the precedence on the next read",
    () =>
      Effect.gen(function* () {
        const plain = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const moved = yield* Effect.promise(() =>
          seed({ state: "richiamare", priority: 50 })
        )
        yield* Effect.promise(() => wave("2026-03-30", moved))
        const newest = yield* Effect.promise(() => seed({ state: "chiamare" }))
        // Richiamo: below every Da chiamare
        expect(ids(yield* list())).toEqual([newest.id, plain.id, moved.id])

        yield* Effect.promise(() =>
          db
            .update(taskTable)
            .set({ state: "chiamare", priority: 120 })
            .where(eq(taskTable.id, moved.id))
        )

        expect(ids(yield* list())).toEqual([moved.id, newest.id, plain.id])
      })
  )

  it.effect(
    "inside the due alert group the Wave deadline still orders the contacts in a queue state",
    () =>
      Effect.gen(function* () {
        const plain = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const inWave = yield* Effect.promise(() => seed({ state: "chiamare" }))
        const newest = yield* Effect.promise(() => seed({ state: "chiamare" }))
        for (const each of [plain, inWave, newest]) {
          yield* Effect.promise(() =>
            createAlert({ taskId: each.id, deadline: YESTERDAY })
          )
        }
        yield* Effect.promise(() => wave("2026-03-12", inWave))

        expect(ids(yield* list())).toEqual([inWave.id, newest.id, plain.id])
      })
  )
})
