import { type NextRequest, NextResponse } from "next/server"
import { api } from "@/trpc/server"
import {
  type UpdateUserTableVisibleColumnsInput,
  type UpdateDashboardCollapsedInput,
  type UpdatePracticesTableVisibleColumnsInput,
} from "@/server/api/routers/user/PUT/updateUserPreference"

export const dynamic = "force-dynamic"

/**
 * ct = updateCustomerTableVisibleColumns
 * pt = practiceTableVisibleColumns
 * ds = updateDashboardCollapsed
 */
type PrefParamsAcceptedValues = "ct" | "pt" | "ds"

const handler = async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get("pref") as PrefParamsAcceptedValues
  if (!key) {
    return NextResponse.json({ error: "Missing pref" }, { status: 400 })
  }

  if (key === "ct") {
    const body = (await req.json()) as UpdateUserTableVisibleColumnsInput
    await api.user.updateCustomerTableVisibleColumns.mutate(body)
    return NextResponse.json({ message: "OK" })
  }

  if (key === "ds") {
    const body = (await req.json()) as UpdateDashboardCollapsedInput
    await api.user.updateDashboardCollapsed.mutate(body)
    return NextResponse.json({ message: "OK" })
  }

  if (key === "pt") {
    const body = (await req.json()) as UpdatePracticesTableVisibleColumnsInput
    await api.user.updatePracticesTableVisibleColumns.mutate(body)
    return NextResponse.json({ message: "OK" })
  }

  return NextResponse.json(
    { message: "Missing implementation" },
    { status: 500 }
  )
}

export { handler as POST }
