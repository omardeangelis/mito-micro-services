import { type Role } from "@mito/contract/schemas"

/** The role as the pages say it */
export const roleLabel = (role: Role) =>
  role === "ADMIN" ? "Admin" : "Operatore"

/** A member's name, without the parts it has none of */
export const memberName = (member: {
  name: string | null
  surname: string | null
}) => [member.name, member.surname].filter(Boolean).join(" ") || "Senza nome"
