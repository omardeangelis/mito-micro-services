import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { eq } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  AlertConfirmationRequired,
  AlertNotFound,
  CallbackNotAllowed,
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  DeadlineInPast,
  isApiError,
  NotAdmin,
  OperatorNotFound,
  TransitionRejected,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { getContactsInput } from "@mito/domain/contact/listInput"
import { type TaskStatus } from "@mito/domain/schemas"
import { alert, task } from "@mito/db/schema/task"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"
import { getContacts } from "../../services/contact/getContacts"
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

/** The client of the group `task`, on the real handlers */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["task"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A customer of `operatorId` with an active contact of theirs in `state` */
const contactOf = (operatorId: number, state: TaskStatus = "chiamare") =>
  given(async () => {
    const customer = await createCustomer({ operatorId })
    const contact = await createTask({
      customerId: customer.id,
      operatorId,
      state,
    })
    return { customer, contact }
  })

const taskRow = (id: number) =>
  given(() =>
    testDb
      .select()
      .from(task)
      .where(eq(task.id, id))
      .then(([row]) => row)
  )

const alertRow = (id: number) =>
  given(() =>
    testDb
      .select()
      .from(alert)
      .where(eq(alert.id, id))
      .then(([row]) => row)
  )

/** A day from now, in `days`: the services compare it with the real time */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("POST /api/v1/task/contacts", () => {
  it.effect(
    "senza filtri dà la pagina che il servizio dà con i default della procedura",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        yield* contactOf(operator.id)
        yield* contactOf(operator.id, "app.to")
        const api = yield* clientAs(operator.userId)

        const page = yield* api.task.getContacts({ payload: {} })

        const expected = yield* getContacts({
          ...getContactsInput.parse({}),
          actor: { operatorId: operator.id, role: "OPERATORE" },
        }).pipe(provideServer)
        assert.strictEqual(page.total, 2)
        assert.lengthOf(page.contacts, 2)
        assert.deepStrictEqual(page, expected)
      })
  )

  it.effect(
    "applica i filtri: il testo cercato senza gli spazi intorno, e il cliente del filtro",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const rossi = yield* given(() =>
          createCustomer({ operatorId: operator.id, surname: "Rossi" })
        )
        yield* given(() =>
          createTask({ customerId: rossi.id, operatorId: operator.id })
        )
        yield* contactOf(operator.id)
        const api = yield* clientAs(operator.userId)

        const byText = yield* api.task.getContacts({
          payload: { customerQuery: "  Rossi  " },
        })
        const byCustomer = yield* api.task.getContacts({
          payload: { customerId: rossi.id },
        })

        assert.deepStrictEqual(
          byText.contacts.map(({ customer }) => customer.id),
          [rossi.id]
        )
        assert.deepStrictEqual(byCustomer.customerFilter, {
          found: true,
          name: rossi.name,
          surname: "Rossi",
          totalContacts: 1,
        })
      })
  )

  it.effect(
    "un perPage che la procedura non accetta non passa lo schema del contratto",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const api = yield* clientAs(operator.userId)

        const error = yield* Effect.flip(
          api.task.getContacts({ payload: { perPage: 30 as never } })
        )

        assert.isFalse(isApiError(error))
      })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(api.task.getContacts({ payload: {} }))

      assert.instanceOf(error, Unauthorized)
    })
  )
})

