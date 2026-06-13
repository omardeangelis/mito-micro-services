import { api } from "@/trpc/server"
import { AdminDataSection } from "./AdminDataSection"
import { OperatorDataSection } from "./OperatorDataSection"
import { type TimeFrame, DEFUALTTIMEFRAME } from "@/lib/constants/timeframes"

export const DataSection = async ({
  timeframe = DEFUALTTIMEFRAME,
}: {
  timeframe?: TimeFrame
}) => {
  const { role } = await api.user.getUserPreference.query()
  if (role === "ADMIN") return <AdminDataSection timeframe={timeframe} />
  return <OperatorDataSection timeframe={timeframe} />
}
