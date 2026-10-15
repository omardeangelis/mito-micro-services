import { z } from "zod"

// Valori di `search_by` nella ricerca della pagina Pratiche. Il selettore
// manda solo l'`accessorKey` della colonna "ID Pratica".
export const praticaSearchBy = z.enum(["praticaId"])

export type PraticaSearchBy = z.infer<typeof praticaSearchBy>
