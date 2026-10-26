import { api } from "@/trpc/server"
import { FinanceCard } from "./FinanceCard"
import { Skeleton } from "@/components/ui/skeleton"
import { CircleCard } from "./CircleCard"
import {
  type TimeFrame,
  DEFAULTTIMEFRAME,
} from "@mito/domain/constants/timeframes"

export const OperatorDataSection = async ({
  timeframe = DEFAULTTIMEFRAME,
}: {
  timeframe?: TimeFrame
}) => {
  const { comparison, reference, windows } =
    await api.analytics.getFinancedTotal.query({
      timeFrame: timeframe,
    })
  const { done, todo } = await api.analytics.getContactProgress.query()
  const {
    comparison: averageComparison,
    reference: averageReference,
    windows: averageWindows,
  } = await api.analytics.getFinancedAverage.query({
    timeFrame: timeframe,
  })

  return (
    <div className="flex h-full w-full flex-row items-stretch justify-between gap-8">
      <FinanceCard
        title="Finanziato totale"
        referencePeriod={{ total: reference }}
        comparisonPeriod={{ total: comparison }}
        windows={windows}
      />
      <CircleCard done={done} todo={todo}>
        <p className="text-tremor-default text-tremor-content dark:text-dark-tremor-content">
          Contatti con esito
        </p>
      </CircleCard>
      <FinanceCard
        title="Finanziato medio per pratica"
        referencePeriod={{ total: averageReference }}
        comparisonPeriod={{ total: averageComparison }}
        windows={averageWindows}
      />
    </div>
  )
}

export const DataSectionSkeleton = () => {
  return (
    <div className="flex w-full flex-row items-center justify-between gap-8">
      <Skeleton className="h-48 w-1/3 rounded-md" />
      <Skeleton className="h-48 w-1/3 rounded-md" />
      <Skeleton className="h-48 w-1/3 rounded-md" />
    </div>
  )
}
