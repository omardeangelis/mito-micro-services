// The manifest of the expected cron outcomes (spec "Scenari dei cron", D10,
// D13, D15). Pure: the result depends only on the dataset and D.
//
// It is an independent oracle: the selection rules and the outcomes come from
// the scenario tables of the spec, never from the cron code (no import of the
// services, of `calculatePriority` or of the domain priority rules), so the
// verification that compares the database with it is not tautological.
//
// - D10: every row a cron selects is a row of exactly one scenario of that
//   cron. A selected row whose shape no scenario describes is a generator bug:
//   `buildManifest` throws.
// - D13: `expected` lists only the columns the scenario's cron writes, or the
//   columns it declares unchanged. The final state after the four runs equals
//   `expected` only if no cron writes a column another cron lists on the same
//   row: `buildManifest` checks it and throws.
// - D15: no timestamp written by the database in `expected`, except the seed
//   `updatedAt` of the rows declared unchanged.
import { SYSTEM_OPERATOR_USER_ID } from "@mito/domain/constants/operator"
import { addDays, romeDay, subMonthsDay } from "./day"
import type {
  AlertRow,
  CronName,
  CustomerRow,
  Dataset,
  Day,
  JsonValue,
  Manifest,
  PracticeRow,
  Scenario,
  ScenarioRow,
  TaskEventLogRow,
  TaskRow,
} from "./types"

/** Days between two rates, from the spec ("`rate_pagate` x 30 giorni"). */
const DAYS_PER_RATE = 30

/** The scenarios of the spec tables, in manifest order, with their cron. */
export const SCENARIO_CRONS = {
  P1: "priority",
  P2: "priority",
  P3: "priority",
  P4: "priority",
  P5: "priority",
  P6: "priority",
  P7: "priority",
  P8: "priority",
  P9: "priority",
  P10: "priority",
  P11: "priority",
  P12: "priority",
  A1: "alert",
  A2: "alert",
  A3: "alert",
  A4: "alert",
  A5: "alert",
  A6: "alert",
  U1: "update",
  U2: "update",
  U3: "update",
  U4: "update",
  U5: "update",
  U6: "update",
  U7a: "update",
  U7b: "update",
  U11: "update",
  U8: "update",
  U9: "update",
  U10a: "update",
  U10b: "update",
  U10c: "update",
  L1: "cleanup-task-event-log",
  L2: "cleanup-task-event-log",
} as const satisfies Record<string, CronName>

export type ScenarioId = keyof typeof SCENARIO_CRONS

/** The tables a scenario row names. `runs` is the job outcome of A6. */
export type ScenarioTable =
  "task" | "alert" | "practices" | "customers" | "task_event_log" | "runs"

type Expected = Record<string, JsonValue>

/** The rows of the scenarios, and the columns each cron writes on each row. */
type Collector = {
  add: (
    id: ScenarioId,
    table: ScenarioTable,
    key: string | number,
    selected: boolean,
    expected: Expected
  ) => void
  /** The columns `cron` writes on the row (for D13), whatever `expected` says. */
  writes: (
    cron: CronName,
    table: ScenarioTable,
    key: string | number,
    columns: readonly string[]
  ) => void
}

type Context = Collector & {
  day: Day
  /** Rome day of an instant, memoized (many rows share an instant). */
  dayOf: (instant: Date) => Day
}

export function buildManifest(dataset: Dataset, day: Day): Manifest {
  const rows = new Map<ScenarioId, ScenarioRow[]>()
  for (const id of Object.keys(SCENARIO_CRONS) as ScenarioId[]) {
    rows.set(id, [])
  }
  const effects = new RowEffects()
  const cache = new Map<number, Day>()

  const context: Context = {
    day,
    dayOf: (instant) => {
      const ms = instant.getTime()
      let value = cache.get(ms)
      if (value === undefined) {
        value = romeDay(instant)
        cache.set(ms, value)
      }
      return value
    },
    add: (id, table, key, selected, expected) => {
      rows.get(id)!.push({ table, key, selected, expected })
      effects.declare(SCENARIO_CRONS[id], id, table, key, Object.keys(expected))
    },
    writes: (cron, table, key, columns) =>
      effects.write(cron, table, key, columns),
  }

  addPriorityScenarios(context, dataset)
  addAlertScenarios(context, dataset)
  addPracticeScenarios(context, dataset.practices)
  addCustomerScenarios(context, dataset.customers)
  addLogScenarios(context, dataset.taskEventLog)
  effects.check()

  const scenarios: Scenario[] = [...rows].map(([id, scenarioRows]) => ({
    id,
    cron: SCENARIO_CRONS[id],
    rows: scenarioRows,
  }))
  return { day, n: dataset.customers.length, scenarios, runs: [] }
}

