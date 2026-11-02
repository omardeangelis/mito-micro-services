import { sql } from "drizzle-orm"
import {
  pgTableCreator,
  timestamp,
  integer,
  pgEnum,
  varchar,
  index,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { customers } from "./customers"
import { operators } from "./operators"
import { task, alert, taskStatusEnum } from "./task"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const taskEventAction = [
  "state_change",
  "operator_reassign",
  "alert_resolved",
  "call",
] as const

export const taskEventActionEnum = pgEnum("task_event_action", taskEventAction)

export const taskEventSource = [
  "detail",
  "list",
  "bulk",
  "self_assign",
  "cron_alert",
  "deactivation",
] as const

export const taskEventSourceEnum = pgEnum("task_event_source", taskEventSource)

// Where a call was registered from, for action = 'call'
export const callOrigin = ["alert", "list"] as const

export const callOriginEnum = pgEnum("call_origin", callOrigin)

// Log append-only delle azioni rilevanti sul ciclo di vita di un task:
// cambio stato, riassegnazione operatore, risoluzione alert. Una riga = un
// fatto: un'azione che in UI ne produce più di uno (es. la bulk "chiamate"
// che riassegna E cambia stato) scrive più righe distinte.
export const taskEventLog = createTable(
  "task_event_log",
  {
    id: integer("id")
      .primaryKey()
      .generatedAlwaysAsIdentity({ startWith: 1000 })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    customerId: varchar("customer_id")
      .notNull()
      .references(() => customers.id),
    taskId: integer("task_id").references(() => task.id),
    alertId: integer("alert_id").references(() => alert.id),
    // Operatore reale per le azioni manuali, operatore di sistema per il cron.
    actorOperatorId: integer("actor_operator_id")
      .notNull()
      .references(() => operators.id),
    action: taskEventActionEnum("action").notNull(),
    source: taskEventSourceEnum("source").notNull(),
    // Rilevanti solo per action = 'state_change'
    fromState: taskStatusEnum("from_state"),
    toState: taskStatusEnum("to_state"),
    // Rilevanti solo per action = 'operator_reassign'
    fromOperatorId: integer("from_operator_id").references(() => operators.id),
    toOperatorId: integer("to_operator_id").references(() => operators.id),
    // Rilevanti solo per action = 'call'
    outcome: taskStatusEnum("outcome"),
    origin: callOriginEnum("origin"),
    // Chiave di idempotenza dell'invio: due righe con lo stesso valore non
    // possono esistere
    requestId: uuid("request_id"),
  },
  (table) => ({
    customerIdIdx: index("task_event_log_customerId_idx").on(table.customerId),
    createdAtIdx: index("task_event_log_createdAt_idx").on(table.createdAt),
    requestIdUidx: uniqueIndex("task_event_log_request_id_uidx")
      .on(table.requestId)
      .where(sql`request_id IS NOT NULL`),
  })
)
