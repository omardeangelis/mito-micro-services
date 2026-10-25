import { Either } from "effect"
import { type NextRequest } from "next/server"
import {
  downloadExportFile,
  runExportStorage,
} from "@mito/server/services/export/files"
import { authCheck } from "../../_utils/auth"

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  const { searchParams } = new URL(req.url)
  const filePathName = searchParams.get("n")
  if (!filePathName)
    return new Response("File name not provided", { status: 400 })

  const result = await runExportStorage(downloadExportFile(filePathName))

  if (Either.isLeft(result)) {
    if (result.left._tag === "ExportFileNotAllowed")
      return new Response("File not found", { status: 404 })
    console.error("Error downloading file:", result.left.message)
    return new Response("Error downloading file", { status: 500 })
  }

  // Copy into its own ArrayBuffer: that is the BodyInit Response accepts
  const fileBuffer = new Uint8Array(result.right).buffer

  const headers = new Headers()
  headers.set("Content-Type", "application/octet-stream")
  headers.set("Content-Disposition", `attachment; filename=${filePathName}`)

  return new Response(fileBuffer, { status: 200, headers })
}

export { handler as GET, handler as POST }
