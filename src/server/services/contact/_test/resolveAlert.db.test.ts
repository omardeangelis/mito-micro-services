import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc, eq } from "drizzle-orm"
import { readContactError } from "@/lib/domain/contact/errors"
import { alert } from "@mito/db/schema/task"
import { createTestCaller } from "@/test/caller"
import { logOf, migrateUpTo, resetDb, tasksOf, testDb } from "@/test/db"
import { afterNextWriteTo } from "@/test/failpoint"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

/** The alerts of the task, oldest first. */
const alertsOf = (taskId: number) =>
  testDb
    .select()
    .from(alert)
    .where(eq(alert.taskId, taskId))
    .orderBy(asc(alert.id))

const deadline = new Date("2026-10-20T22:00:00Z")

/** An active contact of `operatorId`'s customer with an open alert. */
const contactWithOpenAlert = async ({
  customerOperatorId,
  contactOperatorId = customerOperatorId,
}: {
  customerOperatorId: number
  contactOperatorId?: number
}) => {
  const customer = await createCustomer({ operatorId: customerOperatorId })
  const contact = await createTask({
    customerId: customer.id,
    operatorId: contactOperatorId,
    state: "richiamare",
  })
  const open = await createAlert({ taskId: contact.id, deadline })
  return { customer, contact, open }
}

