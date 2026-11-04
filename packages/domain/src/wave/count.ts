// «Quanti» and the numbers of the transfer (AC13, AC24): digits, with the dot
// of thousands allowed only between groups of three.

export type CountResult =
  { readonly ok: true; readonly value: number } | { readonly ok: false }

const DIGITS = /^\d+$/
const THOUSANDS = /^[1-9]\d{0,2}(\.\d{3})+$/

/** A whole number from 1 to `max`, or an error */
export function parseCount(text: string, max: number): CountResult {
  const t = text.trim()
  if (!DIGITS.test(t) && !THOUSANDS.test(t)) return { ok: false }
  const value = Number(t.replaceAll(".", ""))
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    return { ok: false }
  return { ok: true, value }
}
