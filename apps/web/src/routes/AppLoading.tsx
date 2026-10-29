import { TableSkeleton } from "@/components/custom/table/TableSkeleton"

/**
 * What shows while the first route loads its module (the HydrateFallback of
 * React Router): the skeleton of the dashboard, as `GenericLoading` of the
 * Next.js app. It sits outside the shell, so it draws the sheet itself
 */
export function AppLoading() {
  return (
    <div className="bg-sidebar relative flex flex-row">
      <div className="bg-sidebar h-screen w-16" />
      <div className="rounded-sheet my-2 mr-2 h-[calc(100dvh-16px)] min-w-0 flex-1 overflow-hidden border border-border bg-card shadow-card">
        <section className="dashabord-container">
          <div className="dashbaord-layout p-4">
            <TableSkeleton rows={10} />
          </div>
        </section>
      </div>
    </div>
  )
}
