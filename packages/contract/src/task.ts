import { Schema, SchemaTransformation } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { BlackListStatus, Count, RowOperator, Text } from "./customer"
import {
  AlertConfirmationRequired,
  AlertNotFound,
  CallbackNotAllowed,
  ContactAlreadyActive,
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  CustomerMissing,
  CustomerNotFound,
  CustomerUnassigned,
  DeadlineInPast,
  OperatorNotFound,
  TransitionRejected,
} from "./errors"
import { AdminOnly, Authenticated } from "./middleware"
import { IntegerId, TaskStatus } from "./schemas"

export { TaskStatus } from "./schemas"

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

/** The customer of a contact, in the list and in the detail. */
const ContactCustomer = Schema.Struct({
  id: Schema.String,
  name: Text,
  surname: Text,
  phoneNumber: Text,
  fiscalCode: Text,
  vatCode: Text,
  blackListStatus: BlackListStatus,
  operatorId: Count,
})

/** A row of the contacts list, as `ContactRow` of @mito/server. */
export const ContactRow = Schema.Struct({
  id: Schema.Number,
  state: Schema.NullOr(TaskStatus),
  priority: Count,
  isActive: Schema.Boolean,
  closedAt: Schema.NullOr(Schema.Date),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  operator: RowOperator,
  customer: ContactCustomer,
  alert: OpenAlert,
})
export type ContactRow = typeof ContactRow.Type

/** One page of the contacts list, as `GetContactsResult` of @mito/server. */
export const ContactsPage = Schema.Struct({
  contacts: Schema.Array(ContactRow),
  total: Schema.Number,
  previous: Schema.Array(ContactRow),
  customerFilter: Schema.NullOr(
    Schema.Struct({
      found: Schema.Boolean,
      name: Text,
      surname: Text,
      totalContacts: Schema.Number,
    })
  ),
})
export type ContactsPage = typeof ContactsPage.Type

/** `priorityBands` of @mito/domain/contact/priority. */
export const PriorityBand = Schema.Literals(["low", "medium", "high", "urgent"])
export type PriorityBand = typeof PriorityBand.Type

/** `PER_PAGES` of @mito/domain/constants/pagination. */
export const CONTACTS_PER_PAGES = [20, 50, 100, 200, 500] as const

/** `MAX_OPERATOR_IDS` of @mito/domain/contact/listInput. */
export const MAX_OPERATOR_IDS = 100

/** An integer from `minimum` to `maximum`. */
const IntBetween = (minimum: number, maximum: number) =>
  Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum, maximum }))

/** Postgres rejects a NUL in text with an error, not with no match. */
const hasNoNul = Schema.makeFilter((text: string) => !text.includes("\u0000"), {
  expected: "a text without NUL",
})

/**
 * A day as `YYYY-MM-DD` that exists on the calendar, from 2000 to 2100, as
 * `day` of `getContactsInput`
 */
const Day = Schema.String.check(
  Schema.makeFilter(
    (value: string) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
      if (!match) return false
      const [year, month, day] = match.slice(1).map(Number) as [
        number,
        number,
        number,
      ]
      if (year < 2000 || year > 2100) return false
      const date = new Date(Date.UTC(year, month - 1, day))
      return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    },
    { expected: "a day as YYYY-MM-DD" }
  )
)

/**
 * The filters, order and page of the contacts list, as `getContactsInput` of
 * @mito/domain/contact/listInput, with the same limits: a server test checks
 * that the two accept the same inputs. Every field may be left out; the
 * server applies the defaults of `getContactsInput`
 */
export const ContactsQuery = Schema.Struct({
  page: Schema.optional(IntBetween(1, 10_000)),
  perPage: Schema.optional(Schema.Literals(CONTACTS_PER_PAGES)),
  orderBy: Schema.optional(
    Schema.Literals([
      "priority",
      "closedAt",
      "nextAlert",
      "createdAt",
      "updatedAt",
      "customer",
    ])
  ),
  sortedBy: Schema.optional(Schema.Literals(["asc", "desc"])),
  // 0 stands for "Non assegnato"
  operatorIds: Schema.optional(
    Schema.Array(IntBetween(0, 2_147_483_647)).check(
      Schema.isMaxLength(MAX_OPERATOR_IDS)
    )
  ),
  onlyMe: Schema.optional(Schema.Boolean),
  states: Schema.optional(
    Schema.Array(TaskStatus).check(
      Schema.isMaxLength(TaskStatus.literals.length)
    )
  ),
  priorities: Schema.optional(
    Schema.Array(PriorityBand).check(
      Schema.isMaxLength(PriorityBand.literals.length)
    )
  ),
  // Trimmed by the server, as `z.string().trim()`
  customerQuery: Schema.optional(
    Schema.String.pipe(Schema.decode(SchemaTransformation.trim())).check(
      Schema.isMaxLength(100),
      hasNoNul
    )
  ),
  customerId: Schema.optional(
    Schema.String.check(Schema.isMaxLength(64), hasNoNul)
  ),
  dateField: Schema.optional(
    Schema.Literals(["closedAt", "nextAlert", "createdAt"])
  ),
  from: Schema.optional(Day),
  to: Schema.optional(Day),
  hasAlert: Schema.optional(Schema.Boolean),
  includeInactive: Schema.optional(Schema.Boolean),
})
export type ContactsQuery = typeof ContactsQuery.Type

