import { Outlet } from "react-router"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { UserPreferenceProvider } from "@/store/context/UserPreferenceContext"
import { ImportStatusProvider } from "./import/ImportStatus"
import { RequireSession } from "./RequireSession"

/**
 * The layout of /dashboard, as `dashboard/layout.tsx` of the Next.js app:
 * the guard, the preferences, the notice of an import's end, the sidebar and
 * the page, on its sheet
 */
export function DashboardShell() {
  return (
    <RequireSession>
      <UserPreferenceProvider>
        <ImportStatusProvider>
          <main className="bg-sidebar relative flex flex-row">
            <DashboardLayout />
            {/* The sheet of every page (D17): 8 px from the top, right and
                bottom of the window, no line between it and the sidebar */}
            <div className="rounded-sheet my-2 mr-2 h-[calc(100dvh-16px)] min-w-0 flex-1 overflow-hidden border border-border bg-card shadow-card">
              <Outlet />
            </div>
          </main>
        </ImportStatusProvider>
      </UserPreferenceProvider>
    </RequireSession>
  )
}
