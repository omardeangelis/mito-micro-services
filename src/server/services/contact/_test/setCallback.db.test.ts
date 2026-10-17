import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { asc, eq } from "drizzle-orm"
import { readContactError } from "@/lib/domain/contact/errors"
import { romeDayBounds } from "@/lib/domain/contact/time"
import { type TaskStatus } from "@/lib/types/schemas"
import { customers } from "@/server/db/schema/customers"
import { alert, task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { createTestCaller } from "@/test/caller"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { failNextInsertInto } from "@/test/failpoint"
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

afterEach(() => {
  vi.restoreAllMocks()
})

const inTwoDays = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
const longAgo = new Date("2026-01-01T00:00:00Z")

/** A customer of `customerOperatorId` with an active contact in `state`. */
const seedContact = async ({
  state,
  customerOperatorId,
  contactOperatorId = customerOperatorId,
}: {
  state: TaskStatus
  customerOperatorId: number
  contactOperatorId?: number
}) => {
  const customer = await createCustomer({
    operatorId: customerOperatorId,
    updatedAt: longAgo,
  })
  const contact = await createTask({
    customerId: customer.id,
    operatorId: contactOperatorId,
    state,
    updatedAt: longAgo,
  })
  return { customer, contact }
}

const customerRow = async (id: string) =>
  (await testDb.select().from(customers).where(eq(customers.id, id)))[0]!

/** Everything a callback may write: the database holds one customer. */
const snapshot = async (customerId: string) => ({
  tasks: await tasksOf(customerId),
  alerts: await testDb.select().from(alert).orderBy(asc(alert.id)),
  log: await logOf(customerId),
  customer: await customerRow(customerId),
})

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("expected the call to fail")
    },
    (caught: unknown) => caught
  )

describe("task.setCallback", () => {
  it("'Imposta richiamo' su un contatto app.to crea l'alert, porta lo stato a richiamare e scrive una riga state_change con sorgente detail", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "app.to",
    })
    const deadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    const caller = createTestCaller(operator)

    await caller.task.setCallback({
      taskId: contact.id,
      deadline,
      message: "Richiamare dopo le 18",
      replacesAlertId: null,
    })

    const [after] = await tasksOf(customer.id)
    expect(after).toMatchObject({ id: contact.id, state: "richiamare" })
    expect(await caller.task.getCustomerAlerts({ id: customer.id })).toEqual([
      expect.objectContaining({
        id: after!.alertId,
        deadline,
        message: "Richiamare dopo le 18",
        isResolved: false,
      }),
    ])
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "state_change",
        source: "detail",
        taskId: contact.id,
        fromState: "app.to",
        toState: "richiamare",
        actorOperatorId: operator.id,
      },
    ])
  })
})

describe("task.setCallback: alert sostituito", () => {
  it("da richiamare con l'alert indicato nel form: l'alert sostituito va nello Storico, una riga alert_resolved e nessuna state_change (AC44, AC45)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "richiamare",
      customerOperatorId: operator.id,
    })
    const replaced = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-11-02T08:30:00Z"),
      message: "Primo richiamo",
    })
    const deadline = inTwoDays()
    const caller = createTestCaller(operator)

    const { alertId } = await caller.task.setCallback({
      taskId: contact.id,
      deadline,
      message: "Secondo richiamo",
      replacesAlertId: replaced.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "richiamare", alertId },
    ])
    const alerts = await caller.task.getCustomerAlerts({ id: customer.id })
    expect(alerts).toHaveLength(2)
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: alertId,
          deadline,
          message: "Secondo richiamo",
          isResolved: false,
        }),
        expect.objectContaining({
          id: replaced.id,
          isResolved: true,
          resolvedByName: operator.name,
          resolvedBySurname: operator.surname,
        }),
      ])
    )
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "alert_resolved",
        source: "detail",
        taskId: contact.id,
        alertId: replaced.id,
        actorOperatorId: operator.id,
      },
    ])
  })
})

