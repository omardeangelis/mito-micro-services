import { create } from "zustand"
import { createSelectors } from "./createSelectors"
import { type TimeFrame } from "@mito/domain/constants/timeframes"

interface AnalyticsStore {
  timeframe: TimeFrame
  setTimeframe: (timeframe: TimeFrame) => void
}

const useAnalyticsStoreBase = create<AnalyticsStore>((set) => ({
  timeframe: "30d",
  setTimeframe: (timeframe) => set({ timeframe }),
}))

export const useAnalyticsStore = createSelectors(useAnalyticsStoreBase)
