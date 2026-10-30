import { type ReactNode } from "react"
import { type Drawn } from "../useAnalisi"
import { AppointmentChart } from "./AppointmentChart"
import { BranchChart } from "./BranchChart"
import { CallsChart } from "./CallsChart"
import { MyAppointmentsChart, MyCallsChart } from "./OperatorCallsChart"
import { ProgressChart } from "./ProgressChart"
import { TrendChart } from "./TrendChart"
import { ANSWERED, COMPARISON, CURRENT, Legend, NO_ANSWER, RATE } from "./parts"

type Shape = Drawn["shape"]

/** What a shape is drawn with */
type ShapeSpec<S extends Shape> = {
  /** The recharts chart of the result; `compared`: a comparison is chosen, the number has a variation (AC12) */
  chart: (drawn: Extract<Drawn, { shape: S }>, compared: boolean) => ReactNode
  /** The legend on top of the chart, for the charts with more than one series */
  legend: (compared: boolean) => ReactNode
}

const calls = [
  { name: "Con risposta", color: ANSWERED },
  { name: "Senza risposta", color: NO_ANSWER },
]

const comparison = { name: "Confronto", color: COMPARISON, dashed: true }

const noLegend = () => null

/** The legend of the charts in time of the financed amount */
const trendLegend = (compared: boolean) => (
  <Legend
    items={[
      { name: "Finestra", color: CURRENT },
      ...(compared ? [comparison] : []),
    ]}
  />
)

/** The recharts chart of each shape, and how it is explained (AC3, AC18) */
const BY_SHAPE: { [S in Shape]: ShapeSpec<S> } = {
  financed: {
    chart: ({ result }, compared) => (
      <TrendChart points={result.points} kind="area" compared={compared} />
    ),
    legend: trendLegend,
  },
  average: {
    chart: ({ result }, compared) => (
      <TrendChart points={result.points} kind="line" compared={compared} />
    ),
    legend: trendLegend,
  },
  branches: {
    chart: ({ result }) => <BranchChart points={result.points} />,
    legend: noLegend,
  },
  progress: {
    chart: ({ result }) => {
      const point = result.points[0]
      return point === undefined ? null : <ProgressChart point={point} />
    },
    legend: noLegend,
  },
  adminCalls: {
    chart: ({ result }) => <CallsChart points={result.points} />,
    legend: () => <Legend items={calls} />,
  },
  adminAppointments: {
    chart: ({ result }) => <AppointmentChart points={result.points} />,
    legend: noLegend,
  },
  myCalls: {
    chart: ({ result }, compared) => (
      <MyCallsChart points={result.points} compared={compared} />
    ),
    legend: (compared) => (
      <Legend
        items={[
          ...calls,
          ...(compared ? [{ ...comparison, name: "Chiamate confronto" }] : []),
        ]}
      />
    ),
  },
  myAppointments: {
    chart: ({ result }, compared) => (
      <MyAppointmentsChart points={result.points} compared={compared} />
    ),
    legend: (compared) =>
      compared ? (
        <Legend items={[{ name: "Finestra", color: RATE }, comparison]} />
      ) : null,
  },
}

/**
 * The entry of `shape`, which takes the result of that shape: a table can't
 * tell TypeScript that the shape of a `Drawn` and its result go together
 */
const specOf = (shape: Shape) => BY_SHAPE[shape] as ShapeSpec<Shape>

/** A comparison is chosen: the number has a variation (AC12) */
const comparedIn = (drawn: Drawn) => drawn.result.kpi.delta !== null

/** The recharts chart of a result, by its shape (AC3, AC18) */
export function DrawnChart({ drawn }: { drawn: Drawn }) {
  return specOf(drawn.shape).chart(drawn, comparedIn(drawn))
}

/** The legend on top of the chart, for the charts with more than one series */
export function ChartLegend({ drawn }: { drawn: Drawn }) {
  return specOf(drawn.shape).legend(comparedIn(drawn))
}
