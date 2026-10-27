import { Outlet } from "react-router"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { UserPreferenceProvider } from "@/store/context/UserPreferenceContext"

/**
 * The layout of /dashboard, as `dashboard/layout.tsx` of the Next.js app:
 * the preferences, the sidebar and the page. The guard arrives with 1.c.2,
 * `ImportStatusProvider` with the import (3.6)
 */
export function DashboardShell() {
  return (
    <UserPreferenceProvider>
      <main className="relative flex flex-row">
        <DashboardLayout />
        <Outlet />
      </main>
    </UserPreferenceProvider>
  )
}
