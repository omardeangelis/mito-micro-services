import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer } from "effect"
import { TestClock } from "effect/testing"
import { HttpApiTest } from "effect/http-api"
import { beforeAll, beforeEach } from "vitest"
import { count } from "drizzle-orm"
import { MitoApi } from "@mito/contract/api"
import {
  NotAdmin,
  NotAnOperator,
  OperatorDisabled,
  Unauthorized,
} from "@mito/contract/errors"
import { inMemoryPlatform } from "@mito/contract/testing"
import { appMilestone } from "@mito/db/schema/appMilestone"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { getContactsInput } from "@mito/domain/contact/listInput"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createTaskEvent,
  createUser,
} from "@/test/factories"
import { getContacts } from "../../services/contact/getContacts"
import { CallsRegistryMissing } from "../../services/export/callStats"
import { apiHandlersLayer } from "../api"
import { SessionReader } from "../session"

// 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")

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

/** The client of the group `home`, on the real handlers */
const clientAs = (userId: string | null) =>
  HttpApiTest.groups(MitoApi, ["home"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A contact of `operatorId` with an open alert due at `deadline` */
const callbackOf = (operatorId: number, deadline: Date) =>
  given(async () => {
    const customer = await createCustomer({ operatorId })
    const contact = await createTask({
      customerId: customer.id,
      operatorId,
      state: "chiamare",
    })
    const alert = await createAlert({ taskId: contact.id, deadline })
    return { customer, contact, alert }
  })

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

describe("GET /api/v1/home/callbacks", () => {
  it.effect(
    "dà all'operatore gli alert scaduti e di oggi dei suoi contatti, dal più vecchio, e non quelli di un collega né di domani",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const me = yield* given(() => createOperator({ name: "Ada" }))
        const colleague = yield* given(() => createOperator({ name: "Bruno" }))
        const today = yield* callbackOf(
          me.id,
          new Date("2026-11-02T15:00:00.000Z")
        )
        const overdue = yield* callbackOf(
          me.id,
          new Date("2026-10-30T09:00:00.000Z")
        )
        yield* callbackOf(me.id, new Date("2026-11-03T09:00:00.000Z"))
        yield* callbackOf(colleague.id, new Date("2026-11-01T09:00:00.000Z"))
        const api = yield* clientAs(me.userId)

        const rows = yield* api.home.getMyCallbacks()

        assert.deepStrictEqual(
          rows.map(({ alertId, taskId, daysLate, dueDay }) => ({
            alertId,
            taskId,
            daysLate,
            dueDay,
          })),
          [
            {
              alertId: overdue.alert.id,
              taskId: overdue.contact.id,
              daysLate: 3,
              dueDay: "2026-10-30",
            },
            {
              alertId: today.alert.id,
              taskId: today.contact.id,
              daysLate: 0,
              dueDay: "2026-11-02",
            },
          ]
        )
      })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* api.home.getMyCallbacks().pipe(Effect.flip)

      assert.instanceOf(error, Unauthorized)
    })
  )
})

/** The client of the groups `home` and `task`, to register calls through the API */
const callerAs = (userId: string) =>
  HttpApiTest.groups(MitoApi, ["home", "task"]).pipe(
    Effect.provide(apiHandlersLayer),
    Effect.provide(sessionOf(userId)),
    Effect.provide(inMemoryPlatform),
    provideServer
  )

