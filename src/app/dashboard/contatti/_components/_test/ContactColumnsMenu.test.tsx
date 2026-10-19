import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ContactColumnsMenu } from "../ContactColumnsMenu"

const mocks = vi.hoisted(() => ({
  setContactTableVisibleColumns: vi.fn(),
  fetch: vi.fn(),
  refresh: vi.fn(),
}))

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

  it("nascondere una colonna: la tabella lo sa subito, lo store pure, e il server la salva con ?pref=cot", async () => {
    const { user, onChange } = setup([])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(onChange).toHaveBeenCalledWith(["Telefono"])
    expect(mocks.setContactTableVisibleColumns).toHaveBeenCalledWith([
      "Telefono",
    ])
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/user/preferences?pref=cot")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      preferences: { contactTableVisibleColumns: ["Telefono"] },
    })
  })

  it("mostrare una colonna nascosta la toglie dall'elenco, senza toccare le altre", async () => {
    const { user, onChange } = setup(["Telefono", "CF"])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "CF" }))

    expect(onChange).toHaveBeenCalledWith(["Telefono"])
    expect(
      JSON.parse(
        (mocks.fetch.mock.calls[0] as [string, RequestInit])[1].body as string
      )
    ).toEqual({
      preferences: { contactTableVisibleColumns: ["Telefono"] },
    })
  })

  it("conserva i nomi che non conosce (una colonna di domani)", async () => {
    const { user, onChange } = setup(["colonna-futura"])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "CF" }))

    expect(onChange).toHaveBeenCalledWith(["colonna-futura", "CF"])
  })

  it("dopo il salvataggio rinfresca la pagina: tornando dal dettaglio la lista non usa la copia vecchia della cache del router", async () => {
    const { user } = setup([])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
  })

  it("se il server rifiuta il salvataggio (500, 401) non rinfresca e lo segnala nella console", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 500 })
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { user, onChange } = setup([])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(onChange).toHaveBeenCalledWith(["Telefono"])
    expect(mocks.refresh).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it("se il server non risponde non si rompe: la scelta resta a schermo", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("fetch failed"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const { user, onChange } = setup([])
    await openMenu(user)

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Telefono" }))

    expect(onChange).toHaveBeenCalledWith(["Telefono"])
    spy.mockRestore()
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