describe("task.setCallback: stati (AC46)", () => {
  it.each(["chiamare", "followup"] as const)(
    "da %s rifiuta con CALLBACK_NOT_ALLOWED e lo stato, e non modifica nulla",
    async (state) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state,
        customerOperatorId: operator.id,
      })
      const before = await snapshot(customer.id)

      const error = await failure(
        createTestCaller(operator).task.setCallback({
          taskId: contact.id,
          deadline: inTwoDays(),
          message: null,
          replacesAlertId: null,
        })
      )

      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      expect(readContactError(error)).toEqual({
        code: "CALLBACK_NOT_ALLOWED",
        payload: { state },
      })
      expect(await snapshot(customer.id)).toEqual(before)
    }
  )

  it("da nessuno è ammesso: crea l'alert senza messaggio e scrive la state_change", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "nessuno",
      customerOperatorId: operator.id,
    })

    const { alertId } = await createTestCaller(operator).task.setCallback({
      taskId: contact.id,
      deadline: inTwoDays(),
      message: "   ",
      replacesAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "richiamare", alertId },
    ])
    expect(await testDb.select().from(alert)).toMatchObject([
      { id: alertId, taskId: contact.id, message: null, isResolved: false },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "state_change",
        source: "detail",
        fromState: "nessuno",
        toState: "richiamare",
      },
    ])
  })

  it.each(["caricato", "erogata", "non interessato"] as const)(
    "da %s è ammesso: crea l'alert, porta lo stato a richiamare e scrive la state_change",
    async (state) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state,
        customerOperatorId: operator.id,
      })

      const { alertId } = await createTestCaller(operator).task.setCallback({
        taskId: contact.id,
        deadline: inTwoDays(),
        message: null,
        replacesAlertId: null,
      })

      expect(await tasksOf(customer.id)).toMatchObject([
        { id: contact.id, state: "richiamare", alertId },
      ])
      expect(await testDb.select().from(alert)).toMatchObject([
        { id: alertId, taskId: contact.id, isResolved: false },
      ])
      expect(await logOf(customer.id)).toMatchObject([
        {
          action: "state_change",
          source: "detail",
          taskId: contact.id,
          fromState: state,
          toState: "richiamare",
        },
      ])
    }
  )
})

