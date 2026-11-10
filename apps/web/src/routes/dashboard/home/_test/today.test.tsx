import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeAdminHome, teamDay } from "@/test/adminHome"
import { myCallback } from "@/test/lavoro"
import { renderHome } from "./page"

// The four numbers of today (spec home-admin, AC6, AC7, AC34)

/**
 * The cell of the strip with the label `label`: the first one, since
 * «Andamento delle chiamate», further down, has charts with the same titles
 */
const cell = async (label: string) =>
  (await screen.findAllByText(label))[0]!.parentElement!

describe("I quattro numeri di oggi", () => {
  it("con 10 chiamate e 0 risposte il tasso di risposta dice 0% e quello di appuntamento aspetta le risposte", async () => {
    const backend = fakeAdminHome({
      day: teamDay({ calls: 10, answered: 0, called: 2, members: 23 }),
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    expect(
      await within(await cell("Chiamate oggi")).findByText(
        "10 · 2 su 23 hanno chiamato"
      )
    ).toBeVisible()
    expect(
      await within(await cell("Tasso di risposta")).findByText(
        "0% · 0 risposte"
      )
    ).toBeVisible()
    expect(
      await within(await cell("Tasso di appuntamento")).findByText(
        "Dopo le prime risposte"
      )
    ).toBeVisible()
  })
})

/** The text of a cell, as the person reads it */
const textOf = async (label: string) =>
  (await cell(label)).textContent?.replace(label, "")

describe("I quattro numeri di oggi, i testi (AC6, AC34)", () => {
  it.each([
    [
      teamDay(),
      "Nessuna chiamata ancora",
      "Dopo le prime chiamate",
      "Dopo le prime chiamate",
    ],
    [
      teamDay({
        calls: 3,
        answered: 1,
        appointments: 1,
        called: 1,
        members: 15,
      }),
      "3 · 1 su 15 ha chiamato",
      "33,3% · 1 risposta",
      "100% · 1 appuntamento",
    ],
    [
      teamDay({ calls: 40, answered: 20, appointments: 5, called: 16 }),
      "40 · 16 su 23 hanno chiamato",
      "50% · 20 risposte",
      "25% · 5 appuntamenti",
    ],
  ])("%j", async (day, calls, answer, appointment) => {
    renderHome("/dashboard", fakeAdminHome({ day }), { role: "ADMIN" })

    await waitFor(async () => expect(await textOf("Chiamate oggi")).toBe(calls))
    expect(await textOf("Tasso di risposta")).toBe(answer)
    expect(await textOf("Tasso di appuntamento")).toBe(appointment)
  })

  it("senza chiamate nessuna riga dice 0%", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })
    await screen.findByText("Nessuna chiamata ancora")

    for (const label of ["Tasso di risposta", "Tasso di appuntamento"])
      expect(await textOf(label)).not.toContain("0%")
  })
})

describe("I tuoi richiami (AC6, AC34)", () => {
  const overdue = (id: number) =>
    myCallback({ alertId: id, taskId: 100 + id, daysLate: 2 })
  const today = (id: number) =>
    myCallback({ alertId: id, taskId: 100 + id, daysLate: 0 })

  it("con scaduti e di oggi: «scaduti» in rosso e il link «Lavorali»", async () => {
    const backend = fakeAdminHome({
      callbacks: [overdue(1), overdue(2), today(3)],
    })
    renderHome("/dashboard", backend, { role: "ADMIN" })

    const mine = within(await cell("I tuoi richiami"))
    expect(await mine.findByText("2 scaduti")).toHaveClass(
      "text-destructive-text"
    )
    expect(mine.getByText(/1 di oggi/)).toBeVisible()
    expect(mine.getByRole("link", { name: "Lavorali" })).toHaveAttribute(
      "href",
      "/dashboard/lavoro"
    )
  })

  it("un solo scaduto, nessuno di oggi: solo la parte che c'è", async () => {
    renderHome("/dashboard", fakeAdminHome({ callbacks: [overdue(1)] }), {
      role: "ADMIN",
    })

    const mine = within(await cell("I tuoi richiami"))
    expect(await mine.findByText("1 scaduto")).toBeVisible()
    expect(mine.queryByText(/di oggi/)).toBeNull()
  })

  it("solo di oggi: niente «scaduti»", async () => {
    renderHome(
      "/dashboard",
      fakeAdminHome({ callbacks: [today(1), today(2)] }),
      {
        role: "ADMIN",
      }
    )

    const mine = within(await cell("I tuoi richiami"))
    expect(await mine.findByText(/2 di oggi/)).toBeVisible()
    expect(mine.queryByText(/scaduti/)).toBeNull()
  })

  it("nessuno: «Nessuno per oggi» e niente link", async () => {
    renderHome("/dashboard", fakeAdminHome(), { role: "ADMIN" })

    const mine = within(await cell("I tuoi richiami"))
    expect(await mine.findByText("Nessuno per oggi")).toBeVisible()
    expect(mine.queryByRole("link")).toBeNull()
  })
})

describe("I quattro numeri di oggi, caricamento ed errore (AC30, AC49, AC50)", () => {
  it("le tre celle del team caricano insieme, poi falliscono insieme", async () => {
    const backend = fakeAdminHome()
    backend.hold("getTeamDay")
    renderHome("/dashboard", backend, { role: "ADMIN" })

    await waitFor(() =>
      expect(
        screen.getAllByText("Caricamento dei numeri di oggi")
      ).toHaveLength(3)
    )
  })

  it("dopo «Riprova» la cella torna a caricare e il fuoco va sulla sua etichetta", async () => {
    const backend = fakeAdminHome({ day: teamDay({ calls: 5, called: 1 }) })
    backend.failWith("getTeamDay")
    renderHome("/dashboard", backend, { role: "ADMIN" })
    const [, second] = await screen.findAllByText(
      "Non è stato possibile caricare i numeri di oggi."
    )
    const retry = within(
      second!.closest<HTMLElement>("[role=alert]")!
    ).getByRole("button", { name: "Riprova" })
    const release = backend.hold("getTeamDay")
    backend.clearFailure("getTeamDay")

    await userEvent.setup().click(retry)
    await waitFor(() =>
      expect(
        screen.getAllByText("Caricamento dei numeri di oggi")
      ).toHaveLength(3)
    )
    release()

    await waitFor(() =>
      expect(screen.getAllByText("Tasso di risposta")[0]).toHaveFocus()
    )
  })
})
