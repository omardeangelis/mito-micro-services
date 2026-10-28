import { Link } from "react-router"
import { buttonVariants } from "@/components/ui/button"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

/** "Nuovo import" of the dashboard: a link to the "Import" page, admins only (AC1, AC28). */
export const ImportLink = () => {
  const role = useUserPreferenceContext((state) => state.role)
  if (role !== "ADMIN") return null
  return (
    <Link to="/dashboard/import" className={buttonVariants()}>
      Nuovo import
    </Link>
  )
}
