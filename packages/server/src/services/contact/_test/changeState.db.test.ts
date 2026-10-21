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
import { readContactError } from "@mito/domain/contact/errors"
import { type TaskStatus } from "@mito/domain/schemas"
import { customers } from "@mito/db/schema/customers"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { createTestCaller } from "@/test/caller"
import {
  activeTasksOf,
  logOf,
  migrateUpTo,
  resetDb,
  tasksOf,
  testDb,
} from "@/test/db"
import { failNextInsertInto, failNextUpdateOf } from "@/test/failpoint"
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

describe("task.changeState", () => {
  it("passare da chiamare ad app.to valorizza 'Contattato il', scrive una riga state_change e non cambia l'operatore", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "chiamare",
    })
    const before = new Date()

    await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "app.to",
      source: "list",
      confirmedAlertId: null,
    })

    const [after] = await tasksOf(customer.id)
    expect(after).toMatchObject({
      id: contact.id,
      state: "app.to",
      operatorId: operator.id,
      isActive: true,
    })
    expect(after!.closedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "state_change",
        source: "list",
        taskId: contact.id,
        fromState: "chiamare",
        toState: "app.to",
        actorOperatorId: operator.id,
      },
    ])
  })
})

const deadline = new Date("2026-10-20T22:00:00Z")
const longAgo = new Date("2026-01-01T00:00:00Z")

/** A customer of `customerOperatorId` with an active contact in `state`. */
const seedContact = async ({
  state,
  customerOperatorId,
  contactOperatorId = customerOperatorId,
  closedAt = null,
}: {
  state: TaskStatus
  customerOperatorId: number
  contactOperatorId?: number
  closedAt?: Date | null
}) => {
  const customer = await createCustomer({
    operatorId: customerOperatorId,
    updatedAt: longAgo,
  })
  const contact = await createTask({
    customerId: customer.id,
    operatorId: contactOperatorId,
    state,
    closedAt,
    priority: 77,
    customPriority: true,
    updatedAt: longAgo,
  })
  return { customer, contact }
}

const customerRow = async (id: string) =>
  (await testDb.select().from(customers).where(eq(customers.id, id)))[0]!

/** Everything a state change may write: the database holds one customer. */
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

