import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { type TimeFrame } from "@mito/domain/constants/timeframes"
import { TimeFrameSelector } from ".."

const mocks = vi.hoisted(() => ({
  push: vi.fn<[string, { scroll?: boolean }?], void>(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}))

beforeEach(() => {
  mocks.push.mockReset()
})

// Il selettore mostra il periodo che la pagina ha letto dall'URL (AC11): la
// lettura sta solo nella pagina (`page.test.tsx`). Next non rimonta la pagina
// quando cambia solo la query, quindi il selettore segue anche un periodo
// nuovo sulla stessa istanza (link "Dashboard", Indietro)

const shownWith = (timeframe: TimeFrame) => {
  render(<TimeFrameSelector timeframe={timeframe} />)
  return screen.getByRole("combobox").textContent
}

/** Apre il selettore e sceglie `option`. */
const pick = async (
  user: ReturnType<typeof userEvent.setup>,
  option: TimeFrame
) => {
  await user.click(screen.getByRole("combobox"))
  await user.click(await screen.findByRole("option", { name: option }))
}

// La pagina finta, con la navigazione come in Next: `push` la apre in una
// transizione e la lascia in sospeso; la pagina cambia solo quando arriva una
// navigazione, la stessa o una che la sostituisce
type Page = { timeframe: TimeFrame; waiting: boolean }
const never = new Promise<never>(() => undefined)
let setPage: React.Dispatch<React.SetStateAction<Page>> = () => undefined

const Waiting = ({ waiting }: { waiting: boolean }) => {
  if (waiting) throw never
  return null
}

const FakePage = ({ initial }: { initial: TimeFrame }) => {
  const [page, set] = React.useState<Page>({
    timeframe: initial,
    waiting: false,
  })
  setPage = set
  return (
    <React.Suspense fallback={null}>
      <TimeFrameSelector timeframe={page.timeframe} />
      <Waiting waiting={page.waiting} />
    </React.Suspense>
  )
}

const renderPage = (timeframe: TimeFrame) => {
  mocks.push.mockImplementation(() =>
    React.startTransition(() => setPage((page) => ({ ...page, waiting: true })))
  )
  render(<FakePage initial={timeframe} />)
}

/** Arriva una navigazione alla pagina con `timeframe`. */
const arrive = (timeframe: TimeFrame) =>
  act(() => React.startTransition(() => setPage({ timeframe, waiting: false })))

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
    renderPage("30d")

    await pick(user, "90d")

    expect(mocks.push).toHaveBeenCalledTimes(1)
    expect(
      new URL(mocks.push.mock.calls[0]?.[0] ?? "").searchParams.get("tf")
    ).toBe("90d")
  })

  // Con lo scroll di default, a navigazione arrivata Next dà il fuoco al primo
  // elemento della pagina (`main`, che in Chrome lo prende perché scorre)
  it("scegliendo un periodo, naviga senza scorrere la pagina", async () => {
    const user = userEvent.setup()
    renderPage("30d")

    await pick(user, "90d")

    expect(mocks.push).toHaveBeenCalledWith(expect.any(String), {
      scroll: false,
    })
  })

  it("mentre la navigazione è in corso, con il periodo della pagina ancora `30d`, mostra `90d`", async () => {
    const user = userEvent.setup()
    renderPage("30d")

    await pick(user, "90d")

    expect(screen.getByRole("combobox").textContent).toBe("90d")
  })

  it("quando la navigazione arriva e il periodo della pagina diventa `90d`, il fuoco resta sul selettore", async () => {
    const user = userEvent.setup()
    renderPage("30d")
    await pick(user, "90d")
    const trigger = screen.getByRole("combobox")
    // Radix rende il fuoco al selettore dopo la chiusura
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))

    arrive("90d")

    expect(screen.getByRole("combobox")).toBe(trigger)
    expect(document.activeElement).toBe(trigger)
  })

  // Next scarta la navigazione della scelta quando ne parte un'altra prima che
  // arrivi (link "Home", Indietro): la pagina resta sul suo periodo
  it("se prima che arrivi la navigazione di `90d` arriva un'altra alla pagina con `30d`, mostra `30d`", async () => {
    const user = userEvent.setup()
    renderPage("30d")
    await pick(user, "90d")

    arrive("30d")

    expect(screen.getByRole("combobox").textContent).toBe("30d")
  })
})
