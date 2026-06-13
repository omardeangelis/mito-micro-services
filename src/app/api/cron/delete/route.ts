import { NextResponse } from "next/server"
import { loadEnv } from "@/lib/global/env"
import { createClient } from "@supabase/supabase-js"
import { authCheck } from "../../_utils/auth"

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_KEY!

const supabaseClient = createClient(supabaseUrl, supabaseKey)

export const dynamic = "force-dynamic"
export const maxDuration = 60

const BUCKET_NAME = "mito-storage"
const EXPORT_PATH = "export"

export async function GET(request: Request) {
  // auth check
  const authResponse = await authCheck(request)
  if (authResponse) return authResponse

  try {
    const { data: files, error: listError } = await supabaseClient.storage
      .from(BUCKET_NAME)
      .list(EXPORT_PATH, { limit: 1000 })

    if (listError) {
      throw listError
    }

    if (!files || files.length === 0) {
      console.log(`No files found in the ${EXPORT_PATH} folder.`)
    } else {
      // Delete each file in the "export" folder
      for (const file of files) {
        const { error: deleteError } = await supabaseClient.storage
          .from(BUCKET_NAME)
          .remove([`${EXPORT_PATH}/${file.name}`])

        if (deleteError) {
          console.error(
            `Error deleting file ${EXPORT_PATH}/${file.name}:`,
            deleteError.message
          )
        } else {
          console.log(`File ${EXPORT_PATH}/${file.name} deleted successfully.`)
        }
      }
    }
    console.log(`All files in the ${EXPORT_PATH} folder have been deleted.`)

    return NextResponse.json({
      message: "Cron job ran and cleaned the export folder",
    })
  } catch (error) {
    console.error(`Error cleaning up the export folder:`, error)
    return NextResponse.json({
      message: "Error exporting data",
      filePath: null,
      error: "Error exporting data",
    })
  }
}

// Path: src/app/api/cron.ts
