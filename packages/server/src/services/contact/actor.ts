import { type Actor, type Role } from "@mito/domain/contact/permissions"

/** The actor of a contact procedure: the signed-in operator and their role. */
export const actorOf = (operator: { id: number; role: Role }): Actor => ({
  operatorId: operator.id,
  role: operator.role,
})
