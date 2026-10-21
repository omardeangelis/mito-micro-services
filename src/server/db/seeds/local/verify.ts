// Compares the database, after the cron runs, with the manifest (AC29) and
// with the dataset it was seeded from (D14). Read only.
//
// - Each scenario passes when every row it names holds the columns of its
//   `expected`. Amounts compare as numbers with a tolerance (D12); dates as ISO
//   strings; no time written by the database is compared, except the seed
//   `updatedAt` the unchanged scenarios list (D15).
// - "completezza" (D14): a dataset row that changed or disappeared must be
//   `selected: true` in some scenario, and a row that is not in the dataset
//   must be one the `alert` scenarios create.
// - "volumi" (AC30), only at N = 10,000: the volumes of `priority` in the
//   database and the job counters recorded in `manifest.runs`.
//
// Every table is read once, whole, inside one read-only transaction: the
// completeness check needs every row anyway, and the snapshot is consistent.
import { getTableColumns } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import {
  alert,
  chat,
  customers,
  customerToPratica,
  messages,
  operators,
  practices,
  products,
  task,
  taskEventLog,
  users,
} from "@mito/db/schema/index"
// Type only: a value import would load `server-only` and the global `db`
import type { DbClient } from "@mito/server/effect/db"
import type {
  CronName,
  Dataset,
  JsonValue,
  Manifest,
  Run,
  ScenarioRow,
} from "./types"

/** Two amounts closer than this are equal (D12). */
export const AMOUNT_TOLERANCE = 0.005

/** The volume thresholds of AC30, checked only at this N. */
export const VOLUME_N = 10_000
const MIN_SAME_PRIORITY = 5_001
const MIN_COUNTERS: readonly [CronName, string, number][] = [
  ["alert", "processed", 1_000],
  ["update", "practices", 200],
  ["update", "customers", 100],
  ["cleanup-task-event-log", "deleted", 1_000],
]

export type ScenarioFailure = {
  table: string
  key: string | number
  column?: string
  expected: unknown
  found: unknown
}

export type ScenarioResult = {
  id: string
  cron: CronName | "completezza" | "volumi"
  passed: boolean
  failures: ScenarioFailure[]
}

type DbRow = Record<string, unknown>

/** How a column's values are normalized before they are compared. */
type Kind = "amount" | "char" | "other"

type TableSpec = {
  /** The name scenario rows and failures use. */
  name: string
  table: PgTable
  dataset: keyof Dataset
  key: (row: DbRow) => string | number
  kinds: Record<string, Kind>
}

const byId = (row: DbRow) => row.id as string | number

function kindsOf(table: PgTable): Record<string, Kind> {
  const kinds: Record<string, Kind> = {}
  for (const [name, column] of Object.entries(getTableColumns(table))) {
    kinds[name] =
      column.columnType === "PgNumeric"
        ? "amount"
        : column.columnType === "PgChar"
          ? "char"
          : "other"
  }
  return kinds
}

const spec = (
  name: string,
  table: PgTable,
  dataset: keyof Dataset,
  key: (row: DbRow) => string | number = byId
): TableSpec => ({ name, table, dataset, key, kinds: kindsOf(table) })

/** The tables of the dataset, in write order. */
const TABLES: readonly TableSpec[] = [
  spec("products", products, "products"),
  spec("users", users, "users"),
  spec("operators", operators, "operators"),
  spec("chats", chat, "chats"),
  spec("messages", messages, "messages"),
  spec("customers", customers, "customers"),
  spec("practices", practices, "practices", (row) => row.praticaId as string),
  spec(
    "customers_to_pratiche",
    customerToPratica,
    "customerToPratica",
    (row) => `${String(row.customerId)}|${String(row.praticaId)}`
  ),
  spec("alert", alert, "alerts"),
  spec("task", task, "tasks"),
  spec("task_event_log", taskEventLog, "taskEventLog"),
]

const TABLE_BY_NAME = new Map(TABLES.map((each) => [each.name, each]))
const TASKS = TABLE_BY_NAME.get("task")!

/** Rows of a table by `String(key)`. */
type Snapshot = Map<string, Map<string, DbRow>>

// ---------------------------------------------------------------------------
// Values.

/** Amounts as numbers, equal within `AMOUNT_TOLERANCE`; null only equals null. */
export function sameAmount(expected: unknown, found: unknown): boolean {
  if (expected == null || found == null) {
    return expected == null && found == null
  }
  const a = Number(expected)
  const b = Number(found)
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= AMOUNT_TOLERANCE
  )
}

