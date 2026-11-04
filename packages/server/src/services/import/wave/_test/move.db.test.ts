import { beforeAll, beforeEach } from "vitest"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestClock } from "effect/testing"
import { asc, count, eq } from "drizzle-orm"
import { type TaskStatus } from "@mito/domain/schemas"
import { chat } from "@mito/db/schema/chat"
import { customers as customersTable } from "@mito/db/schema/customers"
import { importRun, importRunCustomer } from "@mito/db/schema/importRun"
import { operators } from "@mito/db/schema/operators"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { users } from "@mito/db/schema/users"
import { waveOperation } from "@mito/db/schema/waveOperation"
import { type MoveRequest, move, moveCandidates } from "../move"
import {
  activeTasksOf,
  customerRow,
  logOf,
  migrateUpTo,
  resetDb,
  tasksOf,
  testDb,
} from "@/test/db"
import { failureTag, provideServer } from "@/test/effect"
import {
  createAlert,
  createCustomer,
  createOperator,
  createTask,
  createTaskEvent,
} from "@/test/factories"

// «Sposta» of a Wave (T8, AC24, AC26, AC16; D4, D6, D7, D11, D13): the
// contacts chosen from the candidates go to the receivers, those that changed
// since are skipped

beforeAll(async () => {
  await migrateUpTo()
})

beforeEach(async () => {
  await resetDb()
})

const given = <A>(setup: () => Promise<A>) => Effect.promise(setup)

/** A completed Wave started by `admin` */
const insertRun = async (admin: { userId: string }) => {
  const [run] = await testDb
    .insert(importRun)
    .values({
      startedBy: admin.userId,
      fileName: "1026_WAVE_NOV.xlsx",
      format: "wave",
      status: "completed",
      rowsTotal: 10,
      rowsDiscarded: 0,
    })
    .returning()
  return run!
}

/**
 * A customer of `operator` with an active contact in `state` created at
 * `createdAt`, in the Wave `runId` unless `inWave` is false
 */
const contactOf = async (
  runId: number,
  operator: { id: number },
  {
    state = "chiamare",
    createdAt,
    inWave = true,
  }: { state?: TaskStatus | null; createdAt?: Date; inWave?: boolean } = {}
) => {
  const customer = await createCustomer({ operatorId: operator.id })
  if (inWave) {
    await testDb
      .insert(importRunCustomer)
      .values({ runId, customerId: customer.id, created: true })
  }
  const contact = await createTask({
    customerId: customer.id,
    operatorId: operator.id,
    state,
    ...(createdAt && { createdAt }),
  })
  return { customer, contact }
}

const day = (n: number) => new Date(Date.UTC(2026, 9, n))

/** A Wave of a new admin, with Ada, Bruno and Carla */
const seed = given(async () => {
  const admin = await createOperator({ role: "ADMIN" })
  const ada = await createOperator({ name: "Ada", surname: "" })
  const bruno = await createOperator({ name: "Bruno", surname: "" })
  const carla = await createOperator({ name: "Carla", surname: "" })
  const run = await insertRun(admin)
  return { admin, ada, bruno, carla, run }
})

const run = (request: MoveRequest) => move(request).pipe(provideServer)

describe("move: contatti cambiati fra anteprima e conferma (AC26, D13)", () => {
  it.effect(
    "3 Da chiamare di Carla verso Ada, uno passato a Richiamo dopo i candidati: 2 spostati, 1 saltato e lasciato a Carla in Richiamo",
    () =>
      Effect.gen(function* () {
        const { admin, ada, carla, run: wave } = yield* seed
        const seeded = yield* given(async () => [
          await contactOf(wave.id, carla, { createdAt: day(1) }),
          await contactOf(wave.id, carla, { createdAt: day(2) }),
          await contactOf(wave.id, carla, { createdAt: day(3) }),
        ])
        const { candidates } = yield* moveCandidates(wave.id, [carla.id]).pipe(
          provideServer
        )
        const taskIds = candidates[0]!.contacts.map((c) => c.taskId)
        // Carla records a callback on the second after the preview
        yield* given(() =>
          testDb
            .update(task)
            .set({ state: "richiamare" })
            .where(eq(task.id, seeded[1]!.contact.id))
        )

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "toCall",
          strategy: "equal",
          contacts: [{ fromOperatorId: carla.id, taskIds }],
          receivers: [{ operatorId: ada.id, count: 3 }],
        })

        expect(result).toEqual({
          moved: 2,
          skipped: 1,
          byOperator: [{ operatorId: ada.id, count: 2 }],
        })
        const owners = []
        for (const { customer } of seeded) {
          const [contact] = yield* given(() => tasksOf(customer.id))
          owners.push([contact!.operatorId, contact!.state])
        }
        expect(owners).toEqual([
          [ada.id, "chiamare"],
          [carla.id, "richiamare"],
          [ada.id, "chiamare"],
        ])
      })
  )
})

