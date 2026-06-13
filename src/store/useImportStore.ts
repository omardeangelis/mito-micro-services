import { create } from "zustand"
import { createSelectors } from "./createSelectors"
import { type WorkerGenericState } from "@/lib/types/workers"

interface ImportStore {
  importState: WorkerGenericState
  setImportState: (state: WorkerGenericState) => void
}

const useimportStoreBase = create<ImportStore>((set) => ({
  importState: "idle",
  setImportState: (importState) => set({ importState }),
}))

export const useImportStore = createSelectors(useimportStoreBase)
