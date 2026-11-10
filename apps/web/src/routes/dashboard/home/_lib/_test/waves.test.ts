import { describe, expect, it } from "vitest"
import { latestWave } from "@/test/adminHome"
import {
  barPercent,
  deadlineText,
  detailInactiveText,
  detailPeopleText,
  neverCalledText,
  sortPeople,
  toCallText,
  importedText,
  meterText,
  progressText,
  summaryText,
  workedPercent,
} from "../waves"
import { inactiveText } from "../../../import/wave/split/_lib/preview"

const parts = {
  unassigned: 0,
  neverCalled: 0,
  calledNoOutcome: 0,
  worked: 0,
  noContact: 0,
}

describe("summaryText (AC9)", () => {
  it("con clienti senza operatore", () => {
    expect(
      summaryText({ unassignedDistinct: 3, neverCalledDistinct: 2854 })
    ).toBe("3 clienti senza operatore · 2.854 contatti mai chiamati")
  })
  it("senza clienti senza operatore", () => {
    expect(
      summaryText({ unassignedDistinct: 0, neverCalledDistinct: 12 })
    ).toBe("Nessun cliente senza operatore · 12 contatti mai chiamati")
  })
  it("singolare con 1 (AC34)", () => {
    expect(summaryText({ unassignedDistinct: 1, neverCalledDistinct: 1 })).toBe(
      "1 cliente senza operatore · 1 contatto mai chiamato"
    )
  })
})

describe("importedText (AC10)", () => {
  const today = "2026-11-05"
  it.each([
    ["2026-11-05T09:00:00.000Z", "importata oggi"],
    ["2026-11-04T09:00:00.000Z", "importata ieri"],
    ["2026-11-02T09:00:00.000Z", "importata 3 giorni fa"],
  ])("%s", (at, text) => {
    expect(importedText({ importedAt: new Date(at) }, today)).toBe(text)
  })
})

describe("deadlineText (AC10)", () => {
  it("aperta: scade con il giorno", () => {
    expect(
      deadlineText(latestWave({ status: "open", deadline: "2026-12-03" }))
    ).toEqual({ text: " · scade 3/12", tone: "muted" })
  })
  it("scaduta: i da fare sono la somma di quelli delle persone, in rosso", () => {
    const person = {
      operatorId: 1,
      userId: "u",
      name: "A",
      inactiveDays: null,
      neverCalled: 0,
    }
    expect(
      deadlineText(
        latestWave({
          status: "expired",
          people: [
            { ...person, toCall: 4 },
            { ...person, operatorId: 2, userId: "v", toCall: 1200 },
          ],
        })
      )
    ).toEqual({ text: " · scaduta · 1.204 da fare", tone: "danger" })
  })
  it("da confermare: in ambra", () => {
    expect(
      deadlineText(latestWave({ status: "unconfirmed", deadline: null }))
    ).toEqual({ text: " · scadenza da confermare", tone: "warning" })
  })
})

describe("progress", () => {
  it("la percentuale è per difetto", () => {
    expect(workedPercent(1, 3)).toBe(33)
    expect(workedPercent(2, 3)).toBe(66)
    expect(workedPercent(3, 3)).toBe(100)
  })
  it("«<N> lavorati · <P%>» e «Nessun cliente»", () => {
    expect(progressText({ customers: 3, parts: { ...parts, worked: 2 } })).toBe(
      "2 lavorati · 66%"
    )
    expect(progressText({ customers: 0, parts })).toBe("Nessun cliente")
  })
  it("il testo dell'indicatore (AC31)", () => {
    expect(
      meterText({
        customers: 2854,
        parts: {
          unassigned: 1,
          neverCalled: 2,
          calledNoOutcome: 3,
          worked: 2000,
          noContact: 848,
        },
      })
    ).toBe(
      "2.000 lavorati, 3 chiamati senza esito, 2 mai chiamati, 1 senza operatore, su 2.854 clienti"
    )
  })
})