/** What a write leaves: the tasks with their operator, the log, the operations */
const written = given(async () => {
  const tasks = await testDb
    .select({ id: task.id, operatorId: task.operatorId, state: task.state })
    .from(task)
    .orderBy(asc(task.id))
  const owners = await testDb
    .select({ id: customersTable.id, operatorId: customersTable.operatorId })
    .from(customersTable)
    .orderBy(asc(customersTable.id))
  const [log] = await testDb.select({ n: count() }).from(taskEventLog)
  const [operations] = await testDb.select({ n: count() }).from(waveOperation)
  return { tasks, owners, log: log!.n, operations: operations!.n }
})

/** The candidates of `from`, as `move` takes their task ids */
const candidatesOf = (runId: number, from: number[]) =>
  moveCandidates(runId, from).pipe(provideServer)

describe("moveCandidates (D7)", () => {
  it.effect(
    "per persona i contatti attivi Da chiamare e Non risponde della Wave, in ordine di creazione e poi di id",
    () =>
      Effect.gen(function* () {
        const { bruno, carla, run: wave } = yield* seed
        const same = day(2)
        const c = yield* given(async () => ({
          late: await contactOf(wave.id, carla, { createdAt: day(5) }),
          noAnswer: await contactOf(wave.id, carla, {
            state: "non risponde",
            createdAt: same,
          }),
          tie: await contactOf(wave.id, carla, {
            state: "followup",
            createdAt: same,
          }),
          first: await contactOf(wave.id, carla, {
            state: null,
            createdAt: day(1),
          }),
          callback: await contactOf(wave.id, carla, { state: "richiamare" }),
          outside: await contactOf(wave.id, carla, { inWave: false }),
          ofBruno: await contactOf(wave.id, bruno, { state: "nessuno" }),
        }))
        // A closed contact of Carla on a customer of the Wave
        yield* given(() =>
          createTask({
            customerId: c.callback.customer.id,
            operatorId: carla.id,
            isActive: false,
          })
        )

        const result = yield* candidatesOf(wave.id, [carla.id, bruno.id])

        expect(result).toEqual({
          candidates: [
            {
              operatorId: carla.id,
              contacts: [
                { taskId: c.first.contact.id, state: "toCall" },
                { taskId: c.noAnswer.contact.id, state: "noAnswer" },
                { taskId: c.tie.contact.id, state: "toCall" },
                { taskId: c.late.contact.id, state: "toCall" },
              ],
            },
            {
              operatorId: bruno.id,
              contacts: [{ taskId: c.ofBruno.contact.id, state: "toCall" }],
            },
          ],
        })
      })
  )

  it.effect("un import che non è una Wave completata: WaveNotFound", () =>
    Effect.gen(function* () {
      const { carla, run: wave } = yield* seed
      yield* given(() =>
        testDb
          .update(importRun)
          .set({ format: "standard" })
          .where(eq(importRun.id, wave.id))
      )

      for (const runId of [wave.id, 999_999]) {
        const exit = yield* moveCandidates(runId, [carla.id]).pipe(
          provideServer,
          Effect.exit
        )
        expect(failureTag(exit)).toBe("WaveNotFound")
      }
    })
  )
})

