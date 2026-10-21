import { type NextRequest, NextResponse } from "next/server"
import { api } from "@/trpc/server"
import {
  type UpdateUserTableVisibleColumnsInput,
  type UpdateContactTableVisibleColumnsInput,
  type UpdateDashboardCollapsedInput,
  type UpdatePracticesTableVisibleColumnsInput,
} from "@mito/server/api/routers/user/PUT/updateUserPreference"

export const dynamic = "force-dynamic"

/**
 * ct = updateCustomerTableVisibleColumns
 * cot = updateContactTableVisibleColumns
 * pt = practiceTableVisibleColumns
 * ds = updateDashboardCollapsed
 */
type PrefParamsAcceptedValues = "ct" | "cot" | "pt" | "ds"

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

  if (key === "cot") {
    const body = (await req.json()) as UpdateContactTableVisibleColumnsInput
    await api.user.updateContactTableVisibleColumns.mutate(body)
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
