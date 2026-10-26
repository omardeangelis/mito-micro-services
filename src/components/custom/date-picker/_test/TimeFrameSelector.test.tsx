import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TimeFrameSelector } from ".."

const mocks = vi.hoisted(() => ({ search: "" }))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push: vi.fn() }),
}))

/** Il periodo che il selettore mostra con la query `search` nell'URL. */
const shownWith = (search: string) => {
  mocks.search = search
  render(<TimeFrameSelector />)
  return screen.getByRole("combobox").textContent
}

beforeEach(() => {
  mocks.search = ""
})

describe("TimeFrameSelector: il periodo mostrato (AC11)", () => {
  it("con `?tf=7d` mostra `30d`", () => {
    expect(shownWith("tf=7d")).toBe("30d")
  })

  it("senza `tf` mostra `30d`", () => {
    expect(shownWith("")).toBe("30d")
  })

  it("con `?tf=90d` mostra `90d`", () => {
    expect(shownWith("tf=90d")).toBe("90d")
  })
})
