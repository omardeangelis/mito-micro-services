import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { asc, eq } from "drizzle-orm"
import { task } from "@/server/db/schema/task"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { migrateUpTo, resetDb, testDb } from "@/test/db"
import { createTestCaller } from "@/test/caller"
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

async function runCron() {
  const response = await GET(new Request("http://localhost/api/cron/alert"))
  return (await response.json()) as Record<string, unknown>
}

// Inactive task rows and the event log are what the calls export reads: no
// public query returns them
const tasksOf = (customerId: string) =>
  testDb
    .select()
    .from(task)
    .where(eq(task.customerId, customerId))
    .orderBy(asc(task.id))

const logOf = (customerId: string) =>
  testDb
    .select()
    .from(taskEventLog)
    .where(eq(taskEventLog.customerId, customerId))
    .orderBy(asc(taskEventLog.id))

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
