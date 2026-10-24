import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { createTestCaller } from "@/test/caller"
import { createCustomer, createOperator } from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgDb, resetDb } from "@/test/pg"

// Caratterizzazione, su postgres-js come in produzione, delle tre scritture
// di `customer` che prendono un `id` (updateCustomerFromDashboard,
// handleCustomerBlackList, updateLastEdit). Senza `id` lo schema le rifiuta
// prima del driver (TD8 f): lo prova `writes.db.test.ts`

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

    describe("con id", () => {
      it("`handleCustomerBlackList` non restituisce niente (TD8 h) e cambia solo quel cliente", async () => {
        const { operator, first, second } = await seed()

        const result = await createTestCaller(
          operator
        ).customer.handleCustomerBlackList({
          id: first.id,
          blackListStatus: "blacklisted",
        })

        expect(result).toBeUndefined()
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

      it("`updateLastEdit` non restituisce niente (TD8 h) e aggiorna solo `updatedAt` di quel cliente", async () => {
        const { operator, first, second } = await seed()

        const result = await createTestCaller(operator).customer.updateLastEdit(
          { id: first.id }
        )

        expect(result).toBeUndefined()
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
      it("`handleCustomerBlackList` risponde senza errore e senza dati e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const result = await createTestCaller(
          operator
        ).customer.handleCustomerBlackList({
          id: "id-inesistente",
          blackListStatus: "blacklisted",
        })

        expect(result).toBeUndefined()
        expect(await allCustomers()).toEqual(before)
      })

      it("`updateLastEdit` risponde senza errore e senza dati e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const result = await createTestCaller(operator).customer.updateLastEdit(
          { id: "id-inesistente" }
        )

        expect(result).toBeUndefined()
        expect(await allCustomers()).toEqual(before)
      })
    })
  }
)