describe("task.changeState: transizioni", () => {
  it.each([
    ["chiamare", "followup"],
    ["app.to", "followup"],
    ["followup", "chiamare"],
  ] as const)(
    "rifiuta il passaggio da %s a %s con CONTACT_TRANSITION_REJECTED e non modifica nulla (AC30)",
    async (from, to) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: from,
        customerOperatorId: operator.id,
      })
      const before = await snapshot(customer.id)

      const error = await failure(
        createTestCaller(operator).task.changeState({
          taskId: contact.id,
          toState: to,
          source: "list",
          confirmedAlertId: null,
        })
      )

      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      expect(readContactError(error)).toEqual({
        code: "CONTACT_TRANSITION_REJECTED",
        payload: { from, to },
      })
      expect(await snapshot(customer.id)).toEqual(before)
    }
  )

  it("passare da followup a un esito valorizza 'Contattato il' con la data del cambio (AC31)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "followup",
      customerOperatorId: operator.id,
    })
    const before = new Date()

    await expect(
      createTestCaller(operator).task.changeState({
        taskId: contact.id,
        toState: "caricato",
        source: "detail",
        confirmedAlertId: null,
      })
    ).resolves.toEqual({ taskId: contact.id, reopened: false })

    const [after] = await tasksOf(customer.id)
    expect(after).toMatchObject({ id: contact.id, state: "caricato" })
    expect(after!.closedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(after!.closedAt!.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it("un contatto senza stato passa ad app.to e scrive una state_change con fromState null", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: null,
    })

    await expect(
      createTestCaller(operator).task.changeState({
        taskId: contact.id,
        toState: "app.to",
        source: "detail",
        confirmedAlertId: null,
      })
    ).resolves.toEqual({ taskId: contact.id, reopened: false })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "app.to", isActive: true },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "state_change",
        source: "detail",
        taskId: contact.id,
        fromState: null,
        toState: "app.to",
        actorOperatorId: operator.id,
      },
    ])
  })

  it("passare da un esito a un altro cambia lo stato e lascia 'Contattato il' com'è (AC32)", async () => {
    const operator = await createOperator()
    const contactedAt = new Date("2026-09-01T10:00:00Z")
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: operator.id,
      closedAt: contactedAt,
    })

    await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "erogata",
      source: "list",
      confirmedAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      {
        id: contact.id,
        state: "erogata",
        closedAt: contactedAt,
        isActive: true,
      },
    ])
  })

  it.each([
    ["nessuno", "app.to"],
    ["app.to", "nessuno"],
    ["nessuno", "chiamare"],
    ["chiamare", "nessuno"],
  ] as const)(
    "passare da %s a %s cambia solo lo stato: 'Contattato il' resta e non nasce un contatto (AC33)",
    async (from, to) => {
      const operator = await createOperator()
      const contactedAt = new Date("2026-09-01T10:00:00Z")
      const { customer, contact } = await seedContact({
        state: from,
        customerOperatorId: operator.id,
        closedAt: contactedAt,
      })

      await expect(
        createTestCaller(operator).task.changeState({
          taskId: contact.id,
          toState: to,
          source: "list",
          confirmedAlertId: null,
        })
      ).resolves.toEqual({ taskId: contact.id, reopened: false })

      expect(await tasksOf(customer.id)).toMatchObject([
        {
          id: contact.id,
          state: to,
          closedAt: contactedAt,
          isActive: true,
          operatorId: operator.id,
        },
      ])
      expect(await logOf(customer.id)).toMatchObject([
        { action: "state_change", fromState: from, toState: to },
      ])
    }
  )

  it("riaprire da un esito a chiamare crea un contatto attivo con lo stesso operatore del contatto e lo stesso 'Contattato il', a priorità 120, il più recente del cliente (AC34, D3)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const contactedAt = new Date("2026-09-01T10:00:00Z")
    const { customer, contact } = await seedContact({
      state: "app.to",
      customerOperatorId: me.id,
      contactOperatorId: colleague.id,
      closedAt: contactedAt,
    })
    // An older contact whose updated_at runs ahead of the clock
    const older = await createTask({
      customerId: customer.id,
      operatorId: me.id,
      state: "non interessato",
      isActive: false,
      updatedAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    const result = await createTestCaller(me).task.changeState({
      taskId: contact.id,
      toState: "chiamare",
      source: "detail",
      confirmedAlertId: null,
    })

    const tasks = await tasksOf(customer.id)
    const previous = tasks.find((each) => each.id === contact.id)
    const [reopened] = await activeTasksOf(customer.id)
    expect(previous).toMatchObject({
      isActive: false,
      state: "app.to",
      operatorId: colleague.id,
      closedAt: contactedAt,
    })
    expect(reopened).toMatchObject({
      state: "chiamare",
      operatorId: colleague.id,
      closedAt: contactedAt,
      priority: 120,
      customPriority: false,
      alertId: null,
    })
    expect(reopened!.id).not.toBe(contact.id)
    expect(result).toEqual({ taskId: reopened!.id, reopened: true })
    const mostRecent = [...tasks].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0]
    expect(mostRecent!.id).toBe(reopened!.id)
    expect(tasks.map((each) => each.id)).toEqual([
      contact.id,
      older.id,
      reopened!.id,
    ])
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "state_change",
        taskId: reopened!.id,
        fromState: "app.to",
        toState: "chiamare",
        source: "detail",
        actorOperatorId: me.id,
      },
    ])
    expect((await customerRow(customer.id)).operatorId).toBe(me.id)
  })

  it("dopo una riapertura Assegna Clienti riassegna il contatto riaperto, non il precedente", async () => {
    const operator = await createOperator()
    const laterOperator = await createOperator({ name: "Successivo" })
    const admin = await createOperator({ role: "ADMIN" })
    const { customer, contact } = await seedContact({
      state: "non interessato",
      customerOperatorId: operator.id,
    })

    const { taskId } = await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "chiamare",
      source: "detail",
      confirmedAlertId: null,
    })
    await createTestCaller(admin).customer.bulkUpdateCustomers({
      operatorId: laterOperator.id,
      customerIds: [customer.id],
    })

    expect(await tasksOf(customer.id)).toEqual([
      expect.objectContaining({ id: contact.id, operatorId: operator.id }),
      expect.objectContaining({ id: taskId, operatorId: laterOperator.id }),
    ])
  })

  it.each(["list", "detail"] as const)(
    "la riga state_change porta la sorgente %s (AC38)",
    async (source) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: "chiamare",
        customerOperatorId: operator.id,
      })

      await createTestCaller(operator).task.changeState({
        taskId: contact.id,
        toState: "non interessato",
        source,
        confirmedAlertId: null,
      })

      expect(await logOf(customer.id)).toMatchObject([
        {
          action: "state_change",
          source,
          taskId: contact.id,
          fromState: "chiamare",
          toState: "non interessato",
          actorOperatorId: operator.id,
        },
      ])
    }
  )

  it.each(["chiamare", "richiamare"] as const)(
    "riselezionare lo stato attuale (%s) non scrive nulla (AC40)",
    async (state) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state,
        customerOperatorId: operator.id,
        closedAt: state === "richiamare" ? longAgo : null,
      })
      const before = await snapshot(customer.id)

      await expect(
        createTestCaller(operator).task.changeState({
          taskId: contact.id,
          toState: state,
          source: "list",
          confirmedAlertId: null,
        })
      ).resolves.toEqual({ taskId: contact.id, reopened: false })

      expect(await snapshot(customer.id)).toEqual(before)
    }
  )

  it("riselezionare lo stato attuale con un alert aperto non chiede conferma e non scrive nulla (AC40)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "richiamare",
      customerOperatorId: operator.id,
    })
    await createAlert({ taskId: contact.id, deadline })
    const before = await snapshot(customer.id)

    await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "richiamare",
      source: "detail",
      confirmedAlertId: null,
    })

    expect(await snapshot(customer.id)).toEqual(before)
  })

  it("il cambio non tocca l'operatore del contatto né quello del cliente, né la priorità (AC41, D2, D3)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact({
      state: "chiamare",
      customerOperatorId: me.id,
      contactOperatorId: colleague.id,
    })

    await createTestCaller(me).task.changeState({
      taskId: contact.id,
      toState: "app.to",
      source: "list",
      confirmedAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      {
        id: contact.id,
        state: "app.to",
        operatorId: colleague.id,
        priority: 77,
        customPriority: true,
      },
    ])
    expect((await customerRow(customer.id)).operatorId).toBe(me.id)
    expect(await logOf(customer.id)).toMatchObject([
      { action: "state_change", actorOperatorId: me.id },
    ])
  })

  it("aggiorna l'ultima modifica del cliente (AC39)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "chiamare",
      customerOperatorId: operator.id,
    })
    const before = new Date()

    await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "richiamare",
      source: "list",
      confirmedAlertId: null,
    })

    expect(
      (await customerRow(customer.id)).updatedAt.getTime()
    ).toBeGreaterThanOrEqual(before.getTime())
  })
})

