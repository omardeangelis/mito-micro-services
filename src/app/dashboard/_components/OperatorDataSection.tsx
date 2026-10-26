import { api } from "@/trpc/server"
import { FinanceCard } from "./FinanceCard"
import { CircleCard } from "./CircleCard"
import { CardRow } from "./CardRow"
import { type TimeFrame } from "@mito/domain/constants/timeframes"

export const OperatorDataSection = async ({
  timeframe,
}: {
  timeframe: TimeFrame
}) => {
  const [total, { done, todo }, average] = await Promise.all([
    api.analytics.getFinancedTotal.query({ timeFrame: timeframe }),
    api.analytics.getContactProgress.query(),
    api.analytics.getFinancedAverage.query({ timeFrame: timeframe }),
  ])

  return (
    <CardRow>
      <FinanceCard
        title="Finanziato totale"
        referencePeriod={{ total: total.reference }}
        comparisonPeriod={{ total: total.comparison }}
        windows={total.windows}
      />
      <CircleCard done={done} todo={todo}>
        <h2 className="text-sm text-neutral-500">Contatti con esito</h2>
      </CircleCard>
      <FinanceCard
        title="Finanziato medio per pratica"
        referencePeriod={{ total: average.reference }}
        comparisonPeriod={{ total: average.comparison }}
        windows={average.windows}
      />
    </CardRow>
  )
}
