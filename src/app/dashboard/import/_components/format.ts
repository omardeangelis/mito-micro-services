import { type RouterOutputs } from "@/trpc/shared"

// How the "Import" page writes an import: Italian (AC40), Rome's clock

export type ImportSummary = RouterOutputs["import"]["list"]["imports"][number]

export const statusLabels = {
  running: "In corso",
  completed: "Completato",
  failed: "Fallito",
  interrupted: "Interrotto",
} as const satisfies Record<ImportSummary["status"], string>

export const formatLabels = {
  wave: "Wave",
  standard: "Standard",
} as const satisfies Record<ImportSummary["format"], string>

const romeTime = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/** "25/10/2026, 10:05", in Rome. */
export const startedAt = (date: Date) => romeTime.format(date)

/** "2 min 5 s", "45 s"; "—" while it runs or when it never ended. */
export function duration(ms: number | null) {
  if (ms === null) return "—"
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

const integer = new Intl.NumberFormat("it-IT")

/** A number of the summary; "—" when the import wrote nothing. */
export const count = (value: number | null) =>
  value === null ? "—" : integer.format(value)

/** The notice of an import's end, in any page (AC21): the counts, or why not. */
export function endingNotice(run: ImportSummary) {
  switch (run.status) {
    case "running":
      return null
    case "completed":
      return {
        title: "Import completato",
        description: `${run.fileName}: ${count(run.customersCreated)} clienti nuovi e ${count(run.customersUpdated)} aggiornati, ${count(run.practicesCreated)} pratiche nuove e ${count(run.practicesUpdated)} aggiornate, ${count(run.linksCreated)} legami nuovi`,
        variant: "success" as const,
      }
    case "failed":
    case "interrupted":
      return {
        title: `Import ${statusLabels[run.status].toLowerCase()}`,
        description: `${run.fileName}: ${run.failureReason ?? "nessun dato è stato scritto"}`,
        variant: "destructive" as const,
      }
  }
}
