import * as Sentry from "@sentry/nextjs"
import { Cause, Effect, Exit } from "effect"
import { NextResponse } from "next/server"
import { DbLive } from "@/server/effect/db"
import { updateCustomerAge } from "@/server/services/cron/updateCustomerAge"
import { updatePractices } from "@/server/services/cron/updatePractices"
import { format } from "date-fns"
import { authCheck } from "../../_utils/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  const today = new Date()
  const todayFormatted = format(today, "yyyy-MM-dd")
  const todayMonth = today.getMonth() + 1
  const todayDay = today.getDate()

  // In order: a failure of the practices stops the job before the ages
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      yield* updatePractices(todayFormatted)
      yield* updateCustomerAge(todayMonth, todayDay)
    }).pipe(Effect.provide(DbLive))
  )

  if (Exit.isFailure(exit)) {
    // The DbError: its cause is the driver's error, without the query's data
    const error = Cause.squash(exit.cause)
    console.error("Error deleting export files", error)
    Sentry.captureException(error)
    return NextResponse.json({
      message: "Error exporting data",
      filePath: null,
      error: "Error exporting data",
    })
  }

  return NextResponse.json({ message: "Cron job ran" })
}

// Path: src/app/api/cron.ts
