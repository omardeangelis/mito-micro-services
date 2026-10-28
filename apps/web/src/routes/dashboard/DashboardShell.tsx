import { Outlet } from "react-router"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { UserPreferenceProvider } from "@/store/context/UserPreferenceContext"
import { ImportStatusProvider } from "./import/ImportStatus"
import { RequireSession } from "./RequireSession"

/**
 * The layout of /dashboard, as `dashboard/layout.tsx` of the Next.js app:
 * the guard, the preferences, the notice of an import's end, the sidebar and
 * the page
 */
export function DashboardShell() {
  return (
    <RequireSession>
      <UserPreferenceProvider>
        <ImportStatusProvider>
          <main className="relative flex flex-row">
            <DashboardLayout />
            <Outlet />
          </main>
        </ImportStatusProvider>
      </UserPreferenceProvider>
    </RequireSession>
  )
}
