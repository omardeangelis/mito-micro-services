import { type TimeFrame } from "@mito/contract/analytics"
import {
  useContactProgress,
  useFinancedAverage,
  useFinancedByBranch,
  useFinancedTotal,
} from "@/api/analytics"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { CardRow, DataSectionSkeleton } from "./CardRow"
import { CircleCard } from "./CircleCard"
import { DonutCard } from "./DonutCard"
import { FinanceCard } from "./FinanceCard"

const ProgressTitle = () => (
  <h2 className="text-sm text-neutral-500">Contatti con esito</h2>
)

/**
 * The cards of "Analisi Andamento" in `timeframe`: the admin's, or the
 * operator's. The skeleton until every number of the row is there, as the
 * `Suspense` of the Next.js app
 */
export const DataSection = ({ timeframe }: { timeframe: TimeFrame }) => {
  const role = useUserPreferenceContext((state) => state.role)
  if (role === undefined) return <DataSectionSkeleton />
  if (role === "ADMIN") return <AdminDataSection timeframe={timeframe} />
  return <OperatorDataSection timeframe={timeframe} />
}

const AdminDataSection = ({ timeframe }: { timeframe: TimeFrame }) => {
  const average = useFinancedAverage(timeframe).data
  const progress = useContactProgress().data
  const branches = useFinancedByBranch(timeframe).data
  if (!average || !progress || !branches) return <DataSectionSkeleton />

  return (
    <CardRow>
      <FinanceCard
        title="Finanziato medio per pratica"
        referencePeriod={{ total: average.reference }}
        comparisonPeriod={{ total: average.comparison }}
        windows={average.windows}
      />
      <CircleCard done={progress.done} todo={progress.todo}>
        <ProgressTitle />
      </CircleCard>
      <DonutCard data={branches} />
    </CardRow>
  )
}

const OperatorDataSection = ({ timeframe }: { timeframe: TimeFrame }) => {
  const total = useFinancedTotal(timeframe).data
  const progress = useContactProgress().data
  const average = useFinancedAverage(timeframe).data
  if (!total || !progress || !average) return <DataSectionSkeleton />

  return (
    <CardRow>
      <FinanceCard
        title="Finanziato totale"
        referencePeriod={{ total: total.reference }}
        comparisonPeriod={{ total: total.comparison }}
        windows={total.windows}
      />
      <CircleCard done={progress.done} todo={progress.todo}>
        <ProgressTitle />
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
