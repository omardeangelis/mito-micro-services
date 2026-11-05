import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Count, Text } from "./customer"
import { Authenticated } from "./middleware"
import { TaskStatus } from "./schemas"

/**
 * A callback of the current user: an open alert due today or earlier on one of
 * their contacts. `dueDay` is the Rome day of the deadline (`YYYY-MM-DD`),
 * `daysLate` the Rome days since it (0 is today), `triedAt` the last unanswered
 * call to the customer since that day, by anyone.
 */
export const MyCallback = Schema.Struct({
  alertId: Schema.Number,
  taskId: Schema.Number,
  customerId: Schema.String,
  name: Text,
  surname: Text,
  phoneNumber: Text,
  message: Text,
  deadline: Schema.Date,
  dueDay: Schema.String,
  daysLate: Schema.Number,
  state: Schema.NullOr(TaskStatus),
  triedAt: Schema.NullOr(Schema.Date),
})
export type MyCallback = typeof MyCallback.Type

/**
 * A call the current user registered today. `outcome` is the state it ended
 * in (`callResult`), `origin` null a row older than the registry, which reads
 * «Dalla lista», `requestId` null one of the old rows. `callbackDay` (the Rome
 * day, `YYYY-MM-DD`) and `message` come from the alert of a Richiamare, and
 * are null for the other outcomes.
 */
export const MyCall = Schema.Struct({
  id: Schema.Number,
  requestId: Text,
  taskId: Count,
  name: Text,
  surname: Text,
  phoneNumber: Text,
  outcome: Schema.NullOr(TaskStatus),
  at: Schema.Date,
  origin: Schema.NullOr(Schema.Literals(["alert", "list"])),
  callbackDay: Text,
  message: Text,
})
export type MyCall = typeof MyCall.Type

/** The calls the current user registered today, as the export counts them. */
export const MyDay = Schema.Struct({
  calls: Schema.Number,
  answered: Schema.Number,
  appointments: Schema.Number,
})
export type MyDay = typeof MyDay.Type

/** How many contacts of the current user are still to call. */
export const MyToCall = Schema.Struct({ total: Schema.Number })
export type MyToCall = typeof MyToCall.Type

/**
 * The group of the operator's home (spec `home-operatore`): it has no router
 * of tRPC, and everything comes from `CurrentUser`.
 */
export class HomeGroup extends HttpApiGroup.make("home")
  .add(
    HttpApiEndpoint.get("getMyCallbacks", "/home/callbacks", {
      success: Schema.Array(MyCallback),
    })
  )
  .add(
    HttpApiEndpoint.get("getMyCalls", "/home/calls", {
      success: Schema.Array(MyCall),
    })
  )
  .add(
    HttpApiEndpoint.get("getMyDay", "/home/day", {
      success: MyDay,
    })
  )
  .add(
    HttpApiEndpoint.get("getMyToCall", "/home/to-call", {
      success: MyToCall,
    })
  )
  .middleware(Authenticated) {}
