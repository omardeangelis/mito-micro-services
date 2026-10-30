import { Navigate, useSearchParams } from "react-router"

/**
 * /dashboard/profile, where the server still sends a new user
 * (`?firstTime=true`) and the old tabs pointed (`?tab=admin`,
 * `?tab=blacklist`): each goes to its page of the settings
 */
export function Component() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get("tab")
  if (tab === "admin") return <Navigate to="/dashboard/settings/team" replace />
  if (tab === "blacklist")
    return <Navigate to="/dashboard/settings/blacklist" replace />
  const firstTime = searchParams.get("firstTime") === "true"
  return (
    <Navigate
      to={`/dashboard/settings/profile${firstTime ? "?firstTime=true" : ""}`}
      replace
    />
  )
}
