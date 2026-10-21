// Combinazioni deterministiche condivise dal test e dal processo figlio
import { addDays, romeMidnight, romeWallToInstant } from "../day"

export type Case = {
  liquidazione: number | null
  rateTotali: number | null
  importoRata: number | null
  day: string
}

export const DAYS = [
  "2026-10-21", // giorno ordinario
  "2026-05-31",
  "2028-05-31",
  "2027-03-01",
  "2026-03-29", // cambio all'ora legale
  "2026-10-25", // cambio all'ora solare
  "2026-12-15", // D - 3 mesi cade in estate
]

// Generatore pseudo-casuale deterministico (mulberry32)
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RATE_TOTALI = [0, 1, 2, 6, 12, 24, 36, 48, 60, 84, 120]
const IMPORTO_RATA = [0, 1, 49.9, 100, 123.45, 250.5, 999.99, 0.1, 33.333]

const ymd = (day: string) =>
  day.split("-").map(Number) as [number, number, number]

/** Istante di un orario di parete di Roma (anche in un salto dell'ora legale). */
function wall(day: string, hours: number, minutes: number): number {
  const [y, m, d] = ymd(day)
  return romeWallToInstant(Date.UTC(y, m - 1, d, hours, minutes))
}

export function buildCases(): Case[] {
  const rand = rng(20261021)
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!
  const cases: Case[] = []
  const push = (liquidazione: number | null, day: string) =>
    cases.push({
      liquidazione,
      rateTotali: pick(RATE_TOTALI),
      importoRata: pick(IMPORTO_RATA),
      day,
    })

  for (const day of DAYS) {
    // i due anni prima di D, un giorno su tre: mezzogiorno di Roma (come il
    // seed) e un altro orario qualsiasi
    for (let back = 1; back <= 760; back += 3) {
      const liqDay = addDays(day, -back)
      push(wall(liqDay, 12, 0), day)
      push(wall(liqDay, Math.floor(rand() * 24), Math.floor(rand() * 60)), day)
    }
    // liquidazione nello stesso giorno di D, e dopo D
    push(wall(day, 12, 0), day)
    push(wall(addDays(day, 40), 12, 0), day)
    // casi nulli o a zero
    push(null, day)
    cases.push({
      liquidazione: wall(addDays(day, -400), 12, 0),
      rateTotali: null,
      importoRata: 100,
      day,
    })
    cases.push({
      liquidazione: wall(addDays(day, -400), 12, 0),
      rateTotali: 12,
      importoRata: null,
      day,
    })
  }

  // il mese dopo la liquidazione cade nel salto dell'ora legale o nel doppio
  // orario: orari 01:30, 02:30, 03:30 nei giorni vicini ai due cambi
  const windows: Array<[string, number]> = [
    ["2024-02-20", 14],
    ["2025-02-20", 14],
    ["2026-02-20", 14],
    ["2027-02-20", 14],
    ["2028-02-20", 14],
    ["2024-09-20", 14],
    ["2025-09-20", 14],
    ["2026-09-20", 14],
    ["2027-09-20", 14],
    ["2028-09-20", 14],
    ["2025-01-25", 8],
    ["2026-01-25", 8],
    ["2028-01-25", 8],
  ]
  for (const [start, len] of windows) {
    for (let i = 0; i < len; i++) {
      const liqDay = addDays(start, i)
      for (const [h, mi] of [
        [0, 30],
        [1, 30],
        [2, 30],
        [3, 30],
      ] as const) {
        for (const day of DAYS) push(wall(liqDay, h, mi), day)
      }
    }
  }
  // fine mese (29, 30, 31) di ogni mese di due anni, a mezzogiorno e alle 02:30
  for (let month = 0; month < 36; month++) {
    const first = `${2024 + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}-01`
    for (const dom of [29, 30, 31]) {
      const [y, m] = ymd(first)
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      if (dom > last) continue
      const liqDay = addDays(first, dom - 1)
      for (const day of DAYS) {
        push(wall(liqDay, 12, 0), day)
        push(wall(liqDay, 2, 30), day)
        push(romeMidnight(liqDay).getTime(), day)
      }
    }
  }
  return cases
}
