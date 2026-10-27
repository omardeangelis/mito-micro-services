import { Cause, Effect, Exit, ManagedRuntime, Option } from "effect"
import type { StorageConfig } from "./config"
import { makeGcsStorageLayer } from "./gcs"
import { Storage, type StorageService } from "./storage"

/**
 * The same methods as `StorageService`, returning Promises. A rejection carries
 * the same tagged error that the Effect version would fail with, so
 * `err instanceof StorageNotFoundError` and `err._tag` work.
 */
export type StorageClient = {
  readonly [K in keyof StorageService]: StorageService[K] extends (
    ...args: infer Args
  ) => Effect.Effect<infer A, unknown, unknown>
    ? (...args: Args) => Promise<A>
    : never
} & {
  /** Releases the runtime. Call it when the client is no longer needed. */
  readonly dispose: () => Promise<void>
}

/**
 * Promise facade for code that does not use Effect. The client is created on
 * the first call, not when this function runs.
 */
export const createStorageClient = (config: StorageConfig): StorageClient => {
  const runtime = ManagedRuntime.make(makeGcsStorageLayer(config))

  const run = <A, E>(
    use: (service: StorageService) => Effect.Effect<A, E>
  ): Promise<A> =>
    runtime.runPromiseExit(Effect.flatMap(Storage, use)).then((exit) => {
      if (Exit.isSuccess(exit)) return exit.value
      const failure = Cause.findErrorOption(exit.cause)
      throw Option.isSome(failure) ? failure.value : Cause.squash(exit.cause)
    })

  return {
    upload: (input) => run((service) => service.upload(input)),
    download: (key) => run((service) => service.download(key)),
    exists: (key) => run((service) => service.exists(key)),
    remove: (key) => run((service) => service.remove(key)),
    removeByPrefix: (prefix) =>
      run((service) => service.removeByPrefix(prefix)),
    list: (prefix, options) => run((service) => service.list(prefix, options)),
    signedDownloadUrl: (key, options) =>
      run((service) => service.signedDownloadUrl(key, options)),
    signedUploadUrl: (key, options) =>
      run((service) => service.signedUploadUrl(key, options)),
    dispose: () => runtime.dispose(),
  }
}
