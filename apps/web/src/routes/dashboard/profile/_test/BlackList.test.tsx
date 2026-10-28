import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeProfile, underReview } from "@/test/profile"
import { renderProfile } from "./page"

// Il tab Blacklist: i clienti in revisione o in blacklist, come
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
    ...renderProfile(backend, { path: "/dashboard/profile?tab=blacklist" }),
  }
}

const dmSwitches = () => screen.getAllByRole("switch", { name: "DM" })

describe("il tab Blacklist", () => {
  it("mostra ogni cliente con nome, codice e operatore, e DM acceso se in blacklist", async () => {
    openBlacklist()

    expect(await screen.findByText("Giulia")).toBeInTheDocument()
    expect(screen.getByText("VRDGLI80A01H501U")).toBeInTheDocument()
    expect(screen.getByText("Mario Rossi")).toBeInTheDocument()
    // Without a fiscal code, the VAT code
    expect(screen.getByText("01234567890")).toBeInTheDocument()
    expect(dmSwitches().map((dm) => dm.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
    ])
    expect(screen.getAllByRole("link", { name: "Profilo" })[0]).toHaveAttribute(
      "href",
      "/dashboard/customers/c-1"
    )
  })

  it("senza clienti lo dice", async () => {
    openBlacklist([])

    expect(
      await screen.findByText("No customers under review")
    ).toBeInTheDocument()
  })

  it("DM su un cliente in revisione lo mette in blacklist", async () => {
    const user = userEvent.setup()
    const { backend } = openBlacklist()
    await screen.findByText("Giulia")

    await user.click(dmSwitches()[0]!)

    await waitFor(() =>
      expect(dmSwitches()[0]).toHaveAttribute("aria-checked", "true")
    )
    expect(backend.state.blacklistChanges).toEqual([
      { id: "c-1", blackListStatus: "blacklisted" },
    ])
  })

  it("DM spento su un cliente in blacklist lo toglie dalla lista", async () => {
    const user = userEvent.setup()
    const { backend } = openBlacklist()
    await screen.findByText("Piero")

    await user.click(dmSwitches()[1]!)

    await waitFor(() => expect(screen.queryByText("Piero")).toBeNull())
    expect(backend.state.blacklistChanges).toEqual([
      { id: "c-2", blackListStatus: "whitelisted" },
    ])
  })

  it("se il cambio fallisce lo dice e DM torna com'era", async () => {
    const user = userEvent.setup()
    const { backend } = openBlacklist()
    backend.state.failingBlacklist = true
    await screen.findByText("Giulia")

    await user.click(dmSwitches()[0]!)

    expect(
      await screen.findByText("Il servizio non risponde, riprova tra poco")
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(dmSwitches()[0]).toHaveAttribute("aria-checked", "false")
    )
  })

  it("Profilo apre il cliente", async () => {
    const user = userEvent.setup()
    const { router } = openBlacklist()
    await screen.findByText("Giulia")

    await user.click(screen.getAllByRole("link", { name: "Profilo" })[0]!)

    expect(await screen.findByText("il cliente")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/dashboard/customers/c-1")
  })

  it("se la lista non arriva va all'errore della rotta", async () => {
    const backend = fakeProfile()
    backend.state.failingUnderReview = true
    renderProfile(backend, { path: "/dashboard/profile?tab=blacklist" })

    expect(await screen.findByText("errore della rotta")).toBeInTheDocument()
  })
})
