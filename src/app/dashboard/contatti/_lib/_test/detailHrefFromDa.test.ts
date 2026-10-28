import { describe, expect, it } from "vitest"
import { detailHrefFromDa } from "../detailHrefFromDa"
import {
  defaultState,
  detailHref,
  parse,
} from "@mito/client/contact/searchParams"

describe("detailHrefFromDa", () => {
  it("porta al contatto la vista della lista che il dettaglio ha già (AC25, AC27)", () => {
    const state = parse({ stato: "richiamare", pagina: "2" })

    expect(detailHrefFromDa(202, "stato=richiamare&pagina=2")).toBe(
      detailHref(202, state)
    )
    expect(detailHrefFromDa(202, "stato=richiamare&pagina=2")).toBe(
      "/dashboard/contatti/202?da=stato%3Drichiamare%26pagina%3D2"
    )
  })

  it("accetta 'da' con o senza il punto interrogativo, come returnHref", () => {
    expect(detailHrefFromDa(7, "?alert=1")).toBe(
      detailHref(7, { ...defaultState, hasAlert: true })
    )
  })

  it("senza una vista non porta niente", () => {
    expect(detailHrefFromDa(7, undefined)).toBe("/dashboard/contatti/7")
    expect(detailHrefFromDa(7, "")).toBe("/dashboard/contatti/7")
  })

  it("tiene solo i parametri validi (P15, AC18)", () => {
    expect(detailHrefFromDa(7, "stato=boh,chiamare&x=1&pagina=0")).toBe(
      detailHref(7, { ...defaultState, states: ["chiamare"] })
    )
  })

  it("non porta un indirizzo esterno né un 'da' ripetuto", () => {
    expect(detailHrefFromDa(7, "https://evil.example/?stato=erogata")).toBe(
      "/dashboard/contatti/7"
    )
    expect(detailHrefFromDa(7, ["stato=erogata", "stato=chiamare"])).toBe(
      "/dashboard/contatti/7"
    )
  })

  it("con un id che non è un contatto rimanda alla lista", () => {
    expect(detailHrefFromDa(0, "stato=chiamare")).toBe(
      "/dashboard/contatti?stato=chiamare"
    )
  })
})
