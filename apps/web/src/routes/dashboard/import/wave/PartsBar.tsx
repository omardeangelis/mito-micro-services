import { type WaveView } from "@/api/import"
import { cn } from "@/lib/utils"
import { formatNumber } from "./_lib/text"

type Parts = WaveView["parts"]

/** The parts with a place in the legend, from the left of the bar to the right */
const legend = [
  { key: "worked", label: "Lavorati", color: "bg-parts-worked" },
  {
    key: "calledNoOutcome",
    label: "Chiamati, senza esito",
    color: "bg-parts-called",
  },
  { key: "neverCalled", label: "Mai chiamati", color: "bg-parts-never" },
  {
    key: "unassigned",
    label: "Senza operatore",
    color: "bg-parts-unassigned",
  },
] as const

/**
 * The bar with no legend (AC37, AC31, D9). Each part is a flex item that
 * grows with its number and never shrinks under its minimum, so a part of 1
 * customer in 9,100 still shows: 2 px, plus the 2 px separator in the color
 * of the card that every segment but the first has. The customers with an
 * operator and no contact are an elastic item with no color, at the end.
 * There are no transitions (AC32). With `role="meter"` the bar is an
 * indicator: the value is the worked part, `valueText` says all of them
 */
export function PartsTrack({
  parts,
  role,
  label,
  valueText,
}: {
  parts: Parts
  role: "img" | "meter"
  label: string
  valueText?: string
}) {
  const total =
    legend.reduce((sum, item) => sum + parts[item.key], 0) + parts.noContact
  const shown = legend.filter((item) => parts[item.key] > 0)
  return (
    <div
      role={role}
      aria-label={label}
      {...(role === "meter"
        ? {
            "aria-valuemin": 0,
            "aria-valuemax": total,
            "aria-valuenow": parts.worked,
            "aria-valuetext": valueText,
          }
        : {})}
      className="flex h-2.5 overflow-hidden rounded-full bg-muted"
    >
      {shown.map((item, index) => (
        <div
          key={item.key}
          data-part={item.key}
          className={cn(
            "h-full shrink basis-0",
            item.color,
            index === 0 ? "min-w-0.5" : "min-w-1 border-l-2 border-card"
          )}
          style={{ flexGrow: parts[item.key] }}
        />
      ))}
      {parts.noContact > 0 ? (
        <div
          data-empty
          className="h-full shrink basis-0"
          style={{ flexGrow: parts.noContact }}
        />
      ) : null}
    </div>
  )
}

/**
 * The legend of the bar. With `parts` each entry has its number, without it
 * only the names
 */
export function PartsLegend({ parts }: { parts?: Parts }) {
  return (
    <ul
      aria-label="Legenda della barra"
      className="flex flex-wrap gap-x-5 gap-y-1 text-sm"
    >
      {legend.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-full", item.color)} />
          <span className="text-muted-foreground">{item.label}</span>
          {parts ? (
            <span className="font-label tabular-nums">
              {formatNumber(parts[item.key])}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * The parts of the Wave (AC19): the bar and its legend with the numbers. The
 * customers with an operator and no contact are the empty part of the bar,
 * with no place in the legend. The bar is an image for screen readers, named
 * with all the parts and their numbers, the empty one too
 */
export function PartsBar({ parts }: { parts: Parts }) {
  const name = `Parti della Wave: ${[
    ...legend.map((item) => `${item.label} ${formatNumber(parts[item.key])}`),
    `Con operatore e senza contatto ${formatNumber(parts.noContact)}`,
  ].join(", ")}`
  return (
    <div className="flex flex-col gap-2">
      <PartsTrack parts={parts} role="img" label={name} />
      <PartsLegend parts={parts} />
    </div>
  )
}
