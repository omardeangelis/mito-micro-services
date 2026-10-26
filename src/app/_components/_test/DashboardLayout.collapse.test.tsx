import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DashboardLayout } from "../DashboardLayout"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"

// Aprire e chiudere la barra laterale è subito, e resta nel browser (AC31)

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }))
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}))
vi.mock("../../_context/ExportWorker", () => ({
  useHandleExportWorkerStates: () => undefined,
}))

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

const fetchSpy = vi.fn()

beforeEach(() => {
  clearCookies()
  fetchSpy.mockReset()
  vi.stubGlobal("fetch", fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("DashboardLayout, barra laterale nel cookie (AC31)", () => {
  it("chiudere e riaprire cambia subito la barra, scrive mito-pref-ds e non fa nessuna fetch", async () => {
    const store = createUserPreferenceStore({})
    const user = userEvent.setup()
    render(
      <UserPreferenceContext.Provider value={store}>
        <DashboardLayout />
      </UserPreferenceContext.Provider>
    )
    expect(screen.queryByText("Mito SRL")).not.toBeNull()
    const toggle = screen.getAllByRole("button").at(-1)!

    await user.click(toggle)

    expect(screen.queryByText("Mito SRL")).toBeNull()
    expect(cookie("mito-pref-ds")).toBe("true")

    await user.click(toggle)

    expect(screen.queryByText("Mito SRL")).not.toBeNull()
    expect(cookie("mito-pref-ds")).toBe("false")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("parte chiusa se il cookie dice chiusa", () => {
    document.cookie = "mito-pref-ds=true; path=/"
    const store = createUserPreferenceStore({})
    render(
      <UserPreferenceContext.Provider value={store}>
        <DashboardLayout />
      </UserPreferenceContext.Provider>
    )

    expect(screen.queryByText("Mito SRL")).toBeNull()
  })
})
