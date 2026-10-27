import { create } from "zustand"
import { createSelectors } from "./createSelectors"
import {
  DEFAULTTIMEFRAME,
  type TimeFrame,
} from "@mito/domain/constants/timeframes"

interface AnalyticsStore {
  timeframe: TimeFrame
  setTimeframe: (timeframe: TimeFrame) => void
}

const useAnalyticsStoreBase = create<AnalyticsStore>((set) => ({
  timeframe: DEFAULTTIMEFRAME,
  setTimeframe: (timeframe) => set({ timeframe }),
}))

export const useAnalyticsStore = createSelectors(useAnalyticsStoreBase)