// ---------------------------------------------------------------------------
// D13: per row, what each cron writes and what each cron declares.

type CronEffect = {
  written: Set<string>
  declared: Set<string>
  scenarios: Set<ScenarioId>
}

class RowEffects {
  private readonly rows = new Map<string, Map<CronName, CronEffect>>()

  private effect(cron: CronName, table: ScenarioTable, key: string | number) {
    const rowKey = `${table}:${key}`
    let byCron = this.rows.get(rowKey)
    if (!byCron) {
      byCron = new Map()
      this.rows.set(rowKey, byCron)
    }
    let effect = byCron.get(cron)
    if (!effect) {
      effect = { written: new Set(), declared: new Set(), scenarios: new Set() }
      byCron.set(cron, effect)
    }
    return effect
  }

  declare(
    cron: CronName,
    id: ScenarioId,
    table: ScenarioTable,
    key: string | number,
    columns: readonly string[]
  ) {
    const effect = this.effect(cron, table, key)
    // D10: a row is in one scenario of each cron at most
    if (effect.scenarios.size > 0) {
      throw new Error(
        `Riga ${table} ${key}: e' sia in ${[...effect.scenarios].join(", ")} ` +
          `sia in ${id}, due scenari dello stesso cron \`${cron}\``
      )
    }
    effect.scenarios.add(id)
    columns.forEach((column) => effect.declared.add(column))
  }

  write(
    cron: CronName,
    table: ScenarioTable,
    key: string | number,
    columns: readonly string[]
  ) {
    const effect = this.effect(cron, table, key)
    columns.forEach((column) => effect.written.add(column))
  }

