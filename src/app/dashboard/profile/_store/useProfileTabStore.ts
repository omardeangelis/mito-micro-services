import { create } from "zustand"
import { createSelectors } from "@/store/createSelectors"

export type ProfileTab = "profile" | "admin" | "blacklist"

interface ProfileTabStore {
  selectedTab: ProfileTab
  setSelectedTab: (tab: ProfileTab) => void
}

const useProfileTabStoreBase = create<ProfileTabStore>((set) => ({
  selectedTab: "profile",
  setSelectedTab: (tab) => set({ selectedTab: tab }),
}))

export const useProfileTabStore = createSelectors(useProfileTabStoreBase)
