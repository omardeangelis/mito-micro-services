import { describe, expect, it } from "vitest"
import { teamDay } from "@/test/adminHome"
import {
  answerRateText,
  appointmentRateText,
  callbacksParts,
  callsText,
  percentText,
} from "../today"

describe("percentText (AC6)", () => {
  it.each([
    [0, "0%"],
    [0.5, "50%"],
    [1 / 3, "33,3%"],
    [2 / 3, "66,7%"],
    [1, "100%"],
  ])("%s", (fraction, text) => {
    expect(percentText(fraction)).toBe(text)
  })
})

describe("callsText (AC6, AC34)", () => {
  it.each([
    [{}, "Nessuna chiamata ancora"],
    [{ calls: 10, called: 2 }, "10 · 2 su 23 hanno chiamato"],
    [{ calls: 3, called: 1, members: 15 }, "3 · 1 su 15 ha chiamato"],
    [{ calls: 40, called: 16 }, "40 · 16 su 23 hanno chiamato"],
    [{ calls: 1234, called: 16 }, "1.234 · 16 su 23 hanno chiamato"],
  ])("%j", (overrides, text) => {
    expect(callsText(teamDay(overrides))).toBe(text)
  })
})

describe("answerRateText (AC6, AC34)", () => {
  it.each([
    [{}, "Dopo le prime chiamate"],
    [{ calls: 10, answered: 0 }, "0% · 0 risposte"],
    [{ calls: 3, answered: 1 }, "33,3% · 1 risposta"],
    [{ calls: 4, answered: 2 }, "50% · 2 risposte"],
  ])("%j", (overrides, text) => {
    expect(answerRateText(teamDay(overrides))).toBe(text)
  })
})

describe("appointmentRateText (AC6, AC34)", () => {
  it.each([
    [{}, "Dopo le prime chiamate"],
    [{ calls: 10, answered: 0 }, "Dopo le prime risposte"],
    [{ calls: 10, answered: 4, appointments: 0 }, "0% · 0 appuntamenti"],
    [{ calls: 10, answered: 2, appointments: 1 }, "50% · 1 appuntamento"],
    [{ calls: 10, answered: 3, appointments: 2 }, "66,7% · 2 appuntamenti"],
  ])("%j", (overrides, text) => {
    expect(appointmentRateText(teamDay(overrides))).toBe(text)
  })
})

describe("callbacksParts (AC6, AC34)", () => {
  it.each([
    [0, 0, null, null],
    [3, 0, "3 scaduti", null],
    [1, 0, "1 scaduto", null],
    [0, 2, null, "2 di oggi"],
    [1, 2, "1 scaduto", "2 di oggi"],
    [1200, 1, "1.200 scaduti", "1 di oggi"],
  ])("%s scaduti, %s di oggi", (overdue, today, a, b) => {
    expect(callbacksParts(overdue, today)).toEqual({ overdue: a, today: b })
  })
})
