import { type Role } from "@mito/contract/schemas"
import {
  daysIn,
  resolveGroup,
  type DayRange,
  type Compare,
  type Group,
} from "@mito/domain/analytics/window"
import { useCurrentUser } from "@/api/me"
import { toast } from "@/components/ui/use-toast"
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
  answer: { window: DayRange; comparison: DayRange | null },
  page: ExportPage,
  extractedAt: Date
): ExportContext {
  return {
    window: answer.window,
    comparison: answer.comparison,
    compare: page.compare,
    group: view.inTime ? resolveGroup(page.group, daysIn(answer.window)) : null,
    dataOf: page.dataOf,
    extractedAt,
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
  if (!done) toast({ title: EXCEL_FAILED, variant: "destructive" })
  return done
}