describe("task.setCallback: scadenza (AC44, A4)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("una scadenza di ieri, nel giorno di Roma, rifiuta con DEADLINE_IN_PAST e non modifica nulla", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: operator.id,
    })
    const yesterday = new Date(romeDayBounds(new Date()).start.getTime() - 1)
    const before = await snapshot(customer.id)

    const error = await failure(
      createTestCaller(operator).task.setCallback({
        taskId: contact.id,
        deadline: yesterday,
        message: null,
        replacesAlertId: null,
      })
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    expect(readContactError(error)).toEqual({
      code: "DEADLINE_IN_PAST",
      payload: {},
    })
    expect(await snapshot(customer.id)).toEqual(before)
  })

  it("una scadenza a mezzanotte di oggi, nel giorno di Roma, rifiuta con DEADLINE_IN_PAST e non modifica nulla (D22)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: operator.id,
    })
    const today = romeDayBounds(new Date()).start
    const before = await snapshot(customer.id)

    const error = await failure(
      createTestCaller(operator).task.setCallback({
        taskId: contact.id,
        deadline: today,
        message: null,
        replacesAlertId: null,
      })
    )

    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    expect(readContactError(error)).toEqual({
      code: "DEADLINE_IN_PAST",
      payload: {},
    })
    expect(await snapshot(customer.id)).toEqual(before)
  })

  it("il rifiuto di una scadenza di oggi dice che il richiamo si imposta da domani (D22)", async () => {
    const operator = await createOperator()
    const { contact } = await seedContact({
      state: "app.to",
      customerOperatorId: operator.id,
    })

    const error = await failure(
      createTestCaller(operator).task.setCallback({
        taskId: contact.id,
        deadline: romeDayBounds(new Date()).start,
        message: null,
        replacesAlertId: null,
      })
    )

    expect(error).toMatchObject({
      message: "Il richiamo si imposta da domani",
    })
  })

  it("una scadenza a mezzanotte di domani, nel giorno di Roma, è salvata: stato richiamare e alert con quella scadenza (D22)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: operator.id,
    })
    const tomorrow = romeDayBounds(new Date()).end

    const { alertId } = await createTestCaller(operator).task.setCallback({
      taskId: contact.id,
      deadline: tomorrow,
      message: null,
      replacesAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "richiamare", alertId },
    ])
    expect(await testDb.select().from(alert)).toMatchObject([
      {
        id: alertId,
        taskId: contact.id,
        deadline: tomorrow,
        isResolved: false,
      },
    ])
  })

  // The date picker of the browser sends tomorrow's midnight in Rome as UTC:
  // 22:00 of the day before in summer time, 23:00 in winter time
  it.each([
    ["ora legale", "2026-07-15T10:00:00Z", "2026-07-15T22:00:00Z"],
    ["ora solare", "2026-12-15T10:00:00Z", "2026-12-15T23:00:00Z"],
  ] as const)(
    "la scadenza che il date picker sceglie per domani, in %s, è salvata (D22)",
    async (_clock, now, picked) => {
      // Only Date: the in-memory database needs real timers
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(now))
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: "app.to",
        customerOperatorId: operator.id,
      })
      const deadline = new Date(picked)

      const { alertId } = await createTestCaller(operator).task.setCallback({
        taskId: contact.id,
        deadline,
        message: null,
        replacesAlertId: null,
      })

      expect(await tasksOf(customer.id)).toMatchObject([
        { id: contact.id, state: "richiamare", alertId },
      ])
      expect(await testDb.select().from(alert)).toMatchObject([
        { id: alertId, taskId: contact.id, deadline, isResolved: false },
      ])
    }
  )

  // The day rule holds for any instant of the Rome day, not only for the
  // midnights the date picker sends: today ends at the next midnight in Rome,
  // a day of 23 or 25 hours when the clock changes
  const romeDays = [
    ["ora legale", "2026-07-15T10:00:00Z", "2026-07-15T15:00:00Z"],
    ["ora solare", "2026-12-15T10:00:00Z", "2026-12-15T16:00:00Z"],
    [
      "giorno del cambio d'ora in primavera (23 ore)",
      "2026-03-29T10:00:00Z",
      "2026-03-29T15:00:00Z",
    ],
    [
      "giorno del cambio d'ora in autunno (25 ore)",
      "2026-10-25T10:00:00Z",
      "2026-10-25T16:00:00Z",
    ],
  ] as const

  it.each(
    romeDays.flatMap(([clock, now, laterToday]) => [
      [clock, "più tardi oggi (17:00 a Roma)", now, new Date(laterToday)],
      [
        clock,
        "l'ultimo millisecondo di oggi",
        now,
        new Date(romeDayBounds(new Date(now)).end.getTime() - 1),
      ],
    ])
  )(
    "%s: la scadenza %s rifiuta con DEADLINE_IN_PAST e non modifica nulla (D22)",
    async (_clock, _instant, now, deadline) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(now))
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: "app.to",
        customerOperatorId: operator.id,
      })
      const before = await snapshot(customer.id)

      const error = await failure(
        createTestCaller(operator).task.setCallback({
          taskId: contact.id,
          deadline,
          message: null,
          replacesAlertId: null,
        })
      )

      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      expect(readContactError(error)).toEqual({
        code: "DEADLINE_IN_PAST",
        payload: {},
      })
      expect(await snapshot(customer.id)).toEqual(before)
    }
  )

  // Between the Rome midnight and the UTC midnight the Rome day is already
  // the next one while the UTC day is still the previous one (1 or 2 hours
  // every night, when the cron runs): today's midnight must be refused then
  // too, and tomorrow's accepted
  const justAfterRomeMidnight = [
    ["ora legale", "2026-07-14T22:30:00Z"],
    ["ora solare", "2026-12-14T23:30:00Z"],
    ["giorno del cambio d'ora in primavera", "2026-03-28T23:30:00Z"],
    ["giorno del cambio d'ora in autunno", "2026-10-24T22:30:00Z"],
    ["giorno dopo il cambio d'ora in primavera", "2026-03-29T22:30:00Z"],
    ["giorno dopo il cambio d'ora in autunno", "2026-10-25T23:30:00Z"],
  ] as const

  it.each(
    justAfterRomeMidnight.flatMap(([clock, now]) => {
      const { start, end } = romeDayBounds(new Date(now))
      return [
        [clock, "la mezzanotte di oggi", now, start],
        [
          clock,
          "l'ultimo millisecondo di oggi",
          now,
          new Date(end.getTime() - 1),
        ],
      ] as const
    })
  )(
    "alle 00:30 a Roma, %s: la scadenza %s rifiuta con DEADLINE_IN_PAST e non modifica nulla (D22)",
    async (_clock, _instant, now, deadline) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(now))
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: "app.to",
        customerOperatorId: operator.id,
      })
      const before = await snapshot(customer.id)

      const error = await failure(
        createTestCaller(operator).task.setCallback({
          taskId: contact.id,
          deadline,
          message: null,
          replacesAlertId: null,
        })
      )

      expect(readContactError(error)).toEqual({
        code: "DEADLINE_IN_PAST",
        payload: {},
      })
      expect(await snapshot(customer.id)).toEqual(before)
    }
  )

  it.each(justAfterRomeMidnight)(
    "alle 00:30 a Roma, %s: la mezzanotte di domani è salvata (D22)",
    async (_clock, now) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(now))
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: "app.to",
        customerOperatorId: operator.id,
      })
      const deadline = romeDayBounds(new Date(now)).end

      const { alertId } = await createTestCaller(operator).task.setCallback({
        taskId: contact.id,
        deadline,
        message: null,
        replacesAlertId: null,
      })

      expect(await tasksOf(customer.id)).toMatchObject([
        { id: contact.id, state: "richiamare", alertId },
      ])
      expect(await testDb.select().from(alert)).toMatchObject([
        { id: alertId, taskId: contact.id, deadline, isResolved: false },
      ])
    }
  )

  it.each(romeDays)(
    "%s: la scadenza al primo millisecondo di domani è salvata (D22)",
    async (_clock, now) => {
      vi.useFakeTimers({ toFake: ["Date"] })
      vi.setSystemTime(new Date(now))
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: "app.to",
        customerOperatorId: operator.id,
      })
      const deadline = romeDayBounds(new Date(now)).end

      const { alertId } = await createTestCaller(operator).task.setCallback({
        taskId: contact.id,
        deadline,
        message: null,
        replacesAlertId: null,
      })

      expect(await tasksOf(customer.id)).toMatchObject([
        { id: contact.id, state: "richiamare", alertId },
      ])
      expect(await testDb.select().from(alert)).toMatchObject([
        { id: alertId, taskId: contact.id, deadline, isResolved: false },
      ])
    }
  )
})

