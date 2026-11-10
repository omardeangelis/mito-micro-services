import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { type TaskStatus } from "@mito/domain/schemas"
import { migrateUpTo, resetDb } from "@/test/db"
import { provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createTaskEvent,
} from "@/test/factories"
import { getTeamDay } from "../teamDay"
import { getTeamDetail } from "../teamDetail"

// «Dettaglio giornaliero» (spec home-admin, AC7, AC28, AC29, D13, D14)

// 10:00 in Rome on 2 November 2026
const NOW = new Date("2026-11-02T09:00:00.000Z")
const MORNING = new Date("2026-11-02T08:00:00.000Z")
const YESTERDAY = new Date("2026-11-01T09:00:00.000Z")
// The last and the first instant around the midnight of Rome
const LAST_OF_YESTERDAY = new Date("2026-11-01T22:59:59.999Z")
const MIDNIGHT = new Date("2026-11-01T23:00:00.000Z")

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A contact of `operatorId` on a new customer */
const contactOf = (
  operatorId: number,
  values: Parameters<typeof createTask>[0] = {}
) =>
  given(async () => {
    const customer = await createCustomer({
      operatorId,
      name: "Mario",
      surname: "Rossi",
    })
    const contact = await createTask({
      customerId: customer.id,
      operatorId,
      ...values,
    })
    return { customer, contact }
  })

/** A call of `operatorId` that ended in `outcome`, on a new customer by default */
const callOf = (
  operatorId: number,
  {
    at = MORNING,
    outcome = "non risponde",
    ...values
  }: { at?: Date; outcome?: TaskStatus } & Partial<
    Parameters<typeof createTaskEvent>[0]
  > = {}
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
      ...values,
    })
  )

const atNow = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW.getTime())
    return yield* program
  })

const read = atNow(getTeamDetail().pipe(provideServer))

/** The row of `operatorId` */
const rowOf = (operatorId: number) =>
  read.pipe(
    Effect.map(({ members }) => {
      const row = members.find((member) => member.operatorId === operatorId)
      if (row === undefined) throw new Error(`No row for ${operatorId}`)
      return row
    })
  )

describe("le persone e le chiamate (AC7, AC28)", () => {
  it.effect(
    "dà l'istante e il giorno del Clock, senza persone nessuna riga",
    () =>
      Effect.gen(function* () {
        expect(yield* read).toEqual({
          now: NOW,
          today: "2026-11-02",
          members: [],
        })
      })
  )

  it.effect(
    "la somma delle calls è calls di getTeamDay, senza chi è disattivato",
    () =>
      Effect.gen(function* () {
        const admin = yield* given(() => createOperator({ role: "ADMIN" }))
        const ada = yield* given(() => createOperator())
        const gone = yield* given(() => createOperator({ disabledAt: NOW }))
        yield* given(() => createOperator())
        yield* callOf(admin.id, { outcome: "richiamare" })
        yield* callOf(ada.id, { outcome: "app.to" })
        yield* callOf(ada.id)
        yield* callOf(ada.id, { at: YESTERDAY })
        yield* callOf(gone.id)

        const { members } = yield* read
        const day = yield* atNow(getTeamDay().pipe(provideServer))

        expect(members).toHaveLength(3)
        expect(members.reduce((sum, { calls }) => sum + calls, 0)).toBe(
          day.calls
        )
        expect(day.calls).toBe(3)
      })
  )

  it.effect("le chiamate di una persona, risposte e appuntamenti", () =>
    Effect.gen(function* () {
      const ada = yield* given(() =>
        createOperator({ name: "Ada", surname: "Neri" })
      )
      yield* callOf(ada.id, { outcome: "app.to" })
      yield* callOf(ada.id, { outcome: "richiamare" })
      yield* callOf(ada.id)

      const row = yield* rowOf(ada.id)

      expect(row).toMatchObject({
        name: "Ada Neri",
        role: "OPERATORE",
        calls: 3,
        answered: 2,
        appointments: 1,
        lastCallAt: MORNING,
      })
      expect(row.todayCalls).toHaveLength(3)
    })
  )

  it.effect("chi non ha mai chiamato ha tutto a zero e lastCallAt null", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())

      expect(yield* rowOf(ada.id)).toMatchObject({
        calls: 0,
        answered: 0,
        appointments: 0,
        lastCallAt: null,
        inactiveDays: null,
        toCall: 0,
        neverCalled: 0,
        overdue: { total: 0, oldestDays: null, rows: [] },
        todayCalls: [],
      })
    })
  )

  it.effect(
    "chi non chiama da 7 giorni lavorati dopo l'ultima chiamata ha inactiveDays",
    () =>
      Effect.gen(function* () {
        const idle = yield* given(() => createOperator())
        const busy = yield* given(() => createOperator())
        yield* callOf(idle.id, { at: new Date("2026-10-20T10:00:00.000Z") })
        for (const day of [21, 22, 23, 24, 25, 26, 27]) {
          yield* callOf(busy.id, {
            at: new Date(`2026-10-${day}T10:00:00.000Z`),
          })
        }

        expect((yield* rowOf(idle.id)).inactiveDays).toBe(13)
        expect((yield* rowOf(busy.id)).inactiveDays).toBeNull()
      })
  )
})

