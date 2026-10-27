import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { eq } from "drizzle-orm"
import { type Actor } from "@mito/domain/contact/permissions"
import { customers } from "@mito/db/schema/customers"
import { task } from "@mito/db/schema/task"
import {
  type LockedCustomer,
  lockCustomer,
  transaction,
} from "../../../effect/db"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import { type ServerContext } from "@mito/server/effect/server"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"
import { loadEditableContact, touchCustomer } from "../guard"

/** The program as the edges run it: with `ServerContext` and nothing else. */
const inServer = <A, E>(program: Effect.Effect<A, E, ServerContext>) =>
  program.pipe(provideServer, Effect.exit)

const load = (taskId: number, actor: Actor) =>
  inServer(transaction(loadEditableContact(taskId, actor)))

const loaded = (taskId: number, actor: Actor) =>
  Effect.gen(function* () {
    const exit = yield* load(taskId, actor)
    if (Exit.isFailure(exit))
      throw new Error(`guard failed: ${failureTag(exit)}`)
    return exit.value
  })

const failure = (taskId: number, actor: Actor) =>
  Effect.gen(function* () {
    const exit = yield* load(taskId, actor)
    return Exit.isFailure(exit) && exit.cause
  })

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
  it.effect(
    "un OPERATORE che non è né l'operatore del contatto né quello del cliente riceve ContactForbidden con il nome dell'assegnatario",
    () =>
      Effect.gen(function* () {
        const mario = yield* Effect.promise(() =>
          createOperator({ name: "Mario", surname: "Rossi" })
        )
        const owner = yield* Effect.promise(() => createOperator())
        const other = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: owner.id })
        )
        const contact = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: mario.id,
          })
        )

        const exit = yield* transaction(
          loadEditableContact(contact.id, {
            operatorId: other.id,
            role: "OPERATORE",
          })
        ).pipe(provideServer, Effect.exit)

        expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
          reasons: [
            { error: { _tag: "ContactForbidden", assignee: "Mario Rossi" } },
          ],
        })
      })
  )

  it.effect("un id inesistente fallisce con ContactNotFound", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      expect(
        failureTag(
          yield* load(999_999, {
            operatorId: admin.id,
            role: "ADMIN",
          })
        )
      ).toBe("ContactNotFound")
    })
  )

  it.effect(
    "un contatto non più attivo fallisce con ContactSuperseded e l'id del contatto attivo del cliente",
    () =>
      Effect.gen(function* () {
        const owner = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: owner.id })
        )
        const old = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: owner.id,
            isActive: false,
          })
        )
        const active = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: owner.id,
          })
        )
        expect(yield* failure(old.id, operatorActor(owner.id))).toMatchObject({
          reasons: [
            { error: { _tag: "ContactSuperseded", activeTaskId: active.id } },
          ],
        })
      })
  )

  it.effect(
    "un contatto non più attivo di un cliente senza contatto attivo fallisce con activeTaskId null, anche per un ADMIN",
    () =>
      Effect.gen(function* () {
        const admin = yield* Effect.promise(() =>
          createOperator({ role: "ADMIN" })
        )
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: admin.id })
        )
        const old = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: admin.id,
            isActive: false,
          })
        )
        expect(
          yield* failure(old.id, {
            operatorId: admin.id,
            role: "ADMIN",
          })
        ).toMatchObject({
          reasons: [
            { error: { _tag: "ContactSuperseded", activeTaskId: null } },
          ],
        })
      })
  )

  it.effect(
    "un OPERATORE modifica il contatto di un collega su un cliente suo (D2)",
    () =>
      Effect.gen(function* () {
        const me = yield* Effect.promise(() => createOperator())
        const colleague = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: me.id })
        )
        const contact = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: colleague.id,
          })
        )

        const result = yield* loaded(contact.id, operatorActor(me.id))

        expect(result.task.id).toBe(contact.id)
        expect(result.taskOperator).toEqual({
          id: colleague.id,
          name: colleague.name,
          surname: colleague.surname,
        })
      })
  )

  it.effect(
    "un OPERATORE modifica il contatto assegnato a lui su un cliente di un altro",
    () =>
      Effect.gen(function* () {
        const me = yield* Effect.promise(() => createOperator())
        const owner = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: owner.id })
        )
        const contact = yield* Effect.promise(() =>
          createTask({
            customerId: customer.id,
            operatorId: me.id,
          })
        )
        expect((yield* loaded(contact.id, operatorActor(me.id))).task.id).toBe(
          contact.id
        )
      })
  )

  it.effect(
    "un contatto non assegnato si modifica se il cliente è dell'operatore (A1)",
    () =>
      Effect.gen(function* () {
        const me = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: me.id })
        )
        const contact = yield* Effect.promise(() =>
          createTask({ customerId: customer.id })
        )

        const result = yield* loaded(contact.id, operatorActor(me.id))

        expect(result.taskOperator).toBeNull()
      })
  )

  it.effect(
    "un contatto non assegnato su un cliente non suo fallisce con ContactForbidden e assignee null (A1)",
    () =>
      Effect.gen(function* () {
        const me = yield* Effect.promise(() => createOperator())
        const owner = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: owner.id })
        )
        const contact = yield* Effect.promise(() =>
          createTask({ customerId: customer.id })
        )
        expect(yield* failure(contact.id, operatorActor(me.id))).toMatchObject({
          reasons: [{ error: { _tag: "ContactForbidden", assignee: null } }],
        })
      })
  )

  it.effect("un ADMIN modifica qualunque contatto attivo (AC48)", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const owner = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: owner.id })
      )
      const contact = yield* Effect.promise(() =>
        createTask({
          customerId: customer.id,
          operatorId: owner.id,
        })
      )

      const result = yield* loaded(contact.id, {
        operatorId: admin.id,
        role: "ADMIN",
      })

      expect(result.task.id).toBe(contact.id)
    })
  )

  it.effect("un contatto senza cliente fallisce con CustomerMissing", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const contact = yield* Effect.promise(() => createTask())
      expect(
        failureTag(
          yield* load(contact.id, {
            operatorId: admin.id,
            role: "ADMIN",
          })
        )
      ).toBe("CustomerMissing")
    })
  )

  it.effect(
    "l'alert collegato e già risolto non è aperto: openAlert è null",
    () =>
      Effect.gen(function* () {
        const me = yield* Effect.promise(() => createOperator())
        const customer = yield* Effect.promise(() =>
          createCustomer({ operatorId: me.id })
        )
        const contact = yield* Effect.promise(() =>
          createTask({ customerId: customer.id })
        )
        yield* Effect.promise(() =>
          createAlert({
            taskId: contact.id,
            deadline: new Date(),
            isResolved: true,
          })
        )
        expect(
          (yield* loaded(contact.id, operatorActor(me.id))).openAlert
        ).toBeNull()
      })
  )

  it.effect("l'alert collegato e aperto torna come openAlert", () =>
    Effect.gen(function* () {
      const me = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: me.id })
      )
      const contact = yield* Effect.promise(() =>
        createTask({ customerId: customer.id })
      )
      const open = yield* Effect.promise(() =>
        createAlert({ taskId: contact.id, deadline: new Date() })
      )
      expect(
        (yield* loaded(contact.id, operatorActor(me.id))).openAlert
      ).toEqual(open)
    })
  )

  it.effect("restituisce il cliente bloccato e la task riletta", () =>
    Effect.gen(function* () {
      const me = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({ operatorId: me.id })
      )
      const contact = yield* Effect.promise(() =>
        createTask({ customerId: customer.id })
      )
      const alert = yield* Effect.promise(() =>
        createAlert({
          taskId: contact.id,
          deadline: new Date(),
        })
      )

      const result = yield* loaded(contact.id, operatorActor(me.id))

      expect(result.customer).toEqual({ id: customer.id, operatorId: me.id })
      // The row as stored after createAlert linked the alert to it
      const [stored] = yield* Effect.promise(() =>
        testDb.select().from(task).where(eq(task.id, contact.id))
      )
      expect(result.task).toEqual(stored)
      expect(result.task.alertId).toBe(alert.id)
    })
  )

  // Checked by `tsc --noEmit`: the calls never run
  it.effect("si chiama solo dentro transaction()", () =>
    Effect.sync(() => {
      const actor = operatorActor(1)
      const locked = {} as LockedCustomer

      const misuses = [
        // @ts-expect-error: only transaction() provides Tx
        () => inServer(loadEditableContact(1, actor)),
        // @ts-expect-error: only transaction() provides Tx
        () => inServer(touchCustomer(locked)),
      ]

      expect(misuses).toHaveLength(2)
    })
  )
})

