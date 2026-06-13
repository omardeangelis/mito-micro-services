import * as XLSX from "xlsx"

export const getHeaders = async (buffer: Buffer): Promise<unknown[]> => {
  const safeFile = new Uint8Array(buffer).buffer
  const workbookHeaders = XLSX.read(safeFile, {
    sheetRows: 2,
  })
  const columnsArray = XLSX.utils.sheet_to_json(
    workbookHeaders.Sheets[workbookHeaders.SheetNames[0]!]!,
    { header: 1 }
  )[0]

  return columnsArray as unknown[]
}
