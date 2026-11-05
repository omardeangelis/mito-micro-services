import { describe, expect, it } from "vitest"
import { type MyCall, type MyCallback } from "@mito/contract/home"
import { type RegisteredCall } from "@mito/contract/task"
import {
  applyRegistered,
  applyWorked,
  countsOf,
  load,
  markResponded,
  markUncertain,
  nextFocus,
  type Queue,
  reconcile,
  settleUncertain,
} from "../queue"

const callback = (alertId: number): MyCallback => ({
  alertId,
  taskId: 100 + alertId,
  customerId: `c${alertId}`,
  name: "Mario",
  surname: "Rossi",
  phoneNumber: "333",
  message: null,
  deadline: new Date("2026-11-02T09:00:00Z"),
  dueDay: "2026-11-02",
  daysLate: 0,
  state: "chiamare",
  triedAt: null,
})

describe("reconcile", () => {
  it("una riga assente da `rows` si chiude come `gone` al suo posto, senza cambiare ordine né lunghezza", () => {
    const queue = load([callback(1), callback(2), callback(3)])

    const next = reconcile(
      queue,
      { rows: [callback(1), callback(3)], readTick: 5 },
      { sending: new Set(), diaryIdle: true }
    )

    expect(next.map(({ alertId }) => alertId)).toEqual([1, 2, 3])
    expect(next.map(({ closure }) => closure?.kind ?? null)).toEqual([
      null,
      "gone",
      null,
    ])
  })
})

const AT = new Date("2026-11-02T16:41:00Z")
const LATER = new Date("2026-11-02T16:55:00Z")
const idle = { sending: new Set<number>(), diaryIdle: true }
const noSending = { sending: new Set<number>() }

const late = (alertId: number): MyCallback => ({
  ...callback(alertId),
  daysLate: 2,
})

const registered = (
  outcome: RegisteredCall["call"]["outcome"],
  at: Date = AT,
  day: string | null = null
): RegisteredCall => ({
  taskId: 101,
  state: outcome,
  alert: day === null ? null : { id: 9, deadline: AT, day, message: null },
  call: { id: 1, outcome, origin: "alert", at, by: "Anna Bianchi" },
})

const call = (
  requestId: string,
  outcome: MyCall["outcome"],
  at: Date = AT,
  callbackDay: string | null = null
): MyCall => ({
  id: 1,
  requestId,
  taskId: 101,
  name: "Mario",
  surname: "Rossi",
  phoneNumber: "333",
  outcome,
  at,
  origin: "alert",
  callbackDay,
  message: null,
})

const rowOf = (queue: Queue, alertId: number) => {
  const row = queue.find((candidate) => candidate.alertId === alertId)
  if (row === undefined) throw new Error(`no row ${alertId}`)
  return row
}

const uncertain = (alertId = 1, ...requestIds: string[]) =>
  requestIds.reduce<Queue>(
    (queue, requestId) => markUncertain(queue, alertId, requestId),
    load([callback(alertId)])
  )

describe("load", () => {
  it("una coda senza righe è caricata e vuota", () => {
    const queue = load([])

    expect(queue).toEqual([])
    expect(countsOf(queue)).toEqual({
      overdue: { open: 0, loaded: false },
      today: { open: 0, loaded: false },
    })
  })

  it.each([
    [0, "today"],
    [1, "overdue"],
    [5, "overdue"],
  ])("con daysLate %i il gruppo è %s", (daysLate, group) => {
    const [row] = load([{ ...callback(1), daysLate }])

    expect(row).toMatchObject({
      group,
      closure: null,
      respondedTick: 0,
      uncertainRequestIds: [],
    })
  })

  it("il gruppo non cambia con una rilettura", () => {
    const queue = load([callback(1)])

    const next = reconcile(
      queue,
      { rows: [{ ...late(1), triedAt: AT }], readTick: 1 },
      idle
    )

    expect(rowOf(next, 1)).toMatchObject({ group: "today", daysLate: 0 })
  })
})

