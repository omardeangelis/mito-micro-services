import { describe, expect, it } from "vitest"
import type { WaveView } from "@/api/import"
import { fromGroups } from "../FromStep"

type Member = WaveView["team"][number]

const member = (overrides: Partial<Member>): Member => ({
  operatorId: 7,
  name: "Ada Lovelace",
  role: "OPERATORE",
  shown: true,
  pace: 20,
  exactPace: 20.2,
  inactiveDays: null,
  active: 5,
  waveTodo: { toCall: 2, noAnswer: 1 },
  ...overrides,
})

describe("L'ordine di «Da chi» (AC23)", () => {
  it("a pari «Totale», due persone con lo stesso nome vanno nell'ordine dell'id utente", () => {
    // The lower operator id has the higher user id (Definizioni, «in ordine di nome»)
    const a = member({ operatorId: 3, userId: "user-b" })
    const b = member({ operatorId: 9, userId: "user-a" })
    for (const team of [
      [a, b],
      [b, a],
    ]) {
      const people = fromGroups(team).flatMap((group) => group.people)
      expect(people.map((person) => person.operatorId)).toEqual([9, 3])
    }
  })
})
