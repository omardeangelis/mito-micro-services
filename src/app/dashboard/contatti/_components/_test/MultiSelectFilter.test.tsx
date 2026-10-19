import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { MultiSelectFilter } from "../MultiSelectFilter"

const options = [
  { value: "chiamare", label: "chiamare" },
  { value: "richiamare", label: "richiamare" },
  { value: "erogata", label: "erogata" },
] as const

type Value = (typeof options)[number]["value"]

/** The filter the way the bar uses it: it shows what the parent hands back. */
function Controlled({
  initial = [],
  onChange,
}: {
  initial?: Value[]
  onChange?: (value: Value[]) => void
}) {
  const [value, setValue] = useState<Value[]>(initial)
  return (
    <MultiSelectFilter
      label="Stato"
      options={options}
      value={value}
      onChange={(next) => {
        onChange?.(next)
        setValue(next)
      }}
    />
  )
}

const trigger = (name: string | RegExp = /^Stato/) =>
  screen.getByRole("button", { name })

describe("MultiSelectFilter", () => {
  it("is a button named after the filter, closed until it is asked to open", () => {
    render(<Controlled />)

    expect(trigger("Stato")).toBeTruthy()
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("says how many choices are made in the accessible name", () => {
    const { unmount } = render(<Controlled initial={["chiamare"]} />)
    expect(trigger("Stato, 1 selezionato")).toBeTruthy()
    unmount()

    render(<Controlled initial={["chiamare", "erogata"]} />)
    expect(trigger("Stato, 2 selezionati")).toBeTruthy()
  })

  it("opens with the keyboard and lists every option as a checkbox, checked as the value says", async () => {
    const user = userEvent.setup()
    render(<Controlled initial={["richiamare"]} />)

    trigger().focus()
    await user.keyboard("{Enter}")

    const boxes = screen.getAllByRole("checkbox")
    expect(boxes.map((box) => box.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
    ])
    expect(screen.getByRole("checkbox", { name: "richiamare" })).toBeTruthy()
  })

  it("puts the focus on the first option when it opens", async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(trigger())

    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "chiamare" })
    )
  })

  it("chooses with the space bar and hands the choice back in the order of the options", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={["erogata"]} onChange={onChange} />)
    await user.click(trigger())

    await user.keyboard(" ")

    expect(onChange).toHaveBeenLastCalledWith(["chiamare", "erogata"])
    expect(trigger("Stato, 2 selezionati")).toBeTruthy()
  })

  it("takes a choice away", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Controlled initial={["chiamare", "erogata"]} onChange={onChange} />)
    await user.click(trigger())

    await user.click(screen.getByRole("checkbox", { name: "erogata" }))

    expect(onChange).toHaveBeenLastCalledWith(["chiamare"])
  })

  it("moves between the options with the arrow keys", async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    await user.click(trigger())

    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "richiamare" })
    )
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "erogata" })
    )
    await user.keyboard("{ArrowUp}")
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "richiamare" })
    )
  })

  it("closes with Escape and gives the focus back to the button", async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    await user.click(trigger())
    expect(screen.getAllByRole("checkbox")).toHaveLength(3)

    await user.keyboard("{Escape}")

    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("keeps the options in a group named after the filter", async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    await user.click(trigger())

    const group = screen.getByRole("group", { name: "Stato" })

    expect(within(group).getAllByRole("checkbox")).toHaveLength(3)
  })
})
