import { z } from "zod"

// Valori di `search_by` nella ricerca della pagina Clienti, nell'ordine del
// selettore "Cerca per". Il selettore mostra queste voci (non le colonne con
// `enableColumnFilter`): per aggiungere un campo ricercabile si aggiunge qui,
// in `customerSearchLabels` e nella mappa delle colonne del router.
export const customerSearchBy = z.enum([
  "fiscalCode",
  "name",
  "surname",
  "email",
  "phoneNumber",
  "comune",
])

export type CustomerSearchBy = z.infer<typeof customerSearchBy>

export const customerSearchLabels = {
  fiscalCode: "Codice Fiscale",
  name: "Nome",
  surname: "Cognome",
  email: "email",
  phoneNumber: "Telefono",
  comune: "Comune",
} satisfies Record<CustomerSearchBy, string>

const defaultCustomerSearchBy: CustomerSearchBy = "fiscalCode"

// `search_by` letto dall'URL. Assente, sconosciuto (link modificato a mano) o
// ripetuto cerca per codice fiscale, la voce che il selettore mostra in quel
// caso, invece di far fallire la pagina.
export function parseCustomerSearchBy(
  value: string | string[] | null | undefined
): CustomerSearchBy {
  const single = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : undefined
    : value
  return customerSearchBy.safeParse(single).data ?? defaultCustomerSearchBy
}