describe("POST /api/v1/task/:id/state", () => {
  it.effect("cambia lo stato del contatto dell'operatore", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const { contact } = yield* contactOf(operator.id)
      const api = yield* clientAs(operator.userId)

      const changed = yield* api.task.changeState({
        params: { id: contact.id },
        payload: { toState: "app.to", source: "list", confirmedAlertId: null },
      })

      assert.deepStrictEqual(changed, { taskId: contact.id, reopened: false })
      assert.strictEqual((yield* taskRow(contact.id))?.state, "app.to")
    })
  )

  it.effect("dà gli errori del servizio nelle classi del contratto", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const other = yield* given(() => createOperator({ name: "Bea" }))
      const { contact } = yield* contactOf(operator.id)
      const withAlert = yield* contactOf(operator.id, "richiamare")
      const open = yield* given(() =>
        createAlert({
          taskId: withAlert.contact.id,
          deadline: new Date("2026-11-02T09:00:00.000Z"),
          message: "Dopo le 9",
        })
      )
      const old = yield* given(() =>
        createTask({
          customerId: withAlert.customer.id,
          operatorId: operator.id,
          isActive: false,
        })
      )
      const change = (
        userId: string,
        id: number,
        toState: TaskStatus = "app.to"
      ) =>
        Effect.flip(
          clientAs(userId).pipe(
            Effect.flatMap((api) =>
              api.task.changeState({
                params: { id },
                payload: { toState, source: "detail", confirmedAlertId: null },
              })
            )
          )
        )

      assert.deepStrictEqual(
        yield* change(operator.userId, contact.id, "followup"),
        new TransitionRejected({ from: "chiamare", to: "followup" })
      )
      assert.deepStrictEqual(
        yield* change(operator.userId, withAlert.contact.id),
        new AlertConfirmationRequired({
          alert: {
            id: open.id,
            deadline: new Date("2026-11-02T09:00:00.000Z"),
            message: "Dopo le 9",
          },
        })
      )
      assert.deepStrictEqual(
        yield* change(operator.userId, old.id),
        new ContactSuperseded({ activeTaskId: withAlert.contact.id })
      )
      const forbidden = yield* change(other.userId, contact.id)
      assert.instanceOf(forbidden, ContactForbidden)
      assert.deepStrictEqual(
        yield* change(operator.userId, 999_999),
        new ContactNotFound()
      )
      assert.strictEqual((yield* taskRow(contact.id))?.state, "chiamare")
    })
  )

  it.effect(
    "un id oltre l'intero di Postgres non passa lo schema del contratto",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const api = yield* clientAs(operator.userId)

        const error = yield* Effect.flip(
          api.task.changeState({
            params: { id: 2_147_483_648 },
            payload: {
              toState: "app.to",
              source: "list",
              confirmedAlertId: null,
            },
          })
        )

        assert.isFalse(isApiError(error))
      })
  )
})

describe("POST /api/v1/task/:id/priority", () => {
  it.effect("imposta la fascia a mano, e auto la ridà al cron", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const { contact } = yield* contactOf(operator.id)
      const api = yield* clientAs(operator.userId)

      yield* api.task.setPriority({
        params: { id: contact.id },
        payload: { priority: "high" },
      })
      const manual = yield* taskRow(contact.id)
      yield* api.task.setPriority({
        params: { id: contact.id },
        payload: { priority: "auto" },
      })
      const auto = yield* taskRow(contact.id)

      assert.strictEqual(manual?.priority, 100)
      assert.isTrue(manual?.customPriority)
      assert.isFalse(auto?.customPriority)
    })
  )

  it.effect("un contatto che non esiste è ContactNotFound", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.task.setPriority({
          params: { id: 999_999 },
          payload: { priority: "low" },
        })
      )

      assert.instanceOf(error, ContactNotFound)
    })
  )
})

