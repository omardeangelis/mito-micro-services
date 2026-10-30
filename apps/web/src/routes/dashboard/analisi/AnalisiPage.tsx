import { useState } from "react"
import { daysIn, type Group, type Preset } from "@mito/domain/analytics/window"
import { type ChartId } from "./_lib/charts"
import { CHART_TITLES } from "./_lib/results"
import { withGroup, withPreset } from "./_lib/urlState"
import { ChartPanel } from "./_components/ChartPanel"
import { OfflineNotice } from "./_components/ChartState"
import { GroupSelect } from "./_components/GroupSelect"
import { Header } from "./_components/Header"
import { IndicatorRail } from "./_components/IndicatorRail"
import { type ExportPage, useDataOf } from "./_components/exportContext"
import { useAnalisi } from "./_components/useAnalisi"
import { useOnline } from "./_components/useOnline"

const PANEL_ID = "analisi-grafico"

/**
 * The analysis page (`/dashboard/analisi`, spec pagina-analisi): one window
 * for the whole page, in the address (AC14), and a master-detail of the
 * indicators and the chart chosen (AC2). A `chart` the role can't see opens
 * the first one it can (AC14, AC23)
 */
export function Component() {
  const { role, state, views, select, write, today } = useAnalisi()
  const dataOf = useDataOf(role)
  const online = useOnline()
  const [announcement, setAnnouncement] = useState("")

  const onSelect = (chart: ChartId) => {
    select(chart)
    setAnnouncement(`${CHART_TITLES[chart]}, grafico selezionato`)
  }

  // The action of an empty state: only the dates change, the comparison and
  // the chart stay (AC15)
  const onRange = (range: Preset) => {
    if (state !== undefined) write(withPreset(state, range, today))
  }

  const onGroup = (group: Group) => {
    if (state !== undefined) write(withGroup(state, group))
  }

  const view =
    state === undefined
      ? undefined
      : (views.find((item) => item.id === state.chart) ?? views[0])

  // What the files say about the page: the comparison and the grouping are in
  // the address and the query key, so they match the data that arrived (AC30)
  const page: ExportPage | undefined =
    state === undefined
      ? undefined
      : { compare: state.compare, group: state.group, dataOf }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        state={state}
        today={today}
        write={write}
        views={views}
        page={page}
      />
      {online ? null : <OfflineNotice />}
      {state === undefined ||
      view === undefined ||
      page === undefined ? null : (
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <IndicatorRail
            state={state}
            views={views}
            selected={view.id}
            panelId={PANEL_ID}
            onSelect={onSelect}
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-12 pt-6">
            <div className="mx-auto max-w-5xl">
              <ChartPanel
                view={view}
                panelId={PANEL_ID}
                controls={
                  view.inTime ? (
                    <GroupSelect
                      group={state.group}
                      days={daysIn(state.window)}
                      onChange={onGroup}
                    />
                  ) : null
                }
                page={page}
                onRange={onRange}
              />
            </div>
          </div>
        </div>
      )}
      {/* The change of chart, said to a screen reader (AC36) */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
