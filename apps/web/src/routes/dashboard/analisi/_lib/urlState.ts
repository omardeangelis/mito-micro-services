import type { Role } from "@mito/contract/schemas"
import {
  COMPARES,
  type Compare,
  daysIn,
  type DayRange,
  effectiveGroup,
  GROUPS,
  type Group,
  initialComparison,
  presetRange,
  type Preset,
  RANGES,
  type Range,
  validateWindow,
} from "@mito/domain/analytics/window"
import { type ChartId, chartsFor } from "./charts"

/** Everything the Analysis page shows, and everything its address says (AC14). */
export type PageState = {
  chart: ChartId
  range: Range
  window: DayRange
  compare: Compare
  group: Group
}

/** The first chart of the page: the one opened when the address asks for none the role can see. */
const DEFAULT_CHART: ChartId = "financed"

/** The value of `values` equal to `value`, or undefined when there is none. */
export const oneOf = <T extends string>(
  values: readonly T[],
  value: string | null
): T | undefined => values.find((item) => item === value)

/**
 * The state the address `search` describes, for a user with `role` on `today`.
 * Every value that is unknown, or not allowed, goes back to its initial value (AC14).
 */
export function readState(
  search: string,
  today: string,
  role: Role
): PageState {
  const params = new URLSearchParams(search)

  const allowed = chartsFor(role)
  const chart =
    oneOf(allowed, params.get("chart")) ?? allowed[0] ?? DEFAULT_CHART

  const asked = oneOf(RANGES, params.get("range")) ?? "30d"
  const custom =
    asked === "custom"
      ? validateWindow(
          { from: params.get("from") ?? "", to: params.get("to") ?? "" },
          today
        )
      : null
  // A custom window that doesn't validate goes back to the last 30 days
  const range: Range = asked === "custom" && custom === null ? "30d" : asked
  const window: DayRange =
    custom ?? presetRange(range === "custom" ? "30d" : range, today)

  const compare =
    oneOf(COMPARES, params.get("compare")) ?? initialComparison(range)

  const group = effectiveGroup(
    oneOf(GROUPS, params.get("group")) ?? "auto",
    daysIn(window)
  )

  return { chart, range, window, compare, group }
}

/**
 * The query string (no "?") of `state`. Dates are written only for a custom
 * window; the keys keep the order of the spec (AC14).
 */
export function writeState(state: PageState): string {
  const params = new URLSearchParams()
  params.set("chart", state.chart)
  params.set("range", state.range)
  if (state.range === "custom") {
    params.set("from", state.window.from)
    params.set("to", state.window.to)
  }
  params.set("compare", state.compare)
  params.set("group", state.group)
  return params.toString()
}

/** The state after picking a ready-made window; the comparison and the chart stay (AC9). */
export function withPreset(
  state: PageState,
  preset: Preset,
  today: string
): PageState {
  const window = presetRange(preset, today)
  return {
    ...state,
    range: preset,
    window,
    group: effectiveGroup(state.group, daysIn(window)),
  }
}

/** The state after picking dates by hand; the comparison and the chart stay (AC9, AC13). */
export function withCustom(state: PageState, window: DayRange): PageState {
  return {
    ...state,
    range: "custom",
    window,
    group: effectiveGroup(state.group, daysIn(window)),
  }
}

/** The state with another comparison. */
export function withCompare(state: PageState, compare: Compare): PageState {
  return { ...state, compare }
}

/** The state with another grouping, or "auto" when the window does not allow it (AC13). */
export function withGroup(state: PageState, group: Group): PageState {
  return { ...state, group: effectiveGroup(group, daysIn(state.window)) }
}
