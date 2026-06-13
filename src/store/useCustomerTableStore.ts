import { create } from "zustand"
import { createSelectors } from "./createSelectors"

interface CustomerTableStore {
  selectedCustomer: string[]
  clearSelectedCustomer: () => void
  setSelectedCustomer: (selectedCustomer: string[]) => void
  bulkActionDialogOpen: boolean
  setBulkActionDialogOpen: (open: boolean) => void
  bulkDialagoDefaultTabValue: "chiamate" | "clienti"
  setDefaultTabValue: (tabValue: "chiamate" | "clienti") => void
}

const useCustomerTableStoreBase = create<CustomerTableStore>((set) => ({
  selectedCustomer: [],
  clearSelectedCustomer: () => set({ selectedCustomer: [] }),
  setSelectedCustomer: (selectedCustomer) => set({ selectedCustomer }),
  bulkActionDialogOpen: false,
  setBulkActionDialogOpen: (open) => set({ bulkActionDialogOpen: open }),
  bulkDialagoDefaultTabValue: "chiamate",
  setDefaultTabValue: (tabValue) =>
    set({ bulkDialagoDefaultTabValue: tabValue }),
}))

export const useCustomerTableStore = createSelectors(useCustomerTableStoreBase)
