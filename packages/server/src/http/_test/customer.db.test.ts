import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  CustomerAssignmentForbidden,
  CustomerNotFound,
  HandoverSameOperator,
  isApiError,
  NotAdmin,
  OperatorNotFound,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { customers } from "@mito/db/schema/customers"
import { task } from "@mito/db/schema/task"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createCustomer,
  createOperator,
  createPractice,
  createTask,
} from "@/test/factories"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

/** The session the backend read for the request: `userId`'s, or none */
const sessionOf = (userId: string | null) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed(
        userId === null
          ? null
          : { user: { id: userId }, expires: "2099-01-01T00:00:00.000Z" }
      ),
  })

/** The client of the group `customer`, on the real handlers and the test database */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["customer"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

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

describe("le letture del gruppo customer", () => {
  it.effect(
    "GET /customer/:id dà la riga del cliente, con le date come Date",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({
            fiscalCode: "RSSMRA80A01H501U",
            birthdayDate: new Date("1980-01-01T00:00:00.000Z"),
            reddito: "32000.50",
            operatorId: operator.id,
          })
        )
        const api = yield* clientAs(operator.userId)

        const read = yield* api.customer.getCustomerById({
          params: { id: customer.id },
        })

        assert.deepStrictEqual(read, customer)
        assert.instanceOf(read?.birthdayDate, Date)
        assert.strictEqual(read?.reddito, "32000.50")
      })
  )

  it.effect("GET /customer/:id di un cliente che non c'è è null", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const read = yield* api.customer.getCustomerById({
        params: { id: "nessuno" },
      })

      assert.isNull(read)
    })
  )

  it.effect(
    "GET /customer/by-code cerca i codici tolti gli spazi, e senza codici non parte",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({ fiscalCode: "RSSMRA80A01H501U" })
        )
        yield* given(() => createCustomer({ fiscalCode: "VRDLGI80A01H501U" }))
        const api = yield* clientAs(operator.userId)

        const found = yield* api.customer.getCustomersByFiscalCodeOrVatCode({
          query: { fiscalCode: "  RSSMRA80A01H501U " },
        })
        const none = yield* Effect.flip(
          api.customer.getCustomersByFiscalCodeOrVatCode({ query: {} })
        )

        assert.deepStrictEqual(
          found.map(({ id }) => id),
          [customer.id]
        )
        assert.isFalse(isApiError(none))
      })
  )

  it.effect(
    "GET /customer/:id/practices e /customer/by-practice/:id legano cliente e pratica con il ruolo",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() =>
          createOperator({ name: "Ada", surname: "Lovelace" })
        )
        const customer = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const practice = yield* given(() =>
          createPractice({ customerId: customer.id, productId: "CQ" })
        )
        const api = yield* clientAs(operator.userId)

        const practices = yield* api.customer.getAllPraticaByCustomer({
          params: { id: customer.id },
        })
        const ofPractice = yield* api.customer.getAllCustomerForPratica({
          params: { id: practice.praticaId },
        })

        assert.deepStrictEqual(practices, [
          {
            id: practice.id,
            praticaId: practice.praticaId,
            productId: "CQ",
            state: "Liquidata",
            dataLiquidazione: practice.dataLiquidazione,
            customerRole: "Intestatario",
          },
        ])
        assert.strictEqual(ofPractice.length, 1)
        assert.strictEqual(ofPractice[0]?.id, customer.id)
        assert.strictEqual(ofPractice[0]?.operatorName, "Ada")
        assert.strictEqual(ofPractice[0]?.customerRole, "Intestatario")
      })
  )

  it.effect(
    "GET /customer/under-review dà i clienti in revisione, anche senza operatore",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const review = yield* given(() =>
          createCustomer({ blackListStatus: "review" })
        )
        yield* given(() => createCustomer())
        yield* given(() => createPractice({ customerId: review.id }))
        const api = yield* clientAs(operator.userId)

        const { customers: rows } = yield* api.customer.getCustomerUnderReview({
          query: { page: 1, perPage: 20 },
        })

        assert.strictEqual(rows.length, 1)
        assert.strictEqual(rows[0]?.id, review.id)
        assert.isNull(rows[0]?.operatore)
        assert.strictEqual(rows[0]?.signedPractices, 1)
      })
  )

  it.effect(
    "GET /customer/under-review dà una pagina alla volta, col totale e quanti sono in blacklist",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const dates = ["2026-10-01", "2026-10-02", "2026-10-03"]
        const [first, second, third] = yield* given(() =>
          Promise.all(
            dates.map((date, index) =>
              createCustomer({
                blackListStatus: index === 2 ? "blacklisted" : "review",
                updatedAt: new Date(`${date}T10:00:00.000Z`),
              })
            )
          )
        )
        yield* given(() => createCustomer())
        const api = yield* clientAs(operator.userId)

        const one = yield* api.customer.getCustomerUnderReview({
          query: { page: 1, perPage: 2 },
        })
        const two = yield* api.customer.getCustomerUnderReview({
          query: { page: 2, perPage: 2 },
        })

        assert.deepStrictEqual(
          one.customers.map((customer) => customer.id),
          [first?.id, second?.id]
        )
        assert.deepStrictEqual(
          two.customers.map((customer) => customer.id),
          [third?.id]
        )
        assert.strictEqual(one.total, 3)
        assert.strictEqual(one.blacklisted, 1)
        assert.strictEqual(two.total, 3)
        assert.strictEqual(two.blacklisted, 1)
      })
  )

  it.effect("GET /customer/options/* danno le voci dei filtri", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      yield* given(() =>
        createCustomer({
          comune: "Roma",
          sede: "Nord",
          ambitoLavorativo: "Pubblico",
          occupazione: "Docente",
          fileName: "clienti.xlsx",
        })
      )
      const api = yield* clientAs(operator.userId)

      const comuni = yield* api.customer.getAllAvailableComune()
      const sedi = yield* api.customer.getAllAvaliableSede()
      const ambiti = yield* api.customer.getAllAvailableAmbito()
      const jobs = yield* api.customer.getAllAvailableJobs()
      const files = yield* api.customer.getAllFileName({
        query: { table: "customers" },
      })
      const practiceFiles = yield* api.customer.getAllFileName({
        query: { table: "practices" },
      })

      assert.deepStrictEqual(comuni, [{ comune: "Roma" }])
      assert.deepStrictEqual(sedi, [{ sede: "Nord" }])
      assert.deepStrictEqual(ambiti, [{ ambito: "Pubblico" }])
      assert.deepStrictEqual(jobs, [{ job: "Docente" }])
      assert.deepStrictEqual(files, [{ fileName: "clienti.xlsx" }])
      assert.deepStrictEqual(practiceFiles, [])
    })
  )

  it.effect(
    "POST /customer/search cerca per codice fiscale se non dice altro, e onlyMe è l'operatore della sessione",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const other = yield* given(() => createOperator())
        const mine = yield* given(() =>
          createCustomer({
            fiscalCode: "RSSMRA80A01H501U",
            operatorId: operator.id,
          })
        )
        yield* given(() =>
          createCustomer({
            fiscalCode: "RSSMRA80A01H501X",
            operatorId: other.id,
          })
        )
        const api = yield* clientAs(operator.userId)

        const byCode = yield* api.customer.getAllCustomers({
          payload: { page: 1, perPage: 10, q: "RSSMRA80" },
        })
        const onlyMe = yield* api.customer.getAllCustomers({
          payload: { page: 1, perPage: 10, onlyMe: true },
        })

        assert.strictEqual(byCode.total, 2)
        assert.deepStrictEqual(
          onlyMe.allCustomers.map(({ id }) => id),
          [mine.id]
        )
        assert.strictEqual(onlyMe.total, 1)
        assert.strictEqual(onlyMe.allCustomers[0]?.operatore?.id, operator.id)
        assert.instanceOf(onlyMe.allCustomers[0]?.createdAt, Date)
      })
  )

  it.effect("senza sessione è Unauthorized (401)", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(
        api.customer.getCustomerUnderReview({
          query: { page: 1, perPage: 20 },
        })
      )

      assert.instanceOf(error, Unauthorized)
    })
  )
})

