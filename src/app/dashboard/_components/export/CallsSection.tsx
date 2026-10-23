import { api } from "@/trpc/server"
import { AdminExportSection } from "./AdminExportSection"

/** The calls of each operator, with charts and the Excel file: admins only (AC6, AC20). */
export const CallsSection = async () => {
  const { role } = await api.user.getUserPreference.query()
  if (role !== "ADMIN") return null
  return (
    <div className="mt-8">
      <h2 className="text-2xl">Chiamate per operatore</h2>
      <div className="mt-4">
        <AdminExportSection />
      </div>
    </div>
  )
}
