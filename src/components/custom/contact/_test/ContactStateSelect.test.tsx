import { act, render, screen, within } from "@testing-library/react"
import * as React from "react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { type TaskStatus } from "@/lib/types/schemas"
import { ContactStateSelect } from "../ContactStateSelect"

const trigger = () => screen.getByRole("button", { name: /, cambia stato$/ })
const menu = () => screen.queryByRole("menu")
const optionNames = () =>
  within(screen.getByRole("menu"))
    .getAllByRole("menuitemradio")
    .map((option) => option.textContent)

function renderSelect(
  props: Partial<React.ComponentProps<typeof ContactStateSelect>> = {}
) {
  const onChange = vi.fn()
  const view = render(
    <ContactStateSelect value="chiamare" onChange={onChange} {...props} />
  )
  return { onChange, ...view }
}

describe("ContactStateSelect", () => {
  it("followup non è mai tra le opzioni", async () => {
    const user = userEvent.setup()
    const states: (TaskStatus | null)[] = [
      null,
      "nessuno",
      "chiamare",
      "richiamare",
      "followup",
    ]
    for (const value of states) {
      const { unmount } = renderSelect({ value })
      await user.click(trigger())
      expect(optionNames()).not.toContain("followup")
      unmount()
    }
  })

  it("da followup non c'è chiamare", async () => {
    const user = userEvent.setup()
    renderSelect({ value: "followup" })

    await user.click(trigger())

    expect(optionNames()).not.toContain("chiamare")
    expect(optionNames()).toEqual([
      "non interessato",
      "app.to",
      "caricato",
      "richiamare",
      "erogata",
      "nessuno",
    ])
  })

  it("lo stato attuale non è tra le opzioni", async () => {
    const user = userEvent.setup()
    renderSelect({ value: "richiamare" })

    await user.click(trigger())

    expect(optionNames()).not.toContain("richiamare")
    expect(optionNames()).toContain("chiamare")
  })

  it("un contatto senza stato conta come nessuno: nessuno non è un'opzione", async () => {
    const user = userEvent.setup()
    renderSelect({ value: null })

    await user.click(trigger())

    expect(optionNames()).not.toContain("nessuno")
  })

  it("scegliere un'opzione chiama onChange con quello stato, chiude il menu e riporta il focus sul trigger", async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect({ value: "chiamare" })
    await user.click(trigger())

    await user.click(screen.getByRole("menuitemradio", { name: "erogata" }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith("erogata")
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it("le opzioni si raggiungono e si scelgono da tastiera", async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect({ value: "chiamare" })
    trigger().focus()

    await user.keyboard("{ArrowDown}")
    expect(menu()).not.toBeNull()
    await user.keyboard("{ArrowDown}{Enter}")

    expect(onChange).toHaveBeenCalledWith("app.to")
    expect(document.activeElement).toBe(trigger())
  })

  it("mostra il valore che riceve, non quello scelto", async () => {
    const user = userEvent.setup()
    const { onChange, rerender } = renderSelect({ value: "chiamare" })
    await user.click(trigger())

    await user.click(screen.getByRole("menuitemradio", { name: "erogata" }))

    expect(onChange).toHaveBeenCalledWith("erogata")
    expect(trigger().textContent).toBe("chiamare")
    rerender(<ContactStateSelect value="chiamare" onChange={onChange} />)
    expect(trigger().textContent).toBe("chiamare")
    rerender(<ContactStateSelect value="erogata" onChange={onChange} />)
    expect(trigger().textContent).toBe("erogata")
  })

  it("il trigger mostra nessuno quando il valore è null", () => {
    renderSelect({ value: null })

    expect(trigger().textContent).toBe("nessuno")
  })

  it("il trigger ha larghezza fissa w-40, anche in attesa", () => {
    const { rerender, onChange } = renderSelect()
    expect(trigger().className).toContain("w-40")

    rerender(
      <ContactStateSelect value="chiamare" onChange={onChange} pending />
    )

    expect(trigger().className).toContain("w-40")
  })

  it("il menu non ha classi di animazione", async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(trigger())

    const content = screen.getByRole("menu")
    expect(content.className).not.toMatch(/animate-|fade-|zoom-|slide-/)
  })

  it("le opzioni non hanno transizioni: l'evidenziazione cambia subito", async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(trigger())

    const options = screen.getAllByRole("menuitemradio")
    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(option.className).not.toContain("transition")
    }
  })

  it("l'opzione evidenziata ha un anello visibile, non solo lo sfondo", async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(trigger())

    for (const option of screen.getAllByRole("menuitemradio")) {
      expect(option.className).toContain("focus:ring-2")
      expect(option.className).toContain("focus:ring-inset")
      expect(option.className).toContain("focus:ring-ring")
    }
  })

  it("il trigger si chiama come il valore e dice cosa fa: '<stato>, cambia stato'", () => {
    const { unmount } = render(
      <ContactStateSelect value="app.to" onChange={vi.fn()} />
    )
    expect(
      screen.getByRole("button", { name: "app.to, cambia stato" })
    ).not.toBeNull()
    unmount()

    render(<ContactStateSelect value={null} onChange={vi.fn()} />)
    expect(
      screen.getByRole("button", { name: "nessuno, cambia stato" })
    ).not.toBeNull()
  })

  it("passa il ref al trigger", () => {
    const ref = { current: null as HTMLButtonElement | null }
    renderSelect({ triggerRef: ref })

    expect(ref.current).toBe(trigger())
  })

  describe("con pending", () => {
    it("il trigger è aria-busy e aria-disabled, non disabled, e mostra lo spinner", () => {
      renderSelect({ pending: true })

      expect(trigger().getAttribute("aria-busy")).toBe("true")
      expect(trigger().getAttribute("aria-disabled")).toBe("true")
      expect(trigger().hasAttribute("disabled")).toBe(false)
      const spinner = trigger().querySelector("svg.animate-spin")
      expect(spinner).not.toBeNull()
      expect(spinner?.getAttribute("class")).toContain(
        "motion-reduce:animate-none"
      )
    })

    it("senza pending niente spinner e aria-busy è false", () => {
      renderSelect()

      expect(trigger().getAttribute("aria-busy")).toBe("false")
      expect(trigger().querySelector("svg.animate-spin")).toBeNull()
    })

    it("clic, Enter, Spazio e freccia giù non aprono il menu e il focus resta sul trigger", async () => {
      const user = userEvent.setup()
      renderSelect({ pending: true })
      trigger().focus()

      await user.click(trigger())
      expect(menu()).toBeNull()
      await user.keyboard("{Enter}")
      expect(menu()).toBeNull()
      await user.keyboard(" ")
      expect(menu()).toBeNull()
      await user.keyboard("{ArrowDown}")
      expect(menu()).toBeNull()

      expect(document.activeElement).toBe(trigger())
    })

    it("se l'attesa comincia con il menu aperto, il menu si chiude", async () => {
      const user = userEvent.setup()
      const { rerender, onChange } = renderSelect()
      await user.click(trigger())
      expect(menu()).not.toBeNull()

      rerender(
        <ContactStateSelect value="chiamare" onChange={onChange} pending />
      )

      expect(menu()).toBeNull()
    })

    it("scegliendo un'opzione l'attesa comincia subito, e alla fine il menu resta chiuso", async () => {
      const user = userEvent.setup()
      // As the table and the customer sheet do: the wait starts inside
      // onChange, and the saved value arrives when it ends
      let finish: (() => void) | undefined
      function Parent() {
        const [value, setValue] = React.useState<TaskStatus>("chiamare")
        const [pending, setPending] = React.useState(false)
        finish = () => {
          setValue("app.to")
          setPending(false)
        }
        return (
          <ContactStateSelect
            value={value}
            onChange={() => setPending(true)}
            pending={pending}
          />
        )
      }
      render(<Parent />)

      await user.click(trigger())
      await user.click(screen.getByRole("menuitemradio", { name: "app.to" }))
      expect(menu()).toBeNull()
      act(() => finish?.())

      expect(trigger().textContent).toBe("app.to")
      expect(menu()).toBeNull()
    })
  })
})
