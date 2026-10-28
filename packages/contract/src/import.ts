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
} from "./errors"
import { AdminOnly, Authenticated } from "./middleware"

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
  .middleware(Authenticated) {}