describe("POST /api/v1/task/:id/reassign", () => {
  it.effect("l'admin passa il contatto e il cliente a un altro operatore", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const operator = yield* given(() => createOperator())
      const next = yield* given(() => createOperator())
      const { contact } = yield* contactOf(operator.id)
      const api = yield* clientAs(admin.userId)

      const result = yield* api.task.reassign({
        params: { id: contact.id },
        payload: { operatorId: next.id },
      })

      assert.deepStrictEqual(result, {
        contactChanged: true,
        customerChanged: true,
      })
      assert.strictEqual((yield* taskRow(contact.id))?.operatorId, next.id)
    })
  )

  it.effect("un operatore disattivato è OperatorNotFound", () =>
    Effect.gen(function* () {
      const admin = yield* given(() => createOperator({ role: "ADMIN" }))
      const operator = yield* given(() => createOperator())
      const disabled = yield* given(() =>
        createOperator({ disabledAt: new Date() })
      )
      const { contact } = yield* contactOf(operator.id)
      const api = yield* clientAs(admin.userId)

      const error = yield* Effect.flip(
        api.task.reassign({
          params: { id: contact.id },
          payload: { operatorId: disabled.id },
        })
      )

      assert.instanceOf(error, OperatorNotFound)
    })
  )

  it.effect("è dell'admin: un operatore è NotAdmin e non riassegna", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const next = yield* given(() => createOperator())
      const { contact } = yield* contactOf(operator.id)
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.task.reassign({
          params: { id: contact.id },
          payload: { operatorId: next.id },
        })
      )

      assert.instanceOf(error, NotAdmin)
      assert.strictEqual((yield* taskRow(contact.id))?.operatorId, operator.id)
    })
  )
})

describe("POST /api/v1/task/:id/callback", () => {
  it.effect(
    "crea il richiamo con il messaggio senza spazi intorno, e uno vuoto è nessun messaggio",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() => createOperator())
        const first = yield* contactOf(operator.id, "app.to")
        const second = yield* contactOf(operator.id, "app.to")
        const api = yield* clientAs(operator.userId)
        const deadline = inDays(3)

        const withMessage = yield* api.task.setCallback({
          params: { id: first.contact.id },
          payload: {
            deadline,
            message: "  Dopo le 9  ",
            replacesAlertId: null,
          },
        })
        const empty = yield* api.task.setCallback({
          params: { id: second.contact.id },
          payload: { deadline, message: "   ", replacesAlertId: null },
        })

        const saved = yield* alertRow(withMessage.alertId)
        assert.strictEqual(saved?.message, "Dopo le 9")
        assert.strictEqual(saved?.deadline.getTime(), deadline.getTime())
        assert.isNull((yield* alertRow(empty.alertId))?.message)
        assert.strictEqual(
          (yield* taskRow(first.contact.id))?.state,
          "richiamare"
        )
      })
  )

  it.effect("dà gli errori del servizio nelle classi del contratto", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const open = yield* contactOf(operator.id, "chiamare")
      const done = yield* contactOf(operator.id, "app.to")
      const api = yield* clientAs(operator.userId)
      const callback = (id: number, deadline: Date) =>
        Effect.flip(
          api.task.setCallback({
            params: { id },
            payload: { deadline, replacesAlertId: null },
          })
        )

      assert.deepStrictEqual(
        yield* callback(open.contact.id, inDays(3)),
        new CallbackNotAllowed({ state: "chiamare" })
      )
      assert.deepStrictEqual(
        yield* callback(done.contact.id, inDays(-1)),
        new DeadlineInPast()
      )
    })
  )
})

describe("DELETE /api/v1/task/alerts/:id", () => {
  it.effect("chiude l'alert aperto; uno già chiuso è resolved false", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const { contact } = yield* contactOf(operator.id, "richiamare")
      const open = yield* given(() =>
        createAlert({ taskId: contact.id, deadline: inDays(3) })
      )
      const api = yield* clientAs(operator.userId)

      const first = yield* api.task.resolveAlert({
        params: { id: open.id },
        query: { source: "list" },
      })
      const again = yield* api.task.resolveAlert({
        params: { id: open.id },
        query: { source: "list" },
      })

      assert.deepStrictEqual(first, { resolved: true })
      assert.deepStrictEqual(again, { resolved: false })
      assert.isTrue((yield* alertRow(open.id))?.isResolved)
    })
  )

  it.effect("un alert che non esiste è AlertNotFound", () =>
    Effect.gen(function* () {
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(
        api.task.resolveAlert({
          params: { id: 999_999 },
          query: { source: "detail" },
        })
      )

      assert.instanceOf(error, AlertNotFound)
    })
  )
})
