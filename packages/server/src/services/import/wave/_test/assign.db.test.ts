import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { count, eq } from "drizzle-orm"
import { customers as customersTable } from "@mito/db/schema/customers"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { operators } from "@mito/db/schema/operators"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { users } from "@mito/db/schema/users"
import { waveOperation } from "@mito/db/schema/waveOperation"
import { type AssignRequest, assignWave } from "../assign"
import {
  activeTasksOf,
  customerRow,
  logOf,
  migrateUpTo,
  resetDb,
  tasksOf,
  testDb,
} from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

// `assign` of a Wave (T7, AC15, AC16; D4, D6, D8, D11, D12): the customers
// without an operator to the receivers, in exact counts, after the locks

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A completed Wave started by `admin` */
const insertRun = async (admin: { userId: string }) => {
  const [run] = await testDb
    .insert(importRun)
    .values({
      startedBy: admin.userId,
      fileName: "1026_WAVE_NOV.xlsx",
      format: "wave",
      status: "completed",
      rowsTotal: 10,
      rowsDiscarded: 0,
    })
    .returning()
  return run!
}

/** A customer of the Wave `runId`, created at `createdAt` */
const waveCustomer = async (
  runId: number,
  values: { id?: string; operatorId?: number | null; createdAt?: Date } = {}
) => {
  const customer = await createCustomer(values)
  await testDb
    .insert(importRunCustomer)
    .values({ runId, customerId: customer.id, created: true })
  return customer
}

const assign = (request: AssignRequest) =>
  assignWave(request).pipe(provideServer)

describe("assign: scrittura (D12)", () => {
  it.effect(
    "Ada 2 e Bruno 1 su 3 clienti nuovi senza operatore: 3 contatti Da chiamare con l'operatore del cliente",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const ada = yield* given(() => createOperator({ name: "Ada" }))
        const bruno = yield* given(() => createOperator({ name: "Bruno" }))
        const run = yield* given(() => insertRun(admin))
        const customers = yield* given(async () => [
          await waveCustomer(run.id),
          await waveCustomer(run.id),
          await waveCustomer(run.id),
        ])

        yield* assign({
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [
            { operatorId: ada.id, count: 2 },
            { operatorId: bruno.id, count: 1 },
          ],
        })

        const owners: number[] = []
        for (const customer of customers) {
          const [contact, ...others] = yield* given(() =>
            activeTasksOf(customer.id)
          )
          const row = yield* given(() => customerRow(customer.id))
          expect(others).toEqual([])
          expect(contact).toMatchObject({ state: "chiamare", priority: 120 })
          expect(row.operatorId).toBe(contact!.operatorId)
          owners.push(contact!.operatorId!)
        }
        expect(owners.filter((id) => id === ada.id)).toHaveLength(2)
        expect(owners.filter((id) => id === bruno.id)).toHaveLength(1)
      })
  )
})

/** The operator of the customer's active contact, or null without one */
const ownerOf = async (customerId: string) => {
  const [contact] = await activeTasksOf(customerId)
  return contact?.operatorId ?? null
}

/** What the write left: every task, log row and `wave_operation` row */
const written = given(async () => {
  const [tasks] = await testDb.select({ n: count() }).from(task)
  const [log] = await testDb.select({ n: count() }).from(taskEventLog)
  const [operations] = await testDb.select({ n: count() }).from(waveOperation)
  return { tasks: tasks!.n, log: log!.n, operations: operations!.n }
})

/** A Wave of `admin` with Ada and Bruno, and `n` customers created a day apart */
const seed = (n: number) =>
  given(async () => {
    const admin = await createOperator({ role: "ADMIN" })
    const ada = await createOperator({ name: "Ada", surname: "" })
    const bruno = await createOperator({ name: "Bruno", surname: "" })
    const run = await insertRun(admin)
    const customers = []
    for (let i = 0; i < n; i++) {
      customers.push(
        await waveCustomer(run.id, {
          createdAt: new Date(Date.UTC(2026, 9, 1 + i)),
        })
      )
    }
    return { admin, ada, bruno, run, customers }
  })

