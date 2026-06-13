import { z } from "zod"
import * as XLSX from "xlsx"
import {
  parseFileName,
  parsePratica,
} from "@/app/api/import/process/_services/parsePratica"
import { isWave, parseCsv } from "@/app/api/import/_utils"
import {
  standardImportFileKeys,
  waveNotNullKeys,
} from "@/app/api/import/_constants"
import { EmptyHeadersImportError } from "@/lib/types/errors"
import { type StandardImportFile, type WaveFile } from "@/app/api/import/_types"

const fileSchema = z.instanceof(ArrayBuffer)

export async function processFile(req: File, fileName: string) {
  // const formData = await req.formData()
  const file = await req.arrayBuffer()
  const fileValue = fileSchema.safeParse(file)
  if (!fileValue.success) {
    return { error: "Missing File input", status: 400 }
    // return NextResponse.json({ error: "Missing File input" }, { status: 400 })
  }
  const safeFile = fileValue.data

  if (!fileName) {
    // return NextResponse.json({ error: "Missing File Name" }, { status: 400 })
    return { error: "Missing File Name", status: 400 }
  }
  // check file size is more than 4.4MB
  //   if (safeFile.byteLength > 4400000) {
  //     // return NextResponse.json({ error: "File too large" }, { status: 413 })
  //     return { error: "File too large", status: 413 }
  //   }
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
      console.log(parsedCsv.errors)
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

    return {
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
    }
  } else {
    if (headerArray.length < standardImportFileKeys.length) {
      const error = new EmptyHeadersImportError({
        message: "All practices have errors",
        code: "headers",
      })
      return { error }
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
      return { error }
    }
    return {
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
    }
  }
}
