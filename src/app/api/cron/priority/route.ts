import { type NextRequest, NextResponse } from "next/server"
import { Cause, Effect, Exit } from "effect"
import { ErrorReporter } from "@mito/server/effect/errorReporter"
import { ServerLive } from "@mito/server/effect/server"
import { refreshPriorities } from "@mito/server/services/contact/refreshPriorities"
import { authCheck } from "../../_utils/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

type CronRequest = {
  id?: number
}

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck(req)
  if (authResponse) return authResponse

  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const id =
        req.method === "POST"
          ? (yield* Effect.tryPromise(() => req.json() as Promise<CronRequest>))
              .id
          : undefined
      yield* refreshPriorities(id ? Number(id) : undefined)
    }).pipe(
      // The response is a 200 either way: report here, or nobody will
      Effect.tapCause((cause) =>
        Effect.gen(function* () {
          yield* Effect.logError("Priority cron failed", Cause.pretty(cause))
          const reporter = yield* ErrorReporter
          yield* reporter.report(cause, { route: "/api/cron/priority" })
        })
      ),
      Effect.provide(ServerLive)
    )
  )

  if (Exit.isFailure(exit)) {
    return NextResponse.json({
      message: "Error exporting data",
      filePath: null,
      error: "Error exporting data",
    })
  }
  return NextResponse.json({ message: "Cron job ran" })
}

async function postHandler(req: NextRequest) {
  return await handler(req)
}

export { handler as GET, postHandler as POST }
