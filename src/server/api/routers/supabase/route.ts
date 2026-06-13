import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc"
import { z } from "zod"

const BUCKET_NAME = "mito-storage"
const EXPORT_PATH = "export"

export const storageRouter = createTRPCRouter({
  uploadExportFile: protectedProcedure
    .input(
      z.object({
        filePathName: z.string(),
        buffer: z.instanceof(Buffer),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { filePathName, buffer } = input
      const bucket = ctx.supabaseClient.storage.from("mito-storage")
      const sbResult = await bucket.upload(
        `/${EXPORT_PATH}/${filePathName}`,
        buffer,
        {
          upsert: true,
        }
      )

      let filePath

      if (!sbResult.error) {
        filePath = bucket.getPublicUrl(filePathName).data.publicUrl
      }

      return filePath
    }),
  downloadExportFile: protectedProcedure
    .input(
      z.object({
        filePathName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { filePathName } = input
      if (!filePathName)
        return new Response("File name not provided", { status: 400 })

      const bucket = ctx.supabaseClient.storage.from(BUCKET_NAME)
      const sbResult = await bucket.download(`/${EXPORT_PATH}/${filePathName}`)

      if (sbResult.error) {
        console.error("Error downloading file:", sbResult.error.message)
        return new Response("Error downloading file", { status: 500 })
      }

      const file = sbResult.data
      const fileBuffer = await file.arrayBuffer()

      const headers = new Headers()
      headers.set("Content-Type", "application/octet-stream")
      headers.set("Content-Disposition", `attachment; filename=${filePathName}`)

      return {
        buffer: fileBuffer,
        status: 200,
        headers: headers,
      }
    }),
  deleteExportFile: protectedProcedure.mutation(async ({ ctx }) => {
    const { data: files, error: listError } = await ctx.supabaseClient.storage
      .from(BUCKET_NAME)
      .list(EXPORT_PATH, { limit: 1000 })

    if (listError) {
      throw listError
    }

    if (!files || files.length === 0) {
      console.log(`No files found in the ${EXPORT_PATH} folder.`)
    } else {
      // Delete each file in the "export" folder
      for (const file of files) {
        const { error: deleteError } = await ctx.supabaseClient.storage
          .from(BUCKET_NAME)
          .remove([`${EXPORT_PATH}/${file.name}`])

        if (deleteError) {
          console.error(
            `Error deleting file ${EXPORT_PATH}/${file.name}:`,
            deleteError.message
          )
        } else {
          console.log(`File ${EXPORT_PATH}/${file.name} deleted successfully.`)
        }
      }
    }
    console.log(`All files in the ${EXPORT_PATH} folder have been deleted.`)
  }),
})
