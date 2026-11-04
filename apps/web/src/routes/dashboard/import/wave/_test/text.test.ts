import { describe, expect, it } from "vitest"
import {
  assignedText,
  chosenText,
  customersText,
  dayText,
  formatNumber,
  importedWhen,
  movedText,
  notMovedText,
  operatorsText,
  shortDay,
  toAssignText,
  workdaysText,
} from "../_lib/text"

describe("I testi della pagina della Wave", () => {
  it("usano il singolare con 1 (AC36)", () => {
    expect(toAssignText(1)).toBe("1 da assegnare")
    expect(operatorsText(1)).toBe("1 operatore")
    expect(chosenText(1)).toBe("1 scelto")
    expect(assignedText(1)).toBe("Assegnato 1 cliente")
    expect(movedText(1)).toBe("Spostato 1 contatto")
    expect(workdaysText(1)).toBe("1 giorno lavorativo")
    expect(notMovedText(1)).toBe("1 non spostato")
    expect(customersText(1)).toBe("1 cliente")
  })

  it("e il plurale con gli altri numeri, anche 0", () => {
    expect(toAssignText(4)).toBe("4 da assegnare")
    expect(operatorsText(3)).toBe("3 operatori")
    expect(chosenText(0)).toBe("0 scelti")
    expect(assignedText(342)).toBe("Assegnati 342 clienti")
    expect(movedText(12)).toBe("Spostati 12 contatti")
    expect(workdaysText(0)).toBe("0 giorni lavorativi")
    expect(notMovedText(3)).toBe("3 non spostati")
    expect(customersText(2854)).toBe("2.854 clienti")
  })

  it("scrivono i numeri con il punto anche a 4 cifre", () => {
    expect(formatNumber(999)).toBe("999")
    expect(formatNumber(2854)).toBe("2.854")
    expect(formatNumber(12_000)).toBe("12.000")
    expect(formatNumber(1_234_567)).toBe("1.234.567")
  })

  it("scrivono i giorni come «gio 3 dic» e «3/12»", () => {
    expect(dayText("2026-12-03")).toBe("gio 3 dic")
    expect(dayText("2026-11-02")).toBe("lun 2 nov")
    expect(shortDay("2026-12-03")).toBe("3/12")
  })

  it("dicono quando la Wave è stata importata, nel giorno di Roma", () => {
    expect(importedWhen(new Date("2026-11-04T08:00:00Z"), "2026-11-04")).toBe(
      "oggi"
    )
    // 23:30 UTC of the 3rd is already the 4th in Rome
    expect(importedWhen(new Date("2026-11-03T23:30:00Z"), "2026-11-04")).toBe(
      "oggi"
    )
    expect(importedWhen(new Date("2026-11-03T08:00:00Z"), "2026-11-04")).toBe(
      "ieri"
    )
    expect(importedWhen(new Date("2026-10-25T08:00:00Z"), "2026-11-04")).toBe(
      "10 giorni fa"
    )
  })
})
