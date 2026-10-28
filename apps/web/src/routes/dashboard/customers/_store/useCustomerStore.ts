import { create } from "zustand"
import { createSelectors } from "@/store/createSelectors"

export type FilterOptions = "search" | "filter"

export interface CustomerState {
  filterOption: FilterOptions[]
  setFilterOption: (options: FilterOptions[]) => void
}

export const useCustomerStore = create<CustomerState>((set) => ({
  filterOption: ["search", "filter"],
  setFilterOption: (options: FilterOptions[]) =>
    set((state) => ({ ...state, filterOption: options })),
}))

export const useCustomerSelectors = createSelectors(useCustomerStore)
