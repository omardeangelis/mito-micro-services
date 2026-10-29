import { act, screen } from "@testing-library/react"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { fakeCustomers } from "@/test/customers"
import { renderCustomers } from "./page"

// The list scrolls inside the sheet (spec design-system-web, AC9), under the
// filters bar (`sticky top-0`) and over the pagination (`sticky bottom-0`, 46
// px): scrolling to a focused control must stop clear of both (AC13, WCAG
// 2.4.11). The bar grows a row of chips with a filter, so the space on top
// follows its height, also when a chip comes in after the page opened. jsdom
// measures nothing: the bar is given a height, and the test calls the
// observers back when it changes it
const BAR_WITH_CHIPS = 105
let barHeight = BAR_WITH_CHIPS
const observers: { callback: ResizeObserverCallback; observer: unknown }[] = []
const resize = (height: number) => {
  barHeight = height
  act(() => {
    for (const { callback, observer } of observers) {
      callback([], observer as ResizeObserver)
    }
  })
}

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("sticky") &&
        this.classList.contains("top-0")
        ? barHeight
        : 0
    }
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe() {
        observers.push({ callback: this.callback, observer: this })
      }
      unobserve = () => undefined
      disconnect = () => {
        const i = observers.findIndex((o) => o.observer === this)
        if (i >= 0) observers.splice(i, 1)
      }
    }
  )
})

afterAll(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("CustomersPage, lo scroll sotto le barre", () => {
  it("lascia sopra l'altezza della barra dei filtri, chip comprese, e sotto quella della paginazione", async () => {
    const { container } = renderCustomers(
      "/dashboard/customers?filter_by=sede=[fstorino3]",
      fakeCustomers()
    )
    await screen.findByText("RSSMRA80A01H501U")

    const layout = container.querySelector<HTMLElement>(".dashbaord-layout")!
    expect(layout.style.getPropertyValue("--filters-height")).toBe(
      `${BAR_WITH_CHIPS}px`
    )
    expect([...layout.classList]).toEqual(
      expect.arrayContaining([
        "scroll-pt-[calc(var(--filters-height,71px)+4px)]",
        "scroll-pb-[50px]",
      ])
    )

    // A search adds a chip without opening the page again
    resize(151)
    expect(layout.style.getPropertyValue("--filters-height")).toBe("151px")
  })
})
