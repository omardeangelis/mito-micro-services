import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { task as taskTable } from "@mito/db/schema/task"
import { readWave } from "../../import/wave/read"
import { latestWaves } from "../latestWaves"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createTaskEvent,
} from "@/test/factories"

// The Waves of «Ultimi import» (spec home-admin, AC8–AC10, D3): the last 4
// completed, with the parts of their page and the distinct customers

// Rome: 2026-10-25, 12:00
const NOW = new Date("2026-10-25T10:00:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A completed Wave that ended on `day`, started a minute earlier by a new admin */
const insertRun = async (
  day: string,
  values: Partial<typeof importRun.$inferInsert> = {}
) => {
  const admin = await createOperator({ role: "ADMIN" })
  const [run] = await testDb
    .insert(importRun)
    .values({
      startedBy: admin.userId,
      fileName: `WAVE_${day}.xlsx`,
      format: "wave",
      status: "completed",
      rowsTotal: 10,
      rowsDiscarded: 0,
      startedAt: new Date(`${day}T09:59:00.000Z`),
      finishedAt: new Date(`${day}T10:00:00.000Z`),
      ...values,
    })
    .returning()
  return run!
}

/** Puts `customerId` in the Wave `runId` */
const inWave = (runId: number, customerId: string) =>
  testDb.insert(importRunCustomer).values({ runId, customerId, created: false })

/** A new customer of the Wave `runId`, without an operator */
const unassignedIn = async (runId: number) => {
  const customer = await createCustomer({ operatorId: null })
  await inWave(runId, customer.id)
  return customer
}

/** A new customer of the Wave `runId` with an active contact of `operatorId` */
const withContact = async (
  runId: number,
  operatorId: number,
  state: (typeof taskTable.$inferInsert)["state"]
) => {
  const customer = await createCustomer({ operatorId })
  await inWave(runId, customer.id)
  const contact = await createTask({
    customerId: customer.id,
    operatorId,
    state,
  })
  return { customer, contact }
}

const read = Effect.gen(function* () {
  yield* TestClock.setTime(NOW.getTime())
  return yield* latestWaves().pipe(provideServer)
})

const readWavePage = (runId: number) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW.getTime())
    return yield* readWave(runId).pipe(provideServer)
  })

describe("quali Wave (AC8)", () => {
  it.effect("senza Wave non c'è nessuna riga e i distinti sono 0", () =>
    Effect.gen(function* () {
      expect(yield* read).toEqual({
        today: "2026-10-25",
        rows: [],
        unassignedDistinct: 0,
        neverCalledDistinct: 0,
      })
    })
  )

  it.effect("di 5 Wave esce la più vecchia per ora di fine", () =>
    Effect.gen(function* () {
      const third = yield* given(() => insertRun("2026-10-03"))
      const oldest = yield* given(() => insertRun("2026-10-01"))
      const first = yield* given(() => insertRun("2026-10-05"))
      const fourth = yield* given(() => insertRun("2026-10-02"))
      const second = yield* given(() => insertRun("2026-10-04"))

      const { rows } = yield* read

      expect(rows.map(({ runId }) => runId)).toEqual([
        first.id,
        second.id,
        third.id,
        fourth.id,
      ])
      expect(rows.map(({ runId }) => runId)).not.toContain(oldest.id)
    })
  )

  it.effect("l'ordine è quello di fine, non quello di partenza", () =>
    Effect.gen(function* () {
      const startedFirst = yield* given(() =>
        insertRun("2026-10-05", {
          startedAt: new Date("2026-10-01T09:00:00.000Z"),
        })
      )
      const startedLast = yield* given(() => insertRun("2026-10-04"))

      const { rows } = yield* read

      expect(rows.map(({ runId }) => runId)).toEqual([
        startedFirst.id,
        startedLast.id,
      ])
    })
  )

  it.effect("una completata senza ora di fine viene dopo le altre", () =>
    Effect.gen(function* () {
      const unfinished = yield* given(() =>
        insertRun("2026-10-05", { finishedAt: null })
      )
      const finished = yield* given(() => insertRun("2026-10-01"))

      const { rows } = yield* read

      expect(rows.map(({ runId }) => runId)).toEqual([
        finished.id,
        unfinished.id,
      ])
    })
  )

  it.effect("gli import Standard e quelli falliti non compaiono", () =>
    Effect.gen(function* () {
      const wave = yield* given(() => insertRun("2026-10-01"))
      yield* given(() => insertRun("2026-10-02", { format: "standard" }))
      yield* given(() => insertRun("2026-10-03", { status: "failed" }))

      const { rows } = yield* read

      expect(rows.map(({ runId }) => runId)).toEqual([wave.id])
    })
  )
})

