import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { task as taskTable } from "@mito/db/schema/task"
import { type WaveRead, readWave } from "../read"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createTaskEvent,
} from "@/test/factories"

// The read of a Wave (T5, D10): the parts, who is already assigned and how,
// where the customers come from, the deadline and the team, from the Clock

// Rome: 2026-10-25, 12:00
const NOW = new Date("2026-10-25T10:00:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

type Run = typeof importRun.$inferInsert

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A completed Wave started by a new admin */
const insertRun = async (values: Partial<Run> = {}) => {
  const admin = await createOperator({ role: "ADMIN" })
  const [run] = await testDb
    .insert(importRun)
    .values({
      startedBy: admin.userId,
      fileName: "1026_WAVE_NOV.xlsx",
      format: "wave",
      status: "completed",
      rowsTotal: 10,
      rowsDiscarded: 0,
      startedAt: new Date("2026-10-20T10:00:00.000Z"),
      finishedAt: new Date("2026-10-20T10:01:00.000Z"),
      ...values,
    })
    .returning()
  return run!
}

/** A customer of the Wave `runId`; `created` true for a new one */
const waveCustomer = async (
  runId: number,
  created: boolean | null,
  values: { operatorId?: number | null } = {}
) => {
  const customer = await createCustomer({ operatorId: values.operatorId })
  await testDb
    .insert(importRunCustomer)
    .values({ runId, customerId: customer.id, created })
  return customer
}

/** A call of `operatorId` at noon of the Rome `day`, on `customerId` or a new customer */
const call = (operatorId: number, day: string, customerId?: string) =>
  createTaskEvent({
    actorOperatorId: operatorId,
    action: "call",
    source: "list",
    fromState: null,
    toState: null,
    outcome: "non risponde",
    origin: "list",
    customerId,
    createdAt: new Date(`${day}T10:00:00.000Z`),
  })

/** A customer of the Wave with an active contact of `operatorId` in `state` */
const withContact = async (
  runId: number,
  operatorId: number,
  state: (typeof taskTable.$inferInsert)["state"],
  created: boolean | null = false
) => {
  const customer = await waveCustomer(runId, created, { operatorId })
  const contact = await createTask({
    customerId: customer.id,
    operatorId,
    state,
  })
  return { customer, contact }
}

const memberOf = (wave: WaveRead, operatorId: number) =>
  wave.team.find((member) => member.operatorId === operatorId)

const read = (runId: number) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW.getTime())
    return yield* readWave(runId).pipe(provideServer)
  })

describe("parti della Wave (Definizioni, D10)", () => {
  it.effect(
    "un nuovo senza operatore, un Da chiamare mai chiamato e un Richiamo",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const op = yield* given(() => createOperator())
        yield* given(() => waveCustomer(run.id, true))
        const toCall = yield* given(() =>
          waveCustomer(run.id, false, { operatorId: op.id })
        )
        yield* given(() =>
          createTask({
            customerId: toCall.id,
            operatorId: op.id,
            state: "chiamare",
          })
        )
        const recall = yield* given(() =>
          waveCustomer(run.id, false, { operatorId: op.id })
        )
        yield* given(() =>
          createTask({
            customerId: recall.id,
            operatorId: op.id,
            state: "richiamare",
          })
        )

        const wave = yield* read(run.id)

        expect(wave.toAssign).toBe(1)
        expect(wave.parts).toEqual({
          unassigned: 1,
          neverCalled: 1,
          calledNoOutcome: 0,
          worked: 1,
          noContact: 0,
        })
      })
  )
})

