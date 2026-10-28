import { useCurrentUser } from "@/api/me"
import { NotFound } from "@/routes/NotFound"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { ImportHistory } from "./_components/ImportHistory"
import { NewImport } from "./_components/NewImport"

/**
 * The "Import" page, as `dashboard/import/page.tsx` of the Next.js app: a new
 * import and the history, admins only (AC1, AC28). An operator gets the page
 * that doesn't exist, as `notFound()`; the endpoints check the role again
 * (AC2)
 */
export function Component() {
  const role = useUserPreferenceContext((state) => state.role)
  if (role === undefined) return <UnknownRole />
  if (role !== "ADMIN") return <NotFound />
  return (
    <section className="dashabord-container">
      <div className="dashabord-layout">
        <div className="dashboard-content rounded-lg bg-white">
          <h1 className="text-2xl">Import</h1>
          <section aria-labelledby="new-import" className="mt-6">
            <h2 id="new-import" className="text-xl">
              Nuovo import
            </h2>
            <div className="mt-4">
              <NewImport />
            </div>
          </section>
          <section aria-labelledby="import-history" className="mt-10">
            <h2 id="import-history" className="text-xl">
              Storico degli import
            </h2>
            <div className="mt-4">
              <ImportHistory />
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

/**
 * Nothing until the role is known. If the current user failed the page can't
 * know it's an admin's: the error of the route, as a failed
 * `getUserPreference` of the Next.js app
 */
const UnknownRole = () => {
  const { error, data } = useCurrentUser()
  if (error && !data) throw error
  return null
}
