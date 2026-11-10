import { type Role } from "@mito/contract/schemas"
import {
  daysIn,
  resolveGroup,
  type DayRange,
  type Compare,
  type Group,
  type Range,
} from "@mito/domain/analytics/window"
import { type HourWindow } from "@mito/contract/analytics"
import { useCurrentUser } from "@/api/me"
import { toast } from "sonner"
import { DASH } from "../_lib/results"
import {
  type ExportContext,
  downloadBlob,
  toWorkbook,
  writeWorkbook,
} from "../_lib/export"
import { type ChartView } from "./useAnalisi"

/** What the page says about the files its charts write (AC30) */
export type ExportPage = {
  /** The period of the page: «Oggi» names the files with one day (AC25 of andamenti-chiamate) */
  range?: Range
  /** The comparison of the page: in the query key, so it matches the data that arrived */
  compare: Compare
  /** The grouping of the page, resolved for each chart in time */
  group: Group
  /** «tutta la rete» for the admin, the operator's name otherwise (AC30) */
  dataOf: string
}

/** The toast of a download the browser refused (AC32) */
const EXCEL_FAILED = "Excel non scaricato. Riprova."

/** Whose data the files hold: the whole network for the admin, the operator's name (A3) */
export function useDataOf(role: Role | undefined): string {
  const user = useCurrentUser()
  if (role === "ADMIN") return "tutta la rete"
  const operator = user.data?.operator
  const name = [operator?.name, operator?.surname]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" ")
  return name === "" ? DASH : name
}

/** The header of a file of `view`: its window is the answer's, not the controls' (AC30) */
export function contextOf(
  view: ChartView,
  answer: {
    window: DayRange
    comparison: DayRange | null
    hours?: readonly HourWindow[] | null
    comparisonHours?: readonly HourWindow[] | null
  },
  page: ExportPage,
  extractedAt: Date
): ExportContext {
  const today = page.range === "today"
  const hours = answer.hours ?? null
  // With «Oggi» only the call series are by hour: the financed has the day alone (AC22)
  const grouped = view.inTime && (!today || hours !== null)
  return {
    window: answer.window,
    comparison: answer.comparison,
    compare: page.compare,
    group: grouped
      ? resolveGroup(page.group, daysIn(answer.window), page.range)
      : null,
    dataOf: page.dataOf,
    extractedAt,
    ...(today
      ? {
          today: {
            hours,
            comparisonHours: answer.comparisonHours ?? null,
          },
        }
      : {}),
  }
}

/**
 * Writes the sheets as one `.xlsx` and downloads it; a failure of any step
 * toasts «Excel non scaricato. Riprova.» and returns `false` (AC28, AC32)
 */
export async function downloadWorkbook(
  sheets: Parameters<typeof toWorkbook>[0],
  name: string
): Promise<boolean> {
  let done = false
  try {
    const blob = await writeWorkbook(await toWorkbook(sheets))
    done = downloadBlob(blob, name)
  } catch {
    done = false
  }
  if (!done) toast.error(EXCEL_FAILED)
  return done
}
