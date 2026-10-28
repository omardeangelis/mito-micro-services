import { useMemo } from "react"
import { parseTimeFrame } from "@mito/domain/constants/timeframes"
import { TimeFrameSelector } from "@/components/custom/date-picker"
import { useSearchParams } from "@/lib/navigation"
import { DataSection } from "./_components/DataSection"
import { CallsSection } from "./_components/export/CallsSection"
import { ImportLink } from "./_components/ImportLink"
import { LastUpdatedSection } from "./_components/LastUpdatedSection"

/**
 * The home of the dashboard (`/dashboard`), as `dashboard/page.tsx` of the
 * Next.js app: the cards of the time frame of the address (`?tf=`, read once
 * for the cards and the selector, AC11), the calls of each operator for the
 * admins and the practices updated last
 */
export function Component() {
  const searchParams = useSearchParams()
  const timeframe = useMemo(() => {
    // A repeated `tf` is a list, which `parseTimeFrame` doesn't take
    const values = searchParams.getAll("tf")
    return parseTimeFrame(values.length > 1 ? values : values[0])
  }, [searchParams])

  return (
    <section className="dashabord-container">
      <div className="dashabord-layout">
        <div className="relative h-[inherit]">
          <div className="dashboard-content rounded-lg bg-white">
            <div className="flex items-center justify-end gap-4">
              <ImportLink />
            </div>
            <div className="mt-8">
              <div className="flex flex-wrap items-center gap-4">
                <h2 className="text-2xl">Analisi Andamento</h2>
                <TimeFrameSelector timeframe={timeframe} />
              </div>
              <div className="mt-4">
                <DataSection timeframe={timeframe} />
              </div>
            </div>
            <CallsSection />
            <div className="mt-8">
              <h2 className="text-2xl">Ultime Pratiche Aggiornate</h2>
              <div className="mt-4">
                <LastUpdatedSection />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
