import { LastUpdatedTableSection } from "./_components/LastUpdatedTableSection"
import { Suspense } from "react"
import { DataSection } from "./_components/DataSection"
import { TableSkeleton } from "@/components/custom/table/TableSkeleton"
import { ImportLink } from "./_components/ImportLink"
import { CallsSection } from "./_components/export/CallsSection"
import { DataSectionSkeleton } from "./_components/AdminDataSection"
import { type ServerPageProps } from "@/lib/types"
import { parseTimeFrame } from "@mito/domain/constants/timeframes"
import { TimeFrameSelector } from "@/components/custom/date-picker"

export default async function DashboardHome(
  props: ServerPageProps<{ x: never }>
) {
  const timeframe = parseTimeFrame(props.searchParams?.tf)
  return (
    <main className="dashabord-container">
      <div className="dashabord-layout">
        <div className="relative h-[inherit]">
          <div className="dashboard-content rounded-lg bg-white">
            <div className="flex items-center justify-end gap-4">
              <Suspense fallback={null}>
                <ImportLink />
              </Suspense>
            </div>
            <div className="mt-8">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl">Analisi Andamento</h2>
                <TimeFrameSelector />
              </div>
              <div className="mt-4">
                <Suspense fallback={<DataSectionSkeleton />}>
                  <DataSection timeframe={timeframe} />
                </Suspense>
              </div>
            </div>
            <Suspense fallback={<TableSkeleton rows={5} />}>
              <CallsSection />
            </Suspense>
            <div className="mt-8">
              <h2 className="text-2xl">Ultime Pratiche Aggiornate</h2>
              <div className="mt-4">
                <Suspense fallback={<TableSkeleton rows={5} />}>
                  <LastUpdatedTableSection />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
