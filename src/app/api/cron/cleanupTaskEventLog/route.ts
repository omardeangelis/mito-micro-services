import * as Sentry from "@sentry/nextjs"
import { Cause, Effect, Exit } from "effect"
import { NextResponse } from "next/server"
import { DbLive } from "@/server/effect/db"
import { cleanupTaskEventLog } from "@/server/services/cron/cleanupTaskEventLog"
import { authCheck } from "../../_utils/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  const exit = await Effect.runPromiseExit(
    cleanupTaskEventLog(new Date()).pipe(Effect.provide(DbLive))
  )

  if (Exit.isFailure(exit)) {
    // The DbError: its cause is the driver's error, without the query's data
    const error = Cause.squash(exit.cause)
    console.error("Error cleaning up task_event_log", error)
    Sentry.captureException(error)
    return NextResponse.json({
      message: "Error cleaning up task_event_log",
      error: "Error cleaning up task_event_log",
    })
  }

  return NextResponse.json({
    message: "Cron job ran",
    deletedCount: exit.value,
  })
}

// Path: src/app/api/cron.ts
