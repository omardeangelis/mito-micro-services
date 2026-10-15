import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useCustomerSearch } from "@/lib/hooks/useCustomerSearch"

// Lo stato della ricerca nella pagina Clienti mentre l'URL cambia senza
// rimontare la pagina (ricerca, cambio di voce, back e avanti)

const url = vi.hoisted(() => ({ params: new URLSearchParams() }))

vi.mock("next/navigation", () => ({
  useSearchParams: () => url.params,
}))

function navigate(query: string) {
  url.params = new URLSearchParams(query)
}

beforeEach(() => {
  navigate("")
})

describe("useCustomerSearch", () => {
  it("legge la ricerca in corso dall'URL", () => {
    navigate("q=Roma&search_by=comune")
    const { result } = renderHook(() => useCustomerSearch())
    expect(result.current).toMatchObject({
      q: "Roma",
      active: "comune",
      selected: "comune",
    })
  })

  it("un search_by sconosciuto o ripetuto mostra il codice fiscale", () => {
    navigate("q=Roma&search_by=address")
    expect(renderHook(() => useCustomerSearch()).result.current).toMatchObject({
      active: "fiscalCode",
      selected: "fiscalCode",
    })
    navigate("q=Roma&search_by=comune&search_by=email")
    expect(renderHook(() => useCustomerSearch()).result.current).toMatchObject({
      active: "fiscalCode",
      selected: "fiscalCode",
    })
  })

  it("quando l'URL cambia senza rimontare segue la ricerca", () => {
    navigate("q=Roma&search_by=comune")
    const { result, rerender } = renderHook(() => useCustomerSearch())
    navigate("q=Bianchi&search_by=surname")
    rerender()
    expect(result.current).toMatchObject({
      q: "Bianchi",
      active: "surname",
      selected: "surname",
    })
  })

  it("dopo il cambio di voce, senza ricerca, tiene la scelta", () => {
    navigate("q=Roma&search_by=comune")
    const { result, rerender } = renderHook(() => useCustomerSearch())
    act(() => result.current.setSelected("email"))
    navigate("")
    rerender()
    expect(result.current).toMatchObject({
      q: "",
      active: "fiscalCode",
      selected: "email",
    })
  })
})
