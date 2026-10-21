import { readFileSync } from "fs"
import path from "path"
import { beforeAll, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { customers } from "@/server/db/schema/customers"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  BEFORE_REALIGN_SCHEMA_TAG,
  migrateUpTo,
  queryReadOnly,
  REALIGN_SCHEMA_TAG,
  testClient,
  testDb,
} from "@/test/db"
import {
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

// The PR6 realignment (T6.9) on a database already in use, as the release
// session will leave it: migrated up to the last migration production has
// (three are pending there: `cron_run`, the index removals and this one),
// seeded with active contacts that sit on another operator than their
// customer, then migrated in one go. The read-only script lists what it will
// move first.

const SCRIPT = path.resolve(
  __dirname,
  "../../scripts/contatti-operator-mismatch.sql"
)
const MIGRATION = path.resolve(__dirname, `../${REALIGN_SCHEMA_TAG}.sql`)

const at = (day: string) => new Date(`2026-10-${day}T09:00:00.000Z`)

async function seedMisaligned() {
  // The system operator is neither the first nor the last operator: a lookup
  // by lowest or highest id would find another one
  const anna = await createOperator({ name: "Anna" })
  const system = await createSystemOperator()
  const bruno = await createOperator({ name: "Bruno" })
  const carla = await createOperator({ name: "Carla" })

  // Same dates for every contact: the migration must not touch updated_at
  // (the "Aggiornato" order of Contatti and Clienti)
  const dates = { createdAt: at("01"), updatedAt: at("20") }

  // (a): the customer has Anna, the contact Bruno
  const differs = await createCustomer({ operatorId: anna.id })
  const differsTask = await createTask({
    customerId: differs.id,
    operatorId: bruno.id,
    state: "richiamare",
    closedAt: at("14"),
    ...dates,
  })
  // Its history: an inactive contact of the same customer on the operator the
  // active one has now. Only the active one moves
  const differsHistory = await createTask({
    customerId: differs.id,
    operatorId: bruno.id,
    isActive: false,
    ...dates,
  })
  // (a2): the contact has no operator, with and without calls to export
  const noOperator = await createCustomer({ operatorId: anna.id })
  const noOperatorTask = await createTask({
    customerId: noOperator.id,
    operatorId: null,
    state: "app.to",
    closedAt: at("15"),
    ...dates,
  })
  const noOperatorOpen = await createCustomer({ operatorId: carla.id })
  const noOperatorOpenTask = await createTask({
    customerId: noOperatorOpen.id,
    operatorId: null,
    state: "chiamare",
    ...dates,
  })
  // Already the same operator, with a history of another one's
  const aligned = await createCustomer({ operatorId: anna.id })
  const alignedTask = await createTask({
    customerId: aligned.id,
    operatorId: anna.id,
    ...dates,
  })
  const alignedHistory = await createTask({
    customerId: aligned.id,
    operatorId: bruno.id,
    isActive: false,
    ...dates,
  })
  // Not active: history, whatever the operator
  const inactiveOnly = await createCustomer({ operatorId: anna.id })
  const inactiveTask = await createTask({
    customerId: inactiveOnly.id,
    operatorId: carla.id,
    isActive: false,
    ...dates,
  })
  // (b): the customer has no operator, the contact has one. Only the owner
  // decides: it stays as it is
  const noCustomerOperator = await createCustomer({ operatorId: null })
  const noCustomerOperatorTask = await createTask({
    customerId: noCustomerOperator.id,
    operatorId: bruno.id,
    ...dates,
  })
  // (c): neither has an operator
  const bothEmpty = await createCustomer({ operatorId: null })
  const bothEmptyTask = await createTask({
    customerId: bothEmpty.id,
    operatorId: null,
    state: "caricato",
    closedAt: at("16"),
    ...dates,
  })
  // Without a customer
  const orphanTask = await createTask({
    customerId: null,
    operatorId: bruno.id,
    ...dates,
  })

  await testDb.insert(taskEventLog).values({
    customerId: aligned.id,
    taskId: alignedTask.id,
    actorOperatorId: anna.id,
    action: "state_change",
    source: "list",
    fromState: "nessuno",
    toState: "chiamare",
  })

  return {
    system,
    operators: { anna, bruno, carla },
    tasks: {
      differs: differsTask,
      noOperator: noOperatorTask,
      noOperatorOpen: noOperatorOpenTask,
      aligned: alignedTask,
      alignedHistory,
      differsHistory,
      inactive: inactiveTask,
      noCustomerOperator: noCustomerOperatorTask,
      bothEmpty: bothEmptyTask,
      orphan: orphanTask,
    },
    customers: { differs, noOperator, noOperatorOpen, aligned },
  }
}

const allTasks = () => testDb.select().from(task).orderBy(asc(task.id))
const allCustomers = () =>
  testDb.select().from(customers).orderBy(asc(customers.id))
const allEvents = () =>
  testDb.select().from(taskEventLog).orderBy(asc(taskEventLog.id))

/**
 * The task rows as the database holds them, to the microsecond: Drizzle reads
 * timestamps to the millisecond. `rest` is the row without the operator.
 */
async function rawTasks() {
  const { rows } = await testClient.query<{
    id: number
    row: string
    rest: string
  }>(
    `SELECT id, to_jsonb(t)::text AS row, (to_jsonb(t) - 'operator_id')::text AS rest
     FROM "mito-deutsche_task" t ORDER BY id`
  )
  return new Map(rows.map((row) => [row.id, row]))
}

/** The counts and the list of the read-only script, as it stands now. */
async function runScript() {
  const [counts, , list] = await queryReadOnly(readFileSync(SCRIPT, "utf8"))
  return { counts: counts![0]!, list: list! }
}

let seed: Awaited<ReturnType<typeof seedMisaligned>>
/** What the script listed right before the migration. */
let preview: Awaited<ReturnType<typeof runScript>>
let before: {
  tasks: Awaited<ReturnType<typeof allTasks>>
  raw: Awaited<ReturnType<typeof rawTasks>>
  customers: Awaited<ReturnType<typeof allCustomers>>
  events: Awaited<ReturnType<typeof allEvents>>
}

beforeAll(async () => {
  await migrateUpTo(BEFORE_REALIGN_SCHEMA_TAG)
  seed = await seedMisaligned()
  before = {
    tasks: await allTasks(),
    raw: await rawTasks(),
    customers: await allCustomers(),
    events: await allEvents(),
  }
  preview = await runScript()
  await migrateUpTo(REALIGN_SCHEMA_TAG)
})

const taskAfter = async (id: number) =>
  (await allTasks()).find((row) => row.id === id)!
const taskBefore = (id: number) => before.tasks.find((row) => row.id === id)!
const newEvents = async () => (await allEvents()).slice(before.events.length)

describe("contatti_contact_realign", () => {
  it("un contatto attivo con un altro operatore prende quello del cliente, con una riga di log (D26, D29)", async () => {
    const { tasks, customers, operators, system } = seed

    expect((await taskAfter(tasks.differs.id)).operatorId).toBe(
      operators.anna.id
    )
    expect(
      (await newEvents()).find((row) => row.taskId === tasks.differs.id)
    ).toMatchObject({
      customerId: customers.differs.id,
      taskId: tasks.differs.id,
      actorOperatorId: system.id,
      action: "operator_reassign",
      source: "bulk",
      fromOperatorId: operators.bruno.id,
      toOperatorId: operators.anna.id,
      alertId: null,
      fromState: null,
      toState: null,
    })
  })

  it("un contatto attivo senza operatore prende quello del cliente, e la riga di log ha il 'da' nullo (D29)", async () => {
    const { tasks, customers, operators, system } = seed
    const events = await newEvents()

    expect((await taskAfter(tasks.noOperator.id)).operatorId).toBe(
      operators.anna.id
    )
    expect((await taskAfter(tasks.noOperatorOpen.id)).operatorId).toBe(
      operators.carla.id
    )
    expect(
      events.find((row) => row.taskId === tasks.noOperator.id)
    ).toMatchObject({
      customerId: customers.noOperator.id,
      actorOperatorId: system.id,
      action: "operator_reassign",
      source: "bulk",
      fromOperatorId: null,
      toOperatorId: operators.anna.id,
    })
    expect(
      events.find((row) => row.taskId === tasks.noOperatorOpen.id)
    ).toMatchObject({ fromOperatorId: null, toOperatorId: operators.carla.id })
  })

  it("sposta esattamente i contatti che lo script elenca in (a), con una riga di log ciascuno", async () => {
    const byId = (a: number, b: number) => a - b
    const listed = preview.list.map((row) => row.contatto_id as number)
    const moved = (await allTasks())
      .filter((row) => row.operatorId !== taskBefore(row.id).operatorId)
      .map((row) => row.id)
    const events = await newEvents()

    expect(listed).toHaveLength(3)
    expect(moved.sort(byId)).toEqual([...listed].sort(byId))
    expect(events.map((row) => row.taskId!).sort(byId)).toEqual(
      [...listed].sort(byId)
    )
    // The log of the move says what each contact was before
    for (const row of preview.list) {
      expect(
        events.find((event) => event.taskId === row.contatto_id)
      ).toMatchObject({
        fromOperatorId: row.operatore_contatto_id,
        toOperatorId: row.operatore_cliente_id,
      })
    }
  })

  it("cambia solo l'operatore: stato, 'Contattato il', alert, attività e updated_at restano com'erano (A6)", async () => {
    for (const moved of [
      seed.tasks.differs,
      seed.tasks.noOperator,
      seed.tasks.noOperatorOpen,
    ]) {
      const { operatorId, ...rest } = await taskAfter(moved.id)
      const { operatorId: oldOperatorId, ...oldRest } = taskBefore(moved.id)

      expect(rest).toEqual(oldRest)
      expect(operatorId).not.toBe(oldOperatorId)
      // To the microsecond, which Drizzle's dates can't tell
      expect((await rawTasks()).get(moved.id)!.rest).toBe(
        before.raw.get(moved.id)!.rest
      )
    }
  })

  it("non tocca le task non attive, un contatto già allineato, né (b) e (c), né i contatti senza cliente", async () => {
    const { tasks } = seed

    for (const untouched of [
      tasks.aligned,
      tasks.alignedHistory,
      tasks.differsHistory,
      tasks.inactive,
      tasks.noCustomerOperator,
      tasks.bothEmpty,
      tasks.orphan,
    ]) {
      expect(await taskAfter(untouched.id)).toEqual(taskBefore(untouched.id))
      expect((await rawTasks()).get(untouched.id)!.row).toBe(
        before.raw.get(untouched.id)!.row
      )
    }
    // No row for any of them in the log, and none for the contact already
    // aligned
    const logged = (await newEvents()).map((row) => row.taskId)
    expect(logged).not.toContain(tasks.aligned.id)
    expect(logged).not.toContain(tasks.differsHistory.id)
    expect(logged).not.toContain(tasks.inactive.id)
    expect(logged).not.toContain(tasks.noCustomerOperator.id)
    expect(logged).not.toContain(tasks.bothEmpty.id)
    expect(logged).not.toContain(tasks.orphan.id)
  })

  it("non cambia i clienti né le righe di log che c'erano, e non scrive altre righe oltre a quelle dei contatti spostati", async () => {
    expect(await allCustomers()).toEqual(before.customers)
    expect((await allEvents()).slice(0, before.events.length)).toEqual(
      before.events
    )
    expect(await newEvents()).toHaveLength(3)
  })

  it("dopo la migrazione lo script dà 0 su (a), e (b) e (c) restano com'erano", async () => {
    const { counts, list } = await runScript()

    expect(preview.counts).toMatchObject({ a: 3, a2: 2, b: 1, c: 1 })
    expect(counts).toMatchObject({
      contatti_attivi: preview.counts.contatti_attivi,
      a: 0,
      a2: 0,
      a2_esportabili: 0,
      b: 1,
      c: 1,
    })
    expect(list).toEqual([])
  })

  it("rilanciata una seconda volta non cambia niente", async () => {
    const tasksAfter = await allTasks()
    const eventsAfter = await allEvents()

    // In a transaction, as the migrator runs it (LOCK TABLE needs one)
    await testClient.exec(`BEGIN;\n${readFileSync(MIGRATION, "utf8")}\nCOMMIT;`)

    expect(await allTasks()).toEqual(tasksAfter)
    expect(await allEvents()).toEqual(eventsAfter)
  })
})
