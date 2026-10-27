import { render as renderInDom, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DashboardLayout } from "../DashboardLayout"

const mocks = vi.hoisted(
  (): { pathname: string; role: "ADMIN" | "OPERATORE" | undefined } => ({
    pathname: "/dashboard",
    role: "OPERATORE",
  })
)

// The sidebar on the URL of the test
const render = (ui: React.ReactElement) =>
  renderInDom(
    <MemoryRouter initialEntries={[mocks.pathname]}>{ui}</MemoryRouter>
  )

vi.mock("@/store/context/useUserPreferenceContext", () => ({
  useUserPreferenceContext: (
    selector: (state: Record<string, unknown>) => unknown
  ) =>
    selector({
      preferences: { dashboardCollapsed: false },
      setDashboardCollapsed: vi.fn(),
      role: mocks.role,
    }),
}))

const menu = () =>
  screen
    .getAllByRole("link")
    .map((link) => ({
      name: link.textContent?.trim() ?? "",
      href: link.getAttribute("href"),
      active: link.className.includes("bg-slate-800"),
    }))
    .filter((link) => link.name !== "")

beforeEach(() => {
  mocks.pathname = "/dashboard"
  mocks.role = "OPERATORE"
})

describe("il menu laterale (AC1)", () => {
  it("ha 'Contatti' subito dopo 'Customers' e prima di 'Pratiche'", () => {
    render(<DashboardLayout />)

    const names = menu().map((link) => link.name)
    expect(names.indexOf("Contatti")).toBe(names.indexOf("Customers") + 1)
    expect(names.indexOf("Pratiche")).toBe(names.indexOf("Contatti") + 1)
  })

  it("'Contatti' apre /dashboard/contatti", () => {
    render(<DashboardLayout />)

    expect(menu().find((link) => link.name === "Contatti")?.href).toBe(
      "/dashboard/contatti"
    )
  })

  it.each(["/dashboard/contatti", "/dashboard/contatti/76006"])(
    "su %s è attiva solo 'Contatti'",
    (pathname) => {
      mocks.pathname = pathname
      render(<DashboardLayout />)

      expect(
        menu()
          .filter((link) => link.active)
          .map((link) => link.name)
      ).toEqual(["Contatti"])
    }
  )

  it("su Clienti è attiva solo 'Customers'", () => {
    mocks.pathname = "/dashboard/customers"
    render(<DashboardLayout />)

    expect(
      menu()
        .filter((link) => link.active)
        .map((link) => link.name)
    ).toEqual(["Customers"])
  })
})

describe("la voce 'Import' (AC1, AC28)", () => {
  it("renderizzato per un operatore, il menu non contiene la voce 'Import'", () => {
    render(<DashboardLayout />)

    expect(menu().map((link) => link.name)).not.toContain("Import")
  })

  it("senza ruolo ancora letto la voce non c'è", () => {
    mocks.role = undefined
    render(<DashboardLayout />)

    expect(menu().map((link) => link.name)).not.toContain("Import")
  })

  it("per un admin c'è, dopo 'Pratiche', e apre /dashboard/import", () => {
    mocks.role = "ADMIN"
    render(<DashboardLayout />)

    const links = menu()
    const names = links.map((link) => link.name)
    expect(names.indexOf("Import")).toBe(names.indexOf("Pratiche") + 1)
    expect(links.find((link) => link.name === "Import")?.href).toBe(
      "/dashboard/import"
    )
  })

  it("su /dashboard/import è attiva solo 'Import'", () => {
    mocks.role = "ADMIN"
    mocks.pathname = "/dashboard/import"
    render(<DashboardLayout />)

    expect(
      menu()
        .filter((link) => link.active)
        .map((link) => link.name)
    ).toEqual(["Import"])
  })
})
