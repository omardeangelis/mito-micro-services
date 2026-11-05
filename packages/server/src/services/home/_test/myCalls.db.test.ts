import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { type Actor } from "@mito/domain/contact/permissions"
import { romeDayBounds } from "@mito/domain/contact/time"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createTaskEvent,
} from "@/test/factories"
import { registerCall } from "../../contact/registerCall"
import { callStats } from "../../export/callStats"
import { listMyCalls } from "../myCalls"
import { getMyDay } from "../myDay"

// 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")
const TODAY = new Date("2026-11-02T15:00:00.000Z")

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

const actorOf = ({ id }: { id: number }): Actor => ({
  operatorId: id,
  role: "OPERATORE",
})

/** A Da chiamare of `operatorId`, on a new customer. */
const contactOf = (
  operatorId: number,
  customer: Parameters<typeof createCustomer>[0] = {}
) =>
  given(async () => {
    const { id: customerId } = await createCustomer({ operatorId, ...customer })
    return createTask({ customerId, operatorId, state: "chiamare" })
  })

/** A call of `actor` on `taskId`, from the list unless `source` says otherwise. */
const call = (
  actor: Actor,
  taskId: number,
  input:
    | { outcome: "non risponde" | "app.to" | "non interessato" }
    | { outcome: "richiamare"; callback: { day: string; message?: string } },
  {
    source = "list",
    requestId = crypto.randomUUID(),
  }: { source?: "list" | "detail"; requestId?: string } = {}
) =>
  registerCall({
    requestId,
    source,
    taskId,
    actor,
    ...input,
  } as Parameters<typeof registerCall>[0]).pipe(provideServer)

const callsOf = (actor: Actor) => listMyCalls({ actor }).pipe(provideServer)
const dayOf = (actor: Actor) => getMyDay({ actor }).pipe(provideServer)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("listMyCalls: which calls (AC28, AC31)", () => {
  it.effect("has the calls of the user from the detail and the list", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const fromDetail = yield* contactOf(me.id)
      const fromList = yield* contactOf(me.id)
      yield* call(
        actorOf(me),
        fromDetail.id,
        { outcome: "app.to" },
        {
          source: "detail",
        }
      )
      yield* TestClock.setTime(NOW.getTime() + 60_000)
      yield* call(actorOf(me), fromList.id, { outcome: "non risponde" })

      const rows = yield* callsOf(actorOf(me))

      expect(rows.map(({ taskId }) => taskId)).toEqual([
        fromList.id,
        fromDetail.id,
      ])
    })
  )

  it.effect("stops at the bounds of the Rome day, not at the UTC ones", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      const { start, end } = romeDayBounds(NOW)
      const contact = yield* contactOf(me.id)
      const at = async (createdAt: Date) =>
        createTaskEvent({
          customerId: contact.customerId!,
          taskId: contact.id,
          actorOperatorId: me.id,
          action: "call",
          outcome: "non risponde",
          createdAt,
        })
      yield* given(() => at(new Date(start.getTime() - 1)))
      const first = yield* given(() => at(start))
      yield* given(() => at(end))
      yield* TestClock.setTime(NOW.getTime())

      const rows = yield* callsOf(actorOf(me))

      expect(rows.map(({ id }) => id)).toEqual([first.id])
    })
  )

  it.effect("has no call of a colleague, on a contact of mine too", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const colleague = yield* given(() => createOperator({ role: "ADMIN" }))
      const contact = yield* contactOf(me.id)
      yield* call({ operatorId: colleague.id, role: "ADMIN" }, contact.id, {
        outcome: "non risponde",
      })

      expect(yield* callsOf(actorOf(me))).toEqual([])
    })
  )

  it.effect("an ADMIN has its own calls, not those of who it can see", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const colleague = yield* given(() => createOperator())
      const theirs = yield* contactOf(colleague.id)
      const mine = yield* contactOf(admin.id)
      yield* call(actorOf(colleague), theirs.id, { outcome: "app.to" })
      yield* call({ operatorId: admin.id, role: "ADMIN" }, mine.id, {
        outcome: "non risponde",
      })

      const rows = yield* callsOf({ operatorId: admin.id, role: "ADMIN" })

      expect(rows.map(({ taskId }) => taskId)).toEqual([mine.id])
    })
  )

  it.effect("two Non risponde on the same contact are two rows", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const contact = yield* contactOf(me.id)
      yield* call(actorOf(me), contact.id, { outcome: "non risponde" })
      yield* TestClock.setTime(NOW.getTime() + 60_000)
      yield* call(actorOf(me), contact.id, { outcome: "non risponde" })

      expect(yield* callsOf(actorOf(me))).toHaveLength(2)
    })
  )

  it.effect("the same request sent again is one row", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const contact = yield* contactOf(me.id)
      const requestId = crypto.randomUUID()
      const press = () =>
        call(
          actorOf(me),
          contact.id,
          { outcome: "non risponde" },
          { requestId }
        )
      yield* press()
      yield* press()

      const rows = yield* callsOf(actorOf(me))

      expect(rows.map((row) => row.requestId)).toEqual([requestId])
    })
  )

  it.effect("at the same instant the higher id comes first", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const older = yield* contactOf(me.id)
      const newer = yield* contactOf(me.id)
      yield* call(actorOf(me), older.id, { outcome: "non risponde" })
      yield* call(actorOf(me), newer.id, { outcome: "non risponde" })

      const rows = yield* callsOf(actorOf(me))

      expect(rows.map(({ taskId }) => taskId)).toEqual([newer.id, older.id])
    })
  )
})

