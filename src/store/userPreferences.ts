import { create } from "zustand"
import {
  type Operator,
  type User,
  type UserPreference,
} from "@mito/domain/schemas"
import {
  clearPreferenceCookies,
  readBrowserPreferences,
  writePreferenceCookie,
} from "@mito/client/preferences/cookies"

export interface UserPreferenceStore {
  preferences?: Partial<UserPreference>
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
  preferences?: Partial<UserPreference>
  role?: User["role"]
  operatorId?: Operator["id"]
}

/** The item the preferences were kept in before they moved to cookies. */
const LEGACY_STORAGE_KEY = "userPreference-storage"

function removeLegacyStorage() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Storage can be blocked: there is nothing to remove then
  }
}

export const createUserPreferenceStore = (
  initProps: UserPreferenceInitProps
) => {
  removeLegacyStorage()
  // The cookies of the browser win over what the server gave
  const cookiePreferences = readBrowserPreferences()
  const hasPreferences =
    initProps.preferences !== undefined ||
    Object.keys(cookiePreferences).length > 0
  const initial = hasPreferences
    ? { ...initProps.preferences, ...cookiePreferences }
    : undefined

  return create<UserPreferenceStore>((set) => ({
    setRole: (role: User["role"]) => set({ role }),
    setOperatorId: (operatorId: Operator["id"]) => set({ operatorId }),
    logout: () => {
      // The next sign-in in this browser starts from the default layout
      clearPreferenceCookies()
      set(
        (state) => ({
          ...state,
          preferences: undefined,
          role: undefined,
          operatorId: undefined,
        }),
        true
      )
    },
    preferences: initial,
    role: initProps.role,
    operatorId: initProps.operatorId,
    setDashboardCollapsed: (collapsed: boolean) => {
      writePreferenceCookie("dashboardCollapsed", collapsed)
      set((state) => ({
        preferences: { ...state.preferences, dashboardCollapsed: collapsed },
      }))
    },
    setCustomerTableVisibleColumns: (columns: string[]) => {
      writePreferenceCookie("customerTableVisibleColumns", columns)
      set((state) => ({
        preferences: {
          ...state.preferences,
          customerTableVisibleColumns: columns,
        },
      }))
    },
    setPracticesTableVisibleColumns: (columns: string[]) => {
      writePreferenceCookie("practicesTableVisibleColumns", columns)
      set((state) => ({
        preferences: {
          ...state.preferences,
          practicesTableVisibleColumns: columns,
        },
      }))
    },
    setContactTableVisibleColumns: (columns: string[]) => {
      writePreferenceCookie("contactTableVisibleColumns", columns)
      set((state) => ({
        preferences: {
          ...state.preferences,
          contactTableVisibleColumns: columns,
        },
      }))
    },
  }))
}

export type UserPreferenceStoreType = ReturnType<
  typeof createUserPreferenceStore
>