describe("task.changeState: alert aperto", () => {
  it("confermando l'alert aperto, l'alert passa nello Storico chiuso dall'attore e lo stato cambia (AC36, AC38)", async () => {
    const operator = await createOperator({ name: "Mario", surname: "Rossi" })
    const { customer, contact } = await seedContact({
      state: "richiamare",
      customerOperatorId: operator.id,
    })
    const open = await createAlert({
      taskId: contact.id,
      deadline,
      message: "Richiamare dopo le 18",
    })
    const caller = createTestCaller(operator)

    await caller.task.changeState({
      taskId: contact.id,
      toState: "app.to",
      source: "list",
      confirmedAlertId: open.id,
    })

    expect(
      await caller.task.getCustomerAlerts({ id: customer.id })
    ).toMatchObject([
      {
        id: open.id,
        isResolved: true,
        resolvedByName: "Mario",
        resolvedBySurname: "Rossi",
      },
    ])
    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "app.to", alertId: null },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "alert_resolved",
        alertId: open.id,
        taskId: contact.id,
        source: "list",
        actorOperatorId: operator.id,
      },
      {
        action: "state_change",
        taskId: contact.id,
        fromState: "richiamare",
        toState: "app.to",
        source: "list",
        actorOperatorId: operator.id,
      },
    ])
  })

  it("confermando l'alert su una riapertura, l'alert si chiude sul contatto precedente e il nuovo nasce senza alert (AC34, AC36)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "richiamare",
      customerOperatorId: operator.id,
      closedAt: longAgo,
    })
    const open = await createAlert({ taskId: contact.id, deadline })

    const result = await createTestCaller(operator).task.changeState({
      taskId: contact.id,
      toState: "chiamare",
      source: "detail",
      confirmedAlertId: open.id,
    })

    expect(result.reopened).toBe(true)
    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, isActive: false, alertId: null },
      { id: result.taskId, isActive: true, state: "chiamare", alertId: null },
    ])
    expect(await testDb.select().from(alert)).toMatchObject([
      { id: open.id, taskId: contact.id, isResolved: true },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      { action: "alert_resolved", alertId: open.id, taskId: contact.id },
      { action: "state_change", taskId: result.taskId },
    ])
  })

  it.each(["senza conferma", "con la conferma di un altro alert"] as const)(
    "%s, rifiuta con ALERT_CONFIRMATION_REQUIRED sull'alert aperto ora e non modifica nulla (AC36, AC37)",
    async (confirmation) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: "richiamare",
        customerOperatorId: operator.id,
      })
      // The alert the user saw, closed meanwhile, then a colleague's new one
      const seen = await createAlert({
        taskId: contact.id,
        deadline,
        isResolved: true,
      })
      const current = await createAlert({
        taskId: contact.id,
        deadline: new Date("2026-11-02T08:30:00Z"),
        message: "Impostato da un collega",
      })
      const before = await snapshot(customer.id)

      const error = await failure(
        createTestCaller(operator).task.changeState({
          taskId: contact.id,
          toState: "app.to",
          source: "detail",
          confirmedAlertId: confirmation === "senza conferma" ? null : seen.id,
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
})

describe("task.changeState: tutto o niente (AC39)", () => {
  it.each([
    ["chiamare", "app.to", "log"],
    ["richiamare", "chiamare", "log"],
    ["chiamare", "app.to", "cliente"],
    ["richiamare", "chiamare", "cliente"],
  ] as const)(
    "da %s a %s con l'alert confermato, se fallisce la scrittura (%s) non cambia nulla",
    async (from, to, failing) => {
      const operator = await createOperator()
      const { customer, contact } = await seedContact({
        state: from,
        customerOperatorId: operator.id,
        closedAt: from === "richiamare" ? longAgo : null,
      })
      const open = await createAlert({ taskId: contact.id, deadline })
      const before = await snapshot(customer.id)
      if (failing === "log") {
        await failNextInsertInto(taskEventLog, { action: "state_change" })
      } else {
        await failNextUpdateOf(customers)
      }
      vi.spyOn(console, "error").mockImplementation(() => undefined)

      await expect(
        createTestCaller(operator).task.changeState({
          taskId: contact.id,
          toState: to,
          source: "list",
          confirmedAlertId: open.id,
        })
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })

      expect(await snapshot(customer.id)).toEqual(before)
      expect(before.alerts).toMatchObject([{ id: open.id, isResolved: false }])
      expect(before.tasks).toMatchObject([{ id: contact.id, alertId: open.id }])
    }
  )
})

