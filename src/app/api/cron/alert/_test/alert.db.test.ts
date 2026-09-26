import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { eq, getTableName } from "drizzle-orm"
import { alert as alerts, task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import {
  activeTasksOf,
  logOf,
  migrateUpTo,
  resetDb,
  tasksOf,
  testDb,
} from "@/test/db"
import { createTestCaller } from "@/test/caller"
import { causeTag } from "@/test/effect"
import { reportedErrors } from "@/test/errorReporter"
import { afterNextWriteTo, failNextInsertInto } from "@/test/failpoint"
import {
  createAlert,
  createCustomer,
  createOperator,
  createSystemOperator,
  createTask,
} from "@/test/factories"
import { GET } from "../route"

// The cron's own authentication is a boundary: these tests run as the job
vi.mock("@/app/api/_utils/auth", () => ({ authCheck: vi.fn(async () => null) }))

const NOW = new Date("2026-09-25T06:00:00.000Z")

const cronResponse = () => GET(new Request("http://localhost/api/cron/alert"))

async function runCron() {
  const response = await cronResponse()
  return (await response.json()) as Record<string, unknown>
}

beforeAll(async () => {
  await migrateUpTo()
  // Only Date: the in-memory database needs real timers
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function seedContactWithAlert(deadline: Date) {
  const system = await createSystemOperator()
  const customerOperator = await createOperator({ name: "Cliente" })
  const taskOperator = await createOperator({ name: "Task" })
  const customer = await createCustomer({ operatorId: customerOperator.id })
  const closedAt = new Date("2026-09-20T09:30:00.000Z")
  const previous = await createTask({
    customerId: customer.id,
    operatorId: taskOperator.id,
    state: "richiamare",
    closedAt,
    priority: 40,
    customPriority: true,
  })
  const alert = await createAlert({
    taskId: previous.id,
    deadline,
    message: "Richiamare dopo le 10",
  })
  return {
    system,
    customerOperator,
    taskOperator,
    customer,
    previous,
    alert,
    closedAt,
  }
}

describe("cron alert (comportamento attuale)", () => {
  it("un alert che scade oggi produce un followup attivo per l'operatore del cliente e disattiva la task precedente", async () => {
    const { system, customerOperator, customer, previous, alert, closedAt } =
      await seedContactWithAlert(new Date("2026-09-25T08:00:00.000Z"))

    const body = await runCron()

    expect(body).toMatchObject({ message: "Cron job ran" })

    const caller = createTestCaller(customerOperator)
    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({
      state: "followup",
      isActive: true,
      operatorId: customerOperator.id,
      closedAt,
      priority: 150,
      customPriority: false,
      alertId: null,
    })
    expect(active!.id).not.toBe(previous.id)

    const rows = await tasksOf(customer.id)
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.id === previous.id)).toMatchObject({
      isActive: false,
      state: "richiamare",
    })

    const alerts = await caller.task.getCustomerAlerts({ id: customer.id })
    expect(alerts).toEqual([
      expect.objectContaining({
        id: alert.id,
        isResolved: true,
        resolvedByName: system.name,
      }),
    ])

    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "alert_resolved",
        source: "cron_alert",
        taskId: previous.id,
        alertId: alert.id,
        actorOperatorId: system.id,
      }),
      expect.objectContaining({
        action: "state_change",
        source: "cron_alert",
        taskId: previous.id,
        alertId: null,
        actorOperatorId: system.id,
        fromState: "richiamare",
        toState: "followup",
      }),
    ])
  })

  it("un alert scaduto in un giorno precedente viene risolto e staccato dalla task, senza nuove task", async () => {
    const { system, customerOperator, customer, previous, alert } =
      await seedContactWithAlert(new Date("2026-09-23T08:00:00.000Z"))

    const body = await runCron()

    expect(body).toMatchObject({ message: "Cron job ran" })

    const caller = createTestCaller(customerOperator)
    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({
      id: previous.id,
      state: "richiamare",
      isActive: true,
      alertId: null,
    })
    expect(await tasksOf(customer.id)).toHaveLength(1)

    const alerts = await caller.task.getCustomerAlerts({ id: customer.id })
    expect(alerts).toEqual([
      expect.objectContaining({
        id: alert.id,
        isResolved: true,
        resolvedByName: system.name,
      }),
    ])

    expect(await logOf(customer.id)).toEqual([
      expect.objectContaining({
        action: "alert_resolved",
        source: "cron_alert",
        taskId: previous.id,
        alertId: alert.id,
        actorOperatorId: system.id,
      }),
    ])
  })

  it("un alert futuro non cambia nulla", async () => {
    const { customerOperator, customer, previous, alert } =
      await seedContactWithAlert(new Date("2026-09-26T08:00:00.000Z"))

    const body = await runCron()

    expect(body).toMatchObject({ message: "No alerts to process" })

    const caller = createTestCaller(customerOperator)
    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({
      id: previous.id,
      state: "richiamare",
      alertId: alert.id,
    })
    expect(await tasksOf(customer.id)).toHaveLength(1)
    const alerts = await caller.task.getCustomerAlerts({ id: customer.id })
    expect(alerts).toEqual([
      expect.objectContaining({ id: alert.id, isResolved: false }),
    ])
    expect(await logOf(customer.id)).toEqual([])
  })

  it("senza alert risponde 'No alerts to process'", async () => {
    await createSystemOperator()

    const body = await runCron()

    expect(body).toMatchObject({ message: "No alerts to process" })
  })
})

