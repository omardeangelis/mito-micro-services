import { Cause, Effect, Exit, Option, Result } from "effect"
import { type NextRequest } from "next/server"
import { getHTTPStatusCodeFromError } from "@trpc/server/http"
import { getServerAuthSession } from "@mito/server/auth"
import { serverLayer } from "@mito/server/effect/server"
import { resolveActor } from "@mito/server/services/auth/actor"
import {
  downloadExportFile,
  runExportStorage,
} from "@mito/server/services/export/files"
import { operatorErrorToTrpc } from "@mito/server/services/operator/errors"
import { authCheck } from "../../_utils/auth"

/**
 * The response for a session whose user is not an active operator, with the
 * status `operatorProcedure` answers the same error with (TD10 e); null for
 * an active operator.
 */
async function operatorCheck(userId: string) {
  const exit = await Effect.runPromiseExit(
    resolveActor(userId).pipe(Effect.provide(serverLayer))
  )
  if (Exit.isSuccess(exit)) return null
  const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause))
  if (failure && failure._tag !== "DbError") {
    const error = operatorErrorToTrpc(failure)
    return new Response(error.message, {
      status: getHTTPStatusCodeFromError(error),
    })
  }
  console.error("Error reading the operator:", Cause.pretty(exit.cause))
  return new Response("Error downloading file", { status: 500 })
}

async function handler(req: NextRequest) {
  // auth check
  // Only a session, never the token of the cron scripts
  const authResponse = await authCheck(req, { cronToken: false })
  if (authResponse) return authResponse

  const session = await getServerAuthSession(req.headers)
  const operatorResponse = await operatorCheck(session!.user.id)
  if (operatorResponse) return operatorResponse

  const { searchParams } = new URL(req.url)
  const filePathName = searchParams.get("n")
  if (!filePathName)
    return new Response("File name not provided", { status: 400 })

  const result = await runExportStorage(downloadExportFile(filePathName))

  if (Result.isFailure(result)) {
    if (result.failure._tag === "ExportFileNotAllowed")
      return new Response("File not found", { status: 404 })
    console.error("Error downloading file:", result.failure.message)
    return new Response("Error downloading file", { status: 500 })
  }

  // Copy into its own ArrayBuffer: that is the BodyInit Response accepts
  const fileBuffer = new Uint8Array(result.success).buffer

  return new Response(fileBuffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=${filePathName}`,
    },
  })
}

export { handler as GET, handler as POST }