describe("il singolare con 1 (AC34)", () => {
  it("progressText: «1 lavorato»", () => {
    expect(progressText({ customers: 3, parts: { ...parts, worked: 1 } })).toBe(
      "1 lavorato · 33%"
    )
  })
  it("meterText: ogni voce con 1 è al singolare, anche «su 1 cliente»", () => {
    expect(
      meterText({
        customers: 1,
        parts: {
          unassigned: 1,
          neverCalled: 1,
          calledNoOutcome: 1,
          worked: 1,
          noContact: 0,
        },
      })
    ).toBe(
      "1 lavorato, 1 chiamato senza esito, 1 mai chiamato, 1 senza operatore, su 1 cliente"
    )
  })
  it("meterText: con 0 e con più di 1 è al plurale", () => {
    expect(
      meterText({
        customers: 2,
        parts: {
          unassigned: 0,
          neverCalled: 0,
          calledNoOutcome: 2,
          worked: 0,
          noContact: 0,
        },
      })
    ).toBe(
      "0 lavorati, 2 chiamati senza esito, 0 mai chiamati, 0 senza operatore, su 2 clienti"
    )
  })
})

const person = (
  operatorId: number,
  name: string,
  inactiveDays: number | null,
  neverCalled: number
) => ({
  operatorId,
  userId: `user-${operatorId}`,
  name,
  inactiveDays,
  toCall: 1,
  neverCalled,
})

describe("sortPeople (D12, AC12)", () => {
  it("inattivi prima; poi più mai chiamati; poi nome", () => {
    const sorted = sortPeople([
      person(1, "Zeno", null, 0),
      person(2, "Carla", null, 5),
      person(3, "Anna", null, 5),
      person(4, "Marta", 9, 1),
      person(5, "Luca", 3, 4),
    ])
    expect(sorted.map((p) => p.name)).toEqual([
      "Luca",
      "Marta",
      "Anna",
      "Carla",
      "Zeno",
    ])
  })
  it("un inattivo con 0 giorni è comunque inattivo; l'id è l'ultima parità; l'originale non cambia", () => {
    const input = [person(2, "Ada", null, 1), person(1, "Ada", 0, 1)]
    expect(sortPeople(input).map((p) => p.operatorId)).toEqual([1, 2])
    expect(input.map((p) => p.operatorId)).toEqual([2, 1])
    expect(
      sortPeople([person(2, "Ada", null, 1), person(1, "Ada", null, 1)]).map(
        (p) => p.operatorId
      )
    ).toEqual([1, 2])
  })
})

describe("i testi del dettaglio (AC12, AC34)", () => {
  it("operatori", () => {
    expect(detailPeopleText(1)).toBe("· 1 operatore")
    expect(detailPeopleText(2)).toBe("· 2 operatori")
  })
  it("mai chiamati da chi è inattivo solo con M > 0", () => {
    expect(detailInactiveText([person(1, "A", null, 7)])).toBeNull()
    expect(detailInactiveText([person(1, "A", 4, 0)])).toBeNull()
    expect(
      detailInactiveText([person(1, "A", 4, 2), person(2, "B", 1, 1000)])
    ).toBe("· 1.002 mai chiamati da chi è inattivo")
  })
  it("giorni, da chiamare, mai chiamati", () => {
    expect(inactiveText(1)).toBe("inattivo da 1 giorno")
    expect(inactiveText(9)).toBe("inattivo da 9 giorni")
    expect(toCallText(1200)).toBe("1.200 da chiamare")
    expect(neverCalledText(1)).toBe("1 mai chiamato")
    expect(neverCalledText(0)).toBe("0 mai chiamati")
  })
  it("barPercent: il più alto è pieno, senza più alto è vuota", () => {
    expect(barPercent(40, 40)).toBe(100)
    expect(barPercent(10, 40)).toBe(25)
    expect(barPercent(0, 0)).toBe(0)
  })
})
