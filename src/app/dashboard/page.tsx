import { LastUpdatedTableSection } from "./_components/LastUpdatedTableSection"
import { Suspense } from "react"
import { DataSection } from "./_components/DataSection"
import { TableSkeleton } from "@/components/custom/table/TableSkeleton"
import { WorkerImportDialog } from "./_components/WorkerImportDialog"
import { ExportDialog } from "./_components/ExportDialog"
import { DataSectionSkeleton } from "./_components/AdminDataSection"
import { type ServerPageProps } from "@/lib/types"
import { DEFUALTTIMEFRAME, type TimeFrame } from "@/lib/constants/timeframes"
import { TimeFrameSelector } from "@/components/custom/date-picker"

export default async function DashboardHome(
  props: ServerPageProps<{ x: never }>
) {
  const { tf } = props.searchParams ?? { tf: DEFUALTTIMEFRAME }
  return (
    <main className="dashabord-container">
      <div className="dashabord-layout">
        <div className="relative h-[inherit]">
          <div className="dashboard-content rounded-lg bg-white">
            <div className="flex items-center justify-end gap-4">
              <WorkerImportDialog />
              <ExportDialog />
            </div>
            <div className="mt-8">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl">Analisi Andamento</h2>
                <TimeFrameSelector />
              </div>
              <div className="mt-4">
                <Suspense fallback={<DataSectionSkeleton />}>
                  <DataSection timeframe={tf as TimeFrame} />
                </Suspense>
              </div>
            </div>
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
