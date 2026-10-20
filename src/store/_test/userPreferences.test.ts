import { beforeEach, describe, expect, it } from "vitest"
import { createUserPreferenceStore } from "../userPreferences"

const preferences = {
  dashboardCollapsed: true,
  customerTableVisibleColumns: ["id"],
  practicesTableVisibleColumns: ["Sede"],
  contactTableVisibleColumns: ["CF"],
}

beforeEach(() => {
  localStorage.clear()
})

describe("le preferenze delle colonne di Contatti nello store (AC5)", () => {
  it("il setter nuovo cambia solo le colonne di Contatti e non cancella le altre chiavi", () => {
    const store = createUserPreferenceStore({ preferences })

    store.getState().setContactTableVisibleColumns(["Telefono", "CF"])

    expect(store.getState().preferences).toEqual({
      dashboardCollapsed: true,
      customerTableVisibleColumns: ["id"],
      practicesTableVisibleColumns: ["Sede"],
      contactTableVisibleColumns: ["Telefono", "CF"],
    })
  })

  it("parte da preferenze che non l'hanno mai salvata (undefined) senza perdere il resto", () => {
    const { contactTableVisibleColumns: _never, ...withoutContacts } =
      preferences
    const store = createUserPreferenceStore({ preferences: withoutContacts })

    store.getState().setContactTableVisibleColumns(["Telefono"])

    expect(store.getState().preferences).toEqual({
      ...withoutContacts,
      contactTableVisibleColumns: ["Telefono"],
    })
  })

  it("gli altri setter non cancellano le colonne di Contatti", () => {
    const store = createUserPreferenceStore({ preferences })

    store.getState().setCustomerTableVisibleColumns(["Sede"])
    store.getState().setPracticesTableVisibleColumns(["Nome"])
    store.getState().setDashboardCollapsed(false)

    expect(store.getState().preferences?.contactTableVisibleColumns).toEqual([
      "CF",
    ])
  })

  it("si salva nel browser insieme alle altre", () => {
    const store = createUserPreferenceStore({ preferences })

    store.getState().setContactTableVisibleColumns(["Telefono"])

    const saved = JSON.parse(
      localStorage.getItem("userPreference-storage") ?? "null"
    ) as { state: { preferences: Record<string, unknown> } }
    expect(saved.state.preferences.contactTableVisibleColumns).toEqual([
      "Telefono",
    ])
    expect(saved.state.preferences.dashboardCollapsed).toBe(true)
  })
})