describe("GET /api/v1/home/calls", () => {
  it.effect(
    "dà le chiamate di oggi dell'utente dalla più recente, con giorno e messaggio del richiamo, non quelle di ieri o di un collega",
    () =>
      Effect.gen(function* () {
        const me = yield* given(() => createOperator({ name: "Ada" }))
        const colleague = yield* given(() => createOperator({ name: "Bruno" }))
        const yesterdayCall = yield* callbackOf(
          me.id,
          new Date("2026-11-01T08:00:00.000Z")
        )
        const first = yield* callbackOf(
          me.id,
          new Date("2026-11-02T15:00:00.000Z")
        )
        const second = yield* callbackOf(
          me.id,
          new Date("2026-11-02T15:00:00.000Z")
        )
        const others = yield* callbackOf(
          colleague.id,
          new Date("2026-11-02T15:00:00.000Z")
        )
        const mine = yield* callerAs(me.userId)
        const theirs = yield* callerAs(colleague.userId)
        const call = (id: number) => ({
          params: { id },
          payload: {
            outcome: "app.to" as const,
            requestId: crypto.randomUUID(),
            source: "list" as const,
          },
        })

        yield* TestClock.setTime(new Date("2026-11-01T09:00:00.000Z").getTime())
        yield* mine.task.registerCall(call(yesterdayCall.contact.id))
        yield* TestClock.setTime(NOW.getTime())
        yield* mine.task.registerCall(call(first.contact.id))
        yield* theirs.task.registerCall(call(others.contact.id))
        yield* TestClock.setTime(NOW.getTime() + 60_000)
        yield* mine.task.registerCall({
          params: { id: second.contact.id },
          payload: {
            outcome: "richiamare",
            requestId: crypto.randomUUID(),
            source: "list",
            callback: { day: "2026-11-05", message: "Sera" },
          },
        })

        const calls = yield* mine.home.getMyCalls()

        assert.deepStrictEqual(
          calls.map(({ taskId, outcome, callbackDay, message }) => ({
            taskId,
            outcome,
            callbackDay,
            message,
          })),
          [
            {
              taskId: second.contact.id,
              outcome: "richiamare",
              callbackDay: "2026-11-05",
              message: "Sera",
            },
            {
              taskId: first.contact.id,
              outcome: "app.to",
              callbackDay: null,
              message: null,
            },
          ]
        )
      })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* api.home.getMyCalls().pipe(Effect.flip)

      assert.instanceOf(error, Unauthorized)
    })
  )
})

describe("GET /api/v1/home/day", () => {
  it.effect("dà i numeri di oggi dell'utente", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const { contact } = yield* callbackOf(
        me.id,
        new Date("2026-11-02T15:00:00.000Z")
      )
      const api = yield* callerAs(me.userId)
      yield* api.task.registerCall({
        params: { id: contact.id },
        payload: {
          outcome: "app.to",
          requestId: crypto.randomUUID(),
          source: "list",
        },
      })

      assert.deepStrictEqual(yield* api.home.getMyDay(), {
        calls: 1,
        answered: 1,
        appointments: 1,
      })
    })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* api.home.getMyDay().pipe(Effect.flip)

      assert.instanceOf(error, Unauthorized)
    })
  )
})

describe("senza calls_registry", () => {
  const rowsOf = (table: typeof appMilestone | typeof taskEventLog) =>
    given(async () => (await testDb.select({ total: count() }).from(table))[0])

  /** The defect `unexpectedAs500` leaves, which the backend answers with a 500 */
  const assertMissingRegistry = (exit: Exit.Exit<unknown, unknown>) => {
    assert.isTrue(Exit.isFailure(exit))
    if (Exit.isFailure(exit)) {
      assert.isTrue(Cause.hasDies(exit.cause))
      assert.instanceOf(Cause.squash(exit.cause), CallsRegistryMissing)
    }
  }

  it.effect(
    "le chiamate e i numeri sono un difetto, cioè un 500, senza scrivere nulla",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const me = yield* given(() => createOperator())
        yield* given(() =>
          createTaskEvent({ actorOperatorId: me.id, createdAt: NOW })
        )
        yield* given(() => testDb.delete(appMilestone))
        const api = yield* clientAs(me.userId)
        const logged = yield* rowsOf(taskEventLog)

        assertMissingRegistry(yield* Effect.exit(api.home.getMyCalls()))
        assertMissingRegistry(yield* Effect.exit(api.home.getMyDay()))

        assert.deepStrictEqual(yield* rowsOf(taskEventLog), logged)
        assert.deepStrictEqual(yield* rowsOf(appMilestone), { total: 0 })
      })
  )
})

describe("GET /api/v1/home/to-call", () => {
  it.effect("dà il numero dei contatti da chiamare dell'utente", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const me = yield* given(() => createOperator())
      const colleague = yield* given(() => createOperator())
      yield* callbackOf(me.id, new Date("2026-11-02T15:00:00.000Z"))
      yield* callbackOf(colleague.id, new Date("2026-11-02T15:00:00.000Z"))
      const api = yield* clientAs(me.userId)

      assert.deepStrictEqual(yield* api.home.getMyToCall(), { total: 1 })
    })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* api.home.getMyToCall().pipe(Effect.flip)

      assert.instanceOf(error, Unauthorized)
    })
  )
})

