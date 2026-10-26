import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TimeFrameSelector } from ".."

const mocks = vi.hoisted(() => ({ push: vi.fn<[string], void>() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}))

beforeEach(() => {
  mocks.push.mockClear()
})

// Il selettore mostra il periodo che la pagina ha letto dall'URL (AC11): la
// lettura sta solo nella pagina (`page.test.tsx`). Next non rimonta la pagina
// quando cambia solo la query, quindi il selettore segue anche un periodo
// nuovo sulla stessa istanza (link "Dashboard", Indietro)

const shownWith = (timeframe: "30d" | "90d" | "365d") => {
  render(<TimeFrameSelector timeframe={timeframe} />)
  return screen.getByRole("combobox").textContent
}

/** Apre il selettore e sceglie `option`. */
const pick = async (
  user: ReturnType<typeof userEvent.setup>,
  option: "30d" | "90d" | "365d"
) => {
  await user.click(screen.getByRole("combobox"))
  await user.click(await screen.findByRole("option", { name: option }))
}

describe("TimeFrameSelector: il periodo mostrato (AC11)", () => {
  it.each(["30d", "90d", "365d"] as const)(
    "con `%s` mostra lo stesso periodo",
    (tf) => {
      expect(shownWith(tf)).toBe(tf)
    }
  )
})

describe("TimeFrameSelector: dopo una navigazione nella stessa pagina (AC11)", () => {
  it("con il periodo che passa da `90d` a `30d`, mostra `30d`", () => {
    const { rerender } = render(<TimeFrameSelector timeframe="90d" />)
    rerender(<TimeFrameSelector timeframe="30d" />)
    expect(screen.getByRole("combobox").textContent).toBe("30d")
  })
})

describe("TimeFrameSelector: la scelta di un periodo (AC11)", () => {
  it("scegliendo `90d` su `30d`, naviga una volta a un indirizzo con `tf=90d`", async () => {
    const user = userEvent.setup()
    render(<TimeFrameSelector timeframe="30d" />)

    await pick(user, "90d")

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(
      new URL(mocks.push.mock.calls[0]?.[0] ?? "").searchParams.get("tf")
    ).toBe("90d")
  })

  it("mentre la navigazione è in corso, con il periodo della pagina ancora `30d`, mostra `90d`", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TimeFrameSelector timeframe="30d" />)

    await pick(user, "90d")
    rerender(<TimeFrameSelector timeframe="30d" />)

    expect(screen.getByRole("combobox").textContent).toBe("90d")
  })

  it("quando la navigazione arriva e il periodo della pagina diventa `90d`, il fuoco resta sul selettore", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TimeFrameSelector timeframe="30d" />)
    await pick(user, "90d")
    const trigger = screen.getByRole("combobox")
    // Radix rende il fuoco al selettore dopo la chiusura
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    rerender(<TimeFrameSelector timeframe="90d" />)

    expect(screen.getByRole("combobox")).toBe(trigger)
    expect(document.activeElement).toBe(trigger)
  })
})
