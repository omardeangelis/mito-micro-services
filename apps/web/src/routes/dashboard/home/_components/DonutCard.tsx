import { useEffect, useMemo, useRef } from "react"
import { type BranchTotal } from "@mito/contract/analytics"
import { formatBigNumber } from "@mito/client/format"
import { Card, chartColor, DonutChart } from "@/components/charts"

type Slice = { name: string; total: number; color: string }

const valueFormatter = (number: number) => `€ ${formatBigNumber(number)}`

// Distinti fra loro, e almeno 3:1 sul bianco
const colors = [
  "blue-500",
  "amber-600",
  "emerald-600",
  "violet-500",
  "rose-500",
  "cyan-600",
]
const othersColor = "gray-500"

/** Una fetta per sede finché ce n'è un colore; oltre, le prime e "Altre". */
const slicesOf = (data: readonly BranchTotal[]): Slice[] => {
  const byTotal = data
    .map((d) => ({ name: d.data ?? "Nessuna", total: d.total }))
    .sort((a, b) => b.total - a.total)
  const named =
    byTotal.length > colors.length ? colors.length - 1 : colors.length
  const slices = byTotal
    .slice(0, named)
    .map((slice, i) => ({ ...slice, color: colors[i] ?? othersColor }))
  const others = byTotal.slice(named)
  if (others.length === 0) return slices
  const total = others.reduce((acc, d) => acc + d.total, 0)
  return [...slices, { name: "Altre", total, color: othersColor }]
}

/**
 * Toglie le tab stop della ciambella: recharts ne dà una a ogni torta
 * (`rootTabIndex`), senza ruolo né nome. La legenda dice già tutto, con gli
 * importi.
 */
const useNoTabStops = () => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const untab = () =>
      root
        .querySelectorAll('[tabindex="0"]')
        .forEach((el) => el.setAttribute("tabindex", "-1"))
    untab()
    // recharts disegna la torta dopo aver misurato il contenitore
    const observer = new MutationObserver(untab)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  return ref
}

export function DonutCard({ data }: { data: readonly BranchTotal[] }) {
  const slices = useMemo(() => slicesOf(data), [data])
  const sum = useMemo(() => data.reduce((acc, d) => acc + d.total, 0), [data])
  const chart = useNoTabStops()

  return (
    <Card className="w-full space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm text-neutral-500">Finanziato totale per sede</h2>
        <p className="text-2xl">{valueFormatter(sum)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <div ref={chart} aria-hidden="true" className="shrink-0">
          <DonutChart
            data={slices}
            category="total"
            index="name"
            valueFormatter={valueFormatter}
            colors={slices.map((slice) => slice.color)}
            noDataText="Nessun importo nel periodo"
            className="h-32 w-32"
          />
        </div>
        {slices.length > 0 ? (
          <ul className="min-w-40 flex-1 space-y-1 text-sm">
            {slices.map((slice) => (
              <li key={slice.name} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: chartColor(slice.color) }}
                />
                {/* Va a capo: le sedi si distinguono spesso solo alla fine */}
                <span className="min-w-0 flex-1 break-words">{slice.name}</span>
                <span className="whitespace-nowrap tabular-nums">
                  {valueFormatter(slice.total)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  )
}