describe("listMyCalls: the row (AC29)", () => {
  it.effect("carries the customer, the outcome and the instant", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const contact = yield* contactOf(me.id, {
        name: "Anna",
        surname: "Rossi",
        phoneNumber: "3331234567",
      })
      const requestId = crypto.randomUUID()
      const registered = yield* call(
        actorOf(me),
        contact.id,
        { outcome: "app.to" },
        { requestId }
      )

      expect(yield* callsOf(actorOf(me))).toEqual([
        {
          id: registered.call.id,
          requestId,
          taskId: contact.id,
          name: "Anna",
          surname: "Rossi",
          phoneNumber: "3331234567",
          outcome: "app.to",
          at: NOW,
          origin: "list",
          callbackDay: null,
          message: null,
        },
      ])
    })
  )

  it.effect("a Richiamare has the day and the message of its new alert", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const contact = yield* contactOf(me.id)
      yield* call(actorOf(me), contact.id, {
        outcome: "richiamare",
        callback: { day: "2026-11-05", message: "Sera" },
      })

      const [row] = yield* callsOf(actorOf(me))

      expect(row).toMatchObject({
        outcome: "richiamare",
        callbackDay: "2026-11-05",
        message: "Sera",
      })
    })
  )

  it.effect("a Non risponde doesn't take the alert it keeps", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const contact = yield* contactOf(me.id)
      yield* given(() =>
        createAlert({
          taskId: contact.id,
          deadline: TODAY,
          message: "Sera",
        })
      )
      yield* call(actorOf(me), contact.id, { outcome: "non risponde" })

      const [row] = yield* callsOf(actorOf(me))

      expect(row).toMatchObject({
        outcome: "non risponde",
        callbackDay: null,
        message: null,
      })
    })
  )

  it.effect("the origin is alert with an alert due, list without", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const plain = yield* contactOf(me.id)
      const due = yield* contactOf(me.id)
      yield* given(() => createAlert({ taskId: due.id, deadline: TODAY }))
      yield* call(actorOf(me), plain.id, { outcome: "non risponde" })
      yield* TestClock.setTime(NOW.getTime() + 60_000)
      yield* call(actorOf(me), due.id, { outcome: "non risponde" })

      const rows = yield* callsOf(actorOf(me))

      expect(rows.map(({ taskId, origin }) => ({ taskId, origin }))).toEqual([
        { taskId: due.id, origin: "alert" },
        { taskId: plain.id, origin: "list" },
      ])
    })
  )

  it.effect(
    "an old change of state is a call, with no origin and no request, and its outcome is the state it went to",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const me = yield* given(() => createOperator())
        const old = yield* given(() =>
          createTaskEvent({
            actorOperatorId: me.id,
            fromState: "chiamare",
            toState: "app.to",
            createdAt: NOW,
          })
        )

        const [row] = yield* callsOf(actorOf(me))

        expect(row).toMatchObject({
          id: old.id,
          outcome: "app.to",
          origin: null,
          requestId: null,
        })
      })
  )

  it.effect("an old change of state to Richiamare has no alert to read", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      yield* given(() =>
        createTaskEvent({
          actorOperatorId: me.id,
          fromState: "chiamare",
          toState: "richiamare",
          createdAt: NOW,
        })
      )

      const [row] = yield* callsOf(actorOf(me))

      expect(row).toMatchObject({ callbackDay: null, message: null })
    })
  )
})

