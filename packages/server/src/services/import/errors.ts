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