describe("move: scrittura (AC26, D13)", () => {
  it.effect(
    "contatto e cliente passano a chi riceve con stato, alert e chat invariati e i log bulk, senza contatti nuovi",
    () =>
      Effect.gen(function* () {
        const { admin, ada, carla, run: wave } = yield* seed
        const { customer, contact } = yield* given(() =>
          contactOf(wave.id, carla, { state: "non risponde" })
        )
        const open = yield* given(() =>
          createAlert({
            taskId: contact.id,
            deadline: new Date("2026-10-20T22:00:00Z"),
          })
        )
        const chatId = yield* given(async () => {
          const [created] = await testDb.insert(chat).values({}).returning()
          await testDb
            .update(customersTable)
            .set({ chatId: created!.id })
            .where(eq(customersTable.id, customer.id))
          await testDb
            .insert(chatToOperator)
            .values({ chatId: created!.id, operatorId: carla.id })
          return created!.id
        })

        yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "both",
          strategy: "pace",
          contacts: [{ fromOperatorId: carla.id, taskIds: [contact.id] }],
          receivers: [{ operatorId: ada.id, count: 1 }],
        })

        expect(yield* given(() => tasksOf(customer.id))).toMatchObject([
          {
            id: contact.id,
            isActive: true,
            state: "non risponde",
            alertId: open.id,
            operatorId: ada.id,
          },
        ])
        const row = yield* given(() => customerRow(customer.id))
        expect(row).toMatchObject({ operatorId: ada.id, chatId })
        expect(
          yield* given(() =>
            testDb
              .select()
              .from(chatToOperator)
              .where(eq(chatToOperator.chatId, chatId))
          )
        ).toEqual([{ chatId, operatorId: carla.id }])
        expect(yield* given(() => logOf(customer.id))).toMatchObject([
          {
            action: "operator_reassign",
            source: "bulk",
            taskId: null,
            fromOperatorId: carla.id,
            toOperatorId: ada.id,
            actorOperatorId: admin.id,
          },
          {
            action: "operator_reassign",
            source: "bulk",
            taskId: contact.id,
            fromOperatorId: carla.id,
            toOperatorId: ada.id,
            actorOperatorId: admin.id,
          },
        ])
      })
  )

  it.effect(
    "a blocchi in ordine di nome e di creazione: Bruno 1 e Ada 2 nella richiesta, Ada prende i primi due",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, carla, run: wave } = yield* seed
        const seeded = yield* given(async () => [
          await contactOf(wave.id, carla, { createdAt: day(1) }),
          await contactOf(wave.id, carla, { createdAt: day(2) }),
          await contactOf(wave.id, carla, { createdAt: day(3) }),
        ])

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "toCall",
          strategy: "equal",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: seeded.map((s) => s.contact.id).reverse(),
            },
          ],
          receivers: [
            { operatorId: bruno.id, count: 1 },
            { operatorId: ada.id, count: 2 },
          ],
        })

        const owners = []
        for (const { customer } of seeded) {
          const [contact] = yield* given(() => activeTasksOf(customer.id))
          const row = yield* given(() => customerRow(customer.id))
          expect(row.operatorId).toBe(contact!.operatorId)
          owners.push(contact!.operatorId)
        }
        expect(owners).toEqual([ada.id, ada.id, bruno.id])
        expect(result).toEqual({
          moved: 3,
          skipped: 0,
          byOperator: [
            { operatorId: bruno.id, count: 1 },
            { operatorId: ada.id, count: 2 },
          ],
        })
      })
  )

  it.effect(
    "un Non risponde riaperto in Da chiamare dopo i candidati: la riga vecchia, disattivata, non si sposta e il cliente resta con l'operatore del contatto nuovo",
    () =>
      Effect.gen(function* () {
        const { admin, ada, carla, run: wave } = yield* seed
        const reopened = yield* given(() =>
          contactOf(wave.id, carla, {
            state: "non risponde",
            createdAt: day(1),
          })
        )
        const other = yield* given(() =>
          contactOf(wave.id, carla, {
            state: "non risponde",
            createdAt: day(2),
          })
        )
        const { candidates } = yield* candidatesOf(wave.id, [carla.id])
        // The reopening of `replaceActiveContact`: the old row inactive with
        // its state and operator, a new active one Da chiamare
        const fresh = yield* given(async () => {
          await testDb
            .update(task)
            .set({ isActive: false })
            .where(eq(task.id, reopened.contact.id))
          return createTask({
            customerId: reopened.customer.id,
            operatorId: carla.id,
            state: "chiamare",
          })
        })

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "both",
          strategy: "equal",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: candidates[0]!.contacts.map((c) => c.taskId),
            },
          ],
          receivers: [{ operatorId: ada.id, count: 2 }],
        })

        expect(result).toMatchObject({ moved: 1, skipped: 1 })
        expect(yield* given(() => tasksOf(reopened.customer.id))).toMatchObject(
          [
            {
              id: reopened.contact.id,
              isActive: false,
              state: "non risponde",
              operatorId: carla.id,
            },
            { id: fresh.id, isActive: true, operatorId: carla.id },
          ]
        )
        expect(
          (yield* given(() => customerRow(reopened.customer.id))).operatorId
        ).toBe(carla.id)
        expect(yield* given(() => logOf(reopened.customer.id))).toEqual([])
        expect(
          (yield* given(() => customerRow(other.customer.id))).operatorId
        ).toBe(ada.id)
      })
  )

  it.effect(
    "il contatto di un cliente fuori dalla Wave e quello di un'altra persona nella lista: saltati",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, carla, run: wave } = yield* seed
        const inWave = yield* given(() => contactOf(wave.id, carla))
        const outside = yield* given(() =>
          contactOf(wave.id, carla, { inWave: false })
        )
        const ofBruno = yield* given(() => contactOf(wave.id, bruno))

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "both",
          strategy: "equal",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: [
                inWave.contact.id,
                outside.contact.id,
                ofBruno.contact.id,
              ],
            },
          ],
          receivers: [{ operatorId: ada.id, count: 3 }],
        })

        expect(result).toEqual({
          moved: 1,
          skipped: 2,
          byOperator: [{ operatorId: ada.id, count: 1 }],
        })
        const ownerOf = (customerId: string) =>
          given(async () => (await customerRow(customerId)).operatorId)
        expect(yield* ownerOf(inWave.customer.id)).toBe(ada.id)
        expect(yield* ownerOf(outside.customer.id)).toBe(carla.id)
        expect(yield* ownerOf(ofBruno.customer.id)).toBe(bruno.id)
        expect(yield* given(() => tasksOf(ofBruno.customer.id))).toMatchObject([
          { operatorId: bruno.id },
        ])
      })
  )
})

