import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { CustomerMissing, OperatorNotFound } from "./errors"
import { AdminOnly, Authenticated } from "./middleware"

/** `taskStatus` of @mito/db/schema/task: a server test compares them (H5). */
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

/** An open alert on the active contact of a customer. */
export const ActiveAlert = Schema.Struct({
  customerId: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String),
  surname: Schema.NullOr(Schema.String),
  alertId: Schema.Number,
  deadline: Schema.Date,
  message: Schema.NullOr(Schema.String),
  state: Schema.NullOr(TaskStatus),
})
export type ActiveAlert = typeof ActiveAlert.Type

/**
 * "Assegnazione massiva" with a call (`bulkHandleTask`): without `state` the
 * contacts go to `chiamare`; the alert is closed only for the customers in
 * `resolveAlertCustomerIds`, the ones the admin confirmed
 */
export const BulkHandleTask = Schema.Struct({
  operatorId: Schema.Number,
  customerIds: Schema.Array(Schema.String),
  state: Schema.optional(TaskStatus),
  resolveAlertCustomerIds: Schema.optional(Schema.Array(Schema.String)),
})
export type BulkHandleTask = typeof BulkHandleTask.Type

/**
 * The group `task` (3.1 of brain/chore/migrazione-frontend-react.md), as far
 * as the pages already in React need it: the procedures of the tRPC router
 * `task`, each with its name (H8).
 *
 * | procedure                    | method and path          |
 * | ---------------------------- | ------------------------ |
 * | getCustomersWithActiveAlerts | POST /task/active-alerts |
 * | bulkHandleTask (admin)       | POST /task/bulk-assign   |
 *
 * `getCustomersWithActiveAlerts` is a read by POST: the ids of a selection
 * could make the URL too long
 */
export class TaskGroup extends HttpApiGroup.make("task")
  .add(
    HttpApiEndpoint.post(
      "getCustomersWithActiveAlerts",
      "/task/active-alerts",
      {
        payload: Schema.Struct({ customerIds: Schema.Array(Schema.String) }),
        success: Schema.Array(ActiveAlert),
      }
    )
  )
  .add(
    HttpApiEndpoint.post("bulkHandleTask", "/task/bulk-assign", {
      payload: BulkHandleTask,
      error: [OperatorNotFound, CustomerMissing],
    }).middleware(AdminOnly)
  )
  .middleware(Authenticated) {}
