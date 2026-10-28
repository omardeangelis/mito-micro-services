import { BarChart, Card } from "@/components/charts"
import {
  appointmentRate,
  rankByAppointmentRate,
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

/** Answered and not answered calls per operator, and the ranking by appointment rate (AC17, AC18). */
export function ExportCharts({ rows }: { rows: readonly OperatorCalls[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h3 className="text-sm text-neutral-400">Risposte e non risposte</h3>
        <BarChart
          className="mt-4 h-72"
          data={answeredSeries(rows)}
          index="Operatore"
          categories={["Risposte", "Non risposte"]}
          colors={["emerald", "rose"]}
          stack
          yAxisWidth={40}
        />
      </Card>
      <Card>
        <h3 className="text-sm text-neutral-400">
          Appuntamenti fissati sulle risposte
        </h3>
        <ol className="mt-4 space-y-3" aria-label="Classifica appuntamenti">
          {rankByAppointmentRate(rows).map((row) => {
            const rate = appointmentRate(row)
            return (
              <li key={row.operatorId} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{operatorName(row)}</span>
                  <span className="tabular-nums">{percent.format(rate)}</span>
                </div>
                <div className="h-2 rounded bg-neutral-100">
                  <div
                    className="h-2 rounded bg-blue-500"
                    style={{ width: `${rate * 100}%` }}
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