/** A completed Wave of `admin` that ended at `finishedAt` */
const waveOf = (
  admin: { userId: string },
  fileName: string,
  finishedAt: Date,
  values: Partial<typeof importRun.$inferInsert> = {}
) =>
  given(async () => {
    const [run] = await testDb
      .insert(importRun)
      .values({
        startedBy: admin.userId,
        fileName,
        format: "wave",
        status: "completed",
        rowsTotal: 1,
        rowsDiscarded: 0,
        startedAt: new Date(finishedAt.getTime() - 60_000),
        finishedAt,
        ...values,
      })
      .returning()
    return run!
  })

/** Puts `customerId` in the Wave `runId` */
const inWave = (runId: number, customerId: string) =>
  given(() =>
    testDb
      .insert(importRunCustomer)
      .values({ runId, customerId, created: true })
  )

describe("GET /api/v1/home/waves", () => {
  it.effect(
    "due Wave che condividono un cliente senza operatore lo contano in ogni riga e una volta nel riepilogo",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const older = yield* waveOf(
          admin,
          "VECCHIA.xlsx",
          new Date("2026-10-20T10:00:00.000Z"),
          { deadline: "2026-11-30" }
        )
        const newer = yield* waveOf(
          admin,
          "NUOVA.xlsx",
          new Date("2026-10-30T10:00:00.000Z"),
          { deadline: "2026-11-30" }
        )
        const shared = yield* given(() => createCustomer({ operatorId: null }))
        yield* inWave(older.id, shared.id)
        yield* inWave(newer.id, shared.id)
        const api = yield* clientAs(admin.userId)

        const waves = yield* api.home.getLatestWaves()

        assert.deepStrictEqual(
          waves.rows.map(({ runId, name, customers, parts, status }) => ({
            runId,
            name,
            customers,
            unassigned: parts.unassigned,
            status,
          })),
          [
            {
              runId: newer.id,
              name: "NUOVA",
              customers: 1,
              unassigned: 1,
              status: "open",
            },
            {
              runId: older.id,
              name: "VECCHIA",
              customers: 1,
              unassigned: 1,
              status: "open",
            },
          ]
        )
        assert.strictEqual(waves.unassignedDistinct, 1)
        assert.strictEqual(waves.neverCalledDistinct, 0)
      })
  )

  it.effect("è dell'admin: un operatore è NotAdmin", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(api.home.getLatestWaves())

      assert.instanceOf(error, NotAdmin)
    })
  )

  it.effect("senza sessione è Unauthorized", () =>
    Effect.gen(function* () {
      const api = yield* clientAs(null)

      const error = yield* Effect.flip(api.home.getLatestWaves())

      assert.instanceOf(error, Unauthorized)
    })
  )

  it.effect("un admin disattivato è OperatorDisabled", () =>
    Effect.gen(function* () {
      const admin = yield* given(() =>
        createOperator({ role: "ADMIN", disabledAt: NOW })
      )
      const api = yield* clientAs(admin.userId)

      const error = yield* Effect.flip(api.home.getLatestWaves())

      assert.instanceOf(error, OperatorDisabled)
    })
  )

  it.effect("un utente senza riga operatore è NotAnOperator", () =>
    Effect.gen(function* () {
      const user = yield* given(() => createUser({ role: "ADMIN" }))
      const api = yield* clientAs(user.id)

      const error = yield* Effect.flip(api.home.getLatestWaves())

      assert.instanceOf(error, NotAnOperator)
    })
  )
})

/** A call of `operatorId` at `at`, with `outcome` */
const callAt = (
  operatorId: number,
  at: Date,
  outcome: "non risponde" | "app.to" | "richiamare" = "non risponde"
) =>
  given(() =>
    createTaskEvent({
      actorOperatorId: operatorId,
      action: "call",
      source: "list",
      fromState: null,
      toState: outcome,
      outcome,
      origin: "list",
      createdAt: at,
    })
  )

describe("GET /api/v1/home/team/day", () => {
  it.effect(
    "conta le chiamate di oggi delle persone del team, non quelle di un disattivato",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const ada = yield* given(() => createOperator({ name: "Ada" }))
        yield* given(() => createOperator({ name: "Senza chiamate" }))
        const gone = yield* given(() => createOperator({ disabledAt: NOW }))
        const morning = new Date("2026-11-02T08:00:00.000Z")
        yield* callAt(ada.id, morning, "app.to")
        yield* callAt(ada.id, morning)
        yield* callAt(admin.id, morning, "richiamare")
        yield* callAt(gone.id, morning)
        const api = yield* clientAs(admin.userId)

        assert.deepStrictEqual(yield* api.home.getTeamDay(), {
          calls: 3,
          answered: 2,
          appointments: 1,
          called: 2,
          members: 3,
        })
      })
  )

  it.effect("è dell'admin: un operatore è NotAdmin", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(api.home.getTeamDay())

      assert.instanceOf(error, NotAdmin)
    })
  )
})