describe("applyRegistered", () => {
  it("Non risponde lascia la riga aperta con stato e ora della risposta (AC22, A1)", () => {
    const next = applyRegistered(
      load([callback(1)]),
      1,
      registered("non risponde")
    )

    expect(rowOf(next, 1)).toMatchObject({
      state: "non risponde",
      triedAt: AT,
      closure: null,
    })
  })

  it("Non risponde segue lo stato della risposta, non l'esito (A1)", () => {
    const next = applyRegistered(load([callback(1)]), 1, {
      ...registered("non risponde"),
      state: "richiamare",
    })

    expect(rowOf(next, 1).state).toBe("richiamare")
  })

  it("Non risponde non svuota la lista dei requestId", () => {
    const next = applyRegistered(
      uncertain(1, "r1"),
      1,
      registered("non risponde")
    )

    expect(rowOf(next, 1).uncertainRequestIds).toEqual(["r1"])
  })

  it.each([
    ["app.to", null, null],
    ["non interessato", null, null],
    ["richiamare", "2026-11-09", "2026-11-09"],
  ] as const)(
    "%s chiude la riga col proprio esito, il badge lo segue e la lista si svuota (AC23)",
    (outcome, day, callbackDay) => {
      const next = applyRegistered(
        uncertain(1, "r1"),
        1,
        registered(outcome, AT, day)
      )

      expect(rowOf(next, 1)).toMatchObject({
        state: outcome,
        closure: { kind: "registered", outcome, at: AT, callbackDay },
        uncertainRequestIds: [],
      })
    }
  )

  it.each(["gone", "worked"])(
    "un esito proprio che chiude vince su una riga %s",
    (kind) => {
      const open = uncertain(1, "r1")
      const closed =
        kind === "gone"
          ? reconcile(open, { rows: [], readTick: 1 }, idle)
          : applyWorked(open, 1, "Bruno Neri", AT)

      const next = applyRegistered(closed, 1, registered("app.to", LATER))

      expect(rowOf(next, 1).closure).toMatchObject({
        kind: "registered",
        at: LATER,
      })
    }
  )

  it("un Non risponde non tocca una riga chiusa, un'altra riga torna identica", () => {
    const queue = applyRegistered(
      load([callback(1), callback(2)]),
      1,
      registered("app.to")
    )

    expect(applyRegistered(queue, 1, registered("non risponde"))).toBe(queue)
    expect(applyRegistered(queue, 3, registered("app.to"))).toBe(queue)
  })
})

describe("applyWorked", () => {
  it("chiude come `worked` e non svuota la lista (AC27)", () => {
    const next = applyWorked(uncertain(1, "r1"), 1, "Bruno Neri", AT)

    expect(rowOf(next, 1)).toMatchObject({
      closure: { kind: "worked", by: "Bruno Neri", at: AT },
      uncertainRequestIds: ["r1"],
      state: "chiamare",
    })
  })

  it("una riga `registered` resta col proprio esito", () => {
    const queue = applyRegistered(load([callback(1)]), 1, registered("app.to"))

    expect(applyWorked(queue, 1, "Bruno Neri", LATER)).toBe(queue)
  })

  it("con gli stessi dati torna la stessa coda, confrontando le date per valore", () => {
    const queue = applyWorked(load([callback(1)]), 1, "Bruno Neri", AT)

    expect(applyWorked(queue, 1, "Bruno Neri", new Date(AT))).toBe(queue)
  })

  it("la riga gone diventa worked, e nei conteggi scende una volta", () => {
    const queue = load([callback(1), callback(2)])
    const gone = reconcile(queue, { rows: [callback(2)], readTick: 1 }, idle)

    const next = applyWorked(gone, 1, "Bruno Neri", AT)

    expect(rowOf(next, 1).closure?.kind).toBe("worked")
    expect(countsOf(next).today.open).toBe(1)
  })
})

describe("markResponded e markUncertain", () => {
  it("markResponded scrive il tick; con lo stesso tick torna la stessa coda", () => {
    const queue = markResponded(load([callback(1)]), 1, 7)

    expect(rowOf(queue, 1).respondedTick).toBe(7)
    expect(markResponded(queue, 1, 7)).toBe(queue)
  })

  it("markUncertain aggiunge alla lista, senza doppioni", () => {
    const queue = uncertain(1, "r1", "r2")

    expect(rowOf(queue, 1).uncertainRequestIds).toEqual(["r1", "r2"])
    expect(markUncertain(queue, 1, "r1")).toBe(queue)
  })
})

