import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { CallOutcomes } from "../CallOutcomes"

const now = new Date("2026-11-02T10:00:00")

async function openPanel() {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Richiamare" }))
  return user
}

describe("CallOutcomes", () => {
  it("con il riquadro «Richiamare» aperto e nessun giorno scelto, il salvataggio dice «Scegli il giorno» ed è disattivato", async () => {
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={vi.fn()} />
    )

    await openPanel()

    const save = screen.getByRole("button", { name: "Scegli il giorno" })
    expect((save as HTMLButtonElement).disabled).toBe(true)
  })

  it("mostra la riga «Sostituisce il richiamo del gg/mm» sotto il titolo del riquadro", async () => {
    render(
      <CallOutcomes
        customer="Mario Rossi"
        now={now}
        replacesAlertDay="2026-11-14"
        onOutcome={vi.fn()}
      />
    )

    await openPanel()

    expect(screen.getByText("Sostituisce il richiamo del 14/11")).toBeTruthy()
  })

  it("con reduced motion il riquadro appare e sparisce senza animazione", async () => {
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={vi.fn()} />
    )

    await openPanel()

    const panel = screen.getByRole("dialog").getAttribute("class")
    expect(panel).toContain("motion-reduce:data-[state=open]:animate-none")
    expect(panel).toContain("motion-reduce:data-[state=closed]:animate-none")
  })

  it("senza alert da sostituire non mostra la riga", async () => {
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={vi.fn()} />
    )

    await openPanel()

    expect(screen.queryByText(/Sostituisce il richiamo/)).toBeNull()
  })

  it("con un esito in registrazione scrive «Registro…» sul pulsante premuto e disattiva gli altri", () => {
    render(
      <CallOutcomes
        customer="Mario Rossi"
        now={now}
        pending="app.to"
        onOutcome={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Registro…" })).toBeTruthy()
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Non risponde" })
        .disabled
    ).toBe(true)
  })

  it("«Non interessato» chiama onOutcome con l'esito", async () => {
    const user = userEvent.setup()
    const onOutcome = vi.fn()
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={onOutcome} />
    )

    await user.click(screen.getByRole("button", { name: "Non interessato" }))

    expect(onOutcome).toHaveBeenCalledWith(
      "non interessato",
      undefined,
      undefined
    )
  })

  it("mostra l'errore sotto il calendario", async () => {
    render(
      <CallOutcomes
        customer="Mario Rossi"
        now={now}
        error="Non è stato possibile registrare la chiamata"
        onOutcome={vi.fn()}
      />
    )

    expect(
      await screen.findByText("Non è stato possibile registrare la chiamata")
    ).toBeTruthy()
  })

  it("sotto il titolo dice a chi serve «Richiamare» (home-operatore AC18)", async () => {
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={vi.fn()} />
    )

    await openPanel()

    expect(
      screen.getByText(
        "Ha risposto e vuole essere richiamato. Se non ha risposto, usa Non risponde."
      )
    ).toBeTruthy()
  })

  it("il messaggio si ferma a 500 caratteri e lo dice (home-operatore AC47)", async () => {
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={vi.fn()} />
    )
    const user = await openPanel()
    const field = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Messaggio",
    })

    await user.click(field)
    await user.paste("x".repeat(499))
    expect(screen.queryByText("Massimo 500 caratteri")).toBeNull()
    await user.type(field, "yyy")

    expect(field.value).toHaveLength(500)
    expect(screen.getByText("Massimo 500 caratteri")).toBeTruthy()
  })
})

/** The button of `day` of the month shown, not of the days around it */
const dayButton = (day: number) =>
  within(screen.getByRole("grid"))
    .getAllByRole("button")
    .find(
      (button) =>
        button.textContent === String(day) && !button.closest("[data-outside]")
    )!