describe("parti: una per riga delle Definizioni", () => {
  it.effect(
    "un cliente per ogni parte, e il contatto attivo senza operatore è Senza operatore",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const op = yield* given(() => createOperator())
        // Senza operatore: nessun operatore e nessun contatto attivo
        yield* given(() => waveCustomer(run.id, false))
        // Senza operatore: il cliente ha un operatore, il contatto attivo no
        const orphan = yield* given(() =>
          waveCustomer(run.id, false, { operatorId: op.id })
        )
        yield* given(() =>
          createTask({
            customerId: orphan.id,
            operatorId: null,
            state: "chiamare",
          })
        )
        yield* given(() => withContact(run.id, op.id, "chiamare"))
        yield* given(() => withContact(run.id, op.id, "non risponde"))
        yield* given(() => withContact(run.id, op.id, "app.to"))
        // Con operatore, senza contatto: solo un contatto chiuso
        const noContact = yield* given(() =>
          waveCustomer(run.id, false, { operatorId: op.id })
        )
        yield* given(() =>
          createTask({
            customerId: noContact.id,
            operatorId: op.id,
            state: "caricato",
            isActive: false,
          })
        )

        const wave = yield* read(run.id)

        expect(wave.customers).toBe(6)
        expect(wave.parts).toEqual({
          unassigned: 2,
          neverCalled: 1,
          calledNoOutcome: 1,
          worked: 1,
          noContact: 1,
        })
        expect(wave.toAssign).toBe(2)
      })
  )

  it.effect(
    "Mai chiamati contro Chiamati senza esito: chiamata, alert aperto, «Contattato il», contatto chiuso con esito",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const op = yield* given(() => createOperator())
        // A call on a contact of the customer, closed since
        const called = yield* given(() =>
          withContact(run.id, op.id, "chiamare")
        )
        yield* given(() => call(op.id, "2026-10-21", called.customer.id))
        // An open alert on the active contact
        const alerted = yield* given(() =>
          withContact(run.id, op.id, "followup")
        )
        yield* given(() =>
          createAlert({
            taskId: alerted.contact.id,
            deadline: new Date("2026-10-30T10:00:00.000Z"),
          })
        )
        // «Contattato il»
        const contacted = yield* given(() =>
          withContact(run.id, op.id, "nessuno")
        )
        yield* given(() =>
          testDb
            .update(taskTable)
            .set({ closedAt: new Date("2026-10-22T10:00:00.000Z") })
            .where(eq(taskTable.id, contacted.contact.id))
        )
        // A closed contact with an outcome
        const outcome = yield* given(() => withContact(run.id, op.id, null))
        yield* given(() =>
          createTask({
            customerId: outcome.customer.id,
            operatorId: op.id,
            state: "non interessato",
            isActive: false,
          })
        )
        // Never called: a resolved alert, a closed contact without an
        // outcome, and a call on another customer
        const never = yield* given(() => withContact(run.id, op.id, "chiamare"))
        yield* given(() =>
          createAlert({
            taskId: never.contact.id,
            deadline: new Date("2026-10-30T10:00:00.000Z"),
            isResolved: true,
          })
        )
        yield* given(() =>
          createTask({
            customerId: never.customer.id,
            operatorId: op.id,
            state: "non risponde",
            isActive: false,
          })
        )
        yield* given(() => call(op.id, "2026-10-21"))

        const wave = yield* read(run.id)

        expect(wave.parts).toEqual({
          unassigned: 0,
          neverCalled: 1,
          calledNoOutcome: 4,
          worked: 0,
          noContact: 0,
        })
        expect(wave.alreadyAssigned.toCall).toBe(5)
      })
  )

  it.effect(
    "Già assegnati per stato del contatto attivo, e un Nuovo con operatore fra loro",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const op = yield* given(() => createOperator())
        yield* given(() => withContact(run.id, op.id, "followup"))
        yield* given(() => withContact(run.id, op.id, "non risponde"))
        yield* given(() => withContact(run.id, op.id, "richiamare"))
        yield* given(() => withContact(run.id, op.id, "app.to"))
        yield* given(() => withContact(run.id, op.id, "erogata"))
        yield* given(() => withContact(run.id, op.id, "caricato", true))
        // Senza contatto
        yield* given(() => waveCustomer(run.id, false, { operatorId: op.id }))
        // A new customer with an operator, from «Assegna a te»: not to assign
        yield* given(() => waveCustomer(run.id, true, { operatorId: op.id }))
        // To assign: one new, one existing
        yield* given(() => waveCustomer(run.id, true))
        yield* given(() => waveCustomer(run.id, false))

        const wave = yield* read(run.id)

        expect(wave.alreadyAssigned).toEqual({
          toCall: 1,
          noAnswer: 1,
          recall: 1,
          outcome: 3,
          noContact: 2,
        })
        expect(wave.toAssign).toBe(2)
        expect(wave.origin).toEqual({
          new: { withOperator: 2, withoutOperator: 1 },
          existing: { withOperator: 6, withoutOperator: 1 },
          traceRebuilt: false,
        })
        expect(wave.parts.worked).toBe(4)
        // Each ring adds up to the customers of the Wave
        const outer =
          wave.toAssign +
          Object.values(wave.alreadyAssigned).reduce((a, b) => a + b)
        const inner =
          wave.origin.new.withOperator +
          wave.origin.new.withoutOperator +
          wave.origin.existing.withOperator +
          wave.origin.existing.withoutOperator
        const parts = Object.values(wave.parts).reduce((a, b) => a + b)
        expect([outer, inner, parts]).toEqual([10, 10, 10])
        expect(wave.customers).toBe(10)
      })
  )

  it.effect(
    "una Wave con la traccia ricostruita ha Nuovi a 0 e la bandiera",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const op = yield* given(() => createOperator())
        yield* given(() => waveCustomer(run.id, null))
        yield* given(() => waveCustomer(run.id, null, { operatorId: op.id }))
        yield* given(() => withContact(run.id, op.id, "chiamare", null))

        const wave = yield* read(run.id)

        expect(wave.origin).toEqual({
          new: { withOperator: 0, withoutOperator: 0 },
          existing: { withOperator: 2, withoutOperator: 1 },
          traceRebuilt: true,
        })
      })
  )
})

