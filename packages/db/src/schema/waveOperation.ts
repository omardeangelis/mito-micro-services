import { sql } from "drizzle-orm"
import {
  integer,
  jsonb,
  pgEnum,
  pgTableCreator,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { importRun } from "./importRun"
import { operators } from "./operators"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

export const waveOperationKind = ["assign", "move"] as const
export const waveOperationKindEnum = pgEnum(
  "wave_operation_kind",
  waveOperationKind
)

// The assignments and moves of a Wave, one row per request (spec
// assegnazione-wave, D3): the client's `request_id` makes a repeated request
// answer with the stored `result`, and `payload_hash` tells a repeat from a
// different request with the same id (D4)
export const waveOperation = createTable("wave_operation", {
  requestId: uuid("request_id").primaryKey(),
  runId: integer("run_id")
    .notNull()
    .references(() => importRun.id),
  kind: waveOperationKindEnum("kind").notNull(),
  actorOperatorId: integer("actor_operator_id")
    .notNull()
    .references(() => operators.id),
  payloadHash: text("payload_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  result: jsonb("result"),
})
