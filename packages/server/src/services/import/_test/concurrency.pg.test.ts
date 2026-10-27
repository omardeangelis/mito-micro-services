import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { asc, eq, getTableName } from "drizzle-orm"
import { Clock, Effect, Exit, Fiber, Layer } from "effect"
import { TestClock } from "effect/testing"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { classifyRows } from "@mito/domain/import/classify"
import { groupRows, lookupKeys } from "@mito/domain/import/group"
import { planRows } from "@mito/domain/import/plan"
import { waveCells } from "@mito/domain/import/_test/cells"
import { DbLive, transaction } from "../../../effect/db"
import { deactivateOperator } from "../../operator/deactivate"
import { applyImport } from "../apply"
import { ImportConfigLive } from "../config"
import { lookupExisting } from "../lookup"
import { provideServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import {
  hasTestDatabase,
  holdCustomerLock,
  holdPracticeLock,
  migrateUpTo,
  pgClient,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// The import against the other writer of several practices, the
// deactivation of their operator, on a real Postgres: both lock the practices
// in order of `pratica_id` before they write, so they don't deadlock (AC27,
// D6). The sequence is made deterministic by a lock the test holds on P1: the
// import waits for it holding nothing of P2, the deactivation queues behind;
// one that took P2 first (in the order of the table) would deadlock with the
// import. Before D6 the deactivation failed with `deadlock detected`

const NOW = new Date("2025-01-15T11:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"
const CF_A = "RSSMRA80A01H501U"

/**
 * Whether a transaction holds the row lock right now, from another
 * connection. With the import and the writer both waiting for P1, P2 is free
 * when the writer locks in order of `pratica_id`; one that took P2 first
 * holds it, and would deadlock with the import once the test frees P1. A
 * retry on the deadlock would hide it from the outcome, not from this.
 */
const isPracticeLocked = (praticaId: string) =>
  pgDb
    .transaction((tx) =>
      tx
        .select({ praticaId: practices.praticaId })
        .from(practices)
        .where(eq(practices.praticaId, praticaId))
        .for("update", { noWait: true })
    )
    .then(
      () => false,
      () => true
    )

const isCustomerLocked = (id: string) =>
  pgDb
    .transaction((tx) =>
      tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, id))
        .for("update", { noWait: true })
    )
    .then(
      () => false,
      () => true
    )

describe.skipIf(!hasTestDatabase)(
  "import e disattivazione dell'operatore delle pratiche",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    const layer = Layer.merge(DbLive, ImportConfigLive)

    /**
     * A customer without operator with P2 and P1 of `operatorId`, P2 first in
     * the table, and the import of a file with both.
     */
    const seed = (operatorId: number | null) =>
      Effect.gen(function* () {
        const customer = yield* Effect.promise(() =>
          createCustomer({ tempID: "1", fiscalCode: CF_A })
        )
        for (const praticaId of ["P2", "P1"]) {
          yield* Effect.promise(() =>
            createPractice({ customerId: customer.id, praticaId, operatorId })
          )
        }
        // As small as it is, the table is scanned in its order: P2, then P1
        yield* Effect.promise(
          () => pgClient`ANALYZE ${pgClient(getTableName(practices))}`
        )
        const rows = ["P1", "P2"].map((praticaId, index) => ({
          row: index + 2,
          cells: waveCells({
            "Codice Fiscale": CF_A,
            "Codice NDG": "1",
            "n° Pratica": praticaId,
          }),
        }))
        const classified = classifyRows("wave", rows, NOW, FILE_NAME)
        const crm = yield* lookupExisting(
          lookupKeys(groupRows(classified))
        ).pipe(Effect.provide(layer))
        const { expected } = planRows(classified, crm)
        return () =>
          Effect.gen(function* () {
            // The deadline is on the wall clock, the statements' timeout comes from it
            yield* TestClock.setTime(Date.now())
            return yield* transaction(
              applyImport({
                format: "wave",
                fileName: FILE_NAME,
                rows,
                expected,
                now: NOW,
                deadline: Date.now() + 60_000,
              })
            ).pipe(Effect.provide(layer), Effect.exit)
          })
      })

    const operatorsOfPractices = async () =>
      (
        await pgDb
          .select({
            praticaId: practices.praticaId,
            operatorId: practices.operatorId,
          })
          .from(practices)
          .orderBy(asc(practices.praticaId))
      ).map(({ praticaId, operatorId }) => [praticaId, operatorId])

    it.effect(
      "con un import che tiene le pratiche, la disattivazione del loro operatore aspetta e poi riesce",
      () =>
        Effect.gen(function* () {
          const [admin, mario, anna] = [
            yield* Effect.promise(() => createOperator({ role: "ADMIN" })),
            yield* Effect.promise(() => createOperator()),
            yield* Effect.promise(() => createOperator()),
          ]
          const importFile = yield* seed(mario.id)

          const p1 = yield* Effect.promise(() => holdPracticeLock("P1"))
          const importedFiber = yield* Effect.forkChild(importFile())
          yield* Effect.promise(() => waitUntilBlocked(1))
          const deactivatedFiber = yield* Effect.forkChild(
            deactivateOperator({
              operatorId: mario.id,
              toOperatorId: anna.id,
              actor: { role: "ADMIN", operatorId: admin.id },
            }).pipe(provideServer, Effect.exit)
          )
          yield* Effect.promise(() => waitUntilBlocked(2))
          expect(yield* Effect.promise(() => isPracticeLocked("P2"))).toBe(
            false
          )
          yield* Effect.promise(() => p1.release())

          const [importExit, deactivationExit] = yield* Effect.all([
            Fiber.join(importedFiber),
            Fiber.join(deactivatedFiber),
          ])
          expect(Exit.isSuccess(importExit) || String(importExit.cause)).toBe(
            true
          )
          expect(
            Exit.isSuccess(deactivationExit) && deactivationExit.value
          ).toEqual({ customersMoved: 0, contactsMoved: 0, practicesMoved: 2 })
          expect(yield* Effect.promise(() => operatorsOfPractices())).toEqual([
            ["P1", anna.id],
            ["P2", anna.id],
          ])
        })
    )
  }
)

