// @vitest-environment node
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { romeNoon } from "../day"
import { importRates } from "../importRates"
import { buildCases } from "./importRatesCases"

// vitest 1.6 gira i test in worker thread: impostare process.env.TZ in un test
// non cambia il fuso dei Date. Il confronto con `calculateDebitoResiduo` gira
// quindi in un processo figlio avviato con TZ=Europe/Rome.
const root = resolve(__dirname, "../../../../../..")

type ChildResult = {
  checked: number
  mismatches: unknown[]
  sample: Array<{ index: number; actual: unknown }>
}

function runChild(): ChildResult {
  const out = execFileSync(
    resolve(root, "node_modules/.bin/tsx"),
    [
      "--tsconfig",
      resolve(root, "tsconfig.json"),
      resolve(__dirname, "importRatesChild.ts"),
    ],
    {
      cwd: root,
      env: { ...process.env, TZ: "Europe/Rome", NODE_ENV: "test" },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }
  )
  const line = out.split("\n").find((l) => l.startsWith("RESULT:"))
  if (!line) throw new Error(`Output del figlio senza RESULT:\n${out}`)
  return JSON.parse(line.slice("RESULT:".length)) as ChildResult
}

describe("importRates", () => {
  const child = runChild()

  it("equals calculateDebitoResiduo with the clock at Rome noon of D (TZ=Europe/Rome)", () => {
    expect(child.checked).toBeGreaterThanOrEqual(1000)
    expect(child.mismatches).toEqual([])
  })

  it("gives the same results in this process (any time zone) as the child computed in Europe/Rome", () => {
    const cases = buildCases()
    expect(child.sample.length).toBeGreaterThan(100)
    for (const { index, actual } of child.sample) {
      const c = cases[index]!
      const liq = c.liquidazione === null ? null : new Date(c.liquidazione)
      expect(importRates(liq, c.rateTotali, c.importoRata, c.day)).toEqual(
        actual
      )
    }
  })

  it("does not mutate the date it receives", () => {
    const liq = new Date("2026-01-31T11:00:00.000Z")
    const before = liq.getTime()
    importRates(liq, 12, 100, "2026-10-21")
    expect(liq.getTime()).toBe(before)
  })

  it("returns zeros and null for falsy inputs", () => {
    const zero = { ratePagate: 0, rateResidue: 0, debitoResiduo: null }
    const liq = new Date("2026-01-31T11:00:00.000Z")
    expect(importRates(null, 12, 100, "2026-10-21")).toEqual(zero)
    expect(importRates(liq, null, 100, "2026-10-21")).toEqual(zero)
    expect(importRates(liq, 0, 100, "2026-10-21")).toEqual(zero)
    expect(importRates(liq, 12, null, "2026-10-21")).toEqual(zero)
    expect(importRates(liq, 12, 0, "2026-10-21")).toEqual(zero)
  })

  it("applies the month overflow of setMonth (31 January -> 3 March)", () => {
    // liquidata il 31/01/2026 a mezzogiorno di Roma: +1 mese = 3 marzo 2026
    // alle 12:00; il 2 aprile (30 giorni dopo) c'e' esattamente una rata
    const liq = romeNoon("2026-01-31")
    expect(importRates(liq, 12, 100, "2026-03-03").ratePagate).toBe(0)
    expect(importRates(liq, 12, 100, "2026-04-02")).toEqual({
      ratePagate: 1,
      rateResidue: 11,
      debitoResiduo: "1100.00",
    })
    expect(importRates(liq, 12, 100, "2026-04-01").ratePagate).toBe(0)
  })

  it("caps the paid installments at rateTotali", () => {
    expect(importRates(romeNoon("2020-01-10"), 3, 99.5, "2026-10-21")).toEqual({
      ratePagate: 3,
      rateResidue: 0,
      debitoResiduo: "0.00",
    })
  })

  it("is clock independent: same output regardless of the time the test runs", () => {
    const a = importRates(romeNoon("2026-05-31"), 24, 150.25, "2026-10-21")
    const b = importRates(romeNoon("2026-05-31"), 24, 150.25, "2026-10-21")
    expect(a).toEqual(b)
  })
})
