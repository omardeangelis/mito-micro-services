import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { api } from "@/trpc/server"

/** "Nuovo import" of the dashboard: a link to the "Import" page, admins only (AC1, AC28). */
export const ImportLink = async () => {
  const { role } = await api.user.getUserPreference.query()
  if (role !== "ADMIN") return null
  return (
    <Link href="/dashboard/import" className={buttonVariants()}>
      Nuovo import
    </Link>
  )
}
