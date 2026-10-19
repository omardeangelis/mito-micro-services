import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DashboardLayout } from "../DashboardLayout"

const mocks = vi.hoisted(() => ({ pathname: "/dashboard" }))

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}))

// The workers of import and export are not what is tested here
vi.mock("../../_context/ImportWorker", () => ({
  useHandleImportWorkerStates: () => undefined,
}))
vi.mock("../../_context/ExportWorker", () => ({
  useHandleExportWorkerStates: () => undefined,
}))

vi.mock("@/store/context/useUserPreferenceContext", () => ({
  useUserPreferenceContext: (
    selector: (state: Record<string, unknown>) => unknown
  ) =>
    selector({
      preferences: { dashboardCollapsed: false },
      setDashboardCollapsed: vi.fn(),
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
