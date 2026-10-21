import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { deleteExportFiles } from "@mito/server/services/cron/deleteExport"
import { authCheck } from "../../_utils/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  try {
    await deleteExportFiles()

    return NextResponse.json({
      message: "Cron job ran and cleaned the export folder",
    })
  } catch (error) {
    console.error(`Error cleaning up the export folder:`, error)
    Sentry.captureException(error)
    return NextResponse.json({
      message: "Error exporting data",
      filePath: null,
      error: "Error exporting data",
    })
  }
}

// Path: src/app/api/cron.ts
