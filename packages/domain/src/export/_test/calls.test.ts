import { describe, expect, it } from "vitest"
import { taskStatus } from "@mito/db/schema/task"
import type { TaskStatus } from "../../schemas"
import {
  answerRateOrNull,
  appointmentRate,
  appointmentRateOrNull,
  rankByAppointmentRateOrNull,
  isCall,
  rankByAppointmentRate,
  sortByCalls,
  totalsOf,
  type OperatorCalls,
} from "../calls"

// Written out by hand from the definitions of the spec, not computed from the module
const from: TaskStatus[] = [
  "chiamare",
  "followup",
  "non risponde",
  "richiamare",
]
const to: TaskStatus[] = [
  "app.to",
  "caricato",
  "erogata",
  "non interessato",
  "richiamare",
  "non risponde",
]

describe("isCall", () => {
  it("counts a callback from richiamare, not a step of the practice (AC10)", () => {
    expect(isCall("richiamare", "app.to")).toBe(true)
    expect(isCall("app.to", "caricato")).toBe(false)
  })

  const pairs = [null, ...taskStatus].flatMap((a) =>
    taskStatus.map((b) => [a, b] as const)
  )
  it.each(pairs)("%s -> %s", (a, b) => {
    expect(isCall(a, b)).toBe(
      a !== b && a !== null && from.includes(a) && to.includes(b)
    )
  })
})

const row = (
  surname: string,
  values: Partial<OperatorCalls> = {}
): OperatorCalls => ({
  operatorId: surname.length,
  name: "Anna",
  surname,
  calls: 0,
  answered: 0,
  appointments: 0,
  noAnswer: 0,
  ...values,
})

describe("sortByCalls", () => {
  it("puts more calls first, then orders by surname and name (AC12)", () => {
    const rows = [
      row("Verdi", { calls: 2 }),
      row("Bianchi", { calls: 5 }),
      row("Rossi", { calls: 2, name: "Bruno" }),
      row("Rossi", { calls: 2, name: "Anna" }),
    ]
    expect(sortByCalls(rows).map((r) => `${r.surname} ${r.name}`)).toEqual([
      "Bianchi Anna",
      "Rossi Anna",
      "Rossi Bruno",
      "Verdi Anna",
    ])
  })

  it("orders namesakes by operator id, so the order never depends on the query", () => {
    const rows = [
      row("Rossi", { operatorId: 9 }),
      row("Rossi", { operatorId: 3 }),
    ]
    expect(sortByCalls(rows).map((r) => r.operatorId)).toEqual([3, 9])
  })
})

describe("rankByAppointmentRate", () => {
  it("orders by appointments over answered, with 0% when nobody answered (AC18)", () => {
    const rows = [
      row("Neri", { answered: 0, appointments: 0, calls: 3, noAnswer: 3 }),
      row("Bianchi", { answered: 4, appointments: 1 }),
      row("Rossi", { answered: 2, appointments: 1 }),
      row("Abate", { answered: 4, appointments: 1 }),
    ]
    expect(rankByAppointmentRate(rows).map((r) => r.surname)).toEqual([
      "Rossi",
      "Abate",
      "Bianchi",
      "Neri",
    ])
    expect(appointmentRate(rows[0]!)).toBe(0)
    expect(appointmentRate(rows[2]!)).toBe(0.5)
  })
})

describe("totalsOf", () => {
  it("sums the four totals of every operator (AC12)", () => {
    expect(
      totalsOf([
        row("Rossi", { calls: 3, answered: 2, appointments: 1, noAnswer: 1 }),
        row("Verdi", { calls: 1, answered: 0, appointments: 0, noAnswer: 1 }),
      ])
    ).toEqual({ calls: 4, answered: 2, appointments: 1, noAnswer: 2 })
  })
})

describe("rates without a value (esiti-richiami-stati AC27)", () => {
  const totals = (calls: number, answered: number, appointments: number) => ({
    calls,
    answered,
    appointments,
    noAnswer: calls - answered,
  })

  it("gives no answer rate without calls, and 0 with calls nobody answered", () => {
    expect(answerRateOrNull(totals(0, 0, 0))).toBeNull()
    expect(answerRateOrNull(totals(4, 0, 0))).toBe(0)
    expect(answerRateOrNull(totals(4, 3, 0))).toBe(0.75)
  })

  it("gives no appointment rate without answered calls, and 0 with answers but no appointments", () => {
    expect(appointmentRateOrNull(totals(3, 0, 0))).toBeNull()
    expect(appointmentRateOrNull(totals(3, 2, 0))).toBe(0)
    expect(appointmentRateOrNull(totals(4, 4, 1))).toBe(0.25)
    // The old function stays as it was, for the Next.js app (D18)
    expect(appointmentRate(totals(3, 0, 0))).toBe(0)
  })

  it("ranks who has no rate after every rate, 0% included", () => {
    const row = (
      operatorId: number,
      surname: string,
      answered: number,
      appointments: number
    ): OperatorCalls => ({
      operatorId,
      name: "Anna",
      surname,
      calls: answered + 1,
      answered,
      appointments,
      noAnswer: 1,
    })

    expect(
      rankByAppointmentRateOrNull([
        row(1, "Aaa", 0, 0),
        row(2, "Bbb", 4, 0),
        row(3, "Ccc", 4, 2),
      ]).map((r) => r.surname)
    ).toEqual(["Ccc", "Bbb", "Aaa"])
  })
})
