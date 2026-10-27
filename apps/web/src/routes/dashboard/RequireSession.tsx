import { type PropsWithChildren } from "react"
import { Navigate } from "react-router"
import { authClient } from "@/lib/authClient"
import { AppLoading } from "@/routes/AppLoading"

/**
 * The guard of /dashboard (F6): without a session the login, as
 * `getPageSession` of the Next.js app. It only spares a page that would fail:
 * every call to the backend checks the session again. A session that can't
 * be read (the backend unreachable) is no session
 */
export function RequireSession({ children }: PropsWithChildren) {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return <AppLoading />
  if (!session) return <Navigate to="/login" replace />
  return children
}
