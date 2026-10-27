"use client"

import { Card, ProgressCircle } from "@tremor/react"

type Props = {
  done: number
  todo: number
}

type CircleCardProps = React.PropsWithChildren<Props>

/** Il colore della percentuale che la card mostra: 75,4% si mostra 75%, blu. */
const colorOf = (shown: number) => {
  if (shown > 75) return "green"
  if (shown > 50) return "blue"
  if (shown > 25) return "yellow"
  return "red"
}

export const CircleCard = ({ children, done, todo }: CircleCardProps) => {
  const shown = Math.round((done / (done + todo)) * 100 || 0)

  return (
    <Card className="w-full">
      <div className="flex items-center justify-start space-x-5">
        <ProgressCircle value={shown} size="xl" color={colorOf(shown)}>
          <span className="text-xs font-medium text-slate-700">{shown}%</span>
        </ProgressCircle>
        <div>
          <p className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong">
            {`${done}/${done + todo} (${shown}%)`}
          </p>
          {children}
        </div>
      </div>
    </Card>
  )
}