describe("move: ridivisione (AC26, D6)", () => {
  it.effect(
    "un saltato con «In parti uguali» su 2 riceventi: i 3 rimasti divisi di nuovo, Ada 2 e Bruno 1",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, carla, run: wave } = yield* seed
        const seeded = yield* given(async () => [
          await contactOf(wave.id, carla, { createdAt: day(1) }),
          await contactOf(wave.id, carla, { createdAt: day(2) }),
          await contactOf(wave.id, carla, { createdAt: day(3) }),
          await contactOf(wave.id, carla, { createdAt: day(4) }),
        ])
        yield* given(() =>
          testDb
            .update(task)
            .set({ state: "app.to" })
            .where(eq(task.id, seeded[0]!.contact.id))
        )

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "toCall",
          strategy: "equal",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: seeded.map((s) => s.contact.id),
            },
          ],
          receivers: [
            { operatorId: bruno.id, count: 2 },
            { operatorId: ada.id, count: 2 },
          ],
        })

        expect(result).toEqual({
          moved: 3,
          skipped: 1,
          byOperator: [
            { operatorId: bruno.id, count: 1 },
            { operatorId: ada.id, count: 2 },
          ],
        })
        const owners = []
        for (const { customer } of seeded) {
          owners.push((yield* given(() => customerRow(customer.id))).operatorId)
        }
        expect(owners).toEqual([carla.id, ada.id, ada.id, bruno.id])
      })
  )
})

