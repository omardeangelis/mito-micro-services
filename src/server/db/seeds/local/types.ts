// Solo tipi del seed locale: il dataset (righe con id espliciti) e il manifest
// che i comandi di verifica rileggono. Li modifica solo TB5.
import type { InferInsertModel, Table } from "drizzle-orm"
import type {
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
} from "@/server/db/schema/index"

/** Giorno del calendario di Europe/Rome, "yyyy-MM-dd". */
export type Day = string

// `dbColumnNames: false` = chiavi TypeScript; `override: true` = anche le
// colonne GENERATED ALWAYS AS IDENTITY, perche' il seed scrive id espliciti
type Row<T extends Table> = InferInsertModel<
  T,
  { dbColumnNames: false; override: true }
>
type WithId<T, Id extends number | string> = Omit<T, "id"> & { id: Id }

export type ProductRow = WithId<Row<typeof products>, number>
export type UserRow = WithId<Row<typeof users>, string>
export type OperatorRow = WithId<Row<typeof operators>, number>
export type ChatRow = WithId<Row<typeof chat>, number>
export type MessageRow = WithId<Row<typeof messages>, number>
export type CustomerRow = WithId<Row<typeof customers>, string>
export type PracticeRow = WithId<Row<typeof practices>, number>
export type CustomerToPraticaRow = Row<typeof customerToPratica>
export type AlertRow = WithId<Row<typeof alert>, number>
export type TaskRow = WithId<Row<typeof task>, number>
export type TaskEventLogRow = WithId<Row<typeof taskEventLog>, number>

/** Righe per tabella, con id espliciti, nell'ordine in cui si scrivono. */
export type Dataset = {
  products: ProductRow[]
  users: UserRow[]
  operators: OperatorRow[]
  chats: ChatRow[]
  messages: MessageRow[]
  customers: CustomerRow[]
  practices: PracticeRow[]
  customerToPratica: CustomerToPraticaRow[]
  alerts: AlertRow[]
  tasks: TaskRow[]
  taskEventLog: TaskEventLogRow[]
}

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type CronName =
  "priority" | "alert" | "update" | "cleanup-task-event-log"

export type ScenarioRow = {
  table: string
  key: string | number
  /** Se il cron deve scegliere la riga (true) o lasciarla fuori (false). */
  selected: boolean
  expected: Record<string, JsonValue>
}

export type Scenario = {
  id: string
  cron: CronName
  rows: ScenarioRow[]
}

export type Run = {
  job: CronName
  /** ISO */
  at: string
  outcome: "started" | "succeeded" | "failed"
  counters?: Record<string, number>
  error?: string
}

/** Scritto da `seed:local`, riletto dai comandi di verifica. JSON puro. */
export type Manifest = {
  day: Day
  n: number
  scenarios: Scenario[]
  runs: Run[]
}
