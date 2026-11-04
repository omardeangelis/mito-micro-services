import { describe, expect, it } from "vitest"
import {
  daysSince,
  extendStart,
  proposeDeadline,
  romeToday,
  shortcuts,
  workdaysLeft,
} from "../days"

describe("romeToday", () => {
  it("dà il giorno di Roma, non quello UTC", () => {
    // 23:30 UTC d'inverno sono già le 00:30 del giorno dopo a Roma
    expect(romeToday(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16")
    // d'estate le 22:30 UTC sono le 00:30
    expect(romeToday(new Date("2026-07-15T22:30:00Z"))).toBe("2026-07-16")
    expect(romeToday(new Date("2026-07-15T21:30:00Z"))).toBe("2026-07-15")
  })
})

describe("workdaysLeft", () => {
  it("conta da domani alla scadenza compresa, lun–ven", () => {
    // mercoledì 4 nov 2026 -> venerdì 6 nov: giovedì e venerdì
    expect(workdaysLeft("2026-11-04", "2026-11-06")).toBe(2)
    // fino a lunedì 9: giovedì, venerdì, lunedì
    expect(workdaysLeft("2026-11-04", "2026-11-09")).toBe(3)
    // venerdì 6 -> sabato 7: nessuno
    expect(workdaysLeft("2026-11-06", "2026-11-07")).toBe(0)
  })

  it("conta i festivi come lavorativi", () => {
    // 25 dic 2026 è venerdì
    expect(workdaysLeft("2026-12-24", "2026-12-25")).toBe(1)
  })

  it("è 0 quando la scadenza è oggi o passata", () => {
    expect(workdaysLeft("2026-11-04", "2026-11-04")).toBe(0)
    expect(workdaysLeft("2026-11-04", "2026-10-01")).toBe(0)
  })
})

describe("proposeDeadline", () => {
  it("è oggi più 30 giorni", () => {
    expect(proposeDeadline("2026-11-04")).toBe("2026-12-04")
    expect(proposeDeadline("2026-12-20")).toBe("2027-01-19")
  })
})

describe("shortcuts", () => {
  it("dà +14, +30, +45 e fine mese", () => {
    expect(shortcuts("2026-11-04", "2026-11-05")).toEqual([
      { label: "+14 giorni", day: "2026-11-18", disabled: false },
      { label: "+30 giorni", day: "2026-12-04", disabled: false },
      { label: "+45 giorni", day: "2026-12-19", disabled: false },
      { label: "Fine mese", day: "2026-11-30", disabled: false },
    ])
  })

  it("«Fine mese» l'ultimo giorno del mese è disattivata", () => {
    const s = shortcuts("2026-11-30", "2026-12-01")
    expect(s[3]).toEqual({
      label: "Fine mese",
      day: "2026-11-30",
      disabled: true,
    })
    expect(s[0]!.disabled).toBe(false)
  })

  it("disattiva chi cade prima del minimo", () => {
    const s = shortcuts("2026-11-04", "2026-12-10")
    expect(s.map((x) => x.disabled)).toEqual([true, true, false, true])
  })

  it("fine mese di febbraio bisestile", () => {
    expect(shortcuts("2028-02-10", "2028-02-11")[3]!.day).toBe("2028-02-29")
  })
})

describe("extendStart", () => {
  it("è oggi + 14 se la scadenza è vicina", () => {
    expect(extendStart("2026-11-04", "2026-11-10")).toBe("2026-11-18")
  })
  it("è il giorno dopo la scadenza se più lontana", () => {
    expect(extendStart("2026-11-04", "2026-12-31")).toBe("2027-01-01")
  })
  it("con la scadenza passata parte da oggi + 14", () => {
    expect(extendStart("2026-11-04", "2026-10-01")).toBe("2026-11-18")
  })
})

describe("daysSince", () => {
  it("conta i giorni di calendario", () => {
    expect(daysSince("2026-11-03", "2026-11-04")).toBe(1)
    expect(daysSince("2026-10-25", "2026-11-04")).toBe(10)
    expect(daysSince("2026-03-27", "2026-03-30")).toBe(3) // ora legale
    expect(daysSince("2026-11-04", "2026-11-04")).toBe(0)
  })
})
