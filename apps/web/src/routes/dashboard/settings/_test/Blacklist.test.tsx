import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeProfile, underReview } from "@/test/profile"
import { renderSettings } from "./page"

// La pagina Blacklist: i clienti in revisione o in blacklist, come
// `@blacklist` del Next.js app

const giulia = underReview()
const piero = underReview({
  id: "c-2",
  name: "Piero",
  fiscalCode: null,
  vatCode: "01234567890",
  blackListStatus: "blacklisted",
  operatore: null,
})

const openBlacklist = (customers = [giulia, piero]) => {
  const backend = fakeProfile({ underReview: customers })
  return {
    backend,
    ...renderSettings(backend, "/dashboard/settings/blacklist"),
  }
}

const dmSwitches = () => screen.getAllByRole("switch", { name: /^DM / })

describe("la pagina Blacklist", () => {
  it("mostra ogni cliente con nome, codice, operatore e stato, e DM acceso se in blacklist", async () => {
    openBlacklist()

    expect(await screen.findByText("Giulia Verdi")).toBeInTheDocument()
    expect(
      screen.getByText("1 da verificare · 1 in blacklist")
    ).toBeInTheDocument()
    expect(screen.getByText("Da verificare")).toBeInTheDocument()
    expect(screen.getByText("In blacklist")).toBeInTheDocument()
    expect(screen.getByText("Nessuno")).toBeInTheDocument()
    expect(screen.getByText("VRDGLI80A01H501U")).toBeInTheDocument()
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument()
    // Without a fiscal code, the VAT code
    expect(screen.getByText("01234567890")).toBeInTheDocument()
    expect(dmSwitches().map((dm) => dm.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
    ])
    expect(
      screen.getByRole("switch", { name: "DM Giulia Verdi" })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Giulia Verdi" })).toHaveAttribute(
      "href",
      "/dashboard/customers/c-1"
    )
  })

  it("un cliente senza nome ha il link col suo codice", async () => {
    openBlacklist([
      underReview({ id: "c-3", name: null, surname: null, fiscalCode: null }),
    ])

    expect(
      await screen.findByRole("link", { name: "Cliente c-3" })
    ).toHaveAttribute("href", "/dashboard/customers/c-3")
  })

  it("senza clienti lo dice", async () => {
    openBlacklist([])

    expect(
      await screen.findByText("Nessun cliente da verificare")
    ).toBeInTheDocument()
  })

  it("DM su un cliente in revisione lo mette in blacklist", async () => {
    const user = userEvent.setup()
    const { backend } = openBlacklist()
    await screen.findByText("Giulia Verdi")

    await user.click(dmSwitches()[0]!)

    await waitFor(() =>
      expect(dmSwitches()[0]).toHaveAttribute("aria-checked", "true")
    )
    expect(backend.state.blacklistChanges).toEqual([
      { id: "c-1", blackListStatus: "blacklisted" },
    ])
  })

  it("mentre il cambio si salva DM lo mostra già, ed è fermo", async () => {
    const user = userEvent.setup()
    const { backend } = openBlacklist()
    let release: (() => void) | undefined
    backend.state.blacklistHeld = new Promise((resolve) => {
      release = resolve
    })
    await screen.findByText("Giulia Verdi")

    await user.click(dmSwitches()[0]!)

    await waitFor(() => expect(dmSwitches()[0]).toBeDisabled())
    expect(dmSwitches()[0]).toHaveAttribute("aria-checked", "true")
    release?.()
    await waitFor(() => expect(dmSwitches()[0]).toBeEnabled())
    expect(dmSwitches()[0]).toHaveAttribute("aria-checked", "true")
  })

  it("DM spento su un cliente in blacklist lo toglie dalla lista", async () => {
    const user = userEvent.setup()
    const { backend } = openBlacklist()
    await screen.findByText("Piero Verdi")

    await user.click(dmSwitches()[1]!)

    await waitFor(() => expect(screen.queryByText("Piero Verdi")).toBeNull())
    expect(backend.state.blacklistChanges).toEqual([
      { id: "c-2", blackListStatus: "whitelisted" },
    ])
  })

  it("se il cambio fallisce lo dice e DM torna com'era", async () => {
    const user = userEvent.setup()
    const { backend } = openBlacklist()
    backend.state.failingBlacklist = true
    await screen.findByText("Giulia Verdi")

    await user.click(dmSwitches()[0]!)

    expect(
      await screen.findByText("Il servizio non risponde, riprova tra poco")
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(dmSwitches()[0]).toHaveAttribute("aria-checked", "false")
    )
  })

  it("il nome apre il cliente", async () => {
    const user = userEvent.setup()
    const { router } = openBlacklist()
    await screen.findByText("Giulia Verdi")

    await user.click(screen.getByRole("link", { name: "Giulia Verdi" }))

    expect(await screen.findByText("il cliente")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/dashboard/customers/c-1")
  })

  it("se la lista non arriva va all'errore della rotta", async () => {
    const backend = fakeProfile()
    backend.state.failingUnderReview = true
    renderSettings(backend, "/dashboard/settings/blacklist")

    expect(await screen.findByText("errore della rotta")).toBeInTheDocument()
  })

  it("un operatore va al suo profilo", async () => {
    const { router } = renderSettings(
      fakeProfile({ role: "OPERATORE" }),
      "/dashboard/settings/blacklist"
    )

    expect(
      await screen.findByRole("heading", { name: "Profilo" })
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/dashboard/settings/profile")
  })
})
