import { getServerAuthSession } from "@/server/auth"
import { redirect } from "next/navigation"
import { api } from "@/trpc/server"

export async function DashboardInitialPage() {
  const session = await getServerAuthSession()
  if (!session?.user.name) {
    return redirect("/login")
  }
  const operator = await api.operator.getUserPublicOperator.query()
  if (!operator) {
    return redirect("dashboard/profile?firstTime=true")
  }
  if (!operator.name || !operator.surname) {
    return redirect("dashboard/profile?firstTime=true")
  }
  redirect("/dashboard")
}