describe("una riga (AC10)", () => {
  it.effect("nome senza estensione, giorno di partenza e scadenza", () =>
    Effect.gen(function* () {
      const run = yield* given(() =>
        insertRun("2026-10-20", {
          fileName: "1026_WAVE_NOV.xlsx",
          deadline: "2026-11-30",
        })
      )

      const { rows } = yield* read

      expect(rows).toEqual([
        {
          runId: run.id,
          name: "1026_WAVE_NOV",
          importedAt: run.startedAt,
          deadline: "2026-11-30",
          status: "open",
          customers: 0,
          parts: {
            unassigned: 0,
            neverCalled: 0,
            calledNoOutcome: 0,
            worked: 0,
            noContact: 0,
          },
          people: [],
        },
      ])
    })
  )

  it.effect(
    "aperta fino al giorno di scadenza, scaduta dopo, non confermata senza",
    () =>
      Effect.gen(function* () {
        const today = yield* given(() =>
          insertRun("2026-10-04", { deadline: "2026-10-25" })
        )
        const yesterday = yield* given(() =>
          insertRun("2026-10-03", { deadline: "2026-10-24" })
        )
        const none = yield* given(() =>
          insertRun("2026-10-02", { deadline: null })
        )

        const { rows } = yield* read

        expect(rows.map(({ runId, status }) => ({ runId, status }))).toEqual([
          { runId: today.id, status: "open" },
          { runId: yesterday.id, status: "expired" },
          { runId: none.id, status: "unconfirmed" },
        ])
      })
  )

  it.effect(
    "le parti di ogni Wave sono quelle della sua pagina, e sommano ai clienti",
    () =>
      Effect.gen(function* () {
        const op = yield* given(() => createOperator())
        const first = yield* given(() => insertRun("2026-10-01"))
        const second = yield* given(() => insertRun("2026-10-02"))

        // Senza operatore: nessun contatto, e un contatto attivo senza operatore
        yield* given(() => unassignedIn(first.id))
        const orphan = yield* given(() => createCustomer({ operatorId: op.id }))
        yield* given(() => inWave(first.id, orphan.id))
        yield* given(() =>
          createTask({
            customerId: orphan.id,
            operatorId: null,
            state: "chiamare",
          })
        )
        // Mai chiamato
        yield* given(() => withContact(first.id, op.id, "chiamare"))
        // Chiamati, senza esito: un Non risponde, uno con una chiamata, uno
        // con un alert aperto
        yield* given(() => withContact(first.id, op.id, "non risponde"))
        const called = yield* given(() =>
          withContact(first.id, op.id, "chiamare")
        )
        yield* given(() =>
          createTaskEvent({
            actorOperatorId: op.id,
            action: "call",
            source: "list",
            fromState: null,
            toState: null,
            outcome: "non risponde",
            origin: "list",
            customerId: called.customer.id,
            createdAt: new Date("2026-10-22T10:00:00.000Z"),
          })
        )
        const reminded = yield* given(() =>
          withContact(first.id, op.id, "chiamare")
        )
        yield* given(() =>
          createAlert({
            taskId: reminded.contact.id,
            deadline: new Date("2026-10-26T10:00:00.000Z"),
          })
        )
        // Lavorati
        yield* given(() => withContact(first.id, op.id, "richiamare"))
        yield* given(() => withContact(first.id, op.id, "app.to"))
        // Con operatore, senza contatto
        const noContact = yield* given(() =>
          createCustomer({ operatorId: op.id })
        )
        yield* given(() => inWave(first.id, noContact.id))
        // Nella seconda Wave, un cliente in comune e uno suo
        yield* given(() => inWave(second.id, called.customer.id))
        yield* given(() => withContact(second.id, op.id, "chiamare"))

        const { rows } = yield* read
        const firstPage = yield* readWavePage(first.id)
        const secondPage = yield* readWavePage(second.id)

        const row = (runId: number) =>
          rows.find((wave) => wave.runId === runId)!
        expect(row(first.id).customers).toBe(firstPage.customers)
        expect(row(first.id).parts).toEqual(firstPage.parts)
        expect(row(second.id).customers).toBe(secondPage.customers)
        expect(row(second.id).parts).toEqual(secondPage.parts)
        expect(row(first.id).parts).toEqual({
          unassigned: 2,
          neverCalled: 1,
          calledNoOutcome: 3,
          worked: 2,
          noContact: 1,
        })
        const {
          unassigned,
          neverCalled,
          calledNoOutcome,
          worked,
          noContact: none,
        } = row(first.id).parts
        expect(unassigned + neverCalled + calledNoOutcome + worked + none).toBe(
          row(first.id).customers
        )
      })
  )
})

