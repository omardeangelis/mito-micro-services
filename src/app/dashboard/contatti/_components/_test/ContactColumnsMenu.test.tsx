import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ContactColumnsMenu } from "../ContactColumnsMenu"

const mocks = vi.hoisted(() => ({
  setContactTableVisibleColumns: vi.fn(),
  fetch: vi.fn(),
  refresh: vi.fn(),
}))

// The menu does not use the router any more: a call would be a refresh
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock("@/store/context/useUserPreferenceContext", () => ({
  useUserPreferenceContext: (
    selector: (state: Record<string, unknown>) => unknown
  ) =>
    selector({
      setContactTableVisibleColumns: mocks.setContactTableVisibleColumns,
    }),
}))

const setup = (hidden: string[] = []) => {
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(<ContactColumnsMenu hidden={hidden} onChange={onChange} />)
  return { user, onChange }
}

const openMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Colonne" }))

beforeEach(() => {
  mocks.setContactTableVisibleColumns.mockClear()
  mocks.fetch.mockReset()
  mocks.refresh.mockClear()
  mocks.fetch.mockResolvedValue({ ok: true })
  vi.stubGlobal("fetch", mocks.fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("la voce per nascondere le colonne (AC5)", () => {
  it("offre Telefono e CF, spuntati quando sono visibili", async () => {
    const { user } = setup(["CF"])

    await openMenu(user)

    const items = screen.getAllByRole("menuitemcheckbox")
    expect(items.map((item) => item.textContent)).toEqual(["Telefono", "CF"])
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ])
  })

  it("nascondere una colonna: la tabella lo sa subito e lo store pure, senza nessuna richiesta al server", async () => {
    const { user, onChange } = setup([])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(onChange).toHaveBeenCalledWith(["Telefono"])
    expect(mocks.setContactTableVisibleColumns).toHaveBeenCalledWith([
      "Telefono",
    ])
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it("mostrare una colonna nascosta la toglie dall'elenco, senza toccare le altre", async () => {
    const { user, onChange } = setup(["Telefono", "CF"])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "CF" }))

    expect(onChange).toHaveBeenCalledWith(["Telefono"])
    expect(mocks.setContactTableVisibleColumns).toHaveBeenCalledWith([
      "Telefono",
    ])
  })

  it("conserva i nomi che non conosce (una colonna di domani)", async () => {
    const { user, onChange } = setup(["colonna-futura"])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "CF" }))

    expect(onChange).toHaveBeenCalledWith(["colonna-futura", "CF"])
  })
})

describe("il focus del menu delle colonne (P17)", () => {
  it("Esc chiude il menu e riporta il focus sul pulsante 'Colonne', non su body", async () => {
    const { user } = setup()
    const trigger = screen.getByRole("button", { name: "Colonne" })

    await openMenu(user)
    expect(screen.getAllByRole("menuitemcheckbox")).toHaveLength(2)
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryAllByRole("menuitemcheckbox")).toHaveLength(0)
    )
    expect(document.activeElement).toBe(trigger)
  })

  it("dopo aver scelto una colonna il menu resta aperto e Esc riporta comunque il focus sul pulsante", async () => {
    const { user } = setup()
    const trigger = screen.getByRole("button", { name: "Colonne" })
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))
    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryAllByRole("menuitemcheckbox")).toHaveLength(0)
    )
    expect(document.activeElement).toBe(trigger)
  })
})