describe("GET /api/v1/home/team", () => {
  it.effect(
    "8 arretrati danno il totale, le prime 6 righe dalla più vecchia e lo stesso totale della lista Contatti",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const ada = yield* given(() => createOperator({ name: "Ada" }))
        const colleague = yield* given(() => createOperator({ name: "Bruno" }))
        // From 8 days ago to yesterday, created newest first
        const overdue = []
        for (const daysLate of [1, 2, 3, 4, 5, 6, 7, 8]) {
          overdue.push({
            daysLate,
            ...(yield* callbackOf(
              ada.id,
              new Date(NOW.getTime() - daysLate * 86_400_000)
            )),
          })
        }
        yield* callbackOf(ada.id, NOW)
        yield* callbackOf(colleague.id, new Date("2026-10-30T09:00:00.000Z"))
        const api = yield* clientAs(admin.userId)

        const detail = yield* api.home.getTeamDetail()

        assert.strictEqual(detail.today, "2026-11-02")
        assert.strictEqual(detail.now.getTime(), NOW.getTime())
        const row = detail.members.find((m) => m.operatorId === ada.id)!
        assert.strictEqual(row.overdue.total, 8)
        assert.strictEqual(row.overdue.oldestDays, 8)
        assert.deepStrictEqual(
          row.overdue.rows.map(({ taskId, daysLate }) => ({
            taskId,
            daysLate,
          })),
          [...overdue]
            .reverse()
            .slice(0, 6)
            .map(({ contact, daysLate }) => ({
              taskId: contact.id,
              daysLate,
            }))
        )
        const list = yield* getContacts({
          ...getContactsInput.parse({
            operatorIds: [ada.id],
            hasAlert: true,
            dateField: "nextAlert",
            to: "2026-11-01",
          }),
          actor: { operatorId: admin.id, role: "ADMIN" },
        }).pipe(provideServer)
        assert.strictEqual(row.overdue.total, list.total)
      })
  )

  it.effect(
    "lastCallAt, le chiamate di oggi con l'esito, triedAt e le persone di una Wave passano dall'encoder",
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW.getTime())
        const called = new Date("2026-11-02T08:00:00.000Z")
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const ada = yield* given(() => createOperator({ name: "Ada" }))
        const { customer, contact } = yield* callbackOf(
          ada.id,
          new Date("2026-10-30T09:00:00.000Z")
        )
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: ada.id,
            customerId: customer.id,
            taskId: contact.id,
            action: "call",
            source: "list",
            fromState: "chiamare",
            toState: "non risponde",
            outcome: "non risponde",
            origin: "list",
            createdAt: called,
          })
        )
        const run = yield* waveOf(
          admin,
          "NOV.xlsx",
          new Date("2026-10-30T10:00:00.000Z"),
          { deadline: "2026-11-30" }
        )
        yield* inWave(run.id, customer.id)
        const api = yield* clientAs(admin.userId)

        const detail = yield* api.home.getTeamDetail()
        const waves = yield* api.home.getLatestWaves()

        const row = detail.members.find((m) => m.operatorId === ada.id)!
        assert.strictEqual(row.lastCallAt?.getTime(), called.getTime())
        assert.strictEqual(row.todayCalls.length, 1)
        assert.strictEqual(row.todayCalls[0]!.at.getTime(), called.getTime())
        assert.strictEqual(row.todayCalls[0]!.outcome, "non risponde")
        assert.strictEqual(
          row.overdue.rows[0]!.triedAt?.getTime(),
          called.getTime()
        )
        assert.deepStrictEqual(
          waves.rows[0]!.people.map(
            ({ operatorId, userId, inactiveDays, toCall, neverCalled }) => ({
              operatorId,
              userId,
              inactiveDays,
              toCall,
              neverCalled,
            })
          ),
          [
            {
              operatorId: ada.id,
              userId: ada.userId,
              inactiveDays: null,
              toCall: 1,
              neverCalled: 0,
            },
          ]
        )
      })
  )

  it.effect("è dell'admin: un operatore è NotAdmin", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW.getTime())
      const operator = yield* given(() => createOperator())
      const api = yield* clientAs(operator.userId)

      const error = yield* Effect.flip(api.home.getTeamDetail())

      assert.instanceOf(error, NotAdmin)
    })
  )
})
