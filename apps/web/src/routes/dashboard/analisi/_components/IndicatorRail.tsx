import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react"
import { type ChartId } from "../_lib/charts"
import { type PageState } from "../_lib/urlState"
import { IndicatorTab } from "./IndicatorTab"
import { WindowSummary } from "./WindowSummary"
import { type ChartView } from "./useAnalisi"

/**
 * The width from which the indicators are a column (AC38): Tailwind's `xl`,
 * in rem like the `xl:` classes that lay it out, so with a larger default
 * font in the browser the keys and `aria-orientation` follow the layout
 */
const COLUMN_QUERY = "(min-width: 80rem)"

let columnList:
  { source: typeof window.matchMedia; list: MediaQueryList } | undefined

/**
 * The list of `COLUMN_QUERY`, made once per `matchMedia` (the same list must
 * be subscribed and unsubscribed); none where `matchMedia` is missing (jsdom)
 */
function columnMedia(): MediaQueryList | undefined {
  if (typeof window.matchMedia !== "function") return undefined
  // Compared as a value, never called apart from `window`
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const source = window.matchMedia
  if (columnList?.source !== source)
    columnList = {
      source,
      list: window.matchMedia(COLUMN_QUERY),
    }
  return columnList.list
}

function subscribeToColumn(onChange: () => void) {
  const list = columnMedia()
  list?.addEventListener("change", onChange)
  return () => list?.removeEventListener("change", onChange)
}

/** Whether the indicators are a column; true where `matchMedia` is missing */
const isColumn = () => columnMedia()?.matches ?? true

/**
 * The index a key moves to, wrapping around; null for any other key (AC36).
 * The arrows of the axis of the tablist move, the others are left to the
 * browser: ↑/↓ in a column, ←/→ in a strip
 */
function movedTo(
  key: string,
  column: boolean,
  index: number,
  count: number
): number | null {
  const [previous, next] = column
    ? ["ArrowUp", "ArrowDown"]
    : ["ArrowLeft", "ArrowRight"]
  switch (key) {
    case next:
      return (index + 1) % count
    case previous:
      return (index - 1 + count) % count
    case "Home":
      return 0
    case "End":
      return count - 1
    default:
      return null
  }
}

/**
 * The indicators (AC2, AC36, AC38, AC39): a tablist, in a column of 320 px
 * from 1280 px and in a strip above the chart below. The arrows of the axis
 * (↑/↓ in the column, ←/→ in the strip) and Home/End move, select and focus (automatic activation); in the strip
 * the selected tab is scrolled whole into view on open and on every selection.
 * In the column the window and its comparison are said above the tabs
 */
export function IndicatorRail({
  state,
  views,
  selected,
  panelId,
  onSelect,
}: {
  state: PageState
  views: ChartView[]
  selected: ChartId
  panelId: string
  onSelect: (chart: ChartId) => void
}) {
  const column = useSyncExternalStore(subscribeToColumn, isColumn)
  const tabs = useRef(new Map<ChartId, HTMLButtonElement>())
  const register = useCallback(
    (id: ChartId, element: HTMLButtonElement | null) => {
      if (element === null) tabs.current.delete(id)
      else tabs.current.set(id, element)
    },
    []
  )

  useEffect(() => {
    if (column) return
    const tab = tabs.current.get(selected)
    // jsdom has no scrollIntoView
    if (typeof tab?.scrollIntoView === "function")
      tab.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [selected, column])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // With a modifier the keys are the browser's (Alt+← goes back)
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const index = views.findIndex((view) => view.id === selected)
    const next = movedTo(event.key, column, index, views.length)
    const view = next === null ? undefined : views[next]
    if (view === undefined) return
    event.preventDefault()
    onSelect(view.id)
    // Focus by hand: Safari doesn't focus a button it didn't click
    tabs.current.get(view.id)?.focus()
  }

  return (
    <div className="flex shrink-0 flex-col border-b border-border xl:min-h-0 xl:w-80 xl:border-b-0 xl:border-r">
      <WindowSummary state={state} className="hidden px-4 pt-3 xl:block" />
      <div
        role="tablist"
        aria-label="Indicatori"
        aria-orientation={column ? "vertical" : "horizontal"}
        className="flex gap-2 overflow-x-auto p-3 xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-y-auto"
      >
        {views.map((view) => (
          <IndicatorTab
            key={view.id}
            view={view}
            selected={view.id === selected}
            panelId={panelId}
            register={register}
            onSelect={() => onSelect(view.id)}
            onKeyDown={onKeyDown}
          />
        ))}
      </div>
    </div>
  )
}