describe("move: ridivisione con «Pareggia i carichi» (AC26, D6)", () => {
  it.effect(
    "un saltato: i 2 rimasti vanno sugli «Attive» del momento, tutti ad Ada che non ne ha",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, carla, run: wave } = yield* seed
        const seeded = yield* given(async () => [
          await contactOf(wave.id, carla, { createdAt: day(1) }),
          await contactOf(wave.id, carla, { createdAt: day(2) }),
          await contactOf(wave.id, carla, { createdAt: day(3) }),
        ])
        // Bruno has 2 active contacts outside the Wave
        yield* given(async () => {
          await contactOf(wave.id, bruno, { inWave: false })
          await contactOf(wave.id, bruno, { inWave: false })
        })
        yield* given(() =>
          testDb
            .update(task)
            .set({ state: "non interessato" })
            .where(eq(task.id, seeded[2]!.contact.id))
        )

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "toCall",
          strategy: "level",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: seeded.map((s) => s.contact.id),
            },
          ],
          receivers: [
            { operatorId: ada.id, count: 2 },
            { operatorId: bruno.id, count: 1 },
          ],
        })

        expect(result).toEqual({
          moved: 2,
          skipped: 1,
          byOperator: [
            { operatorId: ada.id, count: 2 },
            { operatorId: bruno.id, count: 0 },
          ],
        })
      })
  )
})

