import { Clock, Effect, Layer } from "effect"
import { DEFAULT_SIGNED_URL_TTL_SECONDS } from "./config"
import { StorageNotFoundError } from "./errors"
import { Storage, type StorageObjectInfo, type StorageService } from "./storage"
import { assertDeletablePrefix, assertMaxBytes } from "./validation"

export type MemoryStorageOptions = {
  /** Bucket name, used only inside the fake URLs. Default "memory". */
  readonly bucket?: string
  /** Upper bound for `upload` bodies, in bytes. Omit it for no limit. */
  readonly maxUploadBytes?: number
  /** Default lifetime of the fake signed URLs. Default 900. */
  readonly signedUrlTtlSeconds?: number
}

type StoredObject = {
  readonly body: Uint8Array
  readonly updated: Date
}

const encoder = new TextEncoder()

/** Encodes each path segment, so "/" stays a separator. */
const encodePath = (key: string): string =>
  key.split("/").map(encodeURIComponent).join("/")

/**
 * In-memory layer with the same semantics as the GCS one, for tests of code that
 * uses the kit. Each call builds a fresh, empty store, so run the operations
 * that depend on each other inside one program. Signed URLs are fake and
 * deterministic (`memory://<bucket>/<key>?action=read...`): they are not valid
 * against GCS.
 */
export const memoryStorageLayer = (
  options: MemoryStorageOptions = {}
): Layer.Layer<Storage> =>
  Layer.sync(Storage, () => Storage.of(makeMemoryService(options)))

const makeMemoryService = (options: MemoryStorageOptions): StorageService => {
  const bucket = options.bucket ?? "memory"
  const defaultTtl =
    options.signedUrlTtlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS
  const objects = new Map<string, StoredObject>()

  const fakeUrl = (
    key: string,
    action: "read" | "write",
    params: Record<string, string | number>
  ) => {
    const query = new URLSearchParams({ action })
    for (const [name, value] of Object.entries(params))
      query.set(name, String(value))
    return `memory://${bucket}/${encodePath(key)}?${query.toString()}`
  }

  return {
    upload: (input) =>
      Effect.gen(function* () {
        // Copy the bytes, so later changes by the caller do not alter the stored object.
        const data =
          typeof input.body === "string"
            ? encoder.encode(input.body)
            : input.body.slice()
        yield* assertMaxBytes(data, options.maxUploadBytes)
        const updated = new Date(yield* Clock.currentTimeMillis)
        objects.set(input.key, { body: data, updated })
        return { key: input.key }
      }),

    download: (key) =>
      Effect.suspend(() => {
        const object = objects.get(key)
        return object !== undefined
          ? Effect.succeed(object.body.slice())
          : Effect.fail(
              new StorageNotFoundError({
                key,
                message: `No object at "${key}"`,
              })
            )
      }),

    exists: (key) => Effect.sync(() => objects.has(key)),

    remove: (key) =>
      Effect.sync(() => {
        objects.delete(key)
      }),

    removeByPrefix: (prefix) =>
      Effect.gen(function* () {
        yield* assertDeletablePrefix(prefix)
        return yield* Effect.sync(() => {
          const matching = Array.from(objects.keys()).filter((key) =>
            key.startsWith(prefix)
          )
          for (const key of matching) objects.delete(key)
          return matching.length
        })
      }),

    list: (prefix, listOptions) =>
      Effect.sync(() => {
        const matching: Array<StorageObjectInfo> = Array.from(objects.entries())
          .filter(([key]) => key.startsWith(prefix))
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, object]) => ({
            key,
            size: object.body.byteLength,
            updated: object.updated,
          }))
        return listOptions?.limit !== undefined
          ? matching.slice(0, listOptions.limit)
          : matching
      }),

    signedDownloadUrl: (key, opts) =>
      Effect.succeed(
        fakeUrl(key, "read", {
          expiresInSeconds: opts?.expiresInSeconds ?? defaultTtl,
          ...(opts?.filename !== undefined ? { filename: opts.filename } : {}),
        })
      ),

    signedUploadUrl: (key, opts) =>
      Effect.succeed(
        fakeUrl(key, "write", {
          contentType: opts.contentType,
          expiresInSeconds: opts.expiresInSeconds ?? defaultTtl,
        })
      ),
  }
}
