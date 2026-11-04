import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { addDays, type Day } from "@mito/domain/wave/days"
import { DeadlineField } from "../DeadlineField"

function Field({
  today,
  start,
  min = addDays(today, 1),
}: {
  today: Day
  start: Day
  min?: Day
}) {
  const [value, setValue] = useState(start)
  return (
    <>
      <DeadlineField
        value={value}
        onChange={setValue}
        today={today}
        min={min}
      />
      <output>{value}</output>
    </>
  )
}

const open = async (name: string) => {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name }))
  return {
    user,
    popover: await screen.findByRole("dialog", { name: "Scegli la scadenza" }),
  }
}

describe("Il campo della scadenza (AC6, AC33)", () => {
  it("il pulsante ha per nome «Scadenza, <giorno>» e accanto i giorni lavorativi", () => {
    render(<Field today="2026-11-04" start="2026-12-03" />)

    const button = screen.getByRole("button", { name: "Scadenza, gio 3 dic" })
    expect(button).toHaveAccessibleDescription("21 giorni lavorativi")
  })

  it("una scorciatoia sceglie il giorno e chiude il riquadro", async () => {
    render(<Field today="2026-11-04" start="2026-12-04" />)
    const { user, popover } = await open("Scadenza, ven 4 dic")

    await user.click(
      within(popover).getByRole("button", { name: "+14 giorni" })
    )

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("2026-11-18")
    expect(
      screen.getByRole("button", { name: "Scadenza, mer 18 nov" })
    ).toBeInTheDocument()
  })

  it("scegliere un giorno del calendario chiude il riquadro", async () => {
    render(<Field today="2026-11-04" start="2026-12-04" />)
    const { user, popover } = await open("Scadenza, ven 4 dic")

    await user.click(
      within(popover).getByRole("button", { name: /10 dicembre 2026/ })
    )

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("2026-12-10")
  })

  it("con il minimo domani, l'ultimo giorno del mese «Fine mese» è disattivata e oggi non si sceglie", async () => {
    render(<Field today="2026-11-30" start="2026-12-30" />)
    const { popover } = await open("Scadenza, mer 30 dic")

    expect(
      within(popover).getByRole("button", { name: "Fine mese" })
    ).toBeDisabled()
    expect(
      within(popover).getByRole("button", { name: "+14 giorni" })
    ).toBeEnabled()
    await userEvent
      .setup()
      .click(within(popover).getByRole("button", { name: "Mese precedente" }))
    expect(
      within(popover).getByRole("button", { name: /30 novembre 2026/ })
    ).toBeDisabled()
    expect(
      within(popover).getByRole("button", { name: /\b1 dicembre 2026/ })
    ).toBeEnabled()
  })

  it("prende il nome del riquadro e l'etichetta, come «Proroga»", async () => {
    render(
      <DeadlineField
        value="2026-12-04"
        onChange={() => undefined}
        today="2026-11-04"
        min="2026-11-21"
        label="Nuova scadenza"
        title="Proroga"
      />
    )

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Nuova scadenza, ven 4 dic" }))

    const popover = await screen.findByRole("dialog", { name: "Proroga" })
    expect(
      within(popover).getByRole("button", { name: "+14 giorni" })
    ).toBeDisabled()
    expect(
      within(popover).getByRole("button", { name: "+30 giorni" })
    ).toBeEnabled()
  })
})
