import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect"
import { count, eq, sql } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { task } from "@mito/db/schema/task"
import { waveOperation } from "@mito/db/schema/waveOperation"
import { createContact } from "../../../contact/createContact"
import { assignWave } from "../assign"
import { failureTag, provideServer } from "@/test/effect"
import { createCustomer, createOperator } from "@/test/factories"
import {
  activeTasksOf,
  hasTestDatabase,
  holdCustomerLock,
  holdUserDisabling,
  migrateUpTo,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// `assign` of a Wave against the other writers, on a real Postgres (PGlite
// has one connection): the locks of D11 and the idempotency of D4. Each
// sequence is made deterministic by a lock the test holds and
// `waitUntilBlocked`

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A completed Wave of a new admin, with Ada, and `n` customers without operator created a day apart */
const seed = (n: number) =>
  given(async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const ada = await createOperator({ name: "Ada" })
    const bruno = await createOperator({ name: "Bruno" })
    const [run] = await pgDb
      .insert(importRun)
      .values({
        startedBy: admin.userId,
        fileName: "1026_WAVE_NOV.xlsx",
        format: "wave",
        status: "completed",
        rowsTotal: n,
        rowsDiscarded: 0,
      })
      .returning()
    const ids: string[] = []
    for (let i = 0; i < n; i++) {
      const customer = await createCustomer({
        createdAt: new Date(Date.UTC(2026, 9, 1 + i)),
      })
      await pgDb
        .insert(importRunCustomer)
        .values({ runId: run!.id, customerId: customer.id, created: true })
      ids.push(customer.id)
    }
    return { admin, ada, bruno, runId: run!.id, ids }
  })

const ownerOf = async (customerId: string) => {
  const [contact] = await activeTasksOf(customerId)
  return contact?.operatorId ?? null
}

/** Whether another connection finds the customer's row already locked */
const isLocked = (customerId: string) =>
  pgDb
    .transaction(async (tx) => {
      await tx.execute(
        sql`select ${customers.id} from ${customers} where ${customers.id} = ${customerId} for update nowait`
      )
    })
    .then(
      () => false,
      (error: { code?: string; cause?: { code?: string } }) => {
        // lock_not_available
        if ((error.code ?? error.cause?.code) === "55P03") return true
        throw error
      }
    )