describe("ogni riga conta una volta sola (AC23)", () => {
  const closed = applyRegistered(
    load([callback(1), callback(2), late(3)]),
    1,
    registered("app.to")
  )

  it.each([
    ["la lettura la trova ancora aperta", [callback(1), callback(2), late(3)]],
    ["la lettura non la trova più", [callback(2), late(3)]],
  ])("riga chiusa da applyRegistered: %s", (_, rows) => {
    const next = reconcile(closed, { rows, readTick: 9 }, idle)

    expect(next).toBe(closed)
    expect(countsOf(next)).toEqual({
      overdue: { open: 1, loaded: true },
      today: { open: 1, loaded: true },
    })
  })

  it("una seconda chiusura della stessa riga non scende di nuovo", () => {
    const again = applyRegistered(closed, 1, registered("app.to"))
    const worked = applyWorked(again, 1, "Bruno Neri", AT)

    expect(countsOf(worked).today.open).toBe(1)
  })
})

describe("reconcile: le regole, nell'ordine", () => {
  const read = { rows: [], readTick: 5 }

  it.each([
    ["invio in corso", new Set([1]), 0, [], true],
    ["risposta dopo la lettura", new Set<number>(), 6, [], true],
    ["incerta col diario non idle", new Set<number>(), 0, ["r1"], false],
  ])("%s: la riga non cambia", (_, sending, tick, requestIds, diaryIdle) => {
    const base = requestIds.reduce<Queue>(
      (queue, requestId) => markUncertain(queue, 1, requestId),
      markResponded(load([callback(1)]), 1, tick)
    )

    expect(reconcile(base, read, { sending, diaryIdle })).toBe(base)
  })

  it("una riga senza incerti non aspetta il diario", () => {
    const next = reconcile(load([callback(1)]), read, {
      sending: new Set(),
      diaryIdle: false,
    })

    expect(rowOf(next, 1).closure?.kind).toBe("gone")
  })

  it("il blocco viene prima di ogni aggiornamento, non solo della chiusura", () => {
    const queue = load([callback(1)])
    const changed = { ...callback(1), state: "non risponde" as const }

    const next = reconcile(
      queue,
      { rows: [changed], readTick: 5 },
      { sending: new Set([1]), diaryIdle: true }
    )

    expect(next).toBe(queue)
  })

  it.each(["registered", "worked", "gone"])(
    "una riga chiusa (%s) non cambia, e una rilettura non la riapre",
    (kind) => {
      const queue = load([callback(1)])
      const closed =
        kind === "registered"
          ? applyRegistered(queue, 1, registered("app.to"))
          : kind === "worked"
            ? applyWorked(queue, 1, "Bruno Neri", AT)
            : reconcile(queue, read, idle)

      const next = reconcile(
        closed,
        { rows: [{ ...callback(1), triedAt: LATER }], readTick: 9 },
        idle
      )

      expect(next).toBe(closed)
    }
  )

  it("una riga aperta si aggiorna al suo posto: stato, tentato e messaggio (A2)", () => {
    const next = reconcile(
      load([callback(1), callback(2)]),
      {
        rows: [
          {
            ...callback(2),
            state: "non risponde",
            triedAt: AT,
            message: "nuovo",
          },
          callback(1),
        ],
        readTick: 1,
      },
      idle
    )

    expect(next.map(({ alertId }) => alertId)).toEqual([1, 2])
    expect(rowOf(next, 2)).toMatchObject({
      state: "non risponde",
      triedAt: AT,
      message: "nuovo",
      closure: null,
    })
  })

  it("le righe nuove arrivano solo al prossimo caricamento", () => {
    const queue = load([callback(1)])

    const next = reconcile(
      queue,
      { rows: [callback(1), callback(2)], readTick: 1 },
      idle
    )

    expect(next).toBe(queue)
  })
})

