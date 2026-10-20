import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Made at the first run, not on import: the backend imports every job when it
// starts, and createClient throws without the URL
let client: SupabaseClient | undefined
const supabase = () =>
  (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  ))

const BUCKET_NAME = "mito-storage"
const EXPORT_PATH = "export"

/**
 * The `delete` cron: deletes the files of the export folder, one by one. A
 * file it can't delete is logged and the others go on; a failure to list the
 * folder is thrown. Returns how many it deleted and how many it couldn't.
 */
export async function deleteExportFiles(): Promise<{
  deleted: number
  failed: number
}> {
  const { data: files, error: listError } = await supabase()
    .storage.from(BUCKET_NAME)
    .list(EXPORT_PATH, { limit: 1000 })

  if (listError) {
    throw listError
  }

  let deleted = 0
  let failed = 0
  if (!files || files.length === 0) {
    console.log(`No files found in the ${EXPORT_PATH} folder.`)
  } else {
    // Delete each file in the "export" folder
    for (const file of files) {
      const { error: deleteError } = await supabase()
        .storage.from(BUCKET_NAME)
        .remove([`${EXPORT_PATH}/${file.name}`])

      if (deleteError) {
        failed++
        console.error(
          `Error deleting file ${EXPORT_PATH}/${file.name}:`,
          deleteError.message
        )
      } else {
        deleted++
        console.log(`File ${EXPORT_PATH}/${file.name} deleted successfully.`)
      }
    }
  }
  console.log(`All files in the ${EXPORT_PATH} folder have been deleted.`)
  return { deleted, failed }
}
