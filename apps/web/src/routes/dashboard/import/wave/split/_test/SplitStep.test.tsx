import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { waveView } from "@/test/import"
import { member, renderSplit } from "./harness"

const summary = () => document.querySelector('[aria-live="polite"]')

/** The row of a person, from its checkbox */
const rowOf = (name: string) => {
  const row = screen.getByRole("checkbox", { name }).closest("tr")
  if (row === null) throw new Error(`no row for ${name}`)
  return row
}

/** The names of the rows, top to bottom */
const rowNames = () =>
  screen
    .getAllByRole("checkbox")
    .map((box) => box.getAttribute("aria-label") ?? accessibleName(box))

const accessibleName = (box: HTMLElement) =>
  document.getElementById(box.getAttribute("aria-labelledby") ?? "")
    ?.textContent

const team = [
  member(1, "Ada Lovelace", { pace: 3, exactPace: 3, active: 10 }),
  member(2, "Bruno Rossi", { pace: 1, exactPace: 1, active: 2 }),
  member(3, "Carla Neri", {
    pace: 5,
    exactPace: 5,
    inactiveDays: 12,
    active: 40,
  }),
  member(4, "Dario Admin", {
    role: "ADMIN",
    pace: 8,
    exactPace: 8,
    active: 1,
  }),
  member(5, "Elena Nascosta", { role: "ADMIN", shown: false }),
]

