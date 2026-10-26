import { api } from "@/trpc/server"
import { FinanceCard } from "./FinanceCard"
import { DonutCard } from "./DonutCard"
import { CircleCard } from "./CircleCard"
import { CardRow } from "./CardRow"
import { type TimeFrame } from "@mito/domain/constants/timeframes"

export const AdminDataSection = async ({
  timeframe,
}: {
  timeframe: TimeFrame
}) => {
  const [{ comparison, reference, windows }, { done, todo }, data] =
    await Promise.all([
      api.analytics.getFinancedAverage.query({ timeFrame: timeframe }),
      api.analytics.getContactProgress.query(),
      api.analytics.getFinancedByBranch.query({ timeFrame: timeframe }),
    ])

  return (
    <CardRow>
      <FinanceCard
        title="Finanziato medio per pratica"
        referencePeriod={{ total: reference }}
        comparisonPeriod={{ total: comparison }}
        windows={windows}
      />
      <CircleCard done={done} todo={todo}>
        <h2 className="text-sm text-neutral-500">Contatti con esito</h2>
      </CircleCard>
      <DonutCard data={data} />
    </CardRow>
  )
}
