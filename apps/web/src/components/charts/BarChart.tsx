import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { NoData } from "./NoData"
import { chartColor, type ChartColor } from "./palette"

type Props<T extends Record<string, unknown>> = {
  data: T[]
  /** The key of the label of each bar, on the x axis */
  index: string
  /** The keys of the series, one bar (or one segment, with stack) each */
  categories: string[]
  /** One color per category: a tone, or chart-1 for a single series */
  colors: ChartColor[]
  stack?: boolean
  yAxisWidth?: number
  valueFormatter?: (value: number) => string
  noDataText?: string
  className?: string
}

// The colors are tokens: the fixed ones as classes, those of the series in
// the style, never in an SVG attribute (D11). recharts gives both to the mark
const axisTick = { className: "fill-muted-foreground", fontSize: 12 }

/**
 * Tremor's BarChart, on recharts: horizontal grid lines, the axes without
 * lines, the legend on top, the tooltip with one row per series. A single
 * series has the track of each bar in chart-1-soft
 */
export function BarChart<T extends Record<string, unknown>>({
  data,
  index,
  categories,
  colors,
  stack = false,
  yAxisWidth = 56,
  valueFormatter = String,
  noDataText,
  className,
}: Props<T>) {
  const colorOf = (category: string) =>
    chartColor(colors[categories.indexOf(category)] ?? "neutral")
  const single = categories.length === 1
  return (
    <div className={cn("h-80 w-full", className)}>
      {data.length === 0 ? (
        <NoData text={noDataText} />
      ) : (
        <ChartContainer className="h-full w-full">
          <RechartsBarChart
            // recharts types the keys of a generic row too narrowly
            data={data}
            stackOffset={stack ? "sign" : "none"}
            margin={{ top: 5 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey={index}
              padding={{ left: 20, right: 20 }}
              tick={{ ...axisTick, transform: "translate(0, 6)" }}
              tickLine={false}
              axisLine={false}
              minTickGap={5}
            />
            <YAxis
              width={yAxisWidth}
              tick={{ ...axisTick, transform: "translate(-3, 0)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={valueFormatter}
            />
            <Tooltip
              isAnimationActive={false}
              wrapperStyle={{ outline: "none" }}
              cursor={{ className: "fill-muted stroke-none" }}
              position={{ y: 0 }}
              content={({ active, payload, label }) =>
                active && payload && payload.length > 0 ? (
                  <ChartTooltipContent
                    label={label as string}
                    items={payload.map((item) => ({
                      name: String(item.name),
                      value: valueFormatter(Number(item.value)),
                      color: colorOf(String(item.dataKey)),
                    }))}
                  />
                ) : null
              }
            />
            <Legend
              verticalAlign="top"
              content={() => (
                <ChartLegendContent
                  items={categories.map((category) => ({
                    name: category,
                    color: colorOf(category),
                  }))}
                />
              )}
            />
            {categories.map((category) => (
              <Bar
                key={category}
                dataKey={category}
                name={category}
                stackId={stack ? "a" : undefined}
                style={{ fill: colorOf(category) }}
                background={single ? { className: "fill-chart-1-soft" } : false}
                isAnimationActive={false}
              />
            ))}
          </RechartsBarChart>
        </ChartContainer>
      )}
    </div>
  )
}
