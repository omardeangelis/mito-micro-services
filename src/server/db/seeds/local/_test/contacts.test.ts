// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { taskEventAction, taskEventSource } from "@mito/db/schema/index"
import { contactStates } from "@mito/domain/contact/status"
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

  it("links every open alert both ways to the active contact of its customer, one per customer, in Richiamo, Da chiamare or Non risponde (AC4, AC24)", () => {
    const open = dataset.alerts.filter((alert) => !alert.isResolved)
    expect(open.length).toBeGreaterThan(0)

    const tasks = new Map(dataset.tasks.map((task) => [task.id, task]))
    const customersWithOpenAlert = new Set<string>()
    for (const alert of open) {
      const task = tasks.get(alert.taskId)
      expect(task, `alert ${alert.id}`).toBeDefined()
      expect(task!.alertId).toBe(alert.id)
      expect(task!.isActive).toBe(true)
      expect(["richiamare", "chiamare", "non risponde"]).toContain(task!.state)
      expect(customersWithOpenAlert.has(task!.customerId!)).toBe(false)
      customersWithOpenAlert.add(task!.customerId!)
    }
  })

  registerChecks(() => dataset, 10_000, DAY)

  it("has the AC30 volumes: 5,001 contacts that get the same priority, 1,000 open alerts the cron works, 1,000 log rows older than the log retention", () => {
    const { priority, openAlerts, log } = classify(dataset, DAY)
    // `priority` writes them with one UPDATE per value and 5,000 ids
    const byExpected = new Map<number, number>()
    for (const { expected } of priority) {
      byExpected.set(expected, (byExpected.get(expected) ?? 0) + 1)
    }
    expect(Math.max(...byExpected.values())).toBeGreaterThanOrEqual(5_001)
    expect(
      openAlerts.filter((each) => ["A1", "A3"].includes(each.id)).length
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

const P4_STATES = ["app.to", "caricato"]

function classify(dataset: Dataset, day: Day) {
  const tasks = new Map(dataset.tasks.map((task) => [task.id, task]))
  const alerts = new Map(dataset.alerts.map((alert) => [alert.id, alert]))
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
      // AC4: a Richiamo has an open alert and a call
      ["P6", s === "richiamare" && closed && past, 50],
      ["P7", s === "richiamare" && closed && future, 30],
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
      task !== undefined && task.alertId === alert.id && task.isActive === true
    const richiamo = linked && task.state === "richiamare"
    // Da chiamare and Non risponde keep the alert, due on D or before
    const kept =
      linked && ["chiamare", "non risponde"].includes(task.state ?? "")
    const d = due(alert)
    const candidates: Array<[string, boolean]> = [
      ["A1", richiamo && d === day],
      ["A3", richiamo && d < day],
      ["A4", richiamo && d > day],
      ["A7", kept && d <= day],
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

  it("values every timestamp: deadlines at Rome midnight, the rest at Rome noon of a day not after D, but the calls of D and D-1 at their hour (AC5)", () => {
    const { tasks, alerts, chats, messages, taskEventLog } = get()
    const end = romeNoon(day).getTime()
    // The calls of D and of the day before keep their hour, and so does the
    // closing of the contact they close (andamenti-chiamate, T13)
    const hourDays = new Set([day, addDays(day, -1)])
    const atHour = (row: (typeof taskEventLog)[number]) =>
      row.action === "call" && hourDays.has(romeDay(row.createdAt!))
    const callInstants = new Set(
      taskEventLog.filter(atHour).map((row) => row.createdAt!.getTime())
    )
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
      if (t.closedAt && !callInstants.has(t.closedAt.getTime()))
        atNoon(t.closedAt, `task ${t.id} closedAt`)
      expect(contactStates).toContain(t.state)
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
      if (a.resolvedAt) atNoon(a.resolvedAt, `alert ${a.id} resolvedAt`)
    }
    for (const c of chats) atNoon(c.createdAt, `chat ${c.id}`)
    for (const m of messages) {
      atNoon(m.sendDate, `message ${m.id} sendDate`)
      if (m.notifyDate) atNoon(m.notifyDate, `message ${m.id} notifyDate`)
    }
    for (const row of taskEventLog) {
      if (atHour(row)) continue
      atNoon(row.createdAt, `log ${row.id}`)
    }
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

  it("has the six states among the active contacts, and no other (AC21, esiti-richiami-stati AC1)", () => {
    const active = get().tasks.filter((t) => t.isActive)
    for (const state of contactStates) {
      expect(
        active.filter((t) => t.state === state).length,
        state
      ).toBeGreaterThanOrEqual(atLeast(20))
    }
    for (const t of get().tasks) {
      expect(contactStates, `task ${t.id}`).toContain(t.state)
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

  it("links every alert both ways, open ones only on active contacts, one per customer, resolved ones on past contacts (AC24)", () => {
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

  it("keeps an open alert on an active contact only as AC4 allows: Richiamo has one, Da chiamare and Non risponde keep an expired one, the final states have none", () => {
    const { dataset, tasks, alerts } = index()
    const notWorked: string[] = []
    for (const task of dataset.tasks.filter((t) => t.isActive)) {
      const alert = task.alertId == null ? undefined : alerts.get(task.alertId)
      const due = alert && !alert.isResolved ? romeDay(alert.deadline) : null
      if (task.state === "richiamare") {
        // The future alert; or one due on D or before that the nightly pass
        // has not worked yet (AC4): the cron of the seed is what works it
        expect(due, `task ${task.id}`).not.toBeNull()
        if (due! <= day) notWorked.push(`task ${task.id}`)
      } else if (task.state === "chiamare" || task.state === "non risponde") {
        // Never a future alert: it would be a Richiamo (AC4)
        if (due !== null) expect(due <= day, `task ${task.id}`).toBe(true)
      } else {
        expect(due, `task ${task.id}`).toBeNull()
      }
    }
    expect(notWorked.length).toBeGreaterThan(0)
    // Every worked alert has the log row of the nightly pass, on its day
    const workedByPass = new Set(
      dataset.taskEventLog
        .filter((row) => row.source === "cron_alert")
        .map((row) => row.taskId)
    )
    for (const taskId of workedByPass) {
      const task = tasks.get(taskId!)!
      expect(task.isActive, `task ${taskId}`).toBe(true)
      expect(["chiamare", "non risponde"]).toContain(task.state)
    }
    // An open alert of Da chiamare or Non risponde is a worked one, or a Non
    // risponde that kept it: both are expired
    const expiredKept = dataset.tasks.filter(
      (t) =>
        t.isActive &&
        ["chiamare", "non risponde"].includes(t.state ?? "") &&
        t.alertId != null
    )
    expect(expiredKept.some((t) => t.state === "chiamare")).toBe(true)
    expect(expiredKept.some((t) => t.state === "non risponde")).toBe(true)
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
    // The instant `calls_registry`: `call` rows after it, the old calls before
    const [milestone] = dataset.appMilestones
    expect(milestone?.name).toBe("calls_registry")
    const registryAt = milestone!.at.getTime()
    const lastState = new Map<number, string>()
    const lastOperator = new Map<number, number>()
    /** The open alert of each contact, as the rows so far leave it. */
    const openAlert = new Map<number, AlertRow | null>()
    const requestIds = new Set<string>()
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
      if (row.action !== "call") {
        // Only a `call` row has an outcome, an origin and a request
        expect(row.outcome ?? null).toBeNull()
        expect(row.origin ?? null).toBeNull()
        expect(row.requestId ?? null).toBeNull()
      }
      if (row.action === "state_change") {
        expect(row.fromState).not.toBeNull()
        expect(row.toState).not.toBeNull()
        expect(row.fromState).not.toBe(row.toState)
        expect(row.fromOperatorId ?? null).toBeNull()
        expect(row.toOperatorId ?? null).toBeNull()
        // The rows of a contact follow one another
        if (lastState.has(task!.id)) {
          expect(row.fromState, `log ${row.id}`).toBe(lastState.get(task!.id))
        }
        lastState.set(task!.id, row.toState!)
        if (row.source === "cron_alert") {
          // The nightly pass (AC19): Richiamo to Da chiamare, the alert still
          // open and due on that day or before. Not a call, no alert_resolved
          expect(row.fromState).toBe("richiamare")
          expect(row.toState).toBe("chiamare")
          const alert = alerts.get(task!.alertId!)
          expect(alert, `log ${row.id}`).toBeDefined()
          expect(alert!.isResolved).toBe(false)
          expect(
            romeDay(alert!.deadline) <= romeDay(row.createdAt!),
            `log ${row.id}`
          ).toBe(true)
        } else if (at >= registryAt) {
          // After `calls_registry` a change of state is no longer a call: the
          // selector to Pratica caricata, or «Togli il richiamo»
          expect(
            row.toState === "caricato" || row.fromState === "richiamare",
            `log ${row.id}`
          ).toBe(true)
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
      } else if (row.action === "alert_resolved") {
        const alert = alerts.get(row.alertId!)
        expect(alert, `log ${row.id}`).toBeDefined()
        expect(alert!.taskId).toBe(task!.id)
        expect(alert!.isResolved).toBe(true)
        expect(alert!.resolvedBy).toBe(row.actorOperatorId)
        // The call that closes it comes right after, as the service writes
        // them: the alert is still the one it found (AC10)
      } else {
        // A call (AC8-AC10): registered after `calls_registry`, one of the
        // four outcomes, with its origin, its request and the alert it leaves
        expect(at, `log ${row.id}`).toBeGreaterThan(registryAt)
        expect(["detail", "list"]).toContain(row.source)
        expect(
          ["non risponde", "richiamare", "app.to", "non interessato"],
          `log ${row.id}`
        ).toContain(row.outcome)
        expect(["alert", "list"]).toContain(row.origin)
        expect(row.requestId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        )
        expect(requestIds.has(row.requestId!), `log ${row.id}`).toBe(false)
        requestIds.add(row.requestId!)
        expect(contactStates).toContain(row.fromState)
        expect(contactStates).toContain(row.toState)
        expect(row.fromOperatorId ?? null).toBeNull()
        expect(row.toOperatorId ?? null).toBeNull()
        // A contact with no row yet starts in Da chiamare
        expect(row.fromState, `log ${row.id}`).toBe(
          lastState.get(task!.id) ?? "chiamare"
        )
        lastState.set(task!.id, row.toState!)

        const before = openAlert.get(task!.id) ?? null
        const callDay = romeDay(row.createdAt!)
        // AC10: from an alert when the open one is due today or before
        expect(row.origin, `log ${row.id}`).toBe(
          before && romeDay(before.deadline) <= callDay ? "alert" : "list"
        )
        if (row.outcome === "richiamare") {
          // The new alert, in the future, on this contact
          const created = alerts.get(row.alertId!)
          expect(created, `log ${row.id}`).toBeDefined()
          expect(created!.taskId).toBe(task!.id)
          expect(romeDay(created!.deadline) > callDay, `log ${row.id}`).toBe(
            true
          )
          expect(created!.createdAt!.getTime()).toBe(at)
          expect(row.toState).toBe("richiamare")
          expect(before).toBeNull()
          openAlert.set(task!.id, created!)
        } else if (row.outcome === "non risponde") {
          // The open alert stays; with a future one the contact stays in
          // Richiamo, otherwise it is in Non risponde
          expect(row.alertId ?? null, `log ${row.id}`).toBe(before?.id ?? null)
          expect(row.toState).toBe(
            before && romeDay(before.deadline) > callDay
              ? "richiamare"
              : "non risponde"
          )
        } else {
          // Appuntamento or Non interessato: closes the alert, which says so
          expect(row.alertId ?? null).toBeNull()
          expect(row.toState).toBe(row.outcome)
          if (before) {
            expect(before.resolution, `log ${row.id}`).toBe("call")
            expect(before.resolvedBy).toBe(row.actorOperatorId)
            expect(before.resolvedAt!.getTime()).toBe(at)
          }
          openAlert.set(task!.id, null)
        }
      }
    }
    // The latest change of state of a contact, a call or the nightly pass,
    // is where the contact stands
    for (const [taskId, state] of lastState) {
      expect(tasks.get(taskId)!.state, `task ${taskId}`).toBe(state)
    }
    for (const [taskId, operatorId] of lastOperator) {
      expect(tasks.get(taskId)!.operatorId, `task ${taskId}`).toBe(operatorId)
    }
    // «Contattato il» is the time of the last call, Non risponde included
    // (AC29); the open alert of a contact with calls is the one they left
    const lastCall = new Map<number, number>()
    for (const row of rows) {
      if (row.action === "call")
        lastCall.set(row.taskId!, row.createdAt!.getTime())
    }
    for (const [taskId, at] of lastCall) {
      expect(tasks.get(taskId)!.closedAt!.getTime(), `task ${taskId}`).toBe(at)
    }
  })

  it("closes an alert with the date and the way, only from `calls_registry` on (esiti-richiami-stati AC23)", () => {
    const { dataset } = index()
    const registryAt = dataset.appMilestones[0]!.at.getTime()
    const logged = new Set(
      dataset.taskEventLog
        .filter((row) => row.action === "alert_resolved")
        .map((row) => row.alertId)
    )
    const ways = new Set<string>()
    for (const alert of dataset.alerts) {
      if (!alert.isResolved) {
        expect(alert.resolvedAt ?? null, `alert ${alert.id}`).toBeNull()
        expect(alert.resolution ?? null, `alert ${alert.id}`).toBeNull()
        continue
      }
      if (alert.resolution == null) {
        // Closed before: neither the date nor the way
        expect(alert.resolvedAt ?? null, `alert ${alert.id}`).toBeNull()
        expect(logged.has(alert.id), `alert ${alert.id}`).toBe(true)
        continue
      }
      ways.add(alert.resolution)
      expect(alert.resolvedAt, `alert ${alert.id}`).toBeInstanceOf(Date)
      expect(alert.resolvedAt!.getTime()).toBeGreaterThan(registryAt)
      // The conversion closes an orphan "dal sistema", with no row (AC32)
      expect(alert.resolvedBy === SYSTEM_OPERATOR_ID).toBe(
        alert.resolution === "system"
      )
      expect(logged.has(alert.id), `alert ${alert.id}`).toBe(
        alert.resolution !== "system"
      )
    }
    expect(ways).toEqual(new Set(["call", "state_change", "removed", "system"]))
  })

  it("has calls with repeated outcomes, kept alerts and origins from the alert and from the list (AC8-AC10)", () => {
    const { dataset, alerts } = index()
    const calls = dataset.taskEventLog.filter((row) => row.action === "call")
    expect(calls.length).toBeGreaterThan(0)
    expect(new Set(calls.map((row) => row.outcome))).toEqual(
      new Set(["non risponde", "richiamare", "app.to", "non interessato"])
    )
    expect(new Set(calls.map((row) => row.origin))).toEqual(
      new Set(["alert", "list"])
    )
    // Two Non risponde in a row on the same contact are two calls
    const byTask = new Map<number, string[]>()
    for (const row of calls) {
      byTask.set(row.taskId!, [
        ...(byTask.get(row.taskId!) ?? []),
        row.outcome!,
      ])
    }
    expect(
      [...byTask.values()].some((outcomes) =>
        outcomes.some(
          (outcome, k) =>
            outcome === "non risponde" && outcomes[k + 1] === "non risponde"
        )
      )
    ).toBe(true)
    // A Non risponde that keeps an expired alert: the contact is in Non
    // risponde, the alert open and still its
    expect(
      calls.some((row) => {
        const alert = row.alertId == null ? undefined : alerts.get(row.alertId)
        return (
          row.outcome === "non risponde" &&
          row.toState === "non risponde" &&
          row.origin === "alert" &&
          alert !== undefined &&
          alert.isResolved === false
        )
      })
    ).toBe(true)
    // A Non risponde with a future alert leaves the contact in Richiamo
    if (big) {
      expect(
        calls.some(
          (row) =>
            row.outcome === "non risponde" &&
            row.fromState === "richiamare" &&
            row.toState === "richiamare" &&
            row.origin === "list"
        )
      ).toBe(true)
    }
  })

  it("puts every active contact a cron selects in exactly one P scenario, with a seed priority that differs from the expected one (D10)", () => {
    const { priority, notSelected, unmatchedTasks } = classify(get(), day)
    expect(unmatchedTasks).toEqual([])
    for (const { task, id, expected } of priority) {
      expect(task.priority, `task ${task.id} (${id})`).not.toBe(expected)
    }
    // P2 and P8 have no alert, and are not in Richiamo, so `alert` never
    // writes them (D13)
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
      "P6",
      "P7",
      "P8",
      "P9",
      "P10",
      "P13",
    ]) {
      expect(ids, id).toContain(id)
    }
  })

  it("puts every alert in exactly one of A1, A3-A5 and A7 (D10)", () => {
    const { openAlerts, resolved, unmatchedAlerts } = classify(get(), day)
    expect(unmatchedAlerts).toEqual([])
    const ids = new Set([...openAlerts, ...resolved].map((m) => m.id))
    for (const id of ["A1", "A3", "A4", "A5", "A7"]) {
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
    // A1 on D, A3 the catch-up of a skipped night (D - 1 among them), A4 one
    // due on D + 1; A7 on a Da chiamare and on a Non risponde, with the
    // priority of P1 and P13
    const taskOf = new Map(dataset.tasks.map((t) => [t.id, t]))
    const withAlert = (id: string) =>
      openAlerts
        .filter((m) => m.id === id)
        .map((m) => taskOf.get(m.alert.taskId)!)
    expect(openAlerts.some((m) => m.id === "A1")).toBe(true)
    expect(
      openAlerts.some(
        (m) => m.id === "A3" && romeDay(m.alert.deadline) === addDays(day, -1)
      )
    ).toBe(true)
    expect(
      openAlerts.some(
        (m) => m.id === "A4" && romeDay(m.alert.deadline) === addDays(day, 1)
      )
    ).toBe(true)
    expect(withAlert("A7").some((t) => t.state === "chiamare")).toBe(true)
    expect(withAlert("A7").some((t) => t.state === "non risponde")).toBe(true)
    for (const [id, state] of [
      ["P1", "chiamare"],
      ["P13", "non risponde"],
    ] as const) {
      expect(
        priority.some(
          (m) => m.id === id && m.task.state === state && m.task.alertId != null
        ),
        `${id} with an open alert`
      ).toBe(true)
    }
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
