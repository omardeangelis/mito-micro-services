import { describe, expect, it } from "vitest"
import {
  CallAlreadyWorked,
  CallbackChanged,
  CallbackNotAllowed,
  CallNotAllowed,
  MessageTooLong,
  RequestIdConflict,
  TransitionRejected,
} from "@mito/contract/errors"
import { describeApiError } from "@/api/errors"

// The texts of a rejected call use the labels of AC1, never database values
// (AC15)

describe("describeApiError, chiamate e richiami", () => {
  it("CallAlreadyWorked dice chi e a che ora, a Roma", () => {
    expect(
      describeApiError(
        new CallAlreadyWorked({
          by: "Grace Hopper",
          at: new Date("2026-10-15T07:05:00Z"),
        })
      )
    ).toBe("Già lavorato da Grace Hopper alle 09:05")
  })

  it("CallNotAllowed nomina lo stato con la sua etichetta", () => {
    const message = describeApiError(new CallNotAllowed({ state: "caricato" }))
    expect(message).toContain("Pratica caricata")
    expect(message).not.toContain("caricato ")
  })

  it("TransitionRejected e CallbackNotAllowed usano le etichette, non i valori", () => {
    expect(
      describeApiError(new TransitionRejected({ from: null, to: "app.to" }))
    ).toBe("Non si può passare da Da chiamare a Appuntamento")
    expect(describeApiError(new CallbackNotAllowed({ state: "app.to" }))).toBe(
      "Non si può impostare un richiamo con lo stato Appuntamento"
    )
  })

  it("MessageTooLong, CallbackChanged e RequestIdConflict hanno un testo", () => {
    expect(describeApiError(new MessageTooLong())).toBe(
      "Il messaggio supera i 500 caratteri"
    )
    expect(describeApiError(new CallbackChanged())).toBe(
      "Il richiamo è cambiato nel frattempo: controlla il contatto"
    )
    expect(describeApiError(new RequestIdConflict())).toBe(
      "La registrazione non è andata a buon fine: premi di nuovo l'esito"
    )
  })
})