describe("cron alert: ogni alert in una transazione sua", () => {
  it("se l'elaborazione di un alert fallisce, gli alert degli altri clienti della stessa esecuzione vengono comunque elaborati", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    await createSystemOperator()
    // First, so today's loop would stop on it before the other alert
    const orphan = await createTask({ customerId: null, state: "richiamare" })
    const orphanAlert = await createAlert({
      taskId: orphan.id,
      deadline: new Date("2026-09-25T08:00:00.000Z"),
    })
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const previous = await createTask({
      customerId: customer.id,
      state: "richiamare",
    })
    await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-09-25T08:00:00.000Z"),
    })

    const body = await runCron()

    expect(body).toMatchObject({
      message: "Cron job ran",
      found: 2,
      processed: 1,
      skipped: 0,
      failed: 1,
      // alert.js calls again while some are left
      remaining: 0,
    })
    const [active] = await createTestCaller(operator).task.getActiveTask({
      id: customer.id,
    })
    expect(active).toMatchObject({ state: "followup" })
    expect(reportedErrors).toHaveLength(1)
    expect(causeTag(reportedErrors[0]!.cause)).toBe("CustomerMissing")
    expect(reportedErrors[0]!.data).toMatchObject({
      alertId: orphanAlert.id,
      customerId: null,
    })
    // Vercel shows console.error lines as errors
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("failed=1")
    )
  })

  it("se una scrittura fallisce non restano né il followup né la task precedente disattivata", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { customerOperator, customer, previous, alert } =
      await seedContactWithAlert(new Date("2026-09-25T08:00:00.000Z"))
    await failNextInsertInto(taskEventLog)

    const body = await runCron()

    expect(body).toMatchObject({ found: 1, processed: 0, failed: 1 })
    expect(await tasksOf(customer.id)).toEqual([
      { ...previous, alertId: alert.id },
    ])
    const alerts = await createTestCaller(
      customerOperator
    ).task.getCustomerAlerts({ id: customer.id })
    expect(alerts).toEqual([
      expect.objectContaining({ id: alert.id, isResolved: false }),
    ])
    expect(await logOf(customer.id)).toEqual([])
  })

  it("un alert aperto su una task non attiva lascia al cliente un solo contatto attivo: il followup", async () => {
    const { customer, previous } = await seedContactWithAlert(
      new Date("2026-09-25T08:00:00.000Z")
    )
    await testDb
      .update(task)
      .set({ isActive: false })
      .where(eq(task.id, previous.id))
    const current = await createTask({
      customerId: customer.id,
      state: "app.to",
    })

    await runCron()

    const active = await activeTasksOf(customer.id)
    expect(active).toEqual([expect.objectContaining({ state: "followup" })])
    expect(active[0]!.id).not.toBe(current.id)
  })

  it("se l'intera esecuzione fallisce risponde come oggi e lo segnala una volta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const operator = await createOperator()
    const customer = await createCustomer({ operatorId: operator.id })
    const previous = await createTask({ customerId: customer.id })
    await createAlert({
      taskId: previous.id,
      deadline: new Date("2026-09-25T08:00:00.000Z"),
    })

    // No system operator: the cron can't act as anyone
    const response = await cronResponse()

    // alert.js reads the body: a 5xx would print no counts
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      message: "Error exporting data",
      error: "Error exporting data",
    })
    expect(reportedErrors).toHaveLength(1)
    expect(causeTag(reportedErrors[0]!.cause)).toBe("SystemOperatorMissing")
  })

  it("un alert di un giorno precedente su una task senza cliente fallisce a ogni esecuzione e resta aperto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    await createSystemOperator()
    const orphan = await createTask({ customerId: null, state: "richiamare" })
    const orphanAlert = await createAlert({
      taskId: orphan.id,
      deadline: new Date("2026-09-23T08:00:00.000Z"),
    })

    const first = await runCron()
    const second = await runCron()

    expect(first).toMatchObject({ found: 1, processed: 0, failed: 1 })
    expect(second).toEqual(first)
    expect(reportedErrors.map(({ cause }) => causeTag(cause))).toEqual([
      "CustomerMissing",
      "CustomerMissing",
    ])
    const [open] = await testDb
      .select()
      .from(alerts)
      .where(eq(alerts.id, orphanAlert.id))
    expect(open).toMatchObject({ isResolved: false })
    expect(await testDb.select().from(task)).toEqual([
      expect.objectContaining({ id: orphan.id, alertId: orphanAlert.id }),
    ])
  })

  it("un alert che un'altra esecuzione risolve dopo la lettura dell'elenco è contato fra gli skipped e non scrive nulla", async () => {
    const { customer } = await seedContactWithAlert(
      new Date("2026-09-25T08:00:00.000Z")
    )
    const other = await createCustomer()
    const otherTask = await createTask({
      customerId: other.id,
      state: "richiamare",
    })
    await createAlert({
      taskId: otherTask.id,
      deadline: new Date("2026-09-25T08:00:00.000Z"),
    })
    // While the first alert is written, an overlapping run resolves the other
    await afterNextWriteTo(
      taskEventLog,
      "INSERT",
      `UPDATE "${getTableName(alerts)}" SET is_resolved = true WHERE is_resolved = false`
    )

    const body = await runCron()

    expect(body).toMatchObject({
      found: 2,
      processed: 1,
      skipped: 1,
      failed: 0,
    })
    const written = await Promise.all(
      [customer.id, other.id].map(async (id) => ({
        tasks: (await tasksOf(id)).length,
        log: (await logOf(id)).length,
      }))
    )
    expect(written).toEqual(
      expect.arrayContaining([
        { tasks: 2, log: 2 },
        { tasks: 1, log: 0 },
      ])
    )
  })

  it("un alert di un giorno precedente che un'altra esecuzione risolve dopo la lettura dell'elenco è contato fra gli skipped e lascia la task com'era", async () => {
    const { customer } = await seedContactWithAlert(
      new Date("2026-09-23T08:00:00.000Z")
    )
    const other = await createCustomer()
    const otherTask = await createTask({
      customerId: other.id,
      state: "richiamare",
    })
    await createAlert({
      taskId: otherTask.id,
      deadline: new Date("2026-09-23T08:00:00.000Z"),
    })
    // While the first alert is written, an overlapping run resolves the other
    await afterNextWriteTo(
      taskEventLog,
      "INSERT",
      `UPDATE "${getTableName(alerts)}" SET is_resolved = true WHERE is_resolved = false`
    )

    const body = await runCron()

    expect(body).toMatchObject({
      found: 2,
      processed: 1,
      skipped: 1,
      failed: 0,
    })
    const outcome = await Promise.all(
      [customer.id, other.id].map(async (id) => {
        const [row] = await tasksOf(id)
        return { linked: row!.alertId !== null, log: (await logOf(id)).length }
      })
    )
    expect(outcome).toEqual(
      expect.arrayContaining([
        { linked: false, log: 1 },
        { linked: true, log: 0 },
      ])
    )
  })

  it("un alert di un giorno precedente stacca dalla task solo sé stesso, non un alert agganciato nel frattempo", async () => {
    const { customerOperator, customer, previous, alert } =
      await seedContactWithAlert(new Date("2026-09-23T08:00:00.000Z"))
    // An operator schedules a new callback on the same task (createAlert)
    // while the cron resolves the due alert
    await afterNextWriteTo(
      alerts,
      "UPDATE",
      `WITH created AS (
        INSERT INTO "${getTableName(alerts)}" (task_id, deadline)
        VALUES (${previous.id}, '2026-10-01T08:00:00Z') RETURNING id
      )
      UPDATE "${getTableName(task)}" SET alert_id = (SELECT id FROM created)
      WHERE id = ${previous.id}`
    )

    await runCron()

    const caller = createTestCaller(customerOperator)
    const [active] = await caller.task.getActiveTask({ id: customer.id })
    expect(active).toMatchObject({ id: previous.id, isActive: true })
    expect(active!.alertId).not.toBeNull()
    expect(active!.alertId).not.toBe(alert.id)
    expect(await caller.task.getCustomerAlerts({ id: customer.id })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: alert.id, isResolved: true }),
        expect.objectContaining({ id: active!.alertId, isResolved: false }),
      ])
    )
  })
})
