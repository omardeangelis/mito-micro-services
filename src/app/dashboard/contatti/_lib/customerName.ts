import type { ContactRow } from "@/server/services/contact/getContacts"

/** "Cognome Nome", the parts that exist; never empty, it names a link. */
export const customerNameOf = (customer: ContactRow["customer"]): string =>
  [customer.surname, customer.name]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ") || "Cliente senza nome"
