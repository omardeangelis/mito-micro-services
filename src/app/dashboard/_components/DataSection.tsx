import { api } from "@/trpc/server"
import { AdminDataSection } from "./AdminDataSection"
import { OperatorDataSection } from "./OperatorDataSection"
import {
  type TimeFrame,
  DEFAULTTIMEFRAME,
} from "@mito/domain/constants/timeframes"

export const DataSection = async ({
  timeframe = DEFAULTTIMEFRAME,
}: {
  timeframe?: TimeFrame
}) => {
  const { role } = await api.user.getUserPreference.query()
  if (role === "ADMIN") return <AdminDataSection timeframe={timeframe} />
  return <OperatorDataSection timeframe={timeframe} />
}
