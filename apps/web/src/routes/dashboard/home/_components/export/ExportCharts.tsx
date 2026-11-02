import { BarChart, Card } from "@/components/charts"
import {
  appointmentRateOrNull,
  rankByAppointmentRateOrNull,
  type OperatorCalls,
} from "@mito/domain/export/calls"

const operatorName = (row: OperatorCalls) => `${row.surname} ${row.name}`.trim()

/** One bar per operator, answered and not answered stacked (AC17). */
export const answeredSeries = (rows: readonly OperatorCalls[]) =>
  rows.map((row) => ({
    Operatore: operatorName(row),
    Risposte: row.answered,
    "Non risposte": row.noAnswer,
  }))

const percent = new Intl.NumberFormat("it-IT", {
  style: "percent",
  maximumFractionDigits: 1,
})

/**
 * Answered and not answered calls per operator, and the ranking by appointment
 * rate (AC17, AC18): without answered calls there is no rate, «—», not 0% (AC27).
 */
export function ExportCharts({ rows }: { rows: readonly OperatorCalls[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h3 className="text-sm text-muted-foreground">
          Risposte e non risposte
        </h3>
        <BarChart
          className="mt-4 h-72"
          data={answeredSeries(rows)}
          index="Operatore"
          categories={["Risposte", "Non risposte"]}
          colors={["green", "orange"]}
          stack
          yAxisWidth={40}
        />
      </Card>
      <Card>
        <h3 className="text-sm text-muted-foreground">
          Appuntamenti fissati sulle risposte
        </h3>
        <ol className="mt-4 space-y-3" aria-label="Classifica appuntamenti">
          {rankByAppointmentRateOrNull(rows).map((row) => {
            const rate = appointmentRateOrNull(row)
            return (
              <li key={row.operatorId} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{operatorName(row)}</span>
                  <span className="tabular-nums">
                    {rate === null ? "—" : percent.format(rate)}
                  </span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div
                    className="bg-tag-teal-dot h-2 rounded"
                    style={{ width: `${(rate ?? 0) * 100}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      </Card>
    </div>
  )
}
