import { describe, expect, it } from "vitest"
import {
  AlertConfirmationRequired,
  CallAlreadyWorked,
  CallNotAllowed,
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  CustomerMissing,
  DeadlineInPast,
  MessageTooLong,
  RequestIdConflict,
  Unauthorized,
} from "@mito/contract/errors"
import { describeCallRejection, reloadsRows, workedText } from "../rejection"

describe("describeCallRejection", () => {
  it("un contatto passato a un altro dice di chi è ora, con il link al contatto", () => {
    expect(
      describeCallRejection(new ContactForbidden({ assignee: "Bruno Neri" }), {
        customer: "Anna Bianchi",
        outcome: "app.to",
      })
    ).toEqual({
      kind: "toast",
      title: "Chiamata non registrata",
      description: "Ora è di Bruno Neri: la chiamata non è registrata.",
      link: { label: "Apri il contatto" },
    })
  })

  const context = { customer: "Anna Bianchi", outcome: "app.to" } as const
  const OPEN = { label: "Apri il contatto" }
  const OTHER =
    "La chiamata non si può registrare su questo contatto. Apri il contatto per vedere perché."
  const alert = {
    id: 9,
    // Il 14 a Roma, ancora il 13 in UTC
    deadline: new Date("2026-11-13T23:30:00.000Z"),
    message: null,
  }

  it.each([
    [
      "nessun assegnatario",
      new ContactForbidden({ assignee: null }),
      context,
      "Non è più assegnato a te: la chiamata non è registrata.",
      OPEN,
    ],
    [
      "contatto sostituito",
      new ContactSuperseded({ activeTaskId: 202 }),
      context,
      "Il contatto è stato sostituito da uno più recente.",
      { label: "Apri il contatto attuale", taskId: 202 },
    ],
    [
      "contatto sostituito senza quello attuale",
      new ContactSuperseded({ activeTaskId: null }),
      context,
      "Il contatto è stato sostituito da uno più recente.",
      OPEN,
    ],
    [
      "richiamo da confermare, con il giorno di Roma",
      new AlertConfirmationRequired({ alert }),
      context,
      "Anna Bianchi ha già un richiamo il 14/11. Apri il contatto per registrare la chiamata.",
      OPEN,
    ],
    [
      "esito non ammesso",
      new CallNotAllowed({ state: "caricato" }),
      context,
      "Con lo stato Pratica caricata non si può registrare Appuntamento.",
      OPEN,
    ],
    [
      "esito non ammesso, con l'etichetta dell'esito",
      new CallNotAllowed({ state: "caricato" }),
      { ...context, outcome: "non interessato" as const },
      "Con lo stato Pratica caricata non si può registrare Non interessato.",
      OPEN,
    ],
    [
      "richiamo non ammesso",
      new CallNotAllowed({ state: "caricato" }),
      { ...context, outcome: "richiamare" as const },
      "Con lo stato Pratica caricata non si può impostare un richiamo.",
      OPEN,
    ],
    [
      "stato sconosciuto",
      new CallNotAllowed({ state: null }),
      context,
      OTHER,
      OPEN,
    ],
    [
      "contatto che non esiste più",
      new ContactNotFound(),
      context,
      "Il contatto non esiste più.",
      null,
    ],
    ["messaggio troppo lungo", new MessageTooLong(), context, OTHER, OPEN],
    ["richiesta in conflitto", new RequestIdConflict(), context, OTHER, OPEN],
    [
      "cliente mancante",
      new CustomerMissing({ customerId: "c-1" }),
      context,
      OTHER,
      OPEN,
    ],
    ["richiesta rifiutata (`refused`)", null, context, OTHER, OPEN],
  ])("%s", (_name, error, press, description, link) => {
    const rejection = describeCallRejection(error, press)

    expect(rejection).toEqual({
      kind: "toast",
      title: "Chiamata non registrata",
      description,
      link,
    })
    expect(description).not.toMatch(/app\.to|nessuno|non interessato|caricato/)
    expect(reloadsRows(rejection)).toBe(true)
  })

  it("il giorno già passato è un testo sotto il calendario, senza ricarica", () => {
    const rejection = describeCallRejection(new DeadlineInPast(), context)

    expect(rejection).toEqual({
      kind: "deadlinePast",
      text: "Il richiamo si imposta da domani: scegli un altro giorno",
    })
    expect(reloadsRows(rejection)).toBe(false)
  })

  it("la sessione scaduta è un caso a sé, senza ricarica", () => {
    const rejection = describeCallRejection(new Unauthorized(), context)

    expect(rejection).toEqual({ kind: "session" })
    expect(reloadsRows(rejection)).toBe(false)
  })

  it("già lavorato porta chi e quando, con l'ora di Roma, e ricarica", () => {
    const at = new Date("2026-11-05T16:41:00.000Z")
    const rejection = describeCallRejection(
      new CallAlreadyWorked({ by: "Bruno Neri", at }),
      context
    )

    expect(rejection).toEqual({ kind: "worked", by: "Bruno Neri", at })
    expect(reloadsRows(rejection)).toBe(true)
    expect(workedText({ by: "Bruno Neri", at })).toBe(
      "Già lavorato da Bruno Neri alle 17:41"
    )
  })
})
