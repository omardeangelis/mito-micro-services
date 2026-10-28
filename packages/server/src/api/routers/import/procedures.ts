import { TRPCError } from "@trpc/server"
import { Effect } from "effect"
import { z } from "zod"
import {
  lookupKeysSchema,
  startImportSchema,
  uploadPartSchema,
} from "@mito/domain/import/payload"
import { type DbError } from "../../../effect/db"
import { type ServerServices } from "../../../effect/server"
import { runTrpc } from "../../../effect/trpc"
import { type ImportConfig } from "../../../services/import/config"
import { type ImportError } from "../../../services/import/errors"
import { activeImport, listImports } from "../../../services/import/history"
import { importLayer } from "../../../services/import/live"
import { lookupExisting } from "../../../services/import/lookup"
import { type ImportQueue } from "../../../services/import/queue"
import { startImport } from "../../../services/import/run"
import { beginUpload, saveUploadPart } from "../../../services/import/upload"
import { adminProcedure } from "../../trpc"

// The import of customers and practices, admins only (AC2, D12): adapters
// without logic over the services of `services/import`. Lookup, upload and
// start are mutations, so keys and rows never end up in a URL

/** The import's errors as tRPC codes, with their readable messages. */
const importErrorToTrpc = (error: ImportError) => {
  switch (error._tag) {
    case "ImportAlreadyRunning":
      return new TRPCError({
        code: "CONFLICT",
        message: `C'è già un import in corso, avviato da ${error.startedBy} alle ${error.time}`,
      })
    case "ImportInputInvalid":
      return new TRPCError({ code: "BAD_REQUEST", message: error.reason })
    case "ImportRowRejected":
      return new TRPCError({
        code: "BAD_REQUEST",
        message: `Riga ${error.row}: ${error.rule}`,
      })
    case "ImportUnavailable":
      return new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "L'import non è disponibile su questo ambiente",
      })
    case "ImportUploadMissing":
      return new TRPCError({
        code: "NOT_FOUND",
        message: "Il file inviato non c'è più: ricomincia l'import",
      })
    case "ImportUploadClosed":
      return new TRPCError({
        code: "CONFLICT",
        message: "Il file inviato è già in importazione",
      })
    case "ImportQueueFailed":
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "La coda dell'import non ha accettato l'import: riprova",
      })
    case "ImportTimedOut":
      return new TRPCError({
        code: "TIMEOUT",
        message: "L'import non è finito entro 30 minuti dall'inizio",
      })
  }
}

/** Runs an import service with its queue and limits (`importLayer`). */
const runImport = <A>(
  program: Effect.Effect<
    A,
    ImportError | DbError,
    ServerServices | ImportConfig | ImportQueue
  >
) => runTrpc(program.pipe(Effect.provide(importLayer)), importErrorToTrpc)

export const lookup = adminProcedure
  .input(lookupKeysSchema)
  .mutation(({ input }) => runTrpc(lookupExisting(input)))

export const upload = adminProcedure
  .input(uploadPartSchema)
  .mutation(({ ctx, input }) => {
    const createdBy = ctx.operator.userId
    const data = new Uint8Array(Buffer.from(input.data, "base64"))
    if ("uploadId" in input) {
      return runImport(
        saveUploadPart({
          uploadId: input.uploadId,
          createdBy,
          part: input.part,
          data,
        }).pipe(Effect.as({ uploadId: input.uploadId }))
      )
    }
    return runImport(
      beginUpload({
        createdBy,
        fileName: input.fileName,
        format: input.format,
        parts: input.parts,
        data,
      }).pipe(Effect.map((uploadId) => ({ uploadId })))
    )
  })

export const start = adminProcedure
  .input(startImportSchema)
  .mutation(({ ctx, input }) =>
    runImport(
      startImport({
        uploadId: input.uploadId,
        expected: input.rows,
        startedBy: ctx.operator.userId,
      })
    )
  )

export const active = adminProcedure.query(({ ctx }) =>
  runImport(activeImport(ctx.operator.userId))
)

export const list = adminProcedure
  .input(z.object({ page: z.number().int().min(1).max(100_000) }))
  .query(({ input }) => runImport(listImports(input.page)))
