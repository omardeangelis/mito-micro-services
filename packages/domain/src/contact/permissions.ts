/** The roles that decide what a person may do on contacts and customers. */
export type Role = "ADMIN" | "OPERATORE"

/** The person acting: their operator id and role. */
export type Actor = { operatorId: number; role: Role }

/** An operator as the contact shows it. */
export type OperatorRef = {
  id: number
  name: string | null
  surname: string | null
}

type CustomerOwner = { operatorId: number | null }

/**
 * Whether the actor may edit a contact:
 * - `editable`: state, priority, callback and closing the alert (D2, AC48,
 *   AC49);
 * - `superseded`: the contact is no longer active, read-only for everyone
 *   (AC27);
 * - `not_owner`: read-only, `assignee` is the contact's operator or null
 *   when the contact has none, shown as "Non assegnato" (A1, AC51).
 */
export type ContactEditability =
  | { kind: "editable" }
  | { kind: "superseded" }
  | { kind: "not_owner"; assignee: string | null }

const isAdmin = (actor: Actor): boolean => actor.role === "ADMIN"

const ownsCustomer = (actor: Actor, customer: CustomerOwner): boolean =>
  customer.operatorId === actor.operatorId

/**
 * Name and surname joined by one space, blank parts skipped. When both are
 * empty, `Operatore <id>`.
 */
export const operatorDisplayName = (operator: OperatorRef): string => {
  const fullName = [operator.name, operator.surname]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ")
  return fullName === "" ? `Operatore ${operator.id}` : fullName
}

/**
 * Decides whether the actor may edit the contact. A superseded contact is
 * checked first, so it stays read-only for admins too (AC27). An admin edits
 * everything (AC48); an operator edits the contact when either the contact
 * or the customer is theirs (D2, A1).
 */
export const contactEditability = (
  actor: Actor,
  contact: {
    isActive: boolean
    taskOperator: OperatorRef | null
    customer: CustomerOwner
  }
): ContactEditability => {
  if (!contact.isActive) return { kind: "superseded" }
  if (isAdmin(actor)) return { kind: "editable" }
  if (contact.taskOperator?.id === actor.operatorId) return { kind: "editable" }
  if (ownsCustomer(actor, contact.customer)) return { kind: "editable" }
  return {
    kind: "not_owner",
    assignee:
      contact.taskOperator === null
        ? null
        : operatorDisplayName(contact.taskOperator),
  }
}

/**
 * Whether the actor may create a contact for the customer: an admin, or the
 * customer's operator (D2, AC66). An admin on a customer with no operator
 * gets true; the server rejects that case on its own.
 */
export const canCreateContact = (
  actor: Actor,
  customer: CustomerOwner
): boolean => isAdmin(actor) || ownsCustomer(actor, customer)

/** Whether the actor may change the operator of a contact: admin only (D2, AC50). */
export const canReassign = (actor: Actor): boolean => isAdmin(actor)

/**
 * Whether the actor may hand the customer over ("Passaggio di consegne"): an
 * admin on every customer, an operator only on their own (D13).
 */
export const canHandover = (actor: Actor, customer: CustomerOwner): boolean =>
  isAdmin(actor) || ownsCustomer(actor, customer)

/**
 * Whether "Assegna a te" is available (P4): only on a customer with no
 * operator whose active contact, if any, has no operator or is the actor's.
 * Taking a customer whose contact is a colleague's would grant edit rights
 * over it (D2); the same holds for admins, who use "Passaggio di consegne".
 */
export const canSelfAssign = (
  actor: Actor,
  customer: CustomerOwner,
  activeContact: { operatorId: number | null } | null
): boolean => {
  if (customer.operatorId !== null) return false
  const contactOperatorId = activeContact?.operatorId ?? null
  return contactOperatorId === null || contactOperatorId === actor.operatorId
}
