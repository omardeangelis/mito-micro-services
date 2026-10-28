import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  ContactAlreadyActive,
  ContactForbidden,
  ContactNotFound,
  CustomerExists,
  CustomerMissing,
  CustomerNotFound,
  CustomerUnassigned,
  isApiError,
  PracticeExists,
} from "@mito/contract/errors"
import { type NewPratica } from "@mito/contract/pratiche"
import { inMemoryPlatform } from "@mito/contract/testing"
import { customers } from "@mito/db/schema/customers"
import { practices } from "@mito/db/schema/pratiche"
import { customerToPratica } from "@mito/db/schema/relations/customerToPratica"
import { task } from "@mito/db/schema/task"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createPractice,
  createTask,
} from "@/test/factories"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// The endpoints the detail of a customer and "Nuova pratica" call: the
// contact of the customer, its alerts, "Crea contatto", the regions and the
// new practice, on the real handlers and database

/** The session the backend read for the request: `userId`'s */
const sessionOf = (userId: string) =>
  Layer.succeed(SessionReader)({
    read: () =>
      Effect.succeed({
        user: { id: userId },
        expires: "2099-01-01T00:00:00.000Z",
      }),
  })

/** The client of the groups `task` and `pratiche`, on the real handlers */
const clientAs = (userId: string) =>
  HttpApiTest.groups(MitoApi, ["task", "pratiche"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/v1/task/by-customer/:id/active", () => {
  it.effect("dà il contatto attivo del cliente, o nessuno", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const customer = yield* given(() => createCustomer())
      const without = yield* given(() => createCustomer())
      yield* given(() =>
        createTask({ customerId: customer.id, isActive: false })
      )
      const active = yield* given(() =>
        createTask({
          customerId: customer.id,
          operatorId: operator.id,
          state: "richiamare",
        })
      )
      const api = yield* clientAs(operator.userId)

      const found = yield* api.task.getActiveTask({
        params: { id: customer.id },
      })
      const none = yield* api.task.getActiveTask({
        params: { id: without.id },
      })

      assert.deepStrictEqual(found, [active])
      assert.deepStrictEqual(none, [])
    })
  )
})

describe("GET /api/v1/task/by-customer/:id/alerts", () => {
  it.effect("dà lo Storico del cliente, con chi ha chiuso gli alert", () =>
    Effect.gen(function* () {
      const operator = yield* given(() =>
        createOperator({ name: "Ada", surname: "Lovelace" })
      )
      const customer = yield* given(() => createCustomer())
      const old = yield* given(() =>
        createTask({ customerId: customer.id, isActive: false })
      )
      const closed = yield* given(() =>
        createAlert({
          taskId: old.id,
          deadline: new Date("2026-10-01T09:00:00.000Z"),
          isResolved: true,
          resolvedBy: operator.id,
        })
      )
      const contact = yield* given(() =>
        createTask({ customerId: customer.id })
      )
      const open = yield* given(() =>
        createAlert({
          taskId: contact.id,
          deadline: new Date("2026-11-02T09:00:00.000Z"),
          message: "Richiamare",
        })
      )
      const api = yield* clientAs(operator.userId)

      const alerts = yield* api.task.getCustomerAlerts({
        params: { id: customer.id },
      })

      assert.deepStrictEqual(
        alerts.map(({ updatedAt: _, ...entry }) => entry),
        [
          {
            id: open.id,
            deadline: new Date("2026-11-02T09:00:00.000Z"),
            message: "Richiamare",
            isResolved: false,
            resolvedByName: null,
            resolvedBySurname: null,
          },
          {
            id: closed.id,
            deadline: new Date("2026-10-01T09:00:00.000Z"),
            message: null,
            isResolved: true,
            resolvedByName: "Ada",
            resolvedBySurname: "Lovelace",
          },
        ]
      )
      assert.instanceOf(alerts[0]?.updatedAt, Date)
    })
  )
})

