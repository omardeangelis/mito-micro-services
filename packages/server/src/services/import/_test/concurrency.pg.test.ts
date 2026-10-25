import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc, eq, getTableName } from "drizzle-orm"
import { Effect, Exit, Layer } from "effect"
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
import { createTestCaller } from "@/test/caller"
import { runServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import {
  hasTestDatabase,
  holdPracticeLock,
  migrateUpTo,
  pgClient,
  pgDb,
  resetDb,
  waitUntilBlocked,
} from "@/test/pg"

// The import against the other writers of several practices, on a real
// Postgres: all of them lock the practices in order of `pratica_id` before
// they write, so none deadlocks (AC27, D6). Each sequence is made
// deterministic by a lock the test holds on P1: the import waits for it
// holding nothing of P2, the other writer queues behind; a writer that took
// P2 first (in the order of the table) would deadlock with the import. On
// today's code both writers failed with `deadlock detected`

const NOW = new Date("2025-01-15T11:00:00.000Z")
const FILE_NAME = "0125_import.xlsx"
const CF_A = "RSSMRA80A01H501U"

describe.skipIf(!hasTestDatabase)(
  "import e altri writer delle pratiche",
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

    /**
     * Whether a transaction holds the practice's row lock right now. With the
     * import and the writer both waiting for P1, P2 is free when the writer
     * locks in order of `pratica_id`; one that took P2 first holds it, and
     * would deadlock with the import once the test frees P1. A retry on the
     * deadlock would hide it from the outcome, not from this.
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

    it("con un import che tiene le pratiche, un bulkAssignPractices sulle stesse aspetta e poi riesce", async () => {
      const anna = await createOperator()
      const importFile = await seed(null)

      const p1 = await holdPracticeLock("P1")
      const imported = importFile()
      await waitUntilBlocked(1)
      const assigned = createTestCaller(anna)
        .pratiche.bulkAssignPractices({
          operatorId: anna.id,
          practiceIds: ["P2", "P1"],
        })
        .then(
          () => "ok",
          (error: unknown) => error
        )
      await waitUntilBlocked(2)
      expect(await isPracticeLocked("P2")).toBe(false)
      await p1.release()

      const [importExit, assignment] = await Promise.all([imported, assigned])
      expect(Exit.isSuccess(importExit) || String(importExit.cause)).toBe(true)
      expect(assignment).toBe("ok")
      expect(await operatorsOfPractices()).toEqual([
        ["P1", anna.id],
        ["P2", anna.id],
      ])
    })

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
