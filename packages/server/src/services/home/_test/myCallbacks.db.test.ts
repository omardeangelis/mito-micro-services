import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import { db } from "@mito/db"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { alert } from "@mito/db/schema/task"
import { type Actor } from "@mito/domain/contact/permissions"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createTaskEvent,
  createUser,
} from "@/test/factories"
import { listMyCallbacks } from "../myCallbacks"

// 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")
const TODAY = new Date("2026-11-02T15:00:00.000Z")
const YESTERDAY = new Date("2026-11-01T09:00:00.000Z")
const TOMORROW = new Date("2026-11-03T09:00:00.000Z")

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A contact of `operatorId` on a customer of `customerOperatorId`, with an alert. */
const callback = ({
  operatorId,
  customerOperatorId = operatorId,
  deadline,
  ...values
}: {
  operatorId: number
  customerOperatorId?: number
  deadline: Date
} & Omit<Parameters<typeof createTask>[0] & object, "operatorId">) =>
  given(async () => {
    const customer = await createCustomer({ operatorId: customerOperatorId })
    const contact = await createTask({
      customerId: customer.id,
      operatorId,
      ...values,
    })
    const open = await createAlert({ taskId: contact.id, deadline })
    return { customer, contact, alert: open }
  })

/** An unanswered call to `customerId`, or another outcome. */
const called = (
  customerId: string,
  actorOperatorId: number,
  createdAt: Date,
  outcome: "non risponde" | "richiamare" = "non risponde"
) =>
  given(() =>
    createTaskEvent({
      customerId,
      actorOperatorId,
      action: "call",
      outcome,
      createdAt,
    })
  )

/** An open Wave with `deadline` (a Rome day) holding `customerId`. */
const wave = (deadline: string, customerId: string) =>
  given(async () => {
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
    await db.insert(importRunCustomer).values({ runId: run!.id, customerId })
  })

/** The callbacks of `operatorId` at `at`. */
const callbacksOf = (
  operatorId: number,
  { at = NOW, role = "OPERATORE" }: { at?: Date; role?: Actor["role"] } = {}
) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(at.getTime())
    return yield* listMyCallbacks({ actor: { operatorId, role } }).pipe(
      provideServer
    )
  })

const taskIds = (rows: readonly { taskId: number }[]) =>
  rows.map(({ taskId }) => taskId)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("listMyCallbacks: whose (AC2)", () => {
  it.effect(
    "has the contacts assigned to me and those of a colleague on a customer of mine",
    () =>
      Effect.gen(function* () {
        const me = yield* given(() => createOperator())
        const colleague = yield* given(() => createOperator())
        const assigned = yield* callback({
          operatorId: me.id,
          customerOperatorId: colleague.id,
          deadline: YESTERDAY,
        })
        const onMyCustomer = yield* callback({
          operatorId: colleague.id,
          customerOperatorId: me.id,
          deadline: TODAY,
        })

        expect(taskIds(yield* callbacksOf(me.id))).toEqual([
          assigned.contact.id,
          onMyCustomer.contact.id,
        ])
      })
  )

  it.effect("has no contact of someone else, even for an ADMIN", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const colleague = yield* given(() => createOperator())
      yield* callback({ operatorId: colleague.id, deadline: YESTERDAY })

      expect(yield* callbacksOf(admin.id, { role: "ADMIN" })).toEqual([])
    })
  )
})

describe("listMyCallbacks: which alerts (AC11)", () => {
  it.effect("keeps a deadline up to the last minute of the Rome day", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      // 23:59 and 00:00 in Rome
      const lastMinute = yield* callback({
        operatorId: me.id,
        deadline: new Date("2026-11-02T22:59:00.000Z"),
      })
      yield* callback({
        operatorId: me.id,
        deadline: new Date("2026-11-02T23:00:00.000Z"),
      })

      expect(taskIds(yield* callbacksOf(me.id))).toEqual([
        lastMinute.contact.id,
      ])
    })
  )

  it.effect("has no alert due tomorrow", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      yield* callback({ operatorId: me.id, deadline: TOMORROW })

      expect(yield* callbacksOf(me.id)).toEqual([])
    })
  )

  it.effect("has no resolved alert", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      const resolved = yield* callback({
        operatorId: me.id,
        deadline: YESTERDAY,
      })
      yield* given(() =>
        db
          .update(alert)
          .set({ isResolved: true })
          .where(eq(alert.id, resolved.alert.id))
      )

      expect(yield* callbacksOf(me.id)).toEqual([])
    })
  )

  it.effect("has no contact that is no longer active", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      yield* callback({
        operatorId: me.id,
        deadline: YESTERDAY,
        isActive: false,
      })

      expect(yield* callbacksOf(me.id)).toEqual([])
    })
  )
})

