// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import {
  taskEventAction,
  taskEventSource,
  taskStatus,
} from "@mito/db/schema/index"
import { LOG_RETENTION_MONTHS } from "@mito/domain/export/period"
import { addDays, romeDay, romeNoon, romeWallClock, subMonthsDay } from "../day"
import { type AlertRow, type Dataset, type Day, type TaskRow } from "../types"
import { generateDataset } from "../generate"
import {
  EMPTY_OPERATOR_ID,
  HEAVY_OPERATOR_ID,
  SYSTEM_OPERATOR_ID,
} from "../generate/operators"

const DAY = "2026-10-14"

describe("contacts and alerts at N = 10,000", () => {
  let dataset: Dataset

  beforeAll(() => {
    dataset = generateDataset({ n: 10_000, day: DAY })
  }, 120_000)

  it("links every open alert both ways to the active `richiamare` contact of its customer, one per customer (AC24)", () => {
    const open = dataset.alerts.filter((alert) => !alert.isResolved)
    expect(open.length).toBeGreaterThan(0)

    const tasks = new Map(dataset.tasks.map((task) => [task.id, task]))
    const customersWithOpenAlert = new Set<string>()
    for (const alert of open) {
      const task = tasks.get(alert.taskId)
      expect(task, `alert ${alert.id}`).toBeDefined()
      expect(task!.alertId).toBe(alert.id)
      expect(task!.isActive).toBe(true)
      expect(task!.state).toBe("richiamare")
      expect(customersWithOpenAlert.has(task!.customerId!)).toBe(false)
      customersWithOpenAlert.add(task!.customerId!)
    }
  })

  registerChecks(() => dataset, 10_000, DAY)

  it("has the AC30 volumes: 5,001 contacts that get priority 1, 1,000 open alerts due on D or before, 1,000 log rows older than the log retention", () => {
    const { priority, openAlerts, log } = classify(dataset, DAY)
    expect(
      priority.filter((each) => each.expected === 1).length
    ).toBeGreaterThanOrEqual(5_001)
    expect(
      openAlerts.filter((each) => ["A1", "A2", "A3"].includes(each.id)).length
    ).toBeGreaterThanOrEqual(1_000)
    expect(log.L1).toBeGreaterThanOrEqual(1_000)
  })

  it("generates in under 10 seconds", () => {
    const started = performance.now()
    generateDataset({ n: 10_000, day: DAY })
    expect(performance.now() - started).toBeLessThan(10_000)
  }, 60_000)
})

describe("contacts and alerts at N = 300", () => {
  let dataset: Dataset

  beforeAll(() => {
    dataset = generateDataset({ n: 300, day: DAY })
  }, 60_000)

  registerChecks(() => dataset, 300, DAY)
})

// Month ends, a leap day, the DST changes, and a winter D whose D - LOG_RETENTION_MONTHS
// is in summer time
describe.each([
  "2026-05-31",
  "2028-02-29",
  "2027-03-01",
  "2026-03-29",
  "2026-10-25",
  "2026-11-15",
])("contacts and alerts at N = 300 for D = %s", (day) => {
  let dataset: Dataset

  beforeAll(() => {
    dataset = generateDataset({ n: 300, day })
  }, 60_000)

  registerChecks(() => dataset, 300, day)
})

