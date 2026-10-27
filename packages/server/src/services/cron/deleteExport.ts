import { Cause, Effect, Exit, Option, type Layer } from "effect"
import { Storage, StorageLive, type StorageConfigError } from "../storage/index"

const EXPORT_PATH = "export"

const messageOf = (error: { message: string; cause?: unknown }) =>
  typeof error.cause === "object" &&
  error.cause !== null &&
  "message" in error.cause &&
  typeof error.cause.message === "string"
    ? error.cause.message
    : error.message

const deleteExport = Effect.gen(function* () {
  const storage = yield* Storage
  const files = yield* storage.list(`${EXPORT_PATH}/`, { limit: 1000 })

  let deleted = 0
  let failed = 0
  if (files.length === 0) {
    console.log(`No files found in the ${EXPORT_PATH} folder.`)
  } else {
    // Delete each file in the "export" folder
    for (const file of files) {
      yield* storage.remove(file.key).pipe(
        Effect.match({
          onFailure: (error) => {
            failed++
            console.error(`Error deleting file ${file.key}:`, messageOf(error))
          },
          onSuccess: () => {
            deleted++
            console.log(`File ${file.key} deleted successfully.`)
          },
        })
      )
    }
  }
  console.log(`All files in the ${EXPORT_PATH} folder have been deleted.`)
  return { deleted, failed }
})

/**
 * The `delete` cron: deletes the files of the export folder, one by one. A
 * file it can't delete is logged and the others go on; a failure to list the
 * folder is thrown, as the storage reported it. Returns how many it deleted
 * and how many it couldn't.
 */
export async function deleteExportFiles(
  storage: Layer.Layer<Storage, StorageConfigError> = StorageLive
): Promise<{ deleted: number; failed: number }> {
  const exit = await Effect.runPromiseExit(
    Effect.provide(deleteExport, storage)
  )
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.findErrorOption(exit.cause)
  if (Option.isNone(failure)) throw Cause.squash(exit.cause)
  throw failure.value._tag === "StorageListError"
    ? (failure.value.cause ?? failure.value)
    : failure.value
}
