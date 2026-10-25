import { Data } from "effect"

// The expected failures of the import. Their texts are readable and never
// hold the values of the rows (AC31): the procedures show them, the history
// keeps them

/** What the browser sent can't be imported: too big, unreadable, not the layout it says. */
export class ImportInputInvalid extends Data.TaggedError("ImportInputInvalid")<{
  readonly reason: string
}> {}

/** No upload with this id for this admin: never made, deleted, or someone else's. */
export class ImportUploadMissing extends Data.TaggedError(
  "ImportUploadMissing"
)<{ readonly uploadId: string }> {}

/** The upload has an import: it takes no more parts (D14). */
export class ImportUploadClosed extends Data.TaggedError("ImportUploadClosed")<{
  readonly uploadId: string
}> {}

/**
 * A row the admin expected to import can't be saved now (AC19b): the CRM
 * changed between the preview and the import. Names the row and the rule.
 */
export class ImportRowRejected extends Data.TaggedError("ImportRowRejected")<{
  readonly row: number
  readonly rule: string
}> {}

/** The import ran past its time (AC30, D8): nothing is written. */
export class ImportTimedOut extends Data.TaggedError("ImportTimedOut") {}
