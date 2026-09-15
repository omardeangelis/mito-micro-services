import * as XLSX from "xlsx"
import { api } from "@/trpc/server"
import {
  type StandardImportFile,
  type WaveFile,
  type PracticeWithError,
} from "../../import/_types"
import { isWaveRow } from "../../import/_utils"
import {
  formatFileNameDate,
  getStandardRowData,
  getWaveRowData,
} from "../utils"
import { NextResponse, type NextRequest } from "next/server"
import { parseReadableStream } from "@/lib/utils/api"
import { authCheck } from "../../_utils/auth"

async function handler(req: NextRequest) {
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  console.log("Exporting data")
  const { request } = await parseReadableStream<{
    practicesWithErrors: PracticeWithError<StandardImportFile | WaveFile>[]
    columnsArray: string[]
  }>(req.body)
  try {
    const filePathName = formatFileNameDate(`error-import`)
    const workbook = XLSX.utils.book_new()
    const headers = ["Errori", ...request.columnsArray]
    const importErrorsData = [headers]
    for (const practice of request.practicesWithErrors) {
      if (isWaveRow(practice[1])) {
        const waveError = practice[1] as WaveFile
        const waveErrorMessages = practice[2]
        const rowData = getWaveRowData(waveError, waveErrorMessages)
        importErrorsData.push(rowData)
      } else {
        const standardError = practice[1] as StandardImportFile
        const standardErrorMessages = practice[2]
        const rowData = getStandardRowData(standardError, standardErrorMessages)
        importErrorsData.push(rowData)
      }
    }

    const callSheet = XLSX.utils.aoa_to_sheet(importErrorsData)

    XLSX.utils.book_append_sheet(workbook, callSheet, "Errori import")

    const buffer = Buffer.from(
      XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      }) as WithImplicitCoercion<ArrayBuffer | SharedArrayBuffer>
    )

    await api.supabase.uploadExportFile.mutate({
      buffer: buffer,
      filePathName: filePathName,
    })

    return NextResponse.json({
      message: "Exporting data",
      filePath: filePathName,
    })
  } catch (error) {
    console.error("copy error", error)
    return NextResponse.json(
      {
        error: "Error exporting data",
        filePath: null,
      },
      { status: 500 }
    )
  }
}

export { handler as GET, handler as POST }