describe("task.setCallback: alert aperto da confermare (AC44)", () => {
  it.each([
    "senza alert da sostituire",
    "con un alert chiuso nel frattempo",
  ] as const)(
    "%s mentre un collega ne ha aperto un altro, rifiuta con ALERT_CONFIRMATION_REQUIRED sull'alert attuale e non modifica nulla",
    async (replaces) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: "richiamare",
        customerOperatorId: operator.id,
      })
      // The alert the form showed, closed meanwhile, then a colleague's one
      const seen = await createAlert({
        taskId: contact.id,
        deadline: new Date("2026-10-30T08:30:00Z"),
        isResolved: true,
      })
      const current = await createAlert({
        taskId: contact.id,
        deadline: new Date("2026-11-02T08:30:00Z"),
        message: "Impostato da un collega",
      })
      const before = await snapshot(customer.id)

      const error = await failure(
        createTestCaller(operator).task.setCallback({
          taskId: contact.id,
          deadline: inTwoDays(),
          message: "Il mio richiamo",
          replacesAlertId:
            replaces === "senza alert da sostituire" ? null : seen.id,
        })
      )

      expect(error).toMatchObject({ code: "PRECONDITION_FAILED" })
      expect(readContactError(error)).toEqual({
        code: "ALERT_CONFIRMATION_REQUIRED",
        payload: {
          alert: {
            id: current.id,
            deadline: current.deadline,
            message: "Impostato da un collega",
          },
        },
      })
      expect(await snapshot(customer.id)).toEqual(before)
    }
  )

  it("con l'alert da sostituire chiuso nel frattempo e nessun altro aperto, salva il richiamo e lascia com'è l'alert chiuso", async () => {
    const operator = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact({
      state: "richiamare",
      customerOperatorId: operator.id,
    })
    // Closed by a colleague's "X": the task still points at it
    const closed = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-10-30T08:30:00Z"),
      isResolved: true,
      resolvedBy: colleague.id,
      updatedAt: longAgo,
    })
    const [closedBefore] = await testDb
      .select()
      .from(alert)
      .where(eq(alert.id, closed.id))

    const { alertId } = await createTestCaller(operator).task.setCallback({
      taskId: contact.id,
      deadline: inTwoDays(),
      message: null,
      replacesAlertId: closed.id,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "richiamare", alertId },
    ])
    expect(
      await testDb.select().from(alert).where(eq(alert.id, closed.id))
    ).toEqual([closedBefore])
    expect(closedBefore).toMatchObject({
      resolvedBy: colleague.id,
      updatedAt: longAgo,
    })
    expect(await logOf(customer.id)).toEqual([])
  })
})

