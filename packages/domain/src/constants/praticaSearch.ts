import { z } from "zod"

// Valori di `search_by` nella ricerca della pagina Pratiche. Il selettore
// manda solo l'`accessorKey` della colonna "ID Pratica".
export const praticaSearchBy = z.enum(["praticaId"])

export type PraticaSearchBy = z.infer<typeof praticaSearchBy>

export const praticaSearchLabels = {
  praticaId: "ID Pratica",
} satisfies Record<PraticaSearchBy, string>

// `search_by` letto dall'URL. Assente, sconosciuto (link modificato a mano) o
// ripetuto cerca per ID pratica, invece di far fallire la pagina.
export function parsePraticaSearchBy(
  value: string | string[] | null | undefined
): PraticaSearchBy {
  const single = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : undefined
    : value
  return praticaSearchBy.safeParse(single).data ?? "praticaId"
}
