"use client"

import { Card, ProgressCircle } from "@tremor/react"
import { useMemo } from "react"

type Props = {
  done: number
  todo: number
}

type CircleCardProps = React.PropsWithChildren<Props>

export const CircleCard = ({ children, done, todo }: CircleCardProps) => {
  const percentage = useMemo(
    () => (done / (done + todo)) * 100 || 0,
    [done, todo]
  )

  // Il colore segue la percentuale arrotondata che la card mostra (75,4% -> 75%)
  const rounded = Number(percentage.toFixed(0))

  const color = useMemo(() => {
    if (rounded > 75) return "green"
    if (rounded > 50) return "blue"
    if (rounded > 25) return "yellow"
    return "red"
  }, [rounded])
  return (
    <Card className="w-full">
      <div className="flex items-center justify-start space-x-5">
        <ProgressCircle value={rounded} size="xl" color={color}>
          <span className="text-xs font-medium text-slate-700">
            {percentage.toFixed(0)}%
          </span>
        </ProgressCircle>
        <div>
          <p className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
            {`${done}/${done + todo} (${percentage.toFixed(0)}%)`}
          </p>
          {children}
        </div>
      </div>
    </Card>
  )
}
