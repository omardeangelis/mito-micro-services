// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { clientBundleLeaks } from "@/test/clientBundle"

describe("clientBundleLeaks", () => {
  const fixtures = "src/_test/clientBundle"
  let leaks: string[][]
  beforeAll(async () => {
    leaks = await clientBundleLeaks(fixtures)
  })
  const leaksFrom = (file: string) =>
    leaks.filter(([entry]) => entry === `${fixtures}/${file}`)

  it("segnala un file use client che importa un valore da @mito/server", () => {
    expect(leaksFrom("DirectValue.ts")).toEqual([
      [
        `${fixtures}/DirectValue.ts`,
        "packages/server/src/services/contact/getContacts.ts",
      ],
    ])
  })

  it("riconosce la direttiva anche dopo un commento", () => {
    expect(leaksFrom("AfterComment.ts")).toEqual([
      [
        `${fixtures}/AfterComment.ts`,
        "packages/server/src/services/contact/getContacts.ts",
      ],
    ])
  })

  it("segue il grafo: segnala il valore importato da un modulo che il file importa", () => {
    expect(leaksFrom("Transitive.ts")).toEqual([
      [
        `${fixtures}/Transitive.ts`,
        `${fixtures}/lib/contacts.ts`,
        "packages/server/src/services/contact/getContacts.ts",
      ],
    ])
  })

  it("non segnala i moduli senza use client, come i server component", () => {
    expect(leaksFrom("lib/contacts.ts")).toEqual([])
  })

  it("lascia passare gli import di soli tipi", () => {
    expect(leaksFrom("TypeOnly.ts")).toEqual([])
  })

  it("si ferma alle server action: nel bundle Next ne mette solo un riferimento", () => {
    expect(leaksFrom("WithAction.ts")).toEqual([])
  })
})

// packages/server doesn't import server-only, since apps/api runs it outside
// Next.js: next build no longer stops a client module that imports a value
// from it, and its queries and secrets would reach the browser
describe("il bundle del browser", () => {
  it("non contiene moduli di packages/server", async () => {
    expect(await clientBundleLeaks("src")).toEqual([])
  })
})
