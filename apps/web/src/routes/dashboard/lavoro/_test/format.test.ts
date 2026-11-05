import { describe, expect, it } from "vitest"
import { romeTime } from "@mito/domain/contact/time"
import {
  dayMonth,
  greeting,
  longDay as romeDay,
  thousands,
} from "../_lib/format"

describe("i formati della home (D15)", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [2854, "2.854"],
    [7730, "7.730"],
    [1234567, "1.234.567"],
  ])("%d è «%s»", (value, text) => {
    expect(thousands(value)).toBe(text)
  })

  it.each([
    // Ora solare e ora legale
    ["2026-01-15T07:05:00.000Z", "08:05"],
    ["2026-07-15T07:05:00.000Z", "09:05"],
    ["2026-07-15T22:00:00.000Z", "00:00"],
  ])("%s a Roma sono le %s", (at, time) => {
    expect(romeTime(new Date(at))).toBe(time)
  })

  it("il giorno ha l'iniziale maiuscola ed è quello di Roma", () => {
    expect(romeDay(new Date("2026-10-31T23:30:00.000Z"))).toBe(
      "Domenica 1 novembre"
    )
  })

  it("il giorno del backend è gg/mm", () => {
    expect(dayMonth("2026-11-01")).toBe("01/11")
  })

  it.each([
    [undefined, "Buongiorno"],
    [null, "Buongiorno"],
    ["", "Buongiorno"],
    ["   ", "Buongiorno"],
    ["Ada Neri", "Buongiorno, Ada"],
  ])("il saluto di %s è «%s»", (name, text) => {
    expect(greeting(name)).toBe(text)
  })
})