/** The alert is still open and linked to the contact, and nothing was logged. */
const expectUntouched = async ({
  customer,
  contact,
  open,
}: Awaited<ReturnType<typeof contactWithOpenAlert>>) => {
  expect(await alertsOf(contact.id)).toMatchObject([
    { id: open.id, isResolved: false, resolvedBy: null },
  ])
  const [current] = (await tasksOf(customer.id)).filter(
    (each) => each.id === contact.id
  )
  expect(current!.alertId).toBe(open.id)
  expect(await logOf(customer.id)).toEqual([])
}

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("task.resolveAlert", () => {
  it("la 'X' su un alert aperto lo chiude con resolvedBy = attore, lo stacca dalla task e scrive una riga alert_resolved", async () => {
    const operator = await createOperator({ name: "Mario", surname: "Rossi" })
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "richiamare",
    })
    const open = await createAlert({
      taskId: contact.id,
      deadline: new Date("2026-10-20T22:00:00Z"),
    })
    const caller = createTestCaller(operator)

    await caller.task.resolveAlert({ alertId: open.id, source: "detail" })

    const history = await caller.task.getCustomerAlerts({ id: customer.id })
    expect(history).toMatchObject([
      {
        id: open.id,
        isResolved: true,
        resolvedByName: "Mario",
        resolvedBySurname: "Rossi",
      },
    ])
    expect((await tasksOf(customer.id))[0]!.alertId).toBeNull()
    expect(await logOf(customer.id)).toMatchObject([
      {
        action: "alert_resolved",
        source: "detail",
        alertId: open.id,
        taskId: contact.id,
        actorOperatorId: operator.id,
      },
    ])
  })

  it("la 'X' su un alert già chiuso dal sistema non cambia resolvedBy, la data e il log, senza errore (F14)", async () => {
    const operator = await createOperator()
    const system = await createSystemOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
    })
    const closedAt = new Date("2026-01-01T00:00:00Z")
    const closed = await createAlert({
      taskId: contact.id,
      deadline,
      isResolved: true,
      resolvedBy: system.id,
      updatedAt: closedAt,
    })
    const caller = createTestCaller(operator)

    await expect(
      caller.task.resolveAlert({ alertId: closed.id, source: "list" })
    ).resolves.toEqual({ resolved: false })

    expect(await alertsOf(contact.id)).toMatchObject([
      {
        id: closed.id,
        isResolved: true,
        resolvedBy: system.id,
        updatedAt: closedAt,
      },
    ])
    expect(await logOf(customer.id)).toEqual([])
  })

  it("chiudere l'alert A non stacca un alert B collegato alla task subito dopo (R7)", async () => {
    const operator = await createOperator()
    const { customer, contact, open } = await contactWithOpenAlert({
      customerOperatorId: operator.id,
    })
    // Right after A is closed, a concurrent writer links a new alert B
    await afterNextWriteTo(
      alert,
      "UPDATE",
      `WITH b AS (
        INSERT INTO "mito-deutsche_alert" (task_id, deadline)
        VALUES (${contact.id}, '2026-11-01T22:00:00Z') RETURNING id
      )
      UPDATE "mito-deutsche_task" SET alert_id = (SELECT id FROM b)
      WHERE id = ${contact.id}`
    )
    const caller = createTestCaller(operator)

    await caller.task.resolveAlert({ alertId: open.id, source: "list" })

    const [closed, linked] = await alertsOf(contact.id)
    expect(closed).toMatchObject({ id: open.id, isResolved: true })
    expect(linked).toMatchObject({ isResolved: false, resolvedBy: null })
    expect((await tasksOf(customer.id))[0]!.alertId).toBe(linked!.id)
    expect(await logOf(customer.id)).toMatchObject([
      { action: "alert_resolved", alertId: open.id, source: "list" },
    ])
  })

  it("rifiuta l'alert di un contatto non più attivo e non modifica nulla (AC27)", async () => {
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const old = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
      state: "richiamare",
      isActive: false,
    })
    const open = await createAlert({ taskId: old.id, deadline })
    const active = await createTask({
      customerId: customer.id,
      operatorId: operator.id,
    })
    const caller = createTestCaller(operator)

    const error: unknown = await caller.task
      .resolveAlert({ alertId: open.id, source: "detail" })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_SUPERSEDED",
      payload: { activeTaskId: active.id },
    })
    await expectUntouched({ customer, contact: old, open })
  })

  it("rifiuta un operatore a cui non appartengono né il contatto né il cliente, con CONTACT_FORBIDDEN, e non modifica nulla (AC49)", async () => {
    const owner = await createOperator()
    const assignee = await createOperator({ name: "Luigi", surname: "Verdi" })
    const stranger = await createOperator()
    const seeded = await contactWithOpenAlert({
      customerOperatorId: owner.id,
      contactOperatorId: assignee.id,
    })
    const caller = createTestCaller(stranger)

    const error: unknown = await caller.task
      .resolveAlert({ alertId: seeded.open.id, source: "detail" })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(readContactError(error)).toEqual({
      code: "CONTACT_FORBIDDEN",
      payload: { assignee: "Luigi Verdi" },
    })
    await expectUntouched(seeded)
  })

  it("un alert inesistente è NOT_FOUND", async () => {
    const operator = await createOperator()
    const caller = createTestCaller(operator)

    await expect(
      caller.task.resolveAlert({ alertId: 999_999, source: "detail" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("rifiuta una sorgente diversa da list e detail e non modifica nulla", async () => {
    const operator = await createOperator()
    const seeded = await contactWithOpenAlert({
      customerOperatorId: operator.id,
    })
    const caller = createTestCaller(operator)

    await expect(
      caller.task.resolveAlert({
        alertId: seeded.open.id,
        // @ts-expect-error only the interface's sources are accepted
        source: "cron_alert",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expectUntouched(seeded)
  })

  it("un ADMIN chiude l'alert di qualunque contatto attivo (AC48)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const { customer, contact, open } = await contactWithOpenAlert({
      customerOperatorId: owner.id,
    })
    const caller = createTestCaller(admin)

    await caller.task.resolveAlert({ alertId: open.id, source: "list" })

    expect(await alertsOf(contact.id)).toMatchObject([
      { id: open.id, isResolved: true, resolvedBy: admin.id },
    ])
    expect((await tasksOf(customer.id))[0]!.alertId).toBeNull()
  })

  it("l'operatore del cliente chiude l'alert del contatto di un collega (D2)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const { customer, contact, open } = await contactWithOpenAlert({
      customerOperatorId: me.id,
      contactOperatorId: colleague.id,
    })
    const caller = createTestCaller(me)

    await caller.task.resolveAlert({ alertId: open.id, source: "detail" })

    expect(await alertsOf(contact.id)).toMatchObject([
      { id: open.id, isResolved: true, resolvedBy: me.id },
    ])
    expect((await tasksOf(customer.id))[0]!.alertId).toBeNull()
    expect(await logOf(customer.id)).toMatchObject([
      { action: "alert_resolved", actorOperatorId: me.id, source: "detail" },
    ])
  })
})
