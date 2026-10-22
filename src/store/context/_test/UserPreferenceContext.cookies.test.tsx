import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { UserPreferenceProvider } from "../UserPreferenceContext"
import { useUserPreferenceContext } from "../useUserPreferenceContext"

// Le preferenze già salvate sul server non si perdono (AC34)

type Preference = {
  role: "ADMIN" | "OPERATORE"
  operatorId: number
  preferences: {
    dashboardCollapsed: boolean
    customerTableVisibleColumns: string[]
    practicesTableVisibleColumns: string[]
    contactTableVisibleColumns?: string[]
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

const server: Preference = {
  role: "ADMIN",
  operatorId: 1000,
  preferences: {
    dashboardCollapsed: true,
    customerTableVisibleColumns: ["Sede"],
    practicesTableVisibleColumns: ["Nome"],
    contactTableVisibleColumns: ["CF"],
  },
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

function Columns() {
  const columns = useUserPreferenceContext(
    (state) => state.preferences?.customerTableVisibleColumns
  )
  return <p>{columns ? columns.join(",") : "nessuna"}</p>
}

const mount = () =>
  render(
    <UserPreferenceProvider>
      <Columns />
    </UserPreferenceProvider>
  )

beforeEach(() => {
  clearCookies()
  mocks.query = { data: server, isLoading: false }
})

afterEach(cleanup)

describe("UserPreferenceProvider, dal server ai cookie (AC34)", () => {
  it("senza cookie scrive quelli che il server ha e li mette nello store", () => {
    mount()

    expect(cookie("mito-pref-ds")).toBe(true)
    expect(cookie("mito-pref-ct")).toEqual(["Sede"])
    expect(cookie("mito-pref-pt")).toEqual(["Nome"])
    expect(cookie("mito-pref-cot")).toEqual(["CF"])
    // The first render of the children already sees them
    expect(screen.getByText("Sede")).not.toBeNull()
  })

  it("un cookie già presente non viene mai sovrascritto dal valore del server", () => {
    document.cookie = `mito-pref-ct=${encodeURIComponent(JSON.stringify(["Email"]))}; path=/`

    mount()

    expect(cookie("mito-pref-ct")).toEqual(["Email"])
    expect(screen.getByText("Email")).not.toBeNull()
    // The ones that were missing are copied
    expect(cookie("mito-pref-pt")).toEqual(["Nome"])
  })

  it("una chiave che il server non ha non diventa un cookie", () => {
    mocks.query = {
      data: {
        ...server,
        preferences: {
          dashboardCollapsed: false,
          customerTableVisibleColumns: [],
          practicesTableVisibleColumns: [],
        },
      },
      isLoading: false,
    }

    mount()

    expect(cookie("mito-pref-cot")).toBeUndefined()
  })

  it("la copia è una sola: se l'operatore cambia scelta e il server risponde ancora, vale la scelta", () => {
    const { rerender } = mount()
    document.cookie = `mito-pref-ct=${encodeURIComponent(JSON.stringify(["Email"]))}; path=/`

    mocks.query = { data: { ...server }, isLoading: false }
    rerender(
      <UserPreferenceProvider>
        <Columns />
      </UserPreferenceProvider>
    )

    expect(cookie("mito-pref-ct")).toEqual(["Email"])
  })
})
