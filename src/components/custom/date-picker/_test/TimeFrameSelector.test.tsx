import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TimeFrameSelector } from ".."

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Il selettore mostra il periodo che la pagina ha letto dall'URL (AC11): la
// lettura sta solo nella pagina (`page.test.tsx`). Next non rimonta la pagina
// quando cambia solo la query, quindi il selettore segue anche un periodo
// nuovo sulla stessa istanza (link "Dashboard", Indietro)

const shownWith = (timeframe: "30d" | "90d" | "365d") => {
  render(<TimeFrameSelector timeframe={timeframe} />)
  return screen.getByRole("combobox").textContent
}

describe("TimeFrameSelector: il periodo mostrato (AC11)", () => {
  it.each(["30d", "90d", "365d"] as const)("con `%s` mostra `%s`", (tf) => {
    expect(shownWith(tf)).toBe(tf)
  })
})

describe("TimeFrameSelector: dopo una navigazione nella stessa pagina (AC11)", () => {
  it("con il periodo che passa da `90d` a `30d`, mostra `30d`", () => {
    const { rerender } = render(<TimeFrameSelector timeframe="90d" />)
    rerender(<TimeFrameSelector timeframe="30d" />)
    expect(screen.getByRole("combobox").textContent).toBe("30d")
  })
})
