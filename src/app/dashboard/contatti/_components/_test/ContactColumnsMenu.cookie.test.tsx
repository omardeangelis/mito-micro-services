import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ContactColumnsMenu } from "../ContactColumnsMenu"
import { UserPreferenceContext } from "@/store/context/UserPreferenceContext"
import { createUserPreferenceStore } from "@/store/userPreferences"

// Nascondere una colonna di Contatti scrive il cookie e nient'altro (AC31)

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
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
  mocks.refresh.mockReset()
  vi.stubGlobal("fetch", fetchSpy)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("ContactColumnsMenu, cookie (AC31)", () => {
  it("nascondere una colonna chiama onChange e scrive mito-pref-cot, senza fetch né router.refresh", async () => {
    const store = createUserPreferenceStore({})
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <UserPreferenceContext.Provider value={store}>
        <ContactColumnsMenu hidden={[]} onChange={onChange} />
      </UserPreferenceContext.Provider>
    )

    await user.click(screen.getByRole("button", { name: "Colonne" }))
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(onChange).toHaveBeenCalledWith(["Telefono"])
    expect(JSON.parse(decodeURIComponent(cookie("mito-pref-cot")!))).toEqual([
      "Telefono",
    ])
    expect(cookie("mito-pref-ct")).toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
