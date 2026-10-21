// Contacts (`task`), alerts and the event log of the local seed (AC18-AC24,
// AC26, AC27, AC30 and the `priority`, `alert`, `cleanup-task-event-log`
// scenarios). Pure and seeded: the result depends only on the customers, the
// operators and `day`. Every timestamp comes from D: deadlines at Rome
// midnight, everything else at Rome noon of a day not after D.
//
// D10: every row a cron selects is a row of exactly one scenario. The active
// contacts are built from a queue of scenario kinds, and the generic filler is
// P4 (priority 1 after the recalculation). Every open alert is on the active
// `richiamare` contact of its customer, linked both ways; every resolved alert
// (A5) is on a non-active contact.
import { taskStatus } from "@mito/db/schema/index"
import { subMonthsDay } from "../day"
import type {
  AlertRow,
  CustomerRow,
  Day,
  OperatorRow,
  TaskEventLogRow,
  TaskRow,
} from "../types"
import { createDayClock, daysBetween } from "./clock"
import { createLog, type TaskStatus } from "./log"
import {
  ACTIVE_CONTACT_SHARE,
  ADMIN_COUNT,
  EMPTY_OPERATOR_ID,
  SYSTEM_OPERATOR_ID,
} from "./operators"
import { createRandom, range } from "./random"
import { contactScenarioCounts } from "./scenarios"

export const TASK_ID_START = 1000
export const ALERT_ID_START = 1000

/** Share of the customers with an active contact that also have history. */
const HISTORY_SHARE_OF_ACTIVE = 0.25
/** Share of the customers without an active contact that have history. */
const HISTORY_SHARE_OF_OTHERS = 0.3
/** Share of the non-active contacts worked by another operator (AC19). */
const OTHER_OPERATOR_SHARE = 0.45
/** Share of the eligible non-active contacts with an alert closed by hand. */
const MANUAL_A5_SHARE = 0.15

export const MANUAL_PRIORITIES = [20, 60, 100, 120] as const
const P4_STATES = ["app.to", "caricato", "erogata", "nessuno"] as const
const P8_STATES = taskStatus.filter((state) => state !== "richiamare")

const ALERT_MESSAGES = [
  "Richiamare dopo le 17",
  "Il cliente chiede di essere ricontattato",
  "Attende i documenti dal datore di lavoro",
  "Valutare una nuova proposta",
  "Ricontattare per il rinnovo",
]

type P4State = (typeof P4_STATES)[number]

/** The scenario of an active contact. */
type Plan =
  | {
      kind: "P1" | "P2" | "P3" | "P10" | "P5" | "P11" | "A1" | "A2" | "A4"
    }
  | { kind: "P4"; state: P4State }
  | { kind: "A3"; closed: boolean }
  | { kind: "P8"; priority: number }

const hasOpenAlert = (plan: Plan) =>
  plan.kind === "A1" ||
  plan.kind === "A2" ||
  plan.kind === "A3" ||
  plan.kind === "A4"

