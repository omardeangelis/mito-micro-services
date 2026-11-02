import { Clock, Effect } from "effect"
import { and, asc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm"
import { SYSTEM_OPERATOR_USER_ID } from "@mito/domain/constants/operator"
import { romeDay } from "@mito/domain/contact/time"
import { type TaskStatus } from "@mito/domain/schemas"
import { operators } from "@mito/db/schema/operators"
import { alert, task } from "@mito/db/schema/task"
import {
  type CustomerMissing,
  type Db,
  type DbError,
  lockCustomer,
  query,
  transaction,
  type Tx,
} from "../../effect/db"
import { type ErrorReporter, forEachIsolated } from "../../effect/errorReporter"
import { resolveOpenAlert } from "./alert"
import { SystemOperatorMissing } from "./processDueAlerts"

/**
 * The rules of the second step of AC31 (esiti-richiami-stati), in its order,
 * with the state each one gives.
 */
const rules = {
  // 1. An active contact with an open future alert: Richiamo
  futureAlert: "richiamare",
  // 2. An active contact with an open alert expired or of today, not in Non
  //    risponde: Da chiamare, and the alert stays open
  dueAlert: "chiamare",
  // 3. An active contact in `richiamare` without an open alert: Non risponde
  noAlert: "non risponde",
  // 4. `followup`, `nessuno` and no state: Da chiamare
  legacyToCall: "chiamare",
  // 5. `erogata`: Pratica caricata
  legacyErogata: "caricato",
} as const satisfies Record<string, TaskStatus>

type Rule = keyof typeof rules

/** What a run did: the alerts closed, the contacts moved by each rule. */
export type ConversionCounts = { orphanAlerts: number } & Record<
  Rule,
  number
> & {
    /** Customers (or alerts) whose transaction failed, reported. */
    failed: number
    /** Customers left for the next run when the budget ran out. */
    remaining: number
  }

/**
 * The Rome day of the contact's open alert: the alert `task.alert_id` points
 * to, still open and of this task. Null without one.
 */
const openAlertDay = sql`(
  SELECT DATE(${alert.deadline} AT TIME ZONE 'Europe/Rome') FROM ${alert}
  WHERE ${alert.id} = ${task.alertId}
    AND ${alert.taskId} = ${task.id}
    AND ${alert.isResolved} = false
)`

/**
 * The rule of AC31 the contact falls under on `today`, the first that
 * applies, or null for a contact already in the six states and inside AC4.
 * The same expression picks the contacts and guards each UPDATE: a contact
 * that changed since it was read no longer matches.
 */
const ruleOf = (today: string): SQL<Rule | null> => sql`CASE
  WHEN ${task.isActive} AND ${openAlertDay} > ${today}
    AND ${task.state} IS DISTINCT FROM 'richiamare'
    THEN 'futureAlert'
  WHEN ${task.isActive} AND ${openAlertDay} <= ${today}
    AND (${task.state} IS NULL OR ${task.state} NOT IN ('chiamare', 'non risponde'))
    THEN 'dueAlert'
  WHEN ${task.isActive} AND ${openAlertDay} IS NULL
    AND ${task.state} = 'richiamare'
    THEN 'noAlert'
  WHEN ${task.state} IS NULL OR ${task.state} IN ('followup', 'nessuno')
    THEN 'legacyToCall'
  WHEN ${task.state} = 'erogata'
    THEN 'legacyErogata'
END`

/**
 * An open alert that is not the alert of its customer's active contact: its
 * task is not active, or no longer points to it (AC31). The same condition
 * picks the orphans and is checked again under the customer's lock.
 */
const isOrphan = sql`${alert.isResolved} = false AND NOT EXISTS (
  SELECT 1 FROM ${task}
  WHERE ${task.id} = ${alert.taskId}
    AND ${task.isActive}
    AND ${task.alertId} = ${alert.id}
)`

/**
 * Closes one orphan alert «dal sistema» (AC23), under its customer's lock. An
 * alert linked or closed since it was read is left as it is. A task without
 * a customer has nothing to lock.
 */
const closeOrphan = Effect.fnUntraced(function* (
  orphan: { alertId: number; taskId: number; customerId: string | null },
  systemOperatorId: number
): Effect.fn.Return<boolean, DbError | CustomerMissing, Db | Tx> {
  if (orphan.customerId !== null) yield* lockCustomer(orphan.customerId)
  const [still] = yield* query((client) =>
    client
      .select({ id: alert.id })
      .from(alert)
      .where(and(eq(alert.id, orphan.alertId), isOrphan))
  )
  if (!still) return false
  const { resolved } = yield* resolveOpenAlert({
    customerId: orphan.customerId,
    taskId: orphan.taskId,
    alertId: orphan.alertId,
    actorOperatorId: systemOperatorId,
    // No row in the log (AC32)
    source: null,
    resolution: "system",
  })
  return resolved
})

/**
 * Moves the contacts of one customer (or of no customer, `null`) that fall
 * under a rule, under the customer's lock. The rules are read again under the
 * lock, and each UPDATE repeats its rule in the WHERE: a call registered
 * meanwhile wins. Only the state changes: no log, operator, manual priority
 * or «Contattato il» (AC32).
 */
const convertCustomer = Effect.fnUntraced(function* (
  customerId: string | null,
  today: string
): Effect.fn.Return<
  Partial<Record<Rule, number>>,
  DbError | CustomerMissing,
  Db | Tx
> {
  if (customerId !== null) yield* lockCustomer(customerId)
  const rule = ruleOf(today)
  const ofCustomer =
    customerId === null
      ? isNull(task.customerId)
      : eq(task.customerId, customerId)
  const contacts = yield* query((client) =>
    client
      .select({ id: task.id, rule })
      .from(task)
      .where(and(ofCustomer, sql`${rule} IS NOT NULL`))
  )
  const counts: Partial<Record<Rule, number>> = {}
  for (const name of Object.keys(rules) as Rule[]) {
    const ids = contacts
      .filter((each) => each.rule === name)
      .map(({ id }) => id)
    if (ids.length === 0) continue
    const moved = yield* query((client) =>
      client
        .update(task)
        .set({ state: rules[name] })
        .where(and(inArray(task.id, ids), sql`${rule} = ${name}`))
        .returning({ id: task.id })
    )
    counts[name] = moved.length
  }
  return counts
})

/**
 * The conversion of the contacts to the six states (esiti-richiami-stati
 * AC31, AC32, D11), at the Clock's instant. Each customer in its own
 * transaction; one that fails is counted in `failed`, logged and reported,
 * and the others go on.
 *
 * 1. Closes every orphan open alert «dal sistema» (`resolution = 'system'`,
 *    `resolved_by` the system operator), with no row in the log.
 * 2. Moves the contacts with an old value (`followup`, `erogata`, `nessuno`,
 *    no state) and the active ones outside AC4, by the first rule of AC31
 *    that applies (`ruleOf`). Inactive `richiamare` contacts stay.
 *
 * It can run again: a second run finds only what changed since. Once
 * `budgetMs` has passed it takes no new customer, but always takes the first:
 * the ones left are counted in `remaining`, for the next run.
 */
export const convertContactStates = Effect.fn("contact.convertContactStates")(
  function* ({
    budgetMs,
  }: {
    budgetMs: number
  }): Effect.fn.Return<
    ConversionCounts,
    DbError | SystemOperatorMissing,
    Db | ErrorReporter
  > {
    const start = yield* Clock.currentTimeMillis
    const today = romeDay(new Date(start))
    const [systemOperator] = yield* query((client) =>
      client
        .select({ id: operators.id })
        .from(operators)
        .where(eq(operators.userId, SYSTEM_OPERATOR_USER_ID))
    )
    if (!systemOperator) return yield* new SystemOperatorMissing()

    // First step: the orphan alerts
    const orphans = yield* query((client) =>
      client
        .select({
          alertId: alert.id,
          taskId: alert.taskId,
          customerId: task.customerId,
        })
        .from(alert)
        .leftJoin(task, eq(task.id, alert.taskId))
        .where(isOrphan)
        .orderBy(asc(alert.id))
    )
    const closings = yield* forEachIsolated(
      orphans,
      (orphan) => transaction(closeOrphan(orphan, systemOperator.id)),
      ({ alertId, customerId }) => ({ alertId, customerId })
    )

    // Second step: the contacts, one customer at a time
    const rule = ruleOf(today)
    const customers = yield* query((client) =>
      client
        .selectDistinct({ customerId: task.customerId })
        .from(task)
        .where(sql`${rule} IS NOT NULL`)
        .orderBy(asc(task.customerId))
    )
    const conversions = yield* forEachIsolated(
      customers,
      Effect.fnUntraced(function* ({ customerId }, index: number) {
        const elapsed = (yield* Clock.currentTimeMillis) - start
        if (index > 0 && elapsed >= budgetMs) return "remaining" as const
        return yield* transaction(convertCustomer(customerId, today))
      }),
      ({ customerId }) => ({ customerId })
    )

    const counts: ConversionCounts = {
      orphanAlerts: closings.succeeded.filter(Boolean).length,
      futureAlert: 0,
      dueAlert: 0,
      noAlert: 0,
      legacyToCall: 0,
      legacyErogata: 0,
      failed: closings.failed + conversions.failed,
      remaining: 0,
    }
    for (const done of conversions.succeeded) {
      if (done === "remaining") {
        counts.remaining++
        continue
      }
      for (const name of Object.keys(done) as Rule[]) {
        counts[name] += done[name] ?? 0
      }
    }
    return counts
  }
)
