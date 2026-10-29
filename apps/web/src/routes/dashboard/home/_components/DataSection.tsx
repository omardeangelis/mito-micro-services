import { useState } from "react"
import { type TimeFrame } from "@mito/contract/analytics"
import {
  useContactProgress,
  useFinancedAverage,
  useFinancedByBranch,
  useFinancedTotal,
} from "@/api/analytics"
import { useCurrentUser } from "@/api/me"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { CardRow, DataSectionSkeleton } from "./CardRow"
import { CircleCard } from "./CircleCard"
import { DonutCard } from "./DonutCard"
import { FinanceCard } from "./FinanceCard"

const ProgressTitle = () => (
  <h2 className="text-sm text-muted-foreground">Contatti con esito</h2>
)

/**
 * The cards of "Analisi Andamento" in `timeframe`: the admin's, or the
 * operator's. The skeleton until every number of the row is there, as the
 * `Suspense` of the Next.js app
 */
export const DataSection = ({ timeframe }: { timeframe: TimeFrame }) => {
  const role = useUserPreferenceContext((state) => state.role)
  if (role === undefined) return <UnknownRole />
  if (role === "ADMIN") return <AdminDataSection timeframe={timeframe} />
  return <OperatorDataSection timeframe={timeframe} />
}

/**
 * The skeleton while the current user loads. If it failed the cards can't
 * know whose they are: the error of the route, as a failed
 * `getUserPreference` of the Next.js app
 */
const UnknownRole = () => {
  const { error, data } = useCurrentUser()
  if (error && !data) throw error
  return <DataSectionSkeleton />
}

/**
 * The time frame the row shows: `timeframe` once all its numbers are there
 * (`ready`), until then the one shown before, so the whole row changes at
 * once, as the transition of the Next.js app swapped it
 */
const useShownTimeFrame = (timeframe: TimeFrame, ready: boolean) => {
  const [shown, setShown] = useState(timeframe)
  if (ready && shown !== timeframe) setShown(timeframe)
  return ready ? timeframe : shown
}

const AdminDataSection = ({ timeframe }: { timeframe: TimeFrame }) => {
  const next = [useFinancedAverage(timeframe), useFinancedByBranch(timeframe)]
  const ready = next.every((query) => query.data !== undefined)
  const shown = useShownTimeFrame(timeframe, ready)
  const average = useFinancedAverage(shown).data
  const progress = useContactProgress().data
  const branches = useFinancedByBranch(shown).data
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
  const next = [useFinancedTotal(timeframe), useFinancedAverage(timeframe)]
  const ready = next.every((query) => query.data !== undefined)
  const shown = useShownTimeFrame(timeframe, ready)
  const total = useFinancedTotal(shown).data
  const progress = useContactProgress().data
  const average = useFinancedAverage(shown).data
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
