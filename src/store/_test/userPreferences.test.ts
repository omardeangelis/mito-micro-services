import { beforeEach, describe, expect, it, vi } from "vitest"
import { createUserPreferenceStore } from "../userPreferences"

const preferences = {
  dashboardCollapsed: true,
  customerTableVisibleColumns: ["id"],
  practicesTableVisibleColumns: ["Sede"],
  contactTableVisibleColumns: ["CF"],
}

const cookie = (name: string) =>
  document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)

const clearCookies = () => {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

beforeEach(() => {
  localStorage.clear()
  clearCookies()
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

  it("si salva nel cookie suo, e solo in quello (AC31)", () => {
    const store = createUserPreferenceStore({ preferences })

    store.getState().setContactTableVisibleColumns(["Telefono"])

    expect(JSON.parse(decodeURIComponent(cookie("mito-pref-cot")!))).toEqual([
      "Telefono",
    ])
    expect(cookie("mito-pref-ds")).toBeUndefined()
    expect(cookie("mito-pref-ct")).toBeUndefined()
    expect(cookie("mito-pref-pt")).toBeUndefined()
  })
})

describe("le preferenze nei cookie (AC31, AC33)", () => {
  it("ogni setter scrive solo il suo cookie", () => {
    const store = createUserPreferenceStore({})

    store.getState().setDashboardCollapsed(true)
    expect(cookie("mito-pref-ds")).toBe("true")
    expect(cookie("mito-pref-ct")).toBeUndefined()

    store.getState().setCustomerTableVisibleColumns(["Sede"])
    store.getState().setPracticesTableVisibleColumns(["Nome"])
    expect(JSON.parse(decodeURIComponent(cookie("mito-pref-ct")!))).toEqual([
      "Sede",
    ])
    expect(JSON.parse(decodeURIComponent(cookie("mito-pref-pt")!))).toEqual([
      "Nome",
    ])
    expect(cookie("mito-pref-cot")).toBeUndefined()
  })

  it("un setter non inventa le chiavi che non ha: restano assenti", () => {
    const store = createUserPreferenceStore({})

    store.getState().setDashboardCollapsed(true)

    expect(store.getState().preferences).toEqual({ dashboardCollapsed: true })
  })

  it("parte dai cookie del browser, che vincono su quello che dà il server", () => {
    document.cookie = `mito-pref-ct=${encodeURIComponent(JSON.stringify(["Sede"]))}; path=/`

    const store = createUserPreferenceStore({ preferences })

    expect(store.getState().preferences).toEqual({
      ...preferences,
      customerTableVisibleColumns: ["Sede"],
    })
  })

  it("un cookie illeggibile vale come assente: resta il valore del server", () => {
    document.cookie = "mito-pref-ct=%E0%A4%A; path=/"

    const store = createUserPreferenceStore({ preferences })

    expect(store.getState().preferences?.customerTableVisibleColumns).toEqual([
      "id",
    ])
  })

  it("il logout cancella i quattro cookie e le preferenze, e chi è l'operatore", () => {
    const store = createUserPreferenceStore({
      preferences,
      role: "ADMIN",
      operatorId: 1,
    })
    store.getState().setDashboardCollapsed(false)
    store.getState().setCustomerTableVisibleColumns(["Sede"])
    store.getState().setPracticesTableVisibleColumns(["Nome"])
    store.getState().setContactTableVisibleColumns(["CF"])
    expect(document.cookie).toContain("mito-pref-cot")

    store.getState().logout()

    expect(document.cookie).not.toContain("mito-pref-")
    expect(store.getState().preferences).toBeUndefined()
    expect(store.getState().role).toBeUndefined()
    expect(store.getState().operatorId).toBeUndefined()
  })

  it("toglie il vecchio elemento del localStorage, e non si rompe se lo storage tira", () => {
    localStorage.setItem("userPreference-storage", "{}")
    createUserPreferenceStore({})
    expect(localStorage.getItem("userPreference-storage")).toBeNull()

    const spy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("storage bloccato")
      })
    expect(() => createUserPreferenceStore({})).not.toThrow()
    spy.mockRestore()
  })
})
