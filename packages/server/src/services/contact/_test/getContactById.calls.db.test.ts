import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import { appMilestone } from "@mito/db/schema/appMilestone"
import { alert } from "@mito/db/schema/task"
import { getContactById } from "../getContactById"
import { registerCall } from "../registerCall"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createTaskEvent,
} from "@/test/factories"

// The Storico of the detail: calls (AC30) and closed alerts (AC23)
const at = (iso: string) => new Date(iso)

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

type Operator = Awaited<ReturnType<typeof createOperator>>

const call = (
  operator: Operator,
  taskId: number,
  input:
    | { outcome: "non risponde" }
    | { outcome: "richiamare"; callback: { day: string; message?: string } }
) =>
  registerCall({
    requestId: crypto.randomUUID(),
    source: "detail",
    taskId,
    actor: { operatorId: operator.id, role: "OPERATORE" },
    ...input,
  } as Parameters<typeof registerCall>[0]).pipe(provideServer)

const detailOf = (operator: Operator, id: number) =>
  getContactById({
    id: String(id),
    actor: { operatorId: operator.id, role: "OPERATORE" },
  }).pipe(provideServer)

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("getContactById: le chiamate dello Storico (AC30)", () => {
  it.effect(
    "dopo due Non risponde restituisce due chiamate con esito non risponde, la più recente prima",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() =>
          createOperator({ name: "Ada", surname: "Neri" })
        )
        const customer = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const contact = yield* given(() =>
          createTask({ customerId: customer.id, operatorId: operator.id })
        )

        yield* TestClock.setTime(at("2026-11-02T09:00:00Z").getTime())
        yield* call(operator, contact.id, { outcome: "non risponde" })
        yield* TestClock.setTime(at("2026-11-02T10:00:00Z").getTime())
        yield* call(operator, contact.id, { outcome: "non risponde" })

        const { calls } = yield* detailOf(operator, contact.id)

        expect(calls).toMatchObject([
          {
            outcome: "non risponde",
            at: at("2026-11-02T10:00:00Z"),
            operatorName: "Ada",
            operatorSurname: "Neri",
            callbackDeadline: null,
          },
          { outcome: "non risponde", at: at("2026-11-02T09:00:00Z") },
        ])
        expect(calls).toHaveLength(2)
      })
  )

  it.effect(
    "due Non risponde, un Richiamare e uno state_change vecchio sono quattro chiamate, dalla più recente, col giorno solo per Richiamare",
    () =>
      Effect.gen(function* () {
        const [operator, colleague] = yield* given(() =>
          Promise.all([
            createOperator({ name: "Ada", surname: "Neri" }),
            createOperator({ name: "Bruno", surname: "Verdi" }),
          ])
        )
        const customer = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const contact = yield* given(() =>
          createTask({ customerId: customer.id, operatorId: operator.id })
        )
        // The registry of calls starts on 15 October: the old rule counts
        // what came before it, and not what came after
        yield* given(() =>
          testDb
            .update(appMilestone)
            .set({ at: at("2026-10-15T00:00:00Z") })
            .where(eq(appMilestone.name, "calls_registry"))
        )
        yield* given(async () => {
          await createTaskEvent({
            customerId: customer.id,
            taskId: contact.id,
            actorOperatorId: colleague.id,
            action: "state_change",
            source: "list",
            fromState: "chiamare",
            toState: "app.to",
            createdAt: at("2026-10-01T09:00:00Z"),
          })
          // After the registry, the selector no longer makes calls
          await createTaskEvent({
            customerId: customer.id,
            taskId: contact.id,
            actorOperatorId: colleague.id,
            action: "state_change",
            source: "list",
            fromState: "chiamare",
            toState: "app.to",
            createdAt: at("2026-10-20T09:00:00Z"),
          })
        })

        yield* TestClock.setTime(at("2026-11-02T09:00:00Z").getTime())
        yield* call(operator, contact.id, { outcome: "non risponde" })
        yield* TestClock.setTime(at("2026-11-02T10:00:00Z").getTime())
        yield* call(operator, contact.id, {
          outcome: "richiamare",
          callback: { day: "2026-11-10", message: "Dopo le 18" },
        })
        yield* TestClock.setTime(at("2026-11-02T11:00:00Z").getTime())
        yield* call(operator, contact.id, { outcome: "non risponde" })

        const { calls } = yield* detailOf(operator, contact.id)

        expect(calls.map(({ outcome }) => outcome)).toEqual([
          "non risponde",
          "richiamare",
          "non risponde",
          "app.to",
        ])
        expect(calls[3]).toMatchObject({
          at: at("2026-10-01T09:00:00Z"),
          operatorName: "Bruno",
          operatorSurname: "Verdi",
          callbackDeadline: null,
        })
        // The day of the new alert only for Richiamare, not for the kept
        // alert of a Non risponde
        expect(calls[1]!.callbackDeadline).toBeInstanceOf(Date)
        expect(calls[0]!.callbackDeadline).toBeNull()
        expect(calls[2]!.callbackDeadline).toBeNull()
      })
  )
})

describe("getContactById: gli alert chiusi dello Storico (AC23)", () => {
  it.effect(
    "un orfano chiuso dalla conversione esce dal sistema, uno chiuso da una persona con chi e quando",
    () =>
      Effect.gen(function* () {
        const operator = yield* given(() =>
          createOperator({ name: "Ada", surname: "Neri" })
        )
        const customer = yield* given(() =>
          createCustomer({ operatorId: operator.id })
        )
        const contact = yield* given(() =>
          createTask({ customerId: customer.id, operatorId: operator.id })
        )
        const [byPerson, bySystem, old] = yield* given(async () => {
          const person = await createAlert({
            taskId: contact.id,
            deadline: at("2026-11-05T08:00:00Z"),
          })
          const system = await createAlert({
            taskId: contact.id,
            deadline: at("2026-11-04T08:00:00Z"),
          })
          const legacy = await createAlert({
            taskId: contact.id,
            deadline: at("2026-11-03T08:00:00Z"),
          })
          await testDb
            .update(alert)
            .set({
              isResolved: true,
              resolvedBy: operator.id,
              resolvedAt: at("2026-11-02T12:00:00Z"),
              resolution: "call",
            })
            .where(eq(alert.id, person.id))
          await testDb
            .update(alert)
            .set({
              isResolved: true,
              resolvedBy: operator.id,
              resolvedAt: at("2026-11-02T13:00:00Z"),
              resolution: "system",
            })
            .where(eq(alert.id, system.id))
          await testDb
            .update(alert)
            .set({
              isResolved: true,
              resolvedBy: operator.id,
              updatedAt: at("2026-10-01T08:00:00Z"),
            })
            .where(eq(alert.id, legacy.id))
          return [person, system, legacy] as const
        })

        const { history, closures } = yield* detailOf(operator, contact.id)

        expect(history.map(({ id }) => id)).toEqual([
          byPerson.id,
          bySystem.id,
          old.id,
        ])
        expect(history[0]).toMatchObject({
          resolvedByName: "Ada",
          resolvedBySurname: "Neri",
        })
        expect(closures).toEqual([
          {
            alertId: byPerson.id,
            resolution: "call",
            closedAt: at("2026-11-02T12:00:00Z"),
          },
          {
            alertId: bySystem.id,
            resolution: "system",
            closedAt: at("2026-11-02T13:00:00Z"),
          },
          {
            alertId: old.id,
            resolution: null,
            closedAt: at("2026-10-01T08:00:00Z"),
          },
        ])
      })
  )
})
