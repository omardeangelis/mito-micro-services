import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { createTestCaller, rejectionOf } from "@/test/caller"
import { createCustomer, createOperator } from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgDb, resetDb } from "@/test/pg"

// Caratterizzazione, su postgres-js come in produzione, delle tre scritture
// di `customer` che prendono `id` opzionale dallo schema e lo usano come
// `input.id!` (updateCustomerFromDashboard, handleCustomerBlackList,
// updateLastEdit): oggi senza `id` il driver rifiuta il parametro `undefined`
// e la procedura risponde INTERNAL_SERVER_ERROR (AC10). Pinna il comportamento
// di oggi, prima del refactor.

// Il messaggio di postgres-js (UNDEFINED_VALUE) per un parametro `undefined`
const UNDEFINED_VALUE_MESSAGE =
  "UNDEFINED_VALUE: Undefined values are not allowed"

/** Tutte le righe dei clienti, per confrontare prima e dopo. */
const allCustomers = () =>
  pgDb.select().from(customers).orderBy(asc(customers.id))

async function seed() {
  const operator = await createOperator()
  const first = await createCustomer({ name: "Prima", operatorId: operator.id })
  const second = await createCustomer({
    name: "Seconda",
    operatorId: operator.id,
  })
  return { operator, first, second }
}

describe.skipIf(!hasTestDatabase)(
  "scritture di customer su postgres-js",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    describe("senza id", () => {
      it("su postgres-js, `updateLastEdit` senza `id` risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const error = await rejectionOf(
          createTestCaller(operator).customer.updateLastEdit({})
        )

        expect(error).toMatchObject({
          code: "INTERNAL_SERVER_ERROR",
          message: UNDEFINED_VALUE_MESSAGE,
          cause: { code: "UNDEFINED_VALUE" },
        })
        expect(await allCustomers()).toEqual(before)
      })

      it("su postgres-js, `handleCustomerBlackList` senza `id` risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const error = await rejectionOf(
          createTestCaller(operator).customer.handleCustomerBlackList({
            blackListStatus: "blacklisted",
          })
        )

        expect(error).toMatchObject({
          code: "INTERNAL_SERVER_ERROR",
          message: UNDEFINED_VALUE_MESSAGE,
          cause: { code: "UNDEFINED_VALUE" },
        })
        expect(await allCustomers()).toEqual(before)
      })

      it("su postgres-js, `updateCustomerFromDashboard` senza `id` risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const error = await rejectionOf(
          createTestCaller(operator).customer.updateCustomerFromDashboard({
            name: "Cambiato",
            source: "inbound",
          })
        )

        expect(error).toMatchObject({
          code: "INTERNAL_SERVER_ERROR",
          message: UNDEFINED_VALUE_MESSAGE,
          cause: { code: "UNDEFINED_VALUE" },
        })
        expect(await allCustomers()).toEqual(before)
      })
    })

    describe("con id", () => {
      it("`handleCustomerBlackList` risponde con la RowList del driver (array vuoto, `count` 1, `command` UPDATE) e cambia solo quel cliente", async () => {
        const { operator, first, second } = await seed()

        const result = await createTestCaller(
          operator
        ).customer.handleCustomerBlackList({
          id: first.id,
          blackListStatus: "blacklisted",
        })

        expect(result).toEqual([])
        // `count` e `command` non sono enumerabili: toEqual non li vede
        expect((result as unknown as { count: number }).count).toBe(1)
        expect((result as unknown as { command: string }).command).toBe(
          "UPDATE"
        )
        const after = await allCustomers()
        const updated = after.find((row) => row.id === first.id)!
        expect({ ...updated, updatedAt: first.updatedAt }).toEqual({
          ...first,
          blackListStatus: "blacklisted",
        })
        expect(updated.updatedAt?.getTime()).toBeGreaterThan(
          first.updatedAt?.getTime() ?? 0
        )
        expect(after.find((row) => row.id === second.id)).toEqual(second)
      })

      it("`updateLastEdit` risponde con la RowList del driver (array vuoto, `count` 1, `command` UPDATE) e aggiorna solo `updatedAt` di quel cliente", async () => {
        const { operator, first, second } = await seed()

        const result = await createTestCaller(operator).customer.updateLastEdit(
          { id: first.id }
        )

        expect(result).toEqual([])
        expect((result as unknown as { count: number }).count).toBe(1)
        expect((result as unknown as { command: string }).command).toBe(
          "UPDATE"
        )
        const after = await allCustomers()
        const updated = after.find((row) => row.id === first.id)!
        expect({ ...updated, updatedAt: first.updatedAt }).toEqual(first)
        expect(updated.updatedAt?.getTime()).toBeGreaterThan(
          first.updatedAt?.getTime() ?? 0
        )
        expect(after.find((row) => row.id === second.id)).toEqual(second)
      })

      it("`updateCustomerFromDashboard` risponde con `[{ id }]` e scrive i campi passati di quel cliente (le colonne lasciate fuori le fissa `writes.db.test.ts`, che parte da righe senza `null`)", async () => {
        const { operator, first, second } = await seed()

        const result = await createTestCaller(
          operator
        ).customer.updateCustomerFromDashboard({
          id: first.id,
          name: "Cambiato",
          source: "digital",
        })

        expect(result).toEqual([{ id: first.id }])
        const after = await allCustomers()
        const updated = after.find((row) => row.id === first.id)!
        expect({ ...updated, updatedAt: first.updatedAt }).toEqual({
          ...first,
          name: "Cambiato",
          source: "digital",
        })
        expect(updated.updatedAt?.getTime()).toBeGreaterThan(
          first.updatedAt?.getTime() ?? 0
        )
        expect(after.find((row) => row.id === second.id)).toEqual(second)
      })
    })

    describe("con un id che non esiste", () => {
      it("`handleCustomerBlackList` risponde senza errore con la RowList del driver (array vuoto, `count` 0, `command` UPDATE) e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const result = await createTestCaller(
          operator
        ).customer.handleCustomerBlackList({
          id: "id-inesistente",
          blackListStatus: "blacklisted",
        })

        expect(result).toEqual([])
        expect((result as unknown as { count: number }).count).toBe(0)
        expect((result as unknown as { command: string }).command).toBe(
          "UPDATE"
        )
        expect(await allCustomers()).toEqual(before)
      })

      it("`updateLastEdit` risponde senza errore con la RowList del driver (array vuoto, `count` 0, `command` UPDATE) e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const result = await createTestCaller(operator).customer.updateLastEdit(
          { id: "id-inesistente" }
        )

        expect(result).toEqual([])
        expect((result as unknown as { count: number }).count).toBe(0)
        expect((result as unknown as { command: string }).command).toBe(
          "UPDATE"
        )
        expect(await allCustomers()).toEqual(before)
      })
    })
  }
)
