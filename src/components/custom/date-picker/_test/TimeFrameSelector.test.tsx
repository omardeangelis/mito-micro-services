import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TimeFrameSelector } from ".."

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Il selettore mostra il periodo che la pagina ha letto dall'URL (AC11): la
// lettura sta solo nella pagina (`page.test.tsx`)

const shownWith = (timeframe: "30d" | "90d" | "365d") => {
  render(<TimeFrameSelector timeframe={timeframe} />)
  return screen.getByRole("combobox").textContent
}

describe("TimeFrameSelector: il periodo mostrato (AC11)", () => {
  it.each(["30d", "90d", "365d"] as const)("con `%s` mostra `%s`", (tf) => {
    expect(shownWith(tf)).toBe(tf)
  })
})