describe("move: rifiuti (AC16, AC26)", () => {
  it.effect("tutti saltati: NothingToMove e nulla scritto", () =>
    Effect.gen(function* () {
      const { admin, ada, carla, run: wave } = yield* seed
      const seeded = yield* given(async () => [
        await contactOf(wave.id, carla, { state: "richiamare" }),
        await contactOf(wave.id, carla, { state: "non risponde" }),
      ])
      const before = yield* written

      const exit = yield* move({
        runId: wave.id,
        requestId: crypto.randomUUID(),
        actorOperatorId: admin.id,
        which: "toCall",
        strategy: "equal",
        contacts: [
          {
            fromOperatorId: carla.id,
            taskIds: seeded.map((s) => s.contact.id),
          },
        ],
        receivers: [{ operatorId: ada.id, count: 2 }],
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("NothingToMove")
      expect(yield* written).toEqual(before)
    })
  )

  it.effect(
    "chi cede o chi riceve disattivato, o quote che non tornano: NumbersChanged e nulla scritto",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, carla, run: wave } = yield* seed
        const { contact } = yield* given(() => contactOf(wave.id, carla))
        const disabled = yield* given(() =>
          createOperator({ name: "Dario", disabledAt: new Date() })
        )
        const ofDario = yield* given(() => contactOf(wave.id, disabled))
        const before = yield* written

        const requests: MoveRequest[] = [
          // A disabled giver
          {
            runId: wave.id,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            which: "both",
            strategy: "equal",
            contacts: [
              { fromOperatorId: disabled.id, taskIds: [ofDario.contact.id] },
            ],
            receivers: [{ operatorId: ada.id, count: 1 }],
          },
          // A disabled receiver
          {
            runId: wave.id,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            which: "both",
            strategy: "equal",
            contacts: [{ fromOperatorId: carla.id, taskIds: [contact.id] }],
            receivers: [{ operatorId: disabled.id, count: 1 }],
          },
          // Counts that don't add up to the contacts
          {
            runId: wave.id,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            which: "both",
            strategy: "equal",
            contacts: [{ fromOperatorId: carla.id, taskIds: [contact.id] }],
            receivers: [
              { operatorId: ada.id, count: 1 },
              { operatorId: bruno.id, count: 1 },
            ],
          },
          // A negative count
          {
            runId: wave.id,
            requestId: crypto.randomUUID(),
            actorOperatorId: admin.id,
            which: "both",
            strategy: "equal",
            contacts: [{ fromOperatorId: carla.id, taskIds: [contact.id] }],
            receivers: [
              { operatorId: ada.id, count: 2 },
              { operatorId: bruno.id, count: -1 },
            ],
          },
        ]
        for (const request of requests) {
          const exit = yield* move(request).pipe(provideServer, Effect.exit)
          expect(failureTag(exit)).toBe("NumbersChanged")
        }
        expect(yield* written).toEqual(before)
      })
  )

  it.effect("un cedente disattivato dopo i candidati: NumbersChanged", () =>
    Effect.gen(function* () {
      const { admin, ada, carla, run: wave } = yield* seed
      yield* given(() => contactOf(wave.id, carla))
      const { candidates } = yield* candidatesOf(wave.id, [carla.id])
      yield* given(() =>
        testDb
          .update(users)
          .set({ disabledAt: new Date() })
          .where(eq(users.id, carla.userId))
      )
      const before = yield* written

      const exit = yield* move({
        runId: wave.id,
        requestId: crypto.randomUUID(),
        actorOperatorId: admin.id,
        which: "both",
        strategy: "equal",
        contacts: [
          {
            fromOperatorId: carla.id,
            taskIds: candidates[0]!.contacts.map((c) => c.taskId),
          },
        ],
        receivers: [{ operatorId: ada.id, count: 1 }],
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("NumbersChanged")
      expect(yield* written).toEqual(before)
    })
  )

  it.effect("una Wave che non c'è o non è completata: WaveNotFound", () =>
    Effect.gen(function* () {
      const { admin, ada, carla, run: wave } = yield* seed
      const { contact } = yield* given(() => contactOf(wave.id, carla))
      yield* given(() =>
        testDb
          .update(importRun)
          .set({ status: "running" })
          .where(eq(importRun.id, wave.id))
      )

      for (const runId of [wave.id, 999_999]) {
        const exit = yield* move({
          runId,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "both",
          strategy: "equal",
          contacts: [{ fromOperatorId: carla.id, taskIds: [contact.id] }],
          receivers: [{ operatorId: ada.id, count: 1 }],
        }).pipe(provideServer, Effect.exit)
        expect(failureTag(exit)).toBe("WaveNotFound")
      }
    })
  )
})

describe("move: stesso requestId (D4)", () => {
  it.effect(
    "due volte: una scrittura e lo stesso risultato, anche se i contatti sono già spostati",
    () =>
      Effect.gen(function* () {
        const { admin, ada, carla, run: wave } = yield* seed
        const { contact } = yield* given(() => contactOf(wave.id, carla))
        const request: MoveRequest = {
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "toCall",
          strategy: "pace",
          contacts: [{ fromOperatorId: carla.id, taskIds: [contact.id] }],
          receivers: [{ operatorId: ada.id, count: 1 }],
        }

        const first = yield* run(request)
        const after = yield* written
        const again = yield* run(request)

        expect(again).toEqual(first)
        expect(first).toEqual({
          moved: 1,
          skipped: 0,
          byOperator: [{ operatorId: ada.id, count: 1 }],
        })
        expect(yield* written).toEqual(after)
        expect(after.operations).toBe(1)
      })
  )

  it.effect("con un'altra scelta: RequestIdConflict e nulla scritto", () =>
    Effect.gen(function* () {
      const { admin, ada, bruno, carla, run: wave } = yield* seed
      const { contact } = yield* given(() => contactOf(wave.id, carla))
      const request: MoveRequest = {
        runId: wave.id,
        requestId: crypto.randomUUID(),
        actorOperatorId: admin.id,
        which: "toCall",
        strategy: "equal",
        contacts: [{ fromOperatorId: carla.id, taskIds: [contact.id] }],
        receivers: [{ operatorId: ada.id, count: 1 }],
      }
      yield* run(request)
      const after = yield* written

      const exit = yield* move({
        ...request,
        receivers: [{ operatorId: bruno.id, count: 1 }],
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("RequestIdConflict")
      expect(yield* written).toEqual(after)
    })
  )
})

/** A call of `operatorId` at noon of the Rome `day` */
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

/** An operator named `name` whose user has the id `userId` */
const operatorWithUser = async (userId: string, name: string) => {
  await testDb
    .insert(users)
    .values({ id: userId, email: `${userId}@test.local`, role: "OPERATORE" })
  const [operator] = await testDb
    .insert(operators)
    .values({ userId, name, surname: "" })
    .returning()
  return operator!
}

const ownerOf = (customerId: string) =>
  given(async () => (await customerRow(customerId)).operatorId)

describe("move: quote e ridivisione, altri casi (AC26, D6)", () => {
  it.effect(
    "un saltato con «Ritmo dei 30 giorni»: i 4 rimasti divisi sul ritmo del momento, Ada 3 e Bruno 1",
    () =>
      Effect.gen(function* () {
        // Rome: 2026-10-25, 12:00
        yield* TestClock.setTime(new Date("2026-10-25T10:00:00.000Z").getTime())
        const { admin, ada, bruno, carla, run: wave } = yield* seed
        // Ada 3 calls on one day, Bruno 1: paces 3 and 1
        yield* given(async () => {
          for (let i = 0; i < 3; i++) await call(ada.id, "2026-10-20")
          await call(bruno.id, "2026-10-20")
        })
        const seeded = yield* given(async () => [
          await contactOf(wave.id, carla, { createdAt: day(1) }),
          await contactOf(wave.id, carla, { createdAt: day(2) }),
          await contactOf(wave.id, carla, { createdAt: day(3) }),
          await contactOf(wave.id, carla, { createdAt: day(4) }),
          await contactOf(wave.id, carla, { createdAt: day(5) }),
        ])
        yield* given(() =>
          testDb
            .update(task)
            .set({ state: "richiamare" })
            .where(eq(task.id, seeded[4]!.contact.id))
        )

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "toCall",
          strategy: "pace",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: seeded.map((s) => s.contact.id),
            },
          ],
          receivers: [
            { operatorId: bruno.id, count: 3 },
            { operatorId: ada.id, count: 2 },
          ],
        })

        expect(result).toEqual({
          moved: 4,
          skipped: 1,
          byOperator: [
            { operatorId: bruno.id, count: 1 },
            { operatorId: ada.id, count: 3 },
          ],
        })
        const owners = []
        for (const { customer } of seeded)
          owners.push(yield* ownerOf(customer.id))
        expect(owners).toEqual([ada.id, ada.id, ada.id, bruno.id, carla.id])
      })
  )

  it.effect(
    "nessun saltato: valgono le quote date, anche lontane da «Come dividere» (Ada 0, Bruno 3 con «In parti uguali»)",
    () =>
      Effect.gen(function* () {
        const { admin, ada, bruno, carla, run: wave } = yield* seed
        const seeded = yield* given(async () => [
          await contactOf(wave.id, carla, { createdAt: day(1) }),
          await contactOf(wave.id, carla, { createdAt: day(2) }),
          await contactOf(wave.id, carla, { createdAt: day(3) }),
        ])

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "both",
          strategy: "equal",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: seeded.map((s) => s.contact.id),
            },
          ],
          receivers: [
            { operatorId: ada.id, count: 0 },
            { operatorId: bruno.id, count: 3 },
          ],
        })

        expect(result).toEqual({
          moved: 3,
          skipped: 0,
          byOperator: [
            { operatorId: ada.id, count: 0 },
            { operatorId: bruno.id, count: 3 },
          ],
        })
        for (const { customer } of seeded) {
          expect(yield* ownerOf(customer.id)).toBe(bruno.id)
        }
      })
  )

  it.effect(
    "solo Non risponde, uno riaperto in Da chiamare dopo i candidati: saltato e lasciato a Carla",
    () =>
      Effect.gen(function* () {
        const { admin, ada, carla, run: wave } = yield* seed
        const seeded = yield* given(async () => [
          await contactOf(wave.id, carla, {
            state: "non risponde",
            createdAt: day(1),
          }),
          await contactOf(wave.id, carla, {
            state: "non risponde",
            createdAt: day(2),
          }),
        ])
        const { candidates } = yield* candidatesOf(wave.id, [carla.id])
        yield* given(() =>
          testDb
            .update(task)
            .set({ state: "chiamare" })
            .where(eq(task.id, seeded[0]!.contact.id))
        )

        const result = yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "noAnswer",
          strategy: "equal",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: candidates[0]!.contacts.map((c) => c.taskId),
            },
          ],
          receivers: [{ operatorId: ada.id, count: 2 }],
        })

        expect(result).toEqual({
          moved: 1,
          skipped: 1,
          byOperator: [{ operatorId: ada.id, count: 1 }],
        })
        expect(yield* ownerOf(seeded[0]!.customer.id)).toBe(carla.id)
        expect(
          yield* given(() => tasksOf(seeded[0]!.customer.id))
        ).toMatchObject([{ operatorId: carla.id, state: "chiamare" }])
        expect(yield* ownerOf(seeded[1]!.customer.id)).toBe(ada.id)
      })
  )

  it.effect(
    "ordine di scrittura: prima il contatto creato prima anche con l'id più alto, e il primo blocco al primo per nome anche con l'id utente più alto",
    () =>
      Effect.gen(function* () {
        const { admin, carla, run: wave } = yield* seed
        // Bruno's user id comes before Aldo's
        const bruno = yield* given(() => operatorWithUser("user-a", "Bruno"))
        const aldo = yield* given(() => operatorWithUser("user-z", "Aldo"))
        // The contact created later is inserted first: the lower id
        const later = yield* given(() =>
          contactOf(wave.id, carla, { createdAt: day(2) })
        )
        const earlier = yield* given(() =>
          contactOf(wave.id, carla, { createdAt: day(1) })
        )
        expect(earlier.contact.id).toBeGreaterThan(later.contact.id)

        yield* run({
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "both",
          strategy: "equal",
          contacts: [
            {
              fromOperatorId: carla.id,
              taskIds: [later.contact.id, earlier.contact.id],
            },
          ],
          receivers: [
            { operatorId: bruno.id, count: 1 },
            { operatorId: aldo.id, count: 1 },
          ],
        })

        expect(yield* ownerOf(earlier.customer.id)).toBe(aldo.id)
        expect(yield* ownerOf(later.customer.id)).toBe(bruno.id)
      })
  )
})

