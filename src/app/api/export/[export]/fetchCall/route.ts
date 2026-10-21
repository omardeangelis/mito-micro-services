import { NextResponse, type NextRequest } from "next/server"
import { Cause, Effect, Exit } from "effect"
import { parseReadableStream } from "@/lib/utils/api"
import { getServerAuthSession } from "@mito/server/auth"
import { ErrorReporter } from "@mito/server/effect/errorReporter"
import { ServerLive } from "@mito/server/effect/server"
import { closedCalls } from "@mito/server/services/export/calls"

const ROUTE = "/api/export/export/fetchCall"

/** The interval of the request, or `null` if the body doesn't hold one. */
async function readInterval(req: NextRequest) {
  try {
    const { request } = await parseReadableStream<{
      interval?: { from?: string; to?: string }
    }>(req.body)
    const { from, to } = request.interval ?? {}
    if (!from || !to) return null
    const interval = { from: new Date(from), to: new Date(to) }
    if (isNaN(interval.from.getTime()) || isNaN(interval.to.getTime())) {
      return null
    }
    return interval
  } catch {
    return null
  }
}

async function handler(req: NextRequest) {
  // Whose calls the answer holds comes from the session, never from the body
  const session = await getServerAuthSession()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const interval = await readInterval(req)
  if (!interval) {
    return NextResponse.json({ error: "Invalid interval" }, { status: 400 })
  }

  const exit = await Effect.runPromiseExit(
    closedCalls(session.user.id, interval).pipe(
      Effect.catchTag("UserMissing", () => Effect.succeed(null)),
      Effect.tapErrorCause((cause) =>
        Effect.gen(function* () {
          yield* Effect.logError("Calls export failed", Cause.pretty(cause))
          const reporter = yield* ErrorReporter
          yield* reporter.report(cause, { route: ROUTE })
        })
      ),
      Effect.provide(ServerLive)
    )
  )

  if (Exit.isFailure(exit)) {
    return NextResponse.json({ error: "Error exporting data" }, { status: 500 })
  }
  if (exit.value === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ result: exit.value })
}

export { handler as GET, handler as POST }
