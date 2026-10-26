import { type DetectedFormat } from "@mito/domain/import/formats"
import { MAX_ROWS } from "@mito/domain/import/payload"

// What the admin reads when a file can't be imported (AC5, AC6), in Italian
// (AC40)

/** The files the import reads, by extension (AC5). */
export const IMPORT_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const
/** The biggest file the import reads (AC5, OQ4). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024

export const fileMessages = {
  notSupported: "Formato non supportato: carica un file Excel o CSV",
  tooBig: "Il file supera i 15 MB",
  emptyHeaders: "Le intestazioni devono essere nella prima riga",
  tooManyRows: `Il file ha più di ${MAX_ROWS.toLocaleString("it-IT")} righe`,
  unreadable: "Il file non si legge: controlla che sia un file Excel o CSV",
} as const

/**
 * Why a file can't be imported, from its name and size alone, or null: a file
 * that fails here is never read (AC5). The extension decides, because browsers
 * give a CSV different types (on Windows, the one of Excel).
 */
export function fileProblem(file: { name: string; size: number }) {
  const name = file.name.toLowerCase()
  if (!IMPORT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return fileMessages.notSupported
  }
  if (file.size > MAX_FILE_BYTES) return fileMessages.tooBig
  return null
}

const formatNames = { wave: "Wave", standard: "Standard" } as const

/** The message of a first row that is neither Wave nor Standard (AC6). */
export function formatProblem(
  detected: Extract<DetectedFormat, { error: unknown }>
) {
  if (detected.error === "emptyHeaders") return fileMessages.emptyHeaders
  const [only, ...others] = detected.missing
  const format = `Formato ${formatNames[detected.closest]}`
  return others.length === 0
    ? `${format}: manca la colonna ${only}`
    : `${format}: mancano le colonne ${detected.missing.join(", ")}`
}