describe("listMyCallbacks: order (AC12, OQ4)", () => {
  it.effect("starts from the oldest deadline", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      const today = yield* callback({ operatorId: me.id, deadline: TODAY })
      const yesterday = yield* callback({
        operatorId: me.id,
        deadline: YESTERDAY,
      })
      const oldest = yield* callback({
        operatorId: me.id,
        deadline: new Date("2026-10-20T09:00:00.000Z"),
      })

      expect(taskIds(yield* callbacksOf(me.id))).toEqual([
        oldest.contact.id,
        yesterday.contact.id,
        today.contact.id,
      ])
    })
  )

  it.effect(
    "inside a Rome day goes by priority, then as the list, whatever the hour",
    () =>
      Effect.gen(function* () {
        const me = yield* given(() => createOperator())
        const at = (hour: number) => new Date(Date.UTC(2026, 10, 2, hour, 0, 0))
        // Each one due earlier than the one that comes before it
        const manualLow = yield* callback({
          operatorId: me.id,
          deadline: at(8),
          priority: 20,
          customPriority: true,
        })
        const oldPlain = yield* callback({
          operatorId: me.id,
          deadline: at(9),
        })
        const newPlain = yield* callback({
          operatorId: me.id,
          deadline: at(10),
        })
        const inWave = yield* callback({
          operatorId: me.id,
          deadline: at(11),
        })
        const manualHigh = yield* callback({
          operatorId: me.id,
          deadline: at(12),
          priority: 140,
          customPriority: true,
        })
        yield* wave("2026-11-20", inWave.customer.id)

        expect(taskIds(yield* callbacksOf(me.id))).toEqual([
          manualHigh.contact.id,
          inWave.contact.id,
          newPlain.contact.id,
          oldPlain.contact.id,
          manualLow.contact.id,
        ])
      })
  )

  it.effect("the day is the one of Rome, not the UTC one", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      // 00:30 of 1 November in Rome, the UTC day before the other
      const lateAtNight = yield* callback({
        operatorId: me.id,
        deadline: new Date("2026-10-31T23:30:00.000Z"),
        priority: 20,
        customPriority: true,
      })
      const sameRomeDay = yield* callback({
        operatorId: me.id,
        deadline: YESTERDAY,
      })

      expect(taskIds(yield* callbacksOf(me.id))).toEqual([
        sameRomeDay.contact.id,
        lateAtNight.contact.id,
      ])
    })
  )
})

describe("listMyCallbacks: the row (D4)", () => {
  it.effect("carries the contact, its customer and its alert", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      const customer = yield* given(() =>
        createCustomer({
          operatorId: me.id,
          name: "Anna",
          surname: "Rossi",
          phoneNumber: "3331234567",
        })
      )
      const contact = yield* given(() =>
        createTask({
          customerId: customer.id,
          operatorId: me.id,
          state: "richiamare",
        })
      )
      const open = yield* given(() =>
        createAlert({
          taskId: contact.id,
          deadline: YESTERDAY,
          message: "Richiamare dopo le 18",
        })
      )

      expect(yield* callbacksOf(me.id)).toEqual([
        {
          alertId: open.id,
          taskId: contact.id,
          customerId: customer.id,
          name: "Anna",
          surname: "Rossi",
          phoneNumber: "3331234567",
          message: "Richiamare dopo le 18",
          deadline: YESTERDAY,
          dueDay: "2026-11-01",
          daysLate: 1,
          state: "richiamare",
          triedAt: null,
        },
      ])
    })
  )

  it.effect(
    "a deadline at midnight in Rome is of that day, on any day of the row",
    () =>
      Effect.gen(function* () {
        const me = yield* given(() => createOperator())
        // 00:00 of 2 November and of 1 November in Rome: the day before in UTC
        const today = yield* callback({
          operatorId: me.id,
          deadline: new Date("2026-11-01T23:00:00.000Z"),
        })
        const late = yield* callback({
          operatorId: me.id,
          deadline: new Date("2026-10-31T23:00:00.000Z"),
        })

        const rows = yield* callbacksOf(me.id)

        expect(
          rows.map(({ taskId, dueDay, daysLate }) => ({
            taskId,
            dueDay,
            daysLate,
          }))
        ).toEqual([
          { taskId: late.contact.id, dueDay: "2026-11-01", daysLate: 1 },
          { taskId: today.contact.id, dueDay: "2026-11-02", daysLate: 0 },
        ])
      })
  )

  it.effect("turns one day late at midnight in Rome, not in UTC", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      // 23:30 of 1 November in Rome
      yield* callback({
        operatorId: me.id,
        deadline: new Date("2026-11-01T22:30:00.000Z"),
      })

      // 23:45 of the 1st in Rome
      const before = yield* callbacksOf(me.id, {
        at: new Date("2026-11-01T22:45:00.000Z"),
      })
      // 00:15 of the 2nd in Rome, still the 1st in UTC
      const after = yield* callbacksOf(me.id, {
        at: new Date("2026-11-01T23:15:00.000Z"),
      })

      expect(before[0]).toMatchObject({ dueDay: "2026-11-01", daysLate: 0 })
      expect(after[0]).toMatchObject({ dueDay: "2026-11-01", daysLate: 1 })
    })
  )

  it.effect("counts the calendar days across a clock change", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      // The clocks went back on 25 October 2026, a day of 25 hours
      yield* callback({
        operatorId: me.id,
        deadline: new Date("2026-10-24T20:00:00.000Z"),
      })

      const rows = yield* callbacksOf(me.id, {
        at: new Date("2026-10-26T06:00:00.000Z"),
      })

      expect(rows[0]).toMatchObject({ dueDay: "2026-10-24", daysLate: 2 })
    })
  )
})