  /** Throws when a cron lists a column another cron writes on the same row. */
  check() {
    for (const [rowKey, byCron] of this.rows) {
      for (const [cron, effect] of byCron) {
        for (const [other, otherEffect] of byCron) {
          if (other === cron) continue
          const clash = [...effect.declared].filter((column) =>
            otherEffect.written.has(column)
          )
          if (clash.length === 0) continue
          throw new Error(
            `Riga ${rowKey.replace(":", " ")}: lo scenario ` +
              `${[...effect.scenarios].join(", ")} di \`${cron}\` si aspetta ` +
              `${clash.join(", ")}, che \`${other}\` scrive sulla stessa riga ` +
              `(scenario ${[...otherEffect.scenarios].join(", ") || "-"}): ` +
              `dopo le quattro corse il valore non sarebbe quello atteso (D13)`
          )
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Shared helpers.

function iso(value: Date | null | undefined, label: string): string {
  if (!(value instanceof Date)) {
    throw new Error(`${label}: manca la data, atteso un istante`)
  }
  return value.toISOString()
}

/** The open alert linked both ways with the task, if the task has one. */
function openAlertOf(
  task: TaskRow,
  alerts: ReadonlyMap<number, AlertRow>
): { kind: "none" } | { kind: "open"; alert: AlertRow } | { kind: "other" } {
  if (task.alertId == null) return { kind: "none" }
  const alert = alerts.get(task.alertId)
  if (alert && !alert.isResolved && alert.taskId === task.id) {
    return { kind: "open", alert }
  }
  return { kind: "other" }
}

// ---------------------------------------------------------------------------
// `priority`: active, custom_priority = false, not `chiamare` at 120.

const P4_STATES: ReadonlySet<string> = new Set([
  "app.to",
  "caricato",
  "erogata",
  "nessuno",
])

function addPriorityScenarios(context: Context, dataset: Dataset) {
  const { day, dayOf } = context
  const alerts = new Map(dataset.alerts.map((alert) => [alert.id, alert]))

  for (const task of dataset.tasks) {
    const label = `Contatto ${task.id}`
    // The values the database stores when the seed leaves a column out
    const state = task.state ?? "nessuno"
    const priority = task.priority ?? 0
    const customPriority = task.customPriority ?? false
    const unchanged = (id: ScenarioId) =>
      context.add(id, "task", task.id, false, {
        priority,
        updatedAt: iso(task.updatedAt, `${label}, updatedAt`),
      })

    if (!task.isActive) {
      if (
        (state === "chiamare" && priority === 120 && !customPriority) ||
        state === "richiamare"
      ) {
        unchanged("P9")
      }
      continue
    }
    if (customPriority) {
      unchanged("P8")
      continue
    }
    if (state === "chiamare" && priority === 120) {
      unchanged("P2")
      continue
    }

    const [id, expected] = ((): [ScenarioId, number] => {
      if (state === "chiamare") return ["P1", 120]
      if (state === "non interessato") {
        return priority === 120 ? ["P10", 10] : ["P3", 10]
      }
      if (P4_STATES.has(state)) return ["P4", 1]
      if (state === "followup" && priority === 150) return ["P5", 1]
      if (state === "richiamare") {
        const linked = openAlertOf(task, alerts)
        const closed = task.closedAt != null
        if (linked.kind === "open") {
          const due = dayOf(linked.alert.deadline)
          if (closed) return due <= day ? ["P6", 50] : ["P7", 30]
          if (due <= day) return ["P12", 20]
        }
        if (linked.kind === "none" && !closed) return ["P11", 0]
      }
      throw new Error(
        `${label}: selezionato da \`priority\` (attivo, stato "${state}", ` +
          `priorita' ${priority}, closedAt ` +
          `${task.closedAt ? "valorizzato" : "vuoto"}, alert ` +
          `${task.alertId ?? "nessuno"}) ma nessuno scenario P lo descrive (D10)`
      )
    })()
    if (expected === priority) {
      throw new Error(
        `${label}: scenario ${id}, la priorita' del seed (${priority}) e' gia' ` +
          `quella attesa: una corsa che lo salta passerebbe lo stesso`
      )
    }
    context.add(id, "task", task.id, true, { priority: expected })
    // The database rewrites updated_at with the priority
    context.writes("priority", "task", task.id, ["priority", "updatedAt"])
  }
}

// ---------------------------------------------------------------------------
// `alert`: open, linked both ways, Rome deadline on D or before.

function addAlertScenarios(context: Context, dataset: Dataset) {
  const { day, dayOf } = context
  const tasks = new Map(dataset.tasks.map((task) => [task.id, task]))
  const customers = new Map(dataset.customers.map((c) => [c.id, c]))
  const system = dataset.operators.find(
    (operator) => operator.userId === SYSTEM_OPERATOR_USER_ID
  )
  if (!system) {
    throw new Error(
      `Manca l'operatore di sistema (userId "${SYSTEM_OPERATOR_USER_ID}"): ` +
        `il cron \`alert\` fallirebbe con SystemOperatorMissing (A6)`
    )
  }

  for (const alert of dataset.alerts) {
    const label = `Alert ${alert.id}`
    const due = dayOf(alert.deadline)
    const task = tasks.get(alert.taskId)

    if (alert.isResolved) {
      if (due <= day) {
        context.add("A5", "alert", alert.id, false, {
          isResolved: true,
          resolvedBy: alert.resolvedBy ?? null,
        })
      }
      continue
    }
    // Not linked both ways: the cron never selects it
    if (!task || task.alertId !== alert.id) continue
    if (!task.isActive) {
      throw new Error(
        `${label}: aperto e collegato al contatto ${task.id}, che non e' ` +
          `attivo; nessuno scenario A lo descrive (D10)`
      )
    }

    if (due > day) {
      context.add("A4", "alert", alert.id, false, {
        isResolved: false,
        resolvedBy: null,
      })
      context.add("A4", "task", task.id, false, {
        alertId: alert.id,
        isActive: true,
      })
      continue
    }

    const resolvedLog: Expected = {
      action: "alert_resolved",
      source: "cron_alert",
      actorOperatorId: system.id,
      taskId: task.id,
      alertId: alert.id,
    }
    const resolvedAlert: Expected = { isResolved: true, resolvedBy: system.id }

    if (due === day) {
      if (task.state !== "richiamare" || task.closedAt == null) {
        throw new Error(
          `${label}: scade in D sul contatto ${task.id} (stato ` +
            `"${task.state ?? "nessuno"}", closedAt ` +
            `${task.closedAt ? "valorizzato" : "vuoto"}): A1 e A2 vogliono ` +
            `un contatto \`richiamare\` con closedAt (D10)`
        )
      }
      const customer =
        task.customerId == null ? undefined : customers.get(task.customerId)
      if (!customer) {
        throw new Error(
          `${label}: il contatto ${task.id} non ha un cliente del dataset`
        )
      }
      const id: ScenarioId = customer.operatorId != null ? "A1" : "A2"
      context.add(id, "alert", alert.id, true, resolvedAlert)
      context.add(id, "task", task.id, true, {
        isActive: false,
        newActiveContact: {
          state: "followup",
          priority: 150,
          customPriority: false,
          operatorId: customer.operatorId ?? null,
          closedAt: iso(task.closedAt, `Contatto ${task.id}, closedAt`),
          alertId: null,
        },
        newLog: [
          resolvedLog,
          {
            action: "state_change",
            source: "cron_alert",
            actorOperatorId: system.id,
            taskId: task.id,
            fromState: "richiamare",
            toState: "followup",
          },
        ],
      })
      context.writes("alert", "task", task.id, [
        "isActive",
        "updatedAt",
        "newActiveContact",
        "newLog",
      ])
    } else {
      context.add("A3", "alert", alert.id, true, resolvedAlert)
      context.add("A3", "task", task.id, true, {
        isActive: true,
        alertId: null,
        newLog: [resolvedLog],
      })
      context.writes("alert", "task", task.id, [
        "alertId",
        "updatedAt",
        "newLog",
      ])
    }
    context.writes("alert", "alert", alert.id, [
      "isResolved",
      "resolvedBy",
      "updatedAt",
    ])
  }

  context.add("A6", "runs", "alert", true, { outcome: "succeeded" })
}

// ---------------------------------------------------------------------------
// `update`, practices: Rome day of `data_liquidazione` + `rate_pagate` x 30
// is D; updated only when the last import is older than 30 days.

const PRACTICE_COLUMNS = [
  "ratePagate",
  "debitoResiduo",
  "state",
  "updatedAt",
] as const

function addPracticeScenarios(
  context: Context,
  practices: readonly PracticeRow[]
) {
  const { day, dayOf } = context
  const dayBefore = addDays(day, -1)
  const dayAfter = addDays(day, 1)
  /** Last import on this day or before: updated. */
  const oldImport = addDays(day, -32)
  /** Last import on this day or after: selected, not updated. */
  const recentImport = addDays(day, -28)

  for (const practice of practices) {
    const label = `Pratica ${practice.praticaId}`
    const key = practice.praticaId
    const debt =
      practice.debitoResiduo == null ? null : Number(practice.debitoResiduo)
    const unchanged = (id: ScenarioId, selected: boolean) =>
      context.add(id, "practices", key, selected, {
        ratePagate: practice.ratePagate,
        debitoResiduo: debt,
        state: practice.state,
        updatedAt: iso(practice.updatedAt, `${label}, updatedAt`),
      })

    const liquidation = dayOf(practice.dataLiquidazione)
    const due = addDays(liquidation, practice.ratePagate * DAYS_PER_RATE)
    if (due === dayBefore) {
      unchanged("U7a", false)
      continue
    }
    if (due === dayAfter) {
      unchanged("U7b", false)
      continue
    }
    if (due !== day) {
      if (liquidation === day && practice.ratePagate >= 1) {
        unchanged("U11", false)
      }
      continue
    }

    // Selected
    if (!(practice.lastImportUpdate instanceof Date)) {
      throw new Error(`${label}: selezionata da \`update\` senza ultimo import`)
    }
    const importDay = dayOf(practice.lastImportUpdate)
    if (importDay >= recentImport) {
      unchanged("U3", true)
      continue
    }
    if (importDay > oldImport) {
      throw new Error(
        `${label}: selezionata da \`update\` con l'ultimo import il ` +
          `${importDay}, fra 29 e 31 giorni prima di D: l'esito dipenderebbe ` +
          `dall'ora della corsa`
      )
    }

    const paid = practice.ratePagate
    const total = practice.rateTotali
    const newDebt = (debt ?? 0) - Number(practice.importoRata)
    const undescribed = () =>
      new Error(
        `${label}: selezionata e aggiornata da \`update\` (stato ` +
          `"${practice.state}", rate pagate ${paid} su ${total}, debito ` +
          `${debt ?? "vuoto"}) ma nessuno scenario U la descrive (D10)`
      )
    if (paid < 1 || paid > total) throw undescribed()

    let id: ScenarioId
    let expected: Expected
    if (debt === null) {
      // U6: the rates and the state move as in U1, U2 or U4
      id = "U6"
      const ratePagate = paid === total ? paid : paid + 1
      expected = {
        ratePagate,
        debitoResiduo: newDebt,
        state: ratePagate === total ? "Chiusa" : practice.state,
      }
    } else if (practice.state === "Liquidata") {
      if (paid === total) {
        id = "U4"
        expected = { ratePagate: paid, debitoResiduo: newDebt, state: "Chiusa" }
      } else if (paid === total - 1) {
        id = "U2"
        expected = {
          ratePagate: total,
          debitoResiduo: newDebt,
          state: "Chiusa",
        }
      } else {
        id = "U1"
        expected = {
          ratePagate: paid + 1,
          debitoResiduo: newDebt,
          state: "Liquidata",
        }
      }
    } else {
      // U5: as U1 or U2, whatever the state
      if (paid === total) throw undescribed()
      id = "U5"
      expected = {
        ratePagate: paid + 1,
        debitoResiduo: newDebt,
        state: paid + 1 === total ? "Chiusa" : practice.state,
      }
    }
    context.add(id, "practices", key, true, expected)
    context.writes("update", "practices", key, PRACTICE_COLUMNS)
  }
}

// ---------------------------------------------------------------------------
// `update`, customers: born on D's month and day.

function addCustomerScenarios(
  context: Context,
  customers: readonly CustomerRow[]
) {
  const { day, dayOf } = context
  const monthDay = day.slice(5)
  // Calendar month-day next to D's. The leap day sits between 02-28 and 03-01
  // whatever the year of D
  const before = new Set([addDays(day, -1).slice(5)])
  const after = new Set([addDays(day, 1).slice(5)])
  if (monthDay === "03-01") before.add("02-28").add("02-29")
  if (monthDay === "02-28") after.add("02-29")

  for (const customer of customers) {
    const age = customer.age ?? null
    if (customer.birthdayDate == null) {
      context.add("U10c", "customers", customer.id, false, { age })
      continue
    }
    const born = dayOf(customer.birthdayDate).slice(5)
    if (born === monthDay) {
      const id: ScenarioId = age === null ? "U9" : "U8"
      context.add(id, "customers", customer.id, true, {
        age: age === null ? 1 : age + 1,
      })
      context.writes("update", "customers", customer.id, ["age", "updatedAt"])
    } else if (before.has(born)) {
      context.add("U10a", "customers", customer.id, false, { age })
    } else if (after.has(born)) {
      context.add("U10b", "customers", customer.id, false, { age })
    }
  }
}

// ---------------------------------------------------------------------------
// `cleanup-task-event-log`: rows created before D - 3 months.

function addLogScenarios(context: Context, log: readonly TaskEventLogRow[]) {
  const cutoff = subMonthsDay(context.day, 3)
  for (const row of log) {
    if (!(row.createdAt instanceof Date)) {
      throw new Error(`Riga di log ${row.id}: manca createdAt`)
    }
    const created = context.dayOf(row.createdAt)
    if (created === cutoff) {
      throw new Error(
        `Riga di log ${row.id}: creata il ${created}, il giorno di D - 3 ` +
          `mesi, dove l'esito di \`cleanup-task-event-log\` dipende dall'ora`
      )
    }
    if (created < cutoff) {
      context.add("L1", "task_event_log", row.id, true, { deleted: true })
      context.writes("cleanup-task-event-log", "task_event_log", row.id, [
        "deleted",
      ])
    } else {
      context.add("L2", "task_event_log", row.id, false, { deleted: false })
    }
  }
}