describe("task.setCallback: tutto o niente (AC45)", () => {
  it.each([
    ["richiamare", "alert_resolved"],
    ["app.to", "state_change"],
  ] as const)(
    "da %s con un alert da sostituire, se fallisce la riga %s non cambia nulla",
    async (state, action) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state,
        customerOperatorId: operator.id,
      })
      const open = await createAlert({
        taskId: contact.id,
        deadline: new Date("2026-11-02T08:30:00Z"),
      })
      const before = await snapshot(customer.id)
      await failNextInsertInto(taskEventLog, { action })
      vi.spyOn(console, "error").mockImplementation(() => undefined)

      await expect(
        createTestCaller(operator).task.setCallback({
          taskId: contact.id,
          deadline: inTwoDays(),
          message: "Nuovo richiamo",
          replacesAlertId: open.id,
        })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

      expect(await snapshot(customer.id)).toEqual(before)
      expect(before.alerts).toMatchObject([{ id: open.id, isResolved: false }])
      expect(before.tasks).toMatchObject([
        { id: contact.id, state, alertId: open.id },
      ])
    }
  )

  it("porta avanti l'ultima modifica del cliente", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: operator.id,
    })
    const before = new Date()

    await createTestCaller(operator).task.setCallback({
      taskId: contact.id,
      deadline: inTwoDays(),
      message: null,
      replacesAlertId: null,
    })

    const after = await customerRow(customer.id)
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})

describe("task.setCallback: permessi", () => {
  it("rifiuta un contatto non più attivo con CONTACT_SUPERSEDED e non modifica nulla (AC27)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: operator.id,
    })
    await testDb
      .update(task)
      .set({ isActive: false, updatedAt: longAgo })
      .where(eq(task.id, contact.id))
    const active = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      updatedAt: longAgo,
    })
    const before = await snapshot(customer.id)

    const error = await failure(
      createTestCaller(operator).task.setCallback({
        taskId: contact.id,
        deadline: inTwoDays(),
        message: null,
        replacesAlertId: null,
      })
    )

    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_SUPERSEDED",
      payload: { activeTaskId: active.id },
    })
    expect(await snapshot(customer.id)).toEqual(before)
  })

  it("rifiuta un operatore a cui non appartengono né il contatto né il cliente e non modifica nulla (AC49)", async () => {
    const owner = await createOperator()
    const assignee = await createOperator({ name: "Luigi", surname: "Verdi" })
    const stranger = await createOperator()
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: owner.id,
      contactOperatorId: assignee.id,
    })
    const before = await snapshot(customer.id)

    const error = await failure(
      createTestCaller(stranger).task.setCallback({
        taskId: contact.id,
        deadline: inTwoDays(),
        message: null,
        replacesAlertId: null,
      })
    )

    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Luigi Verdi" },
    })
    expect(await snapshot(customer.id)).toEqual(before)
  })

  it("l'operatore del cliente imposta il richiamo sul contatto di un collega (D2)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: me.id,
      contactOperatorId: colleague.id,
    })

    await createTestCaller(me).task.setCallback({
      taskId: contact.id,
      deadline: inTwoDays(),
      message: null,
      replacesAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "richiamare", operatorId: colleague.id },
    ])
  })
})