describe("Il passo «Assegna»", () => {
  it("con due operatori attivi di ritmo 3 e 1 e 4 da assegnare divide per ritmo (AC11, AC14, AC15)", () => {
    renderSplit(
      waveView({
        toAssign: 4,
        team: [
          member(1, "Ada Lovelace", { pace: 3, exactPace: 3 }),
          member(2, "Bruno Rossi", { pace: 1, exactPace: 1 }),
        ],
      })
    )

    expect(summary()).toHaveTextContent(/^Da 1 a 3 a testa · dopo, /)
    expect(
      screen.getByRole("button", { name: "Assegna 4 a 2 operatori" })
    ).toBeEnabled()
  })

  it("all'apertura «Ritmo» e tutti gli OPERATORE attivi scelti; inattivi in cima non scelti, poi Operatori e Admin (AC11, AC12)", () => {
    renderSplit(waveView({ toAssign: 4, team }))

    const pace = screen.getByRole("radio", {
      name: "Ritmo dei 30 giorni precedenti",
    })
    expect(pace).toBeChecked()
    expect(pace).toHaveAccessibleDescription(
      "Di più a chi ha fatto più chiamate al giorno nell'ultimo mese"
    )
    expect(screen.getByRole("checkbox", { name: "Ada Lovelace" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Bruno Rossi" })).toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "Carla Neri" })
    ).not.toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "Dario Admin" })
    ).not.toBeChecked()
    // Not shown: an admin who neither called nor has contacts
    expect(
      screen.queryByRole("checkbox", { name: "Elena Nascosta" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("A chi")).toHaveTextContent("A chi · 2 scelti")

    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent)
    expect(headers).toEqual([
      "Nome",
      "Attive",
      "Assegnate",
      "Totale",
      "Al giorno",
    ])
    const groups = document.querySelectorAll('th[scope="rowgroup"]')
    expect(Array.from(groups).map((cell) => cell.textContent)).toEqual([
      "Inattivi · non scelti, si possono scegliere",
      "Operatori",
      "Admin",
    ])
    // In each group fewer «Attive» first
    expect(rowNames()).toEqual([
      "Carla Neri",
      "Bruno Rossi",
      "Ada Lovelace",
      "Dario Admin",
    ])
    expect(
      screen.getByRole("checkbox", { name: "Carla Neri" })
    ).toHaveAccessibleDescription("inattivo da 12 giorni")
    expect(
      screen.getByRole("checkbox", { name: "Ada Lovelace" })
    ).toHaveAccessibleDescription("3 chiamate al giorno")
  })

  it("«Tutti gli attivi» sceglie solo gli OPERATORE attivi, «Nessuno» nessuno: «Scegli almeno un operatore» e «Assegna» disattivato (AC12, AC14, AC15)", async () => {
    renderSplit(waveView({ toAssign: 4, team }))
    const user = userEvent.setup()

    await user.click(rowOf("Dario Admin"))
    await user.click(screen.getByRole("checkbox", { name: "Carla Neri" }))
    expect(screen.getByRole("checkbox", { name: "Dario Admin" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Carla Neri" })).toBeChecked()

    await user.click(screen.getByRole("button", { name: "Tutti gli attivi" }))
    expect(
      screen.getByRole("checkbox", { name: "Dario Admin" })
    ).not.toBeChecked()
    expect(
      screen.getByRole("checkbox", { name: "Carla Neri" })
    ).not.toBeChecked()

    await user.click(screen.getByRole("button", { name: "Nessuno" }))
    expect(summary()).toHaveTextContent("Scegli almeno un operatore")
    expect(screen.getByRole("button", { name: "Assegna" })).toBeDisabled()
  })

  it("con 3.000 su 5.026 il pulsante dice «Assegna 3.000 a <K> operatori», e «Tutti» torna al massimo (AC13, AC15)", async () => {
    renderSplit(waveView({ toAssign: 5026, team }))
    const user = userEvent.setup()
    const field = screen.getByRole("textbox", { name: "Quanti" })
    expect(field).toHaveValue("5.026")
    expect(screen.getByText("su 5.026")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Tutti" })
    ).not.toBeInTheDocument()

    await user.clear(field)
    await user.type(field, "3.000")

    expect(
      screen.getByRole("button", { name: "Assegna 3.000 a 2 operatori" })
    ).toBeEnabled()
    await user.click(screen.getByRole("button", { name: "Tutti" }))
    expect(field).toHaveValue("5.026")
    expect(
      screen.getByRole("button", { name: "Assegna 5.026 a 2 operatori" })
    ).toBeEnabled()
  })

  it("«1.5» non è un intero: «Scrivi un numero da 1 a <max>» sotto il campo e come sua descrizione (AC13, AC14)", async () => {
    renderSplit(waveView({ toAssign: 5026, team }))
    const user = userEvent.setup()
    const field = screen.getByRole("textbox", { name: "Quanti" })

    await user.clear(field)
    await user.type(field, "1.5")

    expect(field).toHaveAccessibleDescription("Scrivi un numero da 1 a 5.026")
    expect(field).toBeInvalid()
    expect(summary()).toHaveTextContent("Scrivi un numero da 1 a 5.026")
    expect(screen.getByRole("button", { name: "Assegna" })).toBeDisabled()
  })

  it("la riga si legge con le sue colonne: «Attive 2, Assegnate +342, Totale 344, Al giorno 16» (AC32)", () => {
    renderSplit(
      waveView({
        toAssign: 342,
        workdaysLeft: 22,
        team: [
          member(1, "Ada Lovelace", { pace: 20, exactPace: 20, active: 2 }),
        ],
      })
    )

    expect(rowOf("Ada Lovelace")).toHaveTextContent(
      "Attive 2, Assegnate +342, Totale 344, Al giorno 16"
    )
    expect(summary()).toHaveTextContent("342 · dopo, 344 da fare")
    expect(
      screen.getByRole("button", { name: "Assegna 342 a 1 operatore" })
    ).toBeEnabled()
  })

  it("«Al giorno» sopra il ritmo è in ambra e si sente «sopra il ritmo»; «—» senza giorni lavorativi (AC12)", () => {
    const { unmount } = renderSplit(
      waveView({
        toAssign: 20,
        workdaysLeft: 2,
        team: [member(1, "Ada Lovelace", { pace: 3, exactPace: 3 })],
      })
    )
    expect(rowOf("Ada Lovelace")).toHaveTextContent(
      "Al giorno 10 sopra il ritmo"
    )
    expect(screen.getByText("In ambra")).toBeInTheDocument()
    unmount()

    renderSplit(
      waveView({
        toAssign: 20,
        workdaysLeft: null,
        team: [member(1, "Ada Lovelace", { pace: 3, exactPace: 3 })],
      })
    )
    expect(rowOf("Ada Lovelace")).toHaveTextContent("Al giorno —")
  })

  it("un clic in qualunque punto della riga cambia la scelta (AC32)", async () => {
    renderSplit(waveView({ toAssign: 4, team }))
    const user = userEvent.setup()

    await user.click(
      within(rowOf("Bruno Rossi")).getByText("1 chiamata al giorno")
    )
    expect(
      screen.getByRole("checkbox", { name: "Bruno Rossi" })
    ).not.toBeChecked()
    await user.click(screen.getByRole("checkbox", { name: "Bruno Rossi" }))
    expect(screen.getByRole("checkbox", { name: "Bruno Rossi" })).toBeChecked()
  })

  it("cambiare divisione non sposta le righe (AC12)", async () => {
    renderSplit(waveView({ toAssign: 40, team }))
    const user = userEvent.setup()
    const before = rowNames()
    const notes = screen
      .getAllByRole("checkbox")
      .map((box) => box.getAttribute("aria-describedby"))

    await user.click(screen.getByRole("radio", { name: "In parti uguali" }))

    expect(rowNames()).toEqual(before)
    expect(summary()).toHaveTextContent(/^20 a testa · dopo, /)
    await user.click(screen.getByRole("radio", { name: "Pareggia i carichi" }))
    expect(rowNames()).toEqual(before)
    expect(
      screen
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-describedby"))
    ).toEqual(notes)
  })

  it("non tutti gli scelti ricevono: «Ricevono <K> dei <N> scelti.» (AC14)", async () => {
    renderSplit(waveView({ toAssign: 1, team }))

    expect(summary()).toHaveTextContent("Ricevono 1 dei 2 scelti. 1 · dopo, ")
    expect(
      screen.getByRole("button", { name: "Assegna 1 a 1 operatore" })
    ).toBeEnabled()
  })

  it("nella riassegnazione chi cede non c'è, e senza contatti dice «Niente da spostare: …» (AC14, AC25)", () => {
    renderSplit(waveView({ toAssign: 0, team }), {
      excluded: [1],
      withCount: false,
      messages: "reassign",
    })

    expect(
      screen.queryByRole("checkbox", { name: "Ada Lovelace" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("textbox", { name: "Quanti" })
    ).not.toBeInTheDocument()
    expect(summary()).toHaveTextContent(
      "Niente da spostare: chi hai scelto non ha più contatti di questo tipo"
    )
  })
})
