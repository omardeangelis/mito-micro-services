import { z } from "zod"
import { type Cells } from "./classify"
import { type ImportFormat } from "./formats"

// What the browser sends for an import (D3, D10): the keys to look up in the
// CRM, the rows of the file in a compact form, the rows it expects to write.
// The server parses them with these schemas, the browser builds them with the
// functions below.

/** Rows of a file the import takes: 2.5 times the biggest real file (OQ4). */
export const MAX_ROWS = 50_000
/** Columns of a file: the layouts have 27 and 50, the rest is ignored. */
export const MAX_COLUMNS = 500
/** Characters of a cell, Excel's limit. */
export const MAX_CELL_LENGTH = 32_767
/**
 * The compressed body travels in parts of at most this many bytes (D3): 2 MB
 * once in base64, one request each.
 */
export const UPLOAD_PART_BYTES = 1_500_000
/** At most this many parts: 30 MB of compressed body. */
export const MAX_UPLOAD_PARTS = 20
/** The body once decompressed: `MAX_ROWS` rows of the layouts fit in it. */
export const MAX_BODY_BYTES = 64 * 1024 * 1024
/** Imports per page of the "Import" page (AC28), on the server and the page. */
export const HISTORY_PAGE_SIZE = 20
/** The longest code the CRM stores. */
const MAX_KEY_LENGTH = 255
/** Rows of a sheet in Excel: the headers are row 1, the first row is 2. */
const LAST_ROW = 1_048_576

const keys = z.array(z.string().min(1).max(MAX_KEY_LENGTH)).max(MAX_ROWS)

/** The codes of the file's customers and practices (`import.lookup`). */
export const lookupKeysSchema = z.object({
  fiscalCodes: keys,
  vatCodes: keys,
  customerCodes: keys,
  praticaIds: keys,
})
export type LookupKeys = z.infer<typeof lookupKeysSchema>

const rowNumber = z.number().int().min(2).max(LAST_ROW)

/** A cell as papaparse gives it. */
type Cell = string | number | boolean | null
const isCell = (value: unknown): value is Cell =>
  value === null ||
  typeof value === "boolean" ||
  (typeof value === "number" && !Number.isNaN(value)) ||
  (typeof value === "string" && value.length <= MAX_CELL_LENGTH)

// The cells are checked in the loop of the refinement, not by a schema each: a
// file has up to a million, and zod spends a second on them (T13)
const rowCells = z.custom<Cell[]>(Array.isArray)

/** The rows of the file, once: the columns, then each row's number and cells. */
export const fileBodySchema = z
  .object({
    columns: z.array(z.string().max(MAX_CELL_LENGTH)).min(1).max(MAX_COLUMNS),
    rows: z.array(z.tuple([rowNumber, rowCells])).max(MAX_ROWS),
  })
  .superRefine(({ columns, rows }, ctx) => {
    if (new Set(columns).size !== columns.length) {
      ctx.addIssue({
        code: "custom",
        path: ["columns"],
        message: "Le colonne si ripetono",
      })
    }
    rows.forEach(([row, cells], index) => {
      if (cells.length !== columns.length) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index],
          message: "La riga non ha una cella per colonna",
        })
      } else if (!cells.every(isCell)) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index],
          message: "Una cella non è un testo, un numero o un sì/no",
        })
      }
      const previous = rows[index - 1]
      if (previous && previous[0] >= row) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index],
          message: "I numeri delle righe devono crescere",
        })
      }
    })
  })
export type FileBody = z.infer<typeof fileBodySchema>

/** The rows the preview gave as importable or customer only (D10). */
export const expectedRowsSchema = z.object({
  rows: z.array(rowNumber).max(MAX_ROWS),
})
export type ExpectedRows = z.infer<typeof expectedRowsSchema>

/** The confirmation (`import.start`): the upload and the rows expected. */
export const startImportSchema = expectedRowsSchema.extend({
  uploadId: z.string().uuid(),
})
export type StartImport = z.infer<typeof startImportSchema>

export const importFormatSchema = z.enum([
  "wave",
  "standard",
]) satisfies z.ZodType<ImportFormat>

const part = z
  .string()
  .min(1)
  .max((UPLOAD_PART_BYTES / 3) * 4)
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    "Il pezzo del file non è in base64"
  )

/**
 * A part of the compressed body, in base64 (`import.upload`). The first one
 * says what the upload is and creates it; the others name it by its id.
 */
export const uploadPartSchema = z.union([
  z.object({
    uploadId: z.string().uuid(),
    part: z
      .number()
      .int()
      .min(1)
      .max(MAX_UPLOAD_PARTS - 1),
    data: part,
  }),
  z.object({
    fileName: z.string().min(1).max(255),
    format: importFormatSchema,
    parts: z.number().int().min(1).max(MAX_UPLOAD_PARTS),
    data: part,
  }),
])
export type UploadPart = z.infer<typeof uploadPartSchema>

/** The compact body of the rows; a cell papaparse left out is null. */
export function toFileBody(
  columns: readonly string[],
  rows: readonly { row: number; cells: Cells }[]
): FileBody {
  return {
    columns: [...columns],
    rows: rows.map(({ row, cells }) => [
      row,
      columns.map((column) => (cells[column] ?? null) as Cell),
    ]),
  }
}

/** The rows of a body, as papaparse gave them. */
export function fromFileBody({ columns, rows }: FileBody) {
  return rows.map(([row, cells]) => ({
    row,
    cells: Object.fromEntries(
      columns.map((column, index) => [column, cells[index] ?? null])
    ) as Cells,
  }))
}
