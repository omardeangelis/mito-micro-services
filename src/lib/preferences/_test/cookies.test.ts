import { beforeEach, describe, expect, it } from "vitest"
import {
  clearPreferenceCookies,
  parsePreferenceCookies,
  readBrowserPreferences,
  writePreferenceCookie,
} from "../cookies"

const clearCookies = () => {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0]
    if (name) document.cookie = `${name}=; path=/; max-age=0`
  }
}

beforeEach(clearCookies)

describe("i cookie delle preferenze (AC31)", () => {
  it("ogni chiave fa il giro: scritta, riletta uguale", () => {
    writePreferenceCookie("dashboardCollapsed", true)
    writePreferenceCookie("customerTableVisibleColumns", ["Sede", "à b%"])
    writePreferenceCookie("practicesTableVisibleColumns", [])
    writePreferenceCookie("contactTableVisibleColumns", ["CF"])

    expect(readBrowserPreferences()).toEqual({
      dashboardCollapsed: true,
      customerTableVisibleColumns: ["Sede", "à b%"],
      practicesTableVisibleColumns: [],
      contactTableVisibleColumns: ["CF"],
    })
  })

  it("usa un cookie per chiave, con i nomi stabiliti", () => {
    writePreferenceCookie("dashboardCollapsed", false)
    writePreferenceCookie("customerTableVisibleColumns", ["a"])
    writePreferenceCookie("practicesTableVisibleColumns", ["b"])
    writePreferenceCookie("contactTableVisibleColumns", ["c"])

    const names = document.cookie
      .split("; ")
      .map((entry) => entry.split("=")[0])
    expect(names.sort()).toEqual([
      "mito-pref-cot",
      "mito-pref-ct",
      "mito-pref-ds",
      "mito-pref-pt",
    ])
  })

  it("un cookie assente lascia fuori la chiave", () => {
    writePreferenceCookie("contactTableVisibleColumns", ["CF"])

    expect(readBrowserPreferences()).toEqual({
      contactTableVisibleColumns: ["CF"],
    })
  })

  it.each([
    ["JSON rotto", "mito-pref-ct", "%7Bnon-json"],
    ["codifica rotta", "mito-pref-ct", "%E0%A4%A"],
    [
      "tipo sbagliato per una lista",
      "mito-pref-pt",
      encodeURIComponent("true"),
    ],
    [
      "lista con un non-testo",
      "mito-pref-cot",
      encodeURIComponent(JSON.stringify(["a", 1])),
    ],
    ["lista al posto del booleano", "mito-pref-ds", encodeURIComponent("[]")],
    ["testo al posto del booleano", "mito-pref-ds", encodeURIComponent('"si"')],
  ])("%s: il cookie vale come assente, senza tirare", (_, name, value) => {
    document.cookie = `${name}=${value}; path=/`

    expect(() => readBrowserPreferences()).not.toThrow()
    expect(readBrowserPreferences()).toEqual({})
  })

  it("un cookie illeggibile non toglie quelli buoni", () => {
    document.cookie = "mito-pref-ct=%7Bnon-json; path=/"
    writePreferenceCookie("dashboardCollapsed", true)

    expect(readBrowserPreferences()).toEqual({ dashboardCollapsed: true })
  })

  it("il parser legge da qualunque fonte, e tollera i valori strani", () => {
    const raw = new Map([
      ["mito-pref-ct", encodeURIComponent(JSON.stringify(["x"]))],
      ["mito-pref-pt", "%E0%A4%A"],
    ])

    expect(parsePreferenceCookies((name) => raw.get(name))).toEqual({
      customerTableVisibleColumns: ["x"],
    })
  })

  it("clearPreferenceCookies toglie tutti e quattro", () => {
    writePreferenceCookie("dashboardCollapsed", true)
    writePreferenceCookie("customerTableVisibleColumns", ["a"])
    writePreferenceCookie("practicesTableVisibleColumns", ["b"])
    writePreferenceCookie("contactTableVisibleColumns", ["c"])

    clearPreferenceCookies()

    expect(document.cookie).toBe("")
    expect(readBrowserPreferences()).toEqual({})
  })
})