describe("reconcile conserva lunghezza e ordine", () => {
  it.each([
    ["tutte sparite", []],
    ["una sola rimasta", [callback(3)]],
    ["in ordine diverso", [callback(3), late(1), callback(2)]],
    ["con righe nuove", [callback(9), callback(2)]],
  ])("%s", (_, rows) => {
    const queue = load([late(1), callback(2), callback(3)])

    const next = reconcile(queue, { rows, readTick: 1 }, idle)

    expect(next.map(({ alertId }) => alertId)).toEqual([1, 2, 3])
  })
})

describe("respondedTick e readTick (D8)", () => {
  const queue = markResponded(
    applyRegistered(load([callback(1)]), 1, registered("non risponde")),
    1,
    5
  )
  const stale = callback(1)

  it.each([
    [4, "lettura partita prima"],
    [0, "lettura molto più vecchia"],
  ])("con readTick %i (%s) tiene badge e tentato", (readTick) => {
    expect(reconcile(queue, { rows: [stale], readTick }, idle)).toBe(queue)
  })

  it.each([5, 6])("con readTick %i si aggiorna", (readTick) => {
    const fresh = { ...stale, state: "richiamare" as const, triedAt: LATER }

    const next = reconcile(queue, { rows: [fresh], readTick }, idle)

    expect(rowOf(next, 1)).toMatchObject({
      state: "richiamare",
      triedAt: LATER,
    })
  })

  it("una riga uguale resta lo stesso oggetto, confrontando le date con getTime", () => {
    const same = {
      ...stale,
      state: "non risponde" as const,
      triedAt: new Date(AT),
    }

    const next = reconcile(queue, { rows: [same], readTick: 6 }, idle)

    expect(next).toBe(queue)
  })

  it("cambia solo la riga che cambia", () => {
    const rows = load([callback(1), callback(2)])

    const next = reconcile(
      rows,
      { rows: [callback(1), { ...callback(2), message: "x" }], readTick: 1 },
      idle
    )

    expect(next[0]).toBe(rows[0])
    expect(next[1]).not.toBe(rows[1])
  })
})

describe("countsOf (AC12, AC13)", () => {
  const queue = load([late(1), late(2), callback(3), callback(4)])
  const close = (from: Queue, ...alertIds: number[]) =>
    alertIds.reduce(
      (rows, alertId) => applyRegistered(rows, alertId, registered("app.to")),
      from
    )

  it.each([
    ["tutte aperte", [], 2, 2],
    ["una scaduta chiusa", [1], 1, 2],
    ["scaduti tutti chiusi: solo di oggi", [1, 2], 0, 2],
    ["tutte chiuse", [1, 2, 3, 4], 0, 0],
  ])("%s", (_, closed, overdue, today) => {
    expect(countsOf(close(queue, ...closed))).toEqual({
      overdue: { open: overdue, loaded: true },
      today: { open: today, loaded: true },
    })
  })

  it("un gruppo senza righe al caricamento non è caricato", () => {
    expect(countsOf(load([callback(1)])).overdue.loaded).toBe(false)
    expect(countsOf(load([late(1)])).today.loaded).toBe(false)
  })

  it("una riga con Non risponde resta nel conteggio (AC22)", () => {
    const next = applyRegistered(queue, 1, registered("non risponde"))

    expect(countsOf(next).overdue.open).toBe(2)
  })

  it.each([
    ["gone", (from: Queue) => reconcile(from, { rows: [], readTick: 1 }, idle)],
    ["worked", (from: Queue) => applyWorked(from, 1, "Bruno Neri", AT)],
  ])("una riga %s scende dal conteggio e il gruppo resta", (_, closeIt) => {
    expect(countsOf(closeIt(load([callback(1)]))).today).toEqual({
      open: 0,
      loaded: true,
    })
  })
})