export function generateContacts({
  day,
  customers,
  operators,
}: {
  day: Day
  customers: readonly CustomerRow[]
  operators: readonly OperatorRow[]
}): { alerts: AlertRow[]; tasks: TaskRow[]; taskEventLog: TaskEventLogRow[] } {
  const n = customers.length
  const rng = createRandom("contacts")
  const clock = createDayClock(day)
  const counts = contactScenarioCounts(n)
  const realOperatorIds = operators
    .map((operator) => operator.id)
    .filter((id) => id !== EMPTY_OPERATOR_ID && id !== SYSTEM_OPERATOR_ID)
  const adminIds = realOperatorIds.slice(0, ADMIN_COUNT)
  const sixMonths = daysBetween(subMonthsDay(day, 6), day)
  const cutoff = daysBetween(subMonthsDay(day, 3), day)
  const log = createLog({ rng, clock, cutoff, realOperatorIds, adminIds })

  // Active contacts: the same share of the customers of every operator, and
  // of those without operator, so the loads follow the customer shares (AC18)
  const groups = new Map<number | null, number[]>()
  customers.forEach((customer, i) => {
    const key = customer.operatorId ?? null
    const group = groups.get(key)
    if (group) group.push(i)
    else groups.set(key, [i])
  })
  const active = customers.map(() => false)
  for (const members of groups.values()) {
    rng
      .shuffle(members)
      .slice(0, Math.round(members.length * ACTIVE_CONTACT_SHARE))
      .forEach((i) => (active[i] = true))
  }

  // Scenario of each active contact: A2 needs a customer without operator, A1
  // one with; P4 fills what the queue leaves
  const plans: Array<Plan | null> = customers.map(() => null)
  const shuffled = rng.shuffle(range(n).filter((i) => active[i]))
  const withoutOperator = shuffled.filter(
    (i) => customers[i]!.operatorId == null
  )
  const withOperator = shuffled.filter((i) => customers[i]!.operatorId != null)
  if (withoutOperator.length < counts.A2 || withOperator.length < counts.A1) {
    throw new Error("Clienti insufficienti per gli scenari A1 e A2")
  }
  withoutOperator
    .slice(0, counts.A2)
    .forEach((i) => (plans[i] = { kind: "A2" }))
  withOperator.slice(0, counts.A1).forEach((i) => (plans[i] = { kind: "A1" }))
  const rest = rng.shuffle([
    ...withoutOperator.slice(counts.A2),
    ...withOperator.slice(counts.A1),
  ])
  const repeat = (count: number, plan: (k: number) => Plan) =>
    range(count).map((k) => plan(k))
  const queue: Plan[] = [
    ...repeat(counts.P1, () => ({ kind: "P1" })),
    ...repeat(counts.P2, () => ({ kind: "P2" })),
    ...repeat(counts.P3, () => ({ kind: "P3" })),
    ...repeat(counts.P10, () => ({ kind: "P10" })),
    ...repeat(counts.P5, () => ({ kind: "P5" })),
    ...repeat(counts.A3, (k) => ({ kind: "A3", closed: k % 2 === 0 })),
    ...repeat(counts.A4, () => ({ kind: "A4" })),
    ...repeat(counts.P11, () => ({ kind: "P11" })),
    ...repeat(counts.P8, (k) => ({
      kind: "P8",
      priority: MANUAL_PRIORITIES[k % MANUAL_PRIORITIES.length]!,
    })),
  ]
  if (queue.length > rest.length) {
    throw new Error("Troppi scenari di contatto per il numero di clienti")
  }
  rest.forEach((i, k) => {
    const filler = k - queue.length
    plans[i] = queue[k] ?? {
      kind: "P4",
      state:
        filler < P4_STATES.length
          ? P4_STATES[filler]!
          : rng.weighted<P4State>([
              ["nessuno", 55],
              ["app.to", 15],
              ["caricato", 15],
              ["erogata", 15],
            ]),
    }
  })

  // History: P5 always has it (the contact the cron replaced), the others by
  // share. The rest of the customers have no contact at all (AC20)
  const hasHistory = customers.map((_, i) => {
    const plan = plans[i]
    if (!plan) return false
    return plan.kind === "P5" || rng.chance(HISTORY_SHARE_OF_ACTIVE)
  })
  const others = rng.shuffle(range(n).filter((i) => !active[i]))
  others
    .slice(0, Math.round(others.length * HISTORY_SHARE_OF_OTHERS))
    .forEach((i) => (hasHistory[i] = true))

  /** Oldest offset a contact of the customer may have. */
  const topOf = (customer: CustomerRow) =>
    Math.min(
      sixMonths,
      (customer.createdAt ? clock.offsetOf(customer.createdAt) : 60) - 1
    )

  // The customer whose single past contact spans the cutoff day, with log
  // rows on the day before and after it (AC27, L1/L2)
  const boundaryIndex = range(n).find(
    (i) =>
      hasHistory[i] &&
      plans[i]?.kind !== "P5" &&
      topOf(customers[i]!) >= cutoff + 1
  )
  if (boundaryIndex === undefined) {
    throw new Error("Nessun cliente per le righe di log sul confine di 3 mesi")
  }

  const tasks: TaskRow[] = []
  const alerts: AlertRow[] = []
  const nextTaskId = () => TASK_ID_START + tasks.length
  const nextAlertId = () => ALERT_ID_START + alerts.length
  const message = () => (rng.chance(0.8) ? rng.pick(ALERT_MESSAGES) : null)
  /** Keeps a contact's day off the cutoff, inside [min, max] if possible. */
  const avoidCutoff = (offset: number, min: number, max: number) =>
    offset !== cutoff
      ? offset
      : offset + 1 <= max
        ? offset + 1
        : offset - 1 >= min
          ? offset - 1
          : offset

  let historyCount = 0
  let otherOperatorForced = false
  let manualA5Forced = false
  let firstA3 = true
  let firstA4 = true

  /** A non-active contact with an outcome, created `co` and closed `cl`. */
  const pushPast = (
    customer: CustomerRow,
    co: number,
    cl: number,
    boundary: boolean
  ) => {
    const state =
      historyCount < taskStatus.length
        ? taskStatus[historyCount]!
        : rng.weighted<TaskStatus>([
            ["non interessato", 20],
            ["richiamare", 20],
            ["chiamare", 10],
            ["app.to", 10],
            ["caricato", 10],
            ["erogata", 10],
            ["nessuno", 10],
            ["followup", 10],
          ])
    historyCount++
    const other = !otherOperatorForced || rng.chance(OTHER_OPERATOR_SHARE)
    otherOperatorForced = true
    const operatorId = other
      ? rng.pick(realOperatorIds.filter((id) => id !== customer.operatorId))
      : (customer.operatorId ?? null)
    const taskId = nextTaskId()

    let alertId: number | null = null
    const manualA5 =
      !boundary &&
      state !== "richiamare" &&
      (!manualA5Forced || rng.chance(MANUAL_A5_SHARE))
    if (manualA5) {
      manualA5Forced = true
      alertId = nextAlertId()
      const resolver = operatorId ?? rng.pick(realOperatorIds)
      alerts.push({
        id: alertId,
        createdAt: clock.noon(rng.int(cl, co)),
        updatedAt: clock.noon(cl),
        deadline: clock.midnight(rng.int(Math.max(1, cl - 15), cl)),
        taskId,
        message: message(),
        isResolved: true,
        resolvedBy: resolver,
      })
      // The state change that closed the alert, on the day of the call
      const earlier = log.pickDays(rng.int(0, 1), cl, co)
      if (earlier) {
        log.stateChain({
          customerId: customer.id,
          taskId,
          operatorId,
          final: state,
          before: "richiamare",
          days: [...earlier, cl],
        })
      }
      log.alertResolved({
        customerId: customer.id,
        taskId,
        alertId,
        actorOperatorId: resolver,
        offset: cl,
      })
    } else if (boundary) {
      log.stateChain({
        customerId: customer.id,
        taskId,
        operatorId,
        final: state,
        days: [cutoff + 1, cutoff - 1],
      })
    } else if (rng.chance(0.65)) {
      const days = log.pickDays(rng.int(1, 2), cl, co)
      if (days) {
        log.stateChain({
          customerId: customer.id,
          taskId,
          operatorId,
          final: state,
          days,
        })
      }
    }
    if (operatorId !== null && rng.chance(0.3)) {
      log.reassign({
        customerId: customer.id,
        taskId,
        toOperatorId: operatorId,
        offset: log.pickDay(cl, co),
      })
    }

    tasks.push({
      id: taskId,
      createdAt: clock.noon(co),
      updatedAt: clock.noon(cl),
      state,
      closedAt: clock.noon(cl),
      customerId: customer.id,
      operatorId,
      alertId,
      priority:
        state === "chiamare"
          ? 120
          : state === "non interessato"
            ? 10
            : state === "richiamare"
              ? rng.pick([0, 20, 30, 50])
              : state === "followup"
                ? rng.pick([150, 1])
                : 1,
      customPriority: false,
      isActive: false,
    })
  }

  customers.forEach((customer, i) => {
    const plan = plans[i]
    if (!plan && !hasHistory[i]) return
    const top = topOf(customer)

    // Offsets of the active contact: created `ca`, alert created `alertAt`
    // and due `deadline`. Without an active contact, `ca` bounds the history
    let ca: number
    let alertAt = 0
    let deadline = 0
    switch (plan?.kind) {
      case "A1":
      case "A2":
        ca = rng.int(1, 40)
        alertAt = rng.int(1, ca)
        break
      case "A3":
        deadline = firstA3 ? 1 : rng.int(1, 20)
        firstA3 = false
        ca = deadline + rng.int(0, 25)
        alertAt = rng.int(deadline, ca)
        break
      case "A4":
        deadline = firstA4 ? -1 : -rng.int(1, 30)
        firstA4 = false
        ca = rng.int(0, 40)
        alertAt = rng.int(0, ca)
        break
      case "P5":
        ca = rng.int(1, 40)
        break
      default:
        ca = rng.int(0, 45)
    }

    // History, oldest first. `lastClosed` is the latest closed_at of it
    let lastClosed: number | null = null
    if (hasHistory[i] && i === boundaryIndex) {
      pushPast(customer, cutoff + 1, cutoff - 1, true)
      lastClosed = cutoff - 1
    } else if (hasHistory[i]) {
      // P5: the contact the cron replaced on day `ca` is the latest one
      let low = ca
      let replaced: { co: number; cl: number } | null = null
      if (plan?.kind === "P5") {
        const co = rng.int(ca + 1, Math.min(top, ca + 30))
        replaced = { co, cl: rng.int(ca + 1, co) }
        low = co
      }
      const wanted =
        plan?.kind === "P5"
          ? rng.int(0, 1)
          : rng.weighted<number>([
              [1, 60],
              [2, 30],
              [3, 10],
            ])
      const count = Math.max(0, Math.min(top - low, wanted))
      const segment = count > 0 ? Math.floor((top - low) / count) : 0
      for (let j = 0; j < count; j++) {
        const segHi = top - j * segment
        const segLo = segHi - segment + 1
        const co = avoidCutoff(rng.int(segLo, segHi), segLo, segHi)
        const cl = avoidCutoff(rng.int(segLo, co), segLo, co)
        pushPast(customer, co, cl, false)
        lastClosed = cl
      }
      if (replaced) {
        const { co, cl } = replaced
        const taskId = nextTaskId()
        const alertId = nextAlertId()
        alerts.push({
          id: alertId,
          createdAt: clock.noon(cl),
          updatedAt: clock.noon(ca),
          deadline: clock.midnight(ca),
          taskId,
          message: message(),
          isResolved: true,
          resolvedBy: SYSTEM_OPERATOR_ID,
        })
        tasks.push({
          id: taskId,
          createdAt: clock.noon(co),
          updatedAt: clock.noon(ca),
          state: "richiamare",
          closedAt: clock.noon(cl),
          customerId: customer.id,
          operatorId: customer.operatorId ?? null,
          alertId,
          priority: rng.pick([0, 20, 30, 50]),
          customPriority: false,
          isActive: false,
        })
        if (rng.chance(0.5)) {
          const days = log.pickDays(rng.int(1, 2), cl, co)
          if (days) {
            log.stateChain({
              customerId: customer.id,
              taskId,
              operatorId: customer.operatorId ?? null,
              final: "richiamare",
              days,
            })
          }
        }
        log.cronAlert({
          customerId: customer.id,
          taskId,
          alertId,
          fromState: "richiamare",
          offset: ca,
        })
        lastClosed = cl
      }
    }

    if (!plan) return

    // The active contact
    const taskId = nextTaskId()
    const operatorId = customer.operatorId ?? null
    let state: TaskStatus
    let priority: number
    let customPriority = false
    switch (plan.kind) {
      case "P1":
        state = "chiamare"
        priority = rng.pick([0, 1, 10, 30, 50, 80])
        break
      case "P2":
        state = "chiamare"
        priority = 120
        break
      case "P3":
        state = "non interessato"
        priority = rng.pick([0, 1, 30, 50, 80])
        break
      case "P10":
        state = "non interessato"
        priority = 120
        break
      case "P4":
        state = plan.state
        priority = rng.pick([0, 10, 20, 30, 50])
        break
      case "P5":
        state = "followup"
        priority = 150
        break
      case "P8":
        state = rng.pick(P8_STATES)
        priority = plan.priority
        customPriority = true
        break
      case "P11":
        state = "richiamare"
        priority = rng.pick([1, 20, 30, 50])
        break
      case "A1":
      case "A2":
        state = "richiamare"
        priority = rng.pick([0, 20, 30, 120])
        break
      case "A3":
        state = "richiamare"
        priority = plan.closed
          ? rng.pick([0, 20, 30, 120]) // P6: 50 expected
          : rng.pick([0, 30, 50]) // P12: 20 expected
        break
      case "A4":
        state = "richiamare"
        priority = rng.pick([0, 20, 50]) // P7: 30 expected
        break
    }

    // closed_at: required by P6/P7 (A1-A4 with it), forbidden by P11/P12,
    // inherited from the latest past contact when there is one (reopened)
    let closed: number | null
    if (
      plan.kind === "A1" ||
      plan.kind === "A2" ||
      plan.kind === "A4" ||
      (plan.kind === "A3" && plan.closed)
    ) {
      closed = lastClosed ?? alertAt
    } else if (plan.kind === "P5") {
      closed = lastClosed
    } else if (plan.kind === "P11" || plan.kind === "A3") {
      closed = null
    } else if (lastClosed !== null) {
      closed = rng.chance(0.7) ? lastClosed : null
    } else {
      closed = rng.chance(0.3) ? rng.int(0, ca) : null
    }

    let alertId: number | null = null
    if (hasOpenAlert(plan)) {
      alertId = nextAlertId()
      alerts.push({
        id: alertId,
        createdAt: clock.noon(alertAt),
        updatedAt: clock.noon(alertAt),
        deadline: clock.midnight(deadline),
        taskId,
        message: message(),
        isResolved: false,
        resolvedBy: null,
      })
    }

    // Before the alert was set: a later state change would have closed it
    const latest = hasOpenAlert(plan) ? alertAt : 0
    if (plan.kind !== "P5") {
      if (rng.chance(0.5)) {
        const days = log.pickDays(rng.int(1, 2), latest, ca)
        if (days) {
          log.stateChain({
            customerId: customer.id,
            taskId,
            operatorId,
            final: state,
            days,
          })
        }
      }
      if (operatorId !== null && rng.chance(0.25)) {
        log.reassign({
          customerId: customer.id,
          taskId,
          toOperatorId: operatorId,
          offset: log.pickDay(latest, ca),
        })
      }
    }

    tasks.push({
      id: taskId,
      createdAt: clock.noon(ca),
      // Last touched when the alert was set, or later
      updatedAt: clock.noon(
        plan.kind === "P5" ? ca : rng.int(0, hasOpenAlert(plan) ? alertAt : ca)
      ),
      state,
      closedAt: closed === null ? null : clock.noon(closed),
      customerId: customer.id,
      operatorId,
      alertId,
      priority,
      customPriority,
      isActive: true,
    })
  })

  return { alerts, tasks, taskEventLog: log.rows() }
}
