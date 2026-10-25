import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { createTestCaller, rejectionOf } from "@/test/caller"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgDb, resetDb } from "@/test/pg"

// Caratterizzazione, su postgres-js come in produzione, delle due scritture di
// `pratiche` che passano `input.id!` al `where` (updatePraticaFromDashboard e
// updateCustomerPreview), prima del refactor verso Effect. Lo schema lascia
// `id` opzionale: senza `id` il driver rifiuta il parametro `undefined`, e la
// risposta di `updateCustomerPreview` è il risultato grezzo del driver
// (`RowList`): per questo il file gira su postgres-js, non su PGlite

/** Il messaggio che il driver dà al parametro `undefined`, tale e quale. */
const UNDEFINED_VALUE = "UNDEFINED_VALUE: Undefined values are not allowed"

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
      it("su postgres-js, `updatePraticaFromDashboard` senza `id` risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver e non cambia nessuna pratica", async () => {
        const { operator } = await seed()
        const before = await allPractices()

        const error = await rejectionOf(
          createTestCaller(operator).pratiche.updatePraticaFromDashboard({
            state: "Rifiutata",
          })
        )

        expect(error).toMatchObject({
          code: "INTERNAL_SERVER_ERROR",
          message: UNDEFINED_VALUE,
        })
        expect(await allPractices()).toEqual(before)
      })

      it("su postgres-js, `updateCustomerPreview` senza `id` risponde `INTERNAL_SERVER_ERROR` con il messaggio del driver e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const error = await rejectionOf(
          createTestCaller(operator).pratiche.updateCustomerPreview({
            email: "nuova@test.local",
          })
        )

        expect(error).toMatchObject({
          code: "INTERNAL_SERVER_ERROR",
          message: UNDEFINED_VALUE,
        })
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

      it("`updateCustomerPreview` risponde con il risultato del driver, un elenco vuoto con `count` 1 e `command` UPDATE, e cambia solo quel cliente", async () => {
        const { operator, firstCustomer, secondCustomer } = await seed()

        const result = await createTestCaller(
          operator
        ).pratiche.updateCustomerPreview({
          id: firstCustomer.id,
          email: "nuova@test.local",
        })

        // Senza `returning` il driver non restituisce righe: l'elenco è
        // vuoto, ma è un `RowList` che porta `count` e `command`
        expect(result).toEqual([])
        expect(result).toMatchObject({ count: 1, command: "UPDATE" })
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

      it("`updateCustomerPreview` risponde con un `RowList` vuoto con `count` 0, senza errore, e non cambia nessun cliente", async () => {
        const { operator } = await seed()
        const before = await allCustomers()

        const result = await createTestCaller(
          operator
        ).pratiche.updateCustomerPreview({
          id: "id-inesistente",
          email: "nuova@test.local",
        })

        expect(result).toEqual([])
        expect(result).toMatchObject({ count: 0, command: "UPDATE" })
        expect(await allCustomers()).toEqual(before)
      })
    })
  }
)
