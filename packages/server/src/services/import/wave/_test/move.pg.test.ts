import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect"
import { asc, eq } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { task } from "@mito/db/schema/task"
import { move, moveCandidates } from "../move"
import { failureTag, provideServer } from "@/test/effect"
import { createCustomer, createOperator, createTask } from "@/test/factories"
import {
  hasTestDatabase,
  holdCustomerLock,
  holdUserDisabling,
  migrateUpTo,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// `move` of a Wave against the other writers, on a real Postgres (PGlite has
// one connection): the locks of D11 and the checks after them (D13). Each
// sequence is made deterministic by a lock the test holds and
// `waitUntilBlocked`

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A completed Wave of a new admin with 2 customers of Carla in Non risponde, and Ada */
const seed = given(async () => {
  const admin = await createOperator({ role: "ADMIN" })
  const ada = await createOperator({ name: "Ada" })
  const carla = await createOperator({ name: "Carla" })
  const [run] = await pgDb
    .insert(importRun)
    .values({
      startedBy: admin.userId,
      fileName: "1026_WAVE_NOV.xlsx",
      format: "wave",
      status: "completed",
      rowsTotal: 2,
      rowsDiscarded: 0,
    })
    .returning()
  const seeded = []
  for (let i = 0; i < 2; i++) {
    const customer = await createCustomer({ operatorId: carla.id })
    await pgDb
      .insert(importRunCustomer)
      .values({ runId: run!.id, customerId: customer.id, created: true })
    const contact = await createTask({
      customerId: customer.id,
      operatorId: carla.id,
      state: "non risponde",
      createdAt: new Date(Date.UTC(2026, 9, 1 + i)),
    })
    seeded.push({ customer, contact })
  }
  return { admin, ada, carla, runId: run!.id, seeded }
})

const tasksOf = (customerId: string) =>
  pgDb
    .select()
    .from(task)
    .where(eq(task.customerId, customerId))
    .orderBy(asc(task.id))

describe.skipIf(!hasTestDatabase)("move su Postgres vero", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  it.live(
    "una riapertura che tiene il lock del cliente: move aspetta, poi rilegge e salta quel contatto",
    () =>
      Effect.gen(function* () {
        const { admin, ada, carla, runId, seeded } = yield* seed
        const [reopened, other] = seeded
        const { candidates } = yield* moveCandidates(runId, [carla.id]).pipe(
          provideServer
        )

        // A colleague's write holds the customer and reopens its contact, as
        // `replaceActiveContact`: the old row inactive with its state and
        // operator, a new active one Da chiamare
        const held = yield* given(() => holdCustomerLock(reopened!.customer.id))
        const fresh = yield* given(async () => {
          await held.db
            .update(task)
            .set({ isActive: false })
            .where(eq(task.id, reopened!.contact.id))
          const [created] = await held.db
            .insert(task)
            .values({
              customerId: reopened!.customer.id,
              operatorId: carla.id,
              state: "chiamare",
              isActive: true,
            })
            .returning()
          return created!
        })
        const moving = yield* Effect.forkChild(
          move({
            runId,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            which: "both",
            strategy: "equal",
            contacts: [
              {
                fromOperatorId: carla.id,
                taskIds: candidates[0]!.contacts.map((c) => c.taskId),
              },
            ],
            receivers: [{ operatorId: ada.id, count: 2 }],
          }).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(1))
        yield* given(() => held.release())
        const exit = yield* Fiber.join(moving)

        expect(exit).toEqual(
          Exit.succeed({
            moved: 1,
            skipped: 1,
            byOperator: [{ operatorId: ada.id, count: 1 }],
          })
        )
        expect(
          yield* given(() => tasksOf(reopened!.customer.id))
        ).toMatchObject([
          {
            id: reopened!.contact.id,
            isActive: false,
            state: "non risponde",
            operatorId: carla.id,
          },
          { id: fresh.id, isActive: true, operatorId: carla.id },
        ])
        const owners = yield* given(() =>
          pgDb
            .select({ id: customers.id, operatorId: customers.operatorId })
            .from(customers)
            .orderBy(asc(customers.id))
        )
        expect(
          owners.find((row) => row.id === reopened!.customer.id)?.operatorId
        ).toBe(carla.id)
        expect(
          owners.find((row) => row.id === other!.customer.id)?.operatorId
        ).toBe(ada.id)
      })
  )

  it.live(
    "chi riceve disattivato da una transazione che tiene la sua riga utente: move aspetta, poi NumbersChanged e nulla scritto",
    () =>
      Effect.gen(function* () {
        const { admin, ada, carla, runId, seeded } = yield* seed
        const { candidates } = yield* moveCandidates(runId, [carla.id]).pipe(
          provideServer
        )

        const held = yield* given(() => holdUserDisabling(ada.userId))
        const moving = yield* Effect.forkChild(
          move({
            runId,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            which: "both",
            strategy: "equal",
            contacts: [
              {
                fromOperatorId: carla.id,
                taskIds: candidates[0]!.contacts.map((c) => c.taskId),
              },
            ],
            receivers: [{ operatorId: ada.id, count: 2 }],
          }).pipe(provideServer, Effect.exit)
        )
        yield* given(() => waitUntilBlocked(1))
        yield* given(() => held.release())
        const exit = yield* Fiber.join(moving)

        expect(failureTag(exit)).toBe("NumbersChanged")
        for (const { customer, contact } of seeded) {
          expect(yield* given(() => tasksOf(customer.id))).toMatchObject([
            { id: contact.id, operatorId: carla.id, isActive: true },
          ])
          const [row] = yield* given(() =>
            pgDb
              .select({ operatorId: customers.operatorId })
              .from(customers)
              .where(eq(customers.id, customer.id))
          )
          expect(row!.operatorId).toBe(carla.id)
        }
      })
  )
})
