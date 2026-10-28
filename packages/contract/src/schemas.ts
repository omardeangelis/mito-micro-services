import { Schema } from "effect"

/** The role of a user, as the `UserRole` enum of the database. */
export const Role = Schema.Literals(["ADMIN", "OPERATORE"])
export type Role = typeof Role.Type

/**
 * `taskStatus` of @mito/db/schema/task: a server test compares them (H5).
 * Here, not in `./task`, since the errors use it too
 */
export const TaskStatus = Schema.Literals([
  "chiamare",
  "non interessato",
  "app.to",
  "caricato",
  "richiamare",
  "non risponde",
  "erogata",
  "nessuno",
  "followup",
])
export type TaskStatus = typeof TaskStatus.Type

/** An operator row, as `operatorSelectCompleteResponse` of @mito/domain. */
export const Operator = Schema.Struct({
  id: Schema.Number,
  name: Schema.NullOr(Schema.String),
  surname: Schema.NullOr(Schema.String),
  userId: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.NullOr(Schema.Date),
})
export type Operator = typeof Operator.Type

/** The layout preferences the server still keeps, until P2 (H4). */
export const UserPreference = Schema.Struct({
  dashboardCollapsed: Schema.optional(Schema.Boolean),
  customerTableVisibleColumns: Schema.optional(Schema.Array(Schema.String)),
  practicesTableVisibleColumns: Schema.optional(Schema.Array(Schema.String)),
  contactTableVisibleColumns: Schema.optional(Schema.Array(Schema.String)),
})
export type UserPreference = typeof UserPreference.Type

/**
 * An id of a Postgres `integer` column, in the path: a larger one fails
 * validation (400) instead of the query (a 500)
 */
export const IntegerId = Schema.FiniteFromString.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 })
)
