import { Outlet } from "react-router"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { UserPreferenceProvider } from "@/store/context/UserPreferenceContext"
import { RequireSession } from "./RequireSession"

/**
 * The layout of /dashboard, as `dashboard/layout.tsx` of the Next.js app:
 * the guard, the preferences, the sidebar and the page.
 * `ImportStatusProvider` arrives with the import (3.6)
 */
export function DashboardShell() {
  return (
    <RequireSession>
      <UserPreferenceProvider>
        <main className="relative flex flex-row">
          <DashboardLayout />
          <Outlet />
        </main>
      </UserPreferenceProvider>
    </RequireSession>
  )
}