/** Where the user acts on a contact: only the interface does these actions. */
const ContactSource = Schema.Literals(["list", "detail"])

/** An id of an `integer` column, in a payload. */
const IntegerValue = IntBetween(-2_147_483_648, 2_147_483_647)

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
  customer: ContactCustomer,
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
 * The group `task` (3.1 and 3.2 of brain/chore/migrazione-frontend-react.md):
 * the procedures of the tRPC router `task`, each with its name (H8).
 *
 * | procedure                    | method and path                    |
 * | ---------------------------- | ---------------------------------- |
 * | getCustomersWithActiveAlerts | POST /task/active-alerts           |
 * | getActiveTask                | GET /task/by-customer/:id/active   |
 * | getCustomerAlerts            | GET /task/by-customer/:id/alerts   |
 * | getContacts                  | POST /task/contacts                |
 * | getContactById               | GET /task/:id                      |
 * | createContact                | POST /task                         |
 * | changeState                  | POST /task/:id/state               |
 * | setPriority                  | POST /task/:id/priority            |
 * | reassign (admin)             | POST /task/:id/reassign            |
 * | setCallback                  | POST /task/:id/callback            |
 * | resolveAlert                 | DELETE /task/alerts/:id?source=    |
 * | bulkHandleTask (admin)       | POST /task/bulk-assign             |
 *
 * `getCustomersWithActiveAlerts` and `getContacts` are reads by POST: the ids
 * of a selection, or the filters, could make the URL too long. The `id` of
 * `/task/by-customer/:id` is a customer's, that of `/task/:id` a contact's,
 * that of `/task/alerts/:id` an alert's
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
    HttpApiEndpoint.post("getContacts", "/task/contacts", {
      payload: ContactsQuery,
      success: ContactsPage,
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
        source: ContactSource,
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
    HttpApiEndpoint.post("changeState", "/task/:id/state", {
      params: { id: IntegerId },
      payload: Schema.Struct({
        toState: TaskStatus,
        source: ContactSource,
        // The open alert the user confirmed to close, or null
        confirmedAlertId: Schema.NullOr(IntegerValue),
      }),
      // `reopened`: the contact was closed and is active again
      success: Schema.Struct({
        taskId: Schema.Number,
        reopened: Schema.Boolean,
      }),
      error: [
        TransitionRejected,
        AlertConfirmationRequired,
        ContactNotFound,
        ContactSuperseded,
        ContactForbidden,
        CustomerMissing,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("setPriority", "/task/:id/priority", {
      params: { id: IntegerId },
      // "auto" gives the priority back to the cron
      payload: Schema.Struct({
        priority: Schema.Literals([...PriorityBand.literals, "auto"]),
      }),
      error: [
        ContactNotFound,
        ContactSuperseded,
        ContactForbidden,
        CustomerMissing,
      ],
    })
  )
  .add(
    HttpApiEndpoint.post("reassign", "/task/:id/reassign", {
      params: { id: IntegerId },
      payload: Schema.Struct({ operatorId: IntegerValue }),
      success: Schema.Struct({
        contactChanged: Schema.Boolean,
        customerChanged: Schema.Boolean,
      }),
      error: [
        ContactNotFound,
        ContactSuperseded,
        ContactForbidden,
        CustomerMissing,
        OperatorNotFound,
      ],
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.post("setCallback", "/task/:id/callback", {
      params: { id: IntegerId },
      payload: Schema.Struct({
        deadline: Schema.Date,
        // Trimmed by the server; empty is no message
        message: Schema.optional(
          Schema.NullOr(
            Schema.String.pipe(
              Schema.decode(SchemaTransformation.trim())
            ).check(Schema.isMaxLength(500))
          )
        ),
        // The open alert the form showed as replaced, or null
        replacesAlertId: Schema.NullOr(IntegerValue),
      }),
      success: Schema.Struct({ alertId: Schema.Number }),
      error: [
        CallbackNotAllowed,
        DeadlineInPast,
        AlertConfirmationRequired,
        ContactNotFound,
        ContactSuperseded,
        ContactForbidden,
        CustomerMissing,
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete("resolveAlert", "/task/alerts/:id", {
      params: { id: IntegerId },
      query: { source: ContactSource },
      // An alert already closed is `resolved: false`, not an error (F14)
      success: Schema.Struct({ resolved: Schema.Boolean }),
      error: [
        AlertNotFound,
        ContactNotFound,
        ContactSuperseded,
        ContactForbidden,
        CustomerMissing,
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
