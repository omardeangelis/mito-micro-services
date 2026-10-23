import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useActor } from "@/components/custom/contact/useActor"
import { UserPreferenceProvider } from "../UserPreferenceContext"

type Preference = {
  role: "ADMIN" | "OPERATORE"
  operatorId: number
  preferences: {
    dashboardCollapsed: boolean
    customerTableVisibleColumns: string[]
    practicesTableVisibleColumns: string[]
  }
}

const mocks = vi.hoisted(() => ({
  query: { data: undefined, isLoading: true } as {
    data: Preference | undefined
    isLoading: boolean
  },
}))

vi.mock("@/trpc/react", () => ({
  api: {
    user: { getUserPreference: { useQuery: () => mocks.query } },
  },
}))

const STORAGE_KEY = "userPreference-storage"

const preferences = {
  dashboardCollapsed: false,
  customerTableVisibleColumns: ["id"],
  practicesTableVisibleColumns: [],
}

function Actor() {
  const actor = useActor()
  return <p>{actor ? `${actor.role} ${actor.operatorId}` : "nessuno"}</p>
}

const cookie = (name: string) => {
  const value = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)
  return value === undefined
    ? undefined
    : (JSON.parse(decodeURIComponent(value)) as unknown)
}

const clearCookies = () => {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

describe("UserPreferenceProvider", () => {
  beforeEach(() => {
    localStorage.clear()
    clearCookies()
    mocks.query = { data: undefined, isLoading: true }
  })

  it("uses the signed-in user, not the one an earlier sign-in left in the browser", () => {
    // Federica signed in first in this browser
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { preferences, role: "OPERATORE", operatorId: 1001 },
        version: 0,
      })
    )

    const { rerender } = render(
      <UserPreferenceProvider>
        <Actor />
      </UserPreferenceProvider>
    )
    // Then the admin signed in
    mocks.query = {
      data: { role: "ADMIN", operatorId: 1000, preferences },
      isLoading: false,
    }
    rerender(
      <UserPreferenceProvider>
        <Actor />
      </UserPreferenceProvider>
    )

    expect(screen.getByText("ADMIN 1000")).not.toBeNull()
  })

  it("follows the user when the session changes after the first load", () => {
    mocks.query = {
      data: { role: "OPERATORE", operatorId: 1001, preferences },
      isLoading: false,
    }
    const { rerender } = render(
      <UserPreferenceProvider>
        <Actor />
      </UserPreferenceProvider>
    )
    expect(screen.getByText("OPERATORE 1001")).not.toBeNull()

    // Refetched (on focus) after another sign-in in the same browser
    mocks.query = {
      data: { role: "ADMIN", operatorId: 1000, preferences },
      isLoading: false,
    }
    act(() => {
      rerender(
        <UserPreferenceProvider>
          <Actor />
        </UserPreferenceProvider>
      )
    })

    expect(screen.getByText("ADMIN 1000")).not.toBeNull()
  })

  it("keeps the table preferences in the cookies, not who the user is", () => {
    mocks.query = {
      data: { role: "ADMIN", operatorId: 1000, preferences },
      isLoading: false,
    }
    render(
      <UserPreferenceProvider>
        <Actor />
      </UserPreferenceProvider>
    )

    expect(cookie("mito-pref-ds")).toBe(false)
    expect(cookie("mito-pref-ct")).toEqual(["id"])
    expect(cookie("mito-pref-pt")).toEqual([])
    expect(document.cookie).not.toContain("ADMIN")
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
