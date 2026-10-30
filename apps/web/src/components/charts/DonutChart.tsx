import { Cell, Pie, PieChart, Tooltip } from "recharts"
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import { NoData } from "./NoData"
import { chartColor, type ChartColor } from "./palette"

type Props<T extends Record<string, unknown>> = {
  data: T[]
  /** The key of the value of each slice */
  category: keyof T & string
  /** The key of the name of each slice */
  index: keyof T & string
  /** One color per slice, in order: a tone */
  colors: ChartColor[]
  valueFormatter?: (value: number) => string
  noDataText?: string
  className?: string
}

/**
 * The donut of Tremor's DonutChart, on recharts: the ring from 75% of the
 * radius, the first slice at the top, clockwise, no label in the middle. The
 * colors are tokens, so they go in the style and a class of the slice (D11)
 */
export function DonutChart<T extends Record<string, unknown>>({
  data,
  category,
  index,
  colors,
  valueFormatter = String,
  noDataText,
  className,
}: Props<T>) {
  const colorOf = (i: number) => chartColor(colors[i] ?? "neutral")
  return (
    <div className={cn("h-40 w-full", className)}>
      {data.length === 0 ? (
        <NoData text={noDataText} />
      ) : (
        <ChartContainer className="h-full w-full">
          <PieChart margin={{ top: 0, left: 0, right: 0, bottom: 0 }}>
            <Pie
              data={data}
              dataKey={category}
              nameKey={index}
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius="75%"
              outerRadius="100%"
              strokeLinejoin="round"
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  className="stroke-card"
                  style={{ fill: colorOf(i) }}
                />
              ))}
            </Pie>
            <Tooltip
              isAnimationActive={false}
              wrapperStyle={{ outline: "none" }}
              content={({ active, payload }) => {
                const slice = payload?.[0]
                if (!active || slice === undefined) return null
                const i = data.indexOf(slice.payload as T)
                return (
                  <ChartTooltipContent
                    items={[
                      {
                        name: String(slice.name),
                        value: valueFormatter(Number(slice.value)),
                        color: colorOf(i),
                      },
                    ]}
                  />
                )
              }}
            />
          </PieChart>
        </ChartContainer>
      )}
    </div>
  )
}
