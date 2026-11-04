import { describe, expect, it } from "vitest"
import {
  levelUp,
  shareProportionally,
  splitByPace,
  splitEqually,
  takeSame,
} from "../split"

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0)
const p = (userId: string, name: string, pace: number) => ({
  userId,
  name,
  pace,
})

describe("splitByPace", () => {
  const team = [p("a", "Ada", 3), p("b", "Bruno", 1), p("c", "Carla", 1)]

  it("divide secondo il ritmo esatto", () => {
    const parts = splitByPace(5, team)
    expect(parts).toEqual([3, 1, 1])
    expect(sum(parts)).toBe(5)
  })

  it("con tutti i ritmi a 0 divide come «In parti uguali»", () => {
    const zero = team.map((x) => ({ ...x, pace: 0 }))
    expect(splitByPace(7, zero)).toEqual(splitEqually(7, zero))
  })

  it("dà i resti alla parte decimale più alta, a pari in ordine di nome", () => {
    // 10 su 1:1:1 -> 3 resta 1, tutte le parti decimali uguali: Ada
    const even = [p("z", "Zeno", 1), p("a", "Ada", 1), p("b", "Bruno", 1)]
    expect(splitByPace(10, even)).toEqual([3, 4, 3])
    // 3 su 2:1:1 -> 1,5 0,75 0,75: parti 1,0,0 resto 2 a Bruno e Carla (0,75)
    const t = [p("a", "Ada", 2), p("b", "Bruno", 1), p("c", "Carla", 1)]
    const parts = splitByPace(3, t)
    expect(parts).toEqual([1, 1, 1])
  })

  it("la somma è sempre «Quanti»", () => {
    for (let n = 0; n < 60; n++) {
      const parts = splitByPace(n, [
        p("a", "Ada", 7),
        p("b", "Bruno", 3),
        p("c", "Carla", 0),
        p("d", "Dino", 2),
      ])
      expect(sum(parts)).toBe(n)
    }
  })

  it("senza persone non divide niente", () => {
    expect(splitByPace(5, [])).toEqual([])
  })
})

describe("splitEqually", () => {
  it("dà i resti uno a testa in ordine di nome, poi id", () => {
    const people = [
      { userId: "3", name: "Carla" },
      { userId: "2", name: "Ada" },
      { userId: "1", name: "Ada" },
    ]
    expect(splitEqually(11, people)).toEqual([3, 4, 4])
    expect(splitEqually(9, people)).toEqual([3, 3, 3])
  })

  it("tra omonimi i resti seguono l'id dell'utente, non quello dell'operatore", () => {
    // Operatori «9» e «10»: come stringhe «10» viene prima, ma gli utenti sono
    // nell'ordine opposto
    const homonyms = [
      { operatorId: "9", userId: "user-a", name: "Ada Neri" },
      { operatorId: "10", userId: "user-b", name: "Ada Neri" },
    ]
    expect(splitEqually(1, homonyms)).toEqual([1, 0])
    expect(
      splitByPace(
        1,
        homonyms.map((x) => ({ ...x, pace: 1 }))
      )
    ).toEqual([1, 0])
    expect(
      levelUp(
        1,
        homonyms.map((x) => ({ ...x, active: 0 }))
      )
    ).toEqual([1, 0])
  })

  it("ordina con l'alfabeto italiano", () => {
    const people = [
      { userId: "1", name: "Èva" },
      { userId: "2", name: "Eva" },
    ]
    // «Eva» viene prima di «Èva»
    expect(splitEqually(1, people)).toEqual([0, 1])
  })
})

describe("levelUp", () => {
  const q = (userId: string, name: string, active: number) => ({
    userId,
    name,
    active,
  })

  it("porta i più scarichi allo stesso livello", () => {
    const parts = levelUp(10, [
      q("a", "Ada", 0),
      q("b", "Bruno", 4),
      q("c", "Carla", 10),
    ])
    expect(parts).toEqual([7, 3, 0])
  })

  it("i resti vanno a chi è al livello, con lo stesso Totale, in ordine di nome", () => {
    // livello 5 costa 5 (Ada 0 -> 5), resto 1: Ada e Bruno hanno Totale 5
    expect(levelUp(6, [q("b", "Bruno", 5), q("a", "Ada", 0)])).toEqual([0, 6])
    // chi sta sopra il livello non riceve resti
    expect(
      levelUp(1, [q("b", "Bruno", 2), q("a", "Ada", 2), q("c", "Carla", 9)])
    ).toEqual([0, 1, 0])
  })

  it("la somma è «Quanti» e nessuno scende sotto il livello", () => {
    for (let n = 0; n < 40; n++) {
      const parts = levelUp(n, [
        q("a", "Ada", 3),
        q("b", "Bruno", 8),
        q("c", "Carla", 0),
      ])
      expect(sum(parts)).toBe(n)
      expect(Math.min(...parts)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe("shareProportionally", () => {
  const h = (userId: string, name: string, contacts: number) => ({
    userId,
    name,
    contacts,
  })

  it("cede la parte intera e dà i resti alla parte decimale più alta", () => {
    // 5 su 10:20:30 = 0,83 1,67 2,5
    expect(
      shareProportionally(5, [
        h("a", "Ada", 10),
        h("b", "Bruno", 20),
        h("c", "Carla", 30),
      ])
    ).toEqual([1, 2, 2])
  })

  it("non supera i contatti di nessuno e la somma è il numero", () => {
    const holders = [h("a", "Ada", 1), h("b", "Bruno", 2), h("c", "Carla", 4)]
    for (let n = 0; n <= 7; n++) {
      const parts = shareProportionally(n, holders)
      expect(sum(parts)).toBe(n)
      parts.forEach((x, i) =>
        expect(x).toBeLessThanOrEqual(holders[i]!.contacts)
      )
    }
  })
})

describe("takeSame", () => {
  it("cede il numero, o tutti i contatti se ne ha meno", () => {
    expect(
      takeSame(5, [
        { userId: "a", name: "Ada", contacts: 12 },
        { userId: "b", name: "Bruno", contacts: 3 },
      ])
    ).toEqual([5, 3])
  })
})
