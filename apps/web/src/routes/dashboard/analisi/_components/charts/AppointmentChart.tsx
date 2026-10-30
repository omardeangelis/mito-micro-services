import { Bar, Cell, LabelList } from "recharts"
import { type OperatorRatePoint } from "../../_lib/rankings"
import {
  barCursor,
  NEUTRAL,
  OPERATOR_NAME_WIDTH,
  paint,
  percent,
  PointTooltip,
  RankingChart,
  RATE,
  valueLabel,
} from "./parts"

type Row = OperatorRatePoint & { label: string }

/**
 * The admin's «Tasso di appuntamento» («Bar · Horizontal, Label»): per
 * operator, the rate as a bar with its value. A small sample (under 15
 * answers) has a neutral bar (AC25); without answers the rate is «—» and no
 * bar, never a zero (AC24)
 */
export function AppointmentChart({ points }: { points: OperatorRatePoint[] }) {
  const rows: Row[] = points.map((p) => ({ ...p, label: percent(p.rate) }))
  return (
    <RankingChart
      data={rows}
      nameWidth={OPERATOR_NAME_WIDTH}
      rightMargin={64}
      domain={[0, "dataMax"]}
    >
      <PointTooltip<Row>
        cursor={barCursor}
        label={(row) => row.fullName}
        items={(row) => [
          {
            name: row.small ? "Tasso (campione piccolo)" : "Tasso",
            value: percent(row.rate),
            color: row.small ? NEUTRAL : RATE,
          },
        ]}
      />
      <Bar dataKey="rate" radius={4} isAnimationActive={false}>
        {rows.map((row) => (
          <Cell
            key={row.fullName}
            {...paint({ fill: row.small ? NEUTRAL : RATE })}
          />
        ))}
        <LabelList dataKey="label" {...valueLabel} />
      </Bar>
    </RankingChart>
  )
}