describe("assign: scrittura (D12), altri casi", () => {
  it.effect(
    "un contatto attivo senza operatore è preso senza contatti nuovi, con stato e alert invariati",
    () =>
      Effect.gen(function* () {
        const { admin, ada, run } = yield* seed(0)
        const other = yield* given(() => createOperator({ name: "Carla" }))
        // The customer has an operator, its active contact none (old data)
        const customer = yield* given(() =>
          waveCustomer(run.id, { operatorId: other.id })
        )
        const contact = yield* given(() =>
          createTask({
            customerId: customer.id,
            operatorId: null,
            state: "non risponde",
          })
        )
        const open = yield* given(() =>
          createAlert({
            taskId: contact.id,
            deadline: new Date("2026-10-20T22:00:00Z"),
          })
        )

        yield* assign({
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 1 }],
        })

        expect(yield* given(() => tasksOf(customer.id))).toMatchObject([
          {
            id: contact.id,
            isActive: true,
            state: "non risponde",
            alertId: open.id,
            operatorId: ada.id,
          },
        ])
        expect((yield* given(() => customerRow(customer.id))).operatorId).toBe(
          ada.id
        )
        expect(yield* given(() => logOf(customer.id))).toMatchObject([
          {
            action: "operator_reassign",
            source: "bulk",
            taskId: null,
            fromOperatorId: other.id,
            toOperatorId: ada.id,
            actorOperatorId: admin.id,
          },
          {
            action: "operator_reassign",
            source: "bulk",
            taskId: contact.id,
            fromOperatorId: null,
            toOperatorId: ada.id,
            actorOperatorId: admin.id,
          },
        ])
      })
  )

  it.effect(
    "un contatto nuovo ha i log bulk del caso 1 di bulkHandleTask, e nessuna riga call",
    () =>
      Effect.gen(function* () {
        const { admin, ada, run, customers } = yield* seed(1)

        yield* assign({
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 1 }],
        })

        const [contact] = yield* given(() => activeTasksOf(customers[0]!.id))
        const log = yield* given(() => logOf(customers[0]!.id))
        expect(log).toMatchObject([
          {
            action: "state_change",
            source: "bulk",
            taskId: contact!.id,
            fromState: null,
            toState: "chiamare",
            actorOperatorId: admin.id,
          },
          {
            action: "operator_reassign",
            source: "bulk",
            taskId: contact!.id,
            fromOperatorId: null,
            toOperatorId: ada.id,
            actorOperatorId: admin.id,
          },
        ])
        expect(log.filter((row) => row.action === "call")).toEqual([])
      })
  )

  it.effect(
    "a blocchi in ordine di nome: Bruno 1 e Ada 2 nella richiesta, Ada prende i primi due creati",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, run, customers } = yield* seed(3)

        const result = yield* assign({
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [
            { operatorId: bruno.id, count: 1 },
            { operatorId: ada.id, count: 2 },
          ],
        })

        const owners = []
        for (const customer of customers) {
          owners.push(yield* given(() => ownerOf(customer.id)))
        }
        expect(owners).toEqual([ada.id, ada.id, bruno.id])
        expect(result).toEqual({
          assigned: 3,
          byOperator: [
            { operatorId: bruno.id, count: 1 },
            { operatorId: ada.id, count: 2 },
          ],
          remaining: 0,
        })
      })
  )
})

/** An operator «Ada Neri» whose user has the id `userId` */
const homonym = async (userId: string) => {
  await testDb
    .insert(users)
    .values({ id: userId, email: `${userId}@test.local`, role: "OPERATORE" })
  const [operator] = await testDb
    .insert(operators)
    .values({ userId, name: "Ada", surname: "Neri" })
    .returning()
  return operator!
}

