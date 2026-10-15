import { z } from "zod"

// Valori di `search_by` nella ricerca della pagina Clienti. Il selettore
// manda l'`accessorKey` della colonna (`name`, `phoneNumber`); `nome` e
// `telefono` sono i valori del suo tipo e dei link già in giro, e cercano
// nella stessa colonna.
export const customerSearchBy = z.enum([
  "nome",
  "name",
  "surname",
  "email",
  "telefono",
  "phoneNumber",
  "fiscalCode",
])

export type CustomerSearchBy = z.infer<typeof customerSearchBy>
