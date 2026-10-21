// Calendario di Europe/Rome per il seed locale. Un "giorno" e' una stringa
// "yyyy-MM-dd". Niente lettura dell'orologio e niente fuso del processo: tutto
// passa da Intl con timeZone "Europe/Rome" o da getter UTC su istanti shiftati.
import type { Day } from "./types"

const ROME = "Europe/Rome"
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

const romeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ROME,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
})

/** Scostamento di Europe/Rome da UTC (ms) all'istante dato. */
export function romeOffsetMs(instantMs: number): number {
  const parts = romeFormat.formatToParts(new Date(instantMs))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  )
  const wholeSecond = instantMs - (((instantMs % 1000) + 1000) % 1000)
  return wall - wholeSecond
}

export type WallClock = {
  year: number
  /** 0-11, come Date */
  month: number
  day: number
  hours: number
  minutes: number
  seconds: number
  ms: number
}

/** Campi del calendario di Roma di un istante. */
export function romeWallClock(instantMs: number): WallClock {
  const w = new Date(instantMs + romeOffsetMs(instantMs))
  return {
    year: w.getUTCFullYear(),
    month: w.getUTCMonth(),
    day: w.getUTCDate(),
    hours: w.getUTCHours(),
    minutes: w.getUTCMinutes(),
    seconds: w.getUTCSeconds(),
    ms: w.getUTCMilliseconds(),
  }
}

/**
 * Istante di un orario di parete di Roma, dato come ms "UTC" dei suoi campi
 * (anche con overflow, come `Date.UTC`). Come un `Date` locale: in un orario
 * inesistente (salto in avanti) vale l'offset di prima del cambio, in un orario
 * doppio (indietro) vince la prima occorrenza.
 */
export function romeWallToInstant(wallAsUtcMs: number): number {
  const before = romeOffsetMs(wallAsUtcMs - MS_PER_DAY)
  const after = romeOffsetMs(wallAsUtcMs + MS_PER_DAY)
  if (before === after) return wallAsUtcMs - before
  const candidates = [before, after]
    .map((offset) => wallAsUtcMs - offset)
    .filter((instant, i) => romeOffsetMs(instant) === [before, after][i])
  if (candidates.length === 0) return wallAsUtcMs - before
  return Math.min(...candidates)
}

function parseDay(day: Day): { y: number; m: number; d: number } {
  const match = DAY_RE.exec(day)
  if (!match) throw new Error(`Giorno non valido "${day}": atteso yyyy-MM-dd`)
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const check = new Date(Date.UTC(y, m - 1, d))
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new Error(`Giorno non valido "${day}": non esiste nel calendario`)
  }
  return { y, m, d }
}

function formatDay(y: number, m: number, d: number): Day {
  const pad = (n: number, len: number) => String(n).padStart(len, "0")
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
}

/** Giorno del calendario di Europe/Rome di un istante. */
export function romeDay(instant: Date): Day {
  const w = romeWallClock(instant.getTime())
  return formatDay(w.year, w.month + 1, w.day)
}

/** Istante delle 00:00 di Europe/Rome del giorno. */
export function romeMidnight(day: Day): Date {
  const { y, m, d } = parseDay(day)
  return new Date(romeWallToInstant(Date.UTC(y, m - 1, d, 0, 0, 0, 0)))
}

/** Istante delle 12:00 di Europe/Rome del giorno. */
export function romeNoon(day: Day): Date {
  const { y, m, d } = parseDay(day)
  return new Date(romeWallToInstant(Date.UTC(y, m - 1, d, 12, 0, 0, 0)))
}

export function addDays(day: Day, n: number): Day {
  const { y, m, d } = parseDay(day)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return formatDay(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

/** Somma mesi come date-fns `addMonths`: se il giorno non esiste, fine mese. */
export function addMonthsDay(day: Day, n: number): Day {
  const { y, m, d } = parseDay(day)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12
  const daysInMonth = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return formatDay(ny, nm + 1, Math.min(d, daysInMonth))
}

/** Sottrae mesi come date-fns `subMonths` (fine mese se il giorno non esiste). */
export function subMonthsDay(day: Day, n: number): Day {
  return addMonthsDay(day, -n)
}

/**
 * Il seed si ferma fra mezzanotte e le 01:00/02:00 di Roma: `alert` calcola il
 * giorno in Europe/Rome, `update` in UTC (backend) o nell'ora locale della
 * macchina (route Next), e li' i due giorni non coincidono.
 */
export function assertSameRomeAndUtcDay(now: Date): void {
  const rome = romeDay(now)
  const utc = now.toISOString().slice(0, 10)
  if (rome !== utc) {
    throw new Error(
      `Il seed si ferma fra la mezzanotte e le 01:00/02:00 a Roma: ora in ` +
        `Europe/Rome e' il ${rome}, in UTC e' ancora il ${utc}. Il cron ` +
        `\`alert\` calcola il giorno in Europe/Rome, mentre \`update\` lo ` +
        `calcola in UTC sul backend e con l'ora locale della macchina sulle ` +
        `route Next: in questa fascia i due giorni non coincidono e gli ` +
        `scenari non sarebbero affidabili. Riprova dopo le 02:00 a Roma.`
    )
  }
}

/** Il manifest vale solo per il giorno in cui e' stato generato il seed. */
export function assertIsToday(day: Day, now: Date): void {
  const today = romeDay(now)
  if (today !== day) {
    throw new Error(
      `Il manifest e' del giorno ${day}, oggi a Roma e' il ${today}: serve un ` +
        `nuovo seed (\`pnpm seed:local\`).`
    )
  }
}
