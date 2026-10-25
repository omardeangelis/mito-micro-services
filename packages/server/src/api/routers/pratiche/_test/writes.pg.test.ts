import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { createTestCaller, rejectionOf } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgDb, resetDb } from "@/test/pg"

// Le scritture di `pratiche` su postgres-js, come in produzione: le risposte
// di `updatePraticaFromDashboard` e `updateCustomerPreview`, e il rollback di
// `createPratica` quando un passo fallisce dentro la transazione

/** Tutte le righe dei clienti, per confrontare prima e dopo. */
const allCustomers = () =>
  pgDb.select().from(customers).orderBy(asc(customers.id))

/** Tutte le righe delle pratiche, per confrontare prima e dopo. */
const allPractices = () =>
  pgDb.select().from(practices).orderBy(asc(practices.id))

async function seed() {
  const operator = await createOperator()
  const firstCustomer = await createCustomer({
    name: "Prima",
    operatorId: operator.id,
  })
  const secondCustomer = await createCustomer({
    name: "Seconda",
    operatorId: operator.id,
  })
  const firstPractice = await createPractice({ customerId: firstCustomer.id })
  const secondPractice = await createPractice({ customerId: secondCustomer.id })
  return {
    operator,
    firstCustomer,
    secondCustomer,
    firstPractice,
    secondPractice,
  }
}

describe.skipIf(!hasTestDatabase)(
  "scritture di pratiche su postgres-js",
  () => {
    beforeAll(async () => {
      await migrateUpTo()
    })

    beforeEach(async () => {
      await resetDb()
    })

    describe("senza id", () => {
      it("`updatePraticaFromDashboard` senza `id` risponde `BAD_REQUEST` e non cambia nessuna pratica", async () => {
        const { operator } = await seed()
        const before = await allPractices()

        const error = await rejectionOf(
          createTestCaller(operator).pratiche.updatePraticaFromDashboard({
            state: "Rifiutata",
          } as never)
        )

        expect(error).toMatchObject({ code: "BAD_REQUEST" })
        expect(await allPractices()).toEqual(before)
      })

      it("`updateCustomerPreview` senza `id` risponde `BAD_REQUEST` e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const error = await rejectionOf(
          createTestCaller(operator).pratiche.updateCustomerPreview({
            email: "nuova@test.local",
          } as never)
        )

        expect(error).toMatchObject({ code: "BAD_REQUEST" })
        expect(await allCustomers()).toEqual(before)
      })
    })

    describe("con id", () => {
      it("`updatePraticaFromDashboard` risponde con `[{ id }]` anche su postgres-js e cambia solo quella pratica", async () => {
        const { operator, firstPractice, secondPractice } = await seed()

        const result = await createTestCaller(
          operator
        ).pratiche.updatePraticaFromDashboard({
          id: firstPractice.id,
          state: "Rifiutata",
        })

        expect(result).toEqual([{ id: firstPractice.id }])
        const after = await allPractices()
        const updated = after.find((row) => row.id === firstPractice.id)!
        expect({ ...updated, updatedAt: firstPractice.updatedAt }).toEqual({
          ...firstPractice,
          state: "Rifiutata",
        })
        expect(updated.updatedAt.getTime()).toBeGreaterThan(
          firstPractice.updatedAt.getTime()
        )
        expect(after.find((row) => row.id === secondPractice.id)).toEqual(
          secondPractice
        )
      })

      it("`updateCustomerPreview` risponde `undefined` e cambia solo quel cliente", async () => {
        const { operator, firstCustomer, secondCustomer } = await seed()

        const result = await createTestCaller(
          operator
        ).pratiche.updateCustomerPreview({
          id: firstCustomer.id,
          email: "nuova@test.local",
        })

        expect(result).toBeUndefined()
        const after = await allCustomers()
        const updated = after.find((row) => row.id === firstCustomer.id)!
        expect({ ...updated, updatedAt: firstCustomer.updatedAt }).toEqual({
          ...firstCustomer,
          email: "nuova@test.local",
        })
        expect(updated.updatedAt?.getTime()).toBeGreaterThan(
          firstCustomer.updatedAt?.getTime() ?? 0
        )
        expect(after.find((row) => row.id === secondCustomer.id)).toEqual(
          secondCustomer
        )
      })
    })

    describe("con un id che non esiste", () => {
      it("`updatePraticaFromDashboard` risponde con un elenco vuoto, senza errore, e non cambia nessuna pratica", async () => {
        const { operator } = await seed()
        const before = await allPractices()

        const result = await createTestCaller(
          operator
        ).pratiche.updatePraticaFromDashboard({
          id: 999_999,
          state: "Rifiutata",
        })

        expect(result).toEqual([])
        expect(await allPractices()).toEqual(before)
      })

      it("`updateCustomerPreview` risponde `undefined`, senza errore, e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const result = await createTestCaller(
          operator
        ).pratiche.updateCustomerPreview({
          id: "id-inesistente",
          email: "nuova@test.local",
        })

        expect(result).toBeUndefined()
        expect(await allCustomers()).toEqual(before)
      })
    })

    describe("createPratica", () => {
      it("con un cliente collegato che esiste già annulla tutto: nessuna pratica, nessun cliente, nessun collegamento in più", async () => {
        const { operator, firstCustomer, secondCustomer } = await seed()
        const before = {
          practices: await allPractices(),
          customers: await allCustomers(),
          links: await pgDb.select().from(customerToPratica),
        }

        const error = await rejectionOf(
          createTestCaller(operator).pratiche.createPratica({
            pratica: {
              praticaId: "PR-nuova",
              importoFinanziato: "10000",
              importoErogato: "10000",
              rateTotali: 60,
              importoRata: "200",
              ratePagate: 0,
              dataLiquidazione: new Date("2026-01-15T00:00:00.000Z"),
              state: "Liquidata",
            },
            customerId: firstCustomer.id,
            relatedCustomers: [
              {
                id: "rel-nuovo",
                tempID: "temp-rel-nuovo",
                uniqueHash: "hash-rel-nuovo",
                source: "spontaneo",
                role: "Garante",
              },
              {
                id: secondCustomer.id,
                tempID: "temp-rel-esistente",
                uniqueHash: "hash-rel-esistente",
                source: "spontaneo",
                role: "Coobbligato",
              },
            ],
          })
        )

        expect(error).toMatchObject({
          code: "CONFLICT",
          cause: { code: "CUSTOMER_EXISTS" },
        })
        expect(await allPractices()).toEqual(before.practices)
        expect(await allCustomers()).toEqual(before.customers)
        expect(await pgDb.select().from(customerToPratica)).toEqual(
          before.links
        )
      })
    })
  }
)
