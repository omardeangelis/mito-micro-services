import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { cleanupTaskEventLog } from "@/server/services/cron/cleanupTaskEventLog"
import { authCheck } from "../../_utils/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  try {
    const deletedCount = await cleanupTaskEventLog(new Date())

    return NextResponse.json({
      message: "Cron job ran",
      deletedCount,
    })
  } catch (error) {
    console.error("Error cleaning up task_event_log", error)
    Sentry.captureException(error)
    return NextResponse.json({
      message: "Error cleaning up task_event_log",
      error: "Error cleaning up task_event_log",
    })
  }
}

// Path: src/app/api/cron.ts
