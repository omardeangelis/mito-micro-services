import { useContext } from "react"
import { createStore, useStore } from "zustand"
import { UserPreferenceContext } from "./UserPreferenceContext"
import { type UserPreferenceStore } from "../userPreferences"

// What a component sees outside the provider (a table alone, in a test)
const emptyStore = createStore<Pick<UserPreferenceStore, "preferences">>(
  () => ({ preferences: undefined })
)

/**
 * Like `useUserPreferenceContext`, but without a provider it reads an empty
 * store instead of throwing: for what seeds from the preferences when there
 * are some.
 */
export function useOptionalUserPreferenceContext<T>(
  selector: (state: Pick<UserPreferenceStore, "preferences">) => T
): T {
  const store = useContext(UserPreferenceContext)
  return useStore(store ?? emptyStore, selector)
}