describe("GET /api/v1/task/:id", () => {
  it.effect(
    "dà il dettaglio del contatto, con l'alert aperto e i permessi",
    () =>
      Effect.gen(function* () {
        const owner = yield* given(() =>
          createOperator({ name: "Ada", surname: "Lovelace" })
        )
        const other = yield* given(() => createOperator())
        const customer = yield* given(() =>
          createCustomer({ name: "Mario", operatorId: owner.id })
        )
        const previous = yield* given(() =>
          createTask({ customerId: customer.id, isActive: false })
        )
        const contact = yield* given(() =>
          createTask({
            customerId: customer.id,
            operatorId: owner.id,
            state: "richiamare",
          })
        )
        const open = yield* given(() =>
          createAlert({
            taskId: contact.id,
            deadline: new Date("2026-11-02T09:00:00.000Z"),
            message: "Richiamare",
          })
        )
        const asOwner = yield* clientAs(owner.userId)
        const asOther = yield* clientAs(other.userId)

        const detail = yield* asOwner.task.getContactById({
          params: { id: String(contact.id) },
        })
        const notMine = yield* asOther.task.getContactById({
          params: { id: String(contact.id) },
        })

        assert.deepStrictEqual(detail.contact, {
          id: contact.id,
          state: "richiamare",
          priority: contact.priority,
          customPriority: contact.customPriority,
          isActive: true,
          closedAt: null,
          createdAt: contact.createdAt,
          updatedAt: detail.contact.updatedAt,
          operator: { id: owner.id, name: "Ada", surname: "Lovelace" },
        })
        assert.strictEqual(detail.customer.name, "Mario")
        assert.strictEqual(detail.customer.operatorId, owner.id)
        assert.deepStrictEqual(detail.alert, {
          id: open.id,
          deadline: new Date("2026-11-02T09:00:00.000Z"),
          message: "Richiamare",
        })
        assert.deepStrictEqual(
          detail.customerContacts.map(({ id }) => id),
          [previous.id]
        )
        assert.deepStrictEqual(detail.history, [])
        assert.isNull(detail.activeTaskId)
        assert.deepStrictEqual(detail.editability, { kind: "editable" })
        assert.isFalse(detail.canReassign)
        assert.deepStrictEqual(notMine.editability, {
          kind: "not_owner",
          assignee: "Ada Lovelace",
        })
      })
  )

  it.effect("un id che non è un contatto è ContactNotFound", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      for (const id of ["999999", "abc"]) {
        const error = yield* Effect.flip(
          api.task.getContactById({ params: { id } })
        )
        assert.instanceOf(error, ContactNotFound)
      }
    })
  )
})

describe("POST /api/v1/task", () => {
  it.effect("crea il contatto in chiamare, dell'operatore del cliente", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const customer = yield* given(() =>
        createCustomer({ operatorId: operator.id })
      )
      const api = yield* clientAs(operator.userId)

      const { taskId } = yield* api.task.createContact({
        payload: { customerId: customer.id, source: "detail" },
      })

      const [created] = yield* given(() =>
        testDb.select().from(task).where(eq(task.id, taskId))
      )
      assert.strictEqual(created?.customerId, customer.id)
      assert.strictEqual(created?.operatorId, operator.id)
      assert.strictEqual(created?.state, "chiamare")
      assert.isTrue(created?.isActive)
    })
  )

  it.effect("dà gli errori del servizio nelle classi del contratto", () =>
    Effect.gen(function* () {
      const owner = yield* given(() =>
        createOperator({ name: "Ada", surname: "Lovelace" })
      )
      const other = yield* given(() => createOperator())
      const unassigned = yield* given(() => createCustomer())
      const owned = yield* given(() => createCustomer({ operatorId: owner.id }))
      const busy = yield* given(() => createCustomer({ operatorId: owner.id }))
      const active = yield* given(() =>
        createTask({ customerId: busy.id, operatorId: owner.id })
      )
      const asOwner = yield* clientAs(owner.userId)
      const asOther = yield* clientAs(other.userId)
      const create = (api: typeof asOwner, customerId: string) =>
        Effect.flip(
          api.task.createContact({ payload: { customerId, source: "list" } })
        )

      assert.instanceOf(yield* create(asOwner, "nessuno"), CustomerNotFound)
      assert.instanceOf(
        yield* create(asOwner, unassigned.id),
        CustomerUnassigned
      )
      const forbidden = yield* create(asOther, owned.id)
      assert.instanceOf(forbidden, ContactForbidden)
      assert.strictEqual(forbidden.assignee, "Ada Lovelace")
      const already = yield* create(asOwner, busy.id)
      assert.instanceOf(already, ContactAlreadyActive)
      assert.strictEqual(already.activeTaskId, active.id)
    })
  )
})

