import { Bar, LabelList } from "recharts"
import { type OperatorCallsPoint } from "../../_lib/rankings"
import { ratio } from "../../_lib/results"
import {
  ANSWERED,
  barCursor,
  count,
  NO_ANSWER,
  OPERATOR_NAME_WIDTH,
  percent,
  PointTooltip,
  RankingChart,
  separated,
  valueLabel,
} from "./parts"

type Row = OperatorCallsPoint & { calls: number; label: string }

/**
 * The admin's «Risposte per operatore» («Bar · Horizontal, Stacked +
 * Legend»): per operator, the calls with an answer and those without, the
 * total next to the bar (AC3, AC40). The legend is on top of the chart
 */
export function CallsChart({ points }: { points: OperatorCallsPoint[] }) {
  const rows: Row[] = points.map((p) => {
    const calls = p.answered + p.noAnswer
    return { ...p, calls, label: count(calls) }
  })
  return (
    <RankingChart data={rows} nameWidth={OPERATOR_NAME_WIDTH} rightMargin={56}>
      <PointTooltip<Row>
        cursor={barCursor}
        label={(row) => `${row.fullName} · ${count(row.calls)} chiamate`}
        items={(row) => [
          {
            name: "Con risposta",
            value: `${count(row.answered)} (${percent(ratio(row.answered, row.calls))})`,
            color: ANSWERED,
          },
          {
            name: "Senza risposta",
            value: count(row.noAnswer),
            color: NO_ANSWER,
          },
        ]}
      />
      <Bar
        dataKey="answered"
        name="Con risposta"
        stackId="calls"
        {...separated(ANSWERED)}
        isAnimationActive={false}
      />
      <Bar
        dataKey="noAnswer"
        name="Senza risposta"
        stackId="calls"
        {...separated(NO_ANSWER)}
        radius={[0, 4, 4, 0]}
        isAnimationActive={false}
      >
        <LabelList dataKey="label" {...valueLabel} />
      </Bar>
    </RankingChart>
  )
}
