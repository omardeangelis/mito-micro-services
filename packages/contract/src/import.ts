import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import {
  ImportAlreadyRunning,
  ImportInputInvalid,
  ImportQueueFailed,
  ImportRowRejected,
  ImportTimedOut,
  ImportUnavailable,
  ImportUploadClosed,
  ImportUploadMissing,
  DeadlineInvalid,
  NothingToMove,
  NumbersChanged,
  RequestIdConflict,
  WaveNotFound,
} from "./errors"
import { AdminOnly, Authenticated } from "./middleware"
import { IntegerId } from "./schemas"

/**
 * The format of an import file, as `importFormat` of @mito/db, written again
 * since the contract imports only effect (H5)
 */
export const ImportFormat = Schema.Literals(["wave", "standard"])

/** How an import is, as `importRunStatus` of @mito/db */
export const ImportStatus = Schema.Literals([
  "running",
  "completed",
  "failed",
  "interrupted",
])

/**
 * The codes of the file's customers and practices (`lookupKeysSchema` of
 * @mito/domain). The shape only: the server checks the limits with the
 * procedure's schema, so the two can't drift (`ImportInputInvalid`)
 */
export const LookupKeys = Schema.Struct({
  fiscalCodes: Schema.Array(Schema.String),
  vatCodes: Schema.Array(Schema.String),
  customerCodes: Schema.Array(Schema.String),
  praticaIds: Schema.Array(Schema.String),
})
export type LookupKeys = typeof LookupKeys.Type

/** What the CRM has of the file's keys (`CrmState` of @mito/domain) */
export const CrmState = Schema.Struct({
  customers: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      fiscalCode: Schema.NullOr(Schema.String),
      vatCode: Schema.NullOr(Schema.String),
      tempID: Schema.String,
    })
  ),
  praticaIds: Schema.Array(Schema.String),
  links: Schema.Array(
    Schema.Struct({ customerId: Schema.String, praticaId: Schema.String })
  ),
})
export type CrmState = typeof CrmState.Type

/**
 * A part of the compressed body, in base64 (`uploadPartSchema`): the first
 * says what the upload is, the others name it. The shape only, as above
 */
export const UploadPart = Schema.Union([
  Schema.Struct({
    uploadId: Schema.String,
    part: Schema.Number,
    data: Schema.String,
  }),
  Schema.Struct({
    fileName: Schema.String,
    format: ImportFormat,
    parts: Schema.Number,
    data: Schema.String,
  }),
])
export type UploadPart = typeof UploadPart.Type

/** An import as the history shows it (`ImportSummary` of the server) */
export const ImportSummary = Schema.Struct({
  id: Schema.Number,
  startedAt: Schema.Date,
  finishedAt: Schema.NullOr(Schema.Date),
  startedBy: Schema.String,
  fileName: Schema.String,
  format: ImportFormat,
  status: ImportStatus,
  failureReason: Schema.NullOr(Schema.String),
  rowsTotal: Schema.Number,
  rowsDiscarded: Schema.Number,
  customersCreated: Schema.NullOr(Schema.Number),
  customersUpdated: Schema.NullOr(Schema.Number),
  practicesCreated: Schema.NullOr(Schema.Number),
  practicesUpdated: Schema.NullOr(Schema.Number),
  linksCreated: Schema.NullOr(Schema.Number),
  durationMs: Schema.NullOr(Schema.Number),
})
export type ImportSummary = typeof ImportSummary.Type

/** An integer from 0 up to a Postgres `integer` */
const Count = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 2_147_483_647 })
)

/** An operator id in a body: a Postgres `integer` */
const OperatorId = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 })
)

/** A day of Rome as `YYYY-MM-DD`, one that exists on the calendar */
export const WaveDay = Schema.String.check(
  Schema.makeFilter(
    (value: string) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
      if (!match) return false
      const [year, month, day] = match.slice(1).map(Number) as [
        number,
        number,
        number,
      ]
      const date = new Date(Date.UTC(year, month - 1, day))
      return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    },
    { expected: "a day as YYYY-MM-DD" }
  )
)

/** Who gets how many: a receiver of `assign` and `move` (D5) */
export const Receiver = Schema.Struct({
  operatorId: OperatorId,
  count: Count,
})
export type Receiver = typeof Receiver.Type

/** At most 200 receivers or givers per request (D5) */
const MAX_PEOPLE = 200
/** At most 20,000 contacts per giver in `move` (D5) */
const MAX_TASK_IDS = 20_000

/**
 * The deadline of a Wave. `confirm` is the first step's: any day after today
 * (the last one counts, AC7). `extend` is a later one: a day after the
 * current deadline (AC20)
 */
export const SetDeadlineInput = Schema.Struct({
  deadline: WaveDay,
  kind: Schema.Literals(["confirm", "extend"]),
})
export type SetDeadlineInput = typeof SetDeadlineInput.Type

