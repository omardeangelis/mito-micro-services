import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { Effect, Exit } from "effect"
import { eq } from "drizzle-orm"
import { type Actor } from "@/lib/domain/contact/permissions"
import { customers } from "@/server/db/schema/customers"
import { task } from "@/server/db/schema/task"
import {
  type LockedCustomer,
  lockCustomer,
  transaction,
} from "@/server/effect/db"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, runServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"
import { loadEditableContact, touchCustomer } from "../guard"

const load = (taskId: number, actor: Actor) =>
  runServer(transaction(loadEditableContact(taskId, actor)))

const loaded = async (taskId: number, actor: Actor) => {
  const exit = await load(taskId, actor)
  if (Exit.isFailure(exit)) throw new Error(`guard failed: ${failureTag(exit)}`)
  return exit.value
}

const failure = async (taskId: number, actor: Actor) => {
  const exit = await load(taskId, actor)
  return Exit.isFailure(exit) && exit.cause
}

const operatorActor = (operatorId: number): Actor => ({
  operatorId,
  role: "OPERATORE",
})

const updatedAtOf = async (customerId: string) => {
  const [row] = await testDb
    .select({ updatedAt: customers.updatedAt })
    .from(customers)
    .where(eq(customers.id, customerId))
  return row!.updatedAt
}

