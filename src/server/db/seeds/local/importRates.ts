// Riproduce `calculateDebitoResiduo` (src/app/api/import/_utils) con l'orologio
// fermo alle 12:00 di Europe/Rome del giorno D e il processo in
// TZ=Europe/Rome, ma sul calendario di Roma e senza leggere l'orologio: stesso
// risultato con qualsiasi fuso del processo. Non chiama l'originale.
import { DAYS_PER_RATE } from "@mito/domain/constants/practice"
import { romeNoon, romeWallClock, romeWallToInstant } from "./day"
import type { Day } from "./types"

const MS_PER_DAY = 1000 * 60 * 60 * 24

export type ImportRates = {
  ratePagate: number
  rateResidue: number
  debitoResiduo: string | null
}

export function importRates(
  liquidazione: Date | null,
  rateTotali: number | null,
  importoRata: number | null,
  day: Day
): ImportRates {
  if (!liquidazione || !rateTotali || !importoRata) {
    return { ratePagate: 0, rateResidue: 0, debitoResiduo: null }
  }
  // `setMonth(getMonth() + 1)` nell'ora locale di Roma: giorno del mese e ora
  // restano, l'eventuale overflow (31 gen -> 3 mar) scivola nel mese dopo
  const w = romeWallClock(liquidazione.getTime())
  const initial = romeWallToInstant(
    Date.UTC(w.year, w.month + 1, w.day, w.hours, w.minutes, w.seconds, w.ms)
  )
  const diffTime = Math.abs(romeNoon(day).getTime() - initial)
  const diffDays = Math.ceil(diffTime / MS_PER_DAY)
  let ratePagate = Math.floor(diffDays / DAYS_PER_RATE)
  let rateResidue = 0
  if (ratePagate > rateTotali) {
    rateResidue = 0
    ratePagate = rateTotali
  } else rateResidue = rateTotali - ratePagate
  return {
    ratePagate,
    rateResidue,
    debitoResiduo: (rateResidue * importoRata).toFixed(2),
  }
}
