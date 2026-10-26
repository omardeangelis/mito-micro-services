import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc, eq, getTableName } from "drizzle-orm"
import { Clock, Effect, Exit, Layer } from "effect"
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
import { runServer } from "@/test/effect"
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
    const seed = async (operatorId: number | null) => {
      const customer = await createCustomer({ tempID: "1", fiscalCode: CF_A })
      for (const praticaId of ["P2", "P1"]) {
        await createPractice({ customerId: customer.id, praticaId, operatorId })
      }
      // As small as it is, the table is scanned in its order: P2, then P1
      await pgClient`ANALYZE ${pgClient(getTableName(practices))}`
      const rows = ["P1", "P2"].map((praticaId, index) => ({
        row: index + 2,
        cells: waveCells({
          "Codice Fiscale": CF_A,
          "Codice NDG": "1",
          "n° Pratica": praticaId,
        }),
      }))
      const classified = classifyRows("wave", rows, NOW, FILE_NAME)
      const crm = await Effect.runPromise(
        lookupExisting(lookupKeys(groupRows(classified))).pipe(
          Effect.provide(layer)
        )
      )
      const { expected } = planRows(classified, crm)
      return () =>
        Effect.runPromiseExit(
          transaction(
            applyImport({
              format: "wave",
              fileName: FILE_NAME,
              rows,
              expected,
              now: NOW,
              deadline: Date.now() + 60_000,
            })
          ).pipe(Effect.provide(layer))
        )
    }

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

    it("con un import che tiene le pratiche, la disattivazione del loro operatore aspetta e poi riesce", async () => {
      const [admin, mario, anna] = [
        await createOperator({ role: "ADMIN" }),
        await createOperator(),
        await createOperator(),
      ]
      const importFile = await seed(mario.id)

      const p1 = await holdPracticeLock("P1")
      const imported = importFile()
      await waitUntilBlocked(1)
      const deactivated = runServer(
        deactivateOperator({
          operatorId: mario.id,
          toOperatorId: anna.id,
          actor: { role: "ADMIN", operatorId: admin.id },
        })
      )
      await waitUntilBlocked(2)
      expect(await isPracticeLocked("P2")).toBe(false)
      await p1.release()

      const [importExit, deactivationExit] = await Promise.all([
        imported,
        deactivated,
      ])
      expect(Exit.isSuccess(importExit) || String(importExit.cause)).toBe(true)
      expect(
        Exit.isSuccess(deactivationExit) && deactivationExit.value
      ).toEqual({ customersMoved: 0, contactsMoved: 0, practicesMoved: 2 })
      expect(await operatorsOfPractices()).toEqual([
        ["P1", anna.id],
        ["P2", anna.id],
      ])
    })
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

  it("dopo il lookup l'import tiene i clienti del file, quelli della loro partita IVA e le pratiche", async () => {
    await seedCustomers()

    const locked = await Effect.runPromise(
      transaction(
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
    )

    expect(locked).toEqual({
      customers: [true, true, true],
      practices: [true, true],
    })
  })

  it("aspetta il primo cliente per id senza tenere gli altri, così non si chiude un ciclo con chi blocca in ordine di id", async () => {
    await seedCustomers()
    const held = await holdCustomerLock("a-c")

    const looked = Effect.runPromise(
      transaction(lookupExisting(keys, { lock: true })).pipe(
        Effect.provide(layer)
      )
    )
    let whileWaiting: boolean[]
    try {
      await waitUntilBlocked(1)
      // In two rounds, the first one held z-a while the second waited for a-c
      whileWaiting = [
        await isCustomerLocked("m-b"),
        await isCustomerLocked("z-a"),
      ]
    } finally {
      await held.release()
    }

    expect(whileWaiting).toEqual([false, false])
    expect((await looked).customers.map(({ id }) => id)).toEqual([
      "a-c",
      "m-b",
      "z-a",
    ])
  })

  it("uno statement che aspetta oltre la scadenza si ferma alla scadenza, non al tempo che restava all'inizio", async () => {
    const rows = [
      {
        row: 2,
        cells: waveCells({ "Codice NDG": "1", "n° Pratica": "P1" }),
      },
    ]
    // Another transaction is inserting a customer with the same code: the
    // import's insert waits for it
    const other = await pgClient.reserve()
    await other`BEGIN`
    await other`INSERT INTO ${other(getTableName(customers))} (id, name, surname, temp_id, unique_hash, source) VALUES ('altro', 'Anna', 'altro', '1', 'altro', 'inbound')`
    // 60 s at the start, 1.5 s left at the insert
    const start = Date.now()
    const deadline = start + 60_000
    let calls = 0
    const clock = Clock.make()
    const steppingClock: Clock.Clock = {
      ...clock,
      currentTimeMillis: Effect.sync(() =>
        calls++ === 0 ? start : deadline - 1_500
      ),
    }

    try {
      const exit = await Effect.runPromiseExit(
        transaction(
          applyImport({
            format: "wave",
            fileName: FILE_NAME,
            rows,
            expected: [2],
            now: NOW,
            deadline,
          })
        ).pipe(Effect.withClock(steppingClock), Effect.provide(layer))
      )

      expect(Exit.isFailure(exit) && exit.cause).toMatchObject({
        error: { _tag: "DbError", code: "57014" },
      })
      expect(Date.now() - start).toBeLessThan(20_000)
    } finally {
      await other`ROLLBACK`
      other.release()
    }
  }, 30_000)
})
