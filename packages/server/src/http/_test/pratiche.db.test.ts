import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import { isApiError, PracticeNotFound } from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createPractice,
} from "@/test/factories"
import { listPractices } from "../../services/practice/list"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// The endpoints of the pages Pratiche: the list, the detail, its state and
// the contacts of its customers, on the real handlers and database

/** The session the backend read for the request: `userId`'s */
const sessionOf = (userId: string) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed({
        user: { id: userId },
        expires: "2099-01-01T00:00:00.000Z",
      }),
  })

/** The client of the group `pratiche`, on the real handlers */
const clientAs = (userId: string) =>
  HttpApiTest.groups(MitoApi, ["pratiche"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

const practiceRow = (praticaId: string) =>
  given(() =>
    testDb
      .select()
      .from(practices)
      .where(eq(practices.praticaId, praticaId))
      .then(([row]) => row!)
  )

const customerRow = (id: string) =>
  given(() =>
    testDb
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .then(([row]) => row!)
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("POST /api/v1/pratiche/search", () => {
  it.effect(
    "senza ordine e ricerca dà la pagina della procedura, con i suoi default",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() =>
          createOperator({ name: "Ada", surname: "Lovelace" })
        )
        const customer = yield* given(() => createCustomer())
        yield* given(() =>
          createPractice({
            customerId: customer.id,
            importoFinanziato: "12000.50",
            operatorId: operator.id,
            updatedAt: new Date("2026-10-02T08:00:00.000Z"),
          })
        )
        yield* given(() =>
          createPractice({
            customerId: customer.id,
            state: "Chiusa",
            updatedAt: new Date("2026-10-01T08:00:00.000Z"),
          })
        )
        const api = yield* clientAs(operator.userId)

        const page = yield* api.pratiche.getAllPratiche({
          payload: { page: 1, perPage: 30 },
        })
        const procedure = yield* listPractices(
          {
            page: 1,
            perPage: 30,
            orderBy: "updatedAt",
            sortedBy: "asc",
            searchBy: "praticaId",
          },
          { id: operator.id, role: "OPERATORE" }
        ).pipe(provideServer)

        assert.deepStrictEqual(page, procedure)
        assert.deepStrictEqual(page.total, [{ total: 2 }])
        // The oldest update first, as `sortedBy` "asc"
        assert.deepStrictEqual(
          page.data.map(({ stato }) => stato),
          ["Chiusa", "Liquidata"]
        )
        // A decimal is its digits, as the driver reads it
        assert.strictEqual(page.data[1]!.importoFinanziato, "12000.50")
        assert.strictEqual(page.data[1]!.operatore, "Ada")
      })
  )

  it.effect(
    "filtra, cerca e ordina come la procedura, e 'solo i miei' vale per un operatore",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const mine = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const other = yield* given(() => createCustomer())
        const found = yield* given(() =>
          createPractice({ customerId: mine.id, praticaId: "AB-100" })
        )
        yield* given(() =>
          createPractice({ customerId: other.id, praticaId: "AB-200" })
        )
        yield* given(() =>
          createPractice({
            customerId: mine.id,
            praticaId: "AB-300",
            state: "Chiusa",
          })
        )
        const api = yield* clientAs(operator.userId)

        const page = yield* api.pratiche.getAllPratiche({
          payload: {
            page: 1,
            perPage: 30,
            orderBy: "praticaId",
            sortedBy: "desc",
            q: "ab-",
            filterBy: { state: "Liquidata", onlyMe: true },
          },
        })

        assert.deepStrictEqual(page.total, [{ total: 1 }])
        assert.deepStrictEqual(
          page.data.map(({ praticaId }) => praticaId),
          [found.praticaId]
        )
      })
  )

  it.effect("una pagina che non è un intero non parte", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.pratiche.getAllPratiche({ payload: { page: 1.5, perPage: 30 } })
      )

      assert.isFalse(isApiError(error))
    })
  )
})

