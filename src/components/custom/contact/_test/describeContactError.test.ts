import { describe, expect, it } from "vitest"
import { describeContactError } from "../describeContactError"

/** The error as `useMutation` receives it over HTTP. */
const overHttp = (contactError: unknown) => ({
  message: "Non puoi modificare questo contatto",
  data: { contactError },
})

describe("describeContactError", () => {
  it("names who the contact belongs to when the server refuses for permissions", () => {
    expect(
      describeContactError(
        overHttp({
          code: "CONTACT_FORBIDDEN",
          payload: { assignee: "Mario Rossi" },
        })
      )
    ).toBe("Non puoi modificare questo contatto: è assegnato a Mario Rossi")
  })
})

describe("describeContactError, one message per code", () => {
  const cases: [string, unknown, string][] = [
    [
      "CONTACT_FORBIDDEN without an operator",
      { code: "CONTACT_FORBIDDEN", payload: { assignee: null } },
      "Non puoi modificare questo contatto: non è assegnato",
    ],
    [
      "CONTACT_SUPERSEDED",
      { code: "CONTACT_SUPERSEDED", payload: { activeTaskId: 7 } },
      "Questo contatto è stato sostituito da uno più recente",
    ],
    [
      "CONTACT_SUPERSEDED without an active contact",
      { code: "CONTACT_SUPERSEDED", payload: { activeTaskId: null } },
      "Questo contatto è stato sostituito da uno più recente",
    ],
    [
      "CUSTOMER_UNASSIGNED",
      { code: "CUSTOMER_UNASSIGNED", payload: {} },
      "Cliente non assegnato",
    ],
    [
      "CONTACT_ALREADY_ACTIVE",
      { code: "CONTACT_ALREADY_ACTIVE", payload: { activeTaskId: 3 } },
      "Questo cliente ha già un contatto attivo",
    ],
    [
      "CONTACT_TRANSITION_REJECTED",
      {
        code: "CONTACT_TRANSITION_REJECTED",
        payload: { from: "chiamare", to: "followup" },
      },
      "Non si può passare da chiamare a followup",
    ],
    [
      "CONTACT_TRANSITION_REJECTED without a starting state",
      {
        code: "CONTACT_TRANSITION_REJECTED",
        payload: { from: null, to: "followup" },
      },
      "Non si può passare da nessuno a followup",
    ],
    [
      "CALLBACK_NOT_ALLOWED",
      { code: "CALLBACK_NOT_ALLOWED", payload: { state: "followup" } },
      "Non si può impostare un richiamo con lo stato followup",
    ],
    [
      "DEADLINE_IN_PAST",
      { code: "DEADLINE_IN_PAST", payload: {} },
      "Il richiamo si imposta da domani",
    ],
    [
      "CUSTOMER_ASSIGNMENT_FORBIDDEN",
      { code: "CUSTOMER_ASSIGNMENT_FORBIDDEN", payload: {} },
      "Non puoi cambiare l'operatore di questo cliente",
    ],
    [
      "HANDOVER_SAME_OPERATOR",
      { code: "HANDOVER_SAME_OPERATOR", payload: {} },
      "Il cliente è già assegnato a questo operatore",
    ],
    [
      "OPERATOR_NOT_FOUND",
      { code: "OPERATOR_NOT_FOUND", payload: {} },
      "Operatore non valido",
    ],
    [
      "OPERATOR_DISABLED",
      { code: "OPERATOR_DISABLED", payload: {} },
      "Utente disattivato",
    ],
    [
      "OPERATOR_IS_ADMIN",
      { code: "OPERATOR_IS_ADMIN", payload: {} },
      "Declassa l'admin a operatore prima di disattivarlo",
    ],
    [
      "CANNOT_DEACTIVATE_SELF",
      { code: "CANNOT_DEACTIVATE_SELF", payload: {} },
      "Non puoi disattivare te stesso",
    ],
    [
      "LAST_ADMIN",
      { code: "LAST_ADMIN", payload: {} },
      "Deve restare almeno un admin",
    ],
    [
      "CONTACT_NOT_FOUND",
      { code: "CONTACT_NOT_FOUND", payload: {} },
      "Contatto non trovato",
    ],
    [
      "ALERT_NOT_FOUND",
      { code: "ALERT_NOT_FOUND", payload: {} },
      "Alert non trovato",
    ],
    [
      "CUSTOMER_NOT_FOUND",
      { code: "CUSTOMER_NOT_FOUND", payload: {} },
      "Cliente non trovato",
    ],
    [
      "ALERT_CONFIRMATION_REQUIRED",
      {
        code: "ALERT_CONFIRMATION_REQUIRED",
        payload: {
          alert: { id: 1, deadline: new Date("2026-10-20"), message: null },
        },
      },
      "Il contatto ha un richiamo aperto da confermare",
    ],
  ]

  it.each(cases)("%s", (_, contactError, message) => {
    expect(describeContactError(overHttp(contactError))).toBe(message)
  })
})

describe("describeContactError, other shapes", () => {
  it("reads the in-process shape, a TRPCClientError whose cause is the TRPCError", () => {
    const trpcError = Object.assign(new Error("Contatto superato"), {
      cause: {
        __contactError: true,
        code: "CONTACT_SUPERSEDED",
        payload: { activeTaskId: 7 },
      },
    })
    const error = Object.assign(new Error("wrapped"), { cause: trpcError })
    expect(describeContactError(error)).toBe(
      "Questo contatto è stato sostituito da uno più recente"
    )
  })

  it("reads the TRPCError itself, with the marked cause directly on it", () => {
    const error = Object.assign(new Error("Contatto non trovato"), {
      cause: {
        __contactError: true,
        code: "CONTACT_NOT_FOUND",
        payload: {},
      },
    })
    expect(describeContactError(error)).toBe("Contatto non trovato")
  })

  it("asks to retry when the server sent no contact error", () => {
    expect(describeContactError(overHttp(null))).toBe(
      "Modifica non salvata, riprova"
    )
  })

  it("asks to retry on a code it does not know", () => {
    expect(
      describeContactError(overHttp({ code: "SOMETHING_NEW", payload: {} }))
    ).toBe("Modifica non salvata, riprova")
  })

  it("asks to retry on a network error", () => {
    expect(describeContactError(new Error("fetch failed"))).toBe(
      "Modifica non salvata, riprova"
    )
  })

  it("asks to retry when there is no error object at all", () => {
    expect(describeContactError(undefined)).toBe(
      "Modifica non salvata, riprova"
    )
  })
})
