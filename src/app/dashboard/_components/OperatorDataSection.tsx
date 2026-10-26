import { api } from "@/trpc/server"
import { FinanceCard } from "./FinanceCard"
import { Skeleton } from "@/components/ui/skeleton"
import { CircleCard } from "./CircleCard"
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
    <div className="flex h-full w-full flex-row items-stretch justify-between gap-8">
      <FinanceCard
        title="Finanziato totale"
        referencePeriod={{ total: total.reference }}
        comparisonPeriod={{ total: total.comparison }}
        windows={total.windows}
      />
      <CircleCard done={done} todo={todo}>
        <p className="text-tremor-default text-tremor-content dark:text-dark-tremor-content">
          Contatti con esito
        </p>
      </CircleCard>
      <FinanceCard
        title="Finanziato medio per pratica"
        referencePeriod={{ total: average.reference }}
        comparisonPeriod={{ total: average.comparison }}
        windows={average.windows}
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
