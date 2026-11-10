import { describe, expect, it } from "vitest"
import { latestWave, teamDetail, teamMember } from "@/test/adminHome"
import { wavePageHref } from "../../../import/_components/format"
import {
  calledText,
  lastCallText,
  overdueText,
  rateText,
  sortMembers,
  teamAssignHref,
  teamSummaryText,
  toCallNote,
} from "../team"

// The order and the texts of «Dettaglio giornaliero» (spec home-admin, AC27, AC28)

// 10:00 in Rome, the fake's instant
const { now, today } = teamDetail()

const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000)

/** 12:00 in Rome, `days` calendar days ago (CET in November) */
const daysAgo = (days: number) =>
  new Date(Date.parse("2026-11-05T11:00:00.000Z") - days * 86_400_000)

const parts = {
  unassigned: 0,
  neverCalled: 0,
  calledNoOutcome: 0,
  worked: 0,
  noContact: 0,
}

describe("lastCallText", () => {
  it.each([
    ["una chiamata di 59 minuti fa", minutesAgo(59), "alle 09:01", null],
    ["esattamente 60 minuti fa", minutesAgo(60), "alle 09:00", "ferma da 1 h"],
    ["95 minuti fa", minutesAgo(95), "alle 08:25", "ferma da 1 h 35 min"],
    ["120 minuti fa", minutesAgo(120), "alle 08:00", "ferma da 2 h"],
  ])("oggi: %s", (_, lastCallAt, text, idle) => {
    expect(
      lastCallText({ lastCallAt, inactiveDays: null }, now, today)
    ).toStrictEqual({ text, tone: null, idle })
  })

  it.each([
    ["ieri", daysAgo(1), null, "Ieri", "muted"],
    [
      "alle 23:30 di ieri, in Roma",
      new Date("2026-11-04T22:30:00.000Z"),
      null,
      "Ieri",
      "muted",
    ],
    ["2 giorni fa", daysAgo(2), null, "2 giorni fa", "muted"],
    ["9 giorni fa, inattivo", daysAgo(9), 9, "Inattivo da 9 giorni", "warning"],
    ["mai", null, null, "Nessuna oggi", "muted"],
  ])("senza chiamate oggi: %s", (_, lastCallAt, inactiveDays, text, tone) => {
    expect(
      lastCallText({ lastCallAt, inactiveDays }, now, today)
    ).toStrictEqual({ text, tone, idle: null })
  })

  it("una chiamata dopo la mezzanotte di Roma è di oggi anche se in UTC è di ieri", () => {
    const lastCallAt = new Date("2026-11-04T23:30:00.000Z")
    expect(
      lastCallText({ lastCallAt, inactiveDays: null }, now, today).text
    ).toBe("alle 00:30")
  })
})

describe("overdueText", () => {
  it.each([
    [0, null, "Nessuno"],
    [3, 1, "il più vecchio da ieri"],
    [3, 2, "il più vecchio da 2 giorni"],
    [1, 40, "il più vecchio da 40 giorni"],
  ])("%i arretrati, il più vecchio %s", (total, oldestDays, text) => {
    expect(overdueText({ total, oldestDays })).toBe(text)
  })
})

describe("toCallNote", () => {
  it.each([
    [0, 0, "Finiti", "warning"],
    [1, 1, "Quasi finiti", "warning"],
    [299, 50, "Quasi finiti", "warning"],
    [300, 50, "50 mai chiamati", "muted"],
    [300, 1, "1 mai chiamato", "muted"],
    [1500, 1200, "1.200 mai chiamati", "muted"],
  ])("%i da chiamare, %i mai chiamati", (toCall, neverCalled, text, tone) => {
    expect(toCallNote({ toCall, neverCalled })).toStrictEqual({ text, tone })
  })
})

describe("rateText", () => {
  it.each([
    [0, 0, "—"],
    [10, 0, "0%"],
    [2, 1, "50%"],
    [3, 1, "33,3%"],
  ])("%i chiamate, %i risposte", (calls, answered, text) => {
    expect(rateText({ calls, answered })).toBe(text)
  })
})

