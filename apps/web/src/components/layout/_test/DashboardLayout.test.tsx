import { render as renderInDom, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
      active: link.className.includes("bg-sidebar-primary"),
    }))
    .filter((link) => link.name !== "")

beforeEach(() => {
  mocks.pathname = "/dashboard"
  mocks.role = "OPERATORE"
})

describe("il menu laterale (AC1)", () => {
  it("ha le voci in italiano: Home, Analisi, Clienti, Pratiche, Chiamate, poi la sezione Impostazioni chiusa (AC1 di pagina-analisi)", () => {
    render(<DashboardLayout />)

    expect(menu().map((link) => link.name)).toEqual([
      "Mito SRL",
      "Home",
      "Analisi",
      "Clienti",
      "Pratiche",
      "Chiamate",
    ])
    expect(
      screen.getByRole("button", { name: "Impostazioni" })
    ).toHaveAttribute("aria-expanded", "false")
  })

  it.each([
    ["OPERATORE", ["Profilo"]],
    ["ADMIN", ["Profilo", "Team", "Blacklist"]],
  ] as const)(
    "Impostazioni apre le sue pagine: per un %s %j",
    async (role, pages) => {
      mocks.role = role
      render(<DashboardLayout />)

      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Impostazioni" }))

      const names = menu().map((link) => link.name)
      expect(names.slice(names.indexOf("Chiamate") + 1)).toEqual(
        role === "ADMIN" ? ["Import", ...pages] : pages
      )
    }
  )

  it("su una pagina delle impostazioni la sezione è aperta e la pagina è attiva", () => {
    mocks.role = "ADMIN"
    mocks.pathname = "/dashboard/settings/team/4"
    render(<DashboardLayout />)

    expect(
      screen.getByRole("button", { name: "Impostazioni" })
    ).toHaveAttribute("aria-expanded", "true")
    expect(
      menu()
        .filter((link) => link.active)
        .map((link) => link.name)
    ).toEqual(["Team"])
    expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute(
      "href",
      "/dashboard/settings/team"
    )
  })

  it("'Chiamate' apre /dashboard/contatti", () => {
    render(<DashboardLayout />)

    expect(menu().find((link) => link.name === "Chiamate")?.href).toBe(
      "/dashboard/contatti"
    )
  })

  it.each(["/dashboard/contatti", "/dashboard/contatti/76006"])(
    "su %s è attiva solo 'Chiamate'",
    (pathname) => {
      mocks.pathname = pathname
      render(<DashboardLayout />)

      expect(
        menu()
          .filter((link) => link.active)
          .map((link) => link.name)
      ).toEqual(["Chiamate"])
    }
  )

  it("'Analisi' apre /dashboard/analisi, per i due ruoli (AC1 di pagina-analisi)", () => {
    for (const role of ["OPERATORE", "ADMIN"] as const) {
      mocks.role = role
      const { unmount } = render(<DashboardLayout />)
      expect(menu().find((link) => link.name === "Analisi")?.href).toBe(
        "/dashboard/analisi"
      )
      unmount()
    }
  })

  it.each([
    ["/dashboard", "Home"],
    ["/dashboard/analisi", "Analisi"],
  ])("su %s è attiva solo '%s'", (pathname, name) => {
    mocks.pathname = pathname
    render(<DashboardLayout />)

    expect(
      menu()
        .filter((link) => link.active)
        .map((link) => link.name)
    ).toEqual([name])
  })

  it("su /dashboard/customers è attiva solo 'Clienti'", () => {
    mocks.pathname = "/dashboard/customers"
    render(<DashboardLayout />)

    expect(
      menu()
        .filter((link) => link.active)
        .map((link) => link.name)
    ).toEqual(["Clienti"])
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

  it("per un admin c'è, dopo 'Chiamate', e apre /dashboard/import", () => {
    mocks.role = "ADMIN"
    render(<DashboardLayout />)

    const links = menu()
    const names = links.map((link) => link.name)
    expect(names.indexOf("Import")).toBe(names.indexOf("Chiamate") + 1)
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
