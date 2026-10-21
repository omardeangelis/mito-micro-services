import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ContactsHome from "../page"

vi.mock("next/cache", () => ({ unstable_noStore: () => undefined }))
vi.mock("../_components/ContactsTableSection", () => ({
  ContactsTableSection: () => <p>tabella</p>,
}))

describe("la pagina dei contatti", () => {
  it("lascia sotto la barra della paginazione lo spazio che serve a un controllo col focus (WCAG 2.4.11)", async () => {
    const { container } = render(
      await ContactsHome({ searchParams: Promise.resolve({}) })
    )

    // The bar is `sticky bottom-0`, about 56 px: scrolling to a focused control
    // must stop above it. CSS cannot be measured here; the class is the contract
    const layout = container.querySelector(".dashbaord-layout")!
    expect(layout.classList.contains("scroll-pb-16")).toBe(true)
  })
})