describe("listMyCallbacks: triedAt (AC15, D5)", () => {
  // 10:00 in Rome, the day before NOW's yesterday
  const deadline = new Date("2026-10-31T09:00:00.000Z")

  it.effect("is the last Non risponde since the due day, by anyone", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      const colleague = yield* given(() => createOperator())
      const { customer } = yield* callback({ operatorId: me.id, deadline })
      const first = new Date("2026-10-31T17:00:00.000Z")
      const last = new Date("2026-11-01T17:00:00.000Z")
      yield* called(customer.id, me.id, first)
      yield* called(customer.id, colleague.id, last)

      const [row] = yield* callbacksOf(me.id)

      expect(row?.triedAt).toEqual(last)
    })
  )

  it.effect(
    "counts a call of the due day before the hour of the deadline",
    () =>
      Effect.gen(function* () {
        const me = yield* given(() => createOperator())
        const { customer } = yield* callback({ operatorId: me.id, deadline })
        // 00:30 of the due day in Rome, still the day before in UTC
        const earlyThatDay = new Date("2026-10-30T23:30:00.000Z")
        yield* called(customer.id, me.id, earlyThatDay)

        const [row] = yield* callbacksOf(me.id)

        expect(row?.triedAt).toEqual(earlyThatDay)
      })
  )

  it.effect("a call before the due day doesn't count", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      const { customer } = yield* callback({ operatorId: me.id, deadline })
      // 23:30 of the day before in Rome
      yield* called(customer.id, me.id, new Date("2026-10-30T22:30:00.000Z"))

      const [row] = yield* callbacksOf(me.id)

      expect(row?.triedAt).toBeNull()
    })
  )

  it.effect("only a call without answer counts", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      const { customer } = yield* callback({ operatorId: me.id, deadline })
      const answered = new Date("2026-11-01T17:00:00.000Z")
      yield* called(customer.id, me.id, answered, "richiamare")
      yield* given(() =>
        createTaskEvent({
          customerId: customer.id,
          actorOperatorId: me.id,
          toState: "non risponde",
          createdAt: answered,
        })
      )

      const [row] = yield* callbacksOf(me.id)

      expect(row?.triedAt).toBeNull()
    })
  )

  it.effect("each row reads the calls of its own customer", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      const tried = yield* callback({ operatorId: me.id, deadline })
      const untried = yield* callback({ operatorId: me.id, deadline: TODAY })
      const at = new Date("2026-11-01T17:00:00.000Z")
      yield* called(tried.customer.id, me.id, at)

      const rows = yield* callbacksOf(me.id)

      expect(rows.map(({ taskId, triedAt }) => ({ taskId, triedAt }))).toEqual([
        { taskId: tried.contact.id, triedAt: at },
        { taskId: untried.contact.id, triedAt: null },
      ])
    })
  )
})

describe("listMyCallbacks: how many (AC14)", () => {
  it.effect("gives back all the rows, with no limit and no pages", () =>
    Effect.gen(function* () {
      const me = yield* given(() => createOperator())
      for (let each = 0; each < 300; each++) {
        yield* callback({ operatorId: me.id, deadline: TODAY })
      }

      expect(yield* callbacksOf(me.id)).toHaveLength(300)
    })
  )
})