describe("da chiamare e mai chiamati (AC28, D14)", () => {
  it.effect(
    "Da chiamare e Non risponde sono da chiamare, gli altri stati e i contatti chiusi no",
    () =>
      Effect.gen(function* () {
        const ada = yield* given(() => createOperator())
        yield* contactOf(ada.id, { state: "chiamare" })
        yield* contactOf(ada.id, { state: "non risponde" })
        yield* contactOf(ada.id, { state: "richiamare" })
        yield* contactOf(ada.id, { state: "chiamare", isActive: false })

        const row = yield* rowOf(ada.id)

        expect(row.toCall).toBe(2)
        expect(row.neverCalled).toBe(1)
      })
  )

  it.effect("una chiamata su un altro contatto del cliente lo toglie", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const bea = yield* given(() => createOperator())
      const { customer } = yield* contactOf(ada.id)
      const other = yield* given(() =>
        createTask({ customerId: customer.id, isActive: false, state: null })
      )
      yield* callOf(bea.id, {
        at: YESTERDAY,
        customerId: customer.id,
        taskId: other.id,
      })

      expect(yield* rowOf(ada.id)).toMatchObject({ toCall: 1, neverCalled: 0 })
    })
  )

  it.effect("un alert aperto lo toglie", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const { contact } = yield* contactOf(ada.id)
      yield* given(() =>
        createAlert({ taskId: contact.id, deadline: new Date(NOW.getTime()) })
      )

      expect(yield* rowOf(ada.id)).toMatchObject({ toCall: 1, neverCalled: 0 })
    })
  )

  it.effect("un alert risolto non lo toglie", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const { contact } = yield* contactOf(ada.id)
      yield* given(() =>
        createAlert({
          taskId: contact.id,
          deadline: YESTERDAY,
          isResolved: true,
        })
      )

      expect((yield* rowOf(ada.id)).neverCalled).toBe(1)
    })
  )

  it.effect("un «Contattato il» lo toglie", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      yield* contactOf(ada.id, { closedAt: YESTERDAY })

      expect(yield* rowOf(ada.id)).toMatchObject({ toCall: 1, neverCalled: 0 })
    })
  )

  it.effect("un contatto chiuso con un esito lo toglie", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const { customer } = yield* contactOf(ada.id)
      yield* given(() =>
        createTask({
          customerId: customer.id,
          isActive: false,
          state: "non interessato",
        })
      )

      expect(yield* rowOf(ada.id)).toMatchObject({ toCall: 1, neverCalled: 0 })
    })
  )

  it.effect("un «Contattato il» su un contatto chiuso lo toglie (OQ13)", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const { customer } = yield* contactOf(ada.id)
      yield* given(() =>
        createTask({
          customerId: customer.id,
          isActive: false,
          state: "followup",
          closedAt: YESTERDAY,
        })
      )

      expect(yield* rowOf(ada.id)).toMatchObject({ toCall: 1, neverCalled: 0 })
    })
  )
})

