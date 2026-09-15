import { NextResponse } from "next/server"
import { loadEnv } from "@/lib/global/env"
import { lt } from "drizzle-orm"
import { subMonths } from "date-fns"
import { db } from "@/server/db"
import { taskEventLog } from "@/server/db/schema/taskEventLog"
import { authCheck } from "../../_utils/auth"

loadEnv()

export const dynamic = "force-dynamic"
export const maxDuration = 60

const RETENTION_MONTHS = 3

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  try {
    const cutoff = subMonths(new Date(), RETENTION_MONTHS)

    const deleted = await db
      .delete(taskEventLog)
      .where(lt(taskEventLog.createdAt, cutoff))
      .returning({ id: taskEventLog.id })

    return NextResponse.json({
      message: "Cron job ran",
      deletedCount: deleted.length,
    })
  } catch (error) {
    console.error("Error cleaning up task_event_log", error)
    return NextResponse.json({
      message: "Error cleaning up task_event_log",
      error: "Error cleaning up task_event_log",
    })
  }
}

// Path: src/app/api/cron.ts
