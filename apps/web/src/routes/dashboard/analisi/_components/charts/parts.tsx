import {
  type ComponentProps,
  type ReactNode,
  type SVGProps,
  useMemo,
} from "react"
import { BarChart, Line, Tooltip, XAxis, YAxis } from "recharts"
import { chartColor } from "@/components/charts/palette"
import {
  ChartContainer,
  ChartTooltipContent,
  type ChartTooltipItem,
} from "@/components/ui/chart"
import { DASH, formatCell } from "../../_lib/results"

/**
 * What the charts of the Analysis page share (AC8, AC34, AC41): the colors,
 * the axes, the truncated names, the tooltip and the legends.
 *
 * Every color is a token, in the `style` or a `fill-`/`stroke-` class of the
 * mark, never an SVG attribute (D11 of design-system-web). recharts writes its
 * own default colors as attributes (`#3182bd`, `#666`, `#eee`, `#ccc`): each
 * of them is set to "none" here, and the token paints over it, since a class
 * or a style wins over a presentation attribute
 */

/** The window and the comparison of the charts in time */
export const CURRENT = chartColor("chart-1")
export const COMPARISON = chartColor("neutral")
/** The two segments of the calls, and the bars of a rate */
export const ANSWERED = chartColor("green")
export const NO_ANSWER = chartColor("orange")
export const RATE = chartColor("teal")
/** A bar or a point of a small sample (AC18, AC25), and «Altre» (AC4) */
export const NEUTRAL = chartColor("neutral")
/** The color of the card the chart sits on: the separator of AC40, the inside of the dots */
export const CARD = "var(--color-card)"

/** No tab stop and no «application» on the surface of a chart root (AC34) */
export const chartRoot = { accessibilityLayer: false } as const

/** The ticks: the class paints them, the axis draws no line */
export const axisTick = { className: "fill-muted-foreground", fontSize: 12 }
export const axisProps = {
  // recharts paints the line and the ticks of an axis with `stroke` (#666)
  stroke: "none",
  tickLine: false,
  axisLine: false,
} as const

/** The cursor of the tooltip on bars: a band in the muted token */
export const barCursor = {
  fill: "none",
  stroke: "none",
  className: "fill-muted",
}
/** The cursor of the tooltip on lines and areas: a line in the strong border */
export const lineCursor = {
  stroke: "none",
  className: "stroke-border-strong",
}

/** The labels next to the bars, in the foreground token */
export const valueLabel = {
  position: "right" as const,
  fill: "none",
  className: "fill-foreground",
  fontSize: 12,
}

/**
 * The marks that paint with a token: `fill` and `stroke` are the attributes
 * set to "none" (over recharts' own default colors) and the colors go in the
 * `style`, which wins over an attribute
 */
export const paint = ({
  fill,
  stroke,
}: {
  fill?: string
  stroke?: string
}) => ({
  fill: "none",
  stroke: "none",
  style: {
    ...(fill === undefined ? null : { fill }),
    ...(stroke === undefined ? null : { stroke }),
  },
})

/** A dot of a line: the inside of the card, the ring of the series */
export const dotOf = (color: string, r = 3) => ({
  r,
  strokeWidth: 2,
  ...paint({ fill: CARD, stroke: color }),
})

/** The point the tooltip is on: filled with the series */
export const activeDotOf = (color: string) => ({
  r: 4,
  strokeWidth: 2,
  ...paint({ fill: color, stroke: CARD }),
})

/**
 * The separator of the stacked segments (AC40): each one has a 2 px border in
 * the color of the card, so between them runs a line of the card
 */
export const separated = (color: string) => ({
  strokeWidth: 2,
  ...paint({ fill: color, stroke: CARD }),
})

/** The dashed line of the comparison on a chart in time */
export function ComparisonLine({ dataKey }: { dataKey: string }) {
  return (
    <Line
      dataKey={dataKey}
      type="monotone"
      {...paint({ stroke: COMPARISON })}
      strokeWidth={1.5}
      strokeDasharray="4 4"
      dot={false}
      activeDot={activeDotOf(COMPARISON)}
      connectNulls={false}
      isAnimationActive={false}
    />
  )
}

/** The room around a chart in time, and the axis of its intervals */
export const timeMargin = { top: 8, right: 8, left: 0, bottom: 0 }
export const timeAxisProps = {
  dataKey: "label",
  ...axisProps,
  tick: axisTick,
  minTickGap: 28,
  tickMargin: 8,
}

// --- Formats ------------------------------------------------------------------

