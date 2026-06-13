import { create } from "zustand"
import { createSelectors } from "./createSelectors"
import { type TimeFrame } from "@/lib/constants/timeframes"

interface AnalitycsStore {
  timeframe: TimeFrame
  setTimeframe: (timeframe: TimeFrame) => void
}

const useAnalitycsStoreBase = create<AnalitycsStore>((set) => ({
  timeframe: "30d",
  setTimeframe: (timeframe) => set({ timeframe }),
}))

export const useAnalitycsStore = createSelectors(useAnalitycsStoreBase)
