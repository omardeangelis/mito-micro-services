"use client"

import { currencyFormatter } from "@/lib/utils"
import { formatBigNumberWithCurrency } from "@mito/client/format"
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

// Il testo dei badge di Tremor (600) sta sotto il 4,5:1 sul loro fondo
const badgeText = {
  increase: "text-emerald-700",
  decrease: "text-red-700",
  unchanged: "text-orange-700",
}

export const FinanceCard = (props: FinanceCardProps) => {
  const { referencePeriod, comparisonPeriod, windows } = props
  const hasComparison = comparisonPeriod.total !== 0
  const delta = hasComparison
    ? (referencePeriod.total - comparisonPeriod.total) / comparisonPeriod.total
    : 0

  // L'indicatore segue la variazione mostrata, arrotondata (`|| 0`: niente "-0%")
  const shown = Math.round(delta * 100) || 0
  const deltaType =
    shown === 0 ? "unchanged" : shown > 0 ? "increase" : "decrease"
  const noComparison = !hasComparison && referencePeriod.total !== 0
  const percentage = shown > 999 ? "> 999%" : `${shown}%`
  const diff = referencePeriod.total - comparisonPeriod.total

  return (
    <div className="w-full space-y-3">
      <Card className="mx-auto h-full w-full space-y-8">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-sm text-neutral-500">{props.title}</h2>
            <p>
              <span className="text-2xl">
                {formatBigNumberWithCurrency(referencePeriod.total)}
              </span>
            </p>
          </div>
          <BadgeDelta
            size="md"
            className={badgeText[deltaType]}
            deltaType={deltaType}
          >
            {noComparison ? <span aria-hidden="true">—</span> : percentage}
          </BadgeDelta>
          {noComparison ? (
            <span className="sr-only">
              Variazione non calcolabile: periodo di confronto a 0
            </span>
          ) : null}
        </div>
        <div>
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col space-y-0.5">
              <span className="text-tremor-label text-neutral-500">
                {windows.comparison.start.toLocaleDateString(
                  "it-IT",
                  financeCardFormattingSettings
                )}
              </span>
              <span className="text-tremor-label text-neutral-500">
                {formatBigNumberWithCurrency(comparisonPeriod.total)}
              </span>
            </div>
            <div className="flex flex-col space-y-0.5">
              <span className="text-tremor-label text-neutral-500">
                {windows.reference.start.toLocaleDateString(
                  "it-IT",
                  financeCardFormattingSettings
                )}
              </span>
              <span className="text-tremor-label text-neutral-500">
                {currencyFormatter(diff)}
              </span>
            </div>

            <div className="flex flex-col space-y-0.5">
              <span className="text-tremor-label text-neutral-500">
                {windows.reference.end.toLocaleDateString(
                  "it-IT",
                  financeCardFormattingSettings
                )}
              </span>
              <span className="text-tremor-label text-neutral-500">
                {formatBigNumberWithCurrency(referencePeriod.total)}
              </span>
            </div>
          </div>
          <DeltaBar
            value={Math.max(-100, Math.min(100, delta * 100))}
            className="mt-3"
          />
        </div>
      </Card>
    </div>
  )
}
