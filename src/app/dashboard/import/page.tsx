import { notFound } from "next/navigation"
import { api } from "@/trpc/server"
import { ImportHistory } from "./_components/ImportHistory"
import { NewImport } from "./_components/NewImport"

/**
 * The "Import" page: a new import and the history, admins only (AC1, AC28).
 * The session has no role, so it comes from the user's row, as for the calls
 * of the dashboard; the procedures check it again (AC2).
 */
export default async function ImportPage() {
  const { role } = await api.user.getUserPreference.query()
  if (role !== "ADMIN") notFound()
  return (
    <main className="dashabord-container">
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
    </main>
  )
}