/** The deadline before and after the change (`before` is null when never confirmed) */
export const SetDeadlineResult = Schema.Struct({
  before: Schema.NullOr(WaveDay),
  after: WaveDay,
})
export type SetDeadlineResult = typeof SetDeadlineResult.Type

/** The customers of a Wave without an operator to the receivers (D4): `requestId` makes it idempotent */
export const AssignInput = Schema.Struct({
  requestId: Schema.String.check(Schema.isUUID()),
  receivers: Schema.Array(Receiver).check(Schema.isMaxLength(MAX_PEOPLE)),
})
export type AssignInput = typeof AssignInput.Type

/** What `assign` did: the total, the count per receiver, and the customers still unassigned */
export const AssignResult = Schema.Struct({
  assigned: Count,
  byOperator: Schema.Array(
    Schema.Struct({ operatorId: OperatorId, count: Count })
  ),
  remaining: Count,
})
export type AssignResult = typeof AssignResult.Type

/** The givers whose contacts could move (D7) */
export const MoveCandidatesInput = Schema.Struct({
  from: Schema.Array(OperatorId).check(Schema.isMaxLength(MAX_PEOPLE)),
})
export type MoveCandidatesInput = typeof MoveCandidatesInput.Type

/** The states of a contact that can move: Da chiamare and Non risponde (D10) */
export const MovableState = Schema.Literals(["toCall", "noAnswer"])

/**
 * A snapshot of the active contacts each giver could give, in creation then
 * id order (D7). A giver with none has an empty list
 */
export const MoveCandidates = Schema.Struct({
  candidates: Schema.Array(
    Schema.Struct({
      operatorId: OperatorId,
      contacts: Schema.Array(
        Schema.Struct({ taskId: Schema.Number, state: MovableState })
      ),
    })
  ),
})
export type MoveCandidates = typeof MoveCandidates.Type

/**
 * The move the admin confirmed (D6, D13): the exact contacts of each giver
 * the client chose, and how many each receiver takes. The server doesn't
 * rebuild the set
 */
export const MoveInput = Schema.Struct({
  requestId: Schema.String.check(Schema.isUUID()),
  which: Schema.Literals(["both", "toCall", "noAnswer"]),
  strategy: Schema.Literals(["pace", "level", "equal"]),
  contacts: Schema.Array(
    Schema.Struct({
      fromOperatorId: OperatorId,
      taskIds: Schema.Array(
        Schema.Number.check(
          Schema.isInt(),
          Schema.isBetween({ minimum: 1, maximum: 2_147_483_647 })
        )
      ).check(Schema.isMaxLength(MAX_TASK_IDS)),
    })
  ).check(Schema.isMaxLength(MAX_PEOPLE)),
  receivers: Schema.Array(Receiver).check(Schema.isMaxLength(MAX_PEOPLE)),
})
export type MoveInput = typeof MoveInput.Type

/** What `move` did: contacts moved, contacts skipped by the checks of D13, and the count per receiver */
export const MoveResult = Schema.Struct({
  moved: Count,
  skipped: Count,
  byOperator: Schema.Array(
    Schema.Struct({ operatorId: OperatorId, count: Count })
  ),
})
export type MoveResult = typeof MoveResult.Type

/** A person of the team with what the Wave page shows of them (D10, Definizioni) */
export const WaveTeamMember = Schema.Struct({
  operatorId: OperatorId,
  // The user id, null for a row with no user
  userId: Schema.optional(Schema.String),
  // First and last name as shown
  name: Schema.String,
  role: Schema.Literals(["OPERATORE", "ADMIN"]),
  // Persone mostrate: every operator, and the admins who called in the last
  // 30 days or have active contacts
  shown: Schema.Boolean,
  // Calls per working day over the last 30 days, rounded: what the page
  // shows and compares; `exactPace` is the unrounded value
  pace: Count,
  exactPace: Schema.Number,
  // Calendar days since the last call when inactive (7 or more working days
  // without calling since it), null when active or never called
  inactiveDays: Schema.NullOr(Count),
  // Attive: active contacts in Da chiamare or Non risponde, any Wave
  active: Count,
  // Da fare nella Wave: the same, only for this Wave's customers
  waveTodo: Schema.Struct({ toCall: Count, noAnswer: Count }),
})
export type WaveTeamMember = typeof WaveTeamMember.Type

const WithAndWithout = Schema.Struct({
  withOperator: Count,
  withoutOperator: Count,
})

/**
 * Everything the Wave page reads, from one consistent snapshot (D10): the
 * header, the deadline, where the customers come from, who still needs an
 * operator, who has one and in which state, and the team. Days are
 * `YYYY-MM-DD` of Rome
 */
