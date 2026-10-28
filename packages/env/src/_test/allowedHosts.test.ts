// @vitest-environment node
import { describe, expect, it } from "vitest"
import { parseAllowedHosts } from "../allowedHosts"

const HTTPS = "https://staging-crm.dbmito.it"
const HTTP = "http://localhost:3000"

describe("parseAllowedHosts (AC1, AC2 di auth-due-frontend)", () => {
  it("senza elenco, o con uno vuoto o di soli spazi, non c'è elenco", () => {
    for (const value of [undefined, "", "   "]) {
      expect(parseAllowedHosts(value, HTTPS)).toBeUndefined()
    }
  })

  it("legge nomi esatti, con la porta facoltativa, in minuscolo e senza spazi", () => {
    expect(
      parseAllowedHosts(
        " staging-crm.dbmito.it, Mito-Web.vercel.app ,crm.example.it:8443",
        HTTPS
      )
    ).toEqual([
      "staging-crm.dbmito.it",
      "mito-web.vercel.app",
      "crm.example.it:8443",
    ])
    expect(
      parseAllowedHosts("localhost:3000,localhost:5173,127.0.0.1:4000", HTTP)
    ).toEqual(["localhost:3000", "localhost:5173", "127.0.0.1:4000"])
  })

  it.each([
    ["*.vercel.app", "un pattern"],
    ["mito-web-*.vercel.app", "un pattern"],
    ["mito-web?.vercel.app", "un pattern"],
    ["https://mito-web.vercel.app", "uno schema"],
    ["mito-web.vercel.app/app", "un path"],
    ["mito web.vercel.app", "uno spazio"],
    ["mito-web.vercel.app,", "un host vuoto"],
    ["-mito.vercel.app", "un host non valido"],
  ])("si ferma con %s (%s), nominando la variabile", (value) => {
    expect(() => parseAllowedHosts(value, HTTPS)).toThrow(
      /BETTER_AUTH_ALLOWED_HOSTS/
    )
  })

  it("tiene il loopback fuori da un BETTER_AUTH_URL https, e gli altri host fuori da uno http", () => {
    for (const host of ["localhost:5173", "127.0.0.1", "[::1]:3000"]) {
      expect(() =>
        parseAllowedHosts(`staging-crm.dbmito.it,${host}`, HTTPS)
      ).toThrow(/BETTER_AUTH_ALLOWED_HOSTS/)
    }
    expect(() =>
      parseAllowedHosts("localhost:5173,mito-web.vercel.app", HTTP)
    ).toThrow(/BETTER_AUTH_ALLOWED_HOSTS/)
  })

  it("si ferma senza un BETTER_AUTH_URL http o https", () => {
    for (const baseURL of [undefined, "not a url", "ftp://example.it"]) {
      expect(() => parseAllowedHosts("staging-crm.dbmito.it", baseURL)).toThrow(
        /BETTER_AUTH_ALLOWED_HOSTS/
      )
    }
  })
})