/** An amount with the sign: "12.500 €", «—» without a value (AC24) */
export const euro = (value: number | null | undefined) =>
  value === null || value === undefined
    ? DASH
    : `${formatCell(Math.round(value), "euro")} €`

/** A count: "3.725" */
export const count = (value: number) => formatCell(value, "count")

/** A rate with one decimal: "54,0%", «—» without a value (AC24) */
export const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? DASH : formatCell(value, "percent")

const compact = new Intl.NumberFormat("it-IT", {
  notation: "compact",
  maximumFractionDigits: 1,
})

/** The amounts on the axis: "98.000 €", "1,2 Mln €" */
export const euroTick = (value: number) => `${compact.format(value)} €`

// --- Names with the ellipsis (AC3) -----------------------------------------------

/** The average width of a character of the 12 px font, in px */
const CHAR_WIDTH = 6.6
/** The room between a name and its bar */
const TICK_GAP = 8

/**
 * `text` cut with «…» to fit `width` px. The width is an estimate (characters
 * by their average width): jsdom and the first render measure nothing
 */
function fitText(text: string, width: number): string {
  const room = width - TICK_GAP
  if (text.length * CHAR_WIDTH <= room) return text
  const chars = Math.max(1, Math.floor(room / CHAR_WIDTH) - 1)
  return `${text.slice(0, chars).trimEnd()}…`
}

type TickProps = {
  x?: number | string
  y?: number | string
  payload?: { value?: string | number }
}

/**
 * The tick of a name axis: the name cut to `width` px, with the whole name in
 * a `title` when it is cut (and in the tooltip)
 */
export const nameTick = (width: number) =>
  function NameTick({ x, y, payload }: TickProps) {
    const name = String(payload?.value ?? "")
    const shown = fitText(name, width)
    return (
      <g transform={`translate(${Number(x ?? 0)},${Number(y ?? 0)})`}>
        <text
          x={-TICK_GAP}
          y={0}
          dy="0.32em"
          textAnchor="end"
          fontSize={12}
          fill="none"
          className="fill-muted-foreground"
        >
          {shown === name ? null : <title>{name}</title>}
          {shown}
        </text>
      </g>
    )
  }

/** The width of the names of the operators (AC3) */
export const OPERATOR_NAME_WIDTH = 130

/**
 * The scaffold of the rankings (AC3): a horizontal bar chart of at most 8
 * bars filling the box of the panel, no value axis and the names on the left, cut to
 * `nameWidth`. `rightMargin` is the room for the labels next to the bars
 */
export function RankingChart<T extends object>({
  data,
  nameWidth,
  rightMargin,
  domain,
  children,
}: {
  data: T[]
  nameWidth: number
  rightMargin: number
  /** The domain of the value axis, if it isn't recharts' own */
  domain?: ComponentProps<typeof XAxis>["domain"]
  children: ReactNode
}) {
  const tick = useMemo(() => nameTick(nameWidth), [nameWidth])
  return (
    <ChartContainer className="h-full w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: rightMargin, left: 0, bottom: 0 }}
        barCategoryGap={6}
        {...chartRoot}
      >
        <XAxis type="number" hide domain={domain} stroke="none" />
        <YAxis
          type="category"
          dataKey="name"
          width={nameWidth}
          {...axisProps}
          tick={tick}
          interval={0}
        />
        {children}
      </BarChart>
    </ChartContainer>
  )
}

// --- Tooltip and legends ----------------------------------------------------------

/** The tooltip of a chart: what recharts passes to `content` */
export type TipArgs = {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
}

/** The point the tooltip is on */
export const pointOf = <P,>(args: TipArgs) =>
  args.payload?.[0]?.payload as P | undefined

/** The tooltip of a chart: the point it is on, with a title and a row per series; nothing off a point */
export function PointTooltip<T>({
  cursor,
  label,
  items,
}: {
  cursor: SVGProps<SVGElement>
  label: (point: T) => string
  items: (point: T) => ChartTooltipItem[]
}) {
  return (
    <Tooltip
      isAnimationActive={false}
      wrapperStyle={{ outline: "none" }}
      cursor={cursor}
      content={(args: TipArgs) => {
        const point = pointOf<T>(args)
        if (!args.active || point === undefined) return null
        return <ChartTooltipContent label={label(point)} items={items(point)} />
      }}
    />
  )
}

type LegendItem = { name: string; color: string; dashed?: boolean }

/** A legend on top of the chart, at its end: a swatch and a name per series */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          {item.dashed ? (
            <span
              aria-hidden="true"
              className="h-0 w-4 border-t-[1.5px] border-dashed"
              style={{ borderColor: item.color }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
          )}
          {item.name}
        </li>
      ))}
    </ul>
  )
}
