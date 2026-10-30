import { Card } from "@/components/charts"
import type { CallTotals } from "@mito/domain/export/calls"

const kpis = [
  ["calls", "Chiamate effettuate"],
  ["answered", "Risposte"],
  ["appointments", "Appuntamenti fissati"],
  ["noAnswer", "Non risposte"],
] as const satisfies ReadonlyArray<readonly [keyof CallTotals, string]>

/** The four totals of the period (AC16): the same numbers as the totals row of the file (AC19). */
export function ExportKpis({ totals }: { totals: CallTotals }) {
  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map(([key, label]) => (
        <Card key={key} className="space-y-1">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="font-heading text-2xl tabular-nums">{totals[key]}</dd>
        </Card>
      ))}
    </dl>
  )
}
