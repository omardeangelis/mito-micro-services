import * as XLSX from "xlsx"
import { api } from "@/trpc/server"
import { NextResponse, type NextRequest } from "next/server"
import { parseReadableStream } from "@/lib/utils/api"
import { authCheck } from "@/app/api/_utils/auth"

// export async function handleDefaultExport(
//   workbook: XLSX.WorkBook,
//   filePathName: string
// ) {
async function handler(req: NextRequest) {
  // console.log("Save export")
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse
  try {
    const { request } = await parseReadableStream<{
      workbook: XLSX.WorkBook
      filePath: string
    }>(req.body)
    // console.log("Save excel",)
    // console.log("request: ", request)
    // console.log("workbook: ", request.workbook)
    // console.log("filePath: ", request.filePath)

    const buffer = Buffer.from(
      XLSX.write(request.workbook, {
        bookType: "xlsx",
        type: "array",
      }) as WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>
    )
    // console.log("buffer: ", buffer)

    const filePath =
      (await api.supabase.uploadExportFile.mutate({
        buffer: buffer,
        filePathName: request.filePath,
      })) ?? null

    //   console.log("filePath salvato: ", filePath)

    return NextResponse.json({ message: "Exporting data", filePath: filePath })
  } catch (error) {
    console.error("copy error", error)
    return NextResponse.json({
      message: null,
      filePath: null,
      error: "Error exporting data",
    })
  }
}

export { handler as GET, handler as POST }
