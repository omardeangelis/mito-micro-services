import { describe, expect, it } from "vitest"
import { taskStatus } from "@mito/db/schema/task"
import type { TaskStatus } from "../../schemas"
import {
  appointmentRate,
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
