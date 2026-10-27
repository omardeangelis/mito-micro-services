import { TableSkeleton } from "@/components/custom/table/TableSkeleton"

/**
 * What shows while the first route loads its module (the HydrateFallback of
 * React Router): the skeleton of the dashboard, as `GenericLoading` of the
 * Next.js app
 */
export function AppLoading() {
  return (
    <div className="relative flex flex-row">
      <div className="h-screen w-16 bg-gray-100" />
      <section className="dashabord-container">
        <div className="dashbaord-layout p-4">
          <TableSkeleton rows={10} />
        </div>
      </section>
    </div>
  )
}