describe("i clienti distinti (AC9)", () => {
  it.effect(
    "un cliente in due Wave conta in ognuna e una volta nel riepilogo",
    () =>
      Effect.gen(function* () {
        const op = yield* given(() => createOperator())
        const older = yield* given(() => insertRun("2026-10-01"))
        const newer = yield* given(() => insertRun("2026-10-02"))
        const unassigned = yield* given(() => unassignedIn(older.id))
        yield* given(() => inWave(newer.id, unassigned.id))
        const neverCalled = yield* given(() =>
          withContact(older.id, op.id, "chiamare")
        )
        yield* given(() => inWave(newer.id, neverCalled.customer.id))
        // Solo nella Wave più recente
        yield* given(() => unassignedIn(newer.id))
        yield* given(() => withContact(newer.id, op.id, "chiamare"))

        const waves = yield* read

        expect(
          waves.rows.map(({ runId, customers, parts }) => ({
            runId,
            customers,
            unassigned: parts.unassigned,
            neverCalled: parts.neverCalled,
          }))
        ).toEqual([
          { runId: newer.id, customers: 4, unassigned: 2, neverCalled: 2 },
          { runId: older.id, customers: 2, unassigned: 1, neverCalled: 1 },
        ])
        expect(waves.unassignedDistinct).toBe(2)
        expect(waves.neverCalledDistinct).toBe(2)
      })
  )

  it.effect("una Wave fuori dalle ultime 4 non entra nel riepilogo", () =>
    Effect.gen(function* () {
      const oldest = yield* given(() => insertRun("2026-10-01"))
      yield* given(() => unassignedIn(oldest.id))
      yield* given(() => insertRun("2026-10-02"))
      yield* given(() => insertRun("2026-10-03"))
      yield* given(() => insertRun("2026-10-04"))
      const latest = yield* given(() => insertRun("2026-10-05"))
      yield* given(() => unassignedIn(latest.id))

      const waves = yield* read

      expect(waves.unassignedDistinct).toBe(1)
    })
  )
})

