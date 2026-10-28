import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { and, eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  CustomerMissing,
  isApiError,
  NotAdmin,
  OperatorNotFound,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { alert, task } from "@mito/db/schema/task"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
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

/** The client of the groups `operator` and `task`, on the real handlers */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["operator", "task"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

const activeContactOf = (customerId: string) =>
  given(() =>
    testDb
      .select()
      .from(task)
      .where(and(eq(task.customerId, customerId), eq(task.isActive, true)))
      .then(([row]) => row)
  )

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/v1/operator", () => {
  it.effect("dà gli operatori attivi con il ruolo, non i disattivati", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator({ name: "Ada" }))
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      yield* given(() => createOperator({ disabledAt: new Date() }))
      const api = yield* clientAs(operator.userId)

      const operators = yield* api.operator.getAllUniqueOperators()

      assert.deepStrictEqual(
        operators
          .map(({ id, role }) => ({ id, role }))
          .sort((a, b) => a.id - b.id),
        [
          { id: operator.id, role: "OPERATORE" },
          { id: admin.id, role: "ADMIN" },
        ]
      )
      const ada = operators.find(({ id }) => id === operator.id)
      assert.strictEqual(ada?.name, "Ada")
      assert.instanceOf(ada?.createdAt, Date)
    })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(api.operator.getAllUniqueOperators())

      assert.instanceOf(error, Unauthorized)
    })
  )
})

describe("POST /api/v1/task/active-alerts", () => {
  it.effect("dà solo i clienti con un alert aperto sul contatto attivo", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const withAlert = yield* given(() => createCustomer({ name: "Ada" }))
      const without = yield* given(() => createCustomer())
      const contact = yield* given(() =>
        createTask({ customerId: withAlert.id, state: "richiamare" })
      )
      yield* given(() => createTask({ customerId: without.id }))
      const open = yield* given(() =>
        createAlert({
          taskId: contact.id,
          deadline: new Date("2026-11-02T09:00:00.000Z"),
          message: "Richiamare dopo le 9",
        })
      )
      const api = yield* clientAs(operator.userId)

      const alerts = yield* api.task.getCustomersWithActiveAlerts({
        payload: { customerIds: [withAlert.id, without.id] },
      })
      const none = yield* api.task.getCustomersWithActiveAlerts({
        payload: { customerIds: [] },
      })

      assert.deepStrictEqual(alerts, [
        {
          customerId: withAlert.id,
          name: "Ada",
          surname: withAlert.surname,
          alertId: open.id,
          deadline: new Date("2026-11-02T09:00:00.000Z"),
          message: "Richiamare dopo le 9",
          state: "richiamare",
        },
      ])
      assert.deepStrictEqual(none, [])
    })
  )
})

describe("POST /api/v1/task/bulk-assign", () => {
  it.effect(
    "assegna i clienti con lo stato di default e chiude solo gli alert confermati",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const operator = yield* given(() => createOperator())
        const confirmed = yield* given(() => createCustomer())
        const kept = yield* given(() => createCustomer())
        const alerts = yield* Effect.forEach([confirmed, kept], (customer) =>
          given(async () => {
            const contact = await createTask({
              customerId: customer.id,
              state: "richiamare",
            })
            return createAlert({
              taskId: contact.id,
              deadline: new Date("2026-11-02T09:00:00.000Z"),
            })
          })
        )
        const api = yield* clientAs(admin.userId)

        yield* api.task.bulkHandleTask({
          payload: {
            operatorId: operator.id,
            customerIds: [confirmed.id, kept.id],
            resolveAlertCustomerIds: [confirmed.id],
          },
        })

        const first = yield* activeContactOf(confirmed.id)
        const second = yield* activeContactOf(kept.id)
        assert.strictEqual(first?.operatorId, operator.id)
        assert.strictEqual(first?.state, "chiamare")
        assert.strictEqual(second?.operatorId, operator.id)
        const resolved = yield* given(() =>
          testDb
            .select({ id: alert.id, isResolved: alert.isResolved })
            .from(alert)
            .orderBy(alert.id)
        )
        assert.deepStrictEqual(resolved, [
          { id: alerts[0]!.id, isResolved: true },
          { id: alerts[1]!.id, isResolved: false },
        ])
      })
  )

  it.effect("dà gli errori del servizio nelle classi del contratto", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const operator = yield* given(() => createOperator())
      const disabled = yield* given(() =>
        createOperator({ disabledAt: new Date() })
      )
      const customer = yield* given(() => createCustomer())
      const api = yield* clientAs(admin.userId)
      const assign = (operatorId: number, customerIds: string[]) =>
        Effect.flip(
          api.task.bulkHandleTask({ payload: { operatorId, customerIds } })
        )

      assert.instanceOf(
        yield* assign(disabled.id, [customer.id]),
        OperatorNotFound
      )
      const missing = yield* assign(operator.id, [customer.id, "nessuno"])
      assert.instanceOf(missing, CustomerMissing)
      assert.strictEqual(missing.customerId, "nessuno")
      // The customers before the missing one stay assigned
      const contact = yield* activeContactOf(customer.id)
      assert.strictEqual(contact?.operatorId, operator.id)
    })
  )

  it.effect("è dell'admin: un operatore è NotAdmin e non assegna niente", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const customer = yield* given(() => createCustomer())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.task.bulkHandleTask({
          payload: { operatorId: operator.id, customerIds: [customer.id] },
        })
      )

      assert.instanceOf(error, NotAdmin)
      assert.isUndefined(yield* activeContactOf(customer.id))
    })
  )

  it.effect("uno stato che non esiste non parte dal client", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const api = yield* clientAs(admin.userId)

      const error = yield* Effect.flip(
        api.task.bulkHandleTask({
          payload: {
            operatorId: admin.id,
            customerIds: [],
            state: "inventato" as never,
          },
        })
      )

      assert.isFalse(isApiError(error))
    })
  )
})
