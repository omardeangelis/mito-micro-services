"use client"
import { formatBigNumber } from "@/lib/utils/format"
import { DonutChart, Legend, Card } from "@tremor/react"
import { useMemo } from "react"

type Data = {
  data: string
  total: number
}[]

type Props = {
  data: Data
}

const valueFormatter = (number: number) => `€ ${formatBigNumber(number)}`

const cssColors = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
]

function generateColors(array: unknown[]): string[] {
  return array
    .map((_, i) => cssColors[i % cssColors.length])
    .filter(Boolean) as string[]
}

export function DonutCard(props: Props) {
  const sedi = useMemo(
    () => props.data.map((d) => d.data ?? "Nessuna"),
    [props.data]
  )
  const colors = useMemo(() => generateColors(sedi), [sedi])
  const sum = useMemo(
    () => props.data.reduce((acc, d) => acc + d.total, 0),
    [props.data]
  )

  return (
    <>
      <Card className="flex w-full items-center justify-between gap-2">
        <DonutChart
          data={props.data}
          category="total"
          index="data"
          label="evviva"
          showLabel={false}
          valueFormatter={valueFormatter}
          colors={colors}
          className="z-10 w-40"
        />
        <div className="space-y-1">
          <h2 className="text-sm text-neutral-400">
            Finanziato totale per sede
          </h2>
          <p className="text-2xl">{valueFormatter(sum)}</p>
          <Legend categories={sedi} colors={colors} className="z-0 max-w-xs" />
        </div>
      </Card>
    </>
  )
}
