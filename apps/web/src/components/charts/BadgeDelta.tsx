import { type ReactNode, type SVGProps } from "react"
import { cn } from "@/lib/utils"

export type DeltaType = "increase" | "decrease" | "unchanged"

// The arrows of Tremor (Remix Icon), which lucide draws differently
const arrows: Record<DeltaType, string> = {
  increase:
    "M13.0001 7.82843V20H11.0001V7.82843L5.63614 13.1924L4.22192 11.7782L12.0001 4L19.7783 11.7782L18.3641 13.1924L13.0001 7.82843Z",
  decrease:
    "M13.0001 16.1716L18.3641 10.8076L19.7783 12.2218L12.0001 20L4.22192 12.2218L5.63614 10.8076L11.0001 16.1716V4H13.0001V16.1716Z",
  unchanged:
    "M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z",
}

const Arrow = ({
  type,
  ...props
}: { type: DeltaType } & SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    data-delta={type}
    {...props}
  >
    <path d={arrows[type]} />
  </svg>
)

// Appendix B: the soft fill and text of the change. Appendix C: 20 px high,
// the text at 11.5 px, weight 600
const colors: Record<DeltaType, string> = {
  increase: "bg-success-soft text-success-soft-foreground",
  decrease: "bg-destructive-soft text-destructive-soft-foreground",
  unchanged: "bg-muted text-muted-foreground",
}

/** Tremor's BadgeDelta with text: an arrow and the change */
export const BadgeDelta = ({
  deltaType = "increase",
  className,
  children,
}: {
  deltaType?: DeltaType
  className?: string
  children?: ReactNode
}) => (
  <span
    className={cn(
      "inline-flex h-5 w-max shrink-0 cursor-default items-center justify-center gap-1 rounded-full px-[7px] text-[11.5px] font-semibold tabular-nums",
      colors[deltaType],
      className
    )}
  >
    <Arrow type={deltaType} className="size-3 shrink-0" />
    {children ? <span className="whitespace-nowrap">{children}</span> : null}
  </span>
)
