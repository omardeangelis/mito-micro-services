import type { SupabaseClient } from "@supabase/supabase-js"
import { Effect, Layer } from "effect"
import { DEFAULT_SIGNED_URL_TTL_SECONDS } from "./config"
import {
  StorageDeleteError,
  StorageDownloadError,
  StorageListError,
  StorageNotFoundError,
  StorageSignError,
  StorageUploadError,
} from "./errors"
import { Storage, type StorageObjectInfo, type StorageService } from "./storage"
import { assertDeletablePrefix, assertMaxBytes } from "./validation"

/**
 * Not part of gcs-storage-kit: the Supabase bucket behind the same `Storage`
 * interface, for production until its storage moves to GCS.
 */
export type SupabaseStorageOptions = {
  /** Called when the layer is built, never on import. */
  readonly client: () => SupabaseClient
  readonly bucket: string
  readonly signedUrlTtlSeconds?: number
  readonly maxUploadBytes?: number
}

type Failure = { readonly message: string; readonly status?: number }

// Supabase answers a missing object with 400 and "Object not found"
const isNotFound = (error: Failure) =>
  error.status === 404 || /not found/i.test(error.message)

// Supabase lists one folder at a time: "export/a" is folder "export", name "a"
const splitPrefix = (prefix: string) => {
  const slash = prefix.lastIndexOf("/")
  return {
    folder: prefix.slice(0, Math.max(slash, 0)),
    name: prefix.slice(slash + 1),
  }
}

const joinKey = (folder: string, name: string) =>
  folder === "" ? name : `${folder}/${name}`

/** Runs a Supabase call that answers `{ data, error }` instead of throwing. */
const call = <A, E>(
  run: () => Promise<{ data: A; error: null } | { data: null; error: Failure }>,
  onError: (cause: unknown) => E
): Effect.Effect<A, E> =>
  Effect.flatMap(Effect.tryPromise({ try: run, catch: onError }), (result) =>
    result.error === null
      ? Effect.succeed(result.data)
      : Effect.fail(onError(result.error))
  )

export const supabaseStorageLayer = (
  options: SupabaseStorageOptions
): Layer.Layer<Storage> =>
  Layer.sync(Storage, () =>
    Storage.of(
      supabaseService(options.client().storage.from(options.bucket), options)
    )
  )

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>

const supabaseService = (
  bucket: Bucket,
  options: SupabaseStorageOptions
): StorageService => {
  const defaultTtl =
    options.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS

  const list = (prefix: string, limit?: number) => {
    const { folder, name } = splitPrefix(prefix)
    return Effect.map(
      call(
        () =>
          bucket.list(folder, {
            ...(limit !== undefined ? { limit } : {}),
            ...(name !== "" ? { search: name } : {}),
          }),
        (cause) =>
          new StorageListError({
            message: `Listing objects under "${prefix}" failed`,
            cause,
          })
      ),
      (files) =>
        (files ?? [])
          // `search` matches anywhere in the name, a prefix only at the start
          .filter((file) => file.name.startsWith(name))
          .map((file): StorageObjectInfo => ({
            key: joinKey(folder, file.name),
            size: Number(
              (file.metadata as { size?: number } | null)?.size ?? 0
            ),
            updated: new Date(file.updated_at ?? 0),
          }))
    )
  }

  return {
    upload: (input) =>
      Effect.gen(function* () {
        yield* assertMaxBytes(input.body, options.maxUploadBytes)
        // cacheControl and metadata are not passed: Supabase reads them differently
        yield* call(
          () =>
            bucket.upload(input.key, input.body, {
              contentType: input.contentType,
              upsert: true,
            }),
          (cause) =>
            new StorageUploadError({
              key: input.key,
              message: `Upload of "${input.key}" failed`,
              cause,
            })
        )
        return { key: input.key }
      }),

    download: (key) =>
      Effect.gen(function* () {
        const result = yield* Effect.tryPromise({
          try: () => bucket.download(key),
          catch: (cause) =>
            new StorageDownloadError({
              key,
              message: `Download of "${key}" failed`,
              cause,
            }),
        })
        if (result.error) {
          return yield* isNotFound(result.error)
            ? Effect.fail(
                new StorageNotFoundError({
                  key,
                  message: `No object at "${key}"`,
                  cause: result.error,
                })
              )
            : Effect.fail(
                new StorageDownloadError({
                  key,
                  message: `Download of "${key}" failed`,
                  cause: result.error,
                })
              )
        }
        const blob = result.data
        return yield* Effect.tryPromise({
          try: async () => new Uint8Array(await blob.arrayBuffer()),
          catch: (cause) =>
            new StorageDownloadError({
              key,
              message: `Download of "${key}" failed`,
              cause,
            }),
        })
      }),

    exists: (key) =>
      list(key).pipe(
        Effect.map((objects) => objects.some((object) => object.key === key)),
        Effect.mapError(
          (error) =>
            new StorageDownloadError({
              key,
              message: `Existence check for "${key}" failed`,
              cause: error.cause,
            })
        )
      ),

    remove: (key) =>
      Effect.asVoid(
        call(
          () => bucket.remove([key]),
          (cause) =>
            new StorageDeleteError({
              key,
              message: `Delete of "${key}" failed`,
              cause,
            })
        )
      ),

    // One folder only: Supabase does not list recursively
    removeByPrefix: (prefix) =>
      Effect.gen(function* () {
        yield* assertDeletablePrefix(prefix)
        const objects = yield* list(prefix)
        if (objects.length === 0) return 0
        const keys = objects.map((object) => object.key)
        yield* call(
          () => bucket.remove(keys),
          (cause) =>
            new StorageDeleteError({
              message: `Delete under "${prefix}" failed`,
              cause,
            })
        )
        return keys.length
      }),

    list: (prefix, listOptions) => list(prefix, listOptions?.limit),

    signedDownloadUrl: (key, signOptions) =>
      Effect.map(
        call<{ signedUrl: string }, StorageSignError>(
          () =>
            bucket.createSignedUrl(
              key,
              signOptions?.expiresInSeconds ?? defaultTtl,
              signOptions?.filename !== undefined
                ? { download: signOptions.filename }
                : undefined
            ),
          (cause) =>
            new StorageSignError({
              key,
              message: `Signing a download URL for "${key}" failed`,
              cause,
            })
        ),
        (data) => data.signedUrl
      ),

    // Supabase fixes the lifetime (2 hours) and does not bind the content type
    signedUploadUrl: (key) =>
      Effect.map(
        call<{ signedUrl: string }, StorageSignError>(
          () => bucket.createSignedUploadUrl(key, { upsert: true }),
          (cause) =>
            new StorageSignError({
              key,
              message: `Signing an upload URL for "${key}" failed`,
              cause,
            })
        ),
        (data) => data.signedUrl
      ),
  }
}
