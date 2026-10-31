import { useState } from "react"
import { type DayRange } from "@mito/domain/analytics/window"
import {
  type PageState,
  withCompare,
  withCustom,
  withPreset,
} from "../_lib/urlState"
import { CompareSelect } from "./CompareSelect"
import { ExportAllButton } from "./ExportAllButton"
import { type ExportPage } from "./exportContext"
import { PeriodSelect } from "./PeriodSelect"
import { RangePicker } from "./RangePicker"
import { type ChartView } from "./useAnalisi"

/**
 * The header of the page (AC2, AC9, AC10, AC33): the title, the window of the
 * data (the menu of the periods, the calendar) with its comparison, and
 * «Esporta tutto». It wraps instead of scrolling sideways, from 280 px
 */
export function Header({
  state,
  today,
  write,
  views,
  page,
}: {
  state: PageState | undefined
  today: string
  write: (state: PageState) => void
  views: ChartView[]
  page: ExportPage | undefined
}) {
  const [calendar, setCalendar] = useState(false)
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 py-3">
      <h1 className="font-heading text-title mr-auto">Analisi</h1>
      {state === undefined ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <PeriodSelect
            range={state.range}
            onPreset={(preset) => write(withPreset(state, preset, today))}
            onCustom={() => setCalendar(true)}
          />
          <RangePicker
            window={state.window}
            today={today}
            custom={state.range === "custom"}
            open={calendar}
            onOpenChange={setCalendar}
            onApply={(window: DayRange) => write(withCustom(state, window))}
          />
          <CompareSelect
            compare={state.compare}
            onChange={(compare) => write(withCompare(state, compare))}
          />
        </div>
      )}
      {state === undefined || page === undefined ? null : (
        <ExportAllButton views={views} page={page} fallback={state.window} />
      )}
    </header>
  )
}
