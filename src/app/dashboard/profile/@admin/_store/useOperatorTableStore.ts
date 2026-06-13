import { create } from "zustand"
import { createSelectors } from "@/store/createSelectors"
import { type OperatorWithRole } from "@/lib/types/schemas"

type OperatorItem = Pick<OperatorWithRole, "id" | "role">

interface OperatorTableStore {
  operatorsToEdit: OperatorItem[]
  addOperatorToEdit: (operator: OperatorItem) => void
  clearOperatorsToEdit: () => void
}

const useOperatorTableStoreBase = create<OperatorTableStore>((set) => ({
  operatorsToEdit: [],
  addOperatorToEdit: (operator) =>
    set((state) => {
      const dedupeOperator = state.operatorsToEdit.find(
        (op) => op.id === operator.id
      )?.id
      if (dedupeOperator) {
        return {
          operatorsToEdit: state.operatorsToEdit.map((op) =>
            op.id === dedupeOperator
              ? {
                  ...op,
                  role: operator.role,
                }
              : op
          ),
        }
      }
      return { operatorsToEdit: [...state.operatorsToEdit, operator] }
    }),
  clearOperatorsToEdit: () => set({ operatorsToEdit: [] }),
}))

export const useOperatorTableStore = createSelectors(useOperatorTableStoreBase)
