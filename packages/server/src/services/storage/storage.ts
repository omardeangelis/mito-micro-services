import { Context, type Effect } from "effect"
import type {
  StorageDeleteError,
  StorageDownloadError,
  StorageListError,
  StorageNotFoundError,
  StorageSignError,
  StorageUploadError,
  StorageValidationError,
} from "./errors"

export type UploadInput = {
  readonly key: string
  readonly body: Uint8Array | string
  readonly contentType: string
  readonly cacheControl?: string
  /** Custom object metadata (stored as GCS custom metadata). */
  readonly metadata?: Record<string, string>
}

export type StorageObjectInfo = {
  readonly key: string
  readonly size: number
  readonly updated: Date
}

export type ListOptions = {
  /** Maximum number of objects to return. */
  readonly limit?: number
}

export type SignedDownloadOptions = {
  /** When set, the browser saves the file with this name (Content-Disposition: attachment). */
  readonly filename?: string
  readonly expiresInSeconds?: number
}

export type SignedUploadOptions = {
  /** The browser must send exactly this Content-Type with the PUT request. */
  readonly contentType: string
  readonly expiresInSeconds?: number
}

/** Every method returns an Effect whose error channel holds tagged errors. */
export interface StorageService {
  readonly upload: (
    input: UploadInput
  ) => Effect.Effect<
    { readonly key: string },
    StorageUploadError | StorageValidationError
  >

  readonly download: (
    key: string
  ) => Effect.Effect<Uint8Array, StorageNotFoundError | StorageDownloadError>

  readonly exists: (key: string) => Effect.Effect<boolean, StorageDownloadError>

  /** Idempotent: removing a missing object succeeds. */
  readonly remove: (key: string) => Effect.Effect<void, StorageDeleteError>

  /**
   * Deletes every object whose key starts with `prefix` and returns how many
   * were deleted. Not atomic: if it fails midway, some objects are already gone.
   * Retrying is safe.
   */
  readonly removeByPrefix: (
    prefix: string
  ) => Effect.Effect<
    number,
    StorageValidationError | StorageListError | StorageDeleteError
  >

  readonly list: (
    prefix: string,
    options?: ListOptions
  ) => Effect.Effect<Array<StorageObjectInfo>, StorageListError>

  readonly signedDownloadUrl: (
    key: string,
    options?: SignedDownloadOptions
  ) => Effect.Effect<string, StorageSignError>

  readonly signedUploadUrl: (
    key: string,
    options: SignedUploadOptions
  ) => Effect.Effect<string, StorageSignError>
}

/** Context tag for the storage service. Provide it with `makeGcsStorageLayer` or `makeMemoryStorageLayer`. */
export class Storage extends Context.Service<Storage, StorageService>()(
  "gcs-storage-kit/Storage"
) {}
