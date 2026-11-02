// Contacts (`task`), alerts and the event log of the local seed (AC18-AC24,
// AC26, AC27, AC30 and the `priority`, `alert`, `cleanup-task-event-log`
// scenarios), on the six states of esiti-richiami-stati. Pure and seeded: the
// result depends only on the customers, the operators and `day`. Every
// timestamp comes from D: deadlines at Rome midnight, everything else at Rome
// noon of a day not after D.
//
// D10: every row a cron selects is a row of exactly one scenario. The active
// contacts are built from a queue of scenario kinds, and the generic filler is
// P4 (Appuntamento or Pratica caricata, priority 1 after the recalculation).
//
// AC4: an active contact is in Richiamo iff it has an open future alert. The
// exceptions are the alerts the nightly pass has not worked yet (A1, A3: due on
// D or before, the contact still in Richiamo), and the alerts it leaves open
// on Da chiamare (P1X) and Non risponde (P13X) contacts once worked (AC19,
// AC21). Every open alert is on the active contact of its customer, linked
// both ways; every resolved alert is on a non-active contact.
//
// Calls (AC9): the active contacts and the past ones closed after
// `calls_registry` (generate/milestones.ts) have `call` rows, with repeated
// outcomes; older contacts keep the `state_change` rows of the old rule.
import { contactStates, type ContactState } from "@mito/domain/contact/status"
import { LOG_RETENTION_MONTHS } from "@mito/domain/export/period"
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
import { CALLS_REGISTRY_OFFSET } from "./milestones"
import {
  ACTIVE_CONTACT_SHARE,
  ADMIN_COUNT,
  EMPTY_OPERATOR_ID,
  SYSTEM_OPERATOR_ID,
} from "./operators"
import { createRandom, range } from "./random"
import { contactScenarioCounts } from "./scenarios"

/** Months of history the seed writes before the log retention cutoff. */
const LOG_HISTORY_MONTHS = 6

export const TASK_ID_START = 1000
export const ALERT_ID_START = 1000

/** Share of the customers with an active contact that also have history. */
const HISTORY_SHARE_OF_ACTIVE = 0.25
/** Share of the customers without an active contact that have history. */
const HISTORY_SHARE_OF_OTHERS = 0.3
/** Share of the oldest contacts that close before the log retention cutoff. */
const OLD_CONTACT_SHARE = 0.85
/** Share of the non-active contacts worked by another operator (AC19). */
const OTHER_OPERATOR_SHARE = 0.45
/** Share of the eligible non-active contacts with an alert closed by hand. */
const MANUAL_A5_SHARE = 0.15
/** Share of the active contacts in a final state that got there by a call. */
const CALLED_SHARE = 0.6
/** Share of the sequences of calls that start with a Non risponde. */
const PRIOR_NO_ANSWER_SHARE = 0.3

export const MANUAL_PRIORITIES = [20, 60, 100, 120] as const
const P4_STATES = ["app.to", "caricato"] as const
const P8_STATES = contactStates.filter((state) => state !== "richiamare")
/**
 * The newest past contact of the first customers with history is a recent one,
 * closed after `calls_registry`, in these states, each with a closed alert but
 * Richiamo (an alert closed by a call, by the selector, by «Togli il
 * richiamo»), so every kind of closing is in the log at any N.
 */
const RECENT_PAST_STATES = [
  "app.to",
  "non interessato",
  "caricato",
  "non risponde",
  "chiamare",
  "richiamare",
] as const satisfies readonly ContactState[]

const ALERT_MESSAGES = [
  "Richiamare dopo le 17",
  "Il cliente chiede di essere ricontattato",
  "Attende i documenti dal datore di lavoro",
  "Valutare una nuova proposta",
  "Ricontattare per il rinnovo",
]

type P4State = (typeof P4_STATES)[number]
type CallOutcome = "non risponde" | "richiamare" | "app.to" | "non interessato"
type Source = "detail" | "list"

/** The scenario of an active contact. */
type Plan =
  | {
      kind:
        "P1" | "P1X" | "P2" | "P3" | "P10" | "P13" | "P13X" | "A1" | "A3" | "A4"
    }
  | { kind: "P4"; state: P4State }
  | { kind: "P8"; priority: number }

const hasOpenAlert = (plan: Plan) =>
  plan.kind === "P1X" ||
  plan.kind === "P13X" ||
  plan.kind === "A1" ||
  plan.kind === "A3" ||
  plan.kind === "A4"