describe("settleUncertain (AC23, AC48)", () => {
  it.each([
    ["app.to", null, null],
    ["non interessato", null, null],
    ["richiamare", "2026-11-09", "2026-11-09"],
  ] as const)(
    "%s chiude con esito e ora della chiamata, anche se la riga è ancora in `rows`",
    (outcome, day, callbackDay) => {
      const settled = settleUncertain(
        uncertain(1, "r1"),
        [call("r1", outcome, AT, day)],
        noSending
      )

      const next = reconcile(
        settled,
        { rows: [callback(1)], readTick: 9 },
        idle
      )

      expect(rowOf(next, 1)).toMatchObject({
        state: outcome,
        closure: { kind: "registered", outcome, at: AT, callbackDay },
        uncertainRequestIds: [],
      })
    }
  )

  it("con più chiamate prende la più recente, in qualunque ordine arrivino", () => {
    const next = settleUncertain(
      uncertain(1, "r1", "r2"),
      [call("r1", "app.to", AT), call("r2", "non interessato", LATER)],
      noSending
    )

    expect(rowOf(next, 1).closure).toMatchObject({
      outcome: "non interessato",
      at: LATER,
    })
  })

  it("una Non risponde più recente non cancella l'esito che chiude", () => {
    const next = settleUncertain(
      uncertain(1, "r1", "r2"),
      [call("r2", "non risponde", LATER), call("r1", "app.to", AT)],
      noSending
    )

    expect(rowOf(next, 1).closure).toMatchObject({ outcome: "app.to", at: AT })
  })

  it("una chiamata Non risponde lascia la riga aperta, com'è", () => {
    const queue = uncertain(1, "r1")

    expect(
      settleUncertain(queue, [call("r1", "non risponde")], noSending)
    ).toBe(queue)
  })

  it("una Non risponde scritta non gira in tondo con una lettura vecchia", () => {
    const queue = uncertain(1, "r1")
    const round = (from: Queue) =>
      reconcile(
        settleUncertain(from, [call("r1", "non risponde")], noSending),
        { rows: [callback(1)], readTick: 9 },
        idle
      )

    expect(round(queue)).toBe(queue)
  })

  it("il tentato di una Non risponde scritta arriva dalle righe rilette", () => {
    const next = reconcile(
      settleUncertain(
        uncertain(1, "r1"),
        [call("r1", "non risponde")],
        noSending
      ),
      {
        rows: [{ ...callback(1), state: "non risponde", triedAt: AT }],
        readTick: 9,
      },
      idle
    )

    expect(rowOf(next, 1)).toMatchObject({ triedAt: AT, closure: null })
  })

  it.each([
    ["un requestId che la riga non ha", [call("altro", "app.to")]],
    [
      "una chiamata vecchia senza requestId",
      [{ ...call("r1", "app.to"), requestId: null }],
    ],
    ["nessuna chiamata", []],
  ])("%s non cambia nulla", (_, calls) => {
    const queue = uncertain(1, "r1")

    expect(settleUncertain(queue, calls, noSending)).toBe(queue)
  })

  it("una riga senza pressioni incerte non guarda il diario", () => {
    const queue = load([callback(1)])

    expect(settleUncertain(queue, [call("r1", "app.to")], noSending)).toBe(
      queue
    )
  })

  it("scrittura in ritardo: la prima reconcile lascia aperta la riga, la settleUncertain seguente la chiude", () => {
    const queue = uncertain(1, "r1")
    const first = reconcile(
      settleUncertain(queue, [], noSending),
      { rows: [callback(1)], readTick: 3 },
      idle
    )
    expect(rowOf(first, 1).closure).toBeNull()

    const next = settleUncertain(first, [call("r1", "app.to")], noSending)

    expect(rowOf(next, 1).closure?.kind).toBe("registered")
  })

  it.each([
    [true, "gone"],
    [false, null],
  ])(
    "alert chiuso senza la chiamata in `calls`, diario idle %s: %s",
    (diaryIdle, kind) => {
      const next = reconcile(
        settleUncertain(uncertain(1, "r1"), [], noSending),
        { rows: [], readTick: 3 },
        { sending: new Set(), diaryIdle }
      )

      expect(rowOf(next, 1).closure?.kind ?? null).toBe(kind)
    }
  )

  it("una riga `gone` con la chiamata in un `calls` seguente diventa `registered` e conta una volta", () => {
    const gone = reconcile(
      markUncertain(load([callback(1), callback(2)]), 1, "r1"),
      { rows: [callback(2)], readTick: 3 },
      idle
    )
    expect(countsOf(gone).today.open).toBe(1)

    const next = settleUncertain(gone, [call("r1", "app.to")], noSending)

    expect(rowOf(next, 1).closure?.kind).toBe("registered")
    expect(countsOf(next).today.open).toBe(1)
  })

  it("una riga con invio in corso aspetta; a invio finito si chiude", () => {
    const queue = uncertain(1, "r1")
    const calls = [call("r1", "app.to")]

    expect(settleUncertain(queue, calls, { sending: new Set([1]) })).toBe(queue)
    expect(
      rowOf(settleUncertain(queue, calls, noSending), 1).closure?.kind
    ).toBe("registered")
  })

  it("con due pressioni incerte basta che una sia in `calls`", () => {
    const next = settleUncertain(
      uncertain(1, "r1", "r2"),
      [call("r2", "app.to")],
      noSending
    )

    expect(rowOf(next, 1).closure?.kind).toBe("registered")
  })

  it("una riga `worked` con la chiamata diventa `registered` col proprio esito", () => {
    const worked = applyWorked(uncertain(1, "r1"), 1, "Bruno Neri", LATER)

    const next = settleUncertain(worked, [call("r1", "app.to")], noSending)

    expect(rowOf(next, 1).closure).toEqual({
      kind: "registered",
      outcome: "app.to",
      at: AT,
      callbackDay: null,
    })
  })

  it("una riga già `registered` non cambia", () => {
    const queue = applyRegistered(
      uncertain(1, "r1"),
      1,
      registered("non interessato", LATER)
    )

    expect(settleUncertain(queue, [call("r1", "app.to")], noSending)).toBe(
      queue
    )
  })
})

