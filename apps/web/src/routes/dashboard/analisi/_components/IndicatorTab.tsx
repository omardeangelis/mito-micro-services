import { type KeyboardEvent, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { type ChartId } from "../_lib/charts"
import { DASH, formatKpi } from "../_lib/results"
import { type ChartState, type ChartView } from "./useAnalisi"
import { useOnline } from "./useOnline"

/** The values of the sparkline: only the charts in time, once ready (AC2) */
function sparkValues(state: ChartState): (number | null)[] | null {
  if (state.kind !== "result" || state.result.status.kind !== "ready")
    return null
  switch (state.shape) {
    case "financed":
    case "average":
      return state.result.points.map((point) => point.current)
    case "myCalls":
      return state.result.points.map((point) => point.answered + point.noAnswer)
    case "myAppointments":
      return state.result.points.map((point) => point.rate)
    default:
      return null
  }
}

const SPARK_WIDTH = 64
const SPARK_HEIGHT = 20

/** The trend in 64×20, drawn from the chart's own points; a null is a gap */
const Sparkline = ({ values }: { values: (number | null)[] }) => {
  const known = values.filter((value): value is number => value !== null)
  if (known.length === 0) return null
  const min = Math.min(...known)
  const span = Math.max(...known) - min || 1
  const step = SPARK_WIDTH / Math.max(1, values.length - 1)
  // One polyline per run of known values, so a gap stays a gap
  const runs: string[][] = [[]]
  values.forEach((value, index) => {
    if (value === null) {
      if (runs.at(-1)?.length) runs.push([])
      return
    }
    const y = SPARK_HEIGHT - 1 - ((value - min) / span) * (SPARK_HEIGHT - 2)
    runs.at(-1)?.push(`${index * step},${y}`)
  })
  return (
    <svg
      aria-hidden="true"
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className="shrink-0 overflow-visible"
    >
      {runs
        .filter((run) => run.length > 0)
        .map((run) => (
          <polyline
            key={run[0]}
            points={run.join(" ")}
            fill="none"
            strokeWidth="1.5"
            strokeLinejoin="round"
            className="stroke-chart-1"
          />
        ))}
    </svg>
  )
}

/** The state of the chart in a word: «Vuoto», «Errore», «Solo numero», «Adesso» (AC2) */
function StateBadge({ view }: { view: ChartView }) {
  const { state } = view
  if (state.kind === "error") return <Badge tone="red">Errore</Badge>
  if (state.kind !== "result") return null
  switch (state.result.status.kind) {
    case "empty":
      return <Badge tone="neutral">Vuoto</Badge>
    case "kpiOnly":
      return <Badge tone="neutral">Solo numero</Badge>
    case "ready":
      return state.shape === "progress" ? (
        <Badge tone="amber">Adesso</Badge>
      ) : null
  }
}

/** The number with its unit: «3.725 chiamate · 57% con risposta», «9 sedi» (AC2) */
function TabNumber({
  state,
  offline,
}: {
  state: ChartState
  offline: boolean
}) {
  if (state.kind === "loading")
    // A span: a button holds only phrasing content, so not the `Skeleton`
    // component, whose look it has. A tab loading shows no number (AC24)
    return (
      <span
        data-slot="skeleton"
        aria-hidden="true"
        className={cn(
          "inline-block h-5 w-24 animate-pulse rounded-sm bg-muted motion-reduce:animate-none",
          // Offline nothing is on its way: the pulse stops (AC22)
          offline ? "animate-none" : null
        )}
      />
    )
  if (state.kind !== "result")
    return <span className="font-heading text-muted-foreground">{DASH}</span>
  const { kpi } = state.result
  // Up to three lines next to the sparkline: the longest, the rate of an
  // operator («10,7% 123 appuntamenti su 1.150 risposte», AC18), takes three
  return (
    <span className="line-clamp-3 min-w-0 leading-5">
      <span className="font-heading tabular-nums">{formatKpi(kpi)}</span>{" "}
      <span className="text-xs text-muted-foreground">{kpi.caption}</span>
    </span>
  )
}

/**
 * A tab of the indicators (AC2, AC36): title and state badge on a line of
 * fixed height, so every tab is as tall as the others with or without a badge
 * and the titles align (AC39, AC41); the number and, for a chart in time, the
 * sparkline. The selected one has a bar of 3 px on `primary` at its start, at
 * more than 3:1 on `primary-soft` (AC37)
 */
export function IndicatorTab({
  view,
  selected,
  panelId,
  register,
  onSelect,
  onKeyDown,
}: {
  view: ChartView
  selected: boolean
  panelId: string
  /** Tells the rail which element is the tab of a chart (null: it left) */
  register: (id: ChartId, element: HTMLButtonElement | null) => void
  onSelect: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const spark = sparkValues(view.state)
  const online = useOnline()
  const { id } = view
  const ref = useCallback(
    (element: HTMLButtonElement | null) => register(id, element),
    [register, id]
  )
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={tabIdOf(view.id)}
      aria-selected={selected}
      aria-controls={selected ? panelId : undefined}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "relative w-56 shrink-0 rounded-lg border p-3 text-left xl:w-full",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "border-primary-soft-border bg-primary-soft"
          : "border-border hover:bg-accent"
      )}
    >
      {selected ? (
        <span
          aria-hidden="true"
          className="w-0.75 absolute inset-y-2 start-0 rounded-full bg-primary"
        />
      ) : null}
      <span className="min-h-5.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-xs",
            selected ? "text-primary-soft-foreground" : "text-muted-foreground"
          )}
        >
          {view.title}
        </span>
        <StateBadge view={view} />
      </span>
      {/* Three lines reserved for every tab, so none is taller than another (AC41) */}
      <span className="min-h-15 mt-1.5 flex items-start justify-between gap-2">
        <TabNumber state={view.state} offline={!online} />
        {spark === null ? null : <Sparkline values={spark} />}
      </span>
    </button>
  )
}

/** The id of the tab of a chart */
const tabIdOf = (id: string) => `analisi-tab-${id}`
