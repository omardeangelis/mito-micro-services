import { type ContactRow } from "@mito/server/services/contact/getContacts"

/** A row of the table: a contact, and whether it hangs under another. */
export type ContactEntry = { contact: ContactRow; nested: boolean }

const newestFirst = (a: ContactRow, b: ContactRow) =>
  b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id

/**
 * The rows of the table, in order: each active contact followed by the
 * previous ones of its customer (`nested`, which by being under it are known
 * to be concluded). `contacts` keeps the order the server gave. The previous
 * contacts come from `previous`, or from `contacts` itself when the list is
 * one customer's alone; one with no active contact of its customer to hang
 * from stays a row of its own.
 */
export const groupContacts = (
  contacts: readonly ContactRow[],
  previous: readonly ContactRow[]
): ContactEntry[] => {
  const activeCustomers = new Set(
    contacts.filter((c) => c.isActive).map((c) => c.customer.id)
  )
  const children = new Map<string, ContactRow[]>()
  const seen = new Set<number>()

  for (const contact of [...contacts, ...previous]) {
    if (contact.isActive || !activeCustomers.has(contact.customer.id)) continue
    if (seen.has(contact.id)) continue
    seen.add(contact.id)
    children.set(contact.customer.id, [
      ...(children.get(contact.customer.id) ?? []),
      contact,
    ])
  }

  return contacts
    .filter((contact) => !seen.has(contact.id))
    .flatMap((contact) => {
      const own = children.get(contact.customer.id)
      // Once: the first active contact of the customer takes them
      children.delete(contact.customer.id)

      return [
        { contact, nested: false },
        ...(contact.isActive && own !== undefined
          ? own.sort(newestFirst).map((child) => ({
              contact: child,
              nested: true,
            }))
          : []),
      ]
    })
}
