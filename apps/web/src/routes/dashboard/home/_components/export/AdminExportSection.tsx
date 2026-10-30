import { useState } from "react"
import { useCallStats } from "@/api/export"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  COMPLETE_DATA_SINCE,
  defaultPeriod,
  exportPeriodInput,
  selectableDays,
  startsBeforeCompleteData,
} from "@mito/domain/export/period"
import { ExportPeriod } from "./ExportPeriod"
import { ExportKpis } from "./ExportKpis"
import { ExportCharts } from "./ExportCharts"
import { ExportDownload } from "./ExportDownload"

const italianDay = (day: string) => day.split("-").reverse().join("/")

/**
 * The calls export of the admins: one request for the chosen period, shared
 * by the indicators, the charts and the file, so they show the same numbers
 * (AC16, AC19).
 */
export function AdminExportSection() {
  // Read at every render: a page left open past midnight moves on to the new day
  const now = new Date()
  const { first, last } = selectableDays(now)
  const [period, setPeriod] = useState(() => defaultPeriod(now))
  const valid = exportPeriodInput(now).safeParse(period).success
  const { data, isLoading, isError, refetch } = useCallStats(period, {
    enabled: valid,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ExportPeriod
          period={period}
          first={first}
          last={last}
          onChange={setPeriod}
        />
        {valid && data && data.totals.calls > 0 && (
          <ExportDownload stats={data} period={period} />
        )}
      </div>
      {startsBeforeCompleteData(period) && (
        <p role="status" className="text-warning-soft-foreground text-sm">
          Dati completi solo dal {italianDay(COMPLETE_DATA_SINCE)}
        </p>
      )}
      {!valid ? (
        <p role="alert" className="text-destructive-text text-sm">
          Scegli un periodo tra il {italianDay(first)} e il {italianDay(last)}
        </p>
      ) : isError ? (
        <div
          role="alert"
          className="text-destructive-text flex items-center gap-4 text-sm"
        >
          Non è stato possibile caricare le chiamate del periodo
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Riprova
          </Button>
        </div>
      ) : isLoading || !data ? (
        <Skeleton className="h-48 w-full rounded-md" />
      ) : (
        <>
          <ExportKpis totals={data.totals} />
          {data.totals.calls === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna chiamata nel periodo
            </p>
          ) : (
            <ExportCharts rows={data.rows} />
          )}
        </>
      )}
    </div>
  )
}
