// @vitest-environment node
import { describe, expect, it } from "vitest"
import { authConfigFrom } from ".."

const REQUIRED = {
  BETTER_AUTH_URL: "https://staging-crm.dbmito.it",
  BETTER_AUTH_SECRET: "s".repeat(40),
}

describe("authConfigFrom", () => {
  it("accende il login di prova solo con AUTH_TEST_LOGIN esattamente true (OQ6)", () => {
    expect(
      authConfigFrom({ ...REQUIRED, AUTH_TEST_LOGIN: "true" }).testLogin
    ).toBe(true)
    for (const value of [undefined, "", "TRUE", "1", "yes", " true"]) {
      expect(
        authConfigFrom({ ...REQUIRED, AUTH_TEST_LOGIN: value }).testLogin
      ).toBe(false)
    }
  })

  it("legge gli indirizzi ammessi senza spazi né maiuscole", () => {
    expect(
      authConfigFrom({
        ...REQUIRED,
        AUTH_ALLOWED_EMAILS: " Info@Sevedemo.com,,info@spatalo.tech ",
      }).allowedEmails
    ).toEqual(new Set(["info@sevedemo.com", "info@spatalo.tech"]))
  })

  it("offre Azure solo con le sue tre variabili", () => {
    const azure = {
      AZURE_AD_CLIENT_ID: "client-id",
      AZURE_AD_CLIENT_SECRET: "client-secret",
      AZURE_AD_TENANT_ID: "tenant-id",
    }
    expect(authConfigFrom({ ...REQUIRED, ...azure }).azure).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      tenantId: "tenant-id",
    })
    expect(
      authConfigFrom({ ...REQUIRED, ...azure, AZURE_AD_TENANT_ID: undefined })
        .azure
    ).toBeUndefined()
  })

  it("ha il link via email solo con il login di prova: console in development, SendGrid altrove (AC7)", () => {
    const sendgrid = {
      SENDGRID_USERNAME: "apikey",
      SENDGRID_API_KEY: "sendgrid-key",
      SENDGRID_SERVER: "smtp.sendgrid.net",
      SENDGRID_PORT: "587",
    }
    const on = { ...REQUIRED, AUTH_TEST_LOGIN: "true" }

    expect(
      authConfigFrom({ ...on, NODE_ENV: "development" }).sendMagicLink
    ).toBeDefined()
    expect(
      authConfigFrom({ ...on, NODE_ENV: "production", ...sendgrid })
        .sendMagicLink
    ).toBeDefined()
    expect(
      authConfigFrom({ ...on, NODE_ENV: "production" }).sendMagicLink
    ).toBeUndefined()
    expect(
      authConfigFrom({ ...REQUIRED, NODE_ENV: "development", ...sendgrid })
        .sendMagicLink
    ).toBeUndefined()
  })

  it("si ferma con un secret più corto di 32 caratteri", () => {
    expect(() =>
      authConfigFrom({ ...REQUIRED, BETTER_AUTH_SECRET: "[SENSITIVE]" })
    ).toThrow(/32/)
  })

  it("si ferma senza URL o secret", () => {
    expect(() =>
      authConfigFrom({ BETTER_AUTH_URL: REQUIRED.BETTER_AUTH_URL })
    ).toThrow()
    expect(() =>
      authConfigFrom({ BETTER_AUTH_SECRET: REQUIRED.BETTER_AUTH_SECRET })
    ).toThrow()
  })
})
