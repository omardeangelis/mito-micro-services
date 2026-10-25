import "server-only"
import { Cause, Effect, Layer, Option } from "effect"
import { ImportConfigLive } from "./config"
import {
  importQueueChoice,
  importQueueCloudTasks,
  importQueueDisabled,
  importQueueInProcess,
} from "./queue"
import { executeImport } from "./run"
import { purgeUpload } from "./upload"

/** What the log says of a task that failed: its tag, never a message. */
const logFailure = (what: string) => (cause: Cause.Cause<unknown>) => {
  const error = Option.getOrUndefined(Cause.failureOption(cause)) as
    { _tag?: string; code?: string } | undefined
  const kind = error?._tag
    ? `${error._tag}${error.code ? ` ${error.code}` : ""}`
    : "defect"
  return Effect.logError(`${what} failed: ${kind}`)
}

/**
 * The queue of this environment (`importQueueChoice`, D13). In process, the
 * tasks run the same services as the backend's routes.
 */
const ImportQueueLive = Layer.unwrapEffect(
  Effect.map(importQueueChoice, (choice) => {
    switch (choice.kind) {
      case "cloudTasks":
        return importQueueCloudTasks(choice.settings)
      case "inProcess":
        return importQueueInProcess({
          run: (runId) =>
            executeImport(runId).pipe(
              Effect.asVoid,
              Effect.catchAllCause(logFailure(`Import ${runId}`))
            ),
          purge: (uploadId) =>
            purgeUpload(uploadId).pipe(
              Effect.asVoid,
              Effect.catchAllCause(logFailure("Import cleanup"))
            ),
        })
      case "disabled":
        return importQueueDisabled
    }
  })
)

/**
 * The services of the import's procedures: the queue and the limits. They
 * need the database, which `ServerLive` gives.
 */
export const ImportLive = ImportQueueLive.pipe(
  Layer.provideMerge(ImportConfigLive)
)