describe("il salvataggio del riquadro (home-operatore AC20)", () => {
  /** The panel saved with the 6th and a message, as the parent sees it */
  async function save(onOutcome = vi.fn()) {
    const view = render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={onOutcome} />
    )
    const user = await openPanel()
    await user.click(dayButton(6))
    await user.type(
      screen.getByRole("textbox", { name: "Messaggio" }),
      "La mia bozza"
    )
    await user.click(
      screen.getByRole("button", { name: "Salva richiamo del 06/11" })
    )
    const rerender = (props: {
      pending?: "richiamare" | null
      error?: string
    }) =>
      view.rerender(
        <CallOutcomes
          customer="Mario Rossi"
          now={now}
          onOutcome={onOutcome}
          {...props}
        />
      )
    return { user, rerender }
  }

  it("resta aperto durante il salvataggio, che dice «Registro…», ed Esc non lo chiude", async () => {
    const onOutcome = vi.fn()
    const { user, rerender } = await save(onOutcome)

    expect(onOutcome).toHaveBeenCalledWith(
      "richiamare",
      expect.any(Date),
      "La mia bozza"
    )
    rerender({ pending: "richiamare" })
    expect(screen.getByRole("textbox", { name: "Messaggio" })).toBeTruthy()
    const saving = screen
      .getAllByRole<HTMLButtonElement>("button", { name: "Registro…" })
      .find((button) => button.closest("form") !== null)
    expect(saving?.disabled).toBe(true)
    await user.keyboard("{Escape}")

    expect(screen.getByRole("textbox", { name: "Messaggio" })).toBeTruthy()
  })

  it("si chiude quando la registrazione riesce", async () => {
    const { rerender } = await save()

    rerender({ pending: "richiamare" })
    rerender({ pending: null })

    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Messaggio" })).toBeNull()
    )
  })

  it("rifiutata o incerta, resta aperto con il giorno, il messaggio e il motivo", async () => {
    const { rerender } = await save()

    rerender({ pending: "richiamare" })
    rerender({ pending: null, error: "Il richiamo si imposta da domani" })

    expect(screen.getByText("Il richiamo si imposta da domani")).toBeTruthy()
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Messaggio" }).value
    ).toBe("La mia bozza")
    expect(
      screen.getByRole("button", { name: "Salva richiamo del 06/11" })
    ).toBeTruthy()
  })
})

describe("il riquadro come dialogo (home-operatore AC21, AC45, AC46)", () => {
  const renderOutcomes = () =>
    render(
      <CallOutcomes customer="Mario Rossi" now={now} onOutcome={vi.fn()} />
    )

  it("è un dialogo con il nome del suo titolo, a sinistra del pulsante", async () => {
    renderOutcomes()

    await openPanel()

    const dialog = screen.getByRole("dialog", {
      name: "Richiamare Mario Rossi",
    })
    expect(dialog.getAttribute("data-side")).toBe("left")
  })

  it("aperto, il fuoco va sul giorno di domani", async () => {
    renderOutcomes()

    await openPanel()

    await waitFor(() => expect(document.activeElement).toBe(dayButton(3)))
  })

  it("Esc lo chiude e il fuoco torna su «Richiamare»", async () => {
    renderOutcomes()
    const user = await openPanel()

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Richiamare Mario Rossi" })
      ).toBeNull()
    )
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Richiamare" })
    )
  })

  it("riaperto, mostra la bozza: il calendario sul mese del giorno scelto, con il fuoco su quel giorno", async () => {
    renderOutcomes()
    const user = await openPanel()
    await user.click(screen.getByRole("button", { name: /next|successiv/i }))
    await user.click(dayButton(10))
    await user.type(screen.getByRole("textbox", { name: "Messaggio" }), "Bozza")
    await user.keyboard("{Escape}")

    await user.click(screen.getByRole("button", { name: "Richiamare" }))

    expect(screen.getByRole("grid").getAttribute("aria-label")).toMatch(
      /dicembre 2026/i
    )
    await waitFor(() => expect(document.activeElement).toBe(dayButton(10)))
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Messaggio" }).value
    ).toBe("Bozza")
    expect(
      screen.getByRole("button", { name: "Salva richiamo del 10/12" })
    ).toBeTruthy()
  })
})
