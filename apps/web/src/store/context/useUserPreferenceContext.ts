import { useContext } from "react"
import { useStore } from "zustand"
import { UserPreferenceContext } from "./UserPreferenceContext"
import { type UserPreferenceStore } from "../userPreferences"

export function useUserPreferenceContext<T>(
  selector: (state: UserPreferenceStore) => T
): T {
  const store = useContext(UserPreferenceContext)
  if (!store) throw new Error("Missing UserPreference.Provider in the tree")
  return useStore(store, selector)
}
