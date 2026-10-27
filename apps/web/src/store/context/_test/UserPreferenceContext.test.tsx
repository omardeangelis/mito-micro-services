import { act, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ada, fakeMe, renderWithApi } from "@/test/api"
import { UserPreferenceProvider } from "../UserPreferenceContext"
import { useUserPreferenceContext } from "../useUserPreferenceContext"

// As src/store/context/_test of the Next.js app, on `GET /api/v1/me` of a
// backend in memory instead of a mocked tRPC query (2.2.2)

const STORAGE_KEY = "userPreference-storage"

const server = {
  dashboardCollapsed: true,
  customerTableVisibleColumns: ["Sede"],
  practicesTableVisibleColumns: ["Nome"],
  contactTableVisibleColumns: ["CF"],
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

const setCookie = (name: string, value: unknown) => {
  document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; path=/`
}

const clearCookies = () => {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

function Actor() {
  const role = useUserPreferenceContext((state) => state.role)
  const operatorId = useUserPreferenceContext((state) => state.operatorId)
  return <p>{role ? `${role} ${operatorId}` : "nessuno"}</p>
}

function Columns() {
  const columns = useUserPreferenceContext(
    (state) => state.preferences?.customerTableVisibleColumns
  )
  return <p>{columns ? columns.join(",") : "nessuna"}</p>
}

const mount = (backend: ReturnType<typeof fakeMe>, children = <Columns />) =>
  renderWithApi(<UserPreferenceProvider>{children}</UserPreferenceProvider>, {
    handlers: backend.handlers,
    auth: backend.auth,
  })

beforeEach(() => {
  localStorage.clear()
  clearCookies()
})

describe("UserPreferenceProvider, chi è l'utente", () => {
  it("mentre l'utente corrente si legge mostra lo scheletro, non i figli", () => {
    mount(fakeMe({}))

    expect(screen.queryByText("nessuna")).toBeNull()
  })

  it("usa l'utente della sessione, non quello che un accesso precedente ha lasciato nel browser", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: { role: "OPERATORE", operatorId: 1001 },
        version: 0,
      })
    )

    mount(fakeMe({ role: "ADMIN" }), <Actor />)

    expect(await screen.findByText(`ADMIN ${ada.id}`)).toBeInTheDocument()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("segue l'utente quando la sessione cambia dopo il primo caricamento", async () => {
    const backend = fakeMe({})
    const { queryClient } = mount(backend, <Actor />)
    await screen.findByText(`OPERATORE ${ada.id}`)

    // Refetched (on focus) after another sign-in in the same browser
    backend.state.role = "ADMIN"
    backend.state.operator = { ...ada, id: 1000 }
    await act(() => queryClient.invalidateQueries())

    expect(await screen.findByText("ADMIN 1000")).toBeInTheDocument()
  })

  it("tiene nei cookie le preferenze delle tabelle, non chi è l'utente", async () => {
    mount(fakeMe({ role: "ADMIN", preferences: server }), <Actor />)
    await screen.findByText(`ADMIN ${ada.id}`)

    expect(cookie("mito-pref-ct")).toEqual(["Sede"])
    expect(document.cookie).not.toContain("ADMIN")
  })
})

// Le preferenze già salvate sul server non si perdono (AC34)
describe("UserPreferenceProvider, dal server ai cookie (AC34)", () => {
  it("senza cookie scrive quelli che il server ha, e il primo render dei figli li vede", async () => {
    const seen: (readonly string[] | undefined)[] = []
    function Probe() {
      seen.push(
        useUserPreferenceContext(
          (state) => state.preferences?.customerTableVisibleColumns
        )
      )
      return null
    }

    mount(fakeMe({ preferences: server }), <Probe />)

    await waitFor(() => expect(seen.length).toBeGreaterThan(0))
    expect(seen[0]).toEqual(["Sede"])
    expect(cookie("mito-pref-ds")).toBe(true)
    expect(cookie("mito-pref-ct")).toEqual(["Sede"])
    expect(cookie("mito-pref-pt")).toEqual(["Nome"])
    expect(cookie("mito-pref-cot")).toEqual(["CF"])
  })

  it("un cookie già presente non viene mai sovrascritto dal valore del server", async () => {
    setCookie("mito-pref-ct", ["Email"])

    mount(fakeMe({ preferences: server }))

    expect(await screen.findByText("Email")).toBeInTheDocument()
    expect(cookie("mito-pref-ct")).toEqual(["Email"])
    // The ones that were missing are copied
    expect(cookie("mito-pref-pt")).toEqual(["Nome"])
  })

  it("una chiave che il server non ha non diventa un cookie", async () => {
    mount(
      fakeMe({
        preferences: {
          customerTableVisibleColumns: ["Sede"],
        },
      })
    )
    await screen.findByText("Sede")

    expect(cookie("mito-pref-cot")).toBeUndefined()
    expect(cookie("mito-pref-ds")).toBeUndefined()
  })

  it("la copia è una sola: se l'operatore cambia scelta e il server risponde ancora, vale la scelta", async () => {
    const backend = fakeMe({ preferences: server })
    const { queryClient } = mount(backend)
    await screen.findByText("Sede")
    setCookie("mito-pref-ct", ["Email"])
    // A cookie deleted in the meantime doesn't come back either
    document.cookie = "mito-pref-pt=; path=/; max-age=0"

    backend.state.preferences = { ...server }
    await act(() => queryClient.invalidateQueries())
    await waitFor(() => expect(backend.state.reads).toBe(2))

    expect(cookie("mito-pref-ct")).toEqual(["Email"])
    expect(cookie("mito-pref-pt")).toBeUndefined()
  })

  it("errore e poi successo: i figli sono già montati, la copia avviene senza avvisi di React", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const backend = fakeMe({ preferences: server })
    backend.state.failing = true
    const { queryClient } = mount(backend)
    expect(await screen.findByText("nessuna")).toBeInTheDocument()

    backend.state.failing = false
    await act(() => queryClient.invalidateQueries())

    expect(await screen.findByText("Sede")).toBeInTheDocument()
    expect(cookie("mito-pref-ds")).toBe(true)
    const warned = errors.mock.calls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === "string" && arg.includes("Cannot update a component")
      )
    )
    errors.mockRestore()
    expect(warned).toBe(false)
  })
})
