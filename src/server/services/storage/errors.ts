import { Data } from "effect"

/**
 * Fields shared by every storage error. `key` is the object involved, when
 * there is one. `cause` is kept for diagnostics: do not log it in plain text,
 * since GCS client errors can carry request details.
 */
type StorageErrorFields = {
  readonly key?: string
  readonly message: string
  readonly cause?: unknown
}

/** The configuration is missing or invalid (see `storageConfigFromEnv`). */
export class StorageConfigError extends Data.TaggedError(
  "StorageConfigError"
)<StorageErrorFields> {}

/** Writing an object failed. */
export class StorageUploadError extends Data.TaggedError(
  "StorageUploadError"
)<StorageErrorFields> {}

/** Reading an object failed for a reason other than "not found". */
export class StorageDownloadError extends Data.TaggedError(
  "StorageDownloadError"
)<StorageErrorFields> {}

/** The object does not exist. */
export class StorageNotFoundError extends Data.TaggedError(
  "StorageNotFoundError"
)<StorageErrorFields> {}

/** Deleting an object failed. */
export class StorageDeleteError extends Data.TaggedError(
  "StorageDeleteError"
)<StorageErrorFields> {}

/** Listing objects failed. */
export class StorageListError extends Data.TaggedError(
  "StorageListError"
)<StorageErrorFields> {}

/** Generating a signed URL failed. */
export class StorageSignError extends Data.TaggedError(
  "StorageSignError"
)<StorageErrorFields> {}

/** The input was rejected before reaching the bucket (size, prefix, content type...). */
export class StorageValidationError extends Data.TaggedError(
  "StorageValidationError"
)<StorageErrorFields> {}
