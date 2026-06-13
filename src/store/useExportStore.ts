import { create } from "zustand"
import { createSelectors } from "./createSelectors"
import { type WorkerGenericState } from "@/lib/types/workers"

interface ExportStore {
  exportState: WorkerGenericState
  setExportState: (state: WorkerGenericState) => void
  response?: string | null
  setResponse: (response: string) => void
}

const useExportStoreBase = create<ExportStore>((set) => ({
  exportState: "idle",
  setExportState: (exportState) => set({ exportState }),
  response: null,
  setResponse: (response) => set({ response }),
}))

export const useExportStore = createSelectors(useExportStoreBase)
