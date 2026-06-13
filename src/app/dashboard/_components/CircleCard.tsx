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

  const color = useMemo(() => {
    switch (percentage > 100) {
      case percentage > 75:
        return "green"
      case percentage > 50:
        return "blue"
      case percentage > 25:
        return "yellow"
      default:
        return "red"
    }
  }, [percentage])
  return (
    <Card className="w-full">
      <div className="flex items-center justify-start space-x-5">
        <ProgressCircle
          value={Number(percentage.toFixed(0))}
          size="xl"
          color={color}
        >
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