describe("getMyDay (AC7, AC8, «Stessi numeri»)", () => {
  /** A day of `me`: a mix of outcomes, an old row, and a colleague's call. */
  const dayOfCalls = Effect.gen(function* () {
    yield* TestClock.setTime(NOW.getTime())
    const me = yield* given(() => createOperator({ name: "Ada" }))
    const colleague = yield* given(() => createOperator({ name: "Bruno" }))
    const outcomes = [
      { outcome: "non risponde" },
      { outcome: "non risponde" },
      { outcome: "app.to" },
      { outcome: "non interessato" },
      { outcome: "richiamare", callback: { day: "2026-11-05" } },
    ] as const
    for (const input of outcomes) {
      const contact = yield* contactOf(me.id)
      yield* call(actorOf(me), contact.id, input)
    }
    yield* given(() =>
      createTaskEvent({
        actorOperatorId: me.id,
        fromState: "chiamare",
        toState: "app.to",
        createdAt: NOW,
      })
    )
    const theirs = yield* contactOf(colleague.id)
    yield* call(actorOf(colleague), theirs.id, { outcome: "app.to" })
    return me
  })

  it.effect("counts the calls, those answered and the appointments", () =>
    Effect.gen(function* () {
      const me = yield* dayOfCalls

      expect(yield* dayOf(actorOf(me))).toEqual({
        calls: 6,
        answered: 4,
        appointments: 2,
      })
    })
  )

  it.effect("gives zero without calls", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())

      expect(yield* dayOf(actorOf(me))).toEqual({
        calls: 0,
        answered: 0,
        appointments: 0,
      })
    })
  )

  it.effect(
    "counts for an ADMIN its own calls, not those of who it can see",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const colleague = yield* given(() => createOperator())
        const theirs = yield* contactOf(colleague.id)
        const mine = yield* contactOf(admin.id)
        yield* call(actorOf(colleague), theirs.id, { outcome: "app.to" })
        yield* call({ operatorId: admin.id, role: "ADMIN" }, mine.id, {
          outcome: "non risponde",
        })

        expect(yield* dayOf({ operatorId: admin.id, role: "ADMIN" })).toEqual({
          calls: 1,
          answered: 0,
          appointments: 0,
        })
      })
  )

  it.effect(
    "the day is the one of Rome: 23:30 of yesterday is out, 00:15 in",
    () =>
      Effect.gen(function* () {
        const me = yield* given(() => createOperator())
        const contact = yield* contactOf(me.id)
        const callAt = (createdAt: Date) =>
          given(() =>
            createTaskEvent({
              customerId: contact.customerId!,
              taskId: contact.id,
              actorOperatorId: me.id,
              action: "call",
              outcome: "app.to",
              createdAt,
            })
          )
        // In UTC both are 1 November: Rome is one hour ahead
        yield* callAt(new Date("2026-11-01T22:30:00.000Z"))
        yield* callAt(new Date("2026-11-01T23:15:00.000Z"))
        yield* TestClock.setTime(NOW.getTime())

        expect(yield* dayOf(actorOf(me))).toEqual({
          calls: 1,
          answered: 1,
          appointments: 1,
        })
      })
  )

  it.effect("gives the numbers of the export for the same user and day", () =>
    Effect.gen(function* () {
      const me = yield* dayOfCalls

      const { rows } = yield* callStats(romeDayBounds(NOW)).pipe(provideServer)
      const exported = rows.find((row) => row.operatorId === me.id)

      expect(exported).toMatchObject(yield* dayOf(actorOf(me)))
    })
  )

  it.effect("its calls are the rows of «Fatti oggi»", () =>
    Effect.gen(function* () {
      const me = yield* dayOfCalls

      const { calls } = yield* dayOf(actorOf(me))

      expect(calls).toBe((yield* callsOf(actorOf(me))).length)
    })
  )
})
