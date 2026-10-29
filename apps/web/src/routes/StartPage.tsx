import { Navigate } from "react-router"
import { useCurrentUser } from "@/api/me"
import { AppLoading } from "./AppLoading"

/** Where an operator without a name or surname completes the profile */
export const FIRST_ACCESS = "/dashboard/settings/profile?firstTime=true"

/**
 * `/`, as `DashboardInitialPage` of the Next.js app (2.2.2): with the
 * session (`RequireSession` around it), an operator without a name or
 * surname completes the profile first, everyone else goes to the dashboard.
 * A backend that doesn't answer leaves it to the dashboard, which shows it
 */
export function StartPage() {
  const { data, error, isPending } = useCurrentUser()
  if (isPending) return <AppLoading />
  if (error) {
    return (
      <Navigate
        to={error._tag === "NotAnOperator" ? FIRST_ACCESS : "/dashboard"}
        replace
      />
    )
  }
  const { name, surname } = data.operator
  return (
    <Navigate to={!name || !surname ? FIRST_ACCESS : "/dashboard"} replace />
  )
}
