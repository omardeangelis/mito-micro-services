import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  type Operator,
  type User,
  type UserPreference,
} from "@/lib/types/schemas"
export interface UserPreferenceStore {
  preferences?: UserPreference
  role?: User["role"]
  operatorId?: Operator["id"]
  setOperatorId: (operatorId: Operator["id"]) => void
  setRole: (role: User["role"]) => void
  setDashboardCollapsed: (collapsed: boolean) => void
  setCustomerTableVisibleColumns: (columns: string[]) => void
  setPracticesTableVisibleColumns: (columns: string[]) => void
  setContactTableVisibleColumns: (columns: string[]) => void
  logout: () => void
}

export type UserPreferenceInitProps = {
  preferences?: UserPreference
  role?: User["role"]
  operatorId?: Operator["id"]
}

export const createUserPreferenceStore = (
  initProps: UserPreferenceInitProps
) => {
  return create(
    persist<
      UserPreferenceStore,
      [],
      [],
      Pick<UserPreferenceStore, "preferences">
    >(
      (set) => ({
        setRole: (role: User["role"]) => set({ role }),
        setOperatorId: (operatorId: Operator["id"]) => set({ operatorId }),
        logout: () => {
          set(
            (state) => ({
              ...state,
              preferences: state.preferences,
              role: undefined,
              operatorId: undefined,
            }),
            true
          )
        },
        preferences: initProps.preferences,
        role: initProps.role,
        operatorId: initProps.operatorId,
        setDashboardCollapsed: (collapsed: boolean) =>
          set((state) => ({
            ...state,
            preferences: {
              ...state.preferences,
              dashboardCollapsed: collapsed,
              practicesTableVisibleColumns:
                state.preferences?.practicesTableVisibleColumns ?? [],
              customerTableVisibleColumns:
                state.preferences?.customerTableVisibleColumns ?? [],
            },
          })),
        setCustomerTableVisibleColumns: (columns: string[]) => {
          set((state) => ({
            ...state,
            preferences: {
              ...state.preferences,
              practicesTableVisibleColumns:
                state.preferences?.practicesTableVisibleColumns ?? [],
              dashboardCollapsed:
                state.preferences?.dashboardCollapsed ?? false,
              customerTableVisibleColumns: columns,
            },
          }))
        },
        setPracticesTableVisibleColumns: (columns: string[]) => {
          set((state) => ({
            ...state,
            preferences: {
              ...state.preferences,
              dashboardCollapsed:
                state.preferences?.dashboardCollapsed ?? false,
              customerTableVisibleColumns:
                state.preferences?.customerTableVisibleColumns ?? [],
              practicesTableVisibleColumns: columns,
            },
          }))
        },
        setContactTableVisibleColumns: (columns: string[]) => {
          set((state) => ({
            ...state,
            preferences: {
              ...state.preferences,
              dashboardCollapsed:
                state.preferences?.dashboardCollapsed ?? false,
              customerTableVisibleColumns:
                state.preferences?.customerTableVisibleColumns ?? [],
              practicesTableVisibleColumns:
                state.preferences?.practicesTableVisibleColumns ?? [],
              contactTableVisibleColumns: columns,
            },
          }))
        },
      }),
      {
        name: "userPreference-storage",
        // name of the item in the storage (must be unique)
        // Only the table preferences stay in the browser: the role and the
        // operator come from the session (`UserPreferenceProvider`), and the
        // ones an earlier sign-in saved here are ignored
        partialize: (state) => ({ preferences: state.preferences }),
        merge: (persisted, current) => ({
          ...current,
          preferences:
            (persisted as Partial<UserPreferenceStore> | undefined)
              ?.preferences ?? current.preferences,
        }),
      }
    )
  )
}

export type UserPreferenceStoreType = ReturnType<
  typeof createUserPreferenceStore
>
