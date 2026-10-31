import { Bar, Cell, LabelList } from "recharts"
import { type BranchPoint } from "../../_lib/rankings"
import { ratio } from "../../_lib/results"
import {
  barCursor,
  CURRENT,
  euro,
  NEUTRAL,
  paint,
  percent,
  PointTooltip,
  RankingChart,
  valueLabel,
} from "./parts"

/** The width of the names of the branches (AC3) */
const NAME_WIDTH = 150

/** «Altre», the branches past the seventh (AC4) */
const OTHERS = "Altre"

type Row = BranchPoint & { share: number | null; label: string }

/** «Altre» is the one bar whose tooltip name differs from its axis name */
const isOthers = (p: BranchPoint) => p.name === OTHERS && p.fullName !== p.name

/**
 * «Finanziato per sede» («Bar · Horizontal, Custom Label»): one bar per
 * branch, the amount and the share next to it, «Altre» in neutral (AC3, AC4).
 * The names past 150 px end with «…», whole in the tooltip
 */
export function BranchChart({ points }: { points: BranchPoint[] }) {
  const total = points.reduce((all, p) => all + p.amount, 0)
  const rows: Row[] = points.map((p) => {
    const share = ratio(p.amount, total)
    return { ...p, share, label: `${euro(p.amount)} · ${percent(share)}` }
  })
  return (
    <RankingChart
      data={rows}
      nameWidth={NAME_WIDTH}
      rightMargin={136}
      domain={[0, "dataMax"]}
    >
      <PointTooltip<Row>
        cursor={barCursor}
        label={(row) => row.fullName}
        items={(row) => [
          {
            name: "Finanziato",
            value: euro(row.amount),
            color: isOthers(row) ? NEUTRAL : CURRENT,
          },
          { name: "Quota", value: percent(row.share), color: "transparent" },
        ]}
      />
      <Bar dataKey="amount" radius={4} isAnimationActive={false}>
        {rows.map((row) => (
          <Cell
            key={row.name}
            {...paint({ fill: isOthers(row) ? NEUTRAL : CURRENT })}
          />
        ))}
        <LabelList dataKey="label" {...valueLabel} />
      </Bar>
    </RankingChart>
  )
}