describe("contacts determinism (AC5)", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("gives the same contacts, alerts, notes and log at two hours of the same Rome day", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    // 2026-10-14 is CEST (UTC+2): 00:30 and 23:30 in Rome
    vi.setSystemTime(new Date("2026-10-13T22:30:00.000Z"))
    const early = generateDataset({ n: 300, day: DAY })
    vi.setSystemTime(new Date("2026-10-14T21:30:00.000Z"))
    const late = generateDataset({ n: 300, day: DAY })
    for (const key of [
      "chats",
      "messages",
      "customers",
      "alerts",
      "tasks",
      "taskEventLog",
    ] as const) {
      expect(late[key]).toEqual(early[key])
    }
    expect(early.tasks.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Rule-based classifier, written from the scenario tables of the spec (not
// from the cron code): every row a cron selects must match exactly one row.

type PriorityMatch = { task: TaskRow; id: string; expected: number }
type AlertMatch = { alert: AlertRow; id: string }

const P4_STATES = ["app.to", "caricato", "erogata", "nessuno"]

function classify(dataset: Dataset, day: Day) {
  const tasks = new Map(dataset.tasks.map((task) => [task.id, task]))
  const alerts = new Map(dataset.alerts.map((alert) => [alert.id, alert]))
  const customers = new Map(dataset.customers.map((c) => [c.id, c]))
  const due = (alert: AlertRow) => romeDay(alert.deadline)

  const priority: PriorityMatch[] = []
  const notSelected: Array<{ task: TaskRow; id: string }> = []
  const unmatchedTasks: string[] = []
  const unmatchedAlerts: string[] = []
  for (const task of dataset.tasks) {
    if (!task.isActive) {
      if (
        (task.state === "chiamare" &&
          task.priority === 120 &&
          task.customPriority === false) ||
        task.state === "richiamare"
      ) {
        notSelected.push({ task, id: "P9" })
      }
      continue
    }
    if (task.customPriority === true) {
      notSelected.push({ task, id: "P8" })
      continue
    }
    if (task.state === "chiamare" && task.priority === 120) {
      notSelected.push({ task, id: "P2" })
      continue
    }
    const alert = task.alertId == null ? undefined : alerts.get(task.alertId)
    const open = alert && !alert.isResolved ? alert : undefined
    const past = open !== undefined && due(open) <= day
    const future = open !== undefined && due(open) > day
    const closed = task.closedAt != null
    const s = task.state
    const p = task.priority
    const candidates: Array<[string, boolean, number]> = [
      ["P1", s === "chiamare" && p !== 120, 120],
      ["P3", s === "non interessato" && p !== 120, 10],
      ["P10", s === "non interessato" && p === 120, 10],
      ["P4", P4_STATES.includes(s ?? ""), 1],
      ["P13", s === "non risponde", 100],
      ["P5", s === "followup" && p === 150, 1],
      ["P6", s === "richiamare" && closed && past, 50],
      ["P7", s === "richiamare" && closed && future, 30],
      ["P11", s === "richiamare" && !closed && open === undefined, 0],
      ["P12", s === "richiamare" && !closed && past, 20],
    ]
    const matches = candidates.filter(([, ok]) => ok)
    if (matches.length !== 1) {
      unmatchedTasks.push(`task ${task.id}: ${matches.length} scenari P`)
      continue
    }
    const [id, , expected] = matches[0]!
    priority.push({ task, id, expected })
  }

  const openAlerts: AlertMatch[] = []
  const resolved: AlertMatch[] = []
  for (const alert of dataset.alerts) {
    const task = tasks.get(alert.taskId)
    if (alert.isResolved) {
      if (
        task &&
        !task.isActive &&
        task.alertId === alert.id &&
        alert.resolvedBy != null &&
        due(alert) < day
      ) {
        resolved.push({ alert, id: "A5" })
      } else unmatchedAlerts.push(`alert ${alert.id}: risolto fuori da A5`)
      continue
    }
    const linked =
      task !== undefined &&
      task.alertId === alert.id &&
      task.isActive === true &&
      task.state === "richiamare"
    const customer = task ? customers.get(task.customerId!) : undefined
    const closed = task?.closedAt != null
    const d = due(alert)
    const candidates: Array<[string, boolean]> = [
      ["A1", linked && d === day && closed && customer?.operatorId != null],
      ["A2", linked && d === day && closed && customer?.operatorId == null],
      ["A3", linked && d < day],
      ["A4", linked && d > day && closed],
    ]
    const matches = candidates.filter(([, ok]) => ok)
    if (matches.length !== 1) {
      unmatchedAlerts.push(`alert ${alert.id}: ${matches.length} scenari A`)
      continue
    }
    openAlerts.push({ alert, id: matches[0]![0] })
  }

  const cutoff = subMonthsDay(day, LOG_RETENTION_MONTHS)
  const logDays = dataset.taskEventLog.map((row) => romeDay(row.createdAt!))
  const log = {
    L1: logDays.filter((d) => d < cutoff).length,
    L2: logDays.filter((d) => d > cutoff).length,
    onCutoff: logDays.filter((d) => d === cutoff).length,
    dayBefore: logDays.filter((d) => d === addDays(cutoff, -1)).length,
    dayAfter: logDays.filter((d) => d === addDays(cutoff, 1)).length,
  }

  return {
    priority,
    notSelected,
    openAlerts,
    resolved,
    unmatchedTasks,
    unmatchedAlerts,
    log,
  }
}

// ---------------------------------------------------------------------------

/** The assertions that hold for every N and every D. */
function registerChecks(get: () => Dataset, n: number, day: Day) {
  const big = n >= 10_000
  /** At N = 10,000 the threshold, at N = 300 at least one. */
  const atLeast = (full: number) => (big ? full : 1)

  /** In-memory index; fails if a customer has two active contacts. */
  const index = () => {
    const dataset = get()
    const tasks = new Map(dataset.tasks.map((task) => [task.id, task]))
    const alerts = new Map(dataset.alerts.map((alert) => [alert.id, alert]))
    const customers = new Map(dataset.customers.map((c) => [c.id, c]))
    const activeByCustomer = new Map<string, TaskRow>()
    const tasksByCustomer = new Map<string, TaskRow[]>()
    for (const task of dataset.tasks) {
      const list = tasksByCustomer.get(task.customerId!) ?? []
      list.push(task)
      tasksByCustomer.set(task.customerId!, list)
      if (!task.isActive) continue
      expect(
        activeByCustomer.has(task.customerId!),
        `customer ${task.customerId} has two active contacts`
      ).toBe(false)
      activeByCustomer.set(task.customerId!, task)
    }
    return {
      dataset,
      tasks,
      alerts,
      customers,
      activeByCustomer,
      tasksByCustomer,
    }
  }

  it("numbers every row from its identity start, in id order", () => {
    const { chats, messages, alerts, tasks, taskEventLog } = get()
    const sequential = (rows: Array<{ id: number }>, start: number) =>
      rows.forEach((row, k) => expect(row.id).toBe(start + k))
    sequential(chats, 1000)
    sequential(messages, 10_000)
    sequential(alerts, 1000)
    sequential(tasks, 1000)
    sequential(taskEventLog, 1000)
  })

  it("values every timestamp: deadlines at Rome midnight, the rest at Rome noon of a day not after D (AC5)", () => {
    const { tasks, alerts, chats, messages, taskEventLog } = get()
    const end = romeNoon(day).getTime()
    const atNoon = (value: unknown, label: string) => {
      expect(value, label).toBeInstanceOf(Date)
      const ms = (value as Date).getTime()
      expect(ms, label).toBeLessThanOrEqual(end)
      const wall = romeWallClock(ms)
      expect([wall.hours, wall.minutes, wall.seconds, wall.ms], label).toEqual([
        12, 0, 0, 0,
      ])
    }
    for (const t of tasks) {
      atNoon(t.createdAt, `task ${t.id} createdAt`)
      atNoon(t.updatedAt, `task ${t.id} updatedAt`)
      expect(t.closedAt === null || t.closedAt instanceof Date).toBe(true)
      if (t.closedAt) atNoon(t.closedAt, `task ${t.id} closedAt`)
      expect(taskStatus).toContain(t.state)
      expect(typeof t.priority).toBe("number")
      expect(typeof t.customPriority).toBe("boolean")
      expect(t.alertId === null || typeof t.alertId === "number").toBe(true)
      expect(t.operatorId === null || typeof t.operatorId === "number").toBe(
        true
      )
    }
    for (const a of alerts) {
      atNoon(a.createdAt, `alert ${a.id} createdAt`)
      atNoon(a.updatedAt, `alert ${a.id} updatedAt`)
      expect(a.deadline).toBeInstanceOf(Date)
      const wall = romeWallClock(a.deadline.getTime())
      expect([wall.hours, wall.minutes, wall.seconds, wall.ms]).toEqual([
        0, 0, 0, 0,
      ])
      expect(typeof a.isResolved).toBe("boolean")
    }
    for (const c of chats) atNoon(c.createdAt, `chat ${c.id}`)
    for (const m of messages) {
      atNoon(m.sendDate, `message ${m.id} sendDate`)
      if (m.notifyDate) atNoon(m.notifyDate, `message ${m.id} notifyDate`)
    }
    for (const row of taskEventLog) atNoon(row.createdAt, `log ${row.id}`)
  })

  it("loads the operators as AC18 asks", () => {
    const { dataset } = index()
    const active = dataset.tasks.filter((t) => t.isActive)
    const roleOf = new Map(dataset.users.map((u) => [u.id, u.role]))
    const loads = new Map<number, number>()
    for (const t of active) {
      if (t.operatorId != null) {
        loads.set(t.operatorId, (loads.get(t.operatorId) ?? 0) + 1)
      }
    }
    const share = (id: number) => (loads.get(id) ?? 0) / active.length
    const operatore = dataset.operators.filter(
      (o) => roleOf.get(o.userId) === "OPERATORE"
    )
    expect(share(HEAVY_OPERATOR_ID)).toBeGreaterThanOrEqual(0.3)
    expect(
      operatore.filter((o) => share(o.id) >= 0.01 && share(o.id) <= 0.1).length
    ).toBeGreaterThanOrEqual(15)
    // The empty operator is an OPERATORE with no customer and no contact
    const empty = dataset.operators.find((o) => o.id === EMPTY_OPERATOR_ID)!
    expect(roleOf.get(empty.userId)).toBe("OPERATORE")
    expect(
      dataset.customers.some((c) => c.operatorId === EMPTY_OPERATOR_ID)
    ).toBe(false)
    expect(dataset.tasks.some((t) => t.operatorId === EMPTY_OPERATOR_ID)).toBe(
      false
    )
    expect(dataset.tasks.some((t) => t.operatorId === SYSTEM_OPERATOR_ID)).toBe(
      false
    )
    const admins = dataset.operators.filter(
      (o) => roleOf.get(o.userId) === "ADMIN"
    )
    expect(
      admins.some((o) => dataset.customers.some((c) => c.operatorId === o.id))
    ).toBe(true)
    expect(
      dataset.customers.filter((c) => c.operatorId == null).length
    ).toBeGreaterThanOrEqual(0.02 * n)
  })

  it("gives the active contact the customer's operator, and some past contacts another one (AC19)", () => {
    const { dataset, customers } = index()
    let other = 0
    for (const t of dataset.tasks) {
      const customer = customers.get(t.customerId!)
      expect(customer, `task ${t.id}`).toBeDefined()
      if (t.isActive) {
        expect(t.operatorId, `task ${t.id}`).toBe(customer!.operatorId ?? null)
      } else if (
        t.operatorId != null &&
        t.operatorId !== customer!.operatorId
      ) {
        other++
      }
    }
    expect(other).toBeGreaterThanOrEqual(atLeast(100))
  })

  it("has at most one active contact per customer, 70% with one and 10% with none (AC20)", () => {
    const { activeByCustomer, tasksByCustomer } = index()
    expect(activeByCustomer.size).toBeGreaterThanOrEqual(0.7 * n)
    expect(n - tasksByCustomer.size).toBeGreaterThanOrEqual(0.1 * n)
  })

  it("has every task_status among the active contacts (AC21)", () => {
    const active = get().tasks.filter((t) => t.isActive)
    for (const state of taskStatus) {
      expect(
        active.filter((t) => t.state === state).length,
        state
      ).toBeGreaterThanOrEqual(atLeast(20))
    }
  })

  it("has manual priorities 20, 60, 100 and 120, and custom_priority false elsewhere (AC22)", () => {
    const active = get().tasks.filter((t) => t.isActive)
    const manual = active.filter((t) => t.customPriority === true)
    expect(new Set(manual.map((t) => t.priority))).toEqual(
      new Set([20, 60, 100, 120])
    )
    for (const t of active) {
      expect([true, false]).toContain(t.customPriority)
    }
  })

  it("has past contacts with an outcome for 20% of the customers, and reopened contacts (AC23)", () => {
    const { tasksByCustomer, activeByCustomer } = index()
    let withHistory = 0
    let reopened = 0
    for (const [customerId, list] of tasksByCustomer) {
      const past = list.filter(
        (t) => !t.isActive && t.state != null && t.closedAt != null
      )
      if (past.length > 0) withHistory++
      const current = activeByCustomer.get(customerId)
      if (!current?.closedAt || past.length === 0) continue
      const latest = past.reduce((a, b) =>
        a.closedAt!.getTime() >= b.closedAt!.getTime() ? a : b
      )
      if (
        current.closedAt.getTime() === latest.closedAt!.getTime() &&
        current.createdAt!.getTime() > latest.closedAt!.getTime()
      ) {
        reopened++
      }
    }
    expect(withHistory).toBeGreaterThanOrEqual(0.2 * n)
    expect(reopened).toBeGreaterThanOrEqual(1)
  })

  it("links every alert both ways, open ones only on active `richiamare` contacts, one per customer, resolved ones on past contacts (AC24)", () => {
    const { dataset, tasks, alerts } = index()
    const openByCustomer = new Set<string>()
    for (const alert of dataset.alerts) {
      const task = tasks.get(alert.taskId)
      expect(task, `alert ${alert.id}`).toBeDefined()
      expect(task!.alertId, `alert ${alert.id}`).toBe(alert.id)
      if (alert.isResolved) {
        expect(task!.isActive).toBe(false)
        expect(alert.resolvedBy).not.toBeNull()
        continue
      }
      expect(alert.resolvedBy).toBeNull()
      expect(task!.isActive).toBe(true)
      expect(task!.state).toBe("richiamare")
      expect(openByCustomer.has(task!.customerId!)).toBe(false)
      openByCustomer.add(task!.customerId!)
    }
    for (const task of dataset.tasks) {
      if (task.alertId == null) continue
      const alert = alerts.get(task.alertId)
      expect(alert, `task ${task.id}`).toBeDefined()
      expect(alert!.taskId).toBe(task.id)
      // An open alert never sits on a non-active contact
      expect(alert!.isResolved).toBe(!task.isActive)
    }
    const resolved = dataset.alerts.filter((a) => a.isResolved)
    expect(resolved.some((a) => a.resolvedBy === SYSTEM_OPERATOR_ID)).toBe(true)
    expect(resolved.some((a) => a.resolvedBy !== SYSTEM_OPERATOR_ID)).toBe(true)
  })

  it("puts chats only on customers, one each, 5% of them with 1-4 notes (AC25)", () => {
    const { customers, practices, chats, messages } = get()
    for (const p of practices) expect(p.chatId).toBeNull()
    const chatIds = customers
      .map((c) => c.chatId)
      .filter((id): id is number => id != null)
    expect(new Set(chatIds).size).toBe(chatIds.length)
    expect(new Set(chatIds)).toEqual(new Set(chats.map((c) => c.id)))
    const known = new Set(chatIds)
    const notes = new Map<number, number>()
    for (const m of messages) {
      expect(known.has(m.chatId), `message ${m.id}`).toBe(true)
      expect([EMPTY_OPERATOR_ID, SYSTEM_OPERATOR_ID]).not.toContain(
        m.operatorId
      )
      expect(m.content.length).toBeGreaterThan(0)
      notes.set(m.chatId, (notes.get(m.chatId) ?? 0) + 1)
    }
    const withNotes = chatIds.filter((id) => {
      const count = notes.get(id) ?? 0
      return count >= 1 && count <= 4
    })
    expect(withNotes.length).toBe(chatIds.length)
    expect(withNotes.length).toBeGreaterThanOrEqual(0.05 * n)
  })

  it("writes a log of every action and source, coherent with the contacts, within 6 months before the log retention cutoff (AC26)", () => {
    const { dataset, tasks, alerts } = index()
    const rows = dataset.taskEventLog
    expect(new Set(rows.map((r) => r.action))).toEqual(new Set(taskEventAction))
    // "deactivation" has no writer yet (gestione-operatori): the seed covers
    // the sources the app writes today
    expect(new Set(rows.map((r) => r.source))).toEqual(
      new Set(taskEventSource.filter((s) => s !== "deactivation"))
    )
    // AC26: D − 31 months, the 6 before the cutoff. A literal, so a longer
    // history in the generator fails here
    const from = romeNoon(subMonthsDay(day, LOG_RETENTION_MONTHS + 6)).getTime()
    const lastState = new Map<number, string>()
    const lastOperator = new Map<number, number>()
    const real = (id: number | null | undefined) =>
      id != null && id !== SYSTEM_OPERATOR_ID && id !== EMPTY_OPERATOR_ID
    let previous = -Infinity
    for (const row of rows) {
      const at = row.createdAt!.getTime()
      expect(at).toBeGreaterThanOrEqual(from)
      expect(at).toBeGreaterThanOrEqual(previous) // id order is time order
      previous = at
      const task = tasks.get(row.taskId!)
      expect(task, `log ${row.id}`).toBeDefined()
      expect(row.customerId).toBe(task!.customerId)
      if (row.source === "cron_alert") {
        expect(row.actorOperatorId).toBe(SYSTEM_OPERATOR_ID)
      } else {
        expect(real(row.actorOperatorId), `log ${row.id}`).toBe(true)
      }
      if (row.action === "state_change") {
        expect(row.fromState).not.toBeNull()
        expect(row.toState).not.toBeNull()
        expect(row.fromState).not.toBe(row.toState)
        expect(row.fromOperatorId ?? null).toBeNull()
        expect(row.toOperatorId ?? null).toBeNull()
        if (row.source !== "cron_alert") {
          lastState.set(task!.id, row.toState!)
        }
      } else if (row.action === "operator_reassign") {
        expect(real(row.fromOperatorId)).toBe(true)
        expect(real(row.toOperatorId)).toBe(true)
        expect(row.fromOperatorId).not.toBe(row.toOperatorId)
        expect(row.fromState ?? null).toBeNull()
        if (row.source === "self_assign") {
          expect(row.actorOperatorId).toBe(row.toOperatorId)
        }
        lastOperator.set(task!.id, row.toOperatorId!)
      } else {
        const alert = alerts.get(row.alertId!)
        expect(alert, `log ${row.id}`).toBeDefined()
        expect(alert!.taskId).toBe(task!.id)
        expect(alert!.isResolved).toBe(true)
        expect(alert!.resolvedBy).toBe(row.actorOperatorId)
      }
    }
    // The latest manual change of a contact is where the contact stands
    for (const [taskId, state] of lastState) {
      expect(tasks.get(taskId)!.state, `task ${taskId}`).toBe(state)
    }
    for (const [taskId, operatorId] of lastOperator) {
      expect(tasks.get(taskId)!.operatorId, `task ${taskId}`).toBe(operatorId)
    }
  })

  it("puts every active contact a cron selects in exactly one P scenario, with a seed priority that differs from the expected one (D10)", () => {
    const { priority, notSelected, unmatchedTasks } = classify(get(), day)
    expect(unmatchedTasks).toEqual([])
    for (const { task, id, expected } of priority) {
      expect(task.priority, `task ${task.id} (${id})`).not.toBe(expected)
    }
    // P2 and P8 have no alert, so `alert` never writes them (D13)
    for (const { task, id } of notSelected) {
      if (id === "P8") {
        expect([20, 60, 100, 120]).toContain(task.priority)
        expect(task.alertId).toBeNull()
      }
      if (id === "P2") expect(task.alertId).toBeNull()
    }
    const ids = new Set([
      ...priority.map((m) => m.id),
      ...notSelected.map((m) => m.id),
    ])
    for (const id of [
      "P1",
      "P2",
      "P3",
      "P4",
      "P5",
      "P6",
      "P7",
      "P8",
      "P9",
      "P10",
      "P11",
      "P12",
      "P13",
    ]) {
      expect(ids, id).toContain(id)
    }
  })

  it("puts every alert in exactly one of A1-A5 (D10)", () => {
    const { openAlerts, resolved, unmatchedAlerts } = classify(get(), day)
    expect(unmatchedAlerts).toEqual([])
    const ids = new Set([...openAlerts, ...resolved].map((m) => m.id))
    for (const id of ["A1", "A2", "A3", "A4", "A5"]) {
      expect(ids, id).toContain(id)
    }
  })

  it("covers every case named in the scenario tables (AC27)", () => {
    const dataset = get()
    const { priority, notSelected, openAlerts, resolved, log } = classify(
      dataset,
      day
    )
    for (const state of P4_STATES) {
      expect(
        priority.filter((m) => m.id === "P4" && m.task.state === state).length,
        state
      ).toBeGreaterThanOrEqual(atLeast(30))
    }
    for (const value of [20, 60, 100, 120]) {
      expect(
        notSelected.some((m) => m.id === "P8" && m.task.priority === value),
        `P8 ${value}`
      ).toBe(true)
    }
    const p9 = notSelected.filter((m) => m.id === "P9")
    expect(p9.some((m) => m.task.state === "chiamare")).toBe(true)
    expect(p9.some((m) => m.task.state === "richiamare")).toBe(true)
    // A3 on a P6 and on a P12 contact, one due on D - 1; A4 one due on D + 1
    const taskOf = new Map(dataset.tasks.map((t) => [t.id, t]))
    const a3 = openAlerts.filter((m) => m.id === "A3")
    expect(a3.some((m) => taskOf.get(m.alert.taskId)!.closedAt != null)).toBe(
      true
    )
    expect(a3.some((m) => taskOf.get(m.alert.taskId)!.closedAt == null)).toBe(
      true
    )
    expect(a3.some((m) => romeDay(m.alert.deadline) === addDays(day, -1))).toBe(
      true
    )
    expect(
      openAlerts.some(
        (m) => m.id === "A4" && romeDay(m.alert.deadline) === addDays(day, 1)
      )
    ).toBe(true)
    expect(
      resolved.some((m) => m.alert.resolvedBy === SYSTEM_OPERATOR_ID)
    ).toBe(true)
    expect(
      resolved.some((m) => m.alert.resolvedBy !== SYSTEM_OPERATOR_ID)
    ).toBe(true)
    // L1/L2, with both days next to the boundary and none on it
    expect(log.L1).toBeGreaterThan(0)
    expect(log.L2).toBeGreaterThan(0)
    expect(log.onCutoff).toBe(0)
    expect(log.dayBefore).toBeGreaterThan(0)
    expect(log.dayAfter).toBeGreaterThan(0)
  })
}
