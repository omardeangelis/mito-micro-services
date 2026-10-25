import "server-only"
import { promisify } from "node:util"
import { gunzip } from "node:zlib"
import { and, asc, eq } from "drizzle-orm"
import { Effect } from "effect"
import { importUpload, importUploadPart } from "@mito/db/schema/importRun"
import { detectFormat, type ImportFormat } from "@mito/domain/import/formats"
import {
  MAX_BODY_BYTES,
  MAX_ROWS,
  fileBodySchema,
  fromFileBody,
} from "@mito/domain/import/payload"
import { query, transaction } from "../../effect/db"
import {
  ImportInputInvalid,
  ImportUploadClosed,
  ImportUploadMissing,
} from "./errors"

// The rows of a file from the confirmation to the end of its import (D3,
// D14): the browser sends the gzip of the compact body in parts, the import
// reads them back once all have arrived

const gunzipAsync = promisify(gunzip)

const invalid = (reason: string) => new ImportInputInvalid({ reason })

const formatNames: Record<ImportFormat, string> = {
  wave: "Wave",
  standard: "Standard",
}

/**
 * The first part of a file's rows: creates the upload, whose id the next
 * parts and the start of the import carry.
 */
export const createUpload = (input: {
  createdBy: string
  fileName: string
  format: ImportFormat
  parts: number
  data: Uint8Array
}) =>
  transaction(
    Effect.gen(function* () {
      const [upload] = yield* query((client) =>
        client
          .insert(importUpload)
          .values({
            createdBy: input.createdBy,
            fileName: input.fileName,
            format: input.format,
            parts: input.parts,
          })
          .returning({ id: importUpload.id })
      )
      yield* query((client) =>
        client
          .insert(importUploadPart)
          .values({ uploadId: upload!.id, part: 0, data: input.data })
      )
      return upload!.id
    })
  )

/**
 * The admin's upload, locked until the transaction ends: a part, the start of
 * the import and the cleanup lock it, so a part can't arrive once the import
 * has it (D14).
 */
export const lockUpload = (uploadId: string, createdBy: string) =>
  Effect.gen(function* () {
    const [upload] = yield* query((client) =>
      client
        .select()
        .from(importUpload)
        .where(
          and(
            eq(importUpload.id, uploadId),
            eq(importUpload.createdBy, createdBy)
          )
        )
        .for("update")
    )
    if (!upload) return yield* new ImportUploadMissing({ uploadId })
    return upload
  })

/** A later part of the admin's upload. A part sent again replaces the first. */
export const saveUploadPart = (input: {
  uploadId: string
  createdBy: string
  part: number
  data: Uint8Array
}) =>
  transaction(
    Effect.gen(function* () {
      const upload = yield* lockUpload(input.uploadId, input.createdBy)
      if (upload.runId !== null) {
        return yield* new ImportUploadClosed({ uploadId: upload.id })
      }
      if (input.part >= upload.parts) {
        return yield* invalid(
          `Il file è stato diviso in ${upload.parts} pezzi: il pezzo ${input.part + 1} non è tra questi`
        )
      }
      yield* query((client) =>
        client
          .insert(importUploadPart)
          .values({ uploadId: upload.id, part: input.part, data: input.data })
          .onConflictDoUpdate({
            target: [importUploadPart.uploadId, importUploadPart.part],
            set: { data: input.data },
          })
      )
    })
  )

/** The message of the first problem of the body, without its values. */
const bodyProblem = (issues: { path: (string | number)[]; code: string }[]) => {
  const [issue] = issues
  if (issue?.code === "too_big" && issue.path.length === 1) {
    if (issue.path[0] === "rows") {
      return `Il file ha più di ${MAX_ROWS.toLocaleString("it-IT")} righe`
    }
    if (issue.path[0] === "columns") return "Il file ha troppe colonne"
  }
  return "Il file inviato non è valido"
}

/**
 * The rows of an upload whose parts have all arrived, checked as the server
 * takes them (D3): at most `MAX_BODY_BYTES` once decompressed, the schema of
 * the body, the columns of the layout it says.
 */
export const loadUpload = (uploadId: string) =>
  Effect.gen(function* () {
    const [upload] = yield* query((client) =>
      client.select().from(importUpload).where(eq(importUpload.id, uploadId))
    )
    if (!upload) return yield* new ImportUploadMissing({ uploadId })
    const parts = yield* query((client) =>
      client
        .select({ data: importUploadPart.data })
        .from(importUploadPart)
        .where(eq(importUploadPart.uploadId, uploadId))
        .orderBy(asc(importUploadPart.part))
    )
    // One row per part (the key), each below `parts` (saveUploadPart)
    if (parts.length !== upload.parts) {
      return yield* invalid("Il file non è arrivato per intero")
    }

    const json = yield* Effect.tryPromise({
      try: () =>
        gunzipAsync(Buffer.concat(parts.map(({ data }) => data)), {
          maxOutputLength: MAX_BODY_BYTES,
        }),
      catch: (error) =>
        invalid(
          (error as { code?: unknown }).code === "ERR_BUFFER_TOO_LARGE"
            ? "Il file inviato è troppo grande"
            : "Il file inviato non si legge"
        ),
    }).pipe(Effect.map((bytes) => bytes.toString("utf8")))
    const raw = yield* Effect.try({
      try: () => JSON.parse(json) as unknown,
      catch: () => invalid("Il file inviato non si legge"),
    })
    const body = fileBodySchema.safeParse(raw)
    if (!body.success) return yield* invalid(bodyProblem(body.error.issues))

    const detected = detectFormat(body.data.columns)
    if (!("format" in detected) || detected.format !== upload.format) {
      return yield* invalid(
        `Le colonne del file non sono quelle del formato ${formatNames[upload.format]}`
      )
    }
    return { upload, rows: fromFileBody(body.data) }
  })

/** Deletes the upload with its parts. */
export const deleteUpload = (uploadId: string) =>
  query((client) =>
    client.delete(importUpload).where(eq(importUpload.id, uploadId))
  )