/** Dates as ISO strings, amounts as numbers, `char(n)` without its padding. */
function normalize(value: unknown, kind: Kind): unknown {
  if (value === undefined || value === null) return value
  if (value instanceof Date) return value.toISOString()
  if (kind === "amount") return Number(value)
  if (kind === "char" && typeof value === "string") return value.trimEnd()
  return value
}

function same(expected: unknown, found: unknown, kind: Kind): boolean {
  if (kind === "amount") return sameAmount(expected, found)
  const a = normalize(expected, kind)
  const b = normalize(found, kind)
  if (typeof a === "object" && a !== null) {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return a === b
}

/** A row with every column normalized, to cite it in a failure. */
function cite(row: DbRow, spec: TableSpec, columns?: readonly string[]) {
  const cited: Record<string, unknown> = {}
  for (const column of columns ?? Object.keys(row)) {
    cited[column] = normalize(row[column], spec.kinds[column] ?? "other")
  }
  return cited
}

// ---------------------------------------------------------------------------
// Entry point.

export async function verifyManifest(
  client: DbClient,
  manifest: Manifest,
  dataset: Dataset
): Promise<ScenarioResult[]> {
  const snapshot = await loadSnapshot(client)
  const context = new Context(snapshot, manifest, dataset)

  const results: ScenarioResult[] = manifest.scenarios.map((scenario) => {
    const failures = scenario.rows.flatMap((row) => context.checkRow(row))
    return {
      id: scenario.id,
      cron: scenario.cron,
      passed: failures.length === 0,
      failures,
    }
  })

  const completeness = context.checkCompleteness()
  results.push({
    id: "completezza",
    cron: "completezza",
    passed: completeness.length === 0,
    failures: completeness,
  })

  if (manifest.n === VOLUME_N) {
    const volumes = context.checkVolumes()
    results.push({
      id: "volumi",
      cron: "volumi",
      passed: volumes.length === 0,
      failures: volumes,
    })
  }
  return results
}

/** The results as lines: "P1 passato", or "P1 fallito" and one per failure. */
export function formatResults(results: readonly ScenarioResult[]): string[] {
  const show = (value: unknown) =>
    value === undefined ? "assente" : JSON.stringify(value)
  return results.flatMap((result) => [
    `${result.id} ${result.passed ? "passato" : "fallito"}`,
    ...result.failures.map(
      (failure) =>
        `  ${failure.table} ${failure.key}` +
        `${failure.column ? ` ${failure.column}` : ""}: ` +
        `atteso ${show(failure.expected)}, trovato ${show(failure.found)}`
    ),
  ])
}

async function loadSnapshot(client: DbClient): Promise<Snapshot> {
  return client.transaction(
    async (tx) => {
      const snapshot: Snapshot = new Map()
      for (const each of TABLES) {
        const rows = (await tx.select().from(each.table)) as DbRow[]
        snapshot.set(
          each.name,
          new Map(rows.map((row) => [String(each.key(row)), row]))
        )
      }
      return snapshot
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  )
}

// ---------------------------------------------------------------------------
// The checks, on one snapshot.

class Context {
  /** Dataset keys of each table, by `String(key)`. */
  private readonly datasetKeys = new Map<string, Set<string>>()
  /** Dataset tasks by `String(id)`. */
  private readonly datasetTasks: Map<string, DbRow>
  /** Active tasks of the database by customer. */
  private readonly activeByCustomer = new Map<string, DbRow[]>()
  /** Log rows of the database not in the dataset, by `String(taskId)`. */
  private readonly newLogsByTask = new Map<string, DbRow[]>()

  constructor(
    private readonly snapshot: Snapshot,
    private readonly manifest: Manifest,
    private readonly dataset: Dataset
  ) {
    for (const each of TABLES) {
      this.datasetKeys.set(
        each.name,
        new Set(this.datasetRows(each).map((row) => String(each.key(row))))
      )
    }
    this.datasetTasks = new Map(
      this.datasetRows(TASKS).map((row) => [String(row.id), row])
    )
    for (const row of this.rows("task").values()) {
      if (row.isActive !== true || row.customerId == null) continue
      const key = String(row.customerId)
      this.activeByCustomer.set(key, [
        ...(this.activeByCustomer.get(key) ?? []),
        row,
      ])
    }
    const logKeys = this.datasetKeys.get("task_event_log")!
    for (const [key, row] of this.rows("task_event_log")) {
      if (logKeys.has(key) || row.taskId == null) continue
      const taskKey = String(row.taskId)
      this.newLogsByTask.set(taskKey, [
        ...(this.newLogsByTask.get(taskKey) ?? []),
        row,
      ])
    }
  }

  private datasetRows(each: TableSpec) {
    return this.dataset[each.dataset] as unknown as readonly DbRow[]
  }

  private rows(name: string) {
    return this.snapshot.get(name)!
  }

  // -------------------------------------------------------------------------
  // Scenario rows.

  checkRow(row: ScenarioRow): ScenarioFailure[] {
    if (row.table === "runs") return this.checkRun(row)
    const each = TABLE_BY_NAME.get(row.table)
    const fail = (
      column: string | undefined,
      expected: unknown,
      found: unknown
    ): ScenarioFailure => ({
      table: row.table,
      key: row.key,
      ...(column === undefined ? {} : { column }),
      expected,
      found,
    })
    if (!each) return [fail(undefined, "tabella nota", row.table)]

    const found = this.rows(each.name).get(String(row.key))
    const failures: ScenarioFailure[] = []
    if ("deleted" in row.expected) {
      const deleted = found === undefined
      if (deleted !== row.expected.deleted) {
        failures.push(fail("deleted", row.expected.deleted, deleted))
      }
    }
    const columns = Object.entries(row.expected).filter(
      ([column]) => column !== "deleted"
    )
    if (columns.length === 0) return failures
    if (!found)
      return [...failures, fail(undefined, "riga presente", "riga assente")]

    for (const [column, expected] of columns) {
      if (column === "newActiveContact") {
        failures.push(
          ...this.checkNewActiveContact(row, expected).map((f) =>
            fail(f.column, f.expected, f.found)
          )
        )
      } else if (column === "newLog") {
        failures.push(
          ...this.checkNewLog(row, expected).map((f) =>
            fail(f.column, f.expected, f.found)
          )
        )
      } else {
        const kind = each.kinds[column] ?? "other"
        if (!same(expected, found[column], kind)) {
          failures.push(fail(column, expected, normalize(found[column], kind)))
        }
      }
    }
    return failures
  }

  private checkRun(row: ScenarioRow): ScenarioFailure[] {
    const runs = this.manifest.runs.filter((run) => run.job === row.key)
    return Object.entries(row.expected).flatMap(([column, expected]) => {
      const value = (run: Run) => (run as Record<string, unknown>)[column]
      if (runs.some((run) => value(run) === expected)) return []
      const last = runs.at(-1)
      return [
        {
          table: row.table,
          key: row.key,
          column,
          expected,
          found: last ? (value(last) ?? null) : null,
        },
      ]
    })
  }

  /** A1, A2: the customer's only active task is a new one, as expected. */
  private checkNewActiveContact(
    row: ScenarioRow,
    expected: JsonValue
  ): Omit<ScenarioFailure, "table" | "key">[] {
    const fields = expected as Record<string, JsonValue>
    const customerId = this.datasetTasks.get(String(row.key))?.customerId
    const active =
      customerId == null
        ? []
        : (this.activeByCustomer.get(String(customerId)) ?? [])
    const created = active[0]
    const datasetIds = this.datasetKeys.get("task")!
    if (active.length !== 1 || !created || datasetIds.has(String(created.id))) {
      return [
        {
          column: "newActiveContact",
          expected,
          found: active.map((each) =>
            cite(each, TASKS, ["id", ...Object.keys(fields)])
          ),
        },
      ]
    }
    return Object.entries(fields).flatMap(([field, value]) => {
      const kind = TASKS.kinds[field] ?? "other"
      if (same(value, created[field], kind)) return []
      return [
        {
          column: `newActiveContact.${field}`,
          expected: value,
          found: normalize(created[field], kind),
        },
      ]
    })
  }

  /** A1-A3: the log rows not in the dataset on the task, one per entry. */
  private checkNewLog(
    row: ScenarioRow,
    expected: JsonValue
  ): Omit<ScenarioFailure, "table" | "key">[] {
    const entries = expected as Record<string, JsonValue>[]
    const found = this.newLogsByTask.get(String(row.key)) ?? []
    const logs = TABLE_BY_NAME.get("task_event_log")!
    const unmatched = [...found]
    let matched = true
    for (const entry of entries) {
      const index = unmatched.findIndex((log) =>
        Object.entries(entry).every(([field, value]) =>
          same(value, log[field], logs.kinds[field] ?? "other")
        )
      )
      if (index === -1) {
        matched = false
        break
      }
      unmatched.splice(index, 1)
    }
    if (matched && unmatched.length === 0) return []
    const fields = [...new Set(entries.flatMap((entry) => Object.keys(entry)))]
    return [
      {
        column: "newLog",
        expected,
        found: found.map((log) => cite(log, logs, ["id", ...fields])),
      },
    ]
  }

  // -------------------------------------------------------------------------
  // Completeness (D14).

  checkCompleteness(): ScenarioFailure[] {
    const selected = new Set<string>()
    // New rows the `alert` scenarios allow: "customerId|state" for the new
    // active task, "taskId|action" for the log rows
    const newTasks = new Map<string, number>()
    const newLogs = new Map<string, number>()
    const allow = (allowed: Map<string, number>, key: string) =>
      allowed.set(key, (allowed.get(key) ?? 0) + 1)

    for (const scenario of this.manifest.scenarios) {
      for (const row of scenario.rows) {
        if (!row.selected || row.table === "runs") continue
        selected.add(`${row.table}:${String(row.key)}`)
        if (row.table !== "task") continue
        const contact = row.expected.newActiveContact as
          Record<string, JsonValue> | undefined
        const customerId = this.datasetTasks.get(String(row.key))?.customerId
        if (contact && customerId != null) {
          allow(newTasks, `${String(customerId)}|${String(contact.state)}`)
        }
        const entries = row.expected.newLog as
          Record<string, JsonValue>[] | undefined
        for (const entry of entries ?? []) {
          allow(newLogs, `${String(row.key)}|${String(entry.action)}`)
        }
      }
    }
    const consume = (allowed: Map<string, number>, key: string) => {
      const left = allowed.get(key) ?? 0
      if (left === 0) return false
      allowed.set(key, left - 1)
      return true
    }
    const isAllowedNew = (name: string, row: DbRow) => {
      if (name === "task") {
        return (
          row.isActive === true &&
          consume(newTasks, `${String(row.customerId)}|${String(row.state)}`)
        )
      }
      if (name === "task_event_log") {
        return consume(newLogs, `${String(row.taskId)}|${String(row.action)}`)
      }
      return false
    }

    const failures: ScenarioFailure[] = []
    for (const each of TABLES) {
      const rows = this.rows(each.name)
      for (const row of this.datasetRows(each)) {
        const key = each.key(row)
        if (selected.has(`${each.name}:${String(key)}`)) continue
        const found = rows.get(String(key))
        if (!found) {
          failures.push({
            table: each.name,
            key,
            expected: "riga presente",
            found: "riga assente",
          })
          continue
        }
        for (const [column, value] of Object.entries(row)) {
          if (value === undefined) continue
          const kind = each.kinds[column] ?? "other"
          if (same(value, found[column], kind)) continue
          failures.push({
            table: each.name,
            key,
            column,
            expected: normalize(value, kind),
            found: normalize(found[column], kind),
          })
        }
      }

      const datasetKeys = this.datasetKeys.get(each.name)!
      for (const [key, row] of rows) {
        if (datasetKeys.has(key) || isAllowedNew(each.name, row)) continue
        failures.push({
          table: each.name,
          key: each.key(row),
          expected: "nessuna riga nuova",
          found: cite(row, each),
        })
      }
    }
    return failures
  }

  // -------------------------------------------------------------------------
  // Volumes (AC30).

  checkVolumes(): ScenarioFailure[] {
    const failures: ScenarioFailure[] = []
    const tasks = this.rows("task")
    const byPriority = new Map<number, number>()
    for (const scenario of this.manifest.scenarios) {
      if (scenario.cron !== "priority") continue
      for (const row of scenario.rows) {
        if (!row.selected || row.table !== "task") continue
        const expected = row.expected.priority
        if (typeof expected !== "number") continue
        if (tasks.get(String(row.key))?.priority !== expected) continue
        byPriority.set(expected, (byPriority.get(expected) ?? 0) + 1)
      }
    }
    const most = Math.max(0, ...byPriority.values())
    if (most < MIN_SAME_PRIORITY) {
      failures.push({
        table: "task",
        key: "priority",
        expected: `almeno ${MIN_SAME_PRIORITY} contatti selezionati con la stessa priorita' attesa`,
        found: most,
      })
    }

    for (const [job, counter, min] of MIN_COUNTERS) {
      const run = this.manifest.runs
        .filter((each) => each.job === job && each.outcome === "succeeded")
        .at(-1)
      const value = run?.counters?.[counter]
      if (typeof value === "number" && value >= min) continue
      failures.push({
        table: "runs",
        key: job,
        column: `counters.${counter}`,
        expected: `almeno ${min}`,
        found: run ? (value ?? null) : "nessuna corsa riuscita",
      })
    }
    return failures
  }
}
