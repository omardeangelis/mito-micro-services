import { ClockIcon } from "lucide-react"
import { type ReactNode, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { type Preset } from "@mito/domain/analytics/window"
import { formatDelta, formatKpi } from "../_lib/results"
import { ChartLegend, DrawnChart } from "./charts/DrawnChart"
import { ChartSkeleton, ErrorBox, SessionBox, StatusBox } from "./ChartState"
import { DataSection } from "./DataSection"
import { type ExportPage } from "./exportContext"
import { PanelBoundary } from "./PanelBoundary"
import { useOnline } from "./useOnline"
import { type ChartView, type Drawn } from "./useAnalisi"

/**
 * «Adesso» (AC7, AC41): a button that opens its tooltip on a click as well as
 * on hover and focus; Escape, blur and leaving close it
 */
function NowBadge() {
  const [open, setOpen] = useState(false)
  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Adesso: non segue la finestra"
            // The trigger closes on a click: here a click opens it
            onClick={(event) => {
              event.preventDefault()
              setOpen(true)
            }}
            className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Badge tone="amber">
              <ClockIcon aria-hidden="true" />
              Adesso
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">
          Fotografia della coda di adesso: non segue la finestra di dati.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * The number and its variation on the comparison (AC2, AC12): two lines, as
 * tall as the skeleton (AC19). Why a variation is «—» is with the notes
 */
function KpiLine({ drawn }: { drawn: Drawn }) {
  const { kpi } = drawn.result
  const delta = kpi.delta
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-heading text-2xl tabular-nums">
          {formatKpi(kpi)}
        </span>
        {delta === null ? null : (
          <span className="text-sm tabular-nums">{formatDelta(delta)}</span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{kpi.caption}</p>
    </div>
  )
}

/**
 * The chart chosen (AC2): a `section` with the role of the tab panel, named
 * by the title of the chart, never a second `main` (AC41). Title, question,
 * whose numbers they are (AC6), the number line, the chart and its notes, or
 * the state that takes their place (AC19, AC20, AC23). The title takes the
 * focus by script after «Riprova» and an action of an empty state (AC42);
 * `onRange` widens the window of the page. `controls` are in the heading row:
 * «Raggruppa per» of a chart in time (AC13). `page` is what its files say
 * about the page (AC30)
 */
export function ChartPanel({
  view,
  panelId,
  controls,
  page,
  onRange,
}: {
  view: ChartView
  panelId: string
  controls?: ReactNode
  page: ExportPage
  onRange: (range: Preset) => void
}) {
  const titleId = `${panelId}-title`
  const titleRef = useRef<HTMLHeadingElement>(null)
  const online = useOnline()
  const { state } = view
  // The height of the skeleton and of the box of the chart and its notes: a
  // ranking draws at most 8 bars, so it fits too (AC19)
  const height = view.id === "progress" ? "h-72" : "h-80"

  // The title stays mounted while the box under it changes, so the focus
  // can go there before the button that was clicked is gone
  const focusTitle = () => titleRef.current?.focus()
  const retry = (run: () => void) => () => {
    run()
    focusTitle()
  }

  const body = () => {
    switch (state.kind) {
      case "loading":
        return <ChartSkeleton heightClass={height} offline={!online} />
      case "error":
        return <ErrorBox onRetry={retry(state.retry)} />
      case "session":
        return <SessionBox />
      case "result": {
        // Under the chart, inside its box with the legend: the chart gives
        // them its height, so nothing below moves when they arrive (AC19)
        const { delta } = state.result.kpi
        const notes =
          delta?.kind === "none"
            ? [delta.note, ...state.result.notes]
            : state.result.notes
        const noteList =
          notes.length > 0 ? (
            <ul className="mt-3 shrink-0 space-y-1">
              {notes.map((note) => (
                <li key={note} className="text-xs text-muted-foreground">
                  {note}
                </li>
              ))}
            </ul>
          ) : null
        return (
          <>
            <div className="mt-6">
              <KpiLine drawn={state} />
            </div>
            <div
              data-slot="chart-area"
              className={cn("mt-4 flex flex-col", height)}
            >
              {state.result.status.kind === "ready" ? (
                // A drawing that throws leaves the error box alone, with no
                // legend or notes about bars it didn't draw (D10)
                <PanelBoundary
                  resetKey={state.result}
                  fallback={(reset) => (
                    <ErrorBox onRetry={retry(reset)} className="h-full" />
                  )}
                >
                  {/* On top, inside the box: narrow, it wraps on the chart's
                      height and not on the number's row (AC19) */}
                  <div className="mb-3 flex shrink-0 justify-end empty:hidden">
                    <ChartLegend drawn={state} />
                  </div>
                  <div className="min-h-0 flex-1">
                    <DrawnChart drawn={state} />
                  </div>
                  {noteList}
                </PanelBoundary>
              ) : (
                <>
                  <div className="min-h-0 flex-1">
                    <StatusBox
                      status={state.result.status}
                      onAction={(action) => {
                        onRange(action.range)
                        focusTitle()
                      }}
                    />
                  </div>
                  {noteList}
                </>
              )}
            </div>
          </>
        )
      }
    }
  }

  return (
    <section role="tabpanel" id={panelId} aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="font-heading text-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {view.title}
            </h2>
            {view.id === "progress" ? <NowBadge /> : null}
          </div>
          {/* The question is known without data: its line is there while loading */}
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {view.question}
          </p>
        </div>
        {controls}
      </div>
      {view.scope === null ? null : (
        <p className="mt-3 text-xs font-medium text-muted-foreground">
          {view.scope}
        </p>
      )}
      {body()}
      {/* Always there, with the reason when the chart has no table (AC2, AC31) */}
      <DataSection view={view} page={page} />
    </section>
  )
}
