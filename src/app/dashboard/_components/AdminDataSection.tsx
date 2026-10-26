import { api } from "@/trpc/server"
import { FinanceCard } from "./FinanceCard"
import { Skeleton } from "@/components/ui/skeleton"
import { DonutCard } from "./DonutCard"
import { CircleCard } from "./CircleCard"
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
    <div className="flex h-full w-full flex-row items-stretch justify-between gap-8">
      <FinanceCard
        title="Finanziato medio per pratica"
        referencePeriod={{ total: reference }}
        comparisonPeriod={{ total: comparison }}
        windows={windows}
      />
      <CircleCard done={done} todo={todo}>
        <p className="text-tremor-default text-tremor-content dark:text-dark-tremor-content">
          Contatti con esito
        </p>
      </CircleCard>
      <DonutCard data={data} />
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
