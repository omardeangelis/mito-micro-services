import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { AdminExportSection } from "./AdminExportSection"

/** The calls of each operator, with charts and the Excel file: admins only (AC6, AC20). */
export const CallsSection = () => {
  const role = useUserPreferenceContext((state) => state.role)
  if (role !== "ADMIN") return null
  return (
    <div className="mt-8">
      <h2 className="font-heading text-title">Chiamate per operatore</h2>
      <div className="mt-4">
        <AdminExportSection />
      </div>
    </div>
  )
}