describe("il riepilogo", () => {
  const called = teamMember({ userId: "a", calls: 3 })
  const silent = teamMember({ userId: "b" })
  const late = teamMember({
    userId: "c",
    overdue: { total: 2, oldestDays: 3, rows: [] },
  })

  it.each([
    [[], "0 su 0 hanno chiamato"],
    [[called, silent], "1 su 2 ha chiamato"],
    [[called, { ...silent, calls: 1 }], "2 su 2 hanno chiamato"],
  ])("%#", (members, text) => {
    expect(calledText(members)).toBe(text)
  })

  it("dice gli arretrati solo quando ci sono, al singolare con 1", () => {
    expect(teamSummaryText([called, silent])).toBe("1 su 2 ha chiamato")
    expect(teamSummaryText([called, late])).toBe(
      "1 su 2 ha chiamato · 1 con arretrati"
    )
    expect(teamSummaryText([late, { ...late, userId: "d" }])).toBe(
      "0 su 2 hanno chiamato · 2 con arretrati"
    )
  })
})

describe("sortMembers", () => {
  const overdue = (total: number, oldestDays: number | null) => ({
    total,
    oldestDays,
    rows: [],
  })
  const names = (order: "arretrati" | "chiamate" | "nome", members = team) =>
    sortMembers(members, order).map((member) => member.name)

  const team = [
    teamMember({
      userId: "1",
      name: "Zeno",
      calls: 5,
      overdue: overdue(2, 3),
    }),
    teamMember({ userId: "2", name: "Ada", calls: 1 }),
    teamMember({ userId: "3", name: "Èva", calls: 5 }),
    teamMember({
      userId: "4",
      name: "Bruno",
      calls: 9,
      overdue: overdue(2, 8),
    }),
    teamMember({
      userId: "5",
      name: "Carla",
      calls: 0,
      overdue: overdue(7, 1),
    }),
  ]

  it("«Arretrati»: più arretrati, a pari il più vecchio, poi il nome", () => {
    expect(names("arretrati")).toStrictEqual([
      "Carla",
      "Bruno",
      "Zeno",
      "Ada",
      "Èva",
    ])
  })

  it("«Arretrati»: a pari numero e giorni, per nome", () => {
    const members = [
      teamMember({ userId: "1", name: "Zeno", overdue: overdue(2, 3) }),
      teamMember({ userId: "2", name: "Ada", overdue: overdue(2, 3) }),
    ]
    expect(names("arretrati", members)).toStrictEqual(["Ada", "Zeno"])
  })

  it("«Chiamate»: più chiamate, a pari per nome", () => {
    expect(names("chiamate")).toStrictEqual([
      "Bruno",
      "Èva",
      "Zeno",
      "Ada",
      "Carla",
    ])
  })

  it("«Nome»: alfabetico italiano, con lo stesso nome per utente", () => {
    expect(names("nome")).toStrictEqual([
      "Ada",
      "Bruno",
      "Carla",
      "Èva",
      "Zeno",
    ])
    const twins = sortMembers(
      [
        teamMember({ userId: "b", name: "Ada" }),
        teamMember({ userId: "a", name: "Ada" }),
      ],
      "nome"
    )
    expect(twins.map((member) => member.userId)).toStrictEqual(["a", "b"])
  })

  it("non cambia l'elenco che riceve", () => {
    const before = team.map((member) => member.name)
    sortMembers(team, "nome")
    expect(team.map((member) => member.name)).toStrictEqual(before)
  })
})

describe("teamAssignHref", () => {
  const hrefOf = (id: number) =>
    wavePageHref({ id, format: "wave", status: "completed" })
  const wave = (runId: number, unassigned: number) =>
    latestWave({ runId, parts: { ...parts, unassigned } })

  it("sceglie la Wave con più clienti senza operatore, con la persona", () => {
    expect(teamAssignHref([wave(1, 2), wave(2, 5), wave(3, 0)], 7)).toBe(
      `${hrefOf(2)}?per=7`
    )
  })

  it("a pari, la più recente: la prima delle righe", () => {
    expect(teamAssignHref([wave(9, 4), wave(8, 4)], 12)).toBe(
      `${hrefOf(9)}?per=12`
    )
  })

  it("è null senza Wave e con righe tutte senza clienti senza operatore", () => {
    expect(teamAssignHref([], 7)).toBeNull()
    expect(teamAssignHref([wave(1, 0), wave(2, 0)], 7)).toBeNull()
  })
})
