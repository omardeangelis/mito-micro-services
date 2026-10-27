import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { routes } from "@/router"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

const captureException = vi.hoisted(() => vi.fn())
vi.mock("@sentry/react", () => ({ captureException }))

const open = (path: string) => {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

const heading = () => screen.findByRole("heading", { level: 1 })

afterEach(() => {
  vi.restoreAllMocks()
})

describe("le rotte (§5)", () => {
  it("/ porta a /dashboard", async () => {
    const router = open("/")

    expect(await heading()).toHaveTextContent("Home")
    expect(router.state.location.pathname).toBe("/dashboard")
  })

  it.each([
    ["/dashboard", "Home", "3.5"],
    ["/dashboard/customers", "Customers", "3.1"],
    ["/dashboard/customers/new", "Nuovo customer", "3.1"],
    ["/dashboard/customers/42", "Customer", "3.1"],
    ["/dashboard/customers/42/connect", "Collega il customer", "3.1"],
    ["/dashboard/contatti", "Contatti", "3.2"],
    ["/dashboard/contatti/76006", "Contatto", "3.2"],
    ["/dashboard/pratiche", "Pratiche", "3.3"],
    ["/dashboard/pratiche/7", "Pratica", "3.3"],
    ["/dashboard/import", "Import", "3.6"],
  ])("un link diretto a %s apre la sua pagina", async (path, title, task) => {
    open(path)

    expect(await heading()).toHaveTextContent(title)
    expect(screen.getByText(`Arriva con il task ${task}`)).toBeInTheDocument()
    expect(screen.getByRole("navigation")).toBeInTheDocument()
  })

  it("la pagina riceve l'id della rotta", async () => {
    open("/dashboard/customers/42/connect")

    await heading()
    expect(screen.getByText("id").nextSibling).toHaveTextContent("42")
  })

  it("dal menu si passa da una pagina all'altra", async () => {
    const user = userEvent.setup()
    const router = open("/dashboard")
    await heading()

    await user.click(screen.getByRole("link", { name: "Pratiche" }))

    expect(
      await screen.findByRole("heading", { name: "Pratiche" })
    ).toBeVisible()
    expect(router.state.location.pathname).toBe("/dashboard/pratiche")
  })

  it("un indirizzo che non è una rotta mostra la 404", async () => {
    open("/dashboard/nope/1")

    expect(await heading()).toHaveTextContent("Pagina non trovata")
    expect(
      screen.getByRole("link", { name: "Torna alla dashboard" })
    ).toHaveAttribute("href", "/dashboard")
  })
})

describe("il profilo", () => {
  it("un operatore vede solo il tab Profile, anche con ?tab=admin", async () => {
    open("/dashboard/profile?tab=admin")

    const tabs = await screen.findAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Profile"])
    expect(tabs[0]).toHaveAttribute("aria-selected", "true")
  })

  it("un admin apre il tab dell'URL, e cambiarlo cambia l'URL", async () => {
    // The role arrives with phase 2: here it is set in the store
    function AsAdmin() {
      const setRole = useUserPreferenceContext((state) => state.setRole)
      return (
        <button type="button" onClick={() => setRole("ADMIN")}>
          admin
        </button>
      )
    }
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [
        {
          path: "/dashboard",
          lazy: async () => ({
            Component: (await import("@/routes/dashboard/DashboardShell"))
              .DashboardShell,
          }),
          children: [
            {
              path: "profile",
              lazy: async () => {
                const { Component: Profile } =
                  await import("@/routes/dashboard/profile/ProfilePage")
                return {
                  Component: () => (
                    <>
                      <AsAdmin />
                      <Profile />
                    </>
                  ),
                }
              },
            },
          ],
        },
      ],
      { initialEntries: ["/dashboard/profile?tab=blacklist"] }
    )
    render(<RouterProvider router={router} />)
    await user.click(await screen.findByRole("button", { name: "admin" }))

    expect(screen.getByRole("tab", { name: "Blacklist" })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    await user.click(screen.getByRole("tab", { name: "Admin" }))

    expect(router.state.location.search).toBe("?tab=admin")
    expect(
      screen.getByText("Gli operatori arrivano con il task 3.8")
    ).toBeVisible()

    await user.click(screen.getByRole("tab", { name: "Profile" }))

    expect(router.state.location.search).toBe("")
  })
})

describe("l'errore dei contatti", () => {
  it("resta nella pagina, con il menu, e va a Sentry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.doMock("@/routes/dashboard/contatti/ContactsPage", () => ({
      Component: () => {
        throw new Error("contacts failed")
      },
    }))

    open("/dashboard/contatti")

    const alert = await screen.findByRole("alert")
    expect(
      within(alert).getByText("Non è stato possibile caricare i contatti")
    ).toBeVisible()
    expect(screen.getByRole("navigation")).toBeInTheDocument()
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "contacts failed" })
    )
    vi.doUnmock("@/routes/dashboard/contatti/ContactsPage")
  })
})
