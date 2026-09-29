import { NextResponse } from "next/server"
import { Cause, Effect, Exit } from "effect"
import { loadEnv } from "@/lib/global/env"
import { ErrorReporter } from "@/server/effect/errorReporter"
import { ServerLive } from "@/server/effect/server"
import { processDueAlerts } from "@/server/services/contact/processDueAlerts"
import { authCheck } from "../../_utils/auth"

loadEnv()

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Takes no new alert after 40 s, so the call ends within maxDuration:
// alert.js calls again for the ones left
const BUDGET_MS = 40_000

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  const exit = await Effect.runPromiseExit(
    processDueAlerts(new Date(), { budgetMs: BUDGET_MS }).pipe(
      Effect.tap(({ found, failed }) =>
        failed > 0
          ? Effect.logError("Alert cron: some alerts failed").pipe(
              Effect.annotateLogs({ found, failed })
            )
          : Effect.void
      ),
      // The response is a 200 either way: report here, or nobody will
      Effect.tapErrorCause((cause) =>
        Effect.gen(function* () {
          yield* Effect.logError("Alert cron failed", Cause.pretty(cause))
          const reporter = yield* ErrorReporter
          yield* reporter.report(cause, { route: "/api/cron/alert" })
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
  if (exit.value.found === 0) {
    return NextResponse.json({ message: "No alerts to process" })
  }
  return NextResponse.json({ message: "Cron job ran", ...exit.value })
}