describe("move: altri rifiuti (AC26, D4)", () => {
  it.effect("chi riceve è anche chi cede: NumbersChanged e nulla scritto", () =>
    Effect.gen(function* () {
      const { admin, ada, carla, run: wave } = yield* seed
      const seeded = yield* given(async () => [
        await contactOf(wave.id, carla, { createdAt: day(1) }),
        await contactOf(wave.id, carla, { createdAt: day(2) }),
      ])
      const before = yield* written

      const exit = yield* move({
        runId: wave.id,
        requestId: crypto.randomUUID(),
        actorOperatorId: admin.id,
        which: "both",
        strategy: "equal",
        contacts: [
          {
            fromOperatorId: carla.id,
            taskIds: seeded.map((s) => s.contact.id),
          },
        ],
        receivers: [
          { operatorId: ada.id, count: 1 },
          { operatorId: carla.id, count: 1 },
        ],
      }).pipe(provideServer, Effect.exit)

      expect(failureTag(exit)).toBe("NumbersChanged")
      expect(yield* written).toEqual(before)
    })
  )

  it.effect(
    "lo stesso requestId con altri contatti o un altro «Quali contatti»: RequestIdConflict e nulla scritto",
    () =>
      Effect.gen(function* () {
        const { admin, ada, carla, run: wave } = yield* seed
        const first = yield* given(() => contactOf(wave.id, carla))
        const second = yield* given(() => contactOf(wave.id, carla))
        const request: MoveRequest = {
          runId: wave.id,
          requestId: crypto.randomUUID(),
          actorOperatorId: admin.id,
          which: "toCall",
          strategy: "equal",
          contacts: [{ fromOperatorId: carla.id, taskIds: [first.contact.id] }],
          receivers: [{ operatorId: ada.id, count: 1 }],
        }
        yield* run(request)
        const after = yield* written

        const others: MoveRequest[] = [
          {
            ...request,
            contacts: [
              { fromOperatorId: carla.id, taskIds: [second.contact.id] },
            ],
          },
          { ...request, which: "both" },
        ]
        for (const other of others) {
          const exit = yield* move(other).pipe(provideServer, Effect.exit)
          expect(failureTag(exit)).toBe("RequestIdConflict")
        }
        expect(yield* written).toEqual(after)
      })
  )
})