describe("team (Definizioni, AC12, AC19, AC23)", () => {
  it.effect(
    "inattivo dopo 7 giorni lavorati; chi non ha mai chiamato non lo è",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const idle = yield* given(() => createOperator({ name: "Ada" }))
        const busy = yield* given(() => createOperator({ name: "Bruno" }))
        const never = yield* given(() => createOperator({ name: "Carla" }))
        yield* given(() => call(idle.id, "2026-10-15"))
        for (const day of [16, 17, 18, 19, 20, 21, 22]) {
          yield* given(() => call(busy.id, `2026-10-${day}`))
        }

        const wave = yield* read(run.id)

        // 10 calendar days from 15 to 25 October
        expect(memberOf(wave, idle.id)?.inactiveDays).toBe(10)
        expect(memberOf(wave, busy.id)?.inactiveDays).toBeNull()
        expect(memberOf(wave, never.id)?.inactiveDays).toBeNull()
      })
  )

  it.effect(
    "i giorni senza chiamate del team non contano, né quelle di un utente disattivato",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const idle = yield* given(() => createOperator({ name: "Ada" }))
        const busy = yield* given(() => createOperator({ name: "Bruno" }))
        const gone = yield* given(() =>
          createOperator({ disabledAt: new Date("2026-10-24T10:00:00.000Z") })
        )
        yield* given(() => call(idle.id, "2026-10-10"))
        for (const day of [12, 14, 16, 18, 20, 22]) {
          yield* given(() => call(busy.id, `2026-10-${day}`))
        }
        yield* given(() => call(gone.id, "2026-10-23"))
        // Today isn't a worked day yet
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: busy.id,
            action: "call",
            fromState: null,
            toState: null,
            createdAt: new Date("2026-10-25T08:00:00.000Z"),
          })
        )

        const wave = yield* read(run.id)

        expect(memberOf(wave, idle.id)?.inactiveDays).toBeNull()
        expect(memberOf(wave, gone.id)).toBeUndefined()
      })
  )

  it.effect(
    "il ritmo: chiamate dei 30 giorni prima di oggi per giorni con chiamate, arrotondato",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const op = yield* given(() => createOperator())
        // 8 calls on 3 days: 2.67, shown as 3
        for (const day of [
          "2026-10-01",
          "2026-10-01",
          "2026-10-02",
          "2026-10-02",
        ]) {
          yield* given(() => call(op.id, day))
        }
        for (const day of [
          "2026-10-24",
          "2026-10-24",
          "2026-10-24",
          "2026-10-02",
        ]) {
          yield* given(() => call(op.id, day))
        }
        // Outside: 31 days before, and today
        yield* given(() => call(op.id, "2026-09-24"))
        yield* given(() => call(op.id, "2026-10-25"))

        const wave = yield* read(run.id)
        const member = memberOf(wave, op.id)

        expect(member?.pace).toBe(3)
        expect(member?.exactPace).toBeCloseTo(8 / 3)
      })
  )

  it.effect(
    "Attive e da fare nella Wave, e tutto il team con la bandiera delle persone mostrate",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun())
        const other = yield* given(() => insertRun({ fileName: "altra.xlsx" }))
        const op = yield* given(() => createOperator({ name: "Ugo" }))
        const idleOperator = yield* given(() =>
          createOperator({ name: "Zeno" })
        )
        const caller = yield* given(() =>
          createOperator({ role: "ADMIN", name: "Bea" })
        )
        const owner = yield* given(() =>
          createOperator({ role: "ADMIN", name: "Ciro" })
        )
        const quiet = yield* given(() =>
          createOperator({ role: "ADMIN", name: "Dino" })
        )
        yield* given(() => withContact(run.id, op.id, "chiamare"))
        yield* given(() => withContact(run.id, op.id, null))
        yield* given(() => withContact(run.id, op.id, "non risponde"))
        yield* given(() => withContact(run.id, op.id, "richiamare"))
        yield* given(() => withContact(other.id, op.id, "followup"))
        yield* given(() => withContact(other.id, owner.id, "app.to"))
        yield* given(() => call(caller.id, "2026-10-20"))

        const wave = yield* read(run.id)

        expect(memberOf(wave, op.id)).toMatchObject({
          active: 4,
          waveTodo: { toCall: 2, noAnswer: 1 },
          shown: true,
          role: "OPERATORE",
        })
        expect(memberOf(wave, idleOperator.id)).toMatchObject({
          shown: true,
          pace: 0,
          exactPace: 0,
          active: 0,
          waveTodo: { toCall: 0, noAnswer: 0 },
        })
        expect(memberOf(wave, caller.id)?.shown).toBe(true)
        expect(memberOf(wave, owner.id)).toMatchObject({
          shown: true,
          active: 0,
        })
        expect(memberOf(wave, quiet.id)).toMatchObject({
          shown: false,
          role: "ADMIN",
        })
        // The admins who started the two runs are in the team too
        expect(wave.team).toHaveLength(7)
        expect(wave.team.slice(0, 3).map((member) => member.name)).toEqual([
          expect.stringMatching(/^Bea /),
          expect.stringMatching(/^Ciro /),
          expect.stringMatching(/^Dino /),
        ])
      })
  )
})

