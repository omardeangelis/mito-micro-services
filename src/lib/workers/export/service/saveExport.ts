import { createClient } from "@supabase/supabase-js"
import { type WithImplicitCoercion } from "buffer"
import * as XLSX from "xlsx"

//instance supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
const BUCKET_NAME = "mito-storage"
const EXPORT_PATH = "export"

export const saveExport = async (filePath: string, workbook: XLSX.WorkBook) => {
  const buffer = Buffer.from(
    XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    }) as WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>
  )

  const supabaseClient = createClient(supabaseUrl, supabaseKey)

  const bucket = supabaseClient.storage.from(BUCKET_NAME)

  const sbResult = await bucket.upload(`/${EXPORT_PATH}/${filePath}`, buffer, {
    upsert: true,
  })

  return sbResult
}
