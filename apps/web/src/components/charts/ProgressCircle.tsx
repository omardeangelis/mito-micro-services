import { type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { chartColor, type ChartColor } from "./palette"

const sizes = {
  xs: { radius: 15, strokeWidth: 3 },
  sm: { radius: 19, strokeWidth: 4 },
  md: { radius: 32, strokeWidth: 6 },
  lg: { radius: 52, strokeWidth: 8 },
  xl: { radius: 80, strokeWidth: 10 },
} as const

type Props = {
  /** From 0 to 100; above 100 the circle is full */
  value: number
  size?: keyof typeof sizes
  color?: ChartColor
  className?: string
  children?: ReactNode
}

/** Tremor's ProgressCircle: the same sizes, the track in chart-1-soft */
export const ProgressCircle = ({
  value,
  size = "md",
  color = "blue",
  className,
  children,
}: Props) => {
  const { radius, strokeWidth } = sizes[size]
  const shown = Math.min(Math.max(value, 0), 100)
  const r = radius - strokeWidth / 2
  const circumference = 2 * Math.PI * r
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center",
        className
      )}
    >
      <svg
        width={radius * 2}
        height={radius * 2}
        viewBox={`0 0 ${radius * 2} ${radius * 2}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          r={r}
          cx={radius}
          cy={radius}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          className="stroke-chart-1-soft"
        />
        {/* The color is a token, so it goes in the style (D11) */}
        <circle
          data-testid="progress"
          r={r}
          cx={radius}
          cy={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (shown / 100) * circumference}
          fill="transparent"
          strokeLinecap="round"
          style={{ stroke: chartColor(color) }}
          className="transition-all duration-300 ease-in-out"
        />
      </svg>
      <div className="absolute flex">{children}</div>
    </div>
  )
}
