// Processo figlio del test di importRates: gira con TZ=Europe/Rome e confronta
// `importRates` con `calculateDebitoResiduo` (l'originale dell'import) con
// l'orologio fermo alle 12:00 di Roma del giorno D.
import { calculateDebitoResiduo } from "@/app/api/import/_utils/index"
import { importRates } from "../importRates"
import { romeNoon } from "../day"
import { buildCases } from "./importRatesCases"

if (new Date("2026-01-15T12:00:00Z").getTimezoneOffset() !== -60) {
  console.error("Il processo figlio non gira con TZ=Europe/Rome")
  process.exit(2)
}

const cases = buildCases()
const mismatches: unknown[] = []
let checked = 0
const sample: unknown[] = []
const SAMPLE_EVERY = 25

const realNow = Date.now
try {
  cases.forEach((c, i) => {
    const liq = c.liquidazione === null ? null : new Date(c.liquidazione)
    Date.now = () => romeNoon(c.day).getTime()
    // una COPIA: l'originale muta la data che riceve
    const expected = calculateDebitoResiduo(
      c.liquidazione === null ? null : new Date(c.liquidazione),
      c.rateTotali,
      c.importoRata
    )
    Date.now = realNow
    const actual = importRates(liq, c.rateTotali, c.importoRata, c.day)
    checked++
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      if (mismatches.length < 20) {
        mismatches.push({
          case: c,
          liquidazioneIso: liq?.toISOString() ?? null,
          expected,
          actual,
        })
      }
    }
    if (i % SAMPLE_EVERY === 0) sample.push({ index: i, actual })
  })
} finally {
  Date.now = realNow
}

console.log("RESULT:" + JSON.stringify({ checked, mismatches, sample }))
