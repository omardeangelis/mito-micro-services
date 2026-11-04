import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { fakeImport, waveView } from "@/test/import"
import { renderWave } from "../../_test/page"
import { member } from "./harness"

const summary = () => document.querySelector('[aria-live="polite"]')

const team = [
  member(7, "Ada Lovelace", { pace: 3, exactPace: 3, active: 4 }),
  member(8, "Bruno Rossi", { pace: 1, exactPace: 1, active: 2 }),
  member(9, "Carla Neri", { inactiveDays: 12, pace: 2, exactPace: 2 }),
  member(10, "Dario Admin", { role: "ADMIN", shown: false }),
]

describe("«Assegna» nella pagina della Wave", () => {
  it("`?per` su una Wave con la scadenza apre «Assegna i restanti» da solo, con quella persona sola scelta anche se è un admin fuori dalle persone mostrate (AC2, AC10)", async () => {
    renderWave(fakeImport({ wave: waveView({ toAssign: 30, team }) }), {
      url: "/dashboard/import/5?per=10",
    })

    const title = await screen.findByRole("heading", { name: "Assegna" })
    expect(
      screen.getByRole("heading", { name: "Assegna i restanti" })
    ).toBeInTheDocument()
    expect(title).toBeInTheDocument()
    expect(
      screen.queryByRole("list", { name: "Passi" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Dario Admin" })).toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "Ada Lovelace" })
    ).not.toBeChecked()
    expect(screen.getByRole("textbox", { name: "Quanti" })).toHaveValue("")
    expect(summary()).toHaveTextContent(
      "Quanti contatti a Dario? Al massimo 30."
    )
    expect(screen.getByRole("button", { name: "Assegna" })).toBeDisabled()

    const user = userEvent.setup()
    await user.type(screen.getByRole("textbox", { name: "Quanti" }), "12")
    expect(
      screen.getByRole("button", { name: "Assegna 12 a 1 operatore" })
    ).toBeEnabled()
  })

  it("`?per` di un inattivo: «<nome> è inattivo da N giorni. Quanti contatti a <nome>? Al massimo <max>.» e il gruppo «Inattivi» (AC2, AC12, AC14)", async () => {
    renderWave(fakeImport({ wave: waveView({ toAssign: 30, team }) }), {
      url: "/dashboard/import/5?per=9",
    })

    await screen.findByRole("heading", { name: "Assegna" })
    expect(summary()).toHaveTextContent(
      "Carla è inattivo da 12 giorni. Quanti contatti a Carla? Al massimo 30."
    )
    expect(screen.getByRole("checkbox", { name: "Carla Neri" })).toBeChecked()
    expect(
      screen.getByRole("rowheader", { name: "Inattivi" })
    ).toBeInTheDocument()
  })

  it("toccato un campo, «Quanti» vuoto è un errore (AC13, AC14)", async () => {
    renderWave(fakeImport({ wave: waveView({ toAssign: 30, team }) }), {
      url: "/dashboard/import/5?per=9",
    })
    await screen.findByRole("heading", { name: "Assegna" })
    const user = userEvent.setup()

    await user.click(screen.getByRole("radio", { name: "In parti uguali" }))

    expect(summary()).toHaveTextContent("Scrivi un numero da 1 a 30")
  })

  it("su una Wave scaduta la riga dice «<N> da assegnare · Wave scaduta il <giorno>» (AC10)", async () => {
    renderWave(
      fakeImport({
        wave: waveView({
          toAssign: 1,
          deadline: "2026-10-30",
          status: "expired",
          workdaysLeft: null,
          daysSinceDeadline: 5,
          team,
        }),
      }),
      { url: "/dashboard/import/5?per=7" }
    )

    await screen.findByRole("heading", { name: "Assegna" })
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "1 da assegnare · Wave scaduta il ven 30 ott"
      )
    ).toBeInTheDocument()
  })

  it("su una Wave aperta la riga dice «<N> da assegnare con scadenza <giorno>» (AC10)", async () => {
    renderWave(fakeImport({ wave: waveView({ toAssign: 4, team }) }), {
      url: "/dashboard/import/5?per=7",
    })

    await screen.findByRole("heading", { name: "Assegna" })
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "4 da assegnare con scadenza ven 20 nov"
      )
    ).toBeInTheDocument()
  })
})