// The locks of the import's lookup (D5): every customer it reads, those of
// the VAT number of a recognized one too, in one statement in order of `id`,
// then the practices; and the deadline of every statement (D8)
describe.skipIf(!hasTestDatabase)("lock e scadenza dell'import", () => {
  beforeAll(async () => {
    await migrateUpTo()
  })

  beforeEach(async () => {
    await resetDb()
  })

  const layer = Layer.merge(DbLive, ImportConfigLive)
  const VAT = "01234567890"
  // A row with the fiscal code of z-a: today's rule updates also the
  // customers with its VAT number (D11)
  const keys = {
    fiscalCodes: [CF_A],
    vatCodes: [],
    customerCodes: ["1"],
    praticaIds: ["P1", "P2"],
  }

  /** z-a, m-b and a-c with the same VAT number, against the order of `id`. */
  const seedCustomers = async () => {
    const za = await createCustomer({
      id: "z-a",
      tempID: "1",
      fiscalCode: CF_A,
      vatCode: VAT,
    })
    await createCustomer({ id: "m-b", tempID: "2", vatCode: VAT })
    await createCustomer({ id: "a-c", tempID: "3", vatCode: VAT })
    // P2 first in the table
    for (const praticaId of ["P2", "P1"]) {
      await createPractice({ customerId: za.id, praticaId })
    }
    // As small as they are, the tables are scanned in their order
    await pgClient`ANALYZE ${pgClient(getTableName(customers))}`
    await pgClient`ANALYZE ${pgClient(getTableName(practices))}`
  }

  it.effect(
    "dopo il lookup l'import tiene i clienti del file, quelli della loro partita IVA e le pratiche",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedCustomers())

        const locked = yield* transaction(
          Effect.gen(function* () {
            yield* lookupExisting(keys, { lock: true })
            return yield* Effect.promise(async () => ({
              customers: [
                await isCustomerLocked("a-c"),
                await isCustomerLocked("m-b"),
                await isCustomerLocked("z-a"),
              ],
              practices: [
                await isPracticeLocked("P1"),
                await isPracticeLocked("P2"),
              ],
            }))
          })
        ).pipe(Effect.provide(layer))

        expect(locked).toEqual({
          customers: [true, true, true],
          practices: [true, true],
        })
      })
  )

  it.effect(
    "aspetta il primo cliente per id senza tenere gli altri, così non si chiude un ciclo con chi blocca in ordine di id",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedCustomers())
        const held = yield* Effect.promise(() => holdCustomerLock("a-c"))

        const lookedFiber = yield* Effect.forkChild(
          transaction(lookupExisting(keys, { lock: true })).pipe(
            Effect.provide(layer)
          )
        )
        const looked = Fiber.join(lookedFiber)
        let whileWaiting: boolean[]
        try {
          yield* Effect.promise(() => waitUntilBlocked(1))
          // In two rounds, the first one held z-a while the second waited for a-c
          whileWaiting = [
            yield* Effect.promise(() => isCustomerLocked("m-b")),
            yield* Effect.promise(() => isCustomerLocked("z-a")),
          ]
        } finally {
          yield* Effect.promise(() => held.release())
        }

        expect(whileWaiting).toEqual([false, false])
        expect((yield* looked).customers.map(({ id }) => id)).toEqual([
          "a-c",
          "m-b",
          "z-a",
        ])
      })
  )

  it.effect(
    "uno statement che aspetta oltre la scadenza si ferma alla scadenza, non al tempo che restava all'inizio",
    () =>
      Effect.gen(function* () {
        const rows = [
          {
            row: 2,
            cells: waveCells({ "Codice NDG": "1", "n° Pratica": "P1" }),
          },
        ]
        // Another transaction is inserting a customer with the same code: the
        // import's insert waits for it
        const other = yield* Effect.promise(() => pgClient.reserve())
        yield* Effect.promise(() => other`BEGIN`)
        yield* Effect.promise(
          () =>
            other`INSERT INTO ${other(getTableName(customers))} (id, name, surname, temp_id, unique_hash, source) VALUES ('altro', 'Anna', 'altro', '1', 'altro', 'inbound')`
        )
        // 60 s at the start, 1.5 s left at the insert
        const start = Date.now()
        const deadline = start + 60_000
        let calls = 0
        // Hand-written, the one exception of AC8: it advances on every read,
        // which TestClock cannot do
        const nanos = BigInt(start) * 1_000_000n
        const steppingClock: Clock.Clock = {
          currentTimeMillisUnsafe: () => start,
          currentTimeMillis: Effect.sync(() =>
            calls++ === 0 ? start : deadline - 1_500
          ),
          currentTimeNanosUnsafe: () => nanos,
          currentTimeNanos: Effect.succeed(nanos),
          monotonicTimeNanosUnsafe: () => nanos,
          monotonicTimeNanos: Effect.succeed(nanos),
          sleep: () => Effect.void,
        }

        try {
          const exit = yield* transaction(
            applyImport({
              format: "wave",
              fileName: FILE_NAME,
              rows,
              expected: [2],
              now: NOW,
              deadline,
            })
          ).pipe(
            Effect.provideService(Clock.Clock, steppingClock),
            Effect.provide(layer),
            Effect.exit
          )

          expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
            reasons: [{ error: { _tag: "DbError", code: "57014" } }],
          })
          expect(Date.now() - start).toBeLessThan(20_000)
        } finally {
          yield* Effect.promise(() => other`ROLLBACK`)
          other.release()
        }
      }),
    30_000
  )
})
