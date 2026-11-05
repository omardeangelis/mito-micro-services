import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { useKnownCurrentUser } from "@/api/me"
import { Lavoro } from "../lavoro/LavoroPage"
import { AdminHome } from "./AdminHome"

/**
 * The home of the dashboard (`/dashboard`), by role: the admins keep theirs,
 * the operators work from the view of `lavoro`. So does a user whose `GET /me`
 * failed: its data are of who is signed in, and an error must not lead to the
 * error of the route. Until the first `GET /me` ends nothing shows, so an admin
 * never starts the four reads of the view; after a failure the view stays,
 * also while it is read again, which takes `isError` away
 */
export function Component() {
  const role = useUserPreferenceContext((state) => state.role)
  const { errorUpdatedAt } = useKnownCurrentUser()
  if (role === "ADMIN") return <AdminHome />
  if (role === undefined && errorUpdatedAt === 0) return null
  return <Lavoro />
}
