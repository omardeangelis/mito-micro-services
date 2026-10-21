import { createTRPCRouter, protectedProcedure } from "../../trpc"
import { deleteExportFiles } from "../../../services/cron/deleteExport"
import { Storage, StorageLive } from "../../../services/storage/index"
import { TRPCError } from "@trpc/server"
import { Effect, Either } from "effect"
import { z } from "zod"

const EXPORT_PATH = "export"
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const exportKey = (filePathName: string) => `${EXPORT_PATH}/${filePathName}`

// A name under export/: the date in it has slashes, but no ".." and no leading "/"
const exportFileName = z
  .string()
  .min(1)
  .max(300)
  .refine((name) => !name.startsWith("/") && !name.split("/").includes(".."))

/** Runs a storage program; a failure comes back as `Left`, not thrown. */
const runStorage = <A, E>(program: Effect.Effect<A, E, Storage>) =>
  Effect.runPromise(program.pipe(Effect.provide(StorageLive), Effect.either))

export const storageRouter = createTRPCRouter({
  uploadExportFile: protectedProcedure
    .input(
      z.object({
        filePathName: z.string(),
        buffer: z.instanceof(Buffer),
      })
    )
    .mutation(async ({ input }) => {
      const { filePathName, buffer } = input
      const result = await runStorage(
        Effect.flatMap(Storage, (storage) =>
          storage.upload({
            key: exportKey(filePathName),
            body: new Uint8Array(buffer),
            contentType: XLSX_CONTENT_TYPE,
          })
        )
      )
      // The bucket is private: the name, not a public URL, finds the file again
      return Either.isRight(result) ? filePathName : undefined
    }),
  /**
   * A signed URL where the browser uploads an export (PUT, with exactly this
   * content type), instead of writing to the bucket with a public key.
   */
  createExportUploadUrl: protectedProcedure
    .input(z.object({ filePathName: exportFileName }))
    .mutation(async ({ input }) => {
      const result = await runStorage(
        Effect.flatMap(Storage, (storage) =>
          storage.signedUploadUrl(exportKey(input.filePathName), {
            contentType: XLSX_CONTENT_TYPE,
          })
        )
      )
      if (Either.isLeft(result)) {
        console.error("Error signing the upload URL:", result.left.message)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Upload URL not available",
          cause: result.left,
        })
      }
      return { url: result.right, contentType: XLSX_CONTENT_TYPE }
    }),
  downloadExportFile: protectedProcedure
    .input(
      z.object({
        filePathName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { filePathName } = input
      if (!filePathName)
        return new Response("File name not provided", { status: 400 })

      const result = await runStorage(
        Effect.flatMap(Storage, (storage) =>
          storage.download(exportKey(filePathName))
        )
      )

      if (Either.isLeft(result)) {
        console.error("Error downloading file:", result.left.message)
        return new Response("Error downloading file", { status: 500 })
      }

      const file = result.right
      const fileBuffer = file.buffer.slice(
        file.byteOffset,
        file.byteOffset + file.byteLength
      )

      const headers = new Headers()
      headers.set("Content-Type", "application/octet-stream")
      headers.set("Content-Disposition", `attachment; filename=${filePathName}`)

      return {
        buffer: fileBuffer,
        status: 200,
        headers: headers,
      }
    }),
  deleteExportFile: protectedProcedure.mutation(async () => {
    await deleteExportFiles()
  }),
})
