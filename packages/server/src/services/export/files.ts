import { Data, Effect } from "effect"
import { Storage, StorageLive } from "../storage/index"

const EXPORT_PATH = "export"
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const exportKey = (name: string) => `${EXPORT_PATH}/${name}`

/**
 * The files under export/ a user may download: the errors of an import
 * (`formatFileNameDate("error-import")`). The old exports of calls and
 * notes, still in the bucket until the nightly cleanup, stay out of reach.
 */
const IMPORT_ERROR_FILE = /^error-import-\d{2}-\d{2}-\d{4}\.xlsx$/

/** The name is not a file of export/ a user may download. */
export class ExportFileNotAllowed extends Data.TaggedError(
  "ExportFileNotAllowed"
)<{ readonly name: string }> {}

/**
 * Writes an xlsx file under export/. The bucket is private: the name, not a
 * public URL, finds the file again.
 */
export const uploadExportFile = (name: string, body: Uint8Array) =>
  Effect.flatMap(Storage, (storage) =>
    storage.upload({
      key: exportKey(name),
      body,
      contentType: XLSX_CONTENT_TYPE,
    })
  )

/** Reads a file of export/, only one of `IMPORT_ERROR_FILE`. */
export const downloadExportFile = (name: string) =>
  Effect.gen(function* () {
    if (!IMPORT_ERROR_FILE.test(name))
      return yield* new ExportFileNotAllowed({ name })
    const storage = yield* Storage
    return yield* storage.download(exportKey(name))
  })

/** Runs a storage program; a failure comes back as `Left`, not thrown. */
export const runExportStorage = <A, E>(program: Effect.Effect<A, E, Storage>) =>
  Effect.runPromise(program.pipe(Effect.provide(StorageLive), Effect.either))