describe("le persone di una Wave (AC12)", () => {
  it.effect(
    "ha le due persone con i loro da chiamare e mai chiamati, e non quella senza contatti",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun("2026-10-20"))
        const ada = yield* given(() => createOperator({ name: "Ada" }))
        const bruno = yield* given(() => createOperator({ name: "Bruno" }))
        yield* given(() => createOperator({ name: "Carla" }))
        yield* given(() => withContact(run.id, ada.id, "chiamare"))
        yield* given(() => withContact(run.id, ada.id, "chiamare"))
        yield* given(() => withContact(run.id, ada.id, "non risponde"))
        yield* given(() => withContact(run.id, bruno.id, "chiamare"))
        yield* given(() => withContact(run.id, bruno.id, "app.to"))

        const { rows } = yield* read

        expect(
          [...rows[0]!.people]
            .sort((a, b) => a.operatorId - b.operatorId)
            .map(({ operatorId, toCall, neverCalled, inactiveDays }) => ({
              operatorId,
              toCall,
              neverCalled,
              inactiveDays,
            }))
        ).toEqual([
          {
            operatorId: ada.id,
            toCall: 3,
            neverCalled: 2,
            inactiveDays: null,
          },
          {
            operatorId: bruno.id,
            toCall: 1,
            neverCalled: 1,
            inactiveDays: null,
          },
        ])
      })
  )
  it.effect(
    "i mai chiamati di una persona sommano quelli della Wave quando tutti gli assegnati sono del team",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun("2026-10-20"))
        const ada = yield* given(() => createOperator({ name: "Ada" }))
        const bruno = yield* given(() => createOperator({ name: "Bruno" }))
        yield* given(() => withContact(run.id, ada.id, "chiamare"))
        yield* given(() => withContact(run.id, ada.id, "non risponde"))
        yield* given(() => withContact(run.id, bruno.id, "chiamare"))
        yield* given(() => withContact(run.id, bruno.id, "chiamare"))
        yield* given(() => withContact(run.id, bruno.id, "richiamare"))

        const { rows } = yield* read

        const people = rows[0]!.people
        expect(people).toHaveLength(2)
        expect(people.reduce((sum, p) => sum + p.neverCalled, 0)).toBe(
          rows[0]!.parts.neverCalled
        )
      })
  )

  it.effect("un utente fuori dal team non compare", () =>
    Effect.gen(function* () {
      const run = yield* given(() => insertRun("2026-10-20"))
      const ada = yield* given(() => createOperator({ name: "Ada" }))
      const gone = yield* given(() =>
        createOperator({ name: "Zeno", disabledAt: NOW })
      )
      yield* given(() => withContact(run.id, ada.id, "chiamare"))
      yield* given(() => withContact(run.id, gone.id, "chiamare"))

      const { rows } = yield* read

      expect(rows[0]!.people.map(({ operatorId }) => operatorId)).toEqual([
        ada.id,
      ])
    })
  )

  it.effect("una persona con 0 da chiamare esce", () =>
    Effect.gen(function* () {
      const run = yield* given(() => insertRun("2026-10-20"))
      const ada = yield* given(() => createOperator({ name: "Ada" }))
      const bruno = yield* given(() => createOperator({ name: "Bruno" }))
      yield* given(() => withContact(run.id, ada.id, "chiamare"))
      yield* given(() => withContact(run.id, bruno.id, "richiamare"))
      yield* given(() => withContact(run.id, bruno.id, "app.to"))

      const { rows } = yield* read

      expect(rows[0]!.people.map(({ operatorId }) => operatorId)).toEqual([
        ada.id,
      ])
    })
  )

  it.effect(
    "inattivo da quanti giorni è uguale a quello del team della pagina",
    () =>
      Effect.gen(function* () {
        const run = yield* given(() => insertRun("2026-10-20"))
        const idle = yield* given(() => createOperator({ name: "Ada" }))
        const busy = yield* given(() => createOperator({ name: "Bruno" }))
        yield* given(() => withContact(run.id, idle.id, "chiamare"))
        yield* given(() => withContact(run.id, busy.id, "chiamare"))
        const call = (operatorId: number, day: string) =>
          createTaskEvent({
            actorOperatorId: operatorId,
            action: "call",
            source: "list",
            fromState: null,
            toState: null,
            outcome: "non risponde",
            origin: "list",
            createdAt: new Date(`${day}T10:00:00.000Z`),
          })
        yield* given(() => call(idle.id, "2026-10-15"))
        for (const day of [16, 17, 18, 19, 20, 21, 22]) {
          yield* given(() => call(busy.id, `2026-10-${day}`))
        }

        const { rows } = yield* read
        const page = yield* readWavePage(run.id)

        const inactive = (id: number) =>
          rows[0]!.people.find((person) => person.operatorId === id)
            ?.inactiveDays
        expect(inactive(idle.id)).toBe(10)
        expect(inactive(idle.id)).toBe(
          page.team.find((member) => member.operatorId === idle.id)
            ?.inactiveDays
        )
        expect(inactive(busy.id)).toBeNull()
      })
  )

  it.effect("la persona è quella del contatto, non quella del cliente", () =>
    Effect.gen(function* () {
      const run = yield* given(() => insertRun("2026-10-20"))
      const ofCustomer = yield* given(() => createOperator({ name: "Ada" }))
      const ofContact = yield* given(() => createOperator({ name: "Bruno" }))
      const customer = yield* given(() =>
        createCustomer({ operatorId: ofCustomer.id })
      )
      yield* given(() => inWave(run.id, customer.id))
      yield* given(() =>
        createTask({
          customerId: customer.id,
          operatorId: ofContact.id,
          state: "chiamare",
        })
      )

      const { rows } = yield* read

      expect(rows[0]!.people).toMatchObject([
        { operatorId: ofContact.id, toCall: 1, neverCalled: 1 },
      ])
    })
  )

  it.effect("una Wave senza clienti ha nessuna persona", () =>
    Effect.gen(function* () {
      yield* given(() => insertRun("2026-10-20"))
      yield* given(() => createOperator({ name: "Ada" }))

      const { rows } = yield* read

      expect(rows[0]!.people).toEqual([])
    })
  )
})
