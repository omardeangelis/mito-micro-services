// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  AlertConfirmationRequired,
  AlertNotFound,
  CallbackNotAllowed,
  ContactAlreadyActive,
  ContactForbidden,
  ContactNotFound,
  ContactSuperseded,
  CustomerNotFound,
  CustomerUnassigned,
  DeadlineInPast,
  OperatorNotFound,
  TransitionRejected,
} from "../errors"

// AC10: each error builds from the values the services pass, and keeps them.
// `{ ...error }` is what `contactErrorToTrpc` sends as the payload.

describe("errori dei contatti: costruzione", () => {
  it.each([
    { Class: ContactNotFound, tag: "ContactNotFound" },
    { Class: AlertNotFound, tag: "AlertNotFound" },
    { Class: DeadlineInPast, tag: "DeadlineInPast" },
    { Class: CustomerNotFound, tag: "CustomerNotFound" },
    { Class: CustomerUnassigned, tag: "CustomerUnassigned" },
    { Class: OperatorNotFound, tag: "OperatorNotFound" },
  ])("$tag si costruisce senza campi", ({ Class, tag }) => {
    const error = new Class()
    expect(error).toBeInstanceOf(Class)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe(tag)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({ _tag: tag })
  })

  it("ContactSuperseded porta il contatto attivo, o null", () => {
    const active = new ContactSuperseded({ activeTaskId: 42 })
    expect(active).toBeInstanceOf(ContactSuperseded)
    expect(active).toBeInstanceOf(Error)
    expect(active._tag).toBe("ContactSuperseded")
    expect(active.activeTaskId).toBe(42)
    expect(active.message).toBe("")
    expect({ ...active }).toStrictEqual({
      _tag: "ContactSuperseded",
      activeTaskId: 42,
    })

    const none = new ContactSuperseded({ activeTaskId: null })
    expect(none.activeTaskId).toBeNull()
    expect({ ...none }).toStrictEqual({
      _tag: "ContactSuperseded",
      activeTaskId: null,
    })
  })

  it("ContactForbidden porta l'operatore del contatto, o null", () => {
    const owned = new ContactForbidden({ assignee: "Mario Rossi" })
    expect(owned).toBeInstanceOf(ContactForbidden)
    expect(owned).toBeInstanceOf(Error)
    expect(owned._tag).toBe("ContactForbidden")
    expect(owned.assignee).toBe("Mario Rossi")
    expect(owned.message).toBe("")
    expect({ ...owned }).toStrictEqual({
      _tag: "ContactForbidden",
      assignee: "Mario Rossi",
    })

    const unassigned = new ContactForbidden({ assignee: null })
    expect(unassigned.assignee).toBeNull()
    expect({ ...unassigned }).toStrictEqual({
      _tag: "ContactForbidden",
      assignee: null,
    })
  })

  it("TransitionRejected porta gli stati, con from null", () => {
    const error = new TransitionRejected({ from: "followup", to: "chiamare" })
    expect(error).toBeInstanceOf(TransitionRejected)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("TransitionRejected")
    expect(error.from).toBe("followup")
    expect(error.to).toBe("chiamare")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "TransitionRejected",
      from: "followup",
      to: "chiamare",
    })

    const fromNull = new TransitionRejected({
      from: null,
      to: "non interessato",
    })
    expect(fromNull.from).toBeNull()
    expect(fromNull.to).toBe("non interessato")
  })

  it("AlertConfirmationRequired porta l'alert con la sua Date", () => {
    const deadline = new Date("2026-10-20T08:30:00.000Z")
    const error = new AlertConfirmationRequired({
      alert: { id: 7, deadline, message: "Richiamare dopo le 10" },
    })
    expect(error).toBeInstanceOf(AlertConfirmationRequired)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("AlertConfirmationRequired")
    expect(error.alert).toStrictEqual({
      id: 7,
      deadline,
      message: "Richiamare dopo le 10",
    })
    expect(error.alert.deadline).toBe(deadline)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "AlertConfirmationRequired",
      alert: { id: 7, deadline, message: "Richiamare dopo le 10" },
    })
  })

  it("AlertConfirmationRequired accetta un alert senza messaggio e una Date non valida", () => {
    const invalid = new Date(Number.NaN)
    const error = new AlertConfirmationRequired({
      alert: { id: 8, deadline: invalid, message: null },
    })
    expect(error.alert.id).toBe(8)
    expect(error.alert.deadline).toBe(invalid)
    expect(error.alert.message).toBeNull()
  })

  it("CallbackNotAllowed porta lo stato, o null", () => {
    const error = new CallbackNotAllowed({ state: "chiamare" })
    expect(error).toBeInstanceOf(CallbackNotAllowed)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("CallbackNotAllowed")
    expect(error.state).toBe("chiamare")
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "CallbackNotAllowed",
      state: "chiamare",
    })

    expect(new CallbackNotAllowed({ state: null }).state).toBeNull()
  })

  it("ContactAlreadyActive porta il contatto attivo", () => {
    const error = new ContactAlreadyActive({ activeTaskId: 9 })
    expect(error).toBeInstanceOf(ContactAlreadyActive)
    expect(error).toBeInstanceOf(Error)
    expect(error._tag).toBe("ContactAlreadyActive")
    expect(error.activeTaskId).toBe(9)
    expect(error.message).toBe("")
    expect({ ...error }).toStrictEqual({
      _tag: "ContactAlreadyActive",
      activeTaskId: 9,
    })
  })
})