describe("GET /api/v1/pratiche/by-pratica-id/:id", () => {
  it.effect("dà la pratica con il suo operatore, anche senza", () =>
    Effect.gen(function* () {
      const operator = yield* given(() =>
        createOperator({ name: "Ada", surname: "Lovelace" })
      )
      const customer = yield* given(() => createCustomer())
      const practice = yield* given(() =>
        createPractice({
          customerId: customer.id,
          praticaId: "AB/1 x",
          importoRata: "210.40",
          desPuntoVendita: "Roma",
          operatorId: operator.id,
        })
      )
      const without = yield* given(() =>
        createPractice({ customerId: customer.id })
      )
      const api = yield* clientAs(operator.userId)

      const read = yield* api.pratiche.getPraticaById({
        params: { id: practice.praticaId },
      })
      const orphan = yield* api.pratiche.getPraticaById({
        params: { id: without.praticaId },
      })

      assert.deepStrictEqual(read, {
        id: practice.id,
        praticaId: "AB/1 x",
        productId: null,
        state: "Liquidata",
        importoFinanziato: "10000",
        importoErogato: "10000",
        dataLiquidazione: new Date("2026-01-15T00:00:00.000Z"),
        importoRata: "210.40",
        rateTotali: 60,
        ratePagate: 0,
        chatId: null,
        updatedAt: practice.updatedAt,
        desPuntoVendita: "Roma",
        operator: { id: operator.id, name: "Ada", surname: "Lovelace" },
      })
      assert.isNull(orphan.operator)
    })
  )

  it.effect("una pratica che non esiste è PracticeNotFound", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.pratiche.getPraticaById({ params: { id: "nessuna" } })
      )

      assert.instanceOf(error, PracticeNotFound)
    })
  )
})

describe("PATCH /api/v1/pratiche/:id/state", () => {
  it.effect("cambia lo stato e dà la pratica scritta, nessuna se non c'è", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const customer = yield* given(() => createCustomer())
      const practice = yield* given(() =>
        createPractice({ customerId: customer.id })
      )
      const api = yield* clientAs(operator.userId)

      const written = yield* api.pratiche.updatePraticaFromDashboard({
        params: { id: practice.id },
        payload: { state: "Estinta anticipata" },
      })
      const none = yield* api.pratiche.updatePraticaFromDashboard({
        params: { id: practice.id + 1000 },
        payload: { state: "Chiusa" },
      })

      assert.deepStrictEqual(written, [{ id: practice.id }])
      assert.deepStrictEqual(none, [])
      assert.strictEqual(
        (yield* practiceRow(practice.praticaId)).state,
        "Estinta anticipata"
      )
    })
  )

  it.effect("uno stato che non esiste non parte", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const customer = yield* given(() => createCustomer())
      const practice = yield* given(() =>
        createPractice({ customerId: customer.id })
      )
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.pratiche.updatePraticaFromDashboard({
          params: { id: practice.id },
          payload: { state: "Erogata" as "Chiusa" },
        })
      )

      assert.isFalse(isApiError(error))
      assert.strictEqual(
        (yield* practiceRow(practice.praticaId)).state,
        "Liquidata"
      )
    })
  )
})

describe("PATCH /api/v1/pratiche/customer-preview/:id", () => {
  it.effect("salva email e telefono del cliente, anche togliendo l'email", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const customer = yield* given(() =>
        createCustomer({ email: "vecchia@example.com", phoneNumber: "1" })
      )
      const api = yield* clientAs(operator.userId)

      yield* api.pratiche.updateCustomerPreview({
        params: { id: customer.id },
        payload: { email: "nuova@example.com", phoneNumber: "3331234567" },
      })
      const both = yield* customerRow(customer.id)
      yield* api.pratiche.updateCustomerPreview({
        params: { id: customer.id },
        payload: { email: null },
      })
      const cleared = yield* customerRow(customer.id)

      assert.strictEqual(both.email, "nuova@example.com")
      assert.strictEqual(both.phoneNumber, "3331234567")
      assert.isNull(cleared.email)
      assert.strictEqual(cleared.phoneNumber, "3331234567")
    })
  )

  it.effect(
    "senza email né telefono, o con un telefono troppo lungo, non scrive",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({ email: "a@example.com", phoneNumber: "1" })
        )
        const api = yield* clientAs(operator.userId)

        const empty = yield* Effect.flip(
          api.pratiche.updateCustomerPreview({
            params: { id: customer.id },
            payload: {},
          })
        )
        const tooLong = yield* Effect.flip(
          api.pratiche.updateCustomerPreview({
            params: { id: customer.id },
            payload: { phoneNumber: "1".repeat(21) },
          })
        )

        assert.isFalse(isApiError(empty))
        assert.isFalse(isApiError(tooLong))
        const row = yield* customerRow(customer.id)
        assert.strictEqual(row.email, "a@example.com")
        assert.strictEqual(row.phoneNumber, "1")
      })
  )
})
