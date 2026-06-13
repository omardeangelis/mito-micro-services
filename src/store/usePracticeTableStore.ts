import { create } from "zustand"
import { createSelectors } from "./createSelectors"

interface PracticeTableStore {
  selectedPractice: string[]
  clearSelectedPractice: () => void
  setSelectedPractice: (selectedPractice: string[]) => void
  bulkActionDialogOpen: boolean
  setBulkActionDialogOpen: (open: boolean) => void
}

const usePracticeTableStoreBase = create<PracticeTableStore>((set) => ({
  selectedPractice: [],
  clearSelectedPractice: () => set({ selectedPractice: [] }),
  setSelectedPractice: (selectedPractice) => set({ selectedPractice }),
  bulkActionDialogOpen: false,
  setBulkActionDialogOpen: (open) => set({ bulkActionDialogOpen: open }),
}))

export const usePracticeTableStore = createSelectors(usePracticeTableStoreBase)
