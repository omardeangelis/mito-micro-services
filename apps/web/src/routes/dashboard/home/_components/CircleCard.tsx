import { type PropsWithChildren } from "react"
import { Card, type ChartColor, ProgressCircle } from "@/components/charts"

type Props = {
  done: number
  todo: number
}

/** Il colore della percentuale che la card mostra: 75,4% si mostra 75%, blu. */
const colorOf = (shown: number): ChartColor => {
  if (shown > 75) return "green"
  if (shown > 50) return "blue"
  if (shown > 25) return "amber"
  return "red"
}

export const CircleCard = ({
  children,
  done,
  todo,
}: PropsWithChildren<Props>) => {
  const shown = Math.round((done / (done + todo)) * 100 || 0)

  return (
    <Card className="w-full">
      <div className="flex items-center justify-start space-x-5">
        <ProgressCircle value={shown} size="xl" color={colorOf(shown)}>
          <span className="text-xs font-medium text-foreground">{shown}%</span>
        </ProgressCircle>
        <div>
          <p className="text-sm font-medium text-foreground">
            {`${done}/${done + todo} (${shown}%)`}
          </p>
          {children}
        </div>
      </div>
    </Card>
  )
}