describe("gli arretrati (AC29, D14)", () => {
  /** A Da chiamare of `operatorId` with an open alert due at `deadline` */
  const callbackOf = (
    operatorId: number,
    deadline: Date,
    message = "Da richiamare"
  ) =>
    Effect.gen(function* () {
      const { customer, contact } = yield* contactOf(operatorId)
      const open = yield* given(() =>
        createAlert({ taskId: contact.id, deadline, message })
      )
      return { customer, contact, open }
    })

  it.effect(
    "una scadenza di ieri è arretrata, una di oggi no, a cavallo della mezzanotte di Roma",
    () =>
      Effect.gen(function* () {
        const ada = yield* given(() => createOperator())
        const late = yield* callbackOf(ada.id, LAST_OF_YESTERDAY)
        yield* callbackOf(ada.id, MIDNIGHT)
        yield* callbackOf(ada.id, NOW)

        expect((yield* rowOf(ada.id)).overdue).toEqual({
          total: 1,
          oldestDays: 1,
          rows: [
            {
              taskId: late.contact.id,
              name: "Mario Rossi",
              message: "Da richiamare",
              daysLate: 1,
              triedAt: null,
            },
          ],
        })
      })
  )

  it.effect("contano i contatti assegnati alla persona, non i clienti", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const bea = yield* given(() => createOperator())
      // A customer of Ada with the contact assigned to Bea
      const customer = yield* given(() =>
        createCustomer({ operatorId: ada.id })
      )
      const contact = yield* given(() =>
        createTask({ customerId: customer.id, operatorId: bea.id })
      )
      yield* given(() =>
        createAlert({ taskId: contact.id, deadline: YESTERDAY })
      )

      expect((yield* rowOf(ada.id)).overdue.total).toBe(0)
      expect((yield* rowOf(bea.id)).overdue.total).toBe(1)
    })
  )

  it.effect("un contatto chiuso e un alert risolto non contano", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const closed = yield* contactOf(ada.id, { isActive: false })
      yield* given(() =>
        createAlert({ taskId: closed.contact.id, deadline: YESTERDAY })
      )
      const solved = yield* contactOf(ada.id)
      yield* given(() =>
        createAlert({
          taskId: solved.contact.id,
          deadline: YESTERDAY,
          isResolved: true,
        })
      )

      expect((yield* rowOf(ada.id)).overdue.total).toBe(0)
    })
  )

  it.effect("il limite di 6 è per persona", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const bea = yield* given(() => createOperator())
      for (const operatorId of [ada.id, bea.id]) {
        for (const days of [2, 3, 4, 5, 6, 7, 8]) {
          yield* callbackOf(
            operatorId,
            new Date(NOW.getTime() - days * 86_400_000)
          )
        }
      }

      for (const operatorId of [ada.id, bea.id]) {
        const { overdue } = yield* rowOf(operatorId)
        expect(overdue.total).toBe(7)
        expect(overdue.oldestDays).toBe(8)
        expect(overdue.rows.map(({ daysLate }) => daysLate)).toEqual([
          8, 7, 6, 5, 4, 3,
        ])
      }
    })
  )

  it.effect("triedAt è il Non risponde di oggi, anche di un collega", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const bea = yield* given(() => createOperator())
      const { customer } = yield* callbackOf(ada.id, YESTERDAY)
      yield* callOf(bea.id, { customerId: customer.id })

      const { overdue } = yield* rowOf(ada.id)

      expect(overdue.rows[0]?.triedAt).toEqual(MORNING)
    })
  )

  it.effect(
    "un Non risponde di ieri e un altro esito di oggi non danno triedAt",
    () =>
      Effect.gen(function* () {
        const ada = yield* given(() => createOperator())
        const { customer } = yield* callbackOf(ada.id, YESTERDAY)
        yield* callOf(ada.id, {
          at: LAST_OF_YESTERDAY,
          customerId: customer.id,
        })
        yield* callOf(ada.id, {
          customerId: customer.id,
          outcome: "richiamare",
        })

        const { overdue } = yield* rowOf(ada.id)

        expect(overdue.rows[0]?.triedAt).toBeNull()
      })
  )
})

describe("le chiamate di oggi (AC29, D14)", () => {
  /** A customer of `operatorId` with a contact and an alert */
  const withAlert = (operatorId: number) =>
    Effect.gen(function* () {
      const { customer, contact } = yield* contactOf(operatorId)
      const open = yield* given(() =>
        createAlert({ taskId: contact.id, deadline: NOW, message: "Sera" })
      )
      return { customer, contact, open }
    })

  it.effect("dalla più recente, solo di oggi e solo della persona", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const bea = yield* given(() => createOperator())
      const first = yield* callOf(ada.id, { at: MIDNIGHT })
      const last = yield* callOf(ada.id, { at: MORNING })
      yield* callOf(ada.id, { at: LAST_OF_YESTERDAY })
      yield* callOf(bea.id)

      const { todayCalls } = yield* rowOf(ada.id)

      expect(todayCalls.map(({ id }) => id)).toEqual([last.id, first.id])
    })
  )

  it.effect("il messaggio c'è per un Richiamare", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const { customer, contact, open } = yield* withAlert(ada.id)
      const event = yield* callOf(ada.id, {
        customerId: customer.id,
        taskId: contact.id,
        alertId: open.id,
        outcome: "richiamare",
      })

      expect((yield* rowOf(ada.id)).todayCalls).toEqual([
        {
          id: event.id,
          at: MORNING,
          taskId: contact.id,
          name: "Mario Rossi",
          outcome: "richiamare",
          message: "Sera",
        },
      ])
    })
  )

  it.effect("il messaggio non c'è per un Non risponde", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      const { customer, contact, open } = yield* withAlert(ada.id)
      yield* callOf(ada.id, {
        customerId: customer.id,
        taskId: contact.id,
        alertId: open.id,
      })

      const [call] = (yield* rowOf(ada.id)).todayCalls

      expect(call?.outcome).toBe("non risponde")
      expect(call?.message).toBeNull()
    })
  )

  it.effect("una chiamata senza contatto ha taskId null", () =>
    Effect.gen(function* () {
      const ada = yield* given(() => createOperator())
      yield* callOf(ada.id, { taskId: null })

      const [call] = (yield* rowOf(ada.id)).todayCalls

      expect(call?.taskId).toBeNull()
    })
  )
})
