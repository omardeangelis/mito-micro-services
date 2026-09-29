import fs from "fs"
import path from "path"
import { beforeAll, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { alert, task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  LEGACY_SCHEMA_TAG,
  migrateUpTo,
  queryReadOnly,
  testDb,
} from "@/test/db"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"

// The PR2 migrations on a database already in use, as `db:migrate:prod` will
// run them: migrated up to the last migration before PR2, seeded with the data
// they clean up, then migrated to the end in one go.

const at = (day: string) => new Date(`2026-09-${day}T09:00:00.000Z`)

async function seedDirtyData() {
  const system = await createSystemOperator()
  const owner = await createOperator({ name: "Carla" })
  const previous = await createOperator({ name: "Luca" })

  // Three active contacts. By updated_at alone `updatedLater` would stay: the
  // later creation wins
  const duplicated = await createCustomer({ operatorId: owner.id })
  const oldest = await createTask({
    customerId: duplicated.id,
    operatorId: previous.id,
    createdAt: at("01"),
    updatedAt: at("02"),
  })
  const updatedLater = await createTask({
    customerId: duplicated.id,
    operatorId: previous.id,
    createdAt: at("01"),
    updatedAt: at("15"),
  })
  const createdLater = await createTask({
    customerId: duplicated.id,
    operatorId: owner.id,
    createdAt: at("20"),
    updatedAt: at("10"),
  })
  // Same instant: the higher id stays
  const tied = await createCustomer({ operatorId: owner.id })
  const tieLower = await createTask({
    customerId: tied.id,
    createdAt: at("05"),
    updatedAt: at("05"),
  })
  const tieHigher = await createTask({
    customerId: tied.id,
    createdAt: at("05"),
    updatedAt: at("05"),
  })
  // Nothing to clean up
  const clean = await createCustomer({ operatorId: owner.id })
  const cleanActive = await createTask({
    customerId: clean.id,
    operatorId: owner.id,
  })
  const cleanInactive = await createTask({
    customerId: clean.id,
    operatorId: previous.id,
    isActive: false,
  })
  // Keep their operator: a customer without operator, no customer at all
  const unassigned = await createCustomer({ operatorId: null })
  const unassignedActive = await createTask({
    customerId: unassigned.id,
    operatorId: previous.id,
  })
  // Without a customer: never deactivated
  const orphan = await createTask({ customerId: null, operatorId: previous.id })
  const otherOrphan = await createTask({
    customerId: null,
    operatorId: previous.id,
  })

  // Before the migration
  const lastWeek = at("03")
  const alerts = {
    onDeactivated: await createAlert({
      taskId: updatedLater.id,
      deadline: at("20"),
      updatedAt: lastWeek,
    }),
    onSurvivor: await createAlert({
      taskId: createdLater.id,
      deadline: at("21"),
      updatedAt: lastWeek,
    }),
    onActive: await createAlert({
      taskId: cleanActive.id,
      deadline: at("22"),
      updatedAt: lastWeek,
    }),
    onInactive: await createAlert({
      taskId: cleanInactive.id,
      deadline: at("10"),
      updatedAt: lastWeek,
    }),
    alreadyResolved: await createAlert({
      taskId: cleanInactive.id,
      deadline: at("11"),
      isResolved: true,
      resolvedBy: owner.id,
      updatedAt: lastWeek,
    }),
    // The alert cron fails on it at every run (review of PR1, F6)
    onOrphan: await createAlert({
      taskId: orphan.id,
      deadline: at("12"),
      updatedAt: lastWeek,
    }),
  }

  await testDb.insert(taskEventLog).values([
    {
      customerId: duplicated.id,
      taskId: updatedLater.id,
      actorOperatorId: previous.id,
      action: "state_change",
      source: "list",
      fromState: "chiamare",
      toState: "richiamare",
    },
    {
      customerId: clean.id,
      taskId: cleanInactive.id,
      alertId: alerts.alreadyResolved.id,
      actorOperatorId: owner.id,
      action: "alert_resolved",
      source: "detail",
    },
  ])

  return {
    system,
    operators: { owner, previous },
    customers: { duplicated, tied, clean, unassigned },
    tasks: {
      oldest,
      updatedLater,
      createdLater,
      tieLower,
      tieHigher,
      cleanActive,
      cleanInactive,
      unassignedActive,
      orphan,
      otherOrphan,
    },
    alerts,
    lastWeek,
  }
}

const allTasks = () => testDb.select().from(task).orderBy(asc(task.id))
const allAlerts = () => testDb.select().from(alert).orderBy(asc(alert.id))
const allEvents = () =>
  testDb.select().from(taskEventLog).orderBy(asc(taskEventLog.id))

const PREVIEW_FILE = path.resolve(
  __dirname,
  "../../scripts/contatti-cleanup-preview.sql"
)

let seed: Awaited<ReturnType<typeof seedDirtyData>>
/** What the preview listed right before the migration. */
let preview: {
  alerts: { alert_id: number }[]
  realign: {
    operatore_attuale_id: number | null
    operatore_cliente_id: number
    attive: number
    non_attive: number
  }[]
}
let before: {
  tasks: Awaited<ReturnType<typeof allTasks>>
  alerts: Awaited<ReturnType<typeof allAlerts>>
  events: Awaited<ReturnType<typeof allEvents>>
}

beforeAll(async () => {
  await migrateUpTo(LEGACY_SCHEMA_TAG)
  seed = await seedDirtyData()
  before = {
    tasks: await allTasks(),
    alerts: await allAlerts(),
    events: await allEvents(),
  }
  const [, alerts, realign] = await queryReadOnly(
    fs.readFileSync(PREVIEW_FILE, "utf8")
  )
  preview = {
    alerts: alerts as typeof preview.alerts,
    realign: realign as typeof preview.realign,
  }
  await migrateUpTo()
})

describe("contatti_cleanup", () => {
  it("dopo la migrazione nessun cliente ha più di un contatto attivo e nessuna riga è stata cancellata", async () => {
    const tasks = await allTasks()

    const activeByCustomer = new Map<string, number>()
    for (const { customerId, isActive } of tasks) {
      if (!customerId || !isActive) continue
      activeByCustomer.set(
        customerId,
        (activeByCustomer.get(customerId) ?? 0) + 1
      )
    }
    expect([...activeByCustomer.values()].every((count) => count === 1)).toBe(
      true
    )
    expect(tasks.map(({ id }) => id)).toEqual(before.tasks.map(({ id }) => id))
    expect((await allAlerts()).map(({ id }) => id)).toEqual(
      before.alerts.map(({ id }) => id)
    )
  })

  it("lascia attivo il contatto più recente per GREATEST(updated_at, created_at), a pari merito quello con id maggiore, e non tocca le task senza cliente", async () => {
    const active = (await allTasks())
      .filter(({ isActive }) => isActive)
      .map(({ id }) => id)

    const { tasks } = seed
    expect(active).toEqual([
      tasks.createdLater.id,
      tasks.tieHigher.id,
      tasks.cleanActive.id,
      tasks.unassignedActive.id,
      tasks.orphan.id,
      tasks.otherOrphan.id,
    ])
  })

  it("chiude gli alert aperti su task non attive e senza cliente, come risolti dal sistema e con la data di chiusura", async () => {
    const after = new Map((await allAlerts()).map((row) => [row.id, row]))
    const { alerts, system, lastWeek } = seed

    for (const closed of [
      alerts.onDeactivated,
      alerts.onInactive,
      alerts.onOrphan,
    ]) {
      const row = after.get(closed.id)!
      expect(row).toMatchObject({ isResolved: true, resolvedBy: system.id })
      // The history shows updatedAt as the closing date
      expect(row.updatedAt.getTime()).toBeGreaterThan(lastWeek.getTime())
    }
    // Still open on an active contact; already resolved by an operator
    for (const untouched of [
      alerts.onSurvivor,
      alerts.onActive,
      alerts.alreadyResolved,
    ]) {
      expect(after.get(untouched.id)).toEqual(
        before.alerts.find(({ id }) => id === untouched.id)
      )
    }
  })

  it("non scrive in task_event_log e non cambia task.updated_at né task.alert_id", async () => {
    const pick = (rows: typeof before.tasks) =>
      rows.map(({ id, updatedAt, alertId }) => ({ id, updatedAt, alertId }))

    expect(await allEvents()).toEqual(before.events)
    expect(pick(await allTasks())).toEqual(pick(before.tasks))
  })

  it("chiude esattamente gli alert che l'estrazione elenca in (b)", async () => {
    const closed = (await allAlerts())
      .filter(
        ({ id, isResolved }) =>
          isResolved && !before.alerts.find((row) => row.id === id)!.isResolved
      )
      .map(({ id }) => id)

    expect(closed).toHaveLength(3)
    expect(closed).toEqual(
      preview.alerts.map((row) => row.alert_id).sort((a, b) => a - b)
    )
  })
})

describe("contatti_operator_realign", () => {
  it("dopo la migrazione ogni task ha l'operatore del proprio cliente, e nessuna task perde l'operatore", async () => {
    const { operators, customers, tasks } = seed
    const after = new Map((await allTasks()).map((row) => [row.id, row]))

    // Active and inactive, whatever operator they had
    for (const moved of [
      tasks.oldest,
      tasks.updatedLater,
      tasks.createdLater,
      tasks.tieLower,
      tasks.tieHigher,
      tasks.cleanActive,
      tasks.cleanInactive,
    ]) {
      expect(after.get(moved.id)!.operatorId).toBe(operators.owner.id)
    }
    // No customer, or a customer without operator: as before
    for (const kept of [
      tasks.unassignedActive,
      tasks.orphan,
      tasks.otherOrphan,
    ]) {
      expect(after.get(kept.id)!.operatorId).toBe(operators.previous.id)
    }
    expect(customers.unassigned.operatorId).toBeNull()
  })

  it("sposta esattamente le task che l'estrazione conta in (c)", async () => {
    const counts = new Map<string, (typeof preview.realign)[number]>()
    for (const row of await allTasks()) {
      const old = before.tasks.find(({ id }) => id === row.id)!
      if (old.operatorId === row.operatorId) continue
      const key = `${old.operatorId}->${row.operatorId}`
      const count = counts.get(key) ?? {
        operatore_attuale_id: old.operatorId,
        operatore_cliente_id: row.operatorId!,
        attive: 0,
        non_attive: 0,
      }
      if (row.isActive) count.attive++
      else count.non_attive++
      counts.set(key, count)
    }
    const pick = ({
      operatore_attuale_id,
      operatore_cliente_id,
      attive,
      non_attive,
    }: (typeof preview.realign)[number]) => ({
      operatore_attuale_id,
      operatore_cliente_id,
      attive,
      non_attive,
    })
    const byPair = (
      a: (typeof preview.realign)[number],
      b: (typeof preview.realign)[number]
    ) =>
      (a.operatore_attuale_id ?? 0) - (b.operatore_attuale_id ?? 0) ||
      a.operatore_cliente_id - b.operatore_cliente_id

    expect(counts.size).toBeGreaterThan(1)
    expect([...counts.values()].sort(byPair)).toEqual(
      preview.realign.map(pick).sort(byPair)
    )
  })
})
