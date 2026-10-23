import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Effect } from "effect"
import { DbLive } from "../../../effect/db"
import { callStats } from "../callStats"
import { migrateUpTo, resetDb } from "@/test/db"
import { createOperator, createTaskEvent } from "@/test/factories"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

/** 1 October 2026 in Rome (summer time, UTC+2). */
const PERIOD = {
  start: new Date("2026-09-30T22:00:00.000Z"),
  end: new Date("2026-10-02T22:00:00.000Z"),
}
const INSIDE = new Date("2026-10-01T10:00:00.000Z")

const run = (period = PERIOD) =>
  Effect.runPromise(callStats(period).pipe(Effect.provide(DbLive)))

describe("callStats", () => {
  it("counts calls, answered, appointments and no answers per operator (AC9)", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    await createTaskEvent({
      actorOperatorId: anna.id,
      fromState: "chiamare",
      toState: "app.to",
      createdAt: INSIDE,
    })
    await createTaskEvent({
      actorOperatorId: anna.id,
      fromState: "chiamare",
      toState: "non risponde",
      createdAt: INSIDE,
    })

    expect(await run()).toEqual({
      rows: [
        {
          operatorId: anna.id,
          name: "Anna",
          surname: "Rossi",
          calls: 2,
          answered: 1,
          appointments: 1,
          noAnswer: 1,
        },
      ],
      totals: { calls: 2, answered: 1, appointments: 1, noAnswer: 1 },
    })
  })

  it("counts a callback from richiamare and a second call to the same contact (AC10)", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    const first = await createTaskEvent({
      actorOperatorId: anna.id,
      fromState: "chiamare",
      toState: "non risponde",
      createdAt: INSIDE,
    })
    await createTaskEvent({
      actorOperatorId: anna.id,
      customerId: first.customerId,
      fromState: "non risponde",
      toState: "richiamare",
      createdAt: INSIDE,
    })
    await createTaskEvent({
      actorOperatorId: anna.id,
      customerId: first.customerId,
      fromState: "richiamare",
      toState: "app.to",
      createdAt: INSIDE,
    })

    expect((await run()).totals).toEqual({
      calls: 3,
      answered: 2,
      appointments: 1,
      noAnswer: 1,
    })
  })

  it("leaves out steps between outcomes, reopenings, bulk and system changes, and other actions (AC10)", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    const notCalls = [
      { fromState: "app.to", toState: "caricato" },
      { fromState: "caricato", toState: "erogata" },
      { fromState: "app.to", toState: "chiamare" },
      { fromState: "nessuno", toState: "app.to" },
      { fromState: null, toState: "app.to" },
      { fromState: "chiamare", toState: "app.to", source: "bulk" },
      { fromState: "richiamare", toState: "followup", source: "cron_alert" },
      { fromState: "chiamare", toState: "app.to", source: "self_assign" },
      {
        fromState: null,
        toState: null,
        action: "operator_reassign",
        source: "detail",
      },
    ] as const
    for (const values of notCalls) {
      await createTaskEvent({
        actorOperatorId: anna.id,
        createdAt: INSIDE,
        ...values,
      })
    }

    expect(await run()).toEqual({
      rows: [],
      totals: { calls: 0, answered: 0, appointments: 0, noAnswer: 0 },
    })
  })

  it("takes the first and the last day whole, in Rome, and nothing outside (AC11)", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    const at = [
      "2026-09-30T21:59:59.999Z", // 23:59 of the day before, in Rome
      "2026-09-30T22:00:00.000Z", // 00:00 of the first day
      "2026-10-02T21:59:59.999Z", // 23:59 of the last day
      "2026-10-02T22:00:00.000Z", // 00:00 of the day after
    ]
    for (const createdAt of at) {
      await createTaskEvent({
        actorOperatorId: anna.id,
        createdAt: new Date(createdAt),
      })
    }

    expect((await run()).totals.calls).toBe(2)
  })

  it("orders the operators by calls, then surname and name, and sums them (AC12)", async () => {
    const verdi = await createOperator({ name: "Anna", surname: "Verdi" })
    const bianchi = await createOperator({ name: "Bruno", surname: "Bianchi" })
    await createOperator({ name: "Carla", surname: "Neri" }) // no calls
    for (const operator of [verdi, bianchi, bianchi]) {
      await createTaskEvent({
        actorOperatorId: operator.id,
        createdAt: INSIDE,
      })
    }

    const { rows, totals } = await run()
    expect(rows.map((row) => row.surname)).toEqual(["Bianchi", "Verdi"])
    expect(totals.calls).toBe(3)
  })

  it("answers only totals: no customer, phone or note (AC22)", async () => {
    const anna = await createOperator({ name: "Anna", surname: "Rossi" })
    await createTaskEvent({ actorOperatorId: anna.id, createdAt: INSIDE })

    const { rows } = await run()
    expect(Object.keys(rows[0]!).sort()).toEqual([
      "answered",
      "appointments",
      "calls",
      "name",
      "noAnswer",
      "operatorId",
      "surname",
    ])
  })
})