describe("touchCustomer", () => {
  it.effect("porta avanti updatedAt del cliente bloccato", () =>
    Effect.gen(function* () {
      const customer = yield* Effect.promise(() =>
        createCustomer({ updatedAt: past })
      )
      const before = new Date()

      const exit = yield* transaction(
        Effect.flatMap(lockCustomer(customer.id), touchCustomer)
      ).pipe(provideServer, Effect.exit)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(
        (yield* Effect.promise(() => updatedAtOf(customer.id))).getTime()
      ).toBeGreaterThanOrEqual(before.getTime())
    })
  )

  it.effect("dopo loadEditableContact aggiorna il cliente del contatto", () =>
    Effect.gen(function* () {
      const me = yield* Effect.promise(() => createOperator())
      const customer = yield* Effect.promise(() =>
        createCustomer({
          operatorId: me.id,
          updatedAt: past,
        })
      )
      const contact = yield* Effect.promise(() =>
        createTask({ customerId: customer.id })
      )

      const exit = yield* transaction(
        Effect.flatMap(
          loadEditableContact(contact.id, operatorActor(me.id)),
          ({ customer: locked }) => touchCustomer(locked)
        )
      ).pipe(provideServer, Effect.exit)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(
        (yield* Effect.promise(() => updatedAtOf(customer.id))).getTime()
      ).toBeGreaterThan(past.getTime())
    })
  )
})