describe("le scritture del gruppo customer", () => {
  it.effect(
    "POST /customer crea il cliente con l'operatore della sessione",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const api = yield* clientAs(operator.userId)

        const created = yield* api.customer.insertCustomer({
          payload: {
            id: "nuovo-cliente",
            name: "Grace",
            surname: "Hopper",
            fiscalCode: "HPPGRC06A01H501U",
            tempID: "temp-nuovo",
            uniqueHash: "hash-nuovo",
            source: "spontaneo",
          },
        })

        assert.deepStrictEqual(created, [{ id: "nuovo-cliente" }])
        const row = yield* customerRow("nuovo-cliente")
        assert.strictEqual(row.operatorId, operator.id)
        assert.strictEqual(row.name, "Grace")
      })
  )

  it.effect(
    "POST /customer rifiuta un codice fiscale oltre i 16 caratteri",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const api = yield* clientAs(operator.userId)

        const error = yield* Effect.flip(
          api.customer.insertCustomer({
            payload: {
              id: "troppo-lungo",
              fiscalCode: "X".repeat(17),
              tempID: "temp-lungo",
              uniqueHash: "hash-lungo",
              source: "spontaneo",
            },
          })
        )

        assert.isFalse(isApiError(error))
        const rows = yield* given(() => testDb.select().from(customers))
        assert.deepStrictEqual(rows, [])
      })
  )

  it.effect(
    "PATCH /customer/:id salva l'anagrafica, POST blacklist-status e mark-updated scrivono il cliente",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({
            operatorId: operator.id,
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          })
        )
        const api = yield* clientAs(operator.userId)

        const saved = yield* api.customer.updateCustomerFromDashboard({
          params: { id: customer.id },
          payload: { name: "Grace", comune: "Torino", source: "digital" },
        })
        yield* api.customer.handleCustomerBlackList({
          params: { id: customer.id },
          payload: { blackListStatus: "blacklisted" },
        })
        yield* given(() =>
          testDb
            .update(customers)
            .set({ updatedAt: new Date("2026-01-01T00:00:00.000Z") })
            .where(eq(customers.id, customer.id))
        )
        yield* api.customer.updateLastEdit({ params: { id: customer.id } })

        assert.deepStrictEqual(saved, [{ id: customer.id }])
        const row = yield* customerRow(customer.id)
        assert.strictEqual(row.name, "Grace")
        assert.strictEqual(row.comune, "Torino")
        assert.strictEqual(row.source, "digital")
        assert.strictEqual(row.blackListStatus, "blacklisted")
        assert.strictEqual(row.operatorId, operator.id)
        assert.isAbove(
          row.updatedAt.getTime(),
          new Date("2026-01-01T00:00:00.000Z").getTime()
        )
      })
  )

  it.effect(
    "POST /customer/:id/handover passa cliente e contatto attivo all'operatore",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const colleague = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const contact = yield* given(() =>
          createTask({ customerId: customer.id, operatorId: operator.id })
        )
        const api = yield* clientAs(operator.userId)

        const moved = yield* api.customer.handover({
          params: { id: customer.id },
          payload: { toOperatorId: colleague.id },
        })

        assert.deepStrictEqual(moved, { contactMoved: true })
        const row = yield* customerRow(customer.id)
        assert.strictEqual(row.operatorId, colleague.id)
        const [moveContact] = yield* given(() =>
          testDb.select().from(task).where(eq(task.id, contact.id))
        )
        assert.strictEqual(moveContact?.operatorId, colleague.id)
      })
  )

  it.effect(
    "POST /customer/:id/handover dà gli errori del servizio nelle classi del contratto",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const colleague = yield* given(() => createOperator())
        const disabled = yield* given(() =>
          createOperator({ disabledAt: new Date() })
        )
        const mine = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const theirs = yield* given(() =>
          createCustomer({ operatorId: colleague.id })
        )
        const api = yield* clientAs(operator.userId)
        const handover = (id: string, toOperatorId: number) =>
          Effect.flip(
            api.customer.handover({ params: { id }, payload: { toOperatorId } })
          )

        assert.instanceOf(
          yield* handover("nessuno", colleague.id),
          CustomerNotFound
        )
        assert.instanceOf(
          yield* handover(theirs.id, operator.id),
          CustomerAssignmentForbidden
        )
        assert.instanceOf(
          yield* handover(mine.id, disabled.id),
          OperatorNotFound
        )
        assert.instanceOf(
          yield* handover(mine.id, operator.id),
          HandoverSameOperator
        )
        const row = yield* customerRow(mine.id)
        assert.strictEqual(row.operatorId, operator.id)
      })
  )

  it.effect(
    "POST /customer/:id/assign-to-yourself prende un cliente senza operatore, non quello di un collega",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const colleague = yield* given(() => createOperator())
        const free = yield* given(() => createCustomer())
        const theirs = yield* given(() =>
          createCustomer({ operatorId: colleague.id })
        )
        const api = yield* clientAs(operator.userId)

        yield* api.customer.assignToYourself({ params: { id: free.id } })
        const error = yield* Effect.flip(
          api.customer.assignToYourself({ params: { id: theirs.id } })
        )

        assert.strictEqual(
          (yield* customerRow(free.id)).operatorId,
          operator.id
        )
        assert.instanceOf(error, CustomerAssignmentForbidden)
        assert.strictEqual(
          (yield* customerRow(theirs.id)).operatorId,
          colleague.id
        )
      })
  )

  it.effect(
    "POST /customer/bulk-assign è dell'admin: un operatore è NotAdmin e non sposta niente",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const operator = yield* given(() => createOperator())
        const first = yield* given(() => createCustomer())
        const second = yield* given(() =>
          createCustomer({ operatorId: admin.id })
        )
        const payload = {
          operatorId: operator.id,
          customerIds: [first.id, second.id],
        }

        const asOperator = yield* clientAs(operator.userId)
        const error = yield* Effect.flip(
          asOperator.customer.bulkUpdateCustomers({ payload })
        )
        assert.instanceOf(error, NotAdmin)
        assert.isNull((yield* customerRow(first.id)).operatorId)

        const asAdmin = yield* clientAs(admin.userId)
        yield* asAdmin.customer.bulkUpdateCustomers({ payload })
        assert.strictEqual(
          (yield* customerRow(first.id)).operatorId,
          operator.id
        )
        assert.strictEqual(
          (yield* customerRow(second.id)).operatorId,
          operator.id
        )
      })
  )

  it.effect("POST /customer/bulk-assign senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(
        api.customer.bulkUpdateCustomers({
          payload: { operatorId: 1, customerIds: [] },
        })
      )

      assert.instanceOf(error, Unauthorized)
    })
  )
})
