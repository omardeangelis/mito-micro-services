import { Cause, Effect, Layer, Option } from "effect"
import { ImportConfig } from "./config"
import { ImportQueue, importQueueChoice } from "./queue"
import { executeImport, purgeUpload } from "./run"

/** What the log says of a task that failed: its tag, never a message. */
const logFailure = (what: string) => (cause: Cause.Cause<unknown>) => {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause)) as
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
const importQueueLayer = Layer.unwrap(
  Effect.map(importQueueChoice, (choice) => {
    switch (choice.kind) {
      case "cloudTasks":
        return ImportQueue.layerCloudTasks(choice.settings)
      case "inProcess":
        return ImportQueue.layerInProcess({
          run: (runId) =>
            executeImport(runId).pipe(
              Effect.asVoid,
              Effect.catchCause(logFailure(`Import ${runId}`))
            ),
          purge: (uploadId) =>
            purgeUpload(uploadId).pipe(
              Effect.asVoid,
              Effect.catchCause(logFailure("Import cleanup"))
            ),
        })
      case "disabled":
        return ImportQueue.layerDisabled
    }
  })
)

/**
 * The services of the import's procedures: the queue and the limits. They
 * need the database, which `serverLayer` gives.
 */
export const importLayer = importQueueLayer.pipe(
  Layer.provideMerge(ImportConfig.layer)
)
