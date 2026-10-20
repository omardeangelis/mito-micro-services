import {
  Storage as GoogleCloudStorage,
  type Bucket,
  type File,
} from "@google-cloud/storage"
import { Clock, Effect, Layer } from "effect"
import { DEFAULT_SIGNED_URL_TTL_SECONDS, type StorageConfig } from "./config"
import {
  StorageDeleteError,
  StorageDownloadError,
  StorageListError,
  StorageNotFoundError,
  StorageSignError,
  StorageUploadError,
} from "./errors"
import {
  Storage,
  type StorageObjectInfo,
  type StorageService,
  type UploadInput,
} from "./storage"
import { assertDeletablePrefix, assertMaxBytes } from "./validation"

/** Parallel deletes inside `removeByPrefix`. */
const DELETE_CONCURRENCY = 10

/**
 * Layer backed by Google Cloud Storage. The client is created when the layer is
 * built, not when this module is imported, so importing the kit has no side
 * effects and reads no environment.
 */
export const makeGcsStorageLayer = (
  config: StorageConfig
): Layer.Layer<Storage> =>
  Layer.sync(Storage, () => {
    const client = new GoogleCloudStorage({
      ...(config.projectId !== undefined
        ? { projectId: config.projectId }
        : {}),
      ...(config.credentials !== undefined
        ? { credentials: config.credentials }
        : {}),
    })
    return gcsService(client.bucket(config.bucket), config)
  })

/** GCS reports a missing object as an API error with code 404. */
const isNotFound = (cause: unknown): boolean => {
  if (typeof cause !== "object" || cause === null || !("code" in cause))
    return false
  return cause.code === 404 || cause.code === "404"
}

/** Removes characters that would break out of the quoted Content-Disposition filename. */
const sanitizeFilename = (name: string): string =>
  name.replace(/["\\\r\n]/g, "").trim() || "download"

const toBuffer = (body: Uint8Array | string): Buffer =>
  typeof body === "string"
    ? Buffer.from(body, "utf8")
    : Buffer.from(body.buffer, body.byteOffset, body.byteLength)

const uploadOptions = (input: UploadInput) => ({
  metadata: {
    contentType: input.contentType,
    ...(input.cacheControl !== undefined
      ? { cacheControl: input.cacheControl }
      : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  },
})

const toObjectInfo = (object: File): StorageObjectInfo => ({
  key: object.name,
  size: Number(object.metadata.size ?? 0),
  updated: new Date(object.metadata.updated ?? 0),
})

/** Lists objects under a prefix. With a limit, GCS stops paging once it has enough. */
const listFiles = (bucket: Bucket, prefix: string, limit: number | undefined) =>
  Effect.map(
    Effect.tryPromise({
      try: () =>
        bucket.getFiles({
          prefix,
          autoPaginate: true,
          ...(limit !== undefined ? { maxResults: limit } : {}),
        }),
      catch: (cause) =>
        new StorageListError({
          message: `Listing objects under "${prefix}" failed`,
          cause,
        }),
    }),
    ([files]) => (limit !== undefined ? files.slice(0, limit) : files)
  )

/** Expiry as epoch milliseconds, read from the Effect clock. */
const expiresAt = (ttlSeconds: number) =>
  Effect.map(Clock.currentTimeMillis, (now) => now + ttlSeconds * 1000)

const gcsService = (bucket: Bucket, config: StorageConfig): StorageService => {
  const defaultTtl =
    config.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS

  return {
    upload: (input) =>
      Effect.gen(function* () {
        const data = toBuffer(input.body)
        yield* assertMaxBytes(data, config.maxUploadBytes)
        yield* Effect.tryPromise({
          try: () => bucket.file(input.key).save(data, uploadOptions(input)),
          catch: (cause) =>
            new StorageUploadError({
              key: input.key,
              message: `Upload of "${input.key}" failed`,
              cause,
            }),
        })
        return { key: input.key }
      }),

    download: (key) =>
      Effect.map(
        Effect.tryPromise({
          try: () => bucket.file(key).download(),
          catch: (cause) =>
            isNotFound(cause)
              ? new StorageNotFoundError({
                  key,
                  message: `No object at "${key}"`,
                  cause,
                })
              : new StorageDownloadError({
                  key,
                  message: `Download of "${key}" failed`,
                  cause,
                }),
        }),
        ([data]) => data
      ),

    exists: (key) =>
      Effect.map(
        Effect.tryPromise({
          try: () => bucket.file(key).exists(),
          catch: (cause) =>
            new StorageDownloadError({
              key,
              message: `Existence check for "${key}" failed`,
              cause,
            }),
        }),
        ([found]) => found
      ),

    remove: (key) =>
      Effect.asVoid(
        Effect.tryPromise({
          try: () => bucket.file(key).delete({ ignoreNotFound: true }),
          catch: (cause) =>
            new StorageDeleteError({
              key,
              message: `Delete of "${key}" failed`,
              cause,
            }),
        })
      ),

    removeByPrefix: (prefix) =>
      Effect.gen(function* () {
        yield* assertDeletablePrefix(prefix)
        const files = yield* listFiles(bucket, prefix, undefined)
        yield* Effect.forEach(
          files,
          (file) =>
            Effect.tryPromise({
              try: () => file.delete({ ignoreNotFound: true }),
              catch: (cause) =>
                new StorageDeleteError({
                  key: file.name,
                  message: `Delete of "${file.name}" failed`,
                  cause,
                }),
            }),
          { concurrency: DELETE_CONCURRENCY, discard: true }
        )
        return files.length
      }),

    list: (prefix, options) =>
      Effect.map(listFiles(bucket, prefix, options?.limit), (files) =>
        files.map(toObjectInfo)
      ),

    signedDownloadUrl: (key, options) =>
      Effect.gen(function* () {
        const expires = yield* expiresAt(
          options?.expiresInSeconds ?? defaultTtl
        )
        const responseDisposition =
          options?.filename !== undefined
            ? `attachment; filename="${sanitizeFilename(options.filename)}"`
            : undefined
        const [url] = yield* Effect.tryPromise({
          try: () =>
            bucket.file(key).getSignedUrl({
              version: "v4",
              action: "read",
              expires,
              ...(responseDisposition !== undefined
                ? { responseDisposition }
                : {}),
            }),
          catch: (cause) =>
            new StorageSignError({
              key,
              message: `Signing a download URL for "${key}" failed`,
              cause,
            }),
        })
        return url
      }),

    signedUploadUrl: (key, options) =>
      Effect.gen(function* () {
        const expires = yield* expiresAt(options.expiresInSeconds ?? defaultTtl)
        const [url] = yield* Effect.tryPromise({
          try: () =>
            bucket.file(key).getSignedUrl({
              version: "v4",
              action: "write",
              expires,
              contentType: options.contentType,
            }),
          catch: (cause) =>
            new StorageSignError({
              key,
              message: `Signing an upload URL for "${key}" failed`,
              cause,
            }),
        })
        return url
      }),
  }
}