describe("GET /api/v1/pratiche/regions", () => {
  it.effect("dà le regioni delle pratiche, una volta ciascuna", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const customer = yield* given(() => createCustomer())
      for (const region of ["Lazio", "Lombardia", "Lazio"]) {
        yield* given(() => createPractice({ customerId: customer.id, region }))
      }
      const api = yield* clientAs(operator.userId)

      const regions = yield* api.pratiche.getAllAvailableRegion()

      assert.deepStrictEqual(regions, [
        { region: "Lazio" },
        { region: "Lombardia" },
      ])
    })
  )
})

describe("POST /api/v1/pratiche", () => {
  const newPratica = (customerId: string, praticaId = "P-1"): NewPratica => ({
    pratica: {
      praticaId,
      productId: "CQ",
      state: "Liquidata",
      importoFinanziato: "10000",
      importoErogato: "9500",
      dataLiquidazione: new Date("2026-10-01T00:00:00.000Z"),
      importoRata: "200",
      rateTotali: 60,
      ratePagate: 0,
      region: "Lazio",
    },
    customerId,
    relatedCustomers: [
      {
        id: "garante-1",
        name: "Luca",
        surname: "Bianchi",
        fiscalCode: "BNCLCU80A01H501U",
        email: "luca@example.com",
        tempID: "garante-1",
        uniqueHash: "garante-1",
        source: "inbound",
        role: "Garante",
      },
    ],
  })

  it.effect("crea la pratica, il garante dell'operatore e i collegamenti", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const holder = yield* given(() => createCustomer())
      const api = yield* clientAs(operator.userId)

      const created = yield* api.pratiche.createPratica({
        payload: newPratica(holder.id),
      })

      assert.deepStrictEqual(created, { praticaId: "P-1" })
      const [practice] = yield* given(() =>
        testDb.select().from(practices).where(eq(practices.praticaId, "P-1"))
      )
      assert.strictEqual(practice?.fileName, "manual")
      assert.strictEqual(practice?.region, "Lazio")
      const [garante] = yield* given(() =>
        testDb.select().from(customers).where(eq(customers.id, "garante-1"))
      )
      assert.strictEqual(garante?.operatorId, operator.id)
      const links = yield* given(() =>
        testDb
          .select({
            customerId: customerToPratica.customerId,
            customerRole: customerToPratica.customerRole,
          })
          .from(customerToPratica)
          .where(eq(customerToPratica.praticaId, "P-1"))
          .orderBy(customerToPratica.customerRole)
      )
      assert.deepStrictEqual(links, [
        { customerId: holder.id, customerRole: "Intestatario" },
        { customerId: "garante-1", customerRole: "Garante" },
      ])
    })
  )

  it.effect("dà gli errori del servizio nelle classi del contratto", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const holder = yield* given(() => createCustomer())
      yield* given(() =>
        createPractice({ customerId: holder.id, praticaId: "P-OLD" })
      )
      yield* given(() => createCustomer({ id: "garante-1" }))
      const api = yield* clientAs(operator.userId)
      const create = (payload: NewPratica) =>
        Effect.flip(api.pratiche.createPratica({ payload }))

      assert.instanceOf(
        yield* create(newPratica(holder.id, "P-OLD")),
        PracticeExists
      )
      assert.instanceOf(yield* create(newPratica(holder.id)), CustomerExists)
      const missing = yield* create({
        ...newPratica("nessuno"),
        relatedCustomers: [],
      })
      assert.instanceOf(missing, CustomerMissing)
      assert.strictEqual(missing.customerId, "nessuno")
      // Nothing was written
      const written = yield* given(() =>
        testDb.select({ praticaId: practices.praticaId }).from(practices)
      )
      assert.deepStrictEqual(written, [{ praticaId: "P-OLD" }])
    })
  )

  it.effect("un'email che zod rifiuta non parte dal client", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const holder = yield* given(() => createCustomer())
      const api = yield* clientAs(operator.userId)
      const payload = newPratica(holder.id)

      const error = yield* Effect.flip(
        api.pratiche.createPratica({
          payload: {
            ...payload,
            relatedCustomers: [
              { ...payload.relatedCustomers[0]!, email: "non-una-email" },
            ],
          },
        })
      )

      assert.isFalse(isApiError(error))
    })
  )
})