describe("solo `registered` svuota la lista dei requestId", () => {
  const queue = uncertain(1, "r1")

  it.each([
    ["gone", reconcile(queue, { rows: [], readTick: 1 }, idle), ["r1"]],
    ["worked", applyWorked(queue, 1, "Bruno Neri", AT), ["r1"]],
    [
      "non risponde",
      applyRegistered(queue, 1, registered("non risponde")),
      ["r1"],
    ],
    ["registered", applyRegistered(queue, 1, registered("app.to")), []],
    [
      "registered dal diario",
      settleUncertain(queue, [call("r1", "app.to")], noSending),
      [],
    ],
  ])("%s", (_, next, requestIds) => {
    expect(rowOf(next, 1).uncertainRequestIds).toEqual(requestIds)
  })
})

describe("applicate due volte danno la stessa coda, per riferimento (D8)", () => {
  const base = load([callback(1), callback(2), callback(3)])
  const read = {
    rows: [callback(2), { ...callback(3), triedAt: new Date(AT) }],
    readTick: 4,
  }
  const calls = [call("r1", "app.to")]
  const withUncertain = markUncertain(base, 1, "r1")

  it.each([
    ["reconcile", (queue: Queue) => reconcile(queue, read, idle)],
    [
      "settleUncertain",
      (queue: Queue) => settleUncertain(queue, calls, noSending),
    ],
    [
      "l'effetto di D8",
      (queue: Queue) =>
        reconcile(settleUncertain(queue, calls, noSending), read, idle),
    ],
  ])("%s", (_, apply) => {
    const once = apply(withUncertain)

    expect(once).not.toBe(withUncertain)
    expect(apply(once)).toBe(once)
  })
})

describe("nextFocus (AC23)", () => {
  const closeAll = (queue: Queue, ...alertIds: number[]) =>
    alertIds.reduce(
      (rows, alertId) => applyWorked(rows, alertId, "Bruno Neri", AT),
      queue
    )
  const queue = load([callback(1), callback(2), callback(3), callback(4)])

  it.each([
    ["la prima aperta sotto", [2], 2, 3],
    ["salta le chiuse sotto", [2, 3], 2, 4],
    ["senza aperte sotto, l'ultima aperta sopra", [3, 4], 3, 2],
    ["salta le chiuse sopra", [2, 3, 4], 4, 1],
    ["senza aperte, la riga stessa", [1, 2, 3, 4], 2, 2],
  ])("%s", (_, closed, from, target) => {
    expect(nextFocus(closeAll(queue, ...closed), from)).toBe(target)
  })

  it("una riga sconosciuta resta sé stessa", () => {
    expect(nextFocus(queue, 99)).toBe(99)
  })
})