/** The open alert of a contact, due `dueOffset` days before D. */
type OpenAlert = { id: number; dueOffset: number }

/** One call: the new alert is only for a Richiamare. */
type CallStep = {
  offset: number
  outcome: CallOutcome
  alert?: OpenAlert
}

/** How a past contact's alert was closed (`alert.resolution`). */
type Closure = "call" | "state_change" | "removed" | "system" | "operator"

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
  // The log reaches back 6 months before the retention cutoff, so there are
  // rows to delete as well as rows to keep (AC26)
  const horizon = daysBetween(
    subMonthsDay(day, LOG_RETENTION_MONTHS + LOG_HISTORY_MONTHS),
    day
  )
  const cutoff = daysBetween(subMonthsDay(day, LOG_RETENTION_MONTHS), day)
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

  // Scenario of each active contact; P4 fills what the queue leaves
  const plans: Array<Plan | null> = customers.map(() => null)
  const rest = rng.shuffle(range(n).filter((i) => active[i]))
  const repeat = (count: number, plan: (k: number) => Plan) =>
    range(count).map((k) => plan(k))
  const queue: Plan[] = [
    ...repeat(counts.P1, () => ({ kind: "P1" })),
    ...repeat(counts.P1X, () => ({ kind: "P1X" })),
    ...repeat(counts.P2, () => ({ kind: "P2" })),
    ...repeat(counts.P3, () => ({ kind: "P3" })),
    ...repeat(counts.P10, () => ({ kind: "P10" })),
    ...repeat(counts.P13, () => ({ kind: "P13" })),
    ...repeat(counts.P13X, () => ({ kind: "P13X" })),
    ...repeat(counts.A1, () => ({ kind: "A1" })),
    ...repeat(counts.A3, () => ({ kind: "A3" })),
    ...repeat(counts.A4, () => ({ kind: "A4" })),
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
              ["app.to", 50],
              ["caricato", 50],
            ]),
    }
  })

  // History: by share. The rest of the customers have no contact at all (AC20)
  const hasHistory = customers.map(
    (_, i) => plans[i] != null && rng.chance(HISTORY_SHARE_OF_ACTIVE)
  )
  const others = rng.shuffle(range(n).filter((i) => !active[i]))
  others
    .slice(0, Math.round(others.length * HISTORY_SHARE_OF_OTHERS))
    .forEach((i) => (hasHistory[i] = true))

  /** Oldest offset a contact of the customer may have. */
  const topOf = (customer: CustomerRow) =>
    Math.min(
      horizon,
      (customer.createdAt ? clock.offsetOf(customer.createdAt) : 60) - 1
    )

  // The customer whose single past contact spans the cutoff day, with log
  // rows on the day before and after it (AC27, L1/L2)
  const boundaryIndex = range(n).find(
    (i) => hasHistory[i] && topOf(customers[i]!) >= cutoff + 1
  )
  if (boundaryIndex === undefined) {
    throw new Error(
      "Nessun cliente per le righe di log sul confine della conservazione"
    )
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
  /** `count` different days in [min, max], oldest first (fewer if they don't fit). */
  const distinctDays = (count: number, min: number, max: number) =>
    rng
      .shuffle(range(max - min + 1).map((k) => min + k))
      .slice(0, count)
      .sort((a, b) => b - a)
  const source = (): Source => rng.pick(["detail", "list"])

  /**
   * The `call` rows of a contact (AC8-AC10), oldest first, from `state` and
   * the open alert it has before them. The origin is "alert" when the alert is
   * due on the day of the call or before; a Non risponde keeps the alert and
   * leaves the contact in Richiamo while it is still in the future; a
   * Richiamare opens the alert it carries; the other two close the open one
   * (with the `alert_resolved` row). Returns where the contact ends.
   */
  const writeCalls = ({
    customerId,
    taskId,
    actorOperatorId,
    state,
    open,
    steps,
  }: {
    customerId: string
    taskId: number
    actorOperatorId: number
    state: TaskStatus
    open: OpenAlert | null
    steps: readonly CallStep[]
  }): { state: TaskStatus; open: OpenAlert | null } => {
    let current = state
    let alert = open
    for (const step of steps) {
      const from = current
      const via = source()
      // AC10: the alert, before the call, is due on its day or before
      const origin = alert && alert.dueOffset >= step.offset ? "alert" : "list"
      let alertId: number | null
      if (step.outcome === "non risponde") {
        current =
          alert && alert.dueOffset < step.offset ? "richiamare" : "non risponde"
        alertId = alert?.id ?? null
      } else if (step.outcome === "richiamare") {
        if (alert) throw new Error("Un Richiamare non sostituisce alert qui")
        current = "richiamare"
        alert = step.alert!
        alertId = alert.id
      } else {
        current = step.outcome
        alertId = null
        if (alert) {
          log.alertResolved({
            customerId,
            taskId,
            alertId: alert.id,
            actorOperatorId,
            offset: step.offset,
            source: via,
          })
          alert = null
        }
      }
      log.call({
        customerId,
        taskId,
        alertId,
        actorOperatorId,
        source: via,
        outcome: step.outcome,
        origin,
        fromState: from,
        toState: current,
        offset: step.offset,
      })
    }
    return { state: current, open: alert }
  }
  let historyCount = 0
  let recentCount = 0
  let otherOperatorForced = false
  let systemClosureForced = false
  let operatorClosureForced = false
  let firstA3 = true
  let firstA4 = true
  let firstP1X = true
  let firstP13X = true

  /**
   * A non-active contact with an outcome, created `co` and closed `cl`. With
   * `forced`, one of the recent ones (closed after `calls_registry`) that
   * every kind of closing needs.
   */
  const pushPast = (
    customer: CustomerRow,
    co: number,
    cl: number,
    boundary: boolean,
    forced?: ContactState
  ): number => {
    const state: ContactState =
      forced ??
      (historyCount < contactStates.length
        ? contactStates[historyCount]!
        : rng.weighted<ContactState>([
            ["non interessato", 20],
            ["richiamare", 15],
            ["chiamare", 10],
            ["non risponde", 20],
            ["app.to", 15],
            ["caricato", 20],
          ]))
    historyCount++
    const other = !otherOperatorForced || rng.chance(OTHER_OPERATOR_SHARE)
    otherOperatorForced = true
    const operatorId = other
      ? rng.pick(realOperatorIds.filter((id) => id !== customer.operatorId))
      : (customer.operatorId ?? null)
    const taskId = nextTaskId()
    // Closed after `calls_registry`: its outcomes are calls (AC28). At the
    // very instant, nothing is written
    const recent = !boundary && cl < CALLS_REGISTRY_OFFSET
    const before = !boundary && cl > CALLS_REGISTRY_OFFSET
    const actor = operatorId ?? rng.pick(realOperatorIds)
    // «Contattato il» is the day of the last call (AC29), else the closing
    let calledAt = cl
    // The oldest day of a call: after `calls_registry`
    const firstCall = Math.min(co, CALLS_REGISTRY_OFFSET - 1)

    // The alert closed on the day of the closing, by whom and how
    let closure: Closure | null = null
    if (!boundary && state !== "richiamare") {
      if (recent) {
        if (
          firstCall > cl &&
          (forced !== undefined || rng.chance(MANUAL_A5_SHARE))
        ) {
          closure =
            state === "app.to" || state === "non interessato"
              ? "call"
              : state === "caricato"
                ? "state_change"
                : "removed"
        }
      } else if (
        before &&
        (!systemClosureForced ||
          !operatorClosureForced ||
          rng.chance(MANUAL_A5_SHARE))
      ) {
        // The first of each, then by share
        closure = !systemClosureForced
          ? "system"
          : !operatorClosureForced
            ? "operator"
            : rng.chance(0.25)
              ? "system"
              : "operator"
        if (closure === "system") systemClosureForced = true
        else operatorClosureForced = true
      }
    }

    let alertId: number | null = null
    if (closure) {
      alertId = nextAlertId()
      // Created by the Richiamare of `created`, due on `dueOffset`: after the
      // closing day or before, as the operator chose it
      const created = recent ? rng.int(cl + 1, firstCall) : rng.int(cl, co)
      const dueOffset = rng.int(Math.max(1, cl - 15), cl)
      // The conversion closes an orphan at the release (AC31): the contact had
      // closed long before
      const closedAt = closure === "system" ? CALLS_REGISTRY_OFFSET - 1 : cl
      const resolver = closure === "system" ? SYSTEM_OPERATOR_ID : actor
      const resolution =
        closure === "system"
          ? "system"
          : closure === "call" ||
              closure === "state_change" ||
              closure === "removed"
            ? closure
            : null
      alerts.push({
        id: alertId,
        createdAt: clock.noon(created),
        updatedAt: clock.noon(closedAt),
        deadline: clock.midnight(dueOffset),
        taskId,
        message: message(),
        isResolved: true,
        resolvedBy: resolver,
        // Closings before `calls_registry` have neither the date nor the way
        resolvedAt: resolution === null ? null : clock.noon(closedAt),
        resolution,
      })
      if (closure === "system") {
        // The conversion writes nothing in the log (AC32)
      } else if (recent) {
        const open: OpenAlert = { id: alertId, dueOffset }
        const customerId = customer.id
        // The Richiamare that opened the alert, then maybe a Non risponde
        // that left the contact in Richiamo, then the closing
        const steps: CallStep[] = [
          { offset: created, outcome: "richiamare", alert: open },
        ]
        if (created - cl >= 2 && rng.chance(PRIOR_NO_ANSWER_SHARE)) {
          steps.push({
            offset: rng.int(cl + 1, created - 1),
            outcome: "non risponde",
          })
        }
        if (closure === "call") {
          steps.push({ offset: cl, outcome: state as CallOutcome })
        }
        writeCalls({
          customerId,
          taskId,
          actorOperatorId: actor,
          state: "chiamare",
          open: null,
          steps,
        })
        calledAt = steps.at(-1)!.offset
        if (closure !== "call") {
          // «Pratica caricata» from the selector, or «Togli il richiamo»:
          // changes of state that are not calls (AC17, AC22)
          log.stateChain({
            customerId,
            taskId,
            operatorId: actor,
            final: state,
            before: "richiamare",
            days: [cl],
          })
          log.alertResolved({
            customerId,
            taskId,
            alertId,
            actorOperatorId: actor,
            offset: cl,
            source: "detail",
          })
        }
      } else {
        // Before `calls_registry`: the old rule, a change of state is a call
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
          actorOperatorId: actor,
          offset: cl,
        })
      }
    } else if (boundary) {
      log.stateChain({
        customerId: customer.id,
        taskId,
        operatorId,
        final: state,
        days: [cutoff + 1, cutoff - 1],
      })
    } else if (recent && co > cl) {
      const customerId = customer.id
      if (state === "non risponde") {
        // One or two calls without answer, the last on the closing day
        const earlier =
          firstCall > cl && rng.chance(0.5)
            ? distinctDays(1, cl + 1, firstCall)
            : []
        writeCalls({
          customerId,
          taskId,
          actorOperatorId: actor,
          state: "chiamare",
          open: null,
          steps: [...earlier, cl].map((offset) => ({
            offset,
            outcome: "non risponde" as const,
          })),
        })
      } else if (state === "app.to" || state === "non interessato") {
        const steps: CallStep[] = []
        if (firstCall > cl && rng.chance(PRIOR_NO_ANSWER_SHARE)) {
          steps.push({
            offset: rng.int(cl + 1, firstCall),
            outcome: "non risponde",
          })
        }
        steps.push({ offset: cl, outcome: state })
        writeCalls({
          customerId,
          taskId,
          actorOperatorId: actor,
          state: "chiamare",
          open: null,
          steps,
        })
      } else if (state === "caricato") {
        log.stateChain({
          customerId,
          taskId,
          operatorId: actor,
          final: state,
          before: rng.pick(["chiamare", "non risponde", "app.to"] as const),
          days: [cl],
        })
      }
    } else if (before && rng.chance(0.65)) {
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
      closedAt: clock.noon(calledAt),
      customerId: customer.id,
      operatorId,
      alertId,
      priority:
        state === "chiamare"
          ? 120
          : state === "non risponde"
            ? 100
            : state === "non interessato"
              ? 10
              : state === "richiamare"
                ? rng.pick([0, 20, 30, 50])
                : 1,
      customPriority: false,
      isActive: false,
    })
    return calledAt
  }

  customers.forEach((customer, i) => {
    const plan = plans[i]
    if (!plan && !hasHistory[i]) return
    const top = topOf(customer)

    // Offsets of the active contact. `ca`: created. `call`: the Richiamare
    // that opened its alert, `due`: when the alert falls due (negative: after
    // D), `ca >= call`. Without an active contact, `ca` bounds the history
    let ca: number
    let call = 0
    let due = 0
    switch (plan?.kind) {
      case "A1":
        call = rng.int(1, 40)
        due = 0
        ca = call + rng.int(0, 5)
        break
      case "A3":
        due = firstA3 ? 1 : rng.int(1, 20)
        firstA3 = false
        call = rng.int(due + 1, due + 24)
        ca = Math.min(45, call + rng.int(0, 3))
        break
      case "A4":
        due = firstA4 ? -1 : -rng.int(1, 30)
        firstA4 = false
        call = rng.int(0, 40)
        ca = call + rng.int(0, 5)
        break
      case "P1X":
      case "P13X":
        due =
          plan.kind === "P1X"
            ? firstP1X
              ? 0
              : rng.int(0, 20)
            : firstP13X
              ? 0
              : rng.int(0, 20)
        if (plan.kind === "P1X") firstP1X = false
        else firstP13X = false
        call = rng.int(due + 1, due + 24)
        ca = Math.min(45, call + rng.int(0, 1))
        break
      case "P13":
        ca = rng.int(1, 45)
        break
      default:
        ca = rng.int(0, 45)
    }

    // History, oldest first. `lastClosed` is the latest closed_at of it
    let lastClosed: number | null = null
    if (hasHistory[i] && i === boundaryIndex) {
      lastClosed = pushPast(customer, cutoff + 1, cutoff - 1, true)
    } else if (hasHistory[i]) {
      const low = ca
      const wanted = rng.weighted<number>([
        [1, 60],
        [2, 30],
        [3, 10],
      ])
      const count = Math.max(0, Math.min(top - low, wanted))
      const segment = count > 0 ? Math.floor((top - low) / count) : 0
      for (let j = 0; j < count; j++) {
        const segHi = top - j * segment
        // The oldest contact of a customer that existed before the retention
        // cutoff usually falls entirely before it, so the log has rows for
        // `cleanup-task-event-log` to delete (L1, AC30)
        const segLo =
          j === 0 && top > cutoff + 1 && rng.chance(OLD_CONTACT_SHARE)
            ? cutoff + 1
            : segHi - segment + 1
        // The newest past contact of the first customers is a recent one
        const recentHi = Math.min(segHi, CALLS_REGISTRY_OFFSET - 1)
        if (
          j === count - 1 &&
          recentCount < RECENT_PAST_STATES.length &&
          recentHi - segLo >= 1
        ) {
          const co = rng.int(segLo + 1, recentHi)
          const cl = rng.int(segLo, co - 1)
          lastClosed = pushPast(
            customer,
            co,
            cl,
            false,
            RECENT_PAST_STATES[recentCount]
          )
          recentCount++
          continue
        }
        const co = avoidCutoff(rng.int(segLo, segHi), segLo, segHi)
        const cl = avoidCutoff(rng.int(segLo, co), segLo, co)
        lastClosed = pushPast(customer, co, cl, false)
      }
    }

    if (!plan) return

    // The active contact
    const taskId = nextTaskId()
    const operatorId = customer.operatorId ?? null
    const actor = operatorId ?? rng.pick(adminIds)
    const customerId = customer.id
    let state: TaskStatus
    let priority: number
    let customPriority = false
    switch (plan.kind) {
      case "P1":
        state = "chiamare"
        priority = rng.pick([0, 1, 10, 30, 50, 80])
        break
      case "P1X":
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
      case "P13":
      case "P13X":
        state = "non risponde"
        priority = rng.pick([0, 1, 20, 120])
        break
      case "P10":
        state = "non interessato"
        priority = 120
        break
      case "P4":
        state = plan.state
        priority = rng.pick([0, 10, 20, 30, 50])
        break
      case "P8":
        state = rng.pick(P8_STATES)
        priority = plan.priority
        customPriority = true
        break
      case "A1":
      case "A3":
        state = "richiamare"
        priority = rng.pick([0, 20, 30, 120]) // P6: 50 expected
        break
      case "A4":
        state = "richiamare"
        priority = rng.pick([0, 20, 50, 120]) // P7: 30 expected
        break
    }

    // The log of the contact: calls (and the nightly pass) after
    // `calls_registry`, from the Da chiamare it was created in. `lastTouch` is
    // the latest day with a row, `lastCall` the day of the last call
    let alertId: number | null = null
    const touched = { lastCall: null as number | null, lastTouch: ca }
    const note = (offset: number, isCall = true) => {
      touched.lastTouch = Math.min(touched.lastTouch, offset)
      if (isCall) {
        touched.lastCall = Math.min(touched.lastCall ?? offset, offset)
      }
    }
    const run = (
      steps: readonly CallStep[],
      from: { state: TaskStatus; open: OpenAlert | null }
    ) => {
      steps.forEach((step) => note(step.offset))
      return writeCalls({
        customerId,
        taskId,
        actorOperatorId: actor,
        ...from,
        steps,
      })
    }
    /** A Non risponde before the Richiamare, sometimes. */
    const prior = (): CallStep[] =>
      ca > call && rng.chance(PRIOR_NO_ANSWER_SHARE)
        ? [{ offset: rng.int(call + 1, ca), outcome: "non risponde" }]
        : []

    if (hasOpenAlert(plan)) {
      alertId = nextAlertId()
      const open: OpenAlert = { id: alertId, dueOffset: due }
      alerts.push({
        id: alertId,
        createdAt: clock.noon(call),
        updatedAt: clock.noon(call),
        deadline: clock.midnight(due),
        taskId,
        message: message(),
        isResolved: false,
        resolvedBy: null,
      })
      const first: CallStep[] = [
        ...prior(),
        { offset: call, outcome: "richiamare", alert: open },
      ]
      let at = run(first, { state: "chiamare", open: null })
      if (plan.kind === "P1X" || plan.kind === "P13X") {
        // The nightly pass worked the alert on the day it fell due: Da
        // chiamare, the alert still open (AC19)
        log.nightlyPass({ customerId, taskId, offset: due })
        note(due, false)
        at = { state: "chiamare", open }
      }
      if (plan.kind === "P13X") {
        // Then calls without answer, the alert kept and still expired
        const days = distinctDays(rng.int(1, 2), 0, due)
        at = run(
          days.map((offset) => ({ offset, outcome: "non risponde" as const })),
          at
        )
      }
      if (at.state !== state) {
        throw new Error(
          `Contatto ${taskId}: la storia finisce in "${at.state}"`
        )
      }
    } else if (plan.kind === "P13") {
      const days = distinctDays(
        rng.weighted<number>([
          [2, 70],
          [3, 30],
        ]),
        0,
        ca
      )
      run(
        days.map((offset) => ({ offset, outcome: "non risponde" as const })),
        { state: "chiamare", open: null }
      )
    } else if (
      (plan.kind === "P3" ||
        plan.kind === "P10" ||
        (plan.kind === "P4" && plan.state === "app.to")) &&
      rng.chance(CALLED_SHARE)
    ) {
      // Reached by a call, maybe after a Non risponde
      const final = rng.int(0, ca)
      const steps: CallStep[] = []
      if (ca > final && rng.chance(PRIOR_NO_ANSWER_SHARE)) {
        steps.push({ offset: rng.int(final + 1, ca), outcome: "non risponde" })
      }
      steps.push({ offset: final, outcome: state as CallOutcome })
      run(steps, { state: "chiamare", open: null })
    } else if (plan.kind === "P4" && plan.state === "caricato") {
      if (rng.chance(0.5)) {
        // «Pratica caricata» from the selector (AC17): not a call
        const offset = rng.int(0, ca)
        note(offset, false)
        log.stateChain({
          customerId,
          taskId,
          operatorId: actor,
          final: "caricato",
          before: rng.pick(["chiamare", "non risponde", "app.to"] as const),
          days: [offset],
        })
      }
    }
    if (operatorId !== null && rng.chance(0.25)) {
      log.reassign({
        customerId,
        taskId,
        toOperatorId: operatorId,
        offset: log.pickDay(0, ca),
      })
    }

    // closed_at: the time of the last call (AC29). Without a call, a reopened
    // contact inherits it from the latest past one
    const closed: number | null =
      touched.lastCall ??
      (lastClosed !== null && rng.chance(0.7) ? lastClosed : null)

    tasks.push({
      id: taskId,
      createdAt: clock.noon(ca),
      updatedAt: clock.noon(rng.int(0, touched.lastTouch)),
      state,
      closedAt: closed === null ? null : clock.noon(closed),
      customerId,
      operatorId,
      alertId,
      priority,
      customPriority,
      isActive: true,
    })
  })

  return { alerts, tasks, taskEventLog: log.rows() }
}
