import { Schema } from "effect"

// The expected failures of the import. Their texts are readable and never
// hold the values of the rows (AC31): the procedures show them, the history
// keeps them

/** What the browser sent can't be imported: too big, unreadable, not the layout it says. */
export class ImportInputInvalid extends Schema.TaggedError<ImportInputInvalid>()(
  "ImportInputInvalid",
  { reason: Schema.String }
) {}

/** No upload with this id for this admin: never made, deleted, or someone else's. */
export class ImportUploadMissing extends Schema.TaggedError<ImportUploadMissing>()(
  "ImportUploadMissing",
  { uploadId: Schema.String }
) {}

/** The upload has an import: it takes no more parts (D14). */
export class ImportUploadClosed extends Schema.TaggedError<ImportUploadClosed>()(
  "ImportUploadClosed",
  { uploadId: Schema.String }
) {}

/**
 * A row the admin expected to import can't be saved now (AC19b): the CRM
 * changed between the preview and the import. Names the row and the rule.
 */
export class ImportRowRejected extends Schema.TaggedError<ImportRowRejected>()(
  "ImportRowRejected",
  { row: Schema.Number, rule: Schema.String }
) {}

/** The import ran past its time (AC30, D8): nothing is written. */
export class ImportTimedOut extends Schema.TaggedError<ImportTimedOut>()(
  "ImportTimedOut",
  {}
) {}

/**
 * Another import is running (D7, AC22): who started it and when, as the
 * Italian time of Rome ("10:05").
 */
export class ImportAlreadyRunning extends Schema.TaggedError<ImportAlreadyRunning>()(
  "ImportAlreadyRunning",
  { startedBy: Schema.String, time: Schema.String }
) {}

/** This environment has no queue for the imports (D13): none starts. */
export class ImportUnavailable extends Schema.TaggedError<ImportUnavailable>()(
  "ImportUnavailable",
  {}
) {}

/** The queue didn't take the task: the import doesn't start. */
export class ImportQueueFailed extends Schema.TaggedError<ImportQueueFailed>()(
  "ImportQueueFailed",
  { reason: Schema.String }
) {}

/** Every expected failure of the import's services. */
export type ImportError =
  | ImportInputInvalid
  | ImportUploadMissing
  | ImportUploadClosed
  | ImportRowRejected
  | ImportTimedOut
  | ImportAlreadyRunning
  | ImportUnavailable
  | ImportQueueFailed
