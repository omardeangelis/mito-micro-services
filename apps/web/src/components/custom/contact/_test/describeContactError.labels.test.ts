import { describe, expect, it } from "vitest"
import { describeContactError } from "../describeContactError"

/** The error as `useMutation` receives it over HTTP. */
const overHttp = (contactError: unknown) => ({
  message: "Non puoi modificare questo contatto",
  data: { contactError },
})

// I messaggi d'errore dicono gli stati con la loro etichetta (AC15)

describe("describeContactError, gli stati", () => {
  it("la transizione rifiutata dice le etichette, non i valori", () => {
    const message = describeContactError(
      overHttp({
        code: "CONTACT_TRANSITION_REJECTED",
        payload: { from: "chiamare", to: "app.to" },
      })
    )

    expect(message).toBe("Non si può passare da Da chiamare a Appuntamento")
  })

  it("il richiamo rifiutato dice l'etichetta dello stato", () => {
    const message = describeContactError(
      overHttp({ code: "CALLBACK_NOT_ALLOWED", payload: { state: "erogata" } })
    )

    expect(message).toBe(
      "Non si può impostare un richiamo con lo stato Pratica caricata"
    )
  })
})
