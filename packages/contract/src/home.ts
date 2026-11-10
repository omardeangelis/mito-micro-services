import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { Count, Text } from "./customer"
import { AdminOnly, Authenticated } from "./middleware"
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
 * A person with contacts of a Wave to call: `toCall` counts Da chiamare and
 * Non risponde, `neverCalled` the «mai chiamati» among them.
 */
export const LatestWavePerson = Schema.Struct({
  operatorId: Schema.Number,
  userId: Schema.String,
  name: Schema.String,
  inactiveDays: Schema.NullOr(Schema.Number),
  toCall: Schema.Number,
  neverCalled: Schema.Number,
})
export type LatestWavePerson = typeof LatestWavePerson.Type

/**
 * A Wave of «Ultimi import». `importedAt` is the day it started, `deadline`
 * the Rome day it expires (`YYYY-MM-DD`). The `parts` are those of the page of
 * the Wave, and with `noContact` they add up to `customers`.
 */
export const LatestWave = Schema.Struct({
  runId: Schema.Number,
  name: Schema.String,
  importedAt: Schema.Date,
  deadline: Schema.NullOr(Schema.String),
  status: Schema.Literals(["open", "expired", "unconfirmed"]),
  customers: Schema.Number,
  parts: Schema.Struct({
    unassigned: Schema.Number,
    neverCalled: Schema.Number,
    calledNoOutcome: Schema.Number,
    worked: Schema.Number,
    noContact: Schema.Number,
  }),
  people: Schema.Array(LatestWavePerson),
})
export type LatestWave = typeof LatestWave.Type

/**
 * The last 4 completed Waves, from the latest to finish. The two counts are of
 * the distinct customers of `rows`: one in two Waves counts once.
 */
export const LatestWaves = Schema.Struct({
  today: Schema.String,
  rows: Schema.Array(LatestWave),
  unassignedDistinct: Schema.Number,
  neverCalledDistinct: Schema.Number,
})
export type LatestWaves = typeof LatestWaves.Type

/**
 * The calls of the team today, of the people of the team only. `called` is how
 * many of them made at least one, `members` how many they are.
 */
export const TeamDay = Schema.Struct({
  calls: Schema.Number,
  answered: Schema.Number,
  appointments: Schema.Number,
  called: Schema.Number,
  members: Schema.Number,
})
export type TeamDay = typeof TeamDay.Type

/**
 * An overdue callback of a person: `name` is the customer's full name,
 * `daysLate` the Rome days since the deadline, `triedAt` the customer's last
 * unanswered call of today, by anyone.
 */
export const TeamOverdueRow = Schema.Struct({
  taskId: Schema.Number,
  name: Text,
  message: Text,
  daysLate: Schema.Number,
  triedAt: Schema.NullOr(Schema.Date),
})
export type TeamOverdueRow = typeof TeamOverdueRow.Type

/**
 * A call of a person today: `taskId` null a row without a contact, `name` the
 * customer's full name, `message` that of a Richiamare only.
 */
export const TeamTodayCall = Schema.Struct({
  id: Schema.Number,
  at: Schema.Date,
  taskId: Count,
  name: Text,
  outcome: Schema.NullOr(TaskStatus),
  message: Text,
})
export type TeamTodayCall = typeof TeamTodayCall.Type

/**
 * A person of the team with their day. `toCall` counts Da chiamare and Non
 * risponde, `neverCalled` the «mai chiamati» among them. `overdue` has the
 * total, the days of the oldest and its first 6 rows from the oldest;
 * `todayCalls` all the calls of today, the newest first.
 */
export const TeamMember = Schema.Struct({
  operatorId: Schema.Number,
  userId: Schema.String,
  name: Schema.String,
  role: Schema.Literals(["OPERATORE", "ADMIN"]),
  calls: Schema.Number,
  answered: Schema.Number,
  appointments: Schema.Number,
  lastCallAt: Schema.NullOr(Schema.Date),
  inactiveDays: Schema.NullOr(Schema.Number),
  toCall: Schema.Number,
  neverCalled: Schema.Number,
  overdue: Schema.Struct({
    total: Schema.Number,
    oldestDays: Schema.NullOr(Schema.Number),
    rows: Schema.Array(TeamOverdueRow),
  }),
  todayCalls: Schema.Array(TeamTodayCall),
})
export type TeamMember = typeof TeamMember.Type

/**
 * «Dettaglio giornaliero», one row per person of the team in no particular
 * order, with the instant it was read at and its Rome day (`YYYY-MM-DD`): the
 * labels that depend on time are computed from these two.
 */
export const TeamDetail = Schema.Struct({
  now: Schema.Date,
  today: Schema.String,
  members: Schema.Array(TeamMember),
})
export type TeamDetail = typeof TeamDetail.Type

/**
 * The group of the homes (specs `home-operatore`, `home-admin`): it has no
 * router of tRPC. The operator's reads come from `CurrentUser`, the admin's
 * are of the whole team and behind `AdminOnly`.
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
  .add(
    HttpApiEndpoint.get("getLatestWaves", "/home/waves", {
      success: LatestWaves,
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get("getTeamDay", "/home/team/day", {
      success: TeamDay,
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get("getTeamDetail", "/home/team", {
      success: TeamDetail,
    }).middleware(AdminOnly)
  )
  .middleware(Authenticated) {}
