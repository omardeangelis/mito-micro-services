import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { Calendar } from "../calendar"

// The Calendar of shadcn on react-day-picker 9, on React 19

const SingleDate = () => {
  const [date, setDate] = useState<Date | undefined>()
  return (
    <>
      <Calendar
        mode="single"
        defaultMonth={new Date(2026, 9, 1)}
        selected={date}
        onSelect={setDate}
      />
      <output aria-label="Data scelta">{date?.getDate() ?? "nessuna"}</output>
    </>
  )
}

describe("Calendar", () => {
  it("mostra il mese e seleziona un giorno", async () => {
    const user = userEvent.setup()
    render(<SingleDate />)

    expect(screen.getByRole("grid")).toBeInTheDocument()
    // The day is a button inside its cell, named by its whole date
    await user.click(screen.getByRole("button", { name: /October 15th, 2026/ }))

    expect(
      screen.getByRole("status", { name: "Data scelta" })
    ).toHaveTextContent("15")
  })

  it("con captionLayout dropdown mostra mese e anno da scegliere", () => {
    render(
      <Calendar
        mode="single"
        captionLayout="dropdown"
        startMonth={new Date(2020, 0)}
        endMonth={new Date(2030, 11)}
        defaultMonth={new Date(2026, 9, 1)}
      />
    )

    expect(screen.getAllByRole("combobox")).toHaveLength(2)
  })
})