describe.skipIf(!hasTestDatabase)("assignWave su Postgres vero", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it.live(
    "due conferme concorrenti con lo stesso requestId: una scrittura, lo stesso risultato",
    () =>
      Effect.gen(function* () {
        const { admin, ada, runId, ids } = yield* seed(3)
        const request = {
          runId,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 2 }],
        }

        const held = yield* given(() => holdCustomerLock(ids[0]!))
        const first = yield* Effect.forkChild(
          assignWave(request).pipe(provideServer, Effect.exit)
        )
        const second = yield* Effect.forkChild(
          assignWave(request).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(2))
        yield* given(() => held.release())
        const [a, b] = yield* Effect.all([
          Fiber.join(first),
          Fiber.join(second),
        ])

        const expected = {
          assigned: 2,
          byOperator: [{ operatorId: ada.id, count: 2 }],
          remaining: 1,
        }
        expect(a).toEqual(Exit.succeed(expected))
        expect(b).toEqual(Exit.succeed(expected))
        const [tasks] = yield* given(() =>
          pgDb.select({ n: count() }).from(task)
        )
        expect(tasks!.n).toBe(2)
        const [operations] = yield* given(() =>
          pgDb.select({ n: count() }).from(waveOperation)
        )
        expect(operations!.n).toBe(1)
      })
  )

  it.live(
    "due conferme concorrenti con lo stesso requestId su una Wave senza clienti da bloccare: lo stesso risultato",
    () =>
      Effect.gen(function* () {
        const { admin, ada, runId } = yield* seed(0)
        const request = {
          runId,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 0 }],
        }

        // The Wave's row held FOR UPDATE stops both at their first lock; once
        // freed, no customer orders them, and the second finds no row yet and
        // hits the unique id of the first (23505)
        let release: () => void = () => undefined
        const freed = new Promise<void>((resolve) => {
          release = resolve
        })
        const holding = pgDb.transaction(async (tx) => {
          await tx
            .select({ id: importRun.id })
            .from(importRun)
            .where(eq(importRun.id, runId))
            .for("update")
          await freed
        })
        const first = yield* Effect.forkChild(
          assignWave(request).pipe(provideServer, Effect.exit)
        )
        const second = yield* Effect.forkChild(
          assignWave(request).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(2))
        release()
        yield* given(() => holding)
        const [a, b] = yield* Effect.all([
          Fiber.join(first),
          Fiber.join(second),
        ])

        const expected = {
          assigned: 0,
          byOperator: [{ operatorId: ada.id, count: 0 }],
          remaining: 0,
        }
        expect(a).toEqual(Exit.succeed(expected))
        expect(b).toEqual(Exit.succeed(expected))
      })
  )

  it.live(
    "uno dei primi assegnato da una transazione che ne tiene il lock: dopo l'attesa va il successivo",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, runId, ids } = yield* seed(3)

        // A colleague's write holds the first customer and assigns it
        const held = yield* given(() => holdCustomerLock(ids[0]!))
        yield* given(async () => {
          await held.db
            .update(customers)
            .set({ operatorId: bruno.id })
            .where(eq(customers.id, ids[0]!))
          await held.db.insert(task).values({
            customerId: ids[0]!,
            operatorId: bruno.id,
            state: "chiamare",
            isActive: true,
          })
        })
        const assigning = yield* Effect.forkChild(
          assignWave({
            runId,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            receivers: [{ operatorId: ada.id, count: 1 }],
          }).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(1))
        yield* given(() => held.release())
        const exit = yield* Fiber.join(assigning)

        expect(failureTag(exit)).toBeUndefined()
        expect(yield* given(() => ownerOf(ids[0]!))).toBe(bruno.id)
        expect(yield* given(() => ownerOf(ids[1]!))).toBe(ada.id)
        expect(yield* given(() => ownerOf(ids[2]!))).toBeNull()
      })
  )

  it.live(
    "un createContact sullo stesso cliente aspetta l'assegnazione e trova il contatto di chi riceve",
    () =>
      Effect.gen(function* () {
        const { admin, ada, runId, ids } = yield* seed(1)

        const held = yield* given(() => holdCustomerLock(ids[0]!))
        const assigning = yield* Effect.forkChild(
          assignWave({
            runId,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            receivers: [{ operatorId: ada.id, count: 1 }],
          }).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(1))
        const creating = yield* Effect.forkChild(
          createContact({
            customerId: ids[0]!,
            source: "detail",
            actor: { role: "ADMIN", operatorId: admin.id },
          }).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(2))
        yield* given(() => held.release())
        const [assigned, created] = yield* Effect.all([
          Fiber.join(assigning),
          Fiber.join(creating),
        ])

        expect(failureTag(assigned)).toBeUndefined()
        expect(failureTag(created)).toBe("ContactAlreadyActive")
        const active = yield* given(() => activeTasksOf(ids[0]!))
        expect(active).toMatchObject([
          { operatorId: ada.id, state: "chiamare" },
        ])
      })
  )

  it.live(
    "chi riceve disattivato da una transazione che tiene la sua riga utente: assign aspetta, poi NumbersChanged e nulla scritto",
    () =>
      Effect.gen(function* () {
        const { admin, ada, runId, ids } = yield* seed(2)

        const held = yield* given(() => holdUserDisabling(ada.userId))
        const assigning = yield* Effect.forkChild(
          assignWave({
            runId,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            receivers: [{ operatorId: ada.id, count: 1 }],
          }).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(1))
        yield* given(() => held.release())
        const exit = yield* Fiber.join(assigning)

        expect(failureTag(exit)).toBe("NumbersChanged")
        expect(yield* given(() => ownerOf(ids[0]!))).toBeNull()
        expect(yield* given(() => ownerOf(ids[1]!))).toBeNull()
        const [tasks] = yield* given(() =>
          pgDb.select({ n: count() }).from(task)
        )
        expect(tasks!.n).toBe(0)
        const [operations] = yield* given(() =>
          pgDb.select({ n: count() }).from(waveOperation)
        )
        expect(operations!.n).toBe(0)
      })
  )

  it.live(
    "i clienti senza operatore si bloccano in ordine di id: in attesa sull'ultimo, tiene già quelli prima",
    () =>
      Effect.gen(function* () {
        const { admin, ada, runId } = yield* seed(0)
        // Inserted with the highest id first, so the order of the rows on
        // disk is not the order of id
        for (const id of ["order-c", "order-a", "order-b"]) {
          yield* given(async () => {
            await createCustomer({ id })
            await pgDb
              .insert(importRunCustomer)
              .values({ runId, customerId: id, created: true })
          })
        }

        const held = yield* given(() => holdCustomerLock("order-c"))
        const assigning = yield* Effect.forkChild(
          assignWave({
            runId,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            receivers: [{ operatorId: ada.id, count: 3 }],
          }).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(1))
        expect(yield* given(() => isLocked("order-a"))).toBe(true)
        expect(yield* given(() => isLocked("order-b"))).toBe(true)
        yield* given(() => held.release())
        const exit = yield* Fiber.join(assigning)

        expect(failureTag(exit)).toBeUndefined()
        for (const id of ["order-a", "order-b", "order-c"]) {
          expect(yield* given(() => ownerOf(id))).toBe(ada.id)
        }
      })
  )
})