describe("assign: ordine dei clienti e dei blocchi (D8, Definizioni)", () => {
  it.effect(
    "due clienti creati nello stesso istante e «Quanti» 1: va quello con l'id più basso (AC13)",
    () =>
      Effect.gen(function* () {
        const { admin, ada, run } = yield* seed(0)
        const at = new Date("2026-10-01T00:00:00Z")
        // The higher id inserted first
        const higher = yield* given(() =>
          waveCustomer(run.id, { id: "wave-b", createdAt: at })
        )
        const lower = yield* given(() =>
          waveCustomer(run.id, { id: "wave-a", createdAt: at })
        )

        yield* assign({
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 1 }],
        })

        expect(yield* given(() => ownerOf(lower.id))).toBe(ada.id)
        expect(yield* given(() => ownerOf(higher.id))).toBeNull()
      })
  )

  it.effect(
    "due che ricevono con lo stesso nome e cognome: i blocchi seguono l'id dell'utente",
    () =>
      Effect.gen(function* () {
        const { admin, run, customers } = yield* seed(2)
        // The operator created first (lower operator id) has the higher user id
        const first = yield* given(() => homonym("user-zz"))
        const second = yield* given(() => homonym("user-aa"))
        expect(first.id).toBeLessThan(second.id)

        yield* assign({
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [
            { operatorId: first.id, count: 1 },
            { operatorId: second.id, count: 1 },
          ],
        })

        expect(yield* given(() => ownerOf(customers[0]!.id))).toBe(second.id)
        expect(yield* given(() => ownerOf(customers[1]!.id))).toBe(first.id)
      })
  )
})

describe("assign: numeri cambiati (AC16, D8, D11)", () => {
  it.effect(
    "con «Quanti» sotto il massimo vanno i clienti creati per primi",
    () =>
      Effect.gen(function* () {
        const { admin, ada, run } = yield* seed(0)
        // Inserted in another order than their creation in the CRM
        const late = yield* given(() =>
          waveCustomer(run.id, { createdAt: new Date("2026-10-03T00:00:00Z") })
        )
        const first = yield* given(() =>
          waveCustomer(run.id, { createdAt: new Date("2026-10-01T00:00:00Z") })
        )
        const second = yield* given(() =>
          waveCustomer(run.id, { createdAt: new Date("2026-10-02T00:00:00Z") })
        )

        const result = yield* assign({
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 2 }],
        })

        expect(yield* given(() => ownerOf(first.id))).toBe(ada.id)
        expect(yield* given(() => ownerOf(second.id))).toBe(ada.id)
        expect(yield* given(() => ownerOf(late.id))).toBeNull()
        expect(result.remaining).toBe(1)
      })
  )

  it.effect(
    "uno dei primi assegnato nel frattempo e abbastanza clienti rimasti: va il successivo",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, run, customers } = yield* seed(3)
        // Assigned to Bruno after the preview
        yield* given(async () => {
          await testDb
            .update(customersTable)
            .set({ operatorId: bruno.id })
            .where(eq(customersTable.id, customers[0]!.id))
          await createTask({
            customerId: customers[0]!.id,
            operatorId: bruno.id,
          })
        })

        yield* assign({
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 1 }],
        })

        expect(yield* given(() => ownerOf(customers[0]!.id))).toBe(bruno.id)
        expect(yield* given(() => ownerOf(customers[1]!.id))).toBe(ada.id)
        expect(yield* given(() => ownerOf(customers[2]!.id))).toBeNull()
      })
  )

  it.effect("rimasti meno di «Quanti»: NumbersChanged e nulla scritto", () =>
    Effect.gen(function* () {
      const { admin, ada, bruno, run } = yield* seed(2)
      const before = yield* written

      const exit = yield* assignWave({
        runId: run.id,
        requestId: crypto.randomUUID(),
        actorOperatorId: admin.id,
        receivers: [
          { operatorId: ada.id, count: 2 },
          { operatorId: bruno.id, count: 1 },
        ],
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("NumbersChanged")
      expect(yield* written).toEqual(before)
    })
  )

  it.effect(
    "un ricevente disattivato, o senza utente, fra anteprima e conferma: NumbersChanged e nulla scritto",
    () =>
      Effect.gen(function* () {
        const { admin, ada, run } = yield* seed(3)
        const disabled = yield* given(() =>
          createOperator({ name: "Dario", disabledAt: new Date() })
        )
        const system = yield* given(() => createSystemOperator())
        const before = yield* written

        for (const gone of [disabled.id, system.id]) {
          const exit = yield* assignWave({
            runId: run.id,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            receivers: [
              { operatorId: ada.id, count: 1 },
              { operatorId: gone, count: 1 },
            ],
          }).pipe(provideServer, Effect.exit)
          expect(failureTag(exit)).toBe("NumbersChanged")
        }
        expect(yield* written).toEqual(before)
      })
  )

  it.effect(
    "una quota negativa o un ricevente ripetuto: NumbersChanged e nulla scritto",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, run } = yield* seed(3)
        const before = yield* written

        for (const receivers of [
          [
            { operatorId: ada.id, count: -1 },
            { operatorId: bruno.id, count: 2 },
          ],
          [
            { operatorId: ada.id, count: 1 },
            { operatorId: ada.id, count: 1 },
          ],
        ]) {
          const exit = yield* assignWave({
            runId: run.id,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            receivers,
          }).pipe(provideServer, Effect.exit)
          expect(failureTag(exit)).toBe("NumbersChanged")
        }
        expect(yield* written).toEqual(before)
      })
  )

  it.effect("una Wave che non c'è o non è completata: WaveNotFound", () =>
    Effect.gen(function* () {
      const { admin, ada, run } = yield* seed(1)
      yield* given(() =>
        testDb
          .update(importRun)
          .set({ status: "running" })
          .where(eq(importRun.id, run.id))
      )

      for (const runId of [run.id, 999_999]) {
        const exit = yield* assignWave({
          runId,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 1 }],
        }).pipe(provideServer, Effect.exit)
        expect(failureTag(exit)).toBe("WaveNotFound")
      }
    })
  )
})