describe("intestazione e scadenza (AC18, AC19, AC21)", () => {
  it.effect("nome senza estensione e scadenza da confermare", () =>
    Effect.gen(function* () {
      const run = yield* given(() => insertRun())

      const wave = yield* read(run.id)

      expect(wave).toMatchObject({
        name: "1026_WAVE_NOV",
        fileName: "1026_WAVE_NOV.xlsx",
        importedAt: new Date("2026-10-20T10:00:00.000Z"),
        today: "2026-10-25",
        deadline: null,
        status: "unconfirmed",
        workdaysLeft: null,
        daysSinceDeadline: null,
        customers: 0,
        toAssign: 0,
      })
    })
  )

  it.effect(
    "aperta fino alla scadenza compresa, con i giorni lavorativi rimasti",
    () =>
      Effect.gen(function* () {
        const today = yield* given(() => insertRun({ deadline: "2026-10-25" }))
        const later = yield* given(() => insertRun({ deadline: "2026-11-06" }))

        expect(yield* read(today.id)).toMatchObject({
          status: "open",
          workdaysLeft: 0,
          daysSinceDeadline: null,
        })
        // From Monday 26 October to Friday 6 November: 10 working days
        expect(yield* read(later.id)).toMatchObject({
          status: "open",
          workdaysLeft: 10,
        })
      })
  )

  it.effect("scaduta, con i giorni dalla scadenza", () =>
    Effect.gen(function* () {
      const run = yield* given(() => insertRun({ deadline: "2026-10-23" }))

      expect(yield* read(run.id)).toMatchObject({
        status: "expired",
        workdaysLeft: null,
        daysSinceDeadline: 2,
      })
    })
  )

  it.effect("una run Standard, in corso o che manca è WaveNotFound", () =>
    Effect.gen(function* () {
      const standard = yield* given(() => insertRun({ format: "standard" }))
      const running = yield* given(() => insertRun({ status: "running" }))
      yield* TestClock.setTime(NOW.getTime())

      for (const runId of [standard.id, running.id, 999_999]) {
        const exit = yield* readWave(runId).pipe(provideServer, Effect.exit)
        expect(failureTag(exit)).toBe("WaveNotFound")
      }
    })
  )
})
