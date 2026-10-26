"use client"

import { currencyFormatter } from "@/lib/utils"
import { formatBigNumberWithCurrency } from "@/lib/utils/format"
import { Card, DeltaBar, BadgeDelta } from "@tremor/react"
import { type RouterOutputs } from "@/trpc/shared"
import { financeCardFormattingSettings } from "@mito/domain/constants/timeframes"

type ReferencePeriod = {
  total: number
}

type ComparisonPeriod = {
  total: number
}

type FinanceCardProps = {
  title: string
  referencePeriod: ReferencePeriod
  comparisonPeriod: ComparisonPeriod
  windows: RouterOutputs["analytics"]["getFinancedTotal"]["windows"]
}

export const FinanceCard = (props: FinanceCardProps) => {
  const { referencePeriod, comparisonPeriod } = props
  const hasComparison = comparisonPeriod.total !== 0
  const delta = hasComparison
    ? (referencePeriod.total - comparisonPeriod.total) / comparisonPeriod.total
    : 0

  const isIncreasePositive = delta > 0
  const deltaType =
    delta === 0 ? "unchanged" : isIncreasePositive ? "increase" : "decrease"
  const deltaValue = delta * 100
  const percentage =
    !hasComparison && referencePeriod.total !== 0
      ? "—"
      : `${deltaValue.toFixed(0)}%`
  const diff = referencePeriod.total - comparisonPeriod.total
  const { windows } = props

  return (
    <div className="w-full space-y-3">
      <Card className="mx-auto h-full w-full space-y-8">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-sm text-neutral-400">{props.title}</h2>
            <p>
              <span className="text-2xl">
                {formatBigNumberWithCurrency(referencePeriod.total)}
              </span>
            </p>
          </div>
          <BadgeDelta size="md" className="tremor-full" deltaType={deltaType}>
            {percentage}
          </BadgeDelta>
        </div>
        <div>
          <div className="flex items-end justify-between">
            <div className="flex flex-col space-y-0.5">
              <span className="text-tremor-label text-neutral-400">
                {windows.comparison.start.toLocaleDateString(
                  "it-IT",
                  financeCardFormattingSettings
                )}
              </span>
              <span className="text-tremor-label text-neutral-400">
                {formatBigNumberWithCurrency(comparisonPeriod.total)}
              </span>
            </div>
            <div className="flex flex-col space-y-0.5">
              <span className="text-tremor-label text-neutral-400">
                {windows.reference.start.toLocaleDateString(
                  "it-IT",
                  financeCardFormattingSettings
                )}
              </span>
              <span className="text-tremor-label text-neutral-400">
                {currencyFormatter(diff)}
              </span>
            </div>

            <div className="flex flex-col space-y-0.5">
              <span className="text-tremor-label text-neutral-400">
                {windows.reference.end.toLocaleDateString(
                  "it-IT",
                  financeCardFormattingSettings
                )}
              </span>
              <span className="text-tremor-label text-neutral-400">
                {formatBigNumberWithCurrency(referencePeriod.total)}
              </span>
            </div>
          </div>
          <DeltaBar value={deltaValue} className="mt-3" />
        </div>
      </Card>
    </div>
  )
}
