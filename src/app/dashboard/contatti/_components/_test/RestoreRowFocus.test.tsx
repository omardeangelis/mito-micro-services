import { render } from "@testing-library/react"
import { StrictMode, useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { saveReturnFocus } from "../../_lib/returnFocus"
import { RestoreRowFocus } from "../RestoreRowFocus"

/** A table of contacts as the list renders it, with the component after it. */
function Harness({ ids }: { ids: number[] }) {
  const tableRef = useRef<HTMLTableElement>(null)
  return (
    <>
      <table ref={tableRef} aria-label="Contatti">
        <tbody>
          {ids.map((id) => (
            <tr key={id} data-contact-id={id}>
              <td>
                <button
                  type="button"
                  data-contact-actions=""
                  aria-label={`Azioni ${id}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <RestoreRowFocus tableRef={tableRef} />
    </>
  )
}

const table = () => document.querySelector("table")!
const actionsOf = (id: number) =>
  document.querySelector(`[data-contact-id="${id}"] [data-contact-actions]`)

beforeEach(() => {
  sessionStorage.clear()
  ;(document.activeElement as HTMLElement | null)?.blur()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("RestoreRowFocus", () => {
  it("brings the focus to the actions of the row the detail was opened from", () => {
    saveReturnFocus(2)

    render(<Harness ids={[1, 2, 3]} />)

    expect(document.activeElement).toBe(actionsOf(2))
  })

  it("does it once, also when the effects run twice", () => {
    saveReturnFocus(2)

    render(
      <StrictMode>
        <Harness ids={[1, 2, 3]} />
      </StrictMode>
    )

    expect(document.activeElement).toBe(actionsOf(2))
  })

  it("does not take the value again on a later mount", () => {
    saveReturnFocus(2)
    const { unmount } = render(<Harness ids={[1, 2, 3]} />)
    unmount()
    ;(document.activeElement as HTMLElement | null)?.blur()

    render(<Harness ids={[1, 2, 3]} />)

    expect(document.activeElement).toBe(document.body)
  })

  it("brings the focus to the table when the row is gone", () => {
    saveReturnFocus(99)

    render(<Harness ids={[1, 2, 3]} />)

    expect(document.activeElement).toBe(table())
    // Reachable by script, out of the tab order
    expect(table().getAttribute("tabindex")).toBe("-1")
  })

  it("brings the focus to the table when the detail left was no contact", () => {
    saveReturnFocus(undefined)

    render(<Harness ids={[1, 2, 3]} />)

    expect(document.activeElement).toBe(table())
  })

  it("leaves the focus alone when no detail was closed", () => {
    render(<Harness ids={[1, 2, 3]} />)

    expect(document.activeElement).toBe(document.body)
  })

  it("ignores a closing that is older than 30 seconds", () => {
    saveReturnFocus(2, Date.now() - 31_000)

    render(<Harness ids={[1, 2, 3]} />)

    expect(document.activeElement).toBe(document.body)
  })

  it("brings the focus to the table when the storage can't be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError")
    })

    render(<Harness ids={[1, 2, 3]} />)

    expect(document.activeElement).toBe(table())
  })
})