const past = new Date("2020-01-01T00:00:00Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("loadEditableContact", () => {
  it("un OPERATORE che non è né l'operatore del contatto né quello del cliente riceve ContactForbidden con il nome dell'assegnatario", async () => {
    const mario = await createOperator({ name: "Mario", surname: "Rossi" })
    const owner = await createOperator()
    const other = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: mario.id,
    })

    const exit = await runServer(
      transaction(
        loadEditableContact(contact.id, {
          operatorId: other.id,
          role: "OPERATORE",
        })
      )
    )

    expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
      error: { _tag: "ContactForbidden", assignee: "Mario Rossi" },
    })
  })

  it("un id inesistente fallisce con ContactNotFound", async () => {
    const admin = await createOperator({ role: "ADMIN" })

    expect(
      failureTag(await load(999_999, { operatorId: admin.id, role: "ADMIN" }))
    ).toBe("ContactNotFound")
  })

  it("un contatto non più attivo fallisce con ContactSuperseded e l'id del contatto attivo del cliente", async () => {
    const owner = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const old = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
      isActive: false,
    })
    const active = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })

    expect(await failure(old.id, operatorActor(owner.id))).toMatchObject({
      error: { _tag: "ContactSuperseded", activeTaskId: active.id },
    })
  })

  it("un contatto non più attivo di un cliente senza contatto attivo fallisce con activeTaskId null, anche per un ADMIN", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const customer = await createCustomer({ operatorId: admin.id })
    const old = await createTask({
      customerId: customer.id,
      operatorId: admin.id,
      isActive: false,
    })

    expect(
      await failure(old.id, { operatorId: admin.id, role: "ADMIN" })
    ).toMatchObject({
      error: { _tag: "ContactSuperseded", activeTaskId: null },
    })
  })

  it("un OPERATORE modifica il contatto di un collega su un cliente suo (D2)", async () => {
    const me = await createOperator()
    const colleague = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: colleague.id,
    })

    const result = await loaded(contact.id, operatorActor(me.id))

    expect(result.task.id).toBe(contact.id)
    expect(result.taskOperator).toEqual({
      id: colleague.id,
      name: colleague.name,
      surname: colleague.surname,
    })
  })

  it("un OPERATORE modifica il contatto assegnato a lui su un cliente di un altro", async () => {
    const me = await createOperator()
    const owner = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: me.id,
    })

    expect((await loaded(contact.id, operatorActor(me.id))).task.id).toBe(
      contact.id
    )
  })

  it("un contatto non assegnato si modifica se il cliente è dell'operatore (A1)", async () => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({ customerId: customer.id })

    const result = await loaded(contact.id, operatorActor(me.id))

    expect(result.taskOperator).toBeNull()
  })

  it("un contatto non assegnato su un cliente non suo fallisce con ContactForbidden e assignee null (A1)", async () => {
    const me = await createOperator()
    const owner = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const contact = await createTask({ customerId: customer.id })

    expect(await failure(contact.id, operatorActor(me.id))).toMatchObject({
      error: { _tag: "ContactForbidden", assignee: null },
    })
  })

  it("un ADMIN modifica qualunque contatto attivo (AC48)", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const owner = await createOperator()
    const customer = await createCustomer({ operatorId: owner.id })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: owner.id,
    })

    const result = await loaded(contact.id, {
      operatorId: admin.id,
      role: "ADMIN",
    })

    expect(result.task.id).toBe(contact.id)
  })

  it("un contatto senza cliente fallisce con CustomerMissing", async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const contact = await createTask()

    expect(
      failureTag(
        await load(contact.id, { operatorId: admin.id, role: "ADMIN" })
      )
    ).toBe("CustomerMissing")
  })

  it("l'alert collegato e già risolto non è aperto: openAlert è null", async () => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({ customerId: customer.id })
    await createAlert({
      taskId: contact.id,
      deadline: new Date(),
      isResolved: true,
    })

    expect(
      (await loaded(contact.id, operatorActor(me.id))).openAlert
    ).toBeNull()
  })

  it("l'alert collegato e aperto torna come openAlert", async () => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({ customerId: customer.id })
    const open = await createAlert({ taskId: contact.id, deadline: new Date() })

    expect((await loaded(contact.id, operatorActor(me.id))).openAlert).toEqual(
      open
    )
  })

  it("restituisce il cliente bloccato e la task riletta", async () => {
    const me = await createOperator()
    const customer = await createCustomer({ operatorId: me.id })
    const contact = await createTask({ customerId: customer.id })
    const alert = await createAlert({
      taskId: contact.id,
      deadline: new Date(),
    })

    const result = await loaded(contact.id, operatorActor(me.id))

    expect(result.customer).toEqual({ id: customer.id, operatorId: me.id })
    // The row as stored after createAlert linked the alert to it
    const [stored] = await testDb
      .select()
      .from(task)
      .where(eq(task.id, contact.id))
    expect(result.task).toEqual(stored)
    expect(result.task.alertId).toBe(alert.id)
  })

  // Checked by `tsc --noEmit`: the calls never run
  it("si chiama solo dentro transaction()", () => {
    const actor = operatorActor(1)
    const locked = {} as LockedCustomer

    const misuses = [
      // @ts-expect-error: only transaction() provides Tx
      () => runServer(loadEditableContact(1, actor)),
      // @ts-expect-error: only transaction() provides Tx
      () => runServer(touchCustomer(locked)),
    ]

    expect(misuses).toHaveLength(2)
  })
})

describe("touchCustomer", () => {
  it("porta avanti updatedAt del cliente bloccato", async () => {
    const customer = await createCustomer({ updatedAt: past })
    const before = new Date()

    const exit = await runServer(
      transaction(Effect.flatMap(lockCustomer(customer.id), touchCustomer))
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect((await updatedAtOf(customer.id)).getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    )
  })

  it("dopo loadEditableContact aggiorna il cliente del contatto", async () => {
    const me = await createOperator()
    const customer = await createCustomer({
      operatorId: me.id,
      updatedAt: past,
    })
    const contact = await createTask({ customerId: customer.id })

    const exit = await runServer(
      transaction(
        Effect.flatMap(
          loadEditableContact(contact.id, operatorActor(me.id)),
          ({ customer: locked }) => touchCustomer(locked)
        )
      )
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    expect((await updatedAtOf(customer.id)).getTime()).toBeGreaterThan(
      past.getTime()
    )
  })
})
