import { Effect, Schema } from "effect"
import { Storage, storageLayer } from "../storage/index"

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
export class ExportFileNotAllowed extends Schema.TaggedError<ExportFileNotAllowed>()(
  "ExportFileNotAllowed",
  { name: Schema.String }
) {}

/**
 * Writes an xlsx file under export/. The bucket is private: the file is found
 * again by its name, with `downloadExportFile`, never by a public URL.
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
export const downloadExportFile = Effect.fn("export.downloadExportFile")(
  function* (name: string) {
    if (!IMPORT_ERROR_FILE.test(name))
      return yield* new ExportFileNotAllowed({ name })
    const storage = yield* Storage
    return yield* storage.download(exportKey(name))
  }
)

/** Runs a storage program; a failure comes back as `Failure`, not thrown. */
export const runExportStorage = <A, E>(program: Effect.Effect<A, E, Storage>) =>
  Effect.runPromise(program.pipe(Effect.provide(storageLayer), Effect.result))