describe("assign: stesso requestId (D4)", () => {
  it.effect(
    "due volte: una scrittura e lo stesso risultato, anche se i numeri non tornano più",
    () =>
      Effect.gen(function* () {
        const { admin, ada, run } = yield* seed(3)
        const request = {
          runId: run.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 2 }],
        }

        const first = yield* assign(request)
        const after = yield* written
        const again = yield* assign(request)

        expect(again).toEqual(first)
        expect(first).toEqual({
          assigned: 2,
          byOperator: [{ operatorId: ada.id, count: 2 }],
          remaining: 1,
        })
        expect(yield* written).toEqual(after)
        expect(after.operations).toBe(1)
      })
  )

  it.effect(
    "da un altro admin o con quote diverse: RequestIdConflict e nulla scritto",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, run } = yield* seed(3)
        const other = yield* given(() => createOperator({ role: "ADMIN" }))
        const requestId = crypto.randomUUID()
        yield* assign({
          runId: run.id,
          requestId,
          actorOperatorId: admin.id,
          receivers: [{ operatorId: ada.id, count: 1 }],
        })
        const after = yield* written

        for (const request of [
          {
            runId: run.id,
            requestId,
            actorOperatorId: other.id,
            receivers: [{ operatorId: ada.id, count: 1 }],
          },
          {
            runId: run.id,
            requestId,
            actorOperatorId: admin.id,
            receivers: [{ operatorId: bruno.id, count: 1 }],
          },
        ]) {
          const exit = yield* assignWave(request).pipe(
            provideServer,
            Effect.exit
          )
          expect(failureTag(exit)).toBe("RequestIdConflict")
        }
        expect(yield* written).toEqual(after)
      })
  )
})
