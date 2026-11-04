import { type WaveView } from "@/api/import"
import { cn } from "@/lib/utils"
import { formatNumber } from "./_lib/text"

type Parts = WaveView["parts"]

/** The parts with a place in the legend, from the left of the bar to the right */
const legend = (parts: Parts) =>
  [
    { label: "Lavorati", n: parts.worked, color: "bg-primary" },
    {
      label: "Chiamati senza esito",
      n: parts.calledNoOutcome,
      color: "bg-primary/45",
    },
    {
      label: "Mai chiamati",
      n: parts.neverCalled,
      color: "bg-muted-foreground/30",
    },
    {
      label: "Senza operatore",
      n: parts.unassigned,
      color: "bg-tag-amber-dot",
    },
  ] as const

/**
 * The parts of the Wave (AC19): the bar and its legend with the numbers. The
 * customers with an operator and no contact are the empty part of the bar,
 * with no place in the legend. The bar is an image for screen readers, named
 * with all the parts and their numbers, the empty one too
 */
export function PartsBar({ parts }: { parts: Parts }) {
  const items = legend(parts)
  const total = items.reduce((sum, item) => sum + item.n, 0) + parts.noContact
  const name = `Parti della Wave: ${[
    ...items.map((item) => `${item.label} ${formatNumber(item.n)}`),
    `Con operatore e senza contatto ${formatNumber(parts.noContact)}`,
  ].join(", ")}`
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={name}
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
      >
        {items.map((item) =>
          item.n > 0 ? (
            <div
              key={item.label}
              className={cn("h-full", item.color)}
              style={{ width: `${(item.n / total) * 100}%` }}
            />
          ) : null
        )}
      </div>
      <ul
        aria-label="Legenda della barra"
        className="flex flex-wrap gap-x-5 gap-y-1 text-sm"
      >
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("size-2 rounded-full", item.color)}
            />
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-label tabular-nums">
              {formatNumber(item.n)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