export const WaveView = Schema.Struct({
  // The file name without extension
  name: Schema.String,
  fileName: Schema.String,
  importedAt: Schema.Date,
  // Customers of the Wave
  customers: Count,
  // Today in Rome, from the server's clock
  today: WaveDay,
  deadline: Schema.NullOr(WaveDay),
  // `unconfirmed` has no deadline; `open` runs through the deadline day
  status: Schema.Literals(["open", "expired", "unconfirmed"]),
  // Working days from tomorrow to the deadline (null when unconfirmed or expired)
  workdaysLeft: Schema.NullOr(Count),
  // Calendar days since the deadline (null unless expired)
  daysSinceDeadline: Schema.NullOr(Count),
  origin: Schema.Struct({
    new: WithAndWithout,
    existing: WithAndWithout,
    // The trace of the customers was rebuilt, not recorded by the import
    traceRebuilt: Schema.Boolean,
  }),
  toAssign: Count,
  // The customers not to assign, by the state of their active contact
  alreadyAssigned: Schema.Struct({
    toCall: Count,
    noAnswer: Count,
    recall: Count,
    outcome: Count,
    noContact: Count,
  }),
  // The parts of the Wave (Definizioni): each customer is in one
  parts: Schema.Struct({
    unassigned: Count,
    neverCalled: Count,
    calledNoOutcome: Count,
    worked: Count,
    noContact: Count,
  }),
  team: Schema.Array(WaveTeamMember),
})
export type WaveView = typeof WaveView.Type

/** What the browser sent can't be imported: the procedure's BAD_REQUEST */
const invalid = ImportInputInvalid

/**
 * The group `import` (3.6 of brain/chore/migrazione-frontend-react.md): the
 * procedures of the tRPC router `import`, each with its name (H8), admins
 * only (AC2). Lookup, upload and start are POST, so keys and rows never end
 * up in a URL.
 *
 * | procedure | method and path       |
 * | --------- | --------------------- |
 * | lookup    | POST /import/lookup   |
 * | upload    | POST /import/upload   |
 * | start     | POST /import/start    |
 * | active    | GET /import/active    |
 * | list      | GET /import           |
 * | wave           | GET /import/:id/wave             |
 * | setDeadline    | PATCH /import/:id                |
 * | assign         | POST /import/:id/assign          |
 * | moveCandidates | POST /import/:id/move-candidates |
 * | move           | POST /import/:id/move            |
 *
 * The five Wave endpoints (D5 of assegnazione-wave) are the two exceptions to
 * H8: the writes are actions on one import (`POST /import/:id/<action>`, not
 * `bulk-<action>`), and `moveCandidates` is a read in POST because it carries
 * a list
 */
export class ImportGroup extends HttpApiGroup.make("import")
  .add(
    HttpApiEndpoint.post("lookup", "/import/lookup", {
      payload: LookupKeys,
      success: CrmState,
      error: invalid,
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.post("upload", "/import/upload", {
      payload: UploadPart,
      success: Schema.Struct({ uploadId: Schema.String }),
      error: [
        invalid,
        ImportUploadMissing,
        ImportUploadClosed,
        ImportUnavailable,
        ImportQueueFailed,
      ],
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.post("start", "/import/start", {
      payload: Schema.Struct({
        uploadId: Schema.String,
        rows: Schema.Array(Schema.Number),
      }),
      success: Schema.Struct({ runId: Schema.Number }),
      error: [
        invalid,
        ImportUploadMissing,
        ImportUploadClosed,
        ImportRowRejected,
        ImportAlreadyRunning,
        ImportUnavailable,
        ImportQueueFailed,
        ImportTimedOut,
      ],
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get("active", "/import/active", {
      // The admin's latest import, if any
      success: Schema.NullOr(ImportSummary),
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get("list", "/import", {
      query: { page: Schema.FiniteFromString },
      // A page of the history, from the most recent, and how many there are
      success: Schema.Struct({
        imports: Schema.Array(ImportSummary),
        total: Schema.Number,
      }),
      error: invalid,
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.get("wave", "/import/:id/wave", {
      params: { id: IntegerId },
      success: WaveView,
      error: WaveNotFound,
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.patch("setDeadline", "/import/:id", {
      params: { id: IntegerId },
      payload: SetDeadlineInput,
      success: SetDeadlineResult,
      error: [WaveNotFound, DeadlineInvalid],
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.post("assign", "/import/:id/assign", {
      params: { id: IntegerId },
      payload: AssignInput,
      success: AssignResult,
      error: [WaveNotFound, NumbersChanged, RequestIdConflict],
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.post("moveCandidates", "/import/:id/move-candidates", {
      params: { id: IntegerId },
      payload: MoveCandidatesInput,
      success: MoveCandidates,
      error: WaveNotFound,
    }).middleware(AdminOnly)
  )
  .add(
    HttpApiEndpoint.post("move", "/import/:id/move", {
      params: { id: IntegerId },
      payload: MoveInput,
      success: MoveResult,
      error: [WaveNotFound, NumbersChanged, NothingToMove, RequestIdConflict],
    }).middleware(AdminOnly)
  )
  .middleware(Authenticated) {}
