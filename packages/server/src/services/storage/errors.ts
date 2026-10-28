import { Schema } from "effect"

/**
 * Fields shared by every storage error. `key` is the object involved, when
 * there is one. `cause` is kept for diagnostics: do not log it in plain text,
 * since GCS client errors can carry request details.
 */
const storageErrorFields = {
  // The adapters pass `key: undefined` when there is none: `optional`, not
  // `optionalKey`, takes it
  key: Schema.optional(Schema.String),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}

/** The configuration is missing or invalid (see `storageConfigFromEnv`). */
export class StorageConfigError extends Schema.TaggedError<StorageConfigError>()(
  "StorageConfigError",
  storageErrorFields
) {}

/** Writing an object failed. */
export class StorageUploadError extends Schema.TaggedError<StorageUploadError>()(
  "StorageUploadError",
  storageErrorFields
) {}

/** Reading an object failed for a reason other than "not found". */
export class StorageDownloadError extends Schema.TaggedError<StorageDownloadError>()(
  "StorageDownloadError",
  storageErrorFields
) {}

/** The object does not exist. */
export class StorageNotFoundError extends Schema.TaggedError<StorageNotFoundError>()(
  "StorageNotFoundError",
  storageErrorFields
) {}

/** Deleting an object failed. */
export class StorageDeleteError extends Schema.TaggedError<StorageDeleteError>()(
  "StorageDeleteError",
  storageErrorFields
) {}

/** Listing objects failed. */
export class StorageListError extends Schema.TaggedError<StorageListError>()(
  "StorageListError",
  storageErrorFields
) {}

/** Generating a signed URL failed. */
export class StorageSignError extends Schema.TaggedError<StorageSignError>()(
  "StorageSignError",
  storageErrorFields
) {}

/** The input was rejected before reaching the bucket (size, prefix, content type...). */
export class StorageValidationError extends Schema.TaggedError<StorageValidationError>()(
  "StorageValidationError",
  storageErrorFields
) {}
