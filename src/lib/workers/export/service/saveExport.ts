import * as XLSX from "xlsx"

/**
 * Uploads the export to the signed URL the server made for it
 * (`supabase.createExportUploadUrl`), with the content type it was signed
 * for. The browser never holds a storage key.
 */
export const saveExport = async (
  upload: { url: string; contentType: string },
  workbook: XLSX.WorkBook
): Promise<{ error: Error | null }> => {
  const body = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  }) as ArrayBuffer

  try {
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: { "Content-Type": upload.contentType },
      body,
    })
    return response.ok
      ? { error: null }
      : { error: new Error(`Upload failed with status ${response.status}`) }
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }
}
