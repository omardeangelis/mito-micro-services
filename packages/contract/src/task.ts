import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { BlackListStatus, Count, RowOperator, Text } from "./customer"
import {
  ContactAlreadyActive,
  ContactForbidden,
  ContactNotFound,
  CustomerMissing,
  CustomerNotFound,
  CustomerUnassigned,
  OperatorNotFound,
} from "./errors"
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

/** A task row, as `select().from(task)`. */
export const Task = Schema.Struct({
  id: Schema.Number,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  state: Schema.NullOr(TaskStatus),
  closedAt: Schema.NullOr(Schema.Date),
  customerId: Text,
  operatorId: Count,
  alertId: Count,
  priority: Count,
  customPriority: Schema.NullOr(Schema.Boolean),
  isActive: Schema.Boolean,
})
export type Task = typeof Task.Type

/** An alert of a customer's Storico, with who closed it (null while open). */
export const CustomerAlert = Schema.Struct({
  id: Schema.Number,
  deadline: Schema.Date,
  message: Text,
  isResolved: Schema.Boolean,
  updatedAt: Schema.Date,
  resolvedByName: Text,
  resolvedBySurname: Text,
})
export type CustomerAlert = typeof CustomerAlert.Type

/** `ContactEditability` of @mito/domain/contact/permissions. */
export const ContactEditability = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("editable") }),
  Schema.Struct({ kind: Schema.Literal("superseded") }),
  Schema.Struct({ kind: Schema.Literal("not_owner"), assignee: Text }),
])
export type ContactEditability = typeof ContactEditability.Type

/** The open alert of a contact. */
const OpenAlert = Schema.NullOr(
  Schema.Struct({ id: Schema.Number, deadline: Schema.Date, message: Text })
)

/** The detail of a contact, as `GetContactByIdResult` of @mito/server. */
export const ContactDetail = Schema.Struct({
  contact: Schema.Struct({
    id: Schema.Number,
    state: Schema.NullOr(TaskStatus),
    priority: Count,
    customPriority: Schema.NullOr(Schema.Boolean),
    isActive: Schema.Boolean,
    closedAt: Schema.NullOr(Schema.Date),
    createdAt: Schema.Date,
    updatedAt: Schema.Date,
    operator: RowOperator,
  }),
  customer: Schema.Struct({
    id: Schema.String,
    name: Text,
    surname: Text,
    phoneNumber: Text,
    fiscalCode: Text,
    vatCode: Text,
    blackListStatus: BlackListStatus,
    operatorId: Count,
  }),
  alert: OpenAlert,
  history: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      deadline: Schema.Date,
      message: Text,
      updatedAt: Schema.Date,
      resolvedByName: Text,
      resolvedBySurname: Text,
    })
  ),
  customerContacts: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      state: Schema.NullOr(TaskStatus),
      isActive: Schema.Boolean,
      closedAt: Schema.NullOr(Schema.Date),
      createdAt: Schema.Date,
      operator: RowOperator,
    })
  ),
  activeTaskId: Count,
  editability: ContactEditability,
  canReassign: Schema.Boolean,
})
export type ContactDetail = typeof ContactDetail.Type

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
 * | procedure                    | method and path                    |
 * | ---------------------------- | ---------------------------------- |
 * | getCustomersWithActiveAlerts | POST /task/active-alerts           |
 * | getActiveTask                | GET /task/by-customer/:id/active   |
 * | getCustomerAlerts            | GET /task/by-customer/:id/alerts   |
 * | getContactById               | GET /task/:id                      |
 * | createContact                | POST /task                         |
 * | bulkHandleTask (admin)       | POST /task/bulk-assign             |
 *
 * `getCustomersWithActiveAlerts` is a read by POST: the ids of a selection
 * could make the URL too long. The `id` of `/task/by-customer/:id` is a
 * customer's
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
    HttpApiEndpoint.get("getActiveTask", "/task/by-customer/:id/active", {
      params: { id: Schema.String },
      // The active contact of the customer, or none
      success: Schema.Array(Task),
    })
  )
  .add(
    HttpApiEndpoint.get("getCustomerAlerts", "/task/by-customer/:id/alerts", {
      params: { id: Schema.String },
      success: Schema.Array(CustomerAlert),
    })
  )
  .add(
    HttpApiEndpoint.get("getContactById", "/task/:id", {
      params: { id: Schema.String },
      success: ContactDetail,
      error: ContactNotFound,
    })
  )
  .add(
    HttpApiEndpoint.post("createContact", "/task", {
      payload: Schema.Struct({
        customerId: Schema.String,
        // Only the interface creates a contact this way
        source: Schema.Literals(["list", "detail"]),
      }),
      success: Schema.Struct({ taskId: Schema.Number }),
      error: [
        CustomerNotFound,
        CustomerUnassigned,
        ContactForbidden,
        ContactAlreadyActive,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("bulkHandleTask", "/task/bulk-assign", {
      payload: BulkHandleTask,
      error: [OperatorNotFound, CustomerMissing],
    }).middleware(AdminOnly)
  )
  .middleware(Authenticated) {}
