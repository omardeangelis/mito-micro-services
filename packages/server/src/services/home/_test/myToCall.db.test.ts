import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { getContactsInput } from "@mito/domain/contact/listInput"
import { type TaskStatus } from "@mito/domain/schemas"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
} from "@/test/factories"
import { getContacts } from "../../contact/getContacts"
import { countMyToCall } from "../myToCall"

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const NOW = new Date("2026-11-02T09:00:00.000Z")

const contact = (operatorId: number, state: TaskStatus | null) =>
  Effect.promise(async () => {
    const customer = await createCustomer({ operatorId })
    return createTask({ customerId: customer.id, operatorId, state })
  })

describe("countMyToCall", () => {
  it.effect(
    "dà lo stesso numero di getContacts con «Solo i miei» e gli stati Da chiamare e Non risponde",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const me = yield* Effect.promise(() => createOperator())
        const actor = { operatorId: me.id, role: "OPERATORE" as const }
        for (const state of [
          "chiamare",
          "followup",
          "nessuno",
          null,
          "non risponde",
          "app.to",
        ] as const) {
          yield* contact(me.id, state)
        }

        const { total } = yield* countMyToCall({ actor }).pipe(provideServer)
        const list = yield* getContacts({
          ...getContactsInput.parse({
            onlyMe: true,
            states: ["chiamare", "non risponde"],
          }),
          actor,
        }).pipe(provideServer)

        expect(total).toBe(5)
        expect(total).toBe(list.total)
      })
  )

  it.effect(
    "conta quelli di un collega su un cliente mio, non quelli di un altro",
    () =>
      Effect.gen(function* () {
        const me = yield* Effect.promise(() => createOperator())
        const colleague = yield* Effect.promise(() => createOperator())
        yield* Effect.promise(async () => {
          const customer = await createCustomer({ operatorId: me.id })
          await createTask({
            customerId: customer.id,
            operatorId: colleague.id,
            state: "chiamare",
          })
        })
        yield* contact(colleague.id, "chiamare")

        const { total } = yield* countMyToCall({
          actor: { operatorId: me.id, role: "OPERATORE" },
        }).pipe(provideServer)

        expect(total).toBe(1)
      })
  )

  it.effect("per un ADMIN conta solo i suoi", () =>
    Effect.gen(function* () {
      const admin = yield* Effect.promise(() =>
        createOperator({ role: "ADMIN" })
      )
      const colleague = yield* Effect.promise(() => createOperator())
      yield* contact(colleague.id, "chiamare")

      const { total } = yield* countMyToCall({
        actor: { operatorId: admin.id, role: "ADMIN" },
      }).pipe(provideServer)

      expect(total).toBe(0)
    })
  )

  it.effect("un contatto non attivo non conta", () =>
    Effect.gen(function* () {
      const me = yield* Effect.promise(() => createOperator())
      yield* Effect.promise(async () => {
        const customer = await createCustomer({ operatorId: me.id })
        await createTask({
          customerId: customer.id,
          operatorId: me.id,
          state: "chiamare",
          isActive: false,
        })
      })

      const { total } = yield* countMyToCall({
        actor: { operatorId: me.id, role: "OPERATORE" },
      }).pipe(provideServer)

      expect(total).toBe(0)
    })
  )

  it.effect("conta anche un contatto con un alert, una volta sola", () =>
    Effect.gen(function* () {
      const me = yield* Effect.promise(() => createOperator())
      const withAlert = yield* contact(me.id, "non risponde")
      yield* Effect.promise(() =>
        createAlert({ taskId: withAlert.id, deadline: NOW })
      )

      const { total } = yield* countMyToCall({
        actor: { operatorId: me.id, role: "OPERATORE" },
      }).pipe(provideServer)

      expect(total).toBe(1)
    })
  )
})
