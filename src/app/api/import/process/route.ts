import { NextResponse, type NextRequest } from "next/server"
import * as XLSX from "xlsx"
import { z } from "zod"
import { type StandardImportFile, type WaveFile } from "../_types"
import { isWave, parseCsv } from "../_utils"
import { parseFileName, parsePratica } from "./_services/parsePratica"
import { EmptyHeadersImportError } from "@/lib/types/errors"
import { standardImportFileKeys, waveNotNullKeys } from "../_constants"
import { authCheck } from "../../_utils/auth"

const fileSchema = z.instanceof(ArrayBuffer)
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function handler(req: NextRequest) {
  // const formData = await req.formData()
  // auth check
  const authResponse = await authCheck()
  if (authResponse) return authResponse

  const file = await req.arrayBuffer()
  const fileValue = fileSchema.safeParse(file)
  if (!fileValue.success) {
    return NextResponse.json({ error: "Missing File input" }, { status: 400 })
  }
  const safeFile = fileValue.data
  const { searchParams } = new URL(req.url)
  let fileName = searchParams.get("name")
  if (!fileName) {
    return NextResponse.json({ error: "Missing File Name" }, { status: 400 })
  }
  // check file size is more than 4.4MB
  if (safeFile.byteLength > 4400000) {
    return NextResponse.json({ error: "File too large" }, { status: 413 })
  }
  fileName = parseFileName(fileName)
  const workbookHeaders = XLSX.read(safeFile, {
    sheetRows: 1,
  })
  const columnsArray = XLSX.utils.sheet_to_json(
    workbookHeaders.Sheets[workbookHeaders.SheetNames[0]!]!,
    { header: 1 }
  )[0] as string[]

  const parsed = XLSX.read(safeFile, { type: "array" })
  const workSheet = parsed.Sheets[parsed.SheetNames[0]!]

  const csv = XLSX.utils.sheet_to_csv(workSheet!)
  const headerArray = columnsArray.filter((key) => key)

  if (isWave(columnsArray as unknown[])) {
    if (headerArray.length < waveNotNullKeys.length) {
      throw new EmptyHeadersImportError({
        message: "Empty headers array",
        code: "headers",
      })
    }
    const parsedCsv = parseCsv<WaveFile>(csv)
    if (parsedCsv.errors.length) {
      throw new Error("Error parsing file")
    }

    const {
      customerToCreate,
      customerToPraticaToCreate,
      practicesToCreate,
      practicesWithErrors,
    } = parsePratica<WaveFile>(parsedCsv, fileName)

    if (parsedCsv.data.length === practicesWithErrors.length) {
      throw new EmptyHeadersImportError({
        message: "All practices have errors",
        code: "all",
      })
    }

    return NextResponse.json({
      message: "Wave uploaded successfully",
      created: {
        customerToCreate,
        customerToPraticaToCreate,
        practicesToCreate,
      },
      errors: {
        practicesWithErrors,
      },
      headers: columnsArray,
    })
  } else {
    if (headerArray.length < standardImportFileKeys.length) {
      const error = new EmptyHeadersImportError({
        message: "All practices have errors",
        code: "headers",
      })

      return NextResponse.json(
        {
          error,
        },
        { status: 400 }
      )
    }
    const parsedCsv = parseCsv<StandardImportFile>(csv)
    if (parsedCsv.errors.length) {
      throw new Error("Error parsing the file")
    }

    const {
      customerToCreate,
      customerToPraticaToCreate,
      practicesToCreate,
      practicesWithErrors,
    } = parsePratica<StandardImportFile>(parsedCsv, fileName)

    if (parsedCsv.data.length === practicesWithErrors.length) {
      const error = new EmptyHeadersImportError({
        message: "All practices have errors",
        code: "all",
      })

      return NextResponse.json(
        {
          error,
        },
        { status: 400 }
      )
    }
    return NextResponse.json({
      message: "File uploaded successfully",
      created: {
        customerToCreate,
        customerToPraticaToCreate,
        practicesToCreate,
      },
      errors: {
        practicesWithErrors,
      },
      headers: columnsArray,
    })
  }
}

export { handler as POST }