describe("task.changeState: permessi", () => {
  it("rifiuta un contatto non più attivo con CONTACT_SUPERSEDED e non modifica nulla (AC27)", async () => {
    const operator = await createOperator()
    const { customer, contact } = await seedContact({
      state: "chiamare",
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
      createTestCaller(operator).task.changeState({
        taskId: contact.id,
        toState: "app.to",
        source: "detail",
        confirmedAlertId: null,
      })
    )

    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_SUPERSEDED",
      payload: { activeTaskId: active.id },
    })
    expect(await snapshot(customer.id)).toEqual(before)
  })

  it("rifiuta un operatore a cui non appartengono né il contatto né il cliente, con l'operatore del contatto, e non modifica nulla (AC49)", async () => {
    const owner = await createOperator()
    const assignee = await createOperator({ name: "Luigi", surname: "Verdi" })
    const stranger = await createOperator()
    const { customer, contact } = await seedContact({
      state: "chiamare",
      customerOperatorId: owner.id,
      contactOperatorId: assignee.id,
    })
    const before = await snapshot(customer.id)

    const error = await failure(
      createTestCaller(stranger).task.changeState({
        taskId: contact.id,
        toState: "app.to",
        source: "list",
        confirmedAlertId: null,
      })
    )

    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Luigi Verdi" },
    })
    expect(await snapshot(customer.id)).toEqual(before)
  })

  it("l'operatore del contatto lo cambia anche se il cliente è di un collega (A1)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact({
      state: "chiamare",
      customerOperatorId: colleague.id,
      contactOperatorId: me.id,
    })

    await createTestCaller(me).task.changeState({
      taskId: contact.id,
      toState: "app.to",
      source: "list",
      confirmedAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "app.to", operatorId: me.id },
    ])
  })

  it("l'operatore del cliente cambia il contatto di un collega (D2)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const { customer, contact } = await seedContact({
      state: "chiamare",
      customerOperatorId: me.id,
      contactOperatorId: colleague.id,
    })

    await createTestCaller(me).task.changeState({
      taskId: contact.id,
      toState: "richiamare",
      source: "detail",
      confirmedAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "richiamare", operatorId: colleague.id },
    ])
  })

  it("un ADMIN cambia lo stato di qualunque contatto attivo (AC48)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const { customer, contact } = await seedContact({
      state: "chiamare",
      customerOperatorId: owner.id,
    })

    await createTestCaller(admin).task.changeState({
      taskId: contact.id,
      toState: "erogata",
      source: "list",
      confirmedAlertId: null,
    })

    expect(await tasksOf(customer.id)).toMatchObject([
      { id: contact.id, state: "erogata", operatorId: owner.id },
    ])
    expect(await logOf(customer.id)).toMatchObject([
      { action: "state_change", actorOperatorId: admin.id },
    ])
  })
})
