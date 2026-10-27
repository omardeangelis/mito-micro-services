import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { Calendar } from "../calendar"

// react-day-picker 8 declares React up to 18: this checks it on React 19
// (1.b.1 of brain/chore/migrazione-frontend-react.md)

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
      <output>{date?.getDate() ?? "nessuna"}</output>
    </>
  )
}

describe("Calendar", () => {
  it("mostra il mese e seleziona un giorno", async () => {
    const user = userEvent.setup()
    render(<SingleDate />)

    expect(screen.getByRole("grid")).toBeInTheDocument()
    await user.click(screen.getByRole("gridcell", { name: "15" }))

    expect(screen.getByRole("status")).toHaveTextContent("15")
  })

  it("con captionLayout dropdown mostra mese e anno da scegliere", () => {
    render(
      <Calendar
        mode="single"
        captionLayout="dropdown"
        fromYear={2020}
        toYear={2030}
        defaultMonth={new Date(2026, 9, 1)}
      />
    )

    expect(screen.getAllByRole("combobox")).toHaveLength(2)
  })
})
