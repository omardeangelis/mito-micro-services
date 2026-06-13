import { api } from "@/trpc/server"
import { FinanceCard } from "./FinanceCard"
import { Skeleton } from "@/components/ui/skeleton"
import { DonutCard } from "./DonutCard"
import { CircleCard } from "./CircleCard"
import { type TimeFrame, DEFUALTTIMEFRAME } from "@/lib/constants/timeframes"

export const AdminDataSection = async ({
  timeframe = DEFUALTTIMEFRAME,
}: {
  timeframe?: TimeFrame
}) => {
  const { comparison, reference } =
    await api.analitycs.getFinanziatoMedioPerOperatore.query({
      timeFrame: timeframe,
    })
  const { done, todo } = await api.analitycs.getAllDoneTasksInLastMonth.query()
  const data = await api.analitycs.getAmountPerSedeInLastMonth.query({
    timeFrame: timeframe,
  })

  return (
    <div className="flex h-full w-full flex-row items-stretch justify-between gap-8">
      <FinanceCard
        title="Finanziato medio per operatore"
        referencePeriod={{
          total: Number(reference),
        }}
        comparisonPeriod={{
          total: Number(comparison),
        }}
        comparisonTimeFrame={timeframe}
      />
      <CircleCard done={done} todo={todo}>
        <p className="text-tremor-default text-tremor-content dark:text-dark-tremor-content">
          Chiamate completate
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
